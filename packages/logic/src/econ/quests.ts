import type { GameEvent, GameState } from '../types';
import { toTicks } from '../flow';
import { registerCommand } from '../registry';
import { spawnEventEnemy } from './events';
import { setQuest } from './results';

registerCommand('missionEnter', (state, _cmd, events) => {
  const m = state.data.economy?.mission;
  const econ = state.econ;
  if (!m || !econ) return 'missionClosed';
  const open = state.phase === 'round' && state.round === m.round && state.tick < state.roundStartTick + toTicks(m.entrySeconds);
  if (!open || econ.mission.phase !== 'idle') return 'missionClosed';
  if (state.coins < m.fee) return 'noCoins';
  state.coins -= m.fee;
  const beast = spawnEventEnemy(state, 'beast', events);
  econ.mission = { phase: 'active', beastId: beast.id, beastDown: false };
  setQuest(state, 'mission', 'active', { kills: 0, beastDown: false });
  return null;
});

/** Settles the personal mission on the last tick of its round. */
export function missionRoundEnd(state: GameState, events: GameEvent[]): void {
  const m = state.data.economy?.mission;
  const econ = state.econ!;
  if (!m || state.round !== m.round) return;
  if (econ.mission.phase === 'idle') { setQuest(state, 'mission', 'missedEntry'); return; }
  if (econ.mission.phase !== 'active') return;
  // frozen here: roundKills resets at the next round start
  const progress = { kills: econ.roundKills, beastDown: econ.mission.beastDown };
  if (econ.roundKills >= m.kills && econ.mission.beastDown) {
    econ.mission.phase = 'won';
    state.coins += m.reward.coins;
    state.buckwheat += m.reward.buckwheat;
    events.push({ type: 'questReward', quest: 'mission', coins: m.reward.coins, buckwheat: m.reward.buckwheat, tokens: 0 });
    setQuest(state, 'mission', 'won', progress, { coins: m.reward.coins, buckwheat: m.reward.buckwheat });
  } else {
    econ.mission.phase = 'lost';
    setQuest(state, 'mission', 'timedOut', progress);
  }
}

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
