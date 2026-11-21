import type { GameData } from '../types';
import type { MatchInput, MatchOptions } from './types';
import { createMatch, matchHash } from './create';
import { stepMatch } from './step';

export interface InputLogEntry { tick: number; inputs: MatchInput[] }

export interface RecordedMatch {
  rulesRevision: string;
  dataVersion: string;
  stage: 'stage2' | 'stage3';
  seed: number;
  seats: number[];
  options: MatchOptions;
  log: unknown[];
}

const MAX_TICKS = 200_000;

/**
 * Replays a recorded input log on a fresh match and returns [tick, matchHash] every `every` ticks, until the match has a result.
 * The end tick always gets a final entry (when it is not already a multiple of `every`), so the result is compared too.
 */
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
  if (match.tick % every !== 0) hashes.push([match.tick, matchHash(match)]);
  return hashes;
}
