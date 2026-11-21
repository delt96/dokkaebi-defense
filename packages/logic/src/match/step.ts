import type { Command, GameState, RejectReason } from '../types';
import type { MatchInput, MatchState, StepMatchResult } from './types';
import { applyCommand, runAfterCommandHooks, runCombat } from '../game';
import { spawnDue, startRound, trackLimit, waveOf } from '../flow';
import { countNormalEnemies, currentStats } from '../stats';
import { unitDefFast } from '../units';
import { roundStartTick } from './schedule';
import {
  applySeatCommand, decideResult, expireDisconnects, judgeSeats, onBossSpawned, seatsAfterLane, seatsOnRoundStart,
} from './seats';
import { expireMissedYeoksin, yeoksinAfterLane, yeoksinPosition, yeoksinStep2 } from './yeoksin';
import { applyTransferCommand, matchEconRoundEnd, matchEconRoundStart, TRANSFER_COMMANDS, transferStep } from './econ';
import { eventsTick } from '../econ/events';
import { econRoundEnd } from '../econ/hooks';

const SEAT_COMMANDS: ReadonlySet<string> = new Set(['support', 'forfeit', 'disconnect', 'reconnect']);

function aliveSeats(match: MatchState): number[] {
  return match.ring.filter(s => match.seats[s]!.alive);
}

function syncLaneClock(match: MatchState, lane: GameState): void {
  lane.tick = match.tick;
  lane.phase = match.phase;
  lane.round = match.round;
  lane.roundStartTick = match.roundStartTick;
  lane.roundEndTick = match.roundEndTick;
  lane.result = null;
}

const isSlotIndex = (lane: GameState, i: unknown): i is number =>
  typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < lane.slots.length;

function staleUnit(lane: GameState, cmd: Command): boolean {
  if (cmd.type === 'move') {
    if (cmd.unitId !== undefined && isSlotIndex(lane, cmd.from) && lane.slots[cmd.from]?.id !== cmd.unitId) return true;
    if (cmd.toUnitId !== undefined && isSlotIndex(lane, cmd.to) && (lane.slots[cmd.to]?.id ?? null) !== cmd.toUnitId) return true;
    return false;
  }
  if (cmd.type === 'sell' || cmd.type === 'store' || (cmd.type === 'combine' && cmd.slot !== undefined)) {
    return cmd.unitId !== undefined && lane.slots[cmd.slot!]?.id !== cmd.unitId;
  }
  return false;
}

function laneStep(ctx: StepMatchResult, seat: number) {
  return (ctx.lanes[seat] ??= { events: [], combatStart: 0, newFires: [] });
}

function applyInput(match: MatchState, input: MatchInput, ctx: StepMatchResult): RejectReason | null {
  const cmd = input.cmd;
  const type = (cmd as { type?: unknown } | null | undefined)?.type;
  if (typeof type === 'string' && SEAT_COMMANDS.has(type)) return applySeatCommand(match, input, ctx);
  if (typeof type === 'string' && TRANSFER_COMMANDS.has(type)) return applyTransferCommand(match, input, ctx);
  if (type === 'invalid') return 'badArgs';
  const seat = match.seats[input.seat]!;
  if (!seat.alive) return 'notAlive';
  const lane = match.lanes[input.seat]!;
  const laneCmd = cmd as Command;
  if (staleUnit(lane, laneCmd)) return 'staleUnit';
  return applyCommand(lane, laneCmd, laneStep(ctx, input.seat).events);
}

function updateBestUnit(match: MatchState, seat: number, ctx: StepMatchResult): void {
  const st = match.seats[seat]!;
  for (const e of ctx.lanes[seat]!.events) {
    let grade: number;
    if (e.type === 'summon') grade = e.grade;
    else if (e.type === 'combine') grade = unitDefFast(match.data, e.defId).grade;
    else continue;
    if (!st.bestUnit || grade > st.bestUnit.grade) st.bestUnit = { defId: e.defId, grade };
  }
}

