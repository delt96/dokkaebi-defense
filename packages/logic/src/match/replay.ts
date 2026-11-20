import type { GameData } from '../types';
import type { MatchInput, MatchOptions } from './types';
import { createMatch, matchHash } from './create';
import { stepMatch } from './step';

export interface InputLogEntry { tick: number; inputs: MatchInput[] }

const MAX_TICKS = 200_000;

/** Replays a recorded input log on a fresh match and returns [tick, matchHash] every `every` ticks, until the match has a result. */
export function replayMatch(
  data: GameData, seed: number, seats: number[], log: InputLogEntry[], every = 100, options: MatchOptions = {},
): [number, string][] {
  const match = createMatch(data, seed, seats, options);
  const byTick = new Map<number, MatchInput[]>();
  for (const entry of log) byTick.set(entry.tick, entry.inputs);
  const hashes: [number, string][] = [];
  while (match.result === null && match.tick < MAX_TICKS) {
    stepMatch(match, byTick.get(match.tick) ?? []);
    if (match.tick % every === 0) hashes.push([match.tick, matchHash(match)]);
  }
  return hashes;
}
