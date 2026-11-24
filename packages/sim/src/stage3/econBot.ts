import {
  availableRecipes, boardDps, countNormalEnemies, gambleCheck, huntCheck, huntHp, jigeCandidates, tameCheck, unitDefFast,
  type Command, type GambleCommand, type GameState,
} from '@dorandi/logic';
import type { Bot } from '../bots';
import { expandTree, remainingNeed, targetBot } from './targetBot';

/**
 * `jige`: spend held 지게 on missing materials (off: hold them; the grant rolls are the same either way).
 * `hunts`: summon 격파 targets the board can kill (missing: off).
 */
export interface EconPolicy { quests: boolean; tame: boolean; jige?: boolean; hunts?: boolean }
export type TargetBot = Bot & { currentTarget(): string | null };

const MAX_TAMED = 2;
const SWITCH_MARGIN = 4;

const holdsTree5 = (state: GameState, target: string | null): boolean => {
  if (!target) return false;
  const tree = expandTree(state.data, target);
  return state.slots.some(u => u && tree.has(u.defId) && unitDefFast(state.data, u.defId).grade === 5);
};

/** Coins kept back for the final combine: its recipe coin cost once a grade 5 of the target tree is held. */
export function reserveCoins(state: GameState, target: string | null): number {
  if (!holdsTree5(state, target)) return 0;
  return state.data.recipes.find(r => r.result === target && r.kind !== 'tame')?.cost?.coins ?? 0;
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

/**
 * Share of the board's basic-attack DPS × the time limit a 격파 target's HP may reach for the bots to summon it.
 * Probing synergy boards, one event enemy took about a quarter to a third of that figure in 45 s (units out of reach,
 * moving target), so 0.15 leaves roughly a 2× margin.
 */
export const BOT_HUNT_SHARE = 0.15;

const GAMBLE_RESERVE = 85;

export function surplusGamble(state: GameState, target: string | null, betCoins = true): GambleCommand | null {
  const g = state.data.economy?.market?.gamble;
  if (!g) return null;
  const surplusMuk = state.buckwheat - buckwheatNeed(state, target);
  for (const table of ['big', 'small'] as const) {
    const cmd = { type: 'gambleUnit', table } as const;
    if (surplusMuk >= g.units.tables[table].buckwheatCost && gambleCheck(state, cmd) === null) return cmd;
  }
  if (!betCoins) return null;
  const surplusCoins = state.coins - GAMBLE_RESERVE;
  for (const stake of [...g.coins.stakes].sort((a, b) => b - a)) {
    const cmd = { type: 'gambleCoins', stake } as const;
    if (surplusCoins >= stake && gambleCheck(state, cmd) === null) return cmd;
  }
  return null;
}

/**
 * One 격파 summon per decision: the first target that is ready, whose HP at its level is at most BOT_HUNT_SHARE of the
 * board's DPS over the time limit, whose fee leaves the final-combine reserve, while no lane boss is alive and the lane
 * is under half its enemy limit.
 */
export function huntCommands(state: GameState, target: string | null): Command[] {
  const hunts = state.data.economy?.hunts;
  if (!hunts || !state.econ || state.phase !== 'round') return [];
  if (state.enemies.some(e => e.boss && e.hp > 0) || countNormalEnemies(state) > state.data.balance.limit / 2) return [];
  const budget = BOT_HUNT_SHARE * boardDps(state) * hunts.seconds;
  for (const def of hunts.targets) {
    if (huntCheck(state, def.enemy) !== null) continue;
    const level = state.econ.hunts?.[def.enemy]?.level ?? 1;
    if (huntHp(state, def, level) > budget || state.coins - def.fee < reserveCoins(state, target)) continue;
    return [{ type: 'hunt', enemy: def.enemy }];
  }
  return [];
}

/** Missing collection combines. */
export function questCommands(state: GameState, _target: string | null): Command[] {
  const econ = state.econ;
  const eco = state.data.economy;
  if (!econ || !eco) return [];
  const cmds: Command[] = [];
  const c = eco.collection;
  if (c && !econ.collection.paid && state.round >= c.fromRound && state.round <= c.toRound) {
    const can = new Set(availableRecipes(state));
    const item = c.items.find(id => !econ.collection.done.includes(id) && can.has(id));
    if (item) cmds.push({ type: 'combine', result: item });
  }
  return cmds;
}

/**
 * One 지게 swap per decision: the highest-grade missing material of the target that a 지게 can give, taken from a
 * board unit of the same grade the target does not keep (outside its tree, or a spare copy).
 */
export function jigeCommands(state: GameState, target: string | null): Command[] {
  if (!target || !state.econ || state.econ.jige < 1) return [];
  const { missing, kept } = remainingNeed(state, target);
  const tree = expandTree(state.data, target);
  const wanted = [...missing.keys()]
    .map(id => unitDefFast(state.data, id))
    .filter(def => !def.hidden && jigeCandidates(state.data, def.id).length > 0)
    .sort((a, b) => b.grade - a.grade || a.id.localeCompare(b.id));
  const used = new Map<string, number>();
  for (const def of wanted) {
    for (let i = 0; i < state.slots.length; i++) {
      const u = state.slots[i];
      if (!u || unitDefFast(state.data, u.defId).grade !== def.grade || u.defId === def.id) continue;
      const n = (used.get(u.defId) ?? 0) + 1;
      if (tree.has(u.defId) && n <= (kept.get(u.defId) ?? 0)) { used.set(u.defId, n); continue; }
      if (!jigeCandidates(state.data, u.defId).some(c => c.id === def.id)) continue;
      return [{ type: 'jigeSwap', source: { zone: 'board', index: i, unitId: u.id }, result: def.id }];
    }
  }
  return [];
}

/** The share of max HP at or under which the measurement bots pay for an attempt (the best band). */
export const BOT_TAME_HP = 0.15;

/**
 * One paid attempt per decision while fewer than two hidden units are tamed, the target is at or under BOT_TAME_HP
 * and the cost leaves the target's needs intact.
 */
export function tameCommands(state: GameState, target: string | null): Command[] {
  const econ = state.econ;
  const tame = state.data.economy?.tame;
  if (!econ || !tame || econ.tamed.length >= MAX_TAMED) return [];
  for (const e of state.enemies) {
    if (e.hp <= 0 || e.hp > e.maxHp * BOT_TAME_HP || tameCheck(state, e.id) !== null) continue;
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
