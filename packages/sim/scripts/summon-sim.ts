import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGameData, dataSources, loadGameData, type GameData } from '@dorandi/logic';
import { assertKnownUnits, goal6, withNewUnits, type NewUnitOverlay } from '../src/stage3/newUnits';
import { summonMarkdown, summonReport } from '../src/stage3/summonSim';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const recipesFile = arg('recipes', '');
let data: GameData;
if (recipesFile) {
  const src = dataSources();
  src.stage3.recipes = JSON.parse(readFileSync(recipesFile, 'utf8'));
  data = buildGameData('stage3', src);
} else {
  data = loadGameData('stage3');
}
const overlayFile = arg('new-units', '');
if (overlayFile) data = withNewUnits(data, JSON.parse(readFileSync(overlayFile, 'utf8')) as NewUnitOverlay);
assertKnownUnits(data);

const report = summonReport(data, { runs: Number(arg('runs', '400')), length: Number(arg('length', '400')) });
const out = arg('out', 'sim-out/summon');
mkdirSync(out, { recursive: true });
const g = goal6(report);
const doc = summonMarkdown(report, data)
  + `\n## 목표 6\n\n가장 많이 고른 6등급 ${(g.topShare * 100).toFixed(1)}%, 5% 넘게 고른 6등급 ${g.over5pct}종: ${g.pass ? '통과' : '미달'}\n`;
writeFileSync(join(out, 'summon.md'), doc);
console.log(doc);
