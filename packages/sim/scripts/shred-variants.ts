import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameData, type Effect, type GameData, type UnitDef } from '@dorandi/logic';
import { STANDARD_CONFIGS } from '../src/stage3/econRun';
import { bossCsvRows, firepowerCsvRows, firepowerRun, type BossRow, type FirepowerRow } from '../src/stage3/firepower';
import { toCsvRows } from '../src/stage3/report';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

/** The four grade 5 shredders the shred policy builds. */
const SHREDDERS = ['gireumteul', 'buk', 'yaktanggi', 'manggeon'];
const isShred = (e: Effect) => e.kind === 'vuln' || e.kind === 'auraEnemyVuln';

/** Puts every vuln of `u` in a skill of its own that fires on every attack; the other effects keep their trigger. */
function vulnOnEveryHit(u: UnitDef): void {
  const moved: Effect[] = [];
  for (const s of u.skills) {
    if (s.trigger.kind === 'aura') continue;
    moved.push(...s.effects.filter(e => e.kind === 'vuln'));
    s.effects = s.effects.filter(e => e.kind !== 'vuln');
  }
  u.skills = u.skills.filter(s => s.effects.length > 0);
  if (moved.length) u.skills.push({ trigger: { kind: 'always' }, effects: moved });
}

const VARIANTS: Record<string, (u: UnitDef) => void> = {
  base: () => {},
  amount: u => { for (const s of u.skills) for (const e of s.effects) if (isShred(e)) (e as { pct: number }).pct = Math.round((e as { pct: number }).pct * 160) / 100; },
  duration: u => { for (const s of u.skills) for (const e of s.effects) if (e.kind === 'vuln') e.seconds *= 4; },
  range: u => { u.range += 1; },
  always: vulnOnEveryHit,
};

function variantData(data: GameData, name: string): GameData {
  const patch = VARIANTS[name];
  if (!patch) throw new Error(`--variant ${name}: one of ${Object.keys(VARIANTS).join(', ')}`);
  const d = structuredClone(data);
  for (const id of SHREDDERS) patch(d.units.find(u => u.id === id)!);
  return d;
}

const variant = arg('variant', 'base');
const bot = arg('bot', 'switch');
const seeds = Number(arg('seeds', '30'));
const shred = arg('shred', 'off') === 'on';
const out = arg('out', 'sim-out/shred-variants');
const data = variantData(loadGameData('stage3'), variant);
if (arg('show', 'off') === 'on') {
  for (const id of SHREDDERS) console.log(JSON.stringify(data.units.find(u => u.id === id)));
  process.exit(0);
}
const base = STANDARD_CONFIGS.find(x => x.name === `${bot}-full-q2`)!;
const c = { ...base, noDefeat: false, shred, name: `${base.name}${shred ? '-shred' : ''}-${variant}` };
const rows: FirepowerRow[] = [];
const bosses: BossRow[] = [];
for (let seed = 1; seed <= seeds; seed++) {
  const run = firepowerRun(data, seed, c, [59]);
  rows.push(...run.rows);
  bosses.push(...run.bosses);
}
mkdirSync(out, { recursive: true });
const file = join(out, `${c.name}.csv`);
writeFileSync(file, toCsvRows(firepowerCsvRows(rows)));
writeFileSync(file.replace(/\.csv$/, '-boss.csv'), toCsvRows(bossCsvRows(bosses)));
const killed = (b: number) => bosses.filter(x => x.boss === b && x.actual === 'killed').length;
const reached = (b: number) => bosses.filter(x => x.boss === b).length;
console.log(`${c.name}: reached 60R ${reached(60)}, killed 60R ${killed(60)}, reached 70R ${reached(70)}, cleared ${killed(70)} (of ${seeds * 6})`);
