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

const patternOf = (data: GameData, round: number): string[] | null => {
  const wave = data.waves.find(w => w.round === round);
  return wave?.type === 'normal' ? wave.pattern : null;
};

/** Every enemy a normal wave sends. */
export const normalKinds = (data: GameData): string[] =>
  [...new Set(data.waves.flatMap(w => (w.type === 'normal' ? w.pattern : [])))];

/**
 * Damage per second the board deals in `SECONDS` against `COUNT` enemies of `round` standing evenly spread on the path,
 * taken in turn from `pattern` (the round's own by default); a killed enemy comes back at once in its place.
 * Skills, executes, debuffs, auras and upgrades all count.
 */
export function boardFirepower(snapshot: GameState, round: number, pattern?: string[]): number {
  const kinds = pattern ?? patternOf(snapshot.data, round) ?? ['japgwi'];
  const s = structuredClone(snapshot);
  forceRound(s, round);
  s.enemies = [];
  s.spawned = 1e9;
  s.roundEndTick = s.tick + 1e9;
  const perimeter = laneOf(s).perimeter;
  const spots = Array.from({ length: COUNT }, (_, i) => ((i + 0.5) * perimeter) / COUNT);
  const ids = spots.map((_, i) => kinds[i % kinds.length]!);
  let mine: Enemy[] = spots.map((d, i) => spawnEnemyForTest(s, ids[i]!, d));
  let dealt = 0;
  for (let t = 0; t < SECONDS * 20; t++) {
    const before = mine.map(e => e.hp);
    step(s, []);
    mine = mine.map((e, i) => {
      const alive = e.hp > 0 && s.enemies.includes(e);
      dealt += before[i]! - (alive ? e.hp : 0);
      return alive ? e : spawnEnemyForTest(s, ids[i]!, spots[i]!);
    });
    // event enemies a round start may bring in are not part of the measure
    const keep = new Set(mine);
    s.enemies = s.enemies.filter(e => keep.has(e));
    mine.forEach((e, i) => { e.d = spots[i]!; });
  }
  return dealt / SECONDS;
}

/**
 * Damage per second a normal round asks for: the HP of its spawns, taken in turn from `pattern` (the round's own by
 * default), over the round time. NaN on a boss round without a pattern.
 */
export function roundNeed(data: GameData, round: number, pattern?: string[]): number {
  const kinds = pattern ?? patternOf(data, round);
  if (!kinds) return NaN;
  let hp = 0;
  for (let i = 0; i < data.balance.spawnCount; i++) {
    hp += enemyHp(data.enemies.find(e => e.id === kinds[i % kinds.length])!, round, data.balance);
  }
  return hp / data.balance.roundSeconds;
}

export interface RoundPlay { left: number; peak: number; hpLeftPct: number }

/**
 * Plays `round` from the board as the game does (spawn times, walking, slows, stuns) with the enemy limit off.
 * Enemies carried over from before and event enemies are left out, so only the board's own hold on the round shows:
 * the round's spawns still alive at its end, the most of them alive at once, and the share of their HP left.
 */
export function roundPlay(snapshot: GameState, round: number): RoundPlay {
  const s = structuredClone(snapshot);
  s.data.balance.limit = Infinity;
  delete s.data.balance.limitInstantFromRound;
  forceRound(s, round);
  const kinds = new Set(patternOf(s.data, round) ?? []);
  const ours = (e: Enemy) => e.round === round && kinds.has(e.defId);
  const end = s.roundEndTick;
  const maxHp = new Map<number, number>();
  let peak = 0;
  while (s.tick < end && s.phase === 'round') {
    step(s, []);
    s.enemies = s.enemies.filter(ours);
    for (const e of s.enemies) maxHp.set(e.id, e.maxHp);
    peak = Math.max(peak, s.enemies.filter(e => e.hp > 0).length);
  }
  const left = s.enemies.filter(e => e.hp > 0);
  const total = [...maxHp.values()].reduce((a, b) => a + b, 0);
  return { left: left.length, peak, hpLeftPct: total ? (100 * left.reduce((a, e) => a + e.hp, 0)) / total : 0 };
}

export interface BoardMeasure extends RoundPlay {
  firepower: number; need: number; ratio: number;
  /** The lowest ratio against a round of one normal enemy kind alone, and that kind. */
  weakest: number; weakestEnemy: string;
}

