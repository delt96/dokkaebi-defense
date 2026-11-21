import type { GameState, QuestId, QuestOutcome, QuestProgress, QuestRecord } from '../types';

const NONE = { coins: 0, buckwheat: 0, tokens: 0 };

/** Writes (or replaces) the lane's one record for `id`: what happened, what it actually paid and its last counts. */
export function setQuest(
  state: GameState, id: QuestId, outcome: QuestOutcome, progress: QuestProgress = {},
  reward: Partial<QuestRecord['reward']> = {},
): void {
  const econ = state.econ;
  if (!econ) return;
  econ.questResults[id] = { outcome, reward: { ...NONE, ...reward }, progress };
}

export function questOutcome(state: GameState, id: QuestId): QuestOutcome | null {
  return state.econ?.questResults[id]?.outcome ?? null;
}

/** A seat that falls closes its open quests as 'eliminated', keeping the counts it had. */
export function closeQuestsOnElimination(state: GameState): void {
  const results = state.econ?.questResults;
  if (!results) return;
  for (const rec of Object.values(results)) if (rec && rec.outcome === 'active') rec.outcome = 'eliminated';
}
