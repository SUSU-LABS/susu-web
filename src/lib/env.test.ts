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
});

describe('parseEnv https enforcement in production', () => {
  const protectedUrls = [
    'VITE_APP_URL',
    'VITE_SUPABASE_URL',
    'VITE_STELLAR_RPC_URL',
    'VITE_API_BASE_URL',
  ] as const;

  it('rejects an http:// value for each protected URL in production', () => {
    for (const key of protectedUrls) {
      expect(() => parseEnv(validEnv({ [key]: 'http://example.com' }), { prod: true })).toThrow(
        /must use https:\/\/ in production builds/,
      );
    }
  });

  it('accepts https:// values for each protected URL in production', () => {
    const env = validEnv({
      VITE_APP_URL: 'https://app.example.com',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
      VITE_API_BASE_URL: 'https://api.example.com',
    });
    expect(() => parseEnv(env, { prod: true })).not.toThrow();
  });

  it('still allows http://localhost in development', () => {
    const env = validEnv({ VITE_APP_URL: 'http://localhost:5173' });
    expect(() => parseEnv(env, { prod: false })).not.toThrow();
  });

  it('rejects http://localhost in production', () => {
    const env = validEnv({ VITE_APP_URL: 'http://localhost:5173' });
    expect(() => parseEnv(env, { prod: true })).toThrow(
      /VITE_APP_URL: must use https:\/\/ in production builds/,
    );
  });

  it('defaults to development mode under the test runner', () => {
    // import.meta.env.PROD is false under vitest, so the default call shape
    // used by the tests above must not enforce https.
    expect(() => parseEnv(validEnv())).not.toThrow();
  });

  it('keeps the malformed-URL error for a non-url value even in production', () => {
    expect(() => parseEnv(validEnv({ VITE_APP_URL: 'not-a-url' }), { prod: true })).toThrow(
      /Invalid frontend environment configuration/,
    );
  });
});
