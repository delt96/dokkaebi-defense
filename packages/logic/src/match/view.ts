import type { Enemy, GameEvent, GameState } from '../types';
import type { Ack, MatchState, StepMatchResult } from './types';
import type {
  ClientView, ClockView, EconMine, EnemyView, FullMsg, GateView, LaneEvent, LaneMsg, LaneView, MineMsg, MineView, RowView,
  TickMsg, TransferEndView, TransferMine, UnitView, YeoksinView,
} from './wire';
import { econView } from '../econ/view';
import { enemyHp } from '../data';
import { enemyDefFast, enemySpeed, TICKS_PER_SECOND, toTicks } from '../flow';
import { laneOf } from '../lane';
import { countNormalEnemies, isShared } from '../stats';
import { gateDeadlineTick, nextAliveSeat } from './yeoksin';

const ROW_SEATS = [1, 2, 3, 4, 5, 6] as const;
const POSITION_EPSILON = 1e-6;

/** Enemy id of a yeoksin stage; mirrors the id yeoksinStep2 gives it (yeoksin.ts). */
const yeoksinEnemyId = (stage: number): number => -stage;

// ---------- building ----------

function unitsOf(lane: GameState): (UnitView | null)[] {
  return lane.slots.map(u => (u ? { id: u.id, defId: u.defId } : null));
}

function clockOf(match: MatchState): ClockView {
  return {
    tick: match.tick - 1, phase: match.phase, round: match.round,
    roundStartTick: match.roundStartTick, roundEndTick: match.roundEndTick,
  };
}

function rowsOf(match: MatchState, names: Record<number, string>, clockTick: number): RowView[] {
  const span = toTicks(match.data.coop!.disconnectSeconds);
  return ROW_SEATS.map((seat): RowView => {
    const st = match.seats[seat];
    if (!match.ring.includes(seat) || !st) {
      return {
        seat, name: '', status: 'empty', connected: false, reconnectTicksLeft: null,
        count: 0, overLimitTicks: 0, received: false, cause: null, eliminatedTick: null,
      };
    }
    const lane = match.lanes[seat]!;
    const away = st.alive && !st.connected && st.disconnectTick !== null;
    return {
      seat, name: names[seat] ?? '', status: st.alive ? 'alive' : 'spirit', connected: st.connected,
      reconnectTicksLeft: away ? st.disconnectTick! + span - clockTick : null,
      count: st.alive ? countNormalEnemies(lane) : 0,
      overLimitTicks: st.alive ? lane.overLimitTicks : 0,
      received: st.receivedThisRound,
      cause: st.record?.cause ?? null, eliminatedTick: st.record?.tick ?? null,
    };
  });
}

function gateOf(match: MatchState): GateView {
  const stage = match.yeoksinKills + 1;
  const hasStage = (match.data.coop?.yeoksin ?? []).some(y => y.stage === stage);
  return { stage, kills: match.yeoksinKills, deadlineTick: hasStage ? gateDeadlineTick(match.data, stage) : null };
}

function yeoksinOf(match: MatchState): YeoksinView | null {
  const y = match.yeoksin;
  if (!y) return null;
  return {
    stage: y.stage, hp: y.enemy.hp, maxHp: y.enemy.maxHp, seat: y.seat, enterTick: y.enterTick,
    nextSeat: y.seat === null ? null : nextAliveSeat(match, y.seat),
  };
}

function transferOf(match: MatchState, seat: number): TransferMine | null {
  const def = match.data.economy?.transfer;
  const econ = match.econ;
  if (!def || !econ) return null;
  const mine = econ.offers.find(o => o.from === seat || o.to === seat);
  const readyRounds: Record<number, number> = {};
  for (const s of match.ring) readyRounds[s] = econ.readyRound[s] ?? 0;
  return {
    ready: econ.readyRound[seat] ?? 0, readyRounds,
    busy: [...new Set(econ.offers.flatMap(o => [o.from, o.to]))].sort((a, b) => a - b),
    offer: mine
      ? {
        from: mine.from, to: mine.to, slot: mine.slot, unitId: mine.unitId,
        defId: match.lanes[mine.from]?.slots[mine.slot]?.defId ?? '',
        deadlineTick: mine.tick + toTicks(def.offerSeconds),
      }
      : null,
    rewarded: econ.rewarded.includes(seat), rewardsLeft: Math.max(0, def.rewardCap - econ.rewarded.length),
    delivered: (match.lanes[seat]?.slots ?? []).flatMap(u => (u?.delivered ? [u.id] : [])),
  };
}

/** Stage 3 economy for one seat, or undefined on data without an economy. */
function econMineOf(match: MatchState, seat: number): EconMine | undefined {
  const lane = econView(match.lanes[seat]!);
  if (!lane) return undefined;
  const team = match.econ && match.data.economy?.team ? { ...match.econ.team } : null;
  return { ...lane, transfer: transferOf(match, seat), team };
}

