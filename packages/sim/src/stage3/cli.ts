import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameData, stripEconomy, type GameData } from '@dorandi/logic';
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

export function stage3Cli(arg: Arg): void {
  const check = arg('check', 'all');
  const seeds = Number(arg('seeds', '3'));
  const out = arg('out', 'sim-out/stage3');
  const data = loadGameData('stage3');
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
      story: onOff(arg('story', 'on')), tame: onOff(arg('tame', 'on')), transfer: onOff(arg('transfer', 'on')),
    };
    const tag = `m${+x.market}-q${x.quests}-s${+x.story}-t${+x.tame}-x${+x.transfer}`;
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
