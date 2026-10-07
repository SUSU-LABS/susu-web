import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  listAvailableWallets,
  WalletError,
  type WalletAccount,
  type WalletAdapter,
} from '@/lib/wallet';
import { WalletContext, type WalletContextValue, type WalletStatus } from '@/lib/wallet/context';

/**
 * Provides the wallet session.
 *
 * This component only decides *what the session is*. The rules about when a
 * prompt may appear are in `@/lib/wallet/context`, and the signing rules are in
 * the adapters.
 */

function toWalletError(cause: unknown): WalletError {
  if (cause instanceof WalletError) return cause;
  return new WalletError(
    'malformed-response',
    cause instanceof Error ? cause.message : 'The wallet could not be reached.',
    { cause },
  );
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>('checking');
  const [account, setAccount] = useState<WalletAccount | undefined>(undefined);
  const [wallet, setWallet] = useState<WalletAdapter | undefined>(undefined);
  const [available, setAvailable] = useState<readonly WalletAdapter[]>([]);
  const [error, setError] = useState<WalletError | undefined>(undefined);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  /**
   * Applies a newly observed authorized account to the session.
   *
   * Only the settled states move: a re-probe that lands while the user is
   * mid-connect must not rewrite the `connecting` state out from under the
   * prompt flow. An unchanged address is a no-op so background re-probes do
   * not churn renders.
   */
  const applyAccount = useCallback((next: WalletAccount | null): void => {
    setAccount((previous) =>
      previous?.address === next?.address ? previous : (next ?? undefined),
    );
    setStatus((previous) =>
      previous === 'connected' || previous === 'disconnected'
        ? next === null
          ? 'disconnected'
          : 'connected'
        : previous,
    );
  }, []);

  /**
   * Re-reads the already-authorized account without prompting.
   *
   * The account Freighter has active can change at any time — a different tab,
   * the extension popup — so the address read on mount goes stale. A failed
   * probe is left alone: it is a transient fault, not a session change.
   */
  const syncAccount = useCallback(async (): Promise<void> => {
    const target = wallet;
    if (target === undefined) return;
    try {
      const current = await target.getConnectedAccount();
      if (isMounted.current) applyAccount(current);
    } catch {
      // Leave the session as it is.
    }
  }, [wallet, applyAccount]);

  useEffect(() => {
    let cancelled = false;

    const detect = async (): Promise<void> => {
      try {
        const detected = await listAvailableWallets();
        if (cancelled || !isMounted.current) return;

        setAvailable(detected);
        const first = detected[0];

        if (first === undefined) {
          setStatus('unavailable');
          return;
        }

        setWallet(first);

        // Never prompts: this reports an existing authorization, or `null`.
        const existing = await first.getConnectedAccount();
        if (cancelled || !isMounted.current) return;

        if (existing === null) {
          setStatus('disconnected');
          return;
        }

        setAccount(existing);
        setStatus('connected');
      } catch (cause) {
        if (cancelled || !isMounted.current) return;
        setError(toWalletError(cause));
        setStatus('unavailable');
      }
    };

    void detect();

    return () => {
      cancelled = true;
    };
  }, []);

  // The wallet UI lives outside this tab, so a switch made there only becomes
  // visible here when the tab regains attention. Re-probing on focus and on
  // visibility change keeps `address` from going stale without polling.
  useEffect(() => {
    const onFocus = (): void => {
      void syncAccount();
    };
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') void syncAccount();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [syncAccount]);

  // Where the adapter can push account changes (Freighter's poll-based
  // watcher), apply them as they arrive instead of waiting for the next
  // focus. Re-subscribes when the session moves to a different wallet.
  useEffect(() => {
    if (wallet?.onAccountChanged === undefined) return;
    const unsubscribe = wallet.onAccountChanged((changed) => {
      if (isMounted.current) applyAccount(changed);
    });
    return unsubscribe;
  }, [wallet, applyAccount]);

  const connect = useCallback(async (): Promise<WalletAccount | undefined> => {
    const target = wallet ?? (await listAvailableWallets())[0];

    if (target === undefined) {
      setError(new WalletError('unavailable', 'No Stellar wallet was found in this browser.'));
      setStatus('unavailable');
      return undefined;
    }

    setStatus('connecting');
    setError(undefined);

    try {
      const connected = await target.connect();
      if (!isMounted.current) return undefined;
      setWallet(target);
      setAccount(connected);
      setStatus('connected');
      return connected;
    } catch (cause) {
      if (!isMounted.current) return undefined;
      // A declined prompt leaves the session exactly as it was: still
      // disconnected. It is a decision, not a fault, so it must not be rendered
      // as a broken state.
      setError(toWalletError(cause));
      setStatus('disconnected');
      return undefined;
    }
  }, [wallet]);

  const disconnect = useCallback((): void => {
    setAccount(undefined);
    setError(undefined);
    setStatus('disconnected');
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      address: account?.address,
      wallet,
      available,
      error,
      connect,
      disconnect,
    }),
    [status, account, wallet, available, error, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
