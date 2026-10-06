import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors';

const ENV = {
  VITE_APP_URL: 'http://localhost:5173',
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'test-key',
  VITE_STELLAR_NETWORK: 'testnet',
  VITE_STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
  VITE_FACTORY_CONTRACT_ID: '',
  VITE_USDC_CONTRACT_ID: '',
  VITE_EXPLORER_BASE_URL: 'https://stellar.expert/explorer/testnet',
  VITE_API_BASE_URL: 'https://api.example.test/api/v1',
};

vi.mock('../env', () => ({ getEnv: () => ENV }));

const { requestWalletNonce, verifyWalletLink } = await import('./wallet');

const ADDRESS = `G${'B'.repeat(55)}`;
const NONCE_RESPONSE = {
  nonce: 'random-nonce-123',
  message: 'Sign this to link wallet',
  expiresAt: '2026-01-01T00:15:00.000Z',
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function ok(data: unknown): Response {
  return new Response(JSON.stringify({ data }), { status: 200 });
}

describe('requestWalletNonce', () => {
  it('requests and returns nonce data', async () => {
    fetchMock.mockResolvedValue(ok(NONCE_RESPONSE));

    const result = await requestWalletNonce(ADDRESS, 'a-token');
    expect(result.nonce).toBe('random-nonce-123');
    expect(result.message).toBe('Sign this to link wallet');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ address: ADDRESS });
  });

  it('fails validation when nonce response is malformed', async () => {
    fetchMock.mockResolvedValue(ok({ nonce: 123 })); // missing message and expiresAt

    await expect(requestWalletNonce(ADDRESS, 'a-token')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('verifyWalletLink', () => {
  it('posts signature and returns linked wallet', async () => {
    fetchMock.mockResolvedValue(ok({ walletAddress: ADDRESS }));

    const result = await verifyWalletLink(
      { address: ADDRESS, nonce: 'random-nonce-123', signature: 'sig123' },
      'a-token',
    );
    expect(result.walletAddress).toBe(ADDRESS);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
  });

  it('fails validation when response is missing walletAddress', async () => {
    fetchMock.mockResolvedValue(ok({ wrong: true }));

    await expect(
      verifyWalletLink(
        { address: ADDRESS, nonce: 'random-nonce-123', signature: 'sig123' },
        'a-token',
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
