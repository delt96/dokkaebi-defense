import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { r10Markdown, r10PairRun, r10Summary, type R10Pair } from './r10probe';
import { join } from 'node:path';
import { isDifficulty, loadGameData, stripEconomy, type GameData } from '@dorandi/logic';
import { normalBot } from '../bots';
import { combineGainAll, parseCombinePlacement, parseUpgradeLevels } from './combineGain';
import { controlAll } from './control';
import { grade6Markdown, grade6Run, type Grade6Row } from './grade6';
import { combineGainMarkdown, controlMarkdown, toCsvRows } from './report';
import { targetBot } from './targetBot';
import {
  ECON_BOTS, econMarkdown, econMatchRun, parseEconCsv, parseYeoksinCsv, STANDARD_CONFIGS,
  type EconBotKind, type EconConfig, type EconRow,
} from './econRun';

type Arg = (name: string, fallback: string) => string;

/**
 * A copy of the data with `path=value` overrides (comma separated, numbers only), e.g.
 * `--set balance.bossBuckwheat=3,balance.tokens.start=6`: for trying a balance lever without editing the JSON.
 */
export function withSets(data: GameData, sets: string): GameData {
  if (!sets) return data;
  const d = structuredClone(data);
  for (const item of sets.split(',')) {
    const [path, raw] = item.split('=');
    const keys = path!.split('.');
    let node = d as unknown as Record<string, unknown>;
    for (const k of keys.slice(0, -1)) node = node[k] as Record<string, unknown>;
    const last = keys[keys.length - 1]!;
    if (typeof node[last] !== 'number' || !Number.isFinite(Number(raw))) throw new Error(`--set ${item}: not a number field`);
    node[last] = Number(raw);
  }
  return d;
}

export function stage3Cli(arg: Arg): void {
  const check = arg('check', 'all');
  const seeds = Number(arg('seeds', '3'));
  const difficulty = arg('difficulty', 'normal');
  if (!isDifficulty(difficulty)) throw new Error('--difficulty easy|normal|hard');
  const out = arg('out', difficulty === 'normal' ? 'sim-out/stage3' : `sim-out/stage3-${difficulty}`);
  const data = withSets(loadGameData('stage3'), arg('set', ''));
  // Each probe creates its own lanes from this private data copy.
  data.balance.defaultDifficulty = difficulty;
  if (arg('set', '').split(',').some(item => item.startsWith('balance.tokens.perRound='))) {
    data.balance.difficulties![difficulty].tokensPerRound = data.balance.tokens.perRound;
  }
  mkdirSync(out, { recursive: true });
  const t0 = Date.now();
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  if (check === 'combine' || check === 'all') {
    const placement = parseCombinePlacement(arg('combine-place', 'fit'));
    const upgrades = parseUpgradeLevels(arg('upgrades', '0/0'));
    const rows = combineGainAll(data, { seeds, placement, upgrades });
    const skew = upgrades.physical || upgrades.magical ? `-u${upgrades.physical}-${upgrades.magical}` : '';
    const file = join(out, `${placement === 'fit' ? 'combine' : `combine-${placement}`}${skew}.csv`);
    writeFileSync(file, toCsvRows(rows));
    console.log(`## combine gain (seeds ${seeds}, placement ${placement}, upgrades ${upgrades.physical}/${upgrades.magical}, ${elapsed()}, ${file})\n`);
    console.log(combineGainMarkdown(rows) + '\n');
  }
  if (check === 'control' || check === 'all') {
    const rows = controlAll(data, seeds);
    writeFileSync(join(out, 'control.csv'), toCsvRows(rows));
    console.log(`## lane boss stopped time (seeds ${seeds}, ${elapsed()}, ${join(out, 'control.csv')})\n`);
    console.log(controlMarkdown(rows) + '\n');
  }
  if (check === 'grade6-lane' || check === 'all') {
    const runs = Number(arg('seeds', '20'));
    const noDefeat = arg('defeat', 'off') !== 'on';
    const lane = stripEconomy(data);
    const rows: Grade6Row[] = [];
    for (let seed = 1; seed <= runs; seed++) {
      rows.push(grade6Run(lane, seed, targetBot(seed), { noDefeat }));
      rows.push(grade6Run(lane, seed, normalBot(), { noDefeat }));
    }
    const file = join(out, noDefeat ? 'grade6.csv' : 'grade6-defeat.csv');
    writeFileSync(file, toCsvRows(rows));
    console.log(`## first grade 6 round, one lane, no economy (seeds ${runs}, defeat ${noDefeat ? 'off' : 'on'}, ${elapsed()}, ${file})\n`);
    console.log(grade6Markdown(rows) + '\n');
  }
  if (check === 'grade6') econGrade6(arg, data, out, elapsed);
  if (check === 'r10probe') {
    const seeds = Number(arg('seeds', '20'));
    const rows: R10Pair[] = [];
    for (let seed = 1; seed <= seeds; seed++) rows.push(...r10PairRun(data, seed));
    writeFileSync(join(out, 'r10probe.csv'), toCsvRows(rows));
    console.log(`## R10 paired tame probe (seeds ${seeds}, ${elapsed()}, ${join(out, 'r10probe.csv')})\n`);
    console.log(r10Markdown(r10Summary(rows)) + '\n');
  }
}

