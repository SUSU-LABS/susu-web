import { describe, expect, it } from 'vitest';
import {
  entryStaticallyImportsVendor,
  findEntryAsset,
  findStaticImports,
  findVendorStellarChunk,
} from './check-bundle-size.mjs';

/**
 * These pin the bundle-size guard's own behaviour, because it is the check
 * that proves #24's code splitting did not regress: if the guard cannot fail
 * on the thing it exists for, the entry chunk can silently grow back to the
 * ~1.6 MB that shipped before route-level splitting.
 */

describe('findEntryAsset', () => {
  it('extracts the basename of the module script', () => {
    const html = '<script type="module" crossorigin src="/assets/index-a1b2c3.js"></script>';
    expect(findEntryAsset(html)).toBe('index-a1b2c3.js');
  });

  it('handles a relative src', () => {
    const html = '<script src="./assets/index-x.js" type="module"></script>';
    expect(findEntryAsset(html)).toBe('index-x.js');
  });

  it('throws when there is no module script', () => {
    expect(() => findEntryAsset('<html><body></body></html>')).toThrow('no module script');
  });
});

describe('findVendorStellarChunk', () => {
  it('finds the quarantined chunk among the emitted assets', () => {
    const files = ['index-a.js', 'vendor-stellar-b2.js', 'Landing-c.js'];
    expect(findVendorStellarChunk(files)).toBe('vendor-stellar-b2.js');
  });

  it('returns undefined when the manualChunks split is gone', () => {
    expect(findVendorStellarChunk(['index-a.js', 'Landing-c.js'])).toBeUndefined();
  });
});

describe('entryStaticallyImportsVendor', () => {
  it('detects a static import of the vendor chunk', () => {
    const source = 'import{x}from"./vendor-stellar-b2.js";console.log(x)';
    expect(entryStaticallyImportsVendor(source, 'vendor-stellar-b2.js')).toBe(true);
  });

  it('detects a side-effect-only import of the vendor chunk', () => {
    expect(
      entryStaticallyImportsVendor('import"./vendor-stellar-b2.js";', 'vendor-stellar-b2.js'),
    ).toBe(true);
  });

  it('ignores the preload manifest: dynamic imports are not initial fetches', () => {
    // Vite inlines the chunk manifest so a lazy route can preload its own
    // dependencies on navigation. The vendor filename appears as a string,
    // but the browser does not fetch it before first paint.
    const source =
      'const m=__vite__mapDeps([0,1]);import("./vendor-stellar-b2.js").then(x=>x.default)';
    expect(entryStaticallyImportsVendor(source, 'vendor-stellar-b2.js')).toBe(false);
  });

  it('passes when the entry never mentions the vendor chunk', () => {
    expect(entryStaticallyImportsVendor('console.log("hello")', 'vendor-stellar-b2.js')).toBe(
      false,
    );
  });
});

describe('findStaticImports', () => {
  it('collects static import specifiers as basenames', () => {
    const source =
      'import{a}from"./vendor-N-1.js";import"./button-styles-2.js";import("./lazy-3.js")';
    expect(findStaticImports(source)).toEqual(new Set(['vendor-N-1.js', 'button-styles-2.js']));
  });
});
