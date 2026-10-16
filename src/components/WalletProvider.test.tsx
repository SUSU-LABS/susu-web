/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConnectedAccount: vi.fn(),
  walletConnect: vi.fn(),
}));

vi.mock('@/lib/wallet', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/wallet')>();
  return {
    ...original,
    listAvailableWallets: vi.fn(async () => [
      {
        id: 'freighter',
        name: 'Freighter',
        isAvailable: vi.fn(async () => true),
        connect: mocks.walletConnect,
        getConnectedAccount: mocks.getConnectedAccount,
        signTransaction: vi.fn(),
        signMessage: vi.fn(),
      },
    ]),
  };
});

import { useWallet } from '@/lib/wallet/context';
import { WalletProvider } from './WalletProvider';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function CurrentAddress() {
  const { address, status } = useWallet();
  return <output data-status={status}>{address ?? 'none'}</output>;
}

let capturedConnect: (() => Promise<unknown>) | undefined;

function ConnectProbe() {
  const { connect, status } = useWallet();
  capturedConnect = connect;
  return <output data-status={status}>probe</output>;
}

describe('WalletProvider connect', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.getConnectedAccount.mockReset().mockResolvedValue(null);
    mocks.walletConnect.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    capturedConnect = undefined;
  });

  it('a second connect joins the in-flight attempt rather than prompting again', async () => {
    // The prompt stays open until the test lets it settle — two calls while it
    // is pending must produce one prompt and one account transition.
    let settle!: (a: { address: string }) => void;
    mocks.walletConnect.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    mocks.getConnectedAccount.mockResolvedValue({ address: 'GRACE' });

    act(() => {
      root.render(
        <WalletProvider>
          <ConnectProbe />
        </WalletProvider>,
      );
    });
    await act(async () => {});

    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    await act(async () => {
      first = capturedConnect!();
      second = capturedConnect!();
    });

    expect(mocks.walletConnect).toHaveBeenCalledTimes(1);
    expect(container.querySelector('output')?.dataset.status).toBe('connecting');

    await act(async () => {
      settle({ address: 'GRACE' });
      await Promise.all([first, second]);
    });

    expect(mocks.walletConnect).toHaveBeenCalledTimes(1);
    expect(await first).toEqual(await second);
    expect(container.querySelector('output')?.dataset.status).toBe('connected');

    // Settled is settled — a later click starts a fresh attempt.
    mocks.walletConnect.mockResolvedValue({ address: 'GRACE' });
    await act(async () => {
      await capturedConnect!();
    });
    expect(mocks.walletConnect).toHaveBeenCalledTimes(2);
  });
});

describe('WalletProvider account refresh', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.getConnectedAccount.mockReset().mockResolvedValue({ address: 'GOLD' });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('re-reads the authorized account when the window regains focus', async () => {
    await act(async () => {
      root.render(
        <WalletProvider>
          <CurrentAddress />
        </WalletProvider>,
      );
    });

    expect(container.querySelector('output')?.textContent).toBe('GOLD');

    mocks.getConnectedAccount.mockResolvedValue({ address: 'GNEW' });
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(container.querySelector('output')?.textContent).toBe('GNEW');
    expect(container.querySelector('output')?.dataset.status).toBe('connected');
  });

  it('disconnects the stale account when Freighter no longer returns one', async () => {
    await act(async () => {
      root.render(
        <WalletProvider>
          <CurrentAddress />
        </WalletProvider>,
      );
    });

    mocks.getConnectedAccount.mockResolvedValue(null);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(container.querySelector('output')?.textContent).toBe('none');
    expect(container.querySelector('output')?.dataset.status).toBe('disconnected');
  });
});
