// @vitest-environment jsdom

/**
 * API hook bindings.
 *
 * `hooks.ts` is thin, and what it owns is exactly the part a screen cannot see:
 * which token is attached, which calls are retried, and which caches are
 * invalidated after a write. These tests drive the hooks through a real React
 * Query client and assert on the calls that result, with the network layer and
 * the token provider mocked.
 */
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  listGroups: vi.fn(),
  createInvite: vi.fn(),
  redeemInvite: vi.fn(),
  getMe: vi.fn(),
  updateMe: vi.fn(),
  deleteAccount: vi.fn(),
  listMyActivity: vi.fn(),
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  requestWalletNonce: vi.fn(),
  verifyWalletLink: vi.fn(),
}));

vi.mock('./token', () => ({ getAccessToken: mocks.getAccessToken }));
vi.mock('./groups', () => ({
  listGroups: mocks.listGroups,
  getTransactionReceipt: vi.fn(),
  listContributions: vi.fn(),
  listPayouts: vi.fn(),
}));
vi.mock('./invites', () => ({
  createInvite: mocks.createInvite,
  redeemInvite: mocks.redeemInvite,
}));
vi.mock('./me', () => ({
  getMe: mocks.getMe,
  updateMe: mocks.updateMe,
  deleteAccount: mocks.deleteAccount,
  listMyActivity: mocks.listMyActivity,
}));
vi.mock('./notifications', () => ({
  listNotifications: mocks.listNotifications,
  markNotificationRead: mocks.markNotificationRead,
}));
vi.mock('./wallet', () => ({
  requestWalletNonce: mocks.requestWalletNonce,
  verifyWalletLink: mocks.verifyWalletLink,
}));

import { apiQueryKeys } from './hooks';
import {
  useCreateInvite,
  useDeleteAccount,
  useLinkWallet,
  useMarkNotificationRead,
  useMe,
  useNotifications,
  useRedeemInvite,
  useUpdateProfile,
} from './hooks';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const GROUP_ID = `C${'A'.repeat(55)}`;
const TOKEN = 'access-token';

type Rendered<T> = {
  readonly current: T;
  readonly client: QueryClient;
  unmount(): void;
};

/** Renders a hook through a real provider and exposes its latest result. */
function renderHook<T>(hook: () => T, client = new QueryClient()): Rendered<T> {
  let value: T | undefined;
  function Probe(): null {
    value = hook();
    return null;
  }

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
  });

  return {
    client,
    get current(): T {
      if (value === undefined) throw new Error('hook has not rendered');
      return value;
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAccessToken.mockResolvedValue(TOKEN);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useCreateInvite', () => {
  it('attaches the token and the group to the request', async () => {
    mocks.createInvite.mockResolvedValue({ code: 'AB12CD' });
    const rendered = renderHook(() => useCreateInvite(GROUP_ID));

    await act(async () => {
      await rendered.current.mutateAsync();
    });

    expect(mocks.createInvite).toHaveBeenCalledWith({ groupContractId: GROUP_ID }, TOKEN);
    rendered.unmount();
  });

  it('refuses without a session rather than sending an empty token', async () => {
    mocks.getAccessToken.mockResolvedValue(undefined);
    const rendered = renderHook(() => useCreateInvite(GROUP_ID));

    await expect(
      act(async () => {
        await rendered.current.mutateAsync();
      }),
    ).rejects.toThrow(/Sign in/);
    expect(mocks.createInvite).not.toHaveBeenCalled();
    rendered.unmount();
  });
});

describe('useRedeemInvite', () => {
  it('redeems with the token', async () => {
    mocks.redeemInvite.mockResolvedValue({ groupContractId: GROUP_ID });
    const rendered = renderHook(() => useRedeemInvite());

    await act(async () => {
      await rendered.current.mutateAsync({ code: 'AB12CD' });
    });

    expect(mocks.redeemInvite).toHaveBeenCalledWith('AB12CD', TOKEN);
    rendered.unmount();
  });
});

describe('useMe', () => {
  it('reads the account with the session token', async () => {
    mocks.getMe.mockResolvedValue({ userId: 'user-1', displayName: 'Ada' });
    const rendered = renderHook(() => useMe());

    await vi.waitFor(() => expect(mocks.getMe).toHaveBeenCalledWith(TOKEN, expect.anything()));
    rendered.unmount();
  });
});

describe('useUpdateProfile', () => {
  it('invalidates the cached account after a successful update', async () => {
    mocks.updateMe.mockResolvedValue({ userId: 'user-1', displayName: 'Grace' });
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const rendered = renderHook(() => useUpdateProfile(), client);

    await act(async () => {
      await rendered.current.mutateAsync({ displayName: 'Grace' });
    });

    expect(mocks.updateMe).toHaveBeenCalledWith({ displayName: 'Grace' }, TOKEN);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: apiQueryKeys.me });
    rendered.unmount();
  });
});

describe('useDeleteAccount', () => {
  it('drops every cached query after the account is gone', async () => {
    mocks.deleteAccount.mockResolvedValue(undefined);
    const client = new QueryClient();
    const clear = vi.spyOn(client, 'clear');
    const rendered = renderHook(() => useDeleteAccount(), client);

    await act(async () => {
      await rendered.current.mutateAsync();
    });

    expect(mocks.deleteAccount).toHaveBeenCalledWith(TOKEN);
    expect(clear).toHaveBeenCalled();
    rendered.unmount();
  });
});

describe('useMarkNotificationRead', () => {
  it('invalidates the notification lists', async () => {
    mocks.markNotificationRead.mockResolvedValue(undefined);
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const rendered = renderHook(() => useMarkNotificationRead(), client);

    await act(async () => {
      await rendered.current.mutateAsync({ id: 'note-1' });
    });

    expect(mocks.markNotificationRead).toHaveBeenCalledWith('note-1', TOKEN);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: apiQueryKeys.allNotifications });
    rendered.unmount();
  });
});

describe('useNotifications', () => {
  it('reads the feed with the session token', async () => {
    mocks.listNotifications.mockResolvedValue({ items: [], hasMore: false, limit: 20, offset: 0 });
    const rendered = renderHook(() => useNotifications(true));

    await vi.waitFor(() =>
      expect(mocks.listNotifications).toHaveBeenCalledWith(
        { unreadOnly: true, limit: 20, offset: 0 },
        TOKEN,
        expect.anything(),
      ),
    );
    rendered.unmount();
  });
});

describe('useLinkWallet', () => {
  it('runs nonce, signature and verification in order', async () => {
    mocks.requestWalletNonce.mockResolvedValue({ nonce: 'n-1', message: 'sign me' });
    mocks.verifyWalletLink.mockResolvedValue({ address: `G${'B'.repeat(55)}` });
    const signMessage = vi.fn(async () => 'signature');
    const rendered = renderHook(() => useLinkWallet());

    await act(async () => {
      await rendered.current.mutateAsync({ address: `G${'B'.repeat(55)}`, signMessage });
    });

    expect(mocks.requestWalletNonce).toHaveBeenCalledWith(`G${'B'.repeat(55)}`, TOKEN);
    expect(signMessage).toHaveBeenCalledWith('sign me');
    expect(mocks.verifyWalletLink).toHaveBeenCalledWith(
      { address: `G${'B'.repeat(55)}`, nonce: 'n-1', signature: 'signature' },
      TOKEN,
    );
    rendered.unmount();
  });
});
