import { http } from "./http";
import type { HttpError } from "./types";

export class SusuApi {
  /**
   * NOTE: This intentionally has no timeout.
   * A browser "cancel" is not a server cancel, so any response
   * that arrives later will still be processed by React Query.
   * If you need a hard deadline you can supply your own AbortSignal.
   */
  timeoutMs = 30_000;

  get<T>(path: string, init?: RequestInit): Promise<T> {
    return http<T>(path, { method: "GET", ...init, signal: this.#signal(init) });
  }

  post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return http<T>(path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers as Record<string, string> || {}) },
      body: body ? JSON.stringify(body) : undefined,
      ...init,
      signal: this.#signal(init),
    });
  }

  put<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return http<T>(path, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers as Record<string, string> || {}) },
      body: body ? JSON.stringify(body) : undefined,
      ...init,
      signal: this.#signal(init),
    });
  }

  patch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return http<T>(path, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers as Record<string, string> || {}) },
      body: body ? JSON.stringify(body) : undefined,
      ...init,
      signal: this.#signal(init),
    });
  }

  delete<T>(path: string, init?: RequestInit): Promise<T> {
    return http<T>(path, { method: "DELETE", ...init, signal: this.#signal(init) });
  }

  #signal(init?: RequestInit): AbortSignal | undefined {
    if (init?.signal) return init.signal;
    return AbortSignal.timeout(this.timeoutMs);
  }
}

export const api = new SusuApi();
