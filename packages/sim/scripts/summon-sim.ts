import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGameData, dataSources, loadGameData } from '@dorandi/logic';
import { summonMarkdown, summonReport } from '../src/stage3/summonSim';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const recipesFile = arg('recipes', '');
let data;
if (recipesFile) {
  const src = dataSources();
  src.stage3.recipes = JSON.parse(readFileSync(recipesFile, 'utf8'));
  data = buildGameData('stage3', src);
} else {
  data = loadGameData('stage3');
}

const report = summonReport(data, { runs: Number(arg('runs', '400')), length: Number(arg('length', '400')) });
const out = arg('out', 'sim-out/summon');
mkdirSync(out, { recursive: true });
const doc = summonMarkdown(report, data);
writeFileSync(join(out, 'summon.md'), doc);
console.log(doc);
