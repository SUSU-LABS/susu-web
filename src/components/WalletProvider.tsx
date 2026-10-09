import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type WalletStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface WalletState {
  status: WalletStatus;
  account: string | null;
  chainId: number | null;
  wallet: string | null;
  error: string | null;
}

export interface WalletContextType extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
  reset: () => void;
}

const INITIAL_STATE: WalletState = {
  status: 'disconnected',
  account: null,
  chainId: null,
  wallet: null,
  error: null,
};

const WalletContext = createContext<WalletContextType | null>(null);

function getStoredWallet(): WalletState {
  try {
    const raw = localStorage.getItem('susu_wallet');
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WalletState>;
      return {
        ...INITIAL_STATE,
        ...parsed,
        status: (parsed.status as WalletStatus) ?? 'disconnected',
      };
    }
  } catch {
    // ignore corrupted storage
  }
  return INITIAL_STATE;
}

function storeWallet(state: WalletState): void {
  try {
    const { status, account, chainId, wallet, error } = state;
    localStorage.setItem(
      'susu_wallet',
      JSON.stringify({ status, account, chainId, wallet, error })
    );
  } catch {
    // storage full or unavailable — continue without persistence
  }
}

function resolveProvider(wallet: string): Promise<{
  account: string;
  chainId: number;
}> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Browser environment required'));
      return;
    }
    const provider = (window as any).__susu_provider;
    if (!provider) {
      reject(new Error(`Provider "${wallet}" not found`));
      return;
    }
    // Simulate async request — in production this calls requestAccess()
    setTimeout(() => {
      if (Math.random() > 0.05) {
        resolve({
          account: `0x${wallet.slice(0, 40)}`,
          chainId: 8453,
        });
      } else {
        reject(new Error('User rejected access'));
      }
    }, 300);
  });
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>(getStoredWallet);
  // Ref to track an in-flight connect promise so concurrent calls share it
  const connectPromiseRef = useRef<Promise<void> | null>(null);
  // Ref to remember the deferred resolve/reject from the test harness
  const deferredRef = useRef<{
    resolve: (value?: void | PromiseLike<void>) => void;
    reject: (reason?: any) => void;
  } | null>(null);

  // Expose a way for tests to inject a controllable requestAccess
  useEffect(() => {
    if ((window as any).__susu_setDeferred) {
      (window as any).__susu_setDeferred = (d: any) => {
        deferredRef.current = d;
      };
    }
  }, []);

  const connect = useCallback(async () => {
    // If a connection is already in flight, return the existing promise
    // so the caller waits for the same result instead of triggering another prompt.
    if (connectPromiseRef.current) {
      return connectPromiseRef.current;
    }

    const promise = (async () => {
      setState((prev) => ({ ...prev, status: 'connecting', error: null }));

      try {
        // Allow test harness to intercept the provider request
        const deferred = deferredRef.current;
        let result: { account: string; chainId: number };
        if (deferred) {
          // In test mode we resolve the deferred promise manually
          result = await new Promise((resolve, reject) => {
            deferred.resolve = resolve as any;
            deferred.reject = reject;
          });
        } else {
          // Production path: pick the preferred wallet and request access
          const wallet = 'susu';
          result = await resolveProvider(wallet);
        }

        const newState: WalletState = {
          status: 'connected',
          account: result.account,
          chainId: result.chainId,
          wallet: 'susu',
          error: null,
        };
        setState(newState);
        storeWallet(newState);
      } catch (err: any) {
        const newState: WalletState = {
          ...INITIAL_STATE,
          status: 'error',
          error: err?.message ?? 'Connection failed',
        };
        setState(newState);
        storeWallet(newState);
      } finally {
        // Clear the in-flight ref regardless of outcome
        connectPromiseRef.current = null;
      }
    })();

    connectPromiseRef.current = promise;
    return promise;
  }, []);

  const disconnect = useCallback(() => {
    const newState: WalletState = { ...INITIAL_STATE };
    setState(newState);
    storeWallet(newState);
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem('susu_wallet');
    setState(INITIAL_STATE);
  }, []);

  const value = useMemo<WalletContextType>(
    () => ({ ...state, connect, disconnect, reset }),
    [state, connect, disconnect, reset]
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextType {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return ctx;
}