function mineOf(
  match: MatchState, seat: number, tick: number, acks: Ack[], supportIn: { from: number; coins: number }[], econ = econMineOf(match, seat),
  transferEnds: TransferEndView[] = [],
): MineView {
  const lane = match.lanes[seat]!;
  const st = match.seats[seat]!;
  return {
    tick, tokens: lane.tokens, coins: lane.coins, buckwheat: lane.buckwheat, upgrades: { ...lane.upgrades },
    pendingPity: [...lane.pendingPity], grade1Summons: lane.grade1Summons, helperOpens: lane.helperOpens,
    supportTokens: st.supportTokens, received: st.receivedThisRound, lastSeq: st.lastSeq,
    open: [...lane.open], units: unitsOf(lane), acks, supportIn,
    ...(econ && { econ }),
    ...(transferEnds.length > 0 ? { transferEnds } : {}),
  };
}

function enemyViewOf(lane: GameState, e: Enemy, tick: number): EnemyView {
  return {
    id: e.id, defId: e.defId, hp: e.hp, maxHp: e.maxHp, boss: e.boss, shared: isShared(lane.data, e),
    d: e.d, t: tick, speed: enemySpeed(lane, e),
  };
}

function laneViewOf(match: MatchState, seat: number, tick: number): LaneView {
  const lane = match.lanes[seat];
  if (!lane) return { seat, tick, open: [], units: [], enemies: [], fires: [] };
  return {
    seat, tick, open: [...lane.open], units: unitsOf(lane),
    enemies: lane.enemies.map(e => enemyViewOf(lane, e, tick)),
    fires: lane.fires.map(f => ({ source: f.source, from: f.from, to: f.to, endTick: f.endTick })),
  };
}

/** Full display state for one player. Holds no rng state and no other player's key. */
export function buildFull(
  match: MatchState, seat: number, opts: { watching: number; names: Record<number, string>; key: string; n: number },
): FullMsg {
  const clock = clockOf(match);
  return {
    n: opts.n, dataVersion: match.dataVersion, clock,
    rows: rowsOf(match, opts.names, clock.tick), gate: gateOf(match), yeoksin: yeoksinOf(match),
    me: { seat, key: opts.key },
    mine: mineOf(match, seat, clock.tick, [], []),
    watching: opts.watching,
    lane: laneViewOf(match, opts.watching, clock.tick),
    result: match.result ? structuredClone(match.result) : null,
  };
}

export function buildTick(match: MatchState, names: Record<number, string>, n: number): TickMsg {
  const clock = clockOf(match);
  return { n, clock, rows: rowsOf(match, names, clock.tick), gate: gateOf(match), yeoksin: yeoksinOf(match) };
}

// ---------- streaming ----------

function boardKey(lane: GameState): string {
  let key = '';
  for (let i = 0; i < lane.slots.length; i++) {
    const u = lane.slots[i];
    key += (lane.open[i] ? 'o' : 'x') + (u ? `${u.id}:${u.defId}` : '') + ',';
  }
  return key;
}

function mineKey(match: MatchState, seat: number, econ: EconMine | undefined): string {
  const lane = match.lanes[seat]!;
  const st = match.seats[seat]!;
  return JSON.stringify([
    lane.tokens, lane.coins, lane.buckwheat, lane.upgrades, lane.pendingPity, lane.grade1Summons, lane.helperOpens,
    st.supportTokens, st.receivedThisRound, st.lastSeq,
  ]) + boardKey(lane) + (econ ? JSON.stringify(econ) : '');
}

function laneEventOf(match: MatchState, e: GameEvent): LaneEvent | null {
  switch (e.type) {
    case 'spawn': {
      const def = enemyDefFast(match.data, e.defId);
      const hp = enemyHp(def, match.round, match.data.balance);
      // the enemy moved once on the tick it appeared
      return { t: 'spawn', id: e.enemyId, defId: e.defId, hp, maxHp: hp, boss: def.boss, d: def.speed / TICKS_PER_SECOND, speed: def.speed };
    }
    case 'speedChange': return { t: 'speed', id: e.enemyId, d: e.d, speed: e.speed };
    case 'damage': return { t: 'damage', id: e.enemyId, amount: e.amount, source: e.source, ...(e.effect && { effect: e.effect }) };
    case 'attack': return { t: 'attack', unitId: e.unitId, id: e.enemyId };
    case 'kill': return { t: 'kill', id: e.enemyId };
    case 'summon': return { t: 'summon', unitId: e.unitId, defId: e.defId, grade: e.grade, slot: e.slot };
    case 'combine': return { t: 'combine', unitId: e.unitId, defId: e.defId, slot: e.slot };
    case 'flee': return { t: 'flee', id: e.enemyId };
    case 'grow': return { t: 'grow', id: e.enemyId, hp: e.hp };
    case 'buy': case 'questReward': case 'storyOffer': case 'storyEnd': case 'tame':
      return { t: 'note', ev: structuredClone(e) };
    default: return null;
  }
}

