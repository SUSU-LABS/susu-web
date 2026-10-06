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
vi.mock('../supabase', () => ({
  getSupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'a-token' } } }) },
  }),
}));

const { createInvite, redeemInvite, inviteLink, looksLikeInviteCode } = await import('./invites');

const GROUP = `C${'A'.repeat(55)}`;
const CODE = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
const INVITE = { code: CODE, groupContractId: GROUP, expiresAt: null, maxUses: null, uses: 0 };

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

describe('createInvite', () => {
  it('posts to the group’s invites path', async () => {
    fetchMock.mockResolvedValue(ok(INVITE));

    await createInvite({ groupContractId: GROUP }, 'a-token');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://api.example.test/api/v1/groups/${GROUP}/invites`,
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
  });

  it('omits limits it was not given, rather than sending nulls', async () => {
    fetchMock.mockResolvedValue(ok(INVITE));

    await createInvite({ groupContractId: GROUP }, 'a-token');

    // An explicit `maxUses: null` would be a value where the API expects absence,
    // and `expiresInHours: null` fails its numeric check.
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe('{}');
  });

  it('sends the limits it was given', async () => {
    fetchMock.mockResolvedValue(ok(INVITE));

    await createInvite({ groupContractId: GROUP, expiresInHours: 48, maxUses: 3 }, 'a-token');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ expiresInHours: 48, maxUses: 3 });
  });

  it('escapes the contract id in the path', async () => {
    fetchMock.mockResolvedValue(ok(INVITE));

    // Not an address today, but the path segment is built from a value that comes
    // from a route parameter, so it is escaped rather than trusted.
    await createInvite({ groupContractId: 'C/../evil' }, 'a-token');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/groups/C%2F..%2Fevil/invites',
    );
  });

  it('fails validation when response is malformed', async () => {
    fetchMock.mockResolvedValue(ok({ code: CODE }));

    await expect(createInvite({ groupContractId: GROUP }, 'a-token')).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});

describe('redeemInvite', () => {
  it('posts the code in the body, not the query string', async () => {
    fetchMock.mockResolvedValue(ok({ groupContractId: GROUP, inviteId: 'invite-id' }));

    const result = await redeemInvite(CODE, 'a-token');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.test/api/v1/invites/redeem');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    // A query string would put the secret in server logs and referrers.
    expect(init.body).toBe(JSON.stringify({ code: CODE }));
    expect(result.groupContractId).toBe(GROUP);
  });

  it('requires no group address, because the code identifies the group', async () => {
    fetchMock.mockResolvedValue(ok({ groupContractId: GROUP, inviteId: 'invite-id' }));

    const result = await redeemInvite(CODE, 'a-token');

    // The point of an opaque code: this is how the client learns which contract
    // to read and which to send the join transaction to.
    expect(result.groupContractId).toBe(GROUP);
  });

  it('fails validation when response is malformed', async () => {
    fetchMock.mockResolvedValue(ok({ wrongField: 123 }));

    await expect(redeemInvite(CODE, 'a-token')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('inviteLink', () => {
  it('puts the code in the path of the given origin', () => {
    expect(inviteLink(CODE, 'https://app.example')).toBe(`https://app.example/join/${CODE}`);
  });

  it('tolerates a trailing slash on the origin', () => {
    expect(inviteLink(CODE, 'https://app.example/')).toBe(`https://app.example/join/${CODE}`);
  });

  it('escapes the code, so a stray character cannot change the path', () => {
    expect(inviteLink('a/b?c', 'https://app.example')).toBe('https://app.example/join/a%2Fb%3Fc');
  });

  it('round-trips through the path prefix the router uses', () => {
    // The link builder and the route must agree on `/join/`; a mismatch is a 404
    // for every invitee and nothing would catch it at the type level.
    const link = inviteLink(CODE, 'https://app.example');
    expect(new URL(link).pathname).toBe(`/join/${CODE}`);
  });
});

describe('looksLikeInviteCode', () => {
  it('accepts a code of the API’s shape', () => {
    expect(looksLikeInviteCode(CODE)).toBe(true);
    expect(looksLikeInviteCode('abc_DEF-0123456789abcd')).toBe(true);
  });

  it('rejects a contract address', () => {
    // A contract address in an invite slot is someone using the old flow or
    // pasting the wrong thing; either way, asking the API about it is a request
    // that cannot succeed.
    expect(looksLikeInviteCode(GROUP)).toBe(false);
  });

  it('rejects a code that is too short', () => {
    expect(looksLikeInviteCode('too-short')).toBe(false);
  });

  it('rejects a code with characters base64url does not use', () => {
    expect(looksLikeInviteCode(`${CODE}!`)).toBe(false);
  });
});
