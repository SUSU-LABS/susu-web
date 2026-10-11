import { StellarNetwork } from './types';

/**
 * Validates that the provided RPC URL matches the intended Stellar network.
 * 
 * By default, this function enforces strict matching. If the RPC URL contains
 * "testnet" or "mainnet", it must match the network configuration.
 * 
 * To use a custom RPC endpoint (e.g., a private node or a hosted mainnet node
 * without the standard token), set the environment variable `VITE_STELLAR_RPC_IS_CUSTOM=true`.
 * This acts as an explicit opt-in to bypass strict URL matching.
 */
export function assertRpcMatchesNetwork(url: string, network: StellarNetwork): void {
  // Explicit opt-in for custom hosts
  if (import.meta.env.VITE_STELLAR_RPC_IS_CUSTOM) {
    return;
  }

  const isTestnet = url.includes('testnet');
  const isMainnet = url.includes('mainnet');

  if (network === 'testnet' && !isTestnet) {
    throw new Error(
      `RPC URL "${url}" does not match network configuration. Expected a testnet URL.`
    );
  }

  if (network === 'mainnet' && !isMainnet) {
    throw new Error(
      `RPC URL "${url}" does not match network configuration. Expected a mainnet URL.`
    );
  }
}
