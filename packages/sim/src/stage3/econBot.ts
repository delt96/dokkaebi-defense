import {
  availableRecipes, marketView, tameCheck, toTicks, unitDefFast, type Command, type GameState,
} from '@dorandi/logic';
import type { Bot } from '../bots';
import { expandTree, remainingNeed, targetBot } from './targetBot';

export interface EconPolicy { market: boolean; quests: boolean; tame: boolean }
export type TargetBot = Bot & { currentTarget(): string | null };

const FINAL_COMBINE_COINS = 60;
const MAX_TAMED = 2;
const SWITCH_MARGIN = 4;

const holdsTree5 = (state: GameState, target: string | null): boolean => {
  if (!target) return false;
  const tree = expandTree(state.data, target);
  return state.slots.some(u => u && tree.has(u.defId) && unitDefFast(state.data, u.defId).grade === 5);
};

/** Coins kept back for the final combine: 60 once a grade 5 of the target tree is held. */
export function reserveCoins(state: GameState, target: string | null): number {
  return holdsTree5(state, target) ? FINAL_COMBINE_COINS : 0;
}

/** Buckwheat wanted on hand: the next two grade-5 combines of the tree and the final combine. */
export function buckwheatNeed(state: GameState, target: string | null): number {
  if (!target) return 0;
  const { missing } = remainingNeed(state, target);
  let fives = 0;
  for (const [id, n] of missing) if (unitDefFast(state.data, id).grade === 5) fives += n;
  const held = state.slots.some(u => u?.defId === target);
  return Math.min(2, fives) + (held ? 0 : 1);
}

const freeSlots = (state: GameState): number => state.slots.filter((u, i) => !u && state.open[i]).length;

export function marketCommands(state: GameState, target: string | null, freeAfter = freeSlots(state)): Command[] {
  const view = marketView(state);
  if (!view || state.phase !== 'round' || state.round < 1) return [];
  const reserve = state.round === 1 ? 0 : buckwheatNeed(state, target);
  const affordable = Math.floor((state.buckwheat - reserve) / view.draw.buckwheatCost);
  const count = Math.max(0, Math.min(affordable, freeAfter, view.draw.left));
  return Array.from({ length: count }, () => ({ type: 'buy', item: 'draw' }));
}

/** Story target on change, the personal mission when affordable, and missing collection combines. */
export function questCommands(state: GameState, target: string | null): Command[] {
  const econ = state.econ;
  const eco = state.data.economy;
  if (!econ || !eco) return [];
  const cmds: Command[] = [];
  if (eco.story && econ.story.target !== target) cmds.push({ type: 'storyTarget', id: target });
  const m = eco.mission;
  if (m && state.phase === 'round' && state.round === m.round && econ.mission.phase === 'idle'
      && state.tick < state.roundStartTick + toTicks(m.entrySeconds) && state.coins - m.fee >= reserveCoins(state, target)) {
    cmds.push({ type: 'missionEnter' });
  }
  const c = eco.collection;
  if (c && !econ.collection.paid && state.round >= c.fromRound && state.round <= c.toRound) {
    const can = new Set(availableRecipes(state));
    const item = c.items.find(id => !econ.collection.done.includes(id) && can.has(id));
    if (item) cmds.push({ type: 'combine', result: item });
  }
  return cmds;
}

/** One tame per decision while fewer than two hidden units are tamed and the cost leaves the target's needs intact. */
export function tameCommands(state: GameState, target: string | null): Command[] {
  const econ = state.econ;
  const tame = state.data.economy?.tame;
  if (!econ || !tame || econ.tamed.length >= MAX_TAMED) return [];
  for (const e of state.enemies) {
    if (e.hp <= 0 || tameCheck(state, e.id) !== null) continue;
    const def = tame.targets.find(t => t.enemy === e.defId)!;
    const cost = def.cost;
    if (cost.buckwheat && state.buckwheat - cost.buckwheat < buckwheatNeed(state, target)) continue;
    if (cost.coins && state.coins - cost.coins < reserveCoins(state, target)) continue;
    if (cost.tokens && state.tokens < cost.tokens) continue;
    return [{ type: 'tame', enemyId: e.id }];
  }
  return [];
}

/** Grade-1 value still missing for `target` once holdings are counted. */
export function remainingValue(state: GameState, target: string): number {
  const { missing } = remainingNeed(state, target);
  let v = 0;
  for (const [id, n] of missing) if (unitDefFast(state.data, id).grade === 1) v += n;
  return v;
}

/** Normal grade 6 not yet built with the smallest remaining value, if it beats `current` by the switch margin. */
export function betterTarget(state: GameState, current: string, done: ReadonlySet<string>): string | null {
  const cur = remainingValue(state, current);
  let best: string | null = null;
  let bestValue = Infinity;
  const ids = state.data.units.filter(u => u.grade === 6 && !u.hidden && !done.has(u.id)).map(u => u.id).sort();
  for (const id of ids) {
    const v = remainingValue(state, id);
    if (v < bestValue) { best = id; bestValue = v; }
  }
  return best !== null && best !== current && bestValue <= cur - SWITCH_MARGIN ? best : null;
}

/** Target bot that re-picks its target at each new round when another grade 6 is at least 4 value closer. */
export function switchBot(seed: number, policy: EconPolicy): TargetBot {
  return targetBot(seed, { policy, switchTargets: true });
}

/**
 * Switch bot that also plays to its main damage type: targets score by missing value less a bonus for matching and
 * supporting that type, upgrades go to that line, supporting units are kept, and ally auras move next to the units they
 * boost.
 */
export function synergyBot(seed: number, policy: EconPolicy): TargetBot {
  return targetBot(seed, { policy, switchTargets: true, synergy: true });
}
