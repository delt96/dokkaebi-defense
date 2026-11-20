import type { Enemy, GameData, GameState, RoundStats } from './types';

const sharedCache = new WeakMap<GameData, Set<string>>();
export function isShared(data: GameData, e: Enemy): boolean {
  let ids = sharedCache.get(data);
  if (!ids) { ids = new Set(data.enemies.filter(d => d.shared).map(d => d.id)); sharedCache.set(data, ids); }
  return ids.has(e.defId);
}

export function countNormalEnemies(state: GameState): number {
  let n = 0;
  for (const e of state.enemies) if (!e.boss && e.hp > 0 && !isShared(state.data, e)) n++;
  return n;
}

export function currentStats(state: GameState): RoundStats | undefined {
  return state.stats[state.stats.length - 1];
}

export function statsForRound(state: GameState, round: number): RoundStats | undefined {
  for (let i = state.stats.length - 1; i >= 0; i--) if (state.stats[i]!.round === round) return state.stats[i];
  return undefined;
}
