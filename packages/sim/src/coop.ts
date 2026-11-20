import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  boardDps, countNormalEnemies, createMatch, laneSeed, loadGameData, matchHash, roundStartTick, stepMatch, unitDefFast,
  type GameData, type GameState, type InputLogEntry, type MatchCommand, type MatchInput, type MatchOptions, type MatchState,
} from '@dorandi/logic';
import { clumsyBot, normalBot, type Bot } from './bots';

export type BotKind = 'normal' | 'clumsy';

const DECIDE_EVERY = 10;
const HASH_EVERY = 100;
const MAX_TICKS = 200_000;

export function spiritSupport(match: MatchState, seat: number): MatchCommand | null {
  const st = match.seats[seat];
  if (!st || st.alive || st.supportTokens <= 0) return null;
  let target: number | null = null;
  let best = -1;
  for (const s of match.ring) {
    const t = match.seats[s]!;
    if (!t.alive || t.receivedThisRound) continue;
    const n = countNormalEnemies(match.lanes[s]!);
    if (n > best) { best = n; target = s; }
  }
  return target === null ? null : { type: 'support', target };
}

export class CoopDriver {
  private readonly bots = new Map<number, Bot>();
  private readonly seqs = new Map<number, number>();
  private pending: MatchInput[] = [];

  constructor(private readonly match: MatchState, kinds: BotKind[]) {
    match.ring.forEach((seat, i) => {
      this.bots.set(seat, kinds[i] === 'clumsy' ? clumsyBot(laneSeed(match.seed, seat)) : normalBot());
      this.seqs.set(seat, 0);
    });
  }

  private next(seat: number): number {
    const n = (this.seqs.get(seat) ?? 0) + 1;
    this.seqs.set(seat, n);
    return n;
  }

  queue(seat: number, cmd: MatchCommand): void {
    this.pending.push({ seat, seq: this.next(seat), cmd });
  }

  inputs(): MatchInput[] {
    const out = this.pending;
    this.pending = [];
    const m = this.match;
    if (m.tick % DECIDE_EVERY !== 0) return out;
    for (const seat of m.ring) {
      if (m.seats[seat]!.alive) {
        for (const cmd of this.bots.get(seat)!.decide(m.lanes[seat]!)) out.push({ seat, seq: this.next(seat), cmd });
      } else {
        const cmd = spiritSupport(m, seat);
        if (cmd) out.push({ seat, seq: this.next(seat), cmd });
      }
    }
    return out;
  }
}

interface Snap { boardDps: number; coins: number; coinsEarned: number; tokens: number; grades: number[] }

export interface CoopRun {
  match: MatchState; log: InputLogEntry[]; hashes: [number, string][];
  firstEnter: Record<number, number | null>; killTick: Record<number, number | null>; hpAtGate: Record<number, number | null>;
  entries: { stage: number; seat: number }[];
  snaps: Record<number, Map<number, Snap>>;
}

function snapshot(lane: GameState, earned: number): Snap {
  const grades = [0, 0, 0, 0];
  for (const u of lane.slots) if (u) grades[unitDefFast(lane.data, u.defId).grade - 1]!++;
  return { boardDps: boardDps(lane), coins: lane.coins, coinsEarned: earned, tokens: lane.tokens, grades };
}

