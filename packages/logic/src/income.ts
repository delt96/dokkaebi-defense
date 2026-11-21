import type { GameState } from './types';
import { toTicks } from './flow';
import { unitDefFast } from './units';

type Income = NonNullable<GameState['income']>;

function incomeFor(state: GameState): Income {
  if (!state.income || state.income.round !== state.round) {
    state.income = { round: state.round, firstHit: {}, timerTicks: {}, timerPaid: {} };
  }
  return state.income;
}

/** Repayment clocks: each unit type with a coin timer on the board pays on its own clock, capped per round. */
export function runIncome(state: GameState): void {
  if (state.phase !== 'round') return;
  const seen = new Set<string>();
  for (const u of state.slots) {
    if (!u || seen.has(u.defId)) continue;
    seen.add(u.defId);
    for (const s of unitDefFast(state.data, u.defId).skills) {
      for (const e of s.effects) {
        if (e.kind !== 'coinTimer') continue;
        const inc = incomeFor(state);
        const ticks = (inc.timerTicks[u.defId] ?? 0) + 1;
        inc.timerTicks[u.defId] = ticks;
        const paid = inc.timerPaid[u.defId] ?? 0;
        if (ticks % toTicks(e.everySeconds) === 0 && paid < e.maxPerRound) {
          state.coins += e.coins;
          inc.timerPaid[u.defId] = paid + e.coins;
        }
      }
    }
  }
}

/** Pays a unit type's first basic hit of the round once. */
export function payFirstHit(state: GameState, defId: string, coins: number): void {
  const inc = incomeFor(state);
  if (inc.firstHit[defId]) return;
  inc.firstHit[defId] = true;
  state.coins += coins;
}
