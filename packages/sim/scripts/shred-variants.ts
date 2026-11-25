import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGame, laneOf, loadGameData, shopItem, type Effect, type GameData, type UnitDef } from '@dorandi/logic';
import { STANDARD_CONFIGS } from '../src/stage3/econRun';
import { bossCsvRows, firepowerCsvRows, firepowerRun, type BossRow, type FirepowerRow, type ItemRow } from '../src/stage3/firepower';
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

const amount = (u: UnitDef) => {
  for (const s of u.skills) for (const e of s.effects) if (isShred(e)) (e as { pct: number }).pct = Math.round((e as { pct: number }).pct * 160) / 100;
};
const duration = (u: UnitDef) => { for (const s of u.skills) for (const e of s.effects) if (e.kind === 'vuln') e.seconds *= 4; };
// 1.5 matches balance.auraRadius; buk already weakens everyone in its range through its aura
const area = (u: UnitDef) => { for (const s of u.skills) for (const e of s.effects) if (e.kind === 'vuln') e.radius = 1.5; };

/** Matches MELEE_MAX_RANGE in src/bots.ts: melee units stand on edge cells, the rest inside. */
const MELEE_MAX_RANGE = 2.0;

/** Path length in reach of `range`, averaged over the cells a unit of that range stands on. */
function meanReach(data: GameData, range: number): number {
  const lane = laneOf(createGame(data, 1));
  const cells = lane.cells.filter(c => c.isEdge === (range <= MELEE_MAX_RANGE));
  return cells.reduce((a, c) => a + lane.coverageLength(c.index, range), 0) / cells.length;
}

const VARIANTS: Record<string, (u: UnitDef, data: GameData) => void> = {
  base: () => {},
  amount,
  duration,
  range: u => { u.range += 1; },
  always: vulnOnEveryHit,
  'amount-duration': u => { amount(u); duration(u); },
  area,
  'area-amount-duration': u => { area(u); amount(u); duration(u); },
  // range +1 with the attack cut by the reach it gains, so a lap deals about the same damage
  'range-dps': (u, data) => {
    const gain = meanReach(data, u.range + 1) / meanReach(data, u.range);
    u.range += 1;
    u.factor = Math.round((u.factor / gain) * 1000) / 1000;
  },
};

function variantData(data: GameData, name: string): GameData {
  const patch = VARIANTS[name];
  if (!patch) throw new Error(`--variant ${name}: one of ${Object.keys(VARIANTS).join(', ')}`);
  const d = structuredClone(data);
  for (const id of SHREDDERS) patch(d.units.find(u => u.id === id)!, data);
  return d;
}

const variant = arg('variant', 'base');
const bot = arg('bot', 'switch');
const seeds = Number(arg('seeds', '30'));
const shred = arg('shred', 'off') === 'on';
const out = arg('out', 'sim-out/shred-variants');
const data = variantData(loadGameData('stage3'), variant);
const item = arg('item', '');
const shop = item ? shopItem(data, item) : undefined;
if (item && !shop) throw new Error(`--item ${item}: one of ${data.economy?.shop?.items.map(i => i.id).join(', ')}`);
const price = shop ? Number(arg('price', String(shop.coins))) : 0;
if (shop) {
  if (!Number.isInteger(price) || price <= 0) throw new Error(`--price ${price}: a positive whole number`);
  shop.coins = price;
}
if (arg('show', 'off') === 'on') {
  for (const id of SHREDDERS) console.log(JSON.stringify(data.units.find(u => u.id === id)));
  process.exit(0);
}
const base = STANDARD_CONFIGS.find(x => x.name === `${bot}-full-q2`)!;
const c = {
  ...base, noDefeat: false, shred, ...(shop ? { item } : {}),
  name: `${base.name}${shred ? '-shred' : ''}-${variant}${shop ? `-${item}${price}` : ''}`,
};
const rows: FirepowerRow[] = [];
const bosses: BossRow[] = [];
const items: ItemRow[] = [];
for (let seed = 1; seed <= seeds; seed++) {
  const run = firepowerRun(data, seed, c, [59]);
  rows.push(...run.rows);
  bosses.push(...run.bosses);
  items.push(...run.items);
}
mkdirSync(out, { recursive: true });
const file = join(out, `${c.name}.csv`);
writeFileSync(file, toCsvRows(firepowerCsvRows(rows)));
writeFileSync(file.replace(/\.csv$/, '-boss.csv'), toCsvRows(bossCsvRows(bosses)));
writeFileSync(file.replace(/\.csv$/, '-items.csv'), toCsvRows(items));
const killed = (b: number) => bosses.filter(x => x.boss === b && x.actual === 'killed').length;
const reached = (b: number) => bosses.filter(x => x.boss === b).length;
console.log(`${c.name}: reached 60R ${reached(60)}, killed 60R ${killed(60)}, reached 70R ${reached(70)}, cleared ${killed(70)} (of ${seeds * 6})`);
