// Generates a ~100k-node JSON fixture for W2-Tue virtualization smoke
// testing. Gitignored output (benchmarks/dev-100k.json). Run:
//   npm run gen:100k
// then drag-drop the file onto the editor.
//
// Per-record shape produces ~12 FlatRows (object open/close + 5 leaves +
// nested meta with tags array). 100k records ≈ 1.2M flat rows total — well
// into the territory where virtualization is required.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const N = Number(process.env.N ?? 100_000);

const data = Array.from({ length: N }, (_, i) => ({
  id: i,
  name: `item-${i}`,
  active: i % 2 === 0,
  meta: {
    tags: [`t${i % 7}`, `t${i % 13}`],
    score: Math.round(Math.random() * 1000) / 10,
  },
}));

const outPath = join(__dirname, `dev-${N >= 1000 ? `${N / 1000}k` : N}.json`);
writeFileSync(outPath, JSON.stringify(data));
console.log(`Wrote ${N.toLocaleString()} records to ${outPath}`);