export function stepMatch(match: MatchState, inputs: MatchInput[]): StepMatchResult {
  const t = match.tick;
  const ctx: StepMatchResult = { tick: t, acks: [], lanes: {}, events: [] };

  // 0. finished match: reject everything, time stands still
  if (match.result) {
    for (const input of inputs) if (input.seq > 0) ctx.acks.push({ seat: input.seat, seq: input.seq, tick: t, ok: false, reason: 'ended' });
    return ctx;
  }

  const data = match.data;
  const b = data.balance;

  // 1. clocks, connection changes and player commands
  for (const seat of aliveSeats(match)) {
    syncLaneClock(match, match.lanes[seat]!);
    const lane = match.lanes[seat]!;
    const step = laneStep(ctx, seat);
    if (lane.econ) eventsTick(lane, step.events);
  }
  expireDisconnects(match, ctx);
  if (match.econ) transferStep(match, ctx);
  for (const input of inputs) {
    if (!match.ring.includes(input.seat)) continue;
    const seat = match.seats[input.seat]!;
    if (input.seq > 0) {
      if (input.seq <= seat.lastSeq) continue;
      seat.lastSeq = input.seq;
    }
    const reason = applyInput(match, input, ctx);
    if (input.seq > 0) {
      ctx.acks.push(reason
        ? { seat: input.seat, seq: input.seq, tick: t, ok: false, reason }
        : { seat: input.seat, seq: input.seq, tick: t, ok: true });
    }
  }
  for (const seat of aliveSeats(match)) runAfterCommandHooks(match.lanes[seat]!, laneStep(ctx, seat).events);

  // 2. shared round boundary, spawns, yeoksin entry
  if (match.round < b.rounds && t === roundStartTick(data, match.round + 1)) {
    const round = match.round + 1;
    match.phase = 'round';
    match.round = round;
    match.roundStartTick = t;
    match.roundEndTick = roundStartTick(data, round + 1);
    seatsOnRoundStart(match);
    for (const seat of aliveSeats(match)) startRound(match.lanes[seat]!, round, laneStep(ctx, seat).events);
    ctx.events.push({ type: 'roundStart', round });
    if (match.econ) matchEconRoundStart(match, ctx);
  }
  if (match.phase === 'round') {
    for (const seat of aliveSeats(match)) {
      const lane = match.lanes[seat]!;
      const events = laneStep(ctx, seat).events;
      const before = events.length;
      spawnDue(lane, events);
      if (waveOf(lane, match.round).type !== 'boss') continue;
      for (let i = before; i < events.length; i++) {
        const e = events[i]!;
        if (e.type !== 'spawn') continue;
        const enemy = lane.enemies.find(x => x.id === e.enemyId);
        if (enemy?.boss) onBossSpawned(match, seat, match.round, enemy.id, ctx);
      }
    }
  }
  yeoksinStep2(match, ctx);

  // 3. combat per lane, in seat order
  for (const seat of aliveSeats(match)) {
    const lane = match.lanes[seat]!;
    const step = laneStep(ctx, seat);
    step.combatStart = step.events.length;
    const firesBefore = new Set(lane.fires);
    runCombat(lane, step.events, { finalClear: false, afterMove: () => yeoksinPosition(match, seat) });
    step.newFires = lane.fires.filter(f => !firesBefore.has(f));
    updateBestUnit(match, seat, ctx);
    seatsAfterLane(match, seat, ctx);
    yeoksinAfterLane(match, seat, ctx);
  }

  // 4. enemy counts and elimination checks
  const lastTickOfRound = match.phase === 'round' && t === match.roundEndTick - 1;
  const overLimit: number[] = [];
  for (const seat of aliveSeats(match)) {
    const lane = match.lanes[seat]!;
    if (trackLimit(lane)) overLimit.push(seat);
    if (lastTickOfRound) {
      const st = currentStats(lane);
      if (st) st.endEnemies = countNormalEnemies(lane);
    }
  }
  judgeSeats(match, overLimit, ctx);
  if (lastTickOfRound) {
    for (const seat of aliveSeats(match)) {
      const lane = match.lanes[seat]!;
      if (lane.econ) econRoundEnd(lane, laneStep(ctx, seat).events);
    }
    if (match.econ) matchEconRoundEnd(match, ctx);
  }

  // 5. round-end income, team result, advance the shared clock
  if (lastTickOfRound) for (const seat of aliveSeats(match)) match.lanes[seat]!.coins += b.coins.roundEnd;
  decideResult(match, ctx);
  if (match.options.noGate && !match.result) expireMissedYeoksin(match, ctx);
  match.tick += 1;
  return ctx;
}