/** Turns each stepMatch result into per-lane event batches and per-seat `mine` updates. */
export class MatchStreamer {
  private readonly boards = new Map<number, string>();
  private readonly mines = new Map<number, string>();

  constructor(private readonly match: MatchState) {
    for (const seat of match.ring) {
      this.boards.set(seat, boardKey(match.lanes[seat]!));
      this.mines.set(seat, mineKey(match, seat, econMineOf(match, seat)));
    }
  }

  afterStep(step: StepMatchResult): { lanes: Record<number, LaneEvent[]>; mine: Record<number, MineView | null> } {
    const match = this.match;
    const coop = match.data.coop!;
    const perimeter = laneOf(match).perimeter;
    const stayTicks = toTicks(coop.staySeconds);
    const lanes: Record<number, LaneEvent[]> = {};
    const mine: Record<number, MineView | null> = {};

    for (const seat of match.ring) {
      const out: LaneEvent[] = [];
      const push = (e: GameEvent) => { const v = laneEventOf(match, e); if (v) out.push(v); };
      const ls = step.lanes[seat];
      const events = ls?.events ?? [];
      const combatStart = ls?.combatStart ?? 0;
      for (let i = 0; i < combatStart; i++) push(events[i]!);
      for (const ev of step.events) {
        if (ev.type === 'yeoksinLeave' && ev.seat === seat) out.push({ t: 'leave', id: yeoksinEnemyId(ev.stage) });
      }
      for (const ev of step.events) {
        if (ev.type !== 'yeoksinEnter' || ev.seat !== seat) continue;
        const def = coop.yeoksin.find(y => y.stage === ev.stage)!;
        out.push({
          t: 'enter', id: yeoksinEnemyId(ev.stage), defId: def.enemy, hp: ev.hp, maxHp: ev.maxHp,
          d: perimeter / stayTicks, speed: perimeter / coop.staySeconds,
        });
      }
      for (let i = combatStart; i < events.length; i++) push(events[i]!);
      for (const f of ls?.newFires ?? []) out.push({ t: 'fire', source: f.source, from: f.from, to: f.to, endTick: f.endTick });
      if (step.events.some(ev => ev.type === 'eliminated' && ev.seat === seat)) out.push({ t: 'clear' });
      const lane = match.lanes[seat]!;
      const board = boardKey(lane);
      if (board !== this.boards.get(seat)) {
        this.boards.set(seat, board);
        out.push({ t: 'board', open: [...lane.open], units: unitsOf(lane) });
      }
      lanes[seat] = out;

      const acks = step.acks.filter(a => a.seat === seat);
      const supportIn: { from: number; coins: number }[] = [];
      for (const ev of step.events) if (ev.type === 'support' && ev.to === seat) supportIn.push({ from: ev.from, coins: ev.coins });
      const ends: TransferEndView[] = [];
      for (const ev of step.events) {
        if (ev.type !== 'transferEnd' || (ev.from !== seat && ev.to !== seat)) continue;
        const { type: _, ...end } = ev;
        ends.push(end);
      }
      const econ = econMineOf(match, seat);
      const key = mineKey(match, seat, econ);
      const changed = key !== this.mines.get(seat);
      this.mines.set(seat, key);
      mine[seat] = acks.length > 0 || supportIn.length > 0 || ends.length > 0 || changed
        ? mineOf(match, seat, step.tick, acks, supportIn, econ, ends) : null;
    }
    return { lanes, mine };
  }
}

// ---------- applying ----------

export function applyFull(msg: FullMsg): ClientView {
  return structuredClone(msg);
}

export function applyTick(view: ClientView, msg: TickMsg): 'ok' | 'gap' {
  if (msg.n !== view.n + 1) return 'gap';
  const copy = structuredClone(msg);
  view.n = copy.n;
  view.clock = copy.clock;
  view.rows = copy.rows;
  view.gate = copy.gate;
  view.yeoksin = copy.yeoksin;
  return 'ok';
}

