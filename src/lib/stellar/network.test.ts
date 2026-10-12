import { describe, expect, it } from 'vitest';
import { Networks } from '@stellar/stellar-sdk';
import type { Env } from '../env';
import {
  STANDALONE_PASSPHRASE,
  assertNetworkAllowsWrites,
  assertRpcMatchesNetwork,
  passphraseFor,
  resolveNetworkConfig,
} from './network';

function env(overrides: Partial<Env> = {}): Env {
  return {
    VITE_APP_URL: 'http://localhost:5173',
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'test-publishable-key',
    VITE_STELLAR_NETWORK: 'testnet',
    VITE_STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
    VITE_FACTORY_CONTRACT_ID: '',
    VITE_USDC_CONTRACT_ID: '',
    VITE_EXPLORER_BASE_URL: 'https://stellar.expert/explorer/testnet',
    ...overrides,
  };
}

describe('passphraseFor', () => {
  it('maps each network to the passphrase a transaction must be built for', () => {
    expect(passphraseFor('testnet')).toBe(Networks.TESTNET);
    expect(passphraseFor('mainnet')).toBe(Networks.PUBLIC);
    expect(passphraseFor('local')).toBe(STANDALONE_PASSPHRASE);
  });

  it('never returns the same passphrase for testnet and mainnet', () => {
    expect(passphraseFor('testnet')).not.toBe(passphraseFor('mainnet'));
  });
});

describe('assertRpcMatchesNetwork', () => {
  it('accepts a matching endpoint', () => {
    expect(() =>
      assertRpcMatchesNetwork('testnet', 'https://soroban-testnet.stellar.org'),
    ).not.toThrow();
  });

  it('accepts a custom endpoint that names neither network when opted in', () => {
    expect(() => assertRpcMatchesNetwork('testnet', 'https://rpc.example.com', true)).not.toThrow();
  });

  it('rejects a custom endpoint that names neither network without an opt-in', () => {
    // The check cannot prove which chain an unmarked host serves — a silent
    // mainnet behind it would sign for the wrong network, so the operator
    // must say so with VITE_STELLAR_RPC_IS_CUSTOM.
    expect(() => assertRpcMatchesNetwork('testnet', 'https://rpc.example.com')).toThrow(
      /VITE_STELLAR_RPC_IS_CUSTOM/,
    );
    expect(() => assertRpcMatchesNetwork('mainnet', 'https://rpc.example.com')).toThrow(
      /VITE_STELLAR_RPC_IS_CUSTOM/,
    );
  });

  it('rejects a mainnet endpoint while configured for testnet', () => {
    expect(() => assertRpcMatchesNetwork('testnet', 'https://soroban-mainnet.stellar.org')).toThrow(
      /wrong network/,
    );
  });

  it('rejects a testnet endpoint while configured for mainnet', () => {
    expect(() => assertRpcMatchesNetwork('mainnet', 'https://soroban-testnet.stellar.org')).toThrow(
      /wrong network/,
    );
  });

  it('accepts a localhost sandbox regardless of the configured network', () => {
    expect(() =>
      assertRpcMatchesNetwork('local', 'http://localhost:8000/soroban/rpc'),
    ).not.toThrow();
    expect(() => assertRpcMatchesNetwork('testnet', 'http://127.0.0.1:8000')).not.toThrow();
  });

  it('rejects an empty endpoint', () => {
    expect(() => assertRpcMatchesNetwork('testnet', '   ')).toThrow(/empty/);
  });
});

describe('assertNetworkAllowsWrites', () => {
  it('allows writes on local and testnet', () => {
    expect(() => assertNetworkAllowsWrites('local')).not.toThrow();
    expect(() => assertNetworkAllowsWrites('testnet')).not.toThrow();
  });

  it('refuses writes on mainnet', () => {
    expect(() => assertNetworkAllowsWrites('mainnet')).toThrow(/readiness gate/);
  });
});

describe('resolveNetworkConfig', () => {
  it('derives passphrase and explorer URL from validated env', () => {
    const config = resolveNetworkConfig(env());
    expect(config).toEqual({
      network: 'testnet',
      rpcUrl: 'https://soroban-testnet.stellar.org',
      passphrase: Networks.TESTNET,
      explorerBaseUrl: 'https://stellar.expert/explorer/testnet',
    });
  });

  it('propagates an RPC/network mismatch rather than returning a usable config', () => {
    expect(() =>
      resolveNetworkConfig(env({ VITE_STELLAR_RPC_URL: 'https://soroban-mainnet.stellar.org' })),
    ).toThrow(/wrong network/);
  });
});
