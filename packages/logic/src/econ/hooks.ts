import type { Enemy, GameEvent, GameState } from '../types';
import { isEvent } from '../stats';
import { bossDrop } from './market';

/** Lane economy hooks. Callers invoke them only when `state.econ` exists. */

export function econRoundStart(_state: GameState, _events: GameEvent[]): void {}

export function econTick(_state: GameState, _events: GameEvent[]): void {}

/** Runs on the last tick of a round, after the survival checks and before the round-end coins. */
export function econRoundEnd(_state: GameState, _events: GameEvent[]): void {}

/** Settles a dead event enemy; returns true when `enemy` is an event enemy (no normal kill reward). */
export function econEventKill(state: GameState, enemy: Enemy, _events: GameEvent[]): boolean {
  return isEvent(state.data, enemy);
}

export function econBossKill(state: GameState, events: GameEvent[]): void {
  bossDrop(state, events);
}
