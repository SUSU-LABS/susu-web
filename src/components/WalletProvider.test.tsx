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

let current!: ReturnType<typeof useWallet>;

function CurrentAddress() {
  const value = useWallet();
  useEffect(() => {
    current = value;
  }, [value]);
  const { address, status } = value;
  return <output data-status={status}>{address ?? 'none'}</output>;
}

describe('WalletProvider account refresh', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.connect.mockReset();
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
  it('shares one pending wallet prompt across concurrent callers', async () => {
    let complete!: (value: { address: string }) => void;
    mocks.connect.mockImplementation(
      () =>
        new Promise<{ address: string }>((resolve) => {
          complete = resolve;
        }),
    );
    await act(async () =>
      root.render(
        <WalletProvider>
          <CurrentAddress />
        </WalletProvider>,
      ),
    );
    let first!: ReturnType<typeof current.connect>;
    let second!: ReturnType<typeof current.connect>;
    await act(async () => {
      first = current.connect();
      second = current.connect();
    });
    expect(first).toBe(second);
    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(container.querySelector('output')?.dataset.status).toBe('connecting');
    await act(async () => {
      complete({ address: 'GNEW' });
      await first;
    });
    await expect(second).resolves.toEqual({ address: 'GNEW' });
    expect(container.querySelector('output')?.textContent).toBe('GNEW');
  });

  it('allows another prompt after rejection', async () => {
    mocks.connect
      .mockRejectedValueOnce(new Error('declined'))
      .mockResolvedValueOnce({ address: 'GNEW' });
    await act(async () =>
      root.render(
        <WalletProvider>
          <CurrentAddress />
        </WalletProvider>,
      ),
    );
    await act(async () => {
      await expect(current.connect()).resolves.toBeUndefined();
    });
    expect(container.querySelector('output')?.dataset.status).toBe('disconnected');
    await act(async () => {
      await expect(current.connect()).resolves.toEqual({ address: 'GNEW' });
    });
    expect(mocks.connect).toHaveBeenCalledTimes(2);
    expect(container.querySelector('output')?.dataset.status).toBe('connected');
  });
});