function applyLaneEvent(lane: LaneView, ev: LaneEvent, tick: number): void {
  const find = (id: number) => lane.enemies.find(e => e.id === id);
  switch (ev.t) {
    case 'spawn':
      lane.enemies.push({ id: ev.id, defId: ev.defId, hp: ev.hp, maxHp: ev.maxHp, boss: ev.boss, shared: false, d: ev.d, t: tick, speed: ev.speed });
      break;
    case 'enter':
      lane.enemies.push({ id: ev.id, defId: ev.defId, hp: ev.hp, maxHp: ev.maxHp, boss: false, shared: true, d: ev.d, t: tick, speed: ev.speed });
      break;
    case 'leave':
    case 'kill':
    case 'flee':
      lane.enemies = lane.enemies.filter(e => e.id !== ev.id);
      break;
    case 'grow': {
      const e = find(ev.id);
      if (e) { e.hp = ev.hp; e.maxHp = ev.hp; }
      break;
    }
    case 'speed': {
      const e = find(ev.id);
      if (e) { e.d = ev.d; e.t = tick; e.speed = ev.speed; }
      break;
    }
    case 'damage': {
      const e = find(ev.id);
      if (e) e.hp -= ev.amount;
      break;
    }
    case 'fire':
      lane.fires.push({ source: ev.source, from: ev.from, to: ev.to, endTick: ev.endTick });
      break;
    case 'board':
      lane.open = [...ev.open];
      lane.units = ev.units.map(u => (u ? { ...u } : null));
      break;
    case 'clear':
      lane.units = lane.units.map(() => null);
      lane.enemies = [];
      lane.fires = [];
      break;
    default:
      break;
  }
}

export function applyLane(view: ClientView, msg: LaneMsg): 'ok' | 'gap' | 'ignored' {
  if (msg.seat !== view.watching) return 'ignored';
  if (msg.n !== view.n) return 'gap';
  const lane = view.lane;
  for (const batch of msg.batches) {
    if (batch.tick <= lane.tick) continue;
    for (const ev of batch.events) applyLaneEvent(lane, ev, batch.tick);
    lane.tick = batch.tick;
    lane.fires = lane.fires.filter(f => batch.tick < f.endTick);
  }
  return 'ok';
}

/** Applies a `mine` update; returns its acks, or [] when it is not newer than what the view holds. */
export function applyMine(view: ClientView, msg: MineMsg): Ack[] {
  if (msg.tick <= view.mine.tick) return [];
  view.mine = structuredClone(msg);
  return msg.acks;
}

export function enemyDistanceAt(e: EnemyView, tick: number): number {
  return e.d + (e.speed * (tick - e.t)) / TICKS_PER_SECOND;
}

// ---------- comparing ----------

function diffValue(path: string, a: unknown, b: unknown, out: string[]): void {
  if (Object.is(a, b)) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) { out.push(`${path}.length`); return; }
    for (let i = 0; i < a.length; i++) diffValue(`${path}[${i}]`, a[i], b[i], out);
    return;
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null && !Array.isArray(a) && !Array.isArray(b)) {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
    for (const k of keys) diffValue(`${path}.${k}`, ra[k], rb[k], out);
    return;
  }
  out.push(path);
}

const MINE_SKIP: ReadonlySet<string> = new Set(['tick', 'acks', 'supportIn', 'transferEnds']);
const ENEMY_SKIP: ReadonlySet<string> = new Set(['d', 't']);

function diffEnemies(a: LaneView, b: LaneView, out: string[]): void {
  const byId = (list: EnemyView[]) => new Map(list.map(e => [e.id, e]));
  const ma = byId(a.enemies);
  const mb = byId(b.enemies);
  const ids = [...new Set([...ma.keys(), ...mb.keys()])].sort((x, y) => x - y);
  for (const id of ids) {
    const path = `lane.enemies[id=${id}]`;
    const ea = ma.get(id);
    const eb = mb.get(id);
    if (!ea || !eb) { out.push(path); continue; }
    for (const k of new Set([...Object.keys(ea), ...Object.keys(eb)])) {
      if (ENEMY_SKIP.has(k)) continue;
      diffValue(`${path}.${k}`, (ea as unknown as Record<string, unknown>)[k], (eb as unknown as Record<string, unknown>)[k], out);
    }
    if (Math.abs(enemyDistanceAt(ea, a.tick) - enemyDistanceAt(eb, b.tick)) > POSITION_EPSILON) out.push(`${path}.position`);
  }
}

/** Paths where two client views differ ([] when equal). Ignores mine.tick/acks/supportIn/transferEnds; enemies compare by id and position. */
export function diffViews(a: ClientView, b: ClientView): string[] {
  const out: string[] = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof ClientView>) {
    if (k === 'mine' || k === 'lane') continue;
    diffValue(k, a[k], b[k], out);
  }
  for (const k of new Set([...Object.keys(a.mine), ...Object.keys(b.mine)]) as Set<keyof MineView>) {
    if (MINE_SKIP.has(k)) continue;
    diffValue(`mine.${k}`, a.mine[k], b.mine[k], out);
  }
  for (const k of new Set([...Object.keys(a.lane), ...Object.keys(b.lane)]) as Set<keyof LaneView>) {
    if (k === 'enemies') continue;
    diffValue(`lane.${k}`, a.lane[k], b.lane[k], out);
  }
  diffEnemies(a.lane, b.lane, out);
  return out;
}