export function measureBoard(snapshot: GameState, round: number): BoardMeasure {
  const data = snapshot.data;
  const own = patternOf(data, round);
  const firepower = boardFirepower(snapshot, round);
  const need = roundNeed(data, round);
  let weakest = Infinity;
  let weakestEnemy = '';
  for (const kind of normalKinds(data)) {
    const alone = own?.length === 1 && own[0] === kind
      ? firepower / need
      : boardFirepower(snapshot, round, [kind]) / roundNeed(data, round, [kind]);
    if (alone < weakest) { weakest = alone; weakestEnemy = kind; }
  }
  return { firepower, need, ratio: firepower / need, weakest, weakestEnemy, ...roundPlay(snapshot, round) };
}

export interface FirepowerRow extends BoardMeasure { config: string; bot: string; seed: number; seat: number; round: number }

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
    // the lanes are still in the round before here: the round to measure is passed on, not read from them
    const round = at.get(match.tick);
    if (round !== undefined) {
      for (const seat of SEATS) {
        if (!match.seats[seat]!.alive) continue;
        rows.push({ config: c.name, bot: c.bot, seed, seat, round, ...measureBoard(match.lanes[seat]!, round) });
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

const mode = (xs: string[]): string => {
  const n = new Map<string, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]![0];
};

const pct = (part: number, all: number) => `${Math.round((100 * part) / all)}%`;

const BANDS: [number, number][] = [[0, 1], [1, 1.5], [1.5, 2], [2, 2.5], [2.5, 3], [3, Infinity]];

/**
 * Per round and config, over the live seats: the median ratio (board firepower / round need), the median ratio against
 * the weakest enemy kind with the kind most often weakest, and the median of the round's spawns left when the board
 * plays the round alone with the share of boards that cleared it. Then, over all rows, how the round play turns out
 * in each ratio band.
 */
export function firepowerMarkdown(rows: FirepowerRow[]): string {
  const configs = [...new Set(rows.map(r => r.config))];
  const rounds = [...new Set(rows.map(r => r.round))].sort((a, b) => a - b);
  const header = [`| 라운드 | 요구 화력 | ${configs.join(' | ')} |`, `| ---: | ---: | ${configs.map(() => '---:').join(' | ')} |`];
  const table = (title: string, cell: (xs: FirepowerRow[]) => string) => {
    const lines = [`### ${title}`, '', ...header];
    for (const round of rounds) {
      const need = rows.find(r => r.round === round)!.need;
      const cells = configs.map(c => {
        const xs = rows.filter(r => r.round === round && r.config === c);
        return xs.length ? cell(xs) : '-';
      });
      lines.push(`| ${round} | ${need.toFixed(0)} | ${cells.join(' | ')} |`);
    }
    return lines.join('\n');
  };
  const bands = ['### 배수 구간별 라운드 결과 (전체)', '', '| 배수 구간 | 판 수 | 남은 적 중앙값 | 다 잡은 판 |', '| --- | ---: | ---: | ---: |'];
  for (const [lo, hi] of BANDS) {
    const xs = rows.filter(r => r.ratio >= lo && r.ratio < hi);
    if (!xs.length) continue;
    const label = hi === Infinity ? `${lo} 이상` : `${lo}~${hi}`;
    bands.push(`| ${label} | ${xs.length} | ${median(xs.map(r => r.left))} | ${pct(xs.filter(r => r.left === 0).length, xs.length)} |`);
  }
  return [
    table('배수 (판 화력 ÷ 요구 화력), 괄호는 잰 자리 수', xs => `${median(xs.map(r => r.ratio)).toFixed(2)} (${xs.length})`),
    table('약한 적 배수 (한 종류만 나올 때 가장 낮은 배수)', xs => `${median(xs.map(r => r.weakest)).toFixed(2)} ${mode(xs.map(r => r.weakestEnemy))}`),
    table('혼자 그 라운드를 돌렸을 때 남은 적 (30마리 중), 다 잡은 판', xs =>
      `${median(xs.map(r => r.left))} · ${pct(xs.filter(r => r.left === 0).length, xs.length)}`),
    bands.join('\n'),
  ].join('\n\n');
}
