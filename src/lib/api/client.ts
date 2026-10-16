/**
 * The HTTP client for `susu-api`.
 *
 * This is the only module in the app that talks to the backend, and it is
 * deliberately thin: build a URL, attach a token, parse a JSON body, and turn a
 * non-2xx response into an `ApiError`. Every decision about what a response
 * *means* belongs in the module that called it — invite codes mean nothing to a
 * generic transport.
 *
 * TOKENS ARE PASSED IN
 * The client never reads the session itself. A caller that needs authentication
 * supplies the token, which keeps this module free of Supabase and lets the tests
 * exercise every branch without a browser session or a network.
 *
 * DEADLINES AND RETRIES
 * A deadline bounds both fetching headers and reading the body. Timing out only
 * cancels the browser's interest: the server may still have acted. A timeout is
 * reported distinctly, never as a definite failure to perform the operation.
 * This layer does not retry. Callers own retry policy; writes may be unsafe to
 * repeat when their outcome is unknown.
 */
import { z } from 'zod';
import { getEnv } from '../env';
import { ApiError } from './errors';

/** Default deadline for headers and body together. */
export const DEFAULT_API_TIMEOUT_MS = 30_000;

/** The JSON envelope every successful response uses. */
type SuccessBody<T> = { data: T };

/** The envelope every failed response uses. */
type FailureBody = { error?: unknown };

/**
 * The envelope a paginated list uses: the page's rows, plus where they sit.
 *
 * Distinct from `SuccessBody` because a caller paging a list needs the second
 * half. Unwrapping `data` alone would hand back a page with no way to know
 * whether asking for the next one is worth doing.
 */
type PageBody<T> = {
  data: readonly T[];
  page: { limit?: unknown; offset?: unknown; hasMore?: unknown };
};

/**
 * One page of a paginated list.
 *
 * `hasMore` is the API's answer, not a guess from the row count: a page whose
 * length equals the limit is ambiguous — it is the last page exactly as often as
 * it is not — and guessing would either hide rows or offer a next page that is
 * empty.
 */
export type ApiPage<T> = {
  readonly items: readonly T[];
  readonly hasMore: boolean;
  readonly limit: number;
  readonly offset: number;
};

export type RequestOptions<T = unknown> = {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Serialised as JSON. Omitted entirely when absent. */
  readonly body?: unknown;
  /** A Supabase access token, when the endpoint requires one. */
  readonly token?: string | undefined;
  /** Aborts the request. A cancelled request never resolves. */
  readonly signal?: AbortSignal | undefined;
  /** Positive deadline in milliseconds, defaulting to 30 seconds. */
  readonly timeoutMs?: number;
  /** Optional Zod schema to runtime-validate response payload. */
  readonly schema?: z.ZodType<T> | undefined;
};

function url(path: string): string {
  const base = getEnv().VITE_API_BASE_URL;
  if (base === undefined) {
    // Named explicitly rather than letting `undefined/groups` become a relative
    // request that the dev server answers with the SPA's index.html — which
    // `readJson` would then report as "an unexpected body", hiding the cause.
    throw new ApiError(0, undefined, 'VITE_API_BASE_URL is not configured.');
  }
  // Both halves are normalised, so a base URL with a trailing slash and a path
  // without a leading one do not produce a double slash. Some proxies treat `//`
  // as a protocol-relative reference, which is a real misconfiguration rather
  // than a cosmetic problem.
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * Reads a response body as JSON, or `undefined` if it is not JSON.
 *
 * A 502 from a proxy is HTML, and `response.json()` on it throws a `SyntaxError`
 * that says nothing about the actual problem. Returning `undefined` lets the
 * caller report the status, which is the informative part.
 */
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function codeOf(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const code = (body as FailureBody).error;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Performs a request and returns the parsed body, or throws `ApiError`.
 *
 * The single place the network is touched. `apiRequest` and `apiRequestPage`
 * differ only in which half of the body they read, so keeping the fetch here
 * means a change to timeouts, headers or error handling cannot apply to one and
 * be forgotten in the other.
 */
async function send(
  path: string,
  options: RequestOptions,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token !== undefined) headers['authorization'] = `Bearer ${options.token}`;

  const timeoutMs = options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new RangeError('timeoutMs must be positive and no greater than 2147483647.');
  }
  const requestUrl = url(path);
  const requestBody = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (options.signal?.aborted) throw options.signal.reason;

  const controller = new AbortController();
  let rejectAbort!: (reason: unknown) => void;
  const interrupted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const abort = (reason: unknown): void => {
    if (controller.signal.aborted) return;
    controller.abort(reason);
    rejectAbort(reason);
  };
  const onCallerAbort = (): void => abort(options.signal?.reason);
  options.signal?.addEventListener('abort', onCallerAbort, { once: true });
  const timer = setTimeout(
    () =>
      abort(
        new ApiError(
          0,
          'timeout',
          'The request timed out. The server may still have acted; check its outcome before retrying.',
        ),
      ),
    timeoutMs,
  );

  const request = async (): Promise<{ status: number; body: unknown }> => {
    const response = await fetch(requestUrl, {
      method: options.method ?? 'GET',
      headers,
      ...(requestBody === undefined ? {} : { body: requestBody }),
      signal: controller.signal,
    });
    controller.signal.throwIfAborted();
    const body = await readJson(response);
    if (!response.ok) {
      throw new ApiError(
        response.status,
        codeOf(body),
        `Request failed with status ${response.status}`,
      );
    }
    return { status: response.status, body };
  };

  try {
    return await Promise.race([request(), interrupted]);
  } catch (error) {
    // Preserve caller cancellation (including custom reasons), while a deadline
    // is a distinct retryable transport error. No automatic retry occurs here.
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error instanceof ApiError || (error instanceof DOMException && error.name === 'AbortError'))
      throw error;
    throw new ApiError(0, undefined, 'The request could not reach the server.');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onCallerAbort);
  }
}

