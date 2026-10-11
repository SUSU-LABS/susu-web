import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, DEFAULT_API_TIMEOUT_MS } from './client';
import { apiErrorMessage, isRetryableApiError } from './errors';

vi.mock('../env', () => ({ getEnv: () => ({ VITE_API_BASE_URL: 'https://api.example.test' }) }));
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('request deadlines', () => {
  it.each([undefined, 125])(
    'bounds a fetch that never settles with timeoutMs=%s',
    async (timeoutMs) => {
      const pending = apiRequest('me', timeoutMs === undefined ? {} : { timeoutMs });
      const result = pending.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(timeoutMs ?? DEFAULT_API_TIMEOUT_MS);
      const error = await result;
      expect(error).toMatchObject({ name: 'ApiError', status: 0, code: 'timeout' });
      expect(isRetryableApiError(error)).toBe(true);
      expect(apiErrorMessage(error)).toContain('server may still have acted');
      expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(true);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('also bounds a stalled response body', async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            stream = controller;
          },
        }),
      ),
    );
    const result = apiRequest('me', { timeoutMs: 100 }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toMatchObject({ code: 'timeout' });
    stream.close();
  });

  it('preserves caller cancellation and removes its listener', async () => {
    const caller = new AbortController();
    const remove = vi.spyOn(caller.signal, 'removeEventListener');
    const result = apiRequest('me', { signal: caller.signal }).catch((error: unknown) => error);
    const reason = new DOMException('left page', 'AbortError');
    caller.abort(reason);
    expect(await result).toBe(reason);
    expect(isRetryableApiError(await result)).toBe(false);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not fetch when the caller already cancelled', async () => {
    const caller = new AbortController();
    const reason = new Error('caller cancelled');
    caller.abort(reason);
    await expect(apiRequest('me', { signal: caller.signal })).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up after success without aborting the caller', async () => {
    const caller = new AbortController();
    const remove = vi.spyOn(caller.signal, 'removeEventListener');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: 'ok' })));
    await expect(apiRequest('me', { signal: caller.signal })).resolves.toBe('ok');
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(caller.signal.aborted).toBe(false);
  });

  it.each([0, -1, NaN, Infinity, 2_147_483_648])(
    'rejects an invalid timeout: %s',
    async (timeoutMs) => {
      await expect(apiRequest('me', { timeoutMs })).rejects.toBeInstanceOf(RangeError);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
