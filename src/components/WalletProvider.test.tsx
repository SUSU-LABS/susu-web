import { useEffect } from 'react';
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

function ConnectCapture({
  onConnect,
}: {
  onConnect: (connect: ReturnType<typeof useWallet>['connect']) => void;
}) {
  const { connect } = useWallet();
  useEffect(() => {
    onConnect(connect);
  }, [connect, onConnect]);
  return null;
}
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

  it('coalesces concurrent connect attempts into a single prompt', async () => {
    let resolve!: (account: { address: string }) => void;
    const pending = new Promise<{ address: string }>((r) => {
      resolve = r;
    });
    mocks.connect.mockReset().mockReturnValue(pending);
    let connectFromContext: ReturnType<typeof useWallet>['connect'] | undefined;
    await act(async () => {
      root.render(
        <WalletProvider>
          <CurrentAddress />
          <ConnectCapture
            onConnect={(nextConnect) => {
              connectFromContext = nextConnect;
            }}
          />
        </WalletProvider>,
      );
    });
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    await act(async () => {
      first = connectFromContext!();
      second = connectFromContext!();
    });
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    await act(async () => resolve({ address: 'GFRESH' }));
    await expect(Promise.all([first, second])).resolves.toEqual([
      { address: 'GFRESH' },
      { address: 'GFRESH' },
    ]);
    expect(container.querySelector('output')?.textContent).toBe('GFRESH');
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