const onOff = (v: string) => v === 'on';

/** The configs a grade6 command line asks for: the standard matrix, or one config built from the switches. */
export function cliConfigs(arg: Arg): EconConfig[] {
  const noDefeat = arg('defeat', 'off') !== 'on';
  const bot = arg('bot', 'both');
  const bots: EconBotKind[] = bot === 'both' ? ['target', 'switch'] : bot === 'all' ? ECON_BOTS
    : bot.split(',').map(b => (ECON_BOTS.includes(b as EconBotKind) ? b as EconBotKind : 'target'));
  let configs: EconConfig[];
  if (onOff(arg('matrix', 'off'))) {
    configs = STANDARD_CONFIGS.filter(c => bots.includes(c.bot));
  } else {
    const q = Number(arg('quests', '4'));
    const x = {
      market: onOff(arg('market', 'on')), quests: (q === 0 || q === 2 ? q : 4) as 0 | 2 | 4,
      tame: onOff(arg('tame', 'on')), useJige: onOff(arg('jige', 'on')), hunts: onOff(arg('hunts', 'on')),
    };
    const tag = `m${+x.market}-q${x.quests}-t${+x.tame}-j${+x.useJige}${x.hunts ? '' : '-h0'}`;
    configs = bots.map(b => ({ name: `${b}-${tag}`, bot: b, noDefeat: false, ...x }));
  }
  const only = arg('config', '');
  if (only) configs = configs.filter(c => only.split(',').includes(c.name));
  return configs.map(c => ({ ...c, noDefeat }));
}

export const csvName = (c: { name: string; noDefeat: boolean }): string => `econ-${c.name}${c.noDefeat ? '' : '-defeat'}`;

/**
 * Six-seat first grade 6 measurement. `--report on` re-reads the CSVs a previous run (or several parallel runs split
 * with `--config`) wrote, instead of playing.
 */
function econGrade6(arg: Arg, data: GameData, out: string, elapsed: () => string): void {
  const configs = cliConfigs(arg);
  const noDefeat = arg('defeat', 'off') !== 'on';
  const rows: EconRow[] = [];
  const yeoksin: (number | null)[][] = [];
  if (onOff(arg('report', 'off'))) {
    for (const c of configs) {
      const file = join(out, `${csvName(c)}.csv`);
      if (!existsSync(file)) continue;
      rows.push(...parseEconCsv(readFileSync(file, 'utf8')));
      const yf = join(out, `${csvName(c)}-yeoksin.csv`);
      if (existsSync(yf)) yeoksin.push(...parseYeoksinCsv(readFileSync(yf, 'utf8')));
    }
  } else {
    const seeds = Number(arg('seeds', '20'));
    for (const c of configs) {
      const cr: EconRow[] = [];
      const cy: (number | null)[][] = [];
      for (let seed = 1; seed <= seeds; seed++) {
        const r = econMatchRun(data, seed, c);
        cr.push(...r.rows);
        cy.push(r.yeoksinSeconds);
      }
      writeFileSync(join(out, `${csvName(c)}.csv`), toCsvRows(cr));
      const yrows = cy.map((t, i) => ({ seed: i + 1, ...Object.fromEntries(t.map((v, j) => [`stage${j + 1}`, v])) }));
      writeFileSync(join(out, `${csvName(c)}-yeoksin.csv`), toCsvRows(yrows));
      console.error(`${c.name}: ${seeds} seeds done (${elapsed()})`);
      rows.push(...cr);
      yeoksin.push(...cy);
    }
  }
  console.log(`## first grade 6 in six-seat matches (defeat ${noDefeat ? 'off' : 'on'}, ${elapsed()}, ${out}/econ-*.csv)\n`);
  console.log(econMarkdown(rows, yeoksin, data) + '\n');
}
