import {
  createMatch, enemyHp, laneOf, laneSeed, roundStartTick, step, stepMatch, TICKS_PER_SECOND, vulnOf,
  type BossStatus, type DamageType, type Enemy, type GameData, type GameEvent, type GameState,
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
 * Weakening (capped by vulnCap) on the enemy as the board's hits of each damage type land on it, weighed by their
 * damage; null when no hit of that type landed.
 */
export interface Shred { physical: number | null; magical: number | null }

class ShredMeter {
  private readonly sum: Record<DamageType, number> = { physical: 0, magical: 0 };
  private readonly weight: Record<DamageType, number> = { physical: 0, magical: 0 };
  private readonly typeOf: Map<string, DamageType>;
  private on = new Map<number, Record<DamageType, number>>();
  constructor(data: GameData) { this.typeOf = new Map(data.units.map(u => [u.id, u.damageType])); }
  /** Before a tick: the weakening on each enemy the board may hit. */
  look(s: GameState, enemies: Enemy[]): void {
    this.on = new Map(enemies.map(e => [e.id, { physical: vulnOf(s, e, 'physical'), magical: vulnOf(s, e, 'magical') }]));
  }
  /** After the tick: that weakening, weighed by the damage of its type that landed. */
  hits(events: GameEvent[]): void {
    for (const ev of events) {
      if (ev.type !== 'damage') continue;
      const on = this.on.get(ev.enemyId);
      const type = this.typeOf.get(ev.source);
      if (!on || !type) continue;
      this.sum[type] += ev.amount * on[type];
      this.weight[type] += ev.amount;
    }
  }
  get value(): Shred {
    const of = (t: DamageType) => (this.weight[t] ? this.sum[t] / this.weight[t] : null);
    return { physical: of('physical'), magical: of('magical') };
  }
}

/** boardFirepower with the weakening the board keeps on the standing enemies. */
export function standOff(snapshot: GameState, round: number, pattern?: string[]): { dps: number; shred: Shred } {
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
  const shred = new ShredMeter(s.data);
  for (let t = 0; t < SECONDS * 20; t++) {
    const before = mine.map(e => e.hp);
    shred.look(s, mine);
    shred.hits(step(s, []).events);
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
  return { dps: dealt / SECONDS, shred: shred.value };
}

/**
 * Damage per second the board deals in `SECONDS` against `COUNT` enemies of `round` standing evenly spread on the path,
 * taken in turn from `pattern` (the round's own by default); a killed enemy comes back at once in its place.
 * Skills, executes, debuffs, auras and upgrades all count.
 */
export function boardFirepower(snapshot: GameState, round: number, pattern?: string[]): number {
  return standOff(snapshot, round, pattern).dps;
}

/** The first boss round after `round`, null after the last. */
export function nextBoss(data: GameData, round: number): number | null {
  const rounds = data.waves.filter(w => w.type === 'boss' && w.round > round).map(w => w.round);
  return rounds.length ? Math.min(...rounds) : null;
}

export interface BossPlay { boss: number; killSeconds: number | null; hpLeftPct: number; shred: Shred }

/**
 * Plays boss round `bossRound` with the board as the game does: the boss walks the path and takes stuns and knockbacks
 * under the boss caps. Other enemies are left out. When the boss falls in the round time, the seconds it took.
 */
export function bossPlay(snapshot: GameState, bossRound: number): BossPlay {
  const s = structuredClone(snapshot);
  s.data.balance.limit = Infinity;
  delete s.data.balance.limitInstantFromRound;
  forceRound(s, bossRound);
  const start = s.tick;
  const end = s.roundEndTick;
  const shred = new ShredMeter(s.data);
  let boss: Enemy | undefined;
  while (s.tick < end && s.phase === 'round') {
    shred.look(s, s.enemies);
    shred.hits(step(s, []).events);
    s.enemies = s.enemies.filter(e => e.boss);
    boss ??= s.enemies[0];
    if (!boss) continue;
    if (boss.hp <= 0 || !s.enemies.includes(boss)) {
      return { boss: bossRound, killSeconds: (s.tick - 1 - start) / TICKS_PER_SECOND, hpLeftPct: 0, shred: shred.value };
    }
  }
  return { boss: bossRound, killSeconds: null, hpLeftPct: boss ? (100 * boss.hp) / boss.maxHp : 100, shred: shred.value };
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
  /** The ratio against a round of each normal enemy kind alone. */
  alone: Record<string, number>;
  /** The lowest of `alone`, and its kind. */
  weakest: number; weakestEnemy: string;
  /** The weakening kept on the standing japgwi, whose physical and magical resists are alike. */
  shred: Shred;
  /** The next boss played with the board; null after the last boss. */
  boss: BossPlay | null;
}

export function measureBoard(snapshot: GameState, round: number): BoardMeasure {
  const data = snapshot.data;
  const own = patternOf(data, round);
  const mixed = standOff(snapshot, round);
  const need = roundNeed(data, round);
  const alone: Record<string, number> = {};
  let shred = mixed.shred;
  let weakest = Infinity;
  let weakestEnemy = '';
  for (const kind of normalKinds(data)) {
    const r = own?.length === 1 && own[0] === kind ? mixed : standOff(snapshot, round, [kind]);
    alone[kind] = r.dps / roundNeed(data, round, [kind]);
    if (kind === 'japgwi') shred = r.shred;
    if (alone[kind] < weakest) { weakest = alone[kind]; weakestEnemy = kind; }
  }
  const bossRound = nextBoss(data, round);
  return {
    firepower: mixed.dps, need, ratio: mixed.dps / need, alone, weakest, weakestEnemy, shred,
    ...roundPlay(snapshot, round), boss: bossRound === null ? null : bossPlay(snapshot, bossRound),
  };
}

export interface FirepowerRow extends BoardMeasure { config: string; bot: string; seed: number; seat: number; round: number }

export interface BossRow extends BossPlay {
  config: string; bot: string; seed: number; seat: number;
  /** What the seat did with this boss in the run itself (killed, tamed, failed); null when the run never got to it. */
  actual: BossStatus | null;
  /** When the seat killed it in the run; null unless killed. */
  actualKillSeconds: number | null;
}

export interface FirepowerRunResult { rows: FirepowerRow[]; bosses: BossRow[] }

const bossRoundsOf = (data: GameData) => data.waves.filter(w => w.type === 'boss').map(w => w.round);

/**
 * One six-seat match of `c`. Every live seat's board is measured as each of `rounds` starts, and plays each of
 * `bossRounds` with the board that boss round starts with; the run goes on through those boss rounds to tell whether
 * the seat killed the boss itself.
 */
export function firepowerRun(
  data: GameData, seed: number, c: EconConfig, rounds: number[] = FIREPOWER_ROUNDS, bossRounds: number[] = bossRoundsOf(data),
): FirepowerRunResult {
  const d = configData(data, c, seed);
  const match = createMatch(d, seed, SEATS, { noElimination: c.noDefeat, noGate: c.noDefeat });
  const policy: EconPolicy = { quests: c.quests > 0, tame: c.tame, jige: c.useJige, hunts: c.hunts !== false, shred: c.shred === true, range: c.range === true };
  const driver = new EconDriver(match, SEATS.map(s => makeBot(c.bot, laneSeed(seed, s), policy)), c.gamble);
  const at = new Map(rounds.filter(r => r <= d.balance.rounds).map(r => [roundStartTick(d, r), r]));
  const bossAt = new Map(bossRounds.map(r => [roundStartTick(d, r), r]));
  const bossEnd = (r: number) => roundStartTick(d, r) + Math.round(d.balance.bossRoundSeconds * TICKS_PER_SECOND);
  const last = Math.max(-1, ...at.keys(), ...bossRounds.map(bossEnd));
  const rows: FirepowerRow[] = [];
  const bosses: BossRow[] = [];
  while (match.result === null && match.tick <= last) {
    // the lanes are still in the round before here: the round to measure is passed on, not read from them
    const round = at.get(match.tick);
    const boss = bossAt.get(match.tick);
    for (const seat of SEATS) {
      if (!match.seats[seat]!.alive) continue;
      const lane = match.lanes[seat]!;
      if (round !== undefined) rows.push({ config: c.name, bot: c.bot, seed, seat, round, ...measureBoard(lane, round) });
      if (boss !== undefined) bosses.push({ config: c.name, bot: c.bot, seed, seat, ...bossPlay(lane, boss), actual: null, actualKillSeconds: null });
    }
    stepMatch(match, driver.inputs());
  }
  for (const b of bosses) {
    b.actual = match.seats[b.seat]!.bosses[b.boss]?.status ?? null;
    b.actualKillSeconds = b.actual === 'killed' ? match.lanes[b.seat]!.stats.find(x => x.round === b.boss)?.bossKillSeconds ?? null : null;
  }
  return { rows, bosses };
}

/** Rows for toCsvRows with the shred spread into plain columns. */
export function bossCsvRows(bosses: BossRow[]): Record<string, unknown>[] {
  return bosses.map(({ shred, ...b }) => ({ ...b, shredPhysical: shred.physical, shredMagical: shred.magical }));
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

/** Rows for toCsvRows: the per-kind ratios, the shred and the boss play spread into plain columns. */
export function firepowerCsvRows(rows: FirepowerRow[]): Record<string, unknown>[] {
  return rows.map(({ alone, shred, boss, ...r }) => ({
    ...r,
    ...Object.fromEntries(Object.entries(alone).map(([k, v]) => [`vs_${k}`, v])),
    shredPhysical: shred.physical, shredMagical: shred.magical,
    boss: boss?.boss ?? null, bossKillSeconds: boss?.killSeconds ?? null, bossHpLeftPct: boss?.hpLeftPct ?? null,
    bossShredPhysical: boss?.shred.physical ?? null, bossShredMagical: boss?.shred.magical ?? null,
  }));
}

const f2 = (x: number) => x.toFixed(2);

function bossCell(xs: FirepowerRow[]): string {
  const plays = xs.map(r => r.boss).filter((b): b is BossPlay => b !== null);
  if (!plays.length) return '-';
  const killed = plays.filter(b => b.killSeconds !== null);
  const seconds = median(plays.map(b => b.killSeconds ?? Infinity));
  const how = Number.isFinite(seconds) ? `${seconds.toFixed(0)}초` : `못 잡음 (체력 ${median(plays.map(b => b.hpLeftPct)).toFixed(0)}% 남음)`;
  return `${plays[0]!.boss}R ${how} · 잡은 판 ${pct(killed.length, plays.length)}`;
}

const shredOf = (shreds: Shred[]) => (['physical', 'magical'] as const).map(t => {
  const v = shreds.map(x => x[t]).filter((x): x is number => x !== null);
  return v.length ? f2(median(v)) : '-';
}).join(' / ');

function shredCell(xs: FirepowerRow[]): string {
  const plays = xs.map(r => r.boss).filter((b): b is BossPlay => b !== null);
  return `${shredOf(xs.map(r => r.shred))} · ${plays.length ? shredOf(plays.map(b => b.shred)) : '-'}`;
}

/**
 * One table per config, a row per round over the live seats (medians): the ratio (board firepower / round need), the
 * ratio against japgwi alone, the weakest kind, the shred on the crowd and on the next boss, the round's spawns left
 * when the board plays the round alone, and the next boss. Then how the round play turns out in each ratio band, and
 * each boss played with the board its round starts with next to how often the run itself killed it.
 * `data` gives the enemy names and boss HP; without it the ids show.
 */
export function firepowerMarkdown(rows: FirepowerRow[], data?: GameData, bosses: BossRow[] = []): string {
  const name = (id: string) => data?.enemies.find(e => e.id === id)?.name ?? id;
  const enemyOf = (round: number) => {
    const p = data ? patternOf(data, round) : null;
    if (!p) return '-';
    return new Set(p).size > 1 ? '섞임' : name(p[0]!);
  };
  const bossHp = (round: number) => {
    const wave = data?.waves.find(w => w.round === round);
    const hp = wave?.type === 'boss' ? data!.enemies.find(e => e.id === wave.boss)?.hp : undefined;
    return hp === undefined ? '-' : String(hp);
  };
  const out: string[] = [];
  for (const config of [...new Set([...rows, ...bosses].map(r => r.config))]) {
    const mine = rows.filter(r => r.config === config);
    const theirs = bosses.filter(b => b.config === config);
    const lines = [`### ${config}`];
    if (mine.length) lines.push(
      '',
      '| 라운드 | 적 | 요구 화력 | 배수 | 잡귀 | 약한 적 | 물깎 / 마깎 (무리 · 보스) | 남은 적 | 다음 보스 |',
      '| ---: | --- | ---: | ---: | ---: | --- | --- | --- | --- |',
    );
    for (const round of [...new Set(mine.map(r => r.round))].sort((a, b) => a - b)) {
      const xs = mine.filter(r => r.round === round);
      const japgwi = xs.map(r => r.alone.japgwi).filter((x): x is number => x !== undefined);
      lines.push([
        '', round, enemyOf(round), xs[0]!.need.toFixed(0),
        `${f2(median(xs.map(r => r.ratio)))} (${xs.length})`,
        japgwi.length ? f2(median(japgwi)) : '-',
        `${f2(median(xs.map(r => r.weakest)))} ${name(mode(xs.map(r => r.weakestEnemy)))}`,
        shredCell(xs),
        `${median(xs.map(r => r.left))} (${pct(xs.filter(r => r.left === 0).length, xs.length)})`,
        bossCell(xs), '',
      ].join(' | ').trim());
    }
    if (mine.length) lines.push('', '| 배수 구간 | 판 수 | 남은 적 중앙값 | 다 잡은 판 |', '| --- | ---: | ---: | ---: |');
    for (const [lo, hi] of mine.length ? BANDS : []) {
      const xs = mine.filter(r => r.ratio >= lo && r.ratio < hi);
      if (!xs.length) continue;
      const label = hi === Infinity ? `${lo} 이상` : `${lo}~${hi}`;
      lines.push(`| ${label} | ${xs.length} | ${median(xs.map(r => r.left))} | ${pct(xs.filter(r => r.left === 0).length, xs.length)} |`);
    }
    if (theirs.length) lines.push(
      '', '보스 라운드가 시작할 때의 판으로 그 보스를 돌린 결과와, 같은 자리가 실제 판에서 그 보스를 잡거나 길들인 비율.', '',
      '| 보스 | 체력 | 잡은 판 | 처치 시간 | 못 잡은 판 남은 체력 | 물깎 / 마깎 | 실제 잡음 / 길들임 |',
      '| ---: | ---: | ---: | ---: | ---: | --- | ---: |',
    );
    for (const boss of [...new Set(theirs.map(b => b.boss))].sort((a, b) => a - b)) {
      const xs = theirs.filter(b => b.boss === boss);
      const killed = xs.filter(b => b.killSeconds !== null);
      const missed = xs.filter(b => b.killSeconds === null);
      lines.push([
        '', boss, bossHp(boss), `${pct(killed.length, xs.length)} (${xs.length})`,
        killed.length ? `${median(killed.map(b => b.killSeconds!)).toFixed(0)}초` : '-',
        missed.length ? `${median(missed.map(b => b.hpLeftPct)).toFixed(0)}%` : '-',
        shredOf(xs.map(b => b.shred)),
        `${pct(xs.filter(b => b.actual === 'killed').length, xs.length)} / ${pct(xs.filter(b => b.actual === 'tamed').length, xs.length)}`, '',
      ].join(' | ').trim());
    }
    out.push(lines.join('\n'));
  }
  return out.join('\n\n');
}