function hasData(body: unknown): body is SuccessBody<unknown> {
  return typeof body === 'object' && body !== null && 'data' in body;
}

/**
 * Reads a paginated body, or `undefined` if it is not one.
 *
 * Every field is checked rather than trusted. A `page` that is present but shaped
 * differently — a renamed field, a stringified number — would otherwise become
 * `undefined` in an `ApiPage`, and a caller comparing `hasMore` to `true` would
 * quietly treat the end of the list as reached.
 */
function pageOf(body: unknown): ApiPage<unknown> | undefined {
  if (!hasData(body)) return undefined;

  const { data, page } = body as PageBody<unknown>;
  if (!Array.isArray(data)) return undefined;
  if (typeof page !== 'object' || page === null) return undefined;

  const { limit, offset, hasMore } = page;
  if (typeof limit !== 'number' || typeof offset !== 'number') return undefined;
  if (typeof hasMore !== 'boolean') return undefined;

  return { items: data, hasMore, limit, offset };
}

/**
 * Performs a request and returns the unwrapped `data`.
 *
 * Throws `ApiError` for anything other than a 2xx with a JSON body. A 204 has no
 * body by definition, so it resolves with `undefined` rather than failing to
 * parse.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions<T> = {},
  schema?: z.ZodType<T>,
): Promise<T> {
  const { status, body } = await send(path, options);

  if (status === 204) return undefined as T;

  if (!hasData(body)) {
    // A 2xx that is not the documented envelope means this client and the server
    // disagree about the contract, which is worth failing on rather than
    // returning `undefined` as though the call had succeeded.
    throw new ApiError(status, undefined, 'The server returned an unexpected body.');
  }

  const effectiveSchema = schema ?? options.schema;
  if (effectiveSchema) {
    const result = effectiveSchema.safeParse(body.data);
    if (!result.success) {
      throw new ApiError(
        status,
        undefined,
        `The server returned an unexpected response shape: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
      );
    }
    return result.data;
  }

  return body.data as T;
}

/**
 * Performs a request and returns one page of a list, `data` and `page` together.
 *
 * Separate from `apiRequest` rather than a flag on it, because the two return
 * different things and a caller should have to say which it expects.
 */
export async function apiRequestPage<T>(
  path: string,
  options: RequestOptions<T> = {},
  itemSchema?: z.ZodType<T>,
): Promise<ApiPage<T>> {
  const { status, body } = await send(path, options);

  const page = pageOf(body);
  if (page === undefined) {
    throw new ApiError(status, undefined, 'The server returned an unexpected page.');
  }

  const effectiveSchema = itemSchema ?? options.schema;
  if (effectiveSchema) {
    const validatedItems: T[] = [];
    for (let i = 0; i < page.items.length; i++) {
      const result = effectiveSchema.safeParse(page.items[i]);
      if (!result.success) {
        throw new ApiError(
          status,
          undefined,
          `The server returned an unexpected item shape at index ${i}: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`,
        );
      }
      validatedItems.push(result.data);
    }
    return { ...page, items: validatedItems };
  }

  return page as ApiPage<T>;
}

/**
 * Reads a paginated body *and* the rest of it.
 *
 * `GET /notifications` answers with a page and an unread count in the same body,
 * and the count is not derivable from the rows: a filtered page does not say how
 * many unread rows lie outside it. `apiRequestPage` deliberately returns only the
 * page — every other list has nothing else to say — so this is the variant for an
 * endpoint that does.
 *
 * `pageOf` still validates the page, so a caller cannot be handed an `unreadCount`
 * from a response whose rows were shaped differently than expected.
 */
export async function apiRequestPageBody<T>(
  path: string,
  options: RequestOptions<T> = {},
  itemSchema?: z.ZodType<T>,
): Promise<{ page: ApiPage<T>; body: Record<string, unknown> }> {
  const { status, body } = await send(path, options);

  const page = pageOf(body);
  if (page === undefined) {
    throw new ApiError(status, undefined, 'The server returned an unexpected page.');
  }

  const effectiveSchema = itemSchema ?? options.schema;
  let items = page.items as T[];
  if (effectiveSchema) {
    const validatedItems: T[] = [];
    for (let i = 0; i < page.items.length; i++) {
      const result = effectiveSchema.safeParse(page.items[i]);
      if (!result.success) {
        throw new ApiError(
          status,
          undefined,
          `The server returned an unexpected item shape at index ${i}: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`,
        );
      }
      validatedItems.push(result.data);
    }
    items = validatedItems;
  }

  return { page: { ...page, items }, body: body as Record<string, unknown> };
}
