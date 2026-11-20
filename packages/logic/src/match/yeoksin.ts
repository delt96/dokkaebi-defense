import type { MatchState, StepMatchResult } from './types';

// Skeleton: Task 7 fills in the yeoksin and the story gates.

export function yeoksinStep2(_match: MatchState, _ctx: StepMatchResult): void {}

export function yeoksinPosition(_match: MatchState, _seat: number): void {}

export function yeoksinAfterLane(_match: MatchState, _seat: number, _ctx: StepMatchResult): void {}

export function gateFailed(_match: MatchState, _tick: number): boolean {
  return false;
}
