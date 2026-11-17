import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const assetsDirectory = fileURLToPath(new URL('../dist/assets/', import.meta.url));
const files = await readdir(assetsDirectory);
const measured = await Promise.all(
  files
    .filter((file) => /\.(?:js|css)$/.test(file))
    .map(async (file) => {
      const content = await readFile(join(assetsDirectory, file));
      return { file, gzipBytes: gzipSync(content).byteLength };
    }),
);

const totalBytes = measured.reduce((total, item) => total + item.gzipBytes, 0);
const largestBytes = Math.max(0, ...measured.map((item) => item.gzipBytes));
const totalBudgetBytes = 220 * 1024;
const chunkBudgetBytes = 120 * 1024;

for (const item of measured.toSorted((a, b) => b.gzipBytes - a.gzipBytes)) {
  console.log(`${item.file}: ${(item.gzipBytes / 1024).toFixed(1)} KiB gzip`);
}
console.log(`Total: ${(totalBytes / 1024).toFixed(1)} / 220 KiB gzip`);

if (totalBytes > totalBudgetBytes || largestBytes > chunkBudgetBytes) {
  console.error(
    `Bundle budget exceeded (largest chunk budget: ${chunkBudgetBytes / 1024} KiB gzip).`,
  );
  process.exitCode = 1;
}
