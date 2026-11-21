import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameData } from '@dorandi/logic';
import { combineGainAll } from './combineGain';
import { controlAll } from './control';
import { combineGainMarkdown, controlMarkdown, toCsvRows } from './report';

export function stage3Cli(arg: (name: string, fallback: string) => string): void {
  const check = arg('check', 'all');
  const seeds = Number(arg('seeds', '3'));
  const out = arg('out', 'sim-out/stage3');
  const data = loadGameData('stage3');
  mkdirSync(out, { recursive: true });
  const t0 = Date.now();
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  if (check === 'combine' || check === 'all') {
    const rows = combineGainAll(data, { seeds });
    writeFileSync(join(out, 'combine.csv'), toCsvRows(rows));
    console.log(`## combine gain (seeds ${seeds}, ${elapsed()}, ${join(out, 'combine.csv')})\n`);
    console.log(combineGainMarkdown(rows) + '\n');
  }
  if (check === 'control' || check === 'all') {
    const rows = controlAll(data, seeds);
    writeFileSync(join(out, 'control.csv'), toCsvRows(rows));
    console.log(`## lane boss stopped time (seeds ${seeds}, ${elapsed()}, ${join(out, 'control.csv')})\n`);
    console.log(controlMarkdown(rows) + '\n');
  }
  if (check === 'grade6' || check === 'all') {
    console.log('## first grade 6 round: not implemented yet\n');
  }
}
