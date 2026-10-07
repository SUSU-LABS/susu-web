#!/usr/bin/env node
/**
 * Fails if route-level code splitting (#24) regressed.
 *
 * Three assertions over the built output:
 *
 * 1. The `vendor-stellar` chunk exists — the manualChunks split that keeps the
 *    Stellar SDK in exactly one place.
 * 2. The entry chunk does not reference the `vendor-stellar` chunk — i.e. the
 *    SDK is not reachable from the initial module graph. `manualChunks`
 *    guarantees the SDK *lives* in `vendor-stellar`, so no reference from the
 *    entry means the browser never fetches it before first paint.
 * 3. The entry chunk stays under ENTRY_BUDGET_BYTES — the tripwire that makes
 *    a regression visible as a number, not a feeling.
 *
 * It also prints every emitted JS chunk with its size, so a human can see the
 * split at a glance.
 *
 * Usage: node scripts/check-bundle-size.mjs [directory]   (default: dist)
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';

// Measured: entry was 1,414,855 bytes before #24 and 28,607 bytes after.
// The budget leaves headroom for dependency updates; it is a regression
// tripwire, not a target. Anything near the old ~1.4 MB again means a heavy
// dependency crept back into the initial graph.
const ENTRY_BUDGET_BYTES = 100 * 1024;

/** Basename of the module script in dist/index.html — the entry chunk. */
export function findEntryAsset(html) {
  for (const tag of html.matchAll(/<script[^>]*>/g)) {
    if (!tag[0].includes('type="module"')) continue;
    const src = tag[0].match(/src="([^"]+)"/);
    if (src) return basename(src[1]);
  }
  throw new Error('no module script found in index.html');
}

/** The chunk the Stellar SDK is quarantined in, or undefined. */
export function findVendorStellarChunk(files) {
  return files.find((f) => f.includes('vendor-stellar') && f.endsWith('.js'));
}

/** Basenames of the chunks the entry statically imports — its initial graph. */
export function findStaticImports(entrySource) {
  const imports = new Set();
  // Static imports only: `import … from "./chunk.js"` (minified or not) and
  // side-effect `import "./chunk.js"`. Dynamic `import("./chunk.js")` (route
  // splitting) is deliberately excluded — those chunks are not fetched before
  // first paint. The negative lookahead rejects the dynamic form; the
  // optional clause tolerates minified `}from"` with no whitespace.
  const re = /\bimport(?!\s*\()([^"'()]*?from)?\s*["'](\.\/[^"']+\.js)["']/g;
  let match;
  while ((match = re.exec(entrySource)) !== null) imports.add(basename(match[2]));
  return imports;
}

export function entryStaticallyImportsVendor(entrySource, vendorBasename) {
  return findStaticImports(entrySource).has(vendorBasename);
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

async function main() {
  const dir = process.argv[2] ?? 'dist';
  const failures = [];

  const html = await readFile(join(dir, 'index.html'), 'utf8');
  const entryAsset = findEntryAsset(html);
  const assetFiles = (await readdir(join(dir, 'assets'))).filter((f) => f.endsWith('.js'));

  const sizes = new Map();
  for (const file of assetFiles) {
    sizes.set(file, (await stat(join(dir, 'assets', file))).size);
  }

  const vendorStellar = findVendorStellarChunk(assetFiles);
  if (!vendorStellar) {
    failures.push(
      'vendor-stellar chunk missing: the manualChunks split for @stellar/stellar-sdk is gone',
    );
  }

  const entrySize = sizes.get(entryAsset) ?? 0;
  if (entrySize > ENTRY_BUDGET_BYTES) {
    failures.push(
      `entry chunk ${entryAsset} is ${kb(entrySize)}, over the ${kb(ENTRY_BUDGET_BYTES)} budget`,
    );
  }

  if (vendorStellar) {
    const entrySource = await readFile(join(dir, 'assets', entryAsset), 'utf8');
    if (entryStaticallyImportsVendor(entrySource, vendorStellar)) {
      failures.push(
        `entry chunk statically imports ${vendorStellar}: the Stellar SDK is back in the initial graph`,
      );
    }
  }

  console.log('JS chunks in dist/assets (uncompressed):');
  for (const file of [...assetFiles].sort((a, b) => sizes.get(b) - sizes.get(a))) {
    const tag =
      file === entryAsset ? '  <-- entry' : file === vendorStellar ? '  <-- stellar vendor' : '';
    console.log(`  ${kb(sizes.get(file)).padStart(10)}  ${file}${tag}`);
  }
  console.log(`entry budget: ${kb(ENTRY_BUDGET_BYTES)}`);

  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL: ${failure}`);
    process.exit(1);
  }
  console.log('bundle-size check passed');
}

// Only run when invoked directly, so the pure helpers above can be imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
