/**
 * @vitest-environment jsdom
 */
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConnectedAccount: vi.fn(),
  connect: vi.fn(),
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
        connect: mocks.connect,
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

  it('guards concurrent connect() calls, returning the in-flight promise and prompting once', async () => {
    let resolveConnect!: (val: { address: string }) => void;
    mocks.connect.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveConnect = resolve;
        }),
    );
    mocks.getConnectedAccount.mockResolvedValue(null);

    let connectFn!: () => Promise<unknown>;
    function TestConsumer() {
      const wallet = useWallet();
      useEffect(() => {
        connectFn = wallet.connect;
      }, [wallet.connect]);
      return <output data-status={wallet.status}>{wallet.address ?? 'none'}</output>;
    }

    await act(async () => {
      root.render(
        <WalletProvider>
          <TestConsumer />
        </WalletProvider>,
      );
    });

    let p1!: Promise<unknown>;
    let p2!: Promise<unknown>;
    act(() => {
      p1 = connectFn();
      p2 = connectFn();
    });

    // Both calls must return the identical promise instance
    expect(p1).toBe(p2);

    // Adapter's connect prompt must be called exactly once
    expect(mocks.connect).toHaveBeenCalledTimes(1);

    // Resolve deferred prompt
    await act(async () => {
      resolveConnect({ address: 'GCONCURRENT' });
      await p1;
    });

    expect(container.querySelector('output')?.textContent).toBe('GCONCURRENT');
    expect(container.querySelector('output')?.dataset.status).toBe('connected');

    // Subsequent call after settling triggers a new prompt cleanly
    mocks.connect.mockResolvedValue({ address: 'GNEW' });
    await act(async () => {
      await connectFn();
    });
    expect(mocks.connect).toHaveBeenCalledTimes(2);
  });

  it('resets in-flight lock on connect failure allowing subsequent retry', async () => {
    mocks.connect.mockRejectedValueOnce(new Error('User declined'));
    mocks.getConnectedAccount.mockResolvedValue(null);

    let connectFn!: () => Promise<unknown>;
    function TestConsumer() {
      const wallet = useWallet();
      useEffect(() => {
        connectFn = wallet.connect;
      }, [wallet.connect]);
      return <output data-status={wallet.status}>{wallet.address ?? 'none'}</output>;
    }

    await act(async () => {
      root.render(
        <WalletProvider>
          <TestConsumer />
        </WalletProvider>,
      );
    });

    await act(async () => {
      await connectFn();
    });

    expect(container.querySelector('output')?.dataset.status).toBe('disconnected');

    // Retry must work and invoke connect again
    mocks.connect.mockResolvedValueOnce({ address: 'GRETRY' });
    await act(async () => {
      await connectFn();
    });

    expect(container.querySelector('output')?.textContent).toBe('GRETRY');
    expect(container.querySelector('output')?.dataset.status).toBe('connected');
    expect(mocks.connect).toHaveBeenCalledTimes(2);
  });
});
