import { createGame, step } from './game';
import type { Command, Difficulty, GameData, GameState } from './types';

/** The commands a solo game passed to `step` on one tick; ticks without commands are left out. */
export interface SoloLogEntry { tick: number; commands: Command[] }

/** Replays a solo record; after its last entry the game keeps stepping until it ends or reaches `maxTicks`. */
export function replayGame(data: GameData, seed: number, difficulty: Difficulty | undefined, log: SoloLogEntry[], maxTicks = Infinity): GameState {
  const state = createGame(data, seed, difficulty);
  const byTick = new Map(log.map(e => [e.tick, e.commands]));
  while (state.phase !== 'ended' && state.tick < maxTicks) step(state, structuredClone(byTick.get(state.tick) ?? []));
  return state;
}
