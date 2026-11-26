import type { Enemy, GameEvent, GameState } from '../types';
import { isEvent } from '../stats';
import { bossDrop, openMarketAfterBoss } from './market';
import { eventDamage, eventKill, eventsRoundEnd, eventsRoundStart } from './events';
import { collectionRoundEnd } from './quests';

/** Lane economy hooks. Callers invoke them only when `state.econ` exists. */

export function econRoundStart(state: GameState, events: GameEvent[]): void {
  state.econ!.roundKills = 0;
  eventsRoundStart(state, events);
}

/** Runs on the last tick of a round, after the survival checks and before the round-end coins. */
export function econRoundEnd(state: GameState, events: GameEvent[]): void {
  collectionRoundEnd(state);
  eventsRoundEnd(state, events);
}

/** The part of `amount` a hit on an event enemy really takes off (a shadow's hold). */
export function econEventDamage(state: GameState, enemy: Enemy, amount: number): number {
  return isEvent(state.data, enemy) ? eventDamage(state, enemy, amount) : amount;
}

/** Settles a dead event enemy; returns true when `enemy` is an event enemy (no normal kill reward). */
export function econEventKill(state: GameState, enemy: Enemy, events: GameEvent[]): boolean {
  if (!isEvent(state.data, enemy)) return false;
  eventKill(state, enemy, events);
  return true;
}

export function econBossKill(state: GameState, round: number, events: GameEvent[]): void {
  openMarketAfterBoss(state, round);
  bossDrop(state, events, round);
}
