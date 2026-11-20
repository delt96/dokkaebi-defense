import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGameData } from '@dorandi/logic';
import { goldenRun, type GoldenResult } from '../src/golden';

const data = loadGameData();
const out: Record<string, GoldenResult> = {};
for (const bot of ['normal', 'clumsy'] as const) {
  for (let seed = 1; seed <= 5; seed++) out[`${bot}:${seed}`] = goldenRun(data, seed, bot);
}
const path = fileURLToPath(new URL('../test/golden-stage1.json', import.meta.url));
writeFileSync(path, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${Object.keys(out).length} entries to ${path}`);
