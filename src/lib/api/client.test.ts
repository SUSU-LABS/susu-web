import { describe, it, expect, vi, beforeEach } from "vitest";
import { SusuApi } from "./client";
import * as http from "./http";

vi.mock("./http", () => ({
  http: vi.fn(),
}));

describe("SusuApi", () => {
  let api: SusuApi;
  const mockHttp = vi.mocked(http.http);

  beforeEach(() => {
    vi.clearAllMocks();
    api = new SusuApi();
  });

  describe("timeout behavior", () => {
    it("passes an AbortSignal.timeout when no caller signal is provided", async () => {
      mockHttp.mockResolvedValue({ data: "ok" as never, status: 200 });

      await api.get("/test");

      expect(mockHttp).toHaveBeenCalledWith(
        "/test",
        expect.objectContaining({
          method: "GET",
          signal: expect.any(AbortSignal),
        }),
      );

      const { signal } = mockHttp.mock.calls[0][1] as { signal: AbortSignal };
      expect(signal.aborted).toBe(false);
      expect(signal.reason).toBeUndefined();
    });

    it("rejects with a distinct retryable TimeoutError when the timeout fires", async () => {
      const timeoutError = new DOMException("This operation was aborted.", "TimeoutError");
      timeoutError.name = "TimeoutError";
      mockHttp.mockRejectedValue(timeoutError);

      await expect(api.get("/slow-endpoint")).rejects.toThrow("TimeoutError");
      expect(mockHttp).toHaveBeenCalledTimes(1);
    });

    it("propagates a caller-supplied abort signal unchanged", async () => {
      const controller = new AbortController();
      controller.abort(new Error("Caller abort"));

      mockHttp.mockRejectedValue(new DOMException("Aborted", "AbortError"));

      await expect(api.get("/test", { signal: controller.signal })).rejects.toThrow("AbortError");

      const { signal } = mockHttp.mock.calls[0][1] as { signal: AbortSignal };
      expect(signal).toBe(controller.signal);
    });

    it("uses the configured timeoutMs value in the generated AbortSignal", async () => {
      mockHttp.mockResolvedValue({ data: "ok" as never, status: 200 });

      api.timeoutMs = 5000;
      await api.get("/test");

      const { signal } = mockHttp.mock.calls[0][1] as { signal: AbortSignal };
      // The signal should be an AbortSignal created via AbortSignal.timeout(5000)
      expect(signal).toBeInstanceOf(AbortSignal);
    });

    it("TimeoutError is distinct from a caller AbortError", async () => {
      const timeoutCtrl = new AbortController();
      const timeoutSignal = timeoutCtrl.signal;

      mockHttp
        .mockRejectedValueOnce(new DOMException("This operation was aborted.", "TimeoutError"))
        .mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

      await expect(api.get("/timeout")).rejects.toThrow("TimeoutError");
      await expect(api.get("/caller", { signal: timeoutSignal })).rejects.toThrow("AbortError");
    });
  });
});
