import { describe, it, expect, vi } from "vitest";

// Helper to create a mock env object
function createMockEnv(entries: Record<string, string>) {
  return {
    ...Object.fromEntries(
      Object.entries(entries).map(([k, v]) => [k, v])
    ),
    NODE_ENV: entries.NODE_ENV ?? "development",
  };
}

describe("env schema", () => {
  const originalEnv = import.meta.env;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const baseValidEnv = {
    VITE_SUPABASE_URL: "https://example.supabase.co",
    VITE_STELLAR_RPC_URL: "https://soroban-testnet.stellar.org",
    VITE_API_BASE_URL: "https://api.example.com",
    VITE_APP_URL: "https://example.com",
  };

  describe("production builds", () => {
    it("accepts https URLs for all required fields", async () => {
      vi.doMock("virtual:env", () => ({
        __esModule: true,
        default: {
          ...baseValidEnv,
          NODE_ENV: "production",
        },
      }));

      const { env } = await import("./env");
      expect(env.VITE_SUPABASE_URL).toBe(baseValidEnv.VITE_SUPABASE_URL);
      expect(env.VITE_STELLAR_RPC_URL).toBe(
        baseValidEnv.VITE_STELLAR_RPC_URL
      );
      expect(env.VITE_API_BASE_URL).toBe(baseValidEnv.VITE_API_BASE_URL);
      expect(env.VITE_APP_URL).toBe(baseValidEnv.VITE_APP_URL);
    });

    it("rejects http URLs in production", async () => {
      vi.doMock("virtual:env", () => ({
        __esModule: true,
        default: {
          VITE_SUPABASE_URL: "http://example.supabase.co",
          VITE_STELLAR_RPC_URL: "http://soroban-testnet.stellar.org",
          VITE_API_BASE_URL: "http://api.example.com",
          VITE_APP_URL: "http://example.com",
          NODE_ENV: "production",
        },
      }));

      await expect(import("./env")).rejects.toThrow(
        "must use https in production environments"
      );
    });

    it("rejects http:// for VITE_SUPABASE_URL in production", async () => {
      vi.doMock("virtual:env", () => ({
        __esModule: true,
        default: {
          ...baseValidEnv,
          VITE_SUPABASE_URL: "http://example.supabase.co",
          NODE_ENV: "production",
        },
      }));

      await expect(import("./env")).rejects.toThrow(
        "VITE_SUPABASE_URL must use https in production environments"
      );
    });

    it("rejects http:// for VITE_STELLAR_RPC_URL in production", async () => {
      vi.doMock("virtual:env", () => ({
        __esModule: true,
        default: {
          ...baseValidEnv,
          VITE_STELLAR_RPC_URL: "http://soroban-testnet.stellar.org",
          NODE_ENV: "production",
        },
      }));

      await expect(import("./env")).rejects.toThrow(
        "VITE_STELLAR_RPC_URL must use https in production environments"
      );
    });

    it("rejects http:// for VITE_API_BASE_URL in production", async () => {
      vi.doMock("virtual:env", () => ({
        __esModule: true,
        default: {
          ...baseValidEnv,
          VITE_API_BASE_URL: "http://api.example.com",
          NODE_ENV: "production",
        },
      }));

      await expect(import("./env")).rejects.toThrow(
        "VITE_API_BASE_URL must use https in production environments"
      );
    });

    it("rejects http:// for VITE_APP_URL in production", async () => {
      vi.doMock("virtual:env", () => ({
        __esModule: true,
        default: {
          ...baseValidEnv,
          VITE_APP_URL: "http://example.com",
          NODE_ENV: "production",
        },
      }));

      await expect(import("./env")).rejects.toThrow(
        "VITE_APP_URL must use https in production environments"
      );
    });
  });

  describe("development builds", () => {
    it("accepts http://localhost URLs in development", async () => {
      vi.doMock("virtual:env", () => ({
        __esModule: true,
        default: {
          VITE_SUPABASE_URL: "http://localhost:54321",
          VITE_STELLAR_RPC_URL: "http://localhost:8000",
          VITE_API_BASE_URL: "http://localhost:3000",
          VITE_APP_URL: "http://localhost:5173",
          NODE_ENV: "development",
        },
      }));

      const { env } = await import("./env");
      expect(env.VITE_SUPABASE_URL).toBe("http://localhost:54321");
      expect(env.VITE_STELLAR_RPC_URL).toBe("http://localhost:8000");
      expect(env.VITE_API_BASE_URL).toBe("http://localhost:3000");
      expect(env.VITE_APP_URL).toBe("http://localhost:5173");
    });

    it("still accepts https URLs in development", async () => {
      vi.doMock("virtual:env", () => ({
        __esModule: true,
        default: {
          ...baseValidEnv,
          NODE_ENV: "development",
        },
      }));

      const { env } = await import("./env");
      expect(env.VITE_SUPABASE_URL).toBe(baseValidEnv.VITE_SUPABASE_URL);
      expect(env.VITE_STELLAR_RPC_URL).toBe(
        baseValidEnv.VITE_STELLAR_RPC_URL
      );
      expect(env.VITE_API_BASE_URL).toBe(baseValidEnv.VITE_API_BASE_URL);
      expect(env.VITE_APP_URL).toBe(baseValidEnv.VITE_APP_URL);
    });

    it("rejects invalid URLs in development", async () => {
      vi.doMock("virtual:env", () => ({
        __esModule: true,
        default: {
          VITE_SUPABASE_URL: "not-a-url",
          VITE_STELLAR_RPC_URL: "http://localhost:8000",
          VITE_API_BASE_URL: "http://localhost:3000",
          VITE_APP_URL: "http://localhost:5173",
          NODE_ENV: "development",
        },
      }));

      await expect(import("./env")).rejects.toThrow(
        "VITE_SUPABASE_URL must be a valid URL"
      );
    });
  });
});
