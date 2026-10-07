import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const manifest = JSON.parse(await readFile(join(dist, '.vite', 'manifest.json'), 'utf8'));
const entry = Object.values(manifest).find((item) => item.isEntry === true);

if (entry === undefined) throw new Error('Vite manifest has no application entry.');

const requiredRoutes = [
  'src/pages/JoinInvite.tsx',
  'src/pages/app/Dashboard.tsx',
  'src/pages/app/Groups.tsx',
  'src/pages/app/CreateGroup.tsx',
  'src/pages/app/GroupDetail.tsx',
  'src/pages/app/Activity.tsx',
  'src/pages/app/Settings.tsx',
  'src/pages/app/TransactionDetail.tsx',
];

for (const route of requiredRoutes) {
  if (manifest[route]?.isDynamicEntry !== true) {
    throw new Error(`${route} is not emitted as a lazy route chunk.`);
  }
}

const entryBytes = (await stat(join(dist, entry.file))).size;
// The unsplit baseline was 1.4 MB. Keep the entry below half that size so a
// future eager route import cannot quietly undo the reduction.
const entryLimit = 700 * 1024;
if (entryBytes > entryLimit) {
  throw new Error(`Entry chunk is ${entryBytes} bytes; expected at most ${entryLimit}.`);
}

const stellarChunk = Object.values(manifest).find((item) =>
  /assets\/stellar-[^/]+\.js$/.test(item.file),
);
if (stellarChunk === undefined || stellarChunk.file === entry.file) {
  throw new Error('Stellar dependencies were not isolated from the entry chunk.');
}

console.log(
  `Route splitting verified: ${requiredRoutes.length} lazy routes, ${entryBytes}-byte entry, Stellar isolated in ${stellarChunk.file}.`,
);
