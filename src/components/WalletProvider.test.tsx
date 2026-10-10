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
});

describe('WalletProvider connect race', () => {
  let container: HTMLDivElement;
  let root: Root;
  let resolveConnect: (value: { address: string }) => void = () => {};

  function ConnectButton() {
    const { connect, status } = useWallet();
    return (
      <button data-status={status} onClick={() => void connect()}>
        connect
      </button>
    );
  }

  beforeEach(async () => {
    mocks.getConnectedAccount.mockReset().mockResolvedValue(null);
    mocks.connect.mockReset().mockImplementation(
      () =>
        new Promise<{ address: string }>((resolve) => {
          resolveConnect = resolve;
        }),
    );
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <WalletProvider>
          <ConnectButton />
        </WalletProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('a second connect while one is in flight does not prompt again', async () => {
    await act(async () => {
      const button = container.querySelector('button')!;
      button.click();
      button.click();
    });

    // Both clicks went through the same in-flight promise: only one prompt.
    expect(mocks.connect).toHaveBeenCalledTimes(1);

    // Settle and confirm a single status transition to connected.
    await act(async () => {
      resolveConnect({ address: 'GRACE' });
    });
    expect(container.querySelector('button')?.dataset.status).toBe('connected');
    expect(mocks.connect).toHaveBeenCalledTimes(1);
  });

  it('concurrent connects resolve to the same account', async () => {
    const results: Array<{ address: string } | undefined> = [];

    function Probe() {
      const { connect, status } = useWallet();
      return (
        <button
          data-status={status}
          onClick={() => {
            void connect().then((r) => results.push(r));
          }}
        >
          go
        </button>
      );
    }

    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await act(async () => {
      root.render(
        <WalletProvider>
          <Probe />
        </WalletProvider>,
      );
    });

    await act(async () => {
      const button = container.querySelector('button')!;
      button.click();
      button.click();
      button.click();
    });

    expect(mocks.connect).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveConnect({ address: 'GRACE' });
    });

    expect(results).toHaveLength(3);
    expect(results.every((r) => r?.address === 'GRACE')).toBe(true);
    expect(container.querySelector('button')?.dataset.status).toBe('connected');
  });

  it('a connect after the first settles prompts again', async () => {
    await act(async () => {
      container.querySelector('button')!.click();
    });
    expect(mocks.connect).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveConnect({ address: 'GRACE' });
    });
    expect(container.querySelector('button')?.dataset.status).toBe('connected');

    // New deferred for the second round.
    mocks.connect.mockImplementationOnce(
      () => new Promise<{ address: string }>((resolve) => resolve({ address: 'GNEW' })),
    );
    await act(async () => {
      container.querySelector('button')!.click();
    });
    expect(mocks.connect).toHaveBeenCalledTimes(2);
  });
});
