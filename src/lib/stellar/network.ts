import { Networks } from '@stellar/stellar-sdk';
import type { Env } from '../env';

/**
 * Stellar network resolution.
 *
 * A transaction is only valid for the network it was signed for, and a wallet
 * will happily sign an envelope built for the wrong passphrase. Every network
 * value used by this app is therefore derived here, from validated
 * configuration, rather than being written out at a call site.
 */

export type StellarNetwork = 'local' | 'testnet' | 'mainnet';

/**
 * The standalone network used by a local Soroban sandbox. The SDK has no
 * constant for it because local networks are launched by tooling.
 */
export const STANDALONE_PASSPHRASE = 'Standalone Network ; February 2017';

export interface NetworkConfig {
  readonly network: StellarNetwork;
  readonly rpcUrl: string;
  readonly passphrase: string;
  readonly explorerBaseUrl: string;
}

/** The passphrase a transaction must be built for on each network. */
export function passphraseFor(network: StellarNetwork): string {
  switch (network) {
    case 'local':
      return STANDALONE_PASSPHRASE;
    case 'testnet':
      return Networks.TESTNET;
    case 'mainnet':
      return Networks.PUBLIC;
  }
}

export interface RpcNetworkCheckOptions {
  /**
   * Whether the operator has explicitly acknowledged that the RPC URL points
   * at a custom host they verified serves `network`. Required when the URL
   * names neither network, because then a mismatch cannot be detected.
   */
  readonly customRpcAcknowledged?: boolean;
}

/**
 * Rejects an RPC URL that names a different network than the configured one.
 *
 * This catches the mistake that matters: reading or writing one chain while
 * building transactions for another. The check looks for an explicit
 * contradiction (`testnet` in the URL while configured for `mainnet`, or the
 * reverse). A URL that names neither network is a custom host — a mismatch
 * there cannot be detected, so it is rejected unless the operator explicitly
 * opts in (e.g. via `VITE_STELLAR_RPC_IS_CUSTOM`).
 */
export function assertRpcMatchesNetwork(
  network: StellarNetwork,
  rpcUrl: string,
  opts: RpcNetworkCheckOptions = {},
): void {
  if (rpcUrl.trim() === '') {
    throw new Error('Stellar RPC URL is empty.');
  }

  const url = rpcUrl.toLowerCase();
  const mentionsTestnet = url.includes('testnet');
  const mentionsMainnet = url.includes('mainnet');

  if (network === 'testnet' && mentionsMainnet) {
    throw new Error(
      `Stellar RPC URL points at a mainnet endpoint but the configured network is "testnet". ` +
        'Refusing to continue: transactions would be built for the wrong network.',
    );
  }
  if (network === 'mainnet' && mentionsTestnet) {
    throw new Error(
      `Stellar RPC URL points at a testnet endpoint but the configured network is "mainnet". ` +
        'Refusing to continue: transactions would be built for the wrong network.',
    );
  }

  if (!mentionsTestnet && !mentionsMainnet && !opts.customRpcAcknowledged) {
    throw new Error(
      `Stellar RPC URL (${rpcUrl}) does not name a network, so it cannot be checked against ` +
        `the configured network "${network}". Refusing to continue: set VITE_STELLAR_RPC_IS_CUSTOM=true ` +
        'to confirm this custom host actually serves the configured network.',
    );
  }
}

/**
 * Whether the network can be written to.
 *
 * Mainnet is deliberately out of scope until the Mainnet readiness gate is
 * passed with explicit human approval. Reads are permitted everywhere; writes
 * are not. Guarding at this single point means a misconfiguration cannot turn
 * into a mainnet transaction.
 */
export function assertNetworkAllowsWrites(network: StellarNetwork): void {
  if (network === 'mainnet') {
    throw new Error(
      'Refusing to submit a transaction to mainnet. Mainnet is out of scope until the ' +
        'Mainnet readiness gate is passed with explicit human approval.',
    );
  }
}

export function isMainnet(network: StellarNetwork): boolean {
  return network === 'mainnet';
}

/** Derives the network configuration from validated environment values. */
export function resolveNetworkConfig(env: Env): NetworkConfig {
  const network = env.VITE_STELLAR_NETWORK;
  const rpcUrl = env.VITE_STELLAR_RPC_URL;

  assertRpcMatchesNetwork(network, rpcUrl, {
    customRpcAcknowledged: env.VITE_STELLAR_RPC_IS_CUSTOM,
  });

  return {
    network,
    rpcUrl,
    passphrase: passphraseFor(network),
    explorerBaseUrl: env.VITE_EXPLORER_BASE_URL,
  };
}
