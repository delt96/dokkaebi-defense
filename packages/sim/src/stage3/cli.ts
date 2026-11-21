import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameData } from '@dorandi/logic';
import { normalBot } from '../bots';
import { combineGainAll, parseCombinePlacement } from './combineGain';
import { controlAll } from './control';
import { grade6Markdown, grade6Run, type Grade6Row } from './grade6';
import { combineGainMarkdown, controlMarkdown, toCsvRows } from './report';
import { targetBot } from './targetBot';

export function stage3Cli(arg: (name: string, fallback: string) => string): void {
  const check = arg('check', 'all');
  const seeds = Number(arg('seeds', '3'));
  const out = arg('out', 'sim-out/stage3');
  const data = loadGameData('stage3');
  mkdirSync(out, { recursive: true });
  const t0 = Date.now();
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  if (check === 'combine' || check === 'all') {
    const placement = parseCombinePlacement(arg('combine-place', 'fit'));
    const rows = combineGainAll(data, { seeds, placement });
    const file = join(out, placement === 'fit' ? 'combine.csv' : `combine-${placement}.csv`);
    writeFileSync(file, toCsvRows(rows));
    console.log(`## combine gain (seeds ${seeds}, placement ${placement}, ${elapsed()}, ${file})\n`);
    console.log(combineGainMarkdown(rows) + '\n');
  }
  if (check === 'control' || check === 'all') {
    const rows = controlAll(data, seeds);
    writeFileSync(join(out, 'control.csv'), toCsvRows(rows));
    console.log(`## lane boss stopped time (seeds ${seeds}, ${elapsed()}, ${join(out, 'control.csv')})\n`);
    console.log(controlMarkdown(rows) + '\n');
  }
  if (check === 'grade6' || check === 'all') {
    const runs = Number(arg('seeds', '20'));
    const noDefeat = arg('defeat', 'off') !== 'on';
    const rows: Grade6Row[] = [];
    for (let seed = 1; seed <= runs; seed++) {
      rows.push(grade6Run(data, seed, targetBot(seed), { noDefeat }));
      rows.push(grade6Run(data, seed, normalBot(), { noDefeat }));
    }
    const file = join(out, noDefeat ? 'grade6.csv' : 'grade6-defeat.csv');
    writeFileSync(file, toCsvRows(rows));
    console.log(`## first grade 6 round (seeds ${runs}, defeat ${noDefeat ? 'off' : 'on'}, ${elapsed()}, ${file})\n`);
    console.log(grade6Markdown(rows) + '\n');
  }
}
