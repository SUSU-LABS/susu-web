import { describe, expect, it } from 'vitest';
import { buildCsp, dedupe, originOf } from './csp.mjs';

const FULL_ENV = {
  supabaseUrl: 'https://abcxyz.supabase.co',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  apiBaseUrl: 'https://susu-api.onrender.com/api/v1',
};

describe('originOf', () => {
  it('reduces a URL to its origin', () => {
    expect(originOf('https://abcxyz.supabase.co/rest/v1/')).toBe('https://abcxyz.supabase.co');
  });

  it('keeps the scheme for non-https origins', () => {
    expect(originOf('http://localhost:8000')).toBe('http://localhost:8000');
  });

  it('returns undefined for missing or invalid values instead of throwing', () => {
    expect(originOf(undefined)).toBeUndefined();
    expect(originOf('')).toBeUndefined();
    expect(originOf('   ')).toBeUndefined();
    expect(originOf('not a url')).toBeUndefined();
  });

  it('rejects opaque origins rather than interpolating the word "null"', () => {
    expect(originOf('data:text/plain,hello')).toBeUndefined();
    expect(originOf('custom-scheme:something')).toBeUndefined();
    const policy = buildCsp({ supabaseUrl: 'data:text/plain,hello' });
    expect(policy).not.toContain('null');
  });
});

describe('dedupe', () => {
  it('preserves first-seen order', () => {
    expect(dedupe(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
  });
});

describe('buildCsp', () => {
  it('emits the full policy for a complete env', () => {
    expect(buildCsp(FULL_ENV)).toBe(
      "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' https://abcxyz.supabase.co; " +
        "connect-src 'self' https://abcxyz.supabase.co https://soroban-testnet.stellar.org https://susu-api.onrender.com; " +
        "font-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'",
    );
  });

  it('omits the API origin when the API is not configured', () => {
    const policy = buildCsp({ supabaseUrl: FULL_ENV.supabaseUrl, rpcUrl: FULL_ENV.rpcUrl });
    expect(policy).not.toContain('onrender.com');
    expect(policy).toContain(
      "connect-src 'self' https://abcxyz.supabase.co https://soroban-testnet.stellar.org",
    );
  });

  it('deduplicates origins shared between values', () => {
    const policy = buildCsp({
      supabaseUrl: 'https://abcxyz.supabase.co',
      rpcUrl: 'https://abcxyz.supabase.co/rpc',
      apiBaseUrl: 'https://abcxyz.supabase.co/api/v1',
    });
    const connect = policy.split('; ').find((d) => d.startsWith('connect-src'));
    expect(connect).toBe("connect-src 'self' https://abcxyz.supabase.co");
  });

  it('skips invalid values rather than interpolating them', () => {
    const policy = buildCsp({ supabaseUrl: 'not a url', rpcUrl: '', apiBaseUrl: undefined });
    expect(policy).toContain("connect-src 'self'");
    expect(policy).not.toContain('not a url');
  });

  it('still emits the static directives with an empty env', () => {
    const policy = buildCsp({});
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("object-src 'none'");
  });

  it('never allows script from anywhere but self', () => {
    const policy = buildCsp(FULL_ENV);
    const script = policy.split('; ').find((d) => d.startsWith('script-src'));
    expect(script).toBe("script-src 'self'");
  });

  it('contains no double quotes, so it is safe inside a content attribute', () => {
    expect(buildCsp(FULL_ENV)).not.toContain('"');
  });
});
