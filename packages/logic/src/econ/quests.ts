import type { GameEvent, GameState } from '../types';
import { setQuest } from './results';

/** Closes the collection challenge on its last night when it was not completed. */
export function collectionRoundEnd(state: GameState): void {
  const c = state.data.economy?.collection;
  const econ = state.econ!;
  if (!c || econ.collection.paid || state.round !== c.toRound) return;
  setQuest(state, 'collection', 'timedOut', { done: [...econ.collection.done] });
}

/** Registers an own combine for the collection challenge; pays once all items are registered. */
export function onCollectionCombine(state: GameState, resultId: string, events: GameEvent[]): void {
  const c = state.data.economy?.collection;
  const econ = state.econ;
  if (!c || !econ || econ.collection.paid) return;
  if (state.round < c.fromRound || state.round > c.toRound || !c.items.includes(resultId)) return;
  if (econ.collection.done.includes(resultId)) return;
  econ.collection.done.push(resultId);
  if (c.items.every(id => econ.collection.done.includes(id))) {
    econ.collection.paid = true;
    state.coins += c.coins;
    events.push({ type: 'questReward', quest: 'collection', coins: c.coins, buckwheat: 0, tokens: 0 });
    setQuest(state, 'collection', 'won', { done: [...econ.collection.done] }, { coins: c.coins });
  } else {
    setQuest(state, 'collection', 'active', { done: [...econ.collection.done] });
  }
}
