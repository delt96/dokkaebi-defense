import {
  createMatch, enemyHp, laneOf, laneSeed, roundStartTick, step, stepMatch, type Enemy, type GameData, type GameState,
} from '@dorandi/logic';
import { forceRound, spawnEnemyForTest } from '@dorandi/logic/testing';
import { EconDriver } from './econDriver';
import type { EconPolicy } from './econBot';
import { configData, makeBot, SEATS, type EconConfig } from './econRun';

/** Normal rounds just after each boss and in between, where the board of a run is measured. */
export const FIREPOWER_ROUNDS = [5, 11, 15, 21, 25, 31, 35, 41, 45, 51, 55, 59, 61, 65, 69];
const SECONDS = 30;
const COUNT = 30;

/**
 * Damage per second the board deals in `SECONDS` against `COUNT` enemies of its round standing evenly spread on the
 * path; a killed enemy comes back at once in its place. Skills, executes, debuffs, auras and upgrades all count.
 */
export function boardFirepower(snapshot: GameState): number {
  const s = structuredClone(snapshot);
  const round = Math.max(1, s.round);
  forceRound(s, round);
  s.enemies = [];
  s.spawned = 1e9;
  s.roundEndTick = s.tick + 1e9;
  const wave = s.data.waves.find(w => w.round === round);
  const defId = wave?.type === 'normal' ? wave.pattern[0]! : 'japgwi';
  const perimeter = laneOf(s).perimeter;
  const spots = Array.from({ length: COUNT }, (_, i) => ((i + 0.5) * perimeter) / COUNT);
  let mine: Enemy[] = spots.map(d => spawnEnemyForTest(s, defId, d));
  let dealt = 0;
  for (let t = 0; t < SECONDS * 20; t++) {
    const before = mine.map(e => e.hp);
    step(s, []);
    mine = mine.map((e, i) => {
      const alive = e.hp > 0 && s.enemies.includes(e);
      dealt += before[i]! - (alive ? e.hp : 0);
      return alive ? e : spawnEnemyForTest(s, defId, spots[i]!);
    });
    // event enemies a round start may bring in are not part of the measure
    const keep = new Set(mine);
    s.enemies = s.enemies.filter(e => keep.has(e));
    mine.forEach((e, i) => { e.d = spots[i]!; });
  }
  return dealt / SECONDS;
}

/** Damage per second a normal round asks for: the HP of all its spawns over the round time (NaN on a boss round). */
export function roundNeed(data: GameData, round: number): number {
  const wave = data.waves.find(w => w.round === round);
  if (wave?.type !== 'normal') return NaN;
  const def = data.enemies.find(e => e.id === wave.pattern[0])!;
  return (data.balance.spawnCount * enemyHp(def, round, data.balance)) / data.balance.roundSeconds;
}

export interface FirepowerRow { config: string; bot: string; seed: number; seat: number; round: number; firepower: number; need: number; ratio: number }

/** One six-seat match of `c`; every live seat's board is measured as each of `rounds` starts. */
export function firepowerRun(data: GameData, seed: number, c: EconConfig, rounds: number[] = FIREPOWER_ROUNDS): FirepowerRow[] {
  const d = configData(data, c, seed);
  const match = createMatch(d, seed, SEATS, { noElimination: c.noDefeat, noGate: c.noDefeat });
  const policy: EconPolicy = { quests: c.quests > 0, tame: c.tame, jige: c.useJige, hunts: c.hunts !== false };
  const driver = new EconDriver(match, SEATS.map(s => makeBot(c.bot, laneSeed(seed, s), policy)), c.gamble);
  const at = new Map(rounds.filter(r => r <= d.balance.rounds).map(r => [roundStartTick(d, r), r]));
  const last = Math.max(...at.keys());
  const rows: FirepowerRow[] = [];
  while (match.result === null && match.tick <= last) {
    const round = at.get(match.tick);
    if (round !== undefined) {
      const need = roundNeed(d, round);
      for (const seat of SEATS) {
        if (!match.seats[seat]!.alive) continue;
        const firepower = boardFirepower(match.lanes[seat]!);
        rows.push({ config: c.name, bot: c.bot, seed, seat, round, firepower, need, ratio: firepower / need });
      }
    }
    stepMatch(match, driver.inputs());
  }
  return rows;
}

const median = (xs: number[]): number => {
  const a = [...xs].sort((p, q) => p - q);
  const m = a.length >> 1;
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
};

/** Median ratio (board firepower / round need) per round and config, with the number of live seats measured. */
export function firepowerMarkdown(rows: FirepowerRow[]): string {
  const configs = [...new Set(rows.map(r => r.config))];
  const rounds = [...new Set(rows.map(r => r.round))].sort((a, b) => a - b);
  const lines = [
    `| 라운드 | 요구 화력 | ${configs.join(' | ')} |`,
    `| ---: | ---: | ${configs.map(() => '---:').join(' | ')} |`,
  ];
  for (const round of rounds) {
    const need = rows.find(r => r.round === round)!.need;
    const cells = configs.map(c => {
      const xs = rows.filter(r => r.round === round && r.config === c).map(r => r.ratio);
      return xs.length ? `${median(xs).toFixed(2)} (${xs.length})` : '-';
    });
    lines.push(`| ${round} | ${need.toFixed(0)} | ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}
