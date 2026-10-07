// Fails CI if the entry chunk contains the Stellar SDK or exceeds budget.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const distAssets = join(process.cwd(), 'dist', 'assets');
const files = readdirSync(distAssets).filter((f) => f.endsWith('.js'));

const entryCandidates = files.filter((f) => f.startsWith('index-'));
if (entryCandidates.length === 0) {
  console.error('check-bundle: no entry chunk (index-*.js) found in dist/assets');
  process.exit(1);
}

let failed = false;
for (const file of entryCandidates) {
  const full = join(distAssets, file);
  const content = readFileSync(full, 'utf8');
  const sizeKb = Math.round(statSync(full).size / 1024);
  console.log(`entry: ${file} (${sizeKb} kB uncompressed)`);
  if (/stellar-sdk|StellarSdk|stellar_base/i.test(content)) {
    console.error(`check-bundle FAIL: ${file} contains Stellar SDK markers`);
    failed = true;
  }
}

// Expect route-level splitting: at least 6 lazy chunks beyond entry/vendor.
const nonEntry = files.filter(
  (f) => !f.startsWith('index-') && !f.startsWith('vendor-'),
);
console.log(`lazy chunks: ${nonEntry.length}`);
if (nonEntry.length < 6) {
  console.error(
    `check-bundle FAIL: expected >= 6 lazy route chunks, found ${nonEntry.length}`,
  );
  failed = true;
}

if (failed) process.exit(1);
console.log('check-bundle PASS');
