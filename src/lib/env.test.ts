import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

/** Builds a minimal valid environment, of the shape a real .env would produce. */
function validEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    VITE_APP_URL: 'http://localhost:5173',
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'test-publishable-key',
    VITE_STELLAR_NETWORK: 'testnet',
    VITE_STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
    VITE_FACTORY_CONTRACT_ID: '',
    VITE_USDC_CONTRACT_ID: '',
    VITE_EXPLORER_BASE_URL: 'https://stellar.expert/explorer/testnet',
    ...overrides,
  };
}

function encodeSegment(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fakeJwt(payload: Record<string, unknown>): string {
  return `${encodeSegment({ alg: 'HS256', typ: 'JWT' })}.${encodeSegment(payload)}.signature`;
}

describe('parseEnv', () => {
  it('accepts a valid environment', () => {
    const env = parseEnv(validEnv());
    expect(env.VITE_STELLAR_NETWORK).toBe('testnet');
    expect(env.VITE_APP_URL).toBe('http://localhost:5173');
  });

  it('accepts well-formed Stellar contract addresses', () => {
    const contractId = `C${'A'.repeat(55)}`;
    const env = parseEnv(
      validEnv({ VITE_FACTORY_CONTRACT_ID: contractId, VITE_USDC_CONTRACT_ID: contractId }),
    );
    expect(env.VITE_FACTORY_CONTRACT_ID).toBe(contractId);
  });

  it('rejects a malformed contract address', () => {
    expect(() => parseEnv(validEnv({ VITE_FACTORY_CONTRACT_ID: 'not-a-contract' }))).toThrow(
      /Invalid frontend environment configuration/,
    );
  });

  it('rejects a missing required value', () => {
    const env = validEnv();
    delete env['VITE_SUPABASE_URL'];
    expect(() => parseEnv(env)).toThrow(/Invalid frontend environment configuration/);
  });

  it('rejects an unknown network', () => {
    expect(() => parseEnv(validEnv({ VITE_STELLAR_NETWORK: 'futurenet' }))).toThrow(
      /Invalid frontend environment configuration/,
    );
  });

  it('refuses a service-role key exposed to the browser', () => {
    expect(() =>
      parseEnv(validEnv({ VITE_SUPABASE_SERVICE_ROLE_KEY: 'not-a-real-credential' })),
    ).toThrow(/must never be exposed to the browser/);
  });

  it('refuses an anon variable that actually holds a service_role token', () => {
    const serviceRoleToken = fakeJwt({ role: 'service_role', iss: 'supabase' });
    expect(() => parseEnv(validEnv({ VITE_SUPABASE_ANON_KEY: serviceRoleToken }))).toThrow(
      /service_role token/,
    );
  });

  it('accepts an anon token with the anon role', () => {
    const anonToken = fakeJwt({ role: 'anon', iss: 'supabase' });
    expect(() => parseEnv(validEnv({ VITE_SUPABASE_ANON_KEY: anonToken }))).not.toThrow();
  });

  it('does not leak configuration values in error messages', () => {
    const env = validEnv({ VITE_SUPABASE_ANON_KEY: 'super-secret-value', VITE_APP_URL: 'nope' });
    try {
      parseEnv(env);
      expect.unreachable('expected parseEnv to throw');
    } catch (error) {
      expect(String(error)).not.toContain('super-secret-value');
    }
  });

  describe('production https enforcement', () => {
    it('rejects http URLs for critical variables in production', () => {
      const cases: [string, Record<string, unknown>][] = [
        ['VITE_APP_URL', { VITE_APP_URL: 'http://app.susu.money' }],
        ['VITE_SUPABASE_URL', { VITE_SUPABASE_URL: 'http://example.supabase.co' }],
        ['VITE_STELLAR_RPC_URL', { VITE_STELLAR_RPC_URL: 'http://soroban-mainnet.stellar.org' }],
        ['VITE_API_BASE_URL', { VITE_API_BASE_URL: 'http://api.susu.money/v1' }],
      ];

      for (const [key, override] of cases) {
        expect(
          () => parseEnv(validEnv(override), { isProd: true }),
          `expected ${key} with http:// to be rejected in production`,
        ).toThrow(new RegExp(`${key} must use https in production`));
      }
    });

    it('allows http://localhost and 127.0.0.1 in production and local development', () => {
      const localEnv = validEnv({
        VITE_APP_URL: 'http://localhost:5173',
        VITE_STELLAR_RPC_URL: 'http://127.0.0.1:8000/soroban/rpc',
        VITE_API_BASE_URL: 'http://localhost:3000/api/v1',
      });

      expect(() => parseEnv(localEnv, { isProd: true })).not.toThrow();
      expect(() => parseEnv(localEnv, { isProd: false })).not.toThrow();
    });

    it('accepts valid https URLs in production', () => {
      const prodEnv = validEnv({
        VITE_APP_URL: 'https://app.susu.money',
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_STELLAR_RPC_URL: 'https://soroban-mainnet.stellar.org',
        VITE_API_BASE_URL: 'https://api.susu.money/v1',
      });

      expect(() => parseEnv(prodEnv, { isProd: true })).not.toThrow();
    });
  });
});
