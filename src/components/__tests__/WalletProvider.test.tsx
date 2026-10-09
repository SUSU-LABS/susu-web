import { render, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletProvider, useWallet } from '../WalletProvider';

const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

// Small app that exposes connect / status for testing
function TestHarness() {
  const { connect, status, account, error } = useWallet();
  return (
    <div>
      <button data-testid="connect-btn" onClick={connect}>
        Connect
      </button>
      <span data-testid="status">{status}</span>
      <span data-testid="account">{account ?? ''}</span>
      <span data-testid="error">{error ?? ''}</span>
    </div>
  );
}

function setup() {
  const { getByTestId, rerender } = render(
    <WalletProvider>
      <TestHarness />
    </WalletProvider>
  );
  return { getByTestId, rerender };
}

describe('WalletProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset any lingering deferred from previous tests
    (window as any).__susu_setDeferred = null;
  });

  afterEach(() => {
    delete (window as any).__susu_setDeferred;
    delete (window as any).__susu_deferred;
  });

  it('transitions from disconnected to connected on connect', async () => {
    const { getByTestId } = setup();
    const btn = getByTestId('connect-btn');

    await act(async () => {
      btn.click();
    });

    await waitFor(() => {
      expect(getByTestId('status').textContent).toBe('connected');
    });
    expect(getByTestId('account').textContent).toMatch(/^0x/);
  });

  // ------------------------------------------------------------------ //
  //  Concurrent-invocation race guard                                    //
  // ------------------------------------------------------------------ //
  it('does not prompt again when connect is called while already connecting', async () => {
    const { getByTestId } = setup();
    const btn = getByTestId('connect-btn');

    // Intercept the provider request so we can control resolution timing.
    let deferredResolve!: (v?: any) => void;
    let deferredReject!: (r: any) => void;

    (window as any).__susu_setDeferred = (d: any) => {
      deferredResolve = d.resolve;
      deferredReject = d.reject;
    };

    // Kick off the first connect.  The provider will stall on the deferred.
    await act(async () => {
      btn.click();
    });

    // Second click while still connecting — should NOT trigger a second prompt.
    let promptCount = 0;
    const originalSetDeferred = (window as any).__susu_setDeferred;
    (window as any).__susu_setDeferred = (d: any) => {
      promptCount++;
      originalSetDeferred(d);
    };

    await act(async () => {
      btn.click();
    });

    // Only one deferred should have been created (the first call).
    expect(promptCount).toBe(0);

    // Now resolve the deferred and verify the state transitions correctly.
    await act(async () => {
      deferredResolve({ account: '0xDefer123', chainId: 8453 });
    });

    await waitFor(() => {
      expect(getByTestId('status').textContent).toBe('connected');
      expect(getByTestId('account').textContent).toBe('0xDefer123');
    });
  });

  it('returns the same promise when connect is called concurrently', async () => {
    const { getByTestId } = setup();
    const btn = getByTestId('connect-btn');

    let deferredResolve!: (v?: any) => void;
    (window as any).__susu_setDeferred = (d: any) => {
      deferredResolve = d.resolve;
    };

    const p1 = act(async () => btn.click());
    const p2 = act(async () => btn.click());

    expect(p1).toBe(p2); // same promise instance

    await p1;
    await p2;
    await act(async () => {
      deferredResolve({ account: '0xSame', chainId: 8453 });
    });

    await waitFor(() => {
      expect(getByTestId('status').textContent).toBe('connected');
    });
  });
});
