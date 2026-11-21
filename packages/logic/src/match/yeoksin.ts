import type { CoopDef, Enemy, GameData, YeoksinStageDef } from '../types';
import type { MatchState, StepMatchResult } from './types';
import { toTicks } from '../flow';
import { laneOf } from '../lane';
import { roundStartTick } from './schedule';

const coopOf = (data: GameData): CoopDef => {
  if (!data.coop) throw new Error('yeoksin needs stage 2 data (coop is missing)');
  return data.coop;
};

function stageDef(data: GameData, stage: number): YeoksinStageDef {
  const def = coopOf(data).yeoksin.find(y => y.stage === stage);
  if (!def) throw new Error(`no yeoksin stage ${stage}`);
  return def;
}

/** Max hp of a stage, fixed by the number of players who started the match. */
export function yeoksinMaxHp(data: GameData, starters: number, stage: number): number {
  const coop = coopOf(data);
  return Math.round(stageDef(data, stage).baseHp * (1 + coop.hpPerExtraPlayer * (starters - 1)));
}

/** Last tick of the stage's deadline round: the gate is judged at the end of this tick. */
export function gateDeadlineTick(data: GameData, stage: number): number {
  return roundStartTick(data, stageDef(data, stage).deadlineRound + 1) - 1;
}

/** First living seat after `from` going round the ring; `from` itself if it is the only one alive. */
export function nextAliveSeat(match: MatchState, from: number): number | null {
  let wrap: number | null = null;
  for (const s of match.ring) {
    if (!match.seats[s]!.alive) continue;
    if (s > from) return s;
    if (wrap === null) wrap = s;
  }
  return wrap;
}

const stayTicks = (data: GameData): number => toTicks(coopOf(data).staySeconds);

function moveTo(match: MatchState, to: number | null, ctx: StepMatchResult): void {
  const y = match.yeoksin!;
  const e = y.enemy;
  const from = y.seat;
  if (from !== null) {
    const old = match.lanes[from]!;
    for (const unit of old.slots) if (unit?.streak?.enemyId === e.id) delete unit.streak;
    const i = old.enemies.indexOf(e);
    if (i >= 0) {
      old.enemies.splice(i, 1);
      ctx.events.push({ type: 'yeoksinLeave', stage: y.stage, seat: from });
    }
  }
  delete e.vulnCaster;
  e.vulns = {};
  e.dots = {};
  e.fireHit = {};
  y.seat = to;
  if (to === null) return;
  match.lanes[to]!.enemies.push(e);
  e.d = 0;
  y.enterTick = ctx.tick;
  ctx.events.push({ type: 'yeoksinEnter', stage: y.stage, seat: to, from, enterTick: ctx.tick, hp: e.hp, maxHp: e.maxHp });
}

export function yeoksinStep2(match: MatchState, ctx: StepMatchResult): void {
  const data = match.data;
  const t = ctx.tick;
  const y = match.yeoksin;
  if (y && y.seat !== null && (t === y.enterTick + stayTicks(data) || !match.seats[y.seat]!.alive)) {
    moveTo(match, nextAliveSeat(match, y.seat), ctx);
  }
  for (const def of coopOf(data).yeoksin) {
    if (t !== roundStartTick(data, def.startRound)) continue;
    const maxHp = yeoksinMaxHp(data, match.ring.length, def.stage);
    const enemy: Enemy = {
      id: -def.stage, defId: def.enemy, hp: maxHp, maxHp, d: 0, boss: false, round: def.startRound,
      stunTicks: 0, slow: null, vulns: {}, dots: {}, fireHit: {},
    };
    match.yeoksin = { stage: def.stage, enemy, seat: null, enterTick: t };
    ctx.events.push({ type: 'yeoksinSpawn', stage: def.stage, maxHp });
    const start = match.ring[def.startIndex % match.ring.length]!;
    moveTo(match, match.seats[start]!.alive ? start : nextAliveSeat(match, start), ctx);
  }
}

export function yeoksinPosition(match: MatchState, seat: number): void {
  const y = match.yeoksin;
  if (!y || y.seat !== seat) return;
  y.enemy.d = (laneOf(match).perimeter * (match.tick - y.enterTick + 1)) / stayTicks(match.data);
}

export function yeoksinAfterLane(match: MatchState, seat: number, ctx: StepMatchResult): void {
  const y = match.yeoksin;
  if (!y || y.seat !== seat) return;
  const coop = coopOf(match.data);
  const e = y.enemy;
  const step = ctx.lanes[seat];
  if (step) {
    const hits: number[] = [];
    for (let i = step.combatStart; i < step.events.length; i++) {
      const ev = step.events[i]!;
      if (ev.type === 'damage' && ev.enemyId === e.id) hits.push(ev.amount);
    }
    let hp = e.hp + hits.reduce((a, b) => a + b, 0);
    let credit = 0;
    for (const amount of hits) {
      credit += Math.max(0, Math.min(amount, hp));
      hp -= amount;
    }
    match.seats[seat]!.yeoksinDamage[y.stage - 1]! += credit;
  }
  if (e.hp > 0) return;

  match.yeoksinKills = y.stage;
  const alive = match.ring.filter(s => match.seats[s]!.alive);
  for (const s of alive) {
    const lane = match.lanes[s]!;
    lane.coins += coop.killReward.coins;
    lane.buckwheat += coop.killReward.buckwheat;
  }
  let topSeat: number | null = null;
  if (match.ring.length >= 2) {
    let best = 0;
    for (const s of alive) {
      const dmg = match.seats[s]!.yeoksinDamage[y.stage - 1]!;
      if (dmg > best) { best = dmg; topSeat = s; }
    }
    if (topSeat !== null) match.lanes[topSeat]!.coins += coop.topDamageBonus;
  }
  const lane = match.lanes[seat]!;
  const i = lane.enemies.indexOf(e);
  if (i >= 0) lane.enemies.splice(i, 1);
  ctx.events.push({ type: 'yeoksinKilled', stage: y.stage, seat, topSeat });
  match.yeoksin = null;
}

/**
 * No-gate runs only: a yeoksin still alive at the end of its deadline tick leaves the board without a kill or reward,
 * so a missed gate counts as missed and the mask never walks into later rounds.
 */
export function expireMissedYeoksin(match: MatchState, ctx: StepMatchResult): void {
  const y = match.yeoksin;
  if (!y || ctx.tick !== gateDeadlineTick(match.data, y.stage)) return;
  moveTo(match, null, ctx);
  match.yeoksin = null;
}

export function gateFailed(match: MatchState, tick: number): boolean {
  const data = match.data;
  if (!data.coop) return false;
  return data.coop.yeoksin.some(y => gateDeadlineTick(data, y.stage) === tick && match.yeoksinKills < y.stage);
}
