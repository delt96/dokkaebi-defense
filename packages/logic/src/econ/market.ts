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

function jarPeriod(state: GameState, m: MarketDef): number {
  return state.round < 1 ? 0 : Math.ceil(state.round / m.jar.periodRounds);
}

/** Bundle purchases already made today and jar progress this period, as they read after any day/period change. */
function bundleBought(state: GameState): number {
  const b = state.econ!.bundle;
  return b.day === marketDay(state) ? b.bought : 0;
}

function jarProgress(state: GameState, m: MarketDef): { done: number; missed: boolean } {
  const j = state.econ!.jar;
  return j.period === jarPeriod(state, m) ? { done: j.done, missed: j.missed } : { done: 0, missed: false };
}

function pickNormal(state: GameState, grade: number, rng: RngState): string {
  const pool = state.data.units.filter(u => u.grade === grade && !u.hidden);
  return pool[nextInt(rng, pool.length)]!.id;
}

/** Why buying `item` now would be refused (checked in the same order as the purchase), or null when it would go through. */
export function buyCheck(state: GameState, item: EconItem): 'marketClosed' | 'soldOut' | 'noCoins' | 'noSlot' | null {
  const m = state.data.economy?.market;
  if (!state.econ || !m || state.phase !== 'round' || state.round < 1) return 'marketClosed';
  if (item === 'bundle') {
    if (bundleBought(state) >= m.bundle.perDay) return 'soldOut';
    if (state.coins < m.bundle.price) return 'noCoins';
    if (!hasFreeSlot(state)) return 'noSlot';
    return null;
  }
  const { done, missed } = jarProgress(state, m);
  if (done >= m.jar.perPeriod) return 'soldOut';
  if (state.coins < m.jar.price) return 'noCoins';
  if (!missed && !hasFreeSlot(state)) return 'noSlot';
  return null;
}

function buyBundle(state: GameState, m: MarketDef, events: GameEvent[]) {
  const econ = state.econ!;
  const day = marketDay(state);
  const reason = buyCheck(state, 'bundle');
  if (reason) return reason;
  if (econ.bundle.day !== day) { econ.bundle.day = day; econ.bundle.bought = 0; }
  state.coins -= m.bundle.price;
  econ.bundle.bought++;
  const grade = econ.bundle.left.splice(nextInt(econ.rng.bundle, econ.bundle.left.length), 1)[0]!;
  if (econ.bundle.left.length === 0) econ.bundle.left = [...m.bundle.deck];
  const defId = pickNormal(state, grade, econ.rng.bundle);
  let jige = false;
  if (!econ.jige && nextFloat(econ.rng.jige) < m.jigeChance) { econ.jige = true; jige = true; }
  events.push({ type: 'buy', item: 'bundle', defId, buckwheat: 0, jige });
  receive(state, defId, events, gradeValue(grade));
  return null;
}

function buyJar(state: GameState, m: MarketDef, events: GameEvent[]) {
  const econ = state.econ!;
  const { missed } = jarProgress(state, m);
  const reason = buyCheck(state, 'jar');
  if (reason) return reason;
  const period = jarPeriod(state, m);
  if (econ.jar.period !== period) econ.jar = { period, done: 0, missed: false };
  state.coins -= m.jar.price;
  if (missed || nextFloat(econ.rng.jar) < m.jar.firstChance) {
    state.buckwheat += 1;
    econ.jar.done++;
    econ.jar.missed = false;
    events.push({ type: 'buy', item: 'jar', defId: null, buckwheat: 1, jige: false });
    return null;
  }
  econ.jar.missed = true;
  const defId = pickNormal(state, 1, econ.rng.jar);
  events.push({ type: 'buy', item: 'jar', defId, buckwheat: 0, jige: false });
  receive(state, defId, events, gradeValue(1));
  return null;
}

registerCommand('buy', (state, cmd, events) => {
  if (cmd.type !== 'buy') return 'unknown';
  const m = state.data.economy?.market;
  if (!state.econ || !m || state.phase !== 'round' || state.round < 1) return 'marketClosed';
  if (cmd.item === 'bundle') return buyBundle(state, m, events);
  if (cmd.item === 'jar') return buyJar(state, m, events);
  return 'badArgs';
});

/** Boss-kill drop for the current round, placed now or queued for the next free slot. */
export function bossDrop(state: GameState, events: GameEvent[]): void {
  const econ = state.econ!;
  const drop = state.data.economy?.drops?.find(d => d.round === state.round);
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
  bundle: { price: number; left: number; odds: Record<number, number> };
  /** `missed`: the first draw this period gave a material, so the next jar is a sure buckwheat. */
  jar: { price: number; left: number; chance: number; missed: boolean };
  shortAfter: { bundle: number; jar: number } | null;
}

export function marketView(state: GameState): MarketView | null {
  const m = state.data.economy?.market;
  const econ = state.econ;
  if (!m || !econ) return null;
  const deck = econ.bundle.left;
  const odds: Record<number, number> = {};
  for (const g of m.bundle.deck) odds[g] = deck.filter(x => x === g).length / deck.length;
  const jar = jarProgress(state, m);
  let shortAfter: MarketView['shortAfter'] = null;
  const target = econ.story.target;
  if (target) {
    const fee = state.data.recipes.find(r => r.result === target)?.cost?.coins ?? 0;
    const short = (price: number) => Math.max(0, fee - (state.coins - price));
    shortAfter = { bundle: short(m.bundle.price), jar: short(m.jar.price) };
  }
  return {
    bundle: { price: m.bundle.price, left: Math.max(0, m.bundle.perDay - bundleBought(state)), odds },
    jar: { price: m.jar.price, left: Math.max(0, m.jar.perPeriod - jar.done), chance: jar.missed ? 1 : m.jar.firstChance, missed: jar.missed },
    shortAfter,
  };
}
