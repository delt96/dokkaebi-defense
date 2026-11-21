import type { EconItem, EconomyDef, GameEvent, GameState, RngState } from '../types';
import { gradeValue } from '../data';
import { nextFloat, nextInt } from '../rng';
import { registerAfterCommands, registerCommand } from '../registry';
import { receive } from '../units';

type MarketDef = NonNullable<EconomyDef['market']>;

const hasFreeSlot = (state: GameState): boolean => state.slots.some((u, i) => !u && state.open[i]);

/** Market day of the current round (1 for rounds 1-10, ...); 0 during prep. */
export function marketDay(state: GameState): number {
  const m = state.data.economy?.market;
  if (!m || state.round < 1) return 0;
  return Math.ceil(state.round / m.dayRounds);
}

function pickNormal(state: GameState, grade: number, rng: RngState): string {
  const pool = state.data.units.filter(u => u.grade === grade && !u.hidden);
  return pool[nextInt(rng, pool.length)]!.id;
}

export function marketGrade(weights: readonly number[], roll: number): 2 | 3 {
  return roll < weights[0]! / (weights[0]! + weights[1]!) ? 3 : 2;
}

function drawsToday(state: GameState): number {
  const market = state.econ!.market;
  return market.day === marketDay(state) ? market.draws : 0;
}

export function buyCheck(state: GameState, item: EconItem) {
  const m = state.data.economy?.market;
  if (!state.econ || !m || state.phase !== 'round' || state.round < 1) return 'marketClosed';
  if (item !== 'draw') return 'badArgs';
  if (drawsToday(state) >= m.draw.perDay) return 'soldOut';
  if (state.buckwheat < m.draw.buckwheatCost) return 'noBuckwheat';
  if (!hasFreeSlot(state)) return 'noSlot';
  return null;
}

registerCommand('buy', (state, cmd, events) => {
  if (cmd.type !== 'buy') return 'unknown';
  const why = buyCheck(state, cmd.item);
  if (why) return why;
  const econ = state.econ!;
  const m = state.data.economy!.market!;
  const grade = marketGrade(m.draw.weights, nextFloat(econ.rng.marketGrade));
  const defId = pickNormal(state, grade, econ.rng.marketUnit);
  const jige = nextFloat(econ.rng.jige) < m.jigeChance;
  if (jige) econ.jige++;
  state.buckwheat -= m.draw.buckwheatCost;
  econ.market = { day: marketDay(state), draws: drawsToday(state) + 1 };
  events.push({ type: 'buy', item: 'draw', defId, spentBuckwheat: m.draw.buckwheatCost, jige });
  receive(state, defId, events, gradeValue(grade));
  return null;
});

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
  day: number;
  endRound: number;
  draw: { buckwheatCost: number; left: number; weights: number[] };
  jigeChance: number;
  why: { draw: ReturnType<typeof buyCheck> };
}

export function marketView(state: GameState): MarketView | null {
  const m = state.data.economy?.market;
  if (!m || !state.econ) return null;
  const day = marketDay(state);
  return { day, endRound: Math.max(day, 1) * m.dayRounds, jigeChance: m.jigeChance,
    draw: { buckwheatCost: m.draw.buckwheatCost, left: m.draw.perDay - drawsToday(state), weights: [...m.draw.weights] },
    why: { draw: buyCheck(state, 'draw') } };
}
