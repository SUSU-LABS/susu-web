import { describe, it, expect, beforeEach } from 'vitest';
import { assertRpcMatchesNetwork } from './network';

describe('assertRpcMatchesNetwork', () => {
  beforeEach(() => {
    // Reset environment variable before each test
    delete (import.meta.env as any).VITE_STELLAR_RPC_IS_CUSTOM;
  });

  it('should allow known testnet URLs with testnet network', () => {
    expect(() => assertRpcMatchesNetwork('https://horizon-testnet.stellar.org', 'testnet')).not.toThrow();
    expect(() => assertRpcMatchesNetwork('https://node.testnet.stellar.org', 'testnet')).not.toThrow();
  });

  it('should allow known mainnet URLs with mainnet network', () => {
    expect(() => assertRpcMatchesNetwork('https://horizon.stellar.org', 'mainnet')).not.toThrow();
    expect(() => assertRpcMatchesNetwork('https://node.mainnet.stellar.org', 'mainnet')).not.toThrow();
  });

  it('should reject custom mainnet URL with testnet network (default strict mode)', () => {
    expect(() => assertRpcMatchesNetwork('https://custom-mainnet-node.com', 'testnet')).toThrow(
      'RPC URL "https://custom-mainnet-node.com" does not match network configuration. Expected a testnet URL.'
    );
  });

  it('should reject custom testnet URL with mainnet network (default strict mode)', () => {
    expect(() => assertRpcMatchesNetwork('https://custom-testnet-node.com', 'mainnet')).toThrow(
      'RPC URL "https://custom-testnet-node.com" does not match network configuration. Expected a mainnet URL.'
    );
  });

  it('should allow custom mainnet URL with testnet network when opt-in flag is set', () => {
    (import.meta.env as any).VITE_STELLAR_RPC_IS_CUSTOM = 'true';
    expect(() => assertRpcMatchesNetwork('https://custom-mainnet-node.com', 'testnet')).not.toThrow();
  });

  it('should allow custom testnet URL with mainnet network when opt-in flag is set', () => {
    (import.meta.env as any).VITE_STELLAR_RPC_IS_CUSTOM = 'true';
    expect(() => assertRpcMatchesNetwork('https://custom-testnet-node.com', 'mainnet')).not.toThrow();
  });
});
