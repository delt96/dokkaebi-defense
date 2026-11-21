import type { Enemy, GameData, GameState, Unit } from './types';
import type { MatchState, StepMatchResult, MatchInput } from './match/types';
import { loadGameData } from './data';
import { spawnEnemy, startRound } from './flow';
import { isShared } from './stats';
import { addUnit } from './units';
import { stepMatch } from './match/step';
import './index';

export { jumpToTick } from './match/jump';

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

export function makeData(patch: (d: GameData) => void, stage: 'stage1' | 'stage2' | 'stage3' = 'stage1'): GameData {
  const d = loadGameData(stage);
  patch(d);
  return d;
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
