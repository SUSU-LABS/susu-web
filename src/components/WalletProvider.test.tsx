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

  it('guards connect against concurrent invocations using in-flight lock', async () => {
    let resolvePrompt!: (account: { address: string }) => void;
    const deferredPrompt = new Promise<{ address: string }>((resolve) => {
      resolvePrompt = resolve;
    });

    mocks.getConnectedAccount.mockResolvedValue(null);
    mocks.connect.mockImplementation(() => deferredPrompt);

    let connectFn: (() => Promise<unknown>) | undefined;
    function Harness() {
      const wallet = useWallet();
      useEffect(() => {
        connectFn = wallet.connect;
      });
      return <output data-status={wallet.status}>{wallet.address ?? 'none'}</output>;
    }

    await act(async () => {
      root.render(
        <WalletProvider>
          <Harness />
        </WalletProvider>,
      );
    });

    expect(container.querySelector('output')?.dataset.status).toBe('disconnected');
    expect(connectFn).toBeDefined();

    // Fire two rapid concurrent connect calls
    let promise1!: Promise<unknown>;
    let promise2!: Promise<unknown>;

    await act(async () => {
      promise1 = connectFn!();
      promise2 = connectFn!();
    });

    // Exactly one connect / requestAccess prompt was initiated
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(container.querySelector('output')?.dataset.status).toBe('connecting');

    // Both returned the same in-flight promise
    expect(promise1).toBe(promise2);

    // Now resolve the deferred access prompt
    await act(async () => {
      resolvePrompt({ address: 'GCONNECTED' });
      await promise1;
    });

    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(container.querySelector('output')?.textContent).toBe('GCONNECTED');
    expect(container.querySelector('output')?.dataset.status).toBe('connected');
  });
});
