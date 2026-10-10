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

/** Known public RPC hosts for standard networks. */
export const KNOWN_TESTNET_RPC_HOSTS = ['soroban-testnet.stellar.org', 'testnet.stellar.org'];
export const KNOWN_MAINNET_RPC_HOSTS = [
  'soroban-rpc.mainnet.stellar.org',
  'mainnet.stellar.org',
  'horizon.stellar.org',
];

export interface AssertRpcMatchesNetworkOptions {
  /**
   * Explicitly allows custom / unverified RPC hosts (e.g. private or third-party nodes).
   *
   * When false (default), non-local custom endpoints that do not match known network
   * domain signatures are rejected to prevent unintended cross-network transaction preparation.
   */
  allowCustomRpc?: boolean;
}

/**
 * Rejects an RPC URL that names a different network than the configured one, or that
 * targets a custom host without explicit opt-in.
 *
 * This catches the mistake that matters: reading or writing one chain while
 * building transactions for another.
 */
export function assertRpcMatchesNetwork(
  network: StellarNetwork,
  rpcUrl: string,
  options: AssertRpcMatchesNetworkOptions = {},
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

  if (network === 'local') {
    return;
  }

  try {
    const parsed = new URL(rpcUrl);
    const host = parsed.hostname.toLowerCase();
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    if (isLocalhost) return;

    const isKnownTestnet = KNOWN_TESTNET_RPC_HOSTS.some(
      (h) => host === h || host.endsWith(`.${h}`),
    );
    const isKnownMainnet = KNOWN_MAINNET_RPC_HOSTS.some(
      (h) => host === h || host.endsWith(`.${h}`),
    );

    if (network === 'testnet' && !isKnownTestnet && !mentionsTestnet && !options.allowCustomRpc) {
      throw new Error(
        `Custom RPC host "${host}" does not identify as a known testnet endpoint. ` +
          'Refusing to continue without explicit custom RPC opt-in.',
      );
    }

    if (network === 'mainnet' && !isKnownMainnet && !mentionsMainnet && !options.allowCustomRpc) {
      throw new Error(
        `Custom RPC host "${host}" does not identify as a known mainnet endpoint. ` +
          'Refusing to continue without explicit custom RPC opt-in.',
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Refusing to continue')) {
      throw error;
    }
    // Non-URL strings are handled by caller / URL parsing.
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

  assertRpcMatchesNetwork(network, rpcUrl);

  return {
    network,
    rpcUrl,
    passphrase: passphraseFor(network),
    explorerBaseUrl: env.VITE_EXPLORER_BASE_URL,
  };
}
