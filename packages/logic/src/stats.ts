import type { GameState, RoundStats } from './types';

export function countNormalEnemies(state: GameState): number {
  let n = 0;
  for (const e of state.enemies) if (!e.boss && e.hp > 0) n++;
  return n;
}

export function currentStats(state: GameState): RoundStats | undefined {
  return state.stats[state.stats.length - 1];
}

export function statsForRound(state: GameState, round: number): RoundStats | undefined {
  for (let i = state.stats.length - 1; i >= 0; i--) if (state.stats[i]!.round === round) return state.stats[i];
  return undefined;
}
