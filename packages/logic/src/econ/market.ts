import type { GameEvent, GameState, RngState } from '../types';
import { gradeValue } from '../data';
import { nextInt } from '../rng';
import { registerAfterCommands } from '../registry';
import { receive } from '../units';
import { gambleView, type GambleView } from './gamble';

function pickNormal(state: GameState, grade: number, rng: RngState): string {
  const pool = state.data.units.filter(u => u.grade === grade && !u.hidden);
  return pool[nextInt(rng, pool.length)]!.id;
}

/** A personal boss killed or tamed: from the unlock round's boss on, the draw opens. */
export function openMarketAfterBoss(state: GameState, round: number): void {
  const unlock = state.data.economy?.market?.openAfterBossRound;
  if (state.econ && unlock !== undefined && round >= unlock) state.econ.marketOpen = true;
}

/** Boss-kill drop for the boss's spawn round, placed now or queued for the next free slot. */
export function bossDrop(state: GameState, events: GameEvent[], round = state.round): void {
  const econ = state.econ!;
  const drop = state.data.economy?.drops?.find(d => d.round === round);
  if (!drop) return;
  const defId = pickNormal(state, drop.grade, econ.rng.drop);
  if (!receive(state, defId, events, gradeValue(drop.grade))) econ.pendingDrops.push(defId);
}

export function placePendingDrops(state: GameState, events: GameEvent[]): void {
  const econ = state.econ;
  if (!econ) return;
  while (econ.pendingDrops.length) {
    const defId = econ.pendingDrops[0]!;
    const grade = state.data.units.find(u => u.id === defId)!.grade;
    if (!receive(state, defId, events, gradeValue(grade))) break;
    econ.pendingDrops.shift();
  }
}

registerAfterCommands(placePendingDrops);

export interface MarketView {
  jigeChance: number;
  gamble?: GambleView;
}

export function marketView(state: GameState): MarketView | null {
  const m = state.data.economy?.market;
  if (!m || !state.econ) return null;
  const gamble = gambleView(state);
  return { ...(gamble && { gamble }), jigeChance: m.jigeChance };
}
