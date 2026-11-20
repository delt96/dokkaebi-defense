import type { Enemy, GameData, GameState, Unit } from './types';
import { loadGameData } from './data';
import { spawnEnemy, startRound } from './flow';
import { addUnit } from './units';
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
