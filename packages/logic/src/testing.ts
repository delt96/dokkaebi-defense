import type { Enemy, GameData, GameState, Unit } from './types';
import type { MatchState, StepMatchResult, MatchInput } from './match/types';
import { loadGameData } from './data';
import { spawnEnemy, startRound, waveOf } from './flow';
import { isShared } from './stats';
import { addUnit } from './units';
import { roundAtTick, roundStartTick } from './match/schedule';
import { stepMatch } from './match/step';
import './index';

export function forceRound(state: GameState, round: number): void {
  state.enemies = [];
  state.fires = [];
  state.overLimitTicks = 0;
  startRound(state, round, []);
}

export function spawnEnemyForTest(state: GameState, defId: string, d: number, hp?: number): Enemy {
  const e = spawnEnemy(state, defId, Math.max(1, state.round), []);
  e.d = d;
  if (hp !== undefined) { e.hp = hp; e.maxHp = hp; }
  return e;
}

export function placeUnitForTest(state: GameState, defId: string, slot: number): Unit {
  return addUnit(state, defId, slot, []);
}

export function makeData(patch: (d: GameData) => void, stage: 'stage1' | 'stage2' = 'stage1'): GameData {
  const d = loadGameData(stage);
  patch(d);
  return d;
}

/** Fast-forwards a match to `tick` with empty lanes; the next stepMatch processes `tick` (opening a round on a boundary). */
export function jumpToTick(match: MatchState, tick: number): void {
  const data = match.data;
  if (!Number.isInteger(tick) || tick < roundStartTick(data, 1)) throw new Error(`jumpToTick needs a tick >= ${roundStartTick(data, 1)}`);
  const r = roundAtTick(data, tick - 1);
  match.tick = tick;
  match.phase = r === 0 ? 'prep' : 'round';
  match.round = r;
  match.roundStartTick = r === 0 ? 0 : roundStartTick(data, r);
  match.roundEndTick = roundStartTick(data, r + 1);
  for (const seat of match.ring) {
    if (!match.seats[seat]!.alive) continue;
    const lane = match.lanes[seat]!;
    lane.enemies = [];
    lane.fires = [];
    lane.overLimitTicks = 0;
    lane.tick = match.tick;
    lane.phase = match.phase;
    lane.round = match.round;
    lane.roundStartTick = match.roundStartTick;
    lane.roundEndTick = match.roundEndTick;
    if (r === 0) continue;
    lane.spawned = waveOf(lane, r).type === 'boss' ? 1 : data.balance.spawnCount;
    if (lane.stats[lane.stats.length - 1]?.round !== r) {
      lane.stats.push({ round: r, hpSpawned: 0, damageDealt: 0, damageInRound: 0, maxEnemies: 0, endEnemies: 0, bossKillSeconds: null });
    }
  }
  match.yeoksinKills = (data.coop?.yeoksin ?? []).filter(y => roundStartTick(data, y.deadlineRound + 1) - 1 < tick).length;
}

export function stepMatchUntil(
  match: MatchState, tick: number,
  opts: { inputs?: (tick: number) => MatchInput[]; clearEnemies?: boolean } = {},
): StepMatchResult[] {
  const out: StepMatchResult[] = [];
  while (match.tick < tick && match.result === null) {
    if (opts.clearEnemies) {
      for (const seat of match.ring) {
        if (!match.seats[seat]!.alive) continue;
        const lane = match.lanes[seat]!;
        lane.enemies = lane.enemies.filter(e => e.boss || isShared(match.data, e));
      }
    }
    out.push(stepMatch(match, opts.inputs?.(match.tick) ?? []));
  }
  return out;
}
