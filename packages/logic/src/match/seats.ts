import type { CoopDef, GameData, GameState, RejectReason } from '../types';
import type {
  BossClock, EliminationCause, MatchInput, MatchResult, MatchState, SeatRecord, SeatResult, SeatState, StepMatchResult,
  TeamOutcome,
} from './types';
import { toTicks } from '../flow';
import { countNormalEnemies, currentStats } from '../stats';
import { roundStartTick } from './schedule';
import { gateFailed } from './yeoksin';
import { dropOffersOf } from './econ';

const coopOf = (match: MatchState): CoopDef => match.data.coop!;

const bossRoundCache = new WeakMap<GameData, number[]>();

/** Rounds whose wave is a lane boss, ascending (stage 2: [10, 20]). */
export function bossRounds(data: GameData): number[] {
  let rounds = bossRoundCache.get(data);
  if (!rounds) {
    rounds = data.waves.filter(w => w.type === 'boss').map(w => w.round).sort((a, b) => a - b);
    bossRoundCache.set(data, rounds);
  }
  return rounds;
}

function bossClocks(seat: SeatState): BossClock[] {
  return Object.values(seat.bosses);
}

function seatBossesKilled(seat: SeatState): boolean {
  return bossClocks(seat).every(c => c.status === 'killed');
}

export function allBossesKilled(match: MatchState, seat: number): boolean {
  return seatBossesKilled(match.seats[seat]!);
}

function aliveCount(match: MatchState): number {
  let n = 0;
  for (const s of match.ring) if (match.seats[s]!.alive) n++;
  return n;
}

/** Record of a lane as it stands now; the current round's end count is taken from the live enemies. */
function buildRecord(match: MatchState, seat: number, cause: EliminationCause | null, tick: number | null): SeatRecord {
  const lane = match.lanes[seat]!;
  const last = countNormalEnemies(lane);
  const cur = currentStats(lane);
  const live = cur && cur.round === match.round ? cur : undefined;
  let maxEnemies = 0;
  for (const s of lane.stats) if (s.maxEnemies > maxEnemies) maxEnemies = s.maxEnemies;
  return {
    round: match.round, cause, tick,
    lastEnemies: last, maxEnemies,
    series: lane.stats.map(s => (s === live ? last : s.endEnemies)),
    helperOpens: lane.helperOpens,
  };
}

export function seatRecord(match: MatchState, seat: number): SeatRecord {
  return buildRecord(match, seat, null, null);
}

function clearLane(lane: GameState): void {
  lane.slots = lane.slots.map(() => null);
  if (lane.storage) lane.storage = [];
  lane.enemies = [];
  lane.fires = [];
  if (lane.econ) {
    lane.econ.pendingDrops = [];
    lane.econ.events = [];
    if (lane.econ.mission.phase === 'active') {
      lane.econ.mission = { phase: 'lost', beastId: null, beastDown: false };
    }
  }
  lane.upgrades = { physical: 0, magical: 0, polish: 0, slots: 0 };
  lane.tokens = 0;
  lane.coins = 0;
  lane.buckwheat = 0;
  lane.overLimitTicks = 0;
}

export function eliminate(match: MatchState, seat: number, cause: EliminationCause, ctx: StepMatchResult): void {
  const st = match.seats[seat]!;
  const lane = match.lanes[seat]!;
  const cur = currentStats(lane);
  if (cur && cur.round === match.round) cur.endEnemies = countNormalEnemies(lane);
  st.record = buildRecord(match, seat, cause, ctx.tick);
  if (match.econ) dropOffersOf(match, seat, 'eliminated', ctx);
  clearLane(lane);
  st.alive = false;
  st.supportTokens = 0;
  for (const clock of bossClocks(st)) if (clock.status === 'fighting') clock.status = 'failed';
  ctx.events.push({ type: 'eliminated', seat, cause, round: match.round });
}

export function expireDisconnects(match: MatchState, ctx: StepMatchResult): void {
  const span = toTicks(coopOf(match).disconnectSeconds);
  for (const s of match.ring) {
    const st = match.seats[s]!;
    if (st.alive && st.disconnectTick !== null && ctx.tick === st.disconnectTick + span) eliminate(match, s, 'disconnect', ctx);
  }
}

function applySupport(match: MatchState, from: number, target: unknown, ctx: StepMatchResult): RejectReason | null {
  const sender = match.seats[from]!;
  if (sender.alive) return 'notSpirit';
  if (sender.supportTokens <= 0) return 'noSupportToken';
  if (typeof target !== 'number' || !match.ring.includes(target) || !match.seats[target]!.alive) return 'targetNotAlive';
  const receiver = match.seats[target]!;
  if (receiver.receivedThisRound) return 'targetAlreadyReceived';
  const coins = coopOf(match).support.coins;
  sender.supportTokens -= 1;
  sender.supportSent += 1;
  receiver.receivedThisRound = true;
  receiver.supportReceived += 1;
  match.lanes[target]!.coins += coins;
  ctx.events.push({ type: 'support', from, to: target, coins });
  return null;
}

