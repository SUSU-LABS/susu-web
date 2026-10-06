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

const { getMe, updateMe, deleteAccount, listMyActivity } = await import('./me');

const USER_ID = 'user-uuid-1234';
const ACCOUNT = {
  userId: USER_ID,
  displayName: 'Alice',
  avatarPath: 'avatars/alice.png',
  walletAddress: `G${'B'.repeat(55)}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
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

function okPage(data: unknown, page: unknown): Response {
  return new Response(JSON.stringify({ data, page }), { status: 200 });
}

describe('getMe', () => {
  it('returns valid account data', async () => {
    fetchMock.mockResolvedValue(ok(ACCOUNT));

    const result = await getMe('a-token');
    expect(result.userId).toBe(USER_ID);
    expect(result.displayName).toBe('Alice');
    expect(result.walletAddress).toBe(`G${'B'.repeat(55)}`);
  });

  it('fails validation when response is missing required fields', async () => {
    fetchMock.mockResolvedValue(ok({ displayName: 'Alice' }));

    await expect(getMe('a-token')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('updateMe', () => {
  it('sends changes and returns updated account', async () => {
    fetchMock.mockResolvedValue(ok({ ...ACCOUNT, displayName: 'Bob' }));

    const result = await updateMe({ displayName: 'Bob' }, 'a-token');
    expect(result.displayName).toBe('Bob');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ displayName: 'Bob' });
  });

  it('fails validation when update returns unexpected shape', async () => {
    fetchMock.mockResolvedValue(ok({ wrongField: 'val' }));

    await expect(updateMe({ displayName: 'Bob' }, 'a-token')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('deleteAccount', () => {
  it('sends DELETE and returns void on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deleteAccount('a-token')).resolves.toBeUndefined();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('DELETE');
  });
});

describe('listMyActivity', () => {
  const ACTIVITY_RECORD = {
    eventIdentity: 'hash:0',
    name: 'contribution',
    ledger: 4651300,
    txIndex: 0,
    eventIndex: 0,
    txHash: 'a'.repeat(64),
    payload: {},
    contractId: `C${'A'.repeat(55)}`,
  };

  it('reads paginated activity with contractId', async () => {
    fetchMock.mockResolvedValue(
      okPage([ACTIVITY_RECORD], { limit: 10, offset: 0, hasMore: false }),
    );

    const page = await listMyActivity({ limit: 10, offset: 0 }, 'a-token');
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.contractId).toBe(`C${'A'.repeat(55)}`);
    expect(page.items[0]?.name).toBe('contribution');
  });

  it('fails validation when items do not conform to schema', async () => {
    fetchMock.mockResolvedValue(
      okPage([{ eventIdentity: 'hash:0' }], { limit: 10, offset: 0, hasMore: false }),
    );

    await expect(listMyActivity({ limit: 10, offset: 0 }, 'a-token')).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
