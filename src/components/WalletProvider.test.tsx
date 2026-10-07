/**
 * @vitest-environment jsdom
 *
 * WalletProvider tracks Freighter account switches.
 *
 * Acceptance criteria for the bounty: switching accounts in Freighter without a
 * reload updates the displayed address (and the session state derived from it),
 * and a changed `getAddress` result observed on window focus updates the
 * context. The wallet module is mocked so the provider's reaction to account
 * changes is tested in isolation from the extension.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletProvider } from './WalletProvider';
import { useWallet } from '@/lib/wallet/context';
import { AddressChip } from './ui';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ADDRESS_A = 'GBSUDM7EZ2EUID465JBLZ5II4HFY2GBMREPTB5BGIN4F7WOV3B3RGX2Y';
const ADDRESS_B = 'CCC7KAX4V4GJD6FVG6GSYQ4I2D2B3CWEOQMIX6YM4QBGXTA6INCGRUYC';

type Account = { address: string } | null;

const mocks = vi.hoisted(() => ({
  /** What the fake wallet's getConnectedAccount reports. */
  connectedAddress: null as string | null,
  getConnectedAccount: vi.fn(),
  /** The push-subscription callback captured from onAccountChanged. */
  pushCallback: null as null | ((account: Account) => void),
  unsubscribe: vi.fn(),
  /** When true, getConnectedAccount rejects (transient probe failure). */
  probeFails: false,
}));

vi.mock('@/lib/wallet', () => {
  const fakeAdapter = {
    id: 'freighter',
    name: 'Freighter',
    isAvailable: async () => true,
    connect: async () => ({ address: mocks.connectedAddress ?? '' }),
    getConnectedAccount: mocks.getConnectedAccount,
    signTransaction: async (): Promise<never> => {
      throw new Error('not used in this test');
    },
    signMessage: async (): Promise<never> => {
      throw new Error('not used in this test');
    },
    onAccountChanged: (callback: (account: Account) => void) => {
      mocks.pushCallback = callback;
      return mocks.unsubscribe;
    },
  };
  return {
    listAvailableWallets: async () => [fakeAdapter],
    WalletError: class WalletError extends Error {
      readonly code: string;
      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    },
  };
});

/** Renders what the app renders from the session: status, address, chip. */
function Probe() {
  const { status, address } = useWallet();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="address">{address ?? ''}</span>
      {address === undefined ? null : <AddressChip value={address} />}
    </div>
  );
}

describe('WalletProvider account-switch tracking', () => {
  let container: HTMLDivElement;
  let root: Root;

  const statusOf = () => container.querySelector('[data-testid="status"]')?.textContent;
  const addressOf = () => container.querySelector('[data-testid="address"]')?.textContent;
  /** The full address the visible chip exposes to assistive tech. */
  const chipAddressOf = () => container.querySelector('code[title]')?.getAttribute('title') ?? null;

  async function renderProvider(): Promise<void> {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <WalletProvider>
          <Probe />
        </WalletProvider>,
      );
    });
  }

  beforeEach(() => {
    mocks.connectedAddress = ADDRESS_A;
    mocks.probeFails = false;
    mocks.pushCallback = null;
    mocks.getConnectedAccount.mockImplementation(async (): Promise<Account> => {
      if (mocks.probeFails) throw new Error('extension unreachable');
      return mocks.connectedAddress === null ? null : { address: mocks.connectedAddress };
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('updates the displayed address when the account changes on window focus', async () => {
    await renderProvider();
    await vi.waitFor(() => expect(statusOf()).toBe('connected'));
    expect(addressOf()).toBe(ADDRESS_A);
    expect(chipAddressOf()).toBe(ADDRESS_A);

    // The user switches accounts in Freighter while the tab is in the
    // background; no reload happens.
    mocks.connectedAddress = ADDRESS_B;
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await vi.waitFor(() => expect(addressOf()).toBe(ADDRESS_B));
    expect(statusOf()).toBe('connected');
    expect(chipAddressOf()).toBe(ADDRESS_B);
  });

  it('drops to disconnected when the site is no longer authorized', async () => {
    await renderProvider();
    await vi.waitFor(() => expect(statusOf()).toBe('connected'));

    mocks.connectedAddress = null;
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await vi.waitFor(() => expect(statusOf()).toBe('disconnected'));
    expect(addressOf()).toBe('');
    expect(chipAddressOf()).toBeNull();
  });

  it('applies pushed account changes without waiting for focus', async () => {
    await renderProvider();
    await vi.waitFor(() => expect(statusOf()).toBe('connected'));
    expect(mocks.pushCallback).not.toBeNull();

    await act(async () => {
      mocks.pushCallback?.({ address: ADDRESS_B });
    });

    await vi.waitFor(() => expect(addressOf()).toBe(ADDRESS_B));
    expect(chipAddressOf()).toBe(ADDRESS_B);
  });

  it('ignores a transient probe failure instead of dropping the session', async () => {
    await renderProvider();
    await vi.waitFor(() => expect(statusOf()).toBe('connected'));

    mocks.probeFails = true;
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    // Let any async work settle; the session must be untouched.
    await act(async () => {});

    expect(statusOf()).toBe('connected');
    expect(addressOf()).toBe(ADDRESS_A);
  });

  it('unsubscribes the push watcher on unmount', async () => {
    await renderProvider();
    await vi.waitFor(() => expect(statusOf()).toBe('connected'));
    act(() => root.unmount());
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
