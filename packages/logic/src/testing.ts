import type { Enemy, GameData, GameState, Unit } from './types';
import { loadGameData } from './data';
import { spawnEnemy, startRound } from './flow';
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
  const unit: Unit = { id: state.nextId++, defId, cooldown: 0, attackCount: 0, periodic: [] };
  state.slots[slot] = unit;
  return unit;
}

export function makeData(patch: (d: GameData) => void): GameData {
  const d = loadGameData();
  patch(d);
  return d;
}
