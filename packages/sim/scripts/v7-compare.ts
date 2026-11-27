import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEconCsv, type EconRow } from '../src/stage3/econRun';
import { median } from '../src/stage3/report';

interface Pair<T> { before: T; after: T }
export interface EconComparison {
  seats: Pair<number>;
  completion: Pair<number>;
  defeatBins: Pair<Record<string, number>>;
  boss20: Pair<number | null>; boss40: Pair<number | null>; boss60: Pair<number | null>;
  firstGrade6: Pair<number | null>;
  boss60Change: number | null;
  completionChange: number;
  easier: boolean;
}

function bins(rows: EconRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows.filter(x => !x.finished)) {
    const lo = Math.floor((r.endRound - 1) / 10) * 10 + 1;
    const key = `${lo}~${lo + 9}`;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

// Only seats that have a value count, as in the v6 baseline table.
function med(rows: EconRow[], col: 'boss20' | 'boss40' | 'boss60' | 'firstGrade6Round'): number | null {
  return median(rows.map(r => r[col]).filter((v): v is number => v !== null));
}

export function compareEcon(before: EconRow[], after: EconRow[]): EconComparison {
  const rate = (rows: EconRow[]): number => (rows.length ? rows.filter(r => r.finished).length / rows.length : 0);
  const pair = <T>(f: (rows: EconRow[]) => T): Pair<T> => ({ before: f(before), after: f(after) });
  const boss60 = pair(r => med(r, 'boss60'));
  const completion = pair(rate);
  const boss60Change = boss60.before && boss60.after !== null ? (boss60.after - boss60.before) / boss60.before : null;
  const completionChange = completion.after - completion.before;
  return {
    seats: pair(r => r.length),
    completion,
    defeatBins: pair(bins),
    boss20: pair(r => med(r, 'boss20')), boss40: pair(r => med(r, 'boss40')), boss60,
    firstGrade6: pair(r => med(r, 'firstGrade6Round')),
    boss60Change, completionChange,
    easier: (boss60Change !== null && boss60Change < -0.15) || completionChange > 0.10,
  };
}

function load(dir: string): Map<string, EconRow[]> {
  const out = new Map<string, EconRow[]>();
  for (const f of readdirSync(dir).filter(n => /^econ-.*\.csv$/.test(n) && !n.endsWith('-yeoksin.csv')).sort()) {
    for (const r of parseEconCsv(readFileSync(join(dir, f), 'utf8'))) {
      const key = `${r.config} / ${r.bot}`;
      out.set(key, [...(out.get(key) ?? []), r]);
    }
  }
  return out;
}

const f1 = (v: number | null): string => (v === null ? '-' : v.toFixed(1));
const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
const binText = (b: Record<string, number>): string =>
  Object.entries(b).sort((a, c) => parseInt(a[0]) - parseInt(c[0])).map(([k, n]) => `${k}: ${n}`).join(', ');

function main(): void {
  const arg = (name: string): string => {
    const i = process.argv.indexOf(`--${name}`);
    if (i < 0 || !process.argv[i + 1]) throw new Error(`missing --${name}`);
    return process.argv[i + 1]!;
  };
  const before = load(arg('before')); const after = load(arg('after'));
  for (const key of [...before.keys()].sort()) {
    const b = before.get(key)!; const a = after.get(key);
    if (!a) { console.log(`${key}: no rows in --after`); continue; }
    const c = compareEcon(b, a);
    console.log(`## ${key}`);
    console.log(`seats ${c.seats.before} -> ${c.seats.after}`);
    console.log(`completion ${pct(c.completion.before)} -> ${pct(c.completion.after)} (${(c.completionChange * 100).toFixed(1)}pp)`);
    console.log(`defeat before: ${binText(c.defeatBins.before)}`);
    console.log(`defeat after:  ${binText(c.defeatBins.after)}`);
    console.log(`boss20 ${f1(c.boss20.before)} -> ${f1(c.boss20.after)}, boss40 ${f1(c.boss40.before)} -> ${f1(c.boss40.after)}, boss60 ${f1(c.boss60.before)} -> ${f1(c.boss60.after)}${c.boss60Change === null ? '' : ` (${(c.boss60Change * 100).toFixed(1)}%)`}`);
    console.log(`firstGrade6Round ${f1(c.firstGrade6.before)} -> ${f1(c.firstGrade6.after)}`);
    if (c.easier) console.log('크게 쉬워짐');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
