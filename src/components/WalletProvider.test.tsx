/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
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

  function ConnectTester() {
    const { connect, status, address } = useWallet();
    return (
      <div>
        <output data-status={status}>{address ?? 'none'}</output>
        <button id="connect-button" onClick={() => void connect()}>
          Connect
        </button>
      </div>
    );
  }

  it('guards against concurrent connect() calls and reuses the in-flight promise with deferred prompt', async () => {
    mocks.getConnectedAccount.mockResolvedValue(null);
    let resolveAccess!: (acc: { address: string }) => void;
    mocks.connect.mockImplementation(
      () =>
        new Promise<{ address: string }>((resolve) => {
          resolveAccess = resolve;
        }),
    );

    await act(async () => {
      root.render(
        <WalletProvider>
          <ConnectTester />
        </WalletProvider>,
      );
    });

    const button = container.querySelector<HTMLButtonElement>('#connect-button')!;
    expect(container.querySelector('output')?.dataset.status).toBe('disconnected');

    // Trigger two rapid clicks while the prompt is in flight
    act(() => {
      button.click();
      button.click();
    });

    // Exactly one prompt/target.connect() should have been called
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(container.querySelector('output')?.dataset.status).toBe('connecting');

    // Resolve deferred prompt
    await act(async () => {
      resolveAccess({ address: 'GDEFERRED' });
    });

    // Successfully transitions to connected with expected address
    expect(container.querySelector('output')?.textContent).toBe('GDEFERRED');
    expect(container.querySelector('output')?.dataset.status).toBe('connected');
    expect(mocks.connect).toHaveBeenCalledTimes(1);
  });

  it('allows subsequent connect() after earlier in-flight connection settles or fails', async () => {
    mocks.getConnectedAccount.mockResolvedValue(null);
    mocks.connect.mockRejectedValueOnce(new Error('User rejected'));

    await act(async () => {
      root.render(
        <WalletProvider>
          <ConnectTester />
        </WalletProvider>,
      );
    });

    const button = container.querySelector<HTMLButtonElement>('#connect-button')!;

    await act(async () => {
      button.click();
    });

    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(container.querySelector('output')?.dataset.status).toBe('disconnected');

    // Subsequent connect succeeds
    mocks.connect.mockResolvedValueOnce({ address: 'GSUCCESS' });
    await act(async () => {
      button.click();
    });

    expect(mocks.connect).toHaveBeenCalledTimes(2);
    expect(container.querySelector('output')?.textContent).toBe('GSUCCESS');
    expect(container.querySelector('output')?.dataset.status).toBe('connected');
  });
});