export function runMatch(data: GameData, seed: number, kinds: BotKind[], options: MatchOptions = {}): CoopRun {
  const seats = kinds.map((_, i) => i + 1);
  const match = createMatch(data, seed, seats, options);
  const driver = new CoopDriver(match, kinds);
  const log: InputLogEntry[] = [];
  const hashes: [number, string][] = [];
  const firstEnter: Record<number, number | null> = { 1: null, 2: null };
  const killTick: Record<number, number | null> = { 1: null, 2: null };
  const hpAtGate: Record<number, number | null> = { 1: null, 2: null };
  const entries: { stage: number; seat: number }[] = [];
  const snaps: Record<number, Map<number, Snap>> = {};
  const earned: Record<number, number> = {};
  const last: Record<number, Snap> = {};
  for (const s of seats) { snaps[s] = new Map(); earned[s] = 0; last[s] = snapshot(match.lanes[s]!, 0); }
  const gateTicks = (data.coop?.yeoksin ?? []).map(y => ({ stage: y.stage, tick: roundStartTick(data, y.deadlineRound + 1) - 1 }));

  while (match.result === null && match.tick < MAX_TICKS) {
    const inputs = driver.inputs();
    if (inputs.length > 0) log.push({ tick: match.tick, inputs });
    const aliveBefore = seats.filter(s => match.seats[s]!.alive);
    const coinsBefore: Record<number, number> = {};
    for (const s of aliveBefore) {
      coinsBefore[s] = match.lanes[s]!.coins;
      if (match.tick % DECIDE_EVERY === 0) last[s] = snapshot(match.lanes[s]!, earned[s]!);
    }
    const r = stepMatch(match, inputs);
    for (const s of aliveBefore) {
      const gained = match.lanes[s]!.coins - coinsBefore[s]!;
      if (gained > 0) earned[s]! += gained;
    }
    for (const e of r.events) {
      if (e.type === 'roundStart' && e.round > 1) for (const s of aliveBefore) snaps[s]!.set(e.round - 1, last[s]!);
      else if (e.type === 'eliminated') snaps[e.seat]!.set(e.round, last[e.seat]!);
      else if (e.type === 'yeoksinEnter') {
        if (firstEnter[e.stage] === null) firstEnter[e.stage] = e.enterTick;
        if (!entries.some(x => x.stage === e.stage && x.seat === e.seat)) entries.push({ stage: e.stage, seat: e.seat });
      }
      else if (e.type === 'yeoksinKilled') killTick[e.stage] = r.tick;
    }
    for (const g of gateTicks) {
      if (g.tick === r.tick) hpAtGate[g.stage] = match.yeoksin?.stage === g.stage ? Math.max(0, match.yeoksin.enemy.hp) : null;
    }
    if (match.tick % HASH_EVERY === 0) hashes.push([match.tick, matchHash(match)]);
  }
  if (match.tick % HASH_EVERY !== 0) hashes.push([match.tick, matchHash(match)]);
  if (match.result) {
    for (const s of seats) if (match.seats[s]!.alive) snaps[s]!.set(match.result.round, snapshot(match.lanes[s]!, earned[s]!));
  }
  return { match, log, hashes, firstEnter, killTick, hpAtGate, entries, snaps };
}

const ROW_COLUMNS = [
  'round', 'nominalMultiplier', 'realMultiplier', 'killRatio', 'endEnemies', 'maxEnemies', 'boardDps', 'coins', 'coinsEarned', 'tokens',
  'g1', 'g2', 'g3', 'g4', 'bossKillSeconds', 'outcome', 'endRound',
] as const;
export const COOP_COLUMNS: string[] = ['seed', 'config', 'seat', 'alive', ...ROW_COLUMNS];

const fmt = (v: number | string | null): string =>
  v === null ? '' : typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : String(v);

export function coopRows(run: CoopRun, seed: number, config: string): string[][] {
  const { match } = run;
  const rows: string[][] = [];
  const outcome = match.result?.outcome ?? 'unfinished';
  const endRound = match.result?.round ?? match.round;
  for (const seat of match.ring) {
    const lane = match.lanes[seat]!;
    const alive = match.seats[seat]!.alive;
    const snaps = run.snaps[seat]!;
    for (const st of lane.stats) {
      const s = snaps.get(st.round) ?? snapshot(lane, 0);
      const values: (number | string | null)[] = [
        st.round,
        st.hpSpawned > 0 ? (s.boardDps * match.data.balance.roundSeconds) / st.hpSpawned : null,
        st.hpSpawned > 0 ? st.damageInRound / st.hpSpawned : null,
        st.hpSpawned > 0 ? st.damageDealt / st.hpSpawned : null,
        st.endEnemies, st.maxEnemies, s.boardDps, s.coins, s.coinsEarned, s.tokens,
        s.grades[0]!, s.grades[1]!, s.grades[2]!, s.grades[3]!, st.bossKillSeconds, outcome, endRound,
      ];
      rows.push([String(seed), config, String(seat), String(alive), ...values.map(fmt)]);
    }
  }
  return rows;
}

