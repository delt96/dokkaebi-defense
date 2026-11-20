import type { RejectReason } from '../types';
import type { MatchInput, MatchState, StepMatchResult } from './types';

// Skeleton: Task 6 fills in elimination, disconnects, boss clocks, spirit support and the team result.

export function expireDisconnects(_match: MatchState, _ctx: StepMatchResult): void {}

export function applySeatCommand(_match: MatchState, _input: MatchInput, _ctx: StepMatchResult): RejectReason | null {
  return 'unknown';
}

export function seatsOnRoundStart(_match: MatchState): void {}

export function onBossSpawned(_match: MatchState, _seat: number, _round: 10 | 20, _enemyId: number, _ctx: StepMatchResult): void {}

export function seatsAfterLane(_match: MatchState, _seat: number, _ctx: StepMatchResult): void {}

export function judgeSeats(_match: MatchState, _overLimit: number[], _ctx: StepMatchResult): void {}

export function decideResult(_match: MatchState, _ctx: StepMatchResult): void {}