export function applySeatCommand(match: MatchState, input: MatchInput, ctx: StepMatchResult): RejectReason | null {
  const st = match.seats[input.seat]!;
  const cmd = input.cmd;
  switch (cmd.type) {
    case 'disconnect':
      if (!st.connected) return null;
      st.connected = false;
      st.disconnectTick = ctx.tick;
      if (match.econ) dropOffersOf(match, input.seat, 'disconnected', ctx);
      ctx.events.push({ type: 'disconnected', seat: input.seat });
      return null;
    case 'reconnect':
      st.connected = true;
      st.disconnectTick = null;
      ctx.events.push({ type: 'reconnected', seat: input.seat, alive: st.alive });
      return null;
    case 'forfeit':
      if (!st.alive) return 'notAlive';
      eliminate(match, input.seat, 'forfeit', ctx);
      return null;
    case 'support':
      return applySupport(match, input.seat, cmd.target, ctx);
    default:
      return 'unknown';
  }
}

export function seatsOnRoundStart(match: MatchState): void {
  const support = coopOf(match).support;
  for (const s of match.ring) {
    const st = match.seats[s]!;
    st.receivedThisRound = false;
    if (!st.alive) st.supportTokens = Math.min(support.max, st.supportTokens + support.perRound);
  }
}

export function onBossSpawned(match: MatchState, seat: number, round: number, enemyId: number, ctx: StepMatchResult): void {
  match.seats[seat]!.bosses[round] = {
    status: 'fighting', ticksLeft: toTicks(match.data.balance.bossRoundSeconds), pausedTicks: 0, enemyId,
  };
  ctx.events.push({ type: 'bossSpawn', seat, round, enemyId });
}

export function seatsAfterLane(match: MatchState, seat: number, ctx: StepMatchResult): void {
  const st = match.seats[seat]!;
  const step = ctx.lanes[seat];
  if (!step) return;
  for (let i = step.combatStart; i < step.events.length; i++) {
    const e = step.events[i]!;
    if (e.type !== 'kill') continue;
    for (const [key, clock] of Object.entries(st.bosses)) {
      const round = Number(key);
      if (clock.status === 'fighting' && clock.enemyId === e.enemyId) {
        clock.status = 'killed';
        ctx.events.push({ type: 'bossKilled', seat, round });
      }
    }
  }
}

export function judgeSeats(match: MatchState, overLimit: number[], ctx: StepMatchResult): void {
  const pauseCap = toTicks(coopOf(match).bossPauseCapSeconds);
  const candidates: { seat: number; cause: EliminationCause }[] = [];
  for (const s of match.ring) {
    const st = match.seats[s]!;
    if (!st.alive) continue;
    let timedOut = false;
    for (const clock of bossClocks(st)) {
      if (clock.status !== 'fighting') continue;
      if (st.connected || clock.pausedTicks >= pauseCap) clock.ticksLeft = Math.max(0, clock.ticksLeft - 1);
      else clock.pausedTicks += 1;
      if (clock.ticksLeft === 0) timedOut = true;
    }
    if (overLimit.includes(s)) candidates.push({ seat: s, cause: 'limit' });
    else if (timedOut) candidates.push({ seat: s, cause: 'boss' });
  }
  if (match.options.noElimination) return;
  for (const c of candidates) eliminate(match, c.seat, c.cause, ctx);
}

function seatResult(match: MatchState, seat: number, outcome: TeamOutcome): SeatResult {
  const st = match.seats[seat]!;
  const yeoksinDamage = st.yeoksinDamage.reduce((a, b) => a + b, 0);
  if (!st.alive) {
    const r = st.record!;
    return {
      seat, outcome: 'eliminated', cause: r.cause, round: r.round, lastEnemies: r.lastEnemies, maxEnemies: r.maxEnemies,
      series: r.series, bestUnit: st.bestUnit, yeoksinDamage, helperOpens: r.helperOpens,
    };
  }
  const r = seatRecord(match, seat);
  return {
    seat,
    outcome: outcome === 'gate' ? 'aliveTeamLoss' : seatBossesKilled(st) ? 'finished' : 'unfinished',
    cause: null, round: r.round, lastEnemies: r.lastEnemies, maxEnemies: r.maxEnemies,
    series: r.series, bestUnit: st.bestUnit, yeoksinDamage, helperOpens: r.helperOpens,
  };
}

function teamOutcome(match: MatchState, t: number): TeamOutcome | null {
  if (!match.options.noGate && gateFailed(match, t)) return 'gate';
  const alive = match.ring.filter(s => match.seats[s]!.alive);
  if (alive.length === 0) return 'wipe';
  if (alive.every(s => seatBossesKilled(match.seats[s]!))) return 'clear';
  if (t === roundStartTick(match.data, match.data.balance.rounds + 1) - 1) {
    return alive.some(s => seatBossesKilled(match.seats[s]!)) ? 'clear' : 'wipe';
  }
  return null;
}

export function decideResult(match: MatchState, ctx: StepMatchResult): void {
  if (match.result) return;
  const t = ctx.tick;
  const outcome = teamOutcome(match, t);
  if (!outcome) return;
  const result: MatchResult = {
    outcome, tick: t, round: match.round, yeoksinKills: match.yeoksinKills,
    started: match.ring.length, alive: aliveCount(match),
    seats: match.ring.map(s => seatResult(match, s, outcome)),
  };
  match.result = result;
  match.phase = 'ended';
  ctx.events.push({ type: 'ended', result });
}