export const TEAM_COLUMNS = [
  'seed', 'config', 'players', 'started', 'alive', 'outcome', 'endTick', 'endRound', 'y1Enter', 'y1Kill', 'y1HpAtGate', 'y2Enter', 'y2Kill',
  'y2HpAtGate', 'damage', 'supportSent', 'supportReceived', 'causes', 'leftoverGrade1',
] as const;

/** Grade 1 units still on the boards of the survivors at the end, by unit id. */
export function leftoverGrade1(match: MatchState): Map<string, number> {
  const out = new Map<string, number>();
  for (const seat of match.ring) {
    if (!match.seats[seat]!.alive) continue;
    for (const u of match.lanes[seat]!.slots) {
      if (u && unitDefFast(match.data, u.defId).grade === 1) out.set(u.defId, (out.get(u.defId) ?? 0) + 1);
    }
  }
  return out;
}

export function teamRow(run: CoopRun, seed: number, config: string): Record<string, string | number> {
  const { match } = run;
  const res = match.result;
  const join = (f: (s: number) => string | number | null) =>
    match.ring.map(s => [s, f(s)] as const).filter(([, v]) => v !== null).map(([s, v]) => `${s}:${v};`).join('');
  const n = (v: number | null | undefined) => (v === null || v === undefined ? '' : v);
  return {
    seed, config, players: match.ring.length, started: match.ring.length,
    alive: res?.alive ?? match.ring.filter(s => match.seats[s]!.alive).length,
    outcome: res?.outcome ?? 'unfinished', endTick: res?.tick ?? match.tick, endRound: res?.round ?? match.round,
    y1Enter: n(run.firstEnter[1]), y1Kill: n(run.killTick[1]), y1HpAtGate: n(run.hpAtGate[1]),
    y2Enter: n(run.firstEnter[2]), y2Kill: n(run.killTick[2]), y2HpAtGate: n(run.hpAtGate[2]),
    damage: join(s => match.seats[s]!.yeoksinDamage.reduce((a, b) => a + b, 0)),
    supportSent: match.ring.reduce((a, s) => a + match.seats[s]!.supportSent, 0),
    supportReceived: match.ring.reduce((a, s) => a + match.seats[s]!.supportReceived, 0),
    causes: join(s => match.seats[s]!.record?.cause ?? null),
    leftoverGrade1: [...leftoverGrade1(match)].sort((a, b) => a[0].localeCompare(b[0])).map(([id, c]) => `${id}:${c};`).join(''),
  };
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const GATE_TICKS: Record<number, number> = { 1: 3200, 2: 4000 };

function expandKinds(spec: string, players: number): BotKind[] {
  const parts = spec.split(',').map(x => x.trim());
  for (const p of parts) if (p !== 'normal' && p !== 'clumsy') throw new Error(`unknown bot "${p}"`);
  const kinds = (parts.length === 1 ? Array.from({ length: players }, () => parts[0]!) : parts) as BotKind[];
  if (kinds.length !== players) throw new Error(`--bots has ${kinds.length} entries but --players is ${players}`);
  return kinds;
}

function configName(kinds: BotKind[]): string {
  const n = kinds.filter(k => k === 'normal').length;
  const c = kinds.length - n;
  return [n ? `normal${n}` : '', c ? `clumsy${c}` : ''].filter(Boolean).join('+');
}

/** `--stage 2` command line: runs seeds 1..N, writes seat rows and team rows, prints a summary. */
export function coopCli(arg: (name: string, fallback: string) => string): void {
  const players = Number(arg('players', '6'));
  const kinds = expandKinds(arg('bots', 'normal'), players);
  const seeds = Number(arg('seeds', '20'));
  const config = configName(kinds);
  const out = arg('out', `sim-out/coop-${config}.csv`);
  const teamOut = `${out.replace(/\.csv$/, '')}-team.csv`;
  const data = loadGameData('stage2');

  const seatRows: string[][] = [];
  const teamRows: Record<string, string | number>[] = [];
  const runs: CoopRun[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const run = runMatch(data, seed, kinds);
    runs.push(run);
    seatRows.push(...coopRows(run, seed, config));
    teamRows.push(teamRow(run, seed, config));
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, [COOP_COLUMNS.join(','), ...seatRows.map(r => r.join(','))].join('\n') + '\n');
  writeFileSync(teamOut, [TEAM_COLUMNS.join(','), ...teamRows.map(r => TEAM_COLUMNS.map(c => String(r[c]!)).join(','))].join('\n') + '\n');

  const count = <T>(xs: T[]) => {
    const m = new Map<T, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  };
  const show = <T>(m: Map<T, number>) =>
    [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'en', { numeric: true })).map(([k, v]) => `${k}x${v}`).join(' ') || '-';
  const results = runs.map(r => r.match.result!);
  console.log(`stage 2, config ${config}, seeds ${seeds}, csv ${out}, team csv ${teamOut}`);
  console.log(`team clear ${results.filter(r => r.outcome === 'clear').length}/${seeds}`);
  console.log(`outcomes: ${show(count(results.map(r => r.outcome)))}`);
  console.log(`gate failure rounds: ${show(count(results.filter(r => r.outcome === 'gate').map(r => r.round)))}`);
  console.log(`personal elimination causes: ${show(count(results.flatMap(r => r.seats.filter(s => s.cause).map(s => s.cause!))))}`);
  for (const stage of [1, 2]) {
    const spans = runs
      .filter(r => r.killTick[stage] != null && r.firstEnter[stage] != null)
      .map(r => r.killTick[stage]! - r.firstEnter[stage]!);
    const med = median(spans);
    const ratio = med === null ? '' : ` (${((med / GATE_TICKS[stage]!) * 100).toFixed(0)}% of ${GATE_TICKS[stage]})`;
    console.log(`stage ${stage} kill: ${spans.length}/${seeds} killed, median ticks since spawn ${med ?? '-'}${ratio}`);
  }
  for (const stage of [1, 2]) {
    const byOrder = new Map<number, { zero: number; total: number }>();
    for (const r of runs) {
      r.entries.filter(e => e.stage === stage).forEach((e, order) => {
        const cell = byOrder.get(order + 1) ?? { zero: 0, total: 0 };
        cell.total++;
        if (r.match.seats[e.seat]!.yeoksinDamage[stage - 1] === 0) cell.zero++;
        byOrder.set(order + 1, cell);
      });
    }
    const text = [...byOrder.entries()].sort((a, b) => a[0] - b[0])
      .map(([o, c]) => `#${o} ${((c.zero / c.total) * 100).toFixed(0)}% (${c.zero}/${c.total})`).join(' ');
    console.log(`stage ${stage} seats with zero yeoksin damage by entry order: ${text || '-'}`);
  }
  console.log(`team clear after a personal elimination: ${results.filter(r => r.outcome === 'clear' && r.alive < r.started).length}`);
  const left = new Map<string, number>();
  for (const r of runs) for (const [id, n] of leftoverGrade1(r.match)) left.set(id, (left.get(id) ?? 0) + n);
  console.log(`leftover grade 1 by id: ${show(left)}`);
}
