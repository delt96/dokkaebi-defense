import type { GameEvent, GameState } from '../types';
import { toTicks } from '../flow';
import { registerCommand } from '../registry';
import { spawnEventEnemy } from './events';

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
  return null;
});

/** Settles the personal mission on the last tick of its round. */
export function missionRoundEnd(state: GameState, events: GameEvent[]): void {
  const m = state.data.economy?.mission;
  const econ = state.econ!;
  if (!m || state.round !== m.round || econ.mission.phase !== 'active') return;
  if (econ.roundKills >= m.kills && econ.mission.beastDown) {
    econ.mission.phase = 'won';
    state.coins += m.reward.coins;
    state.buckwheat += m.reward.buckwheat;
    events.push({ type: 'questReward', quest: 'mission', coins: m.reward.coins, buckwheat: m.reward.buckwheat, tokens: 0 });
  } else {
    econ.mission.phase = 'lost';
  }
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
  }
}
