import type { GameState, RecipeDef } from './types';
import { registerCommand } from './registry';
import { addUnit, chooseSlot, unitDefFast } from './units';
import { onCollectionCombine } from './econ/quests';

/** Units a combine can use: the board units, then the stored ones. */
function ownedCounts(state: GameState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const u of state.slots) if (u) counts.set(u.defId, (counts.get(u.defId) ?? 0) + 1);
  for (const u of state.storage ?? []) counts.set(u.defId, (counts.get(u.defId) ?? 0) + 1);
  return counts;
}

function missingFrom(state: GameState, materials: string[]): string[] {
  const counts = ownedCounts(state);
  const missing: string[] = [];
  for (const m of materials) {
    const c = counts.get(m) ?? 0;
    if (c > 0) counts.set(m, c - 1);
    else missing.push(m);
  }
  return missing;
}

export function missingMaterials(state: GameState, result: string): string[] {
  const recipe = state.data.recipes.find(r => r.result === result);
  return recipe ? missingFrom(state, recipe.materials) : [];
}

/** The round an exclusive (tame) recipe opens at while it is still shut, else null. */
export function combineLockRound(state: GameState, recipe: RecipeDef | undefined): number | null {
  const from = state.data.economy?.tame?.combineFromRound;
  return recipe?.kind === 'tame' && from !== undefined && state.round < from ? from : null;
}

function costShortfall(state: GameState, recipe: RecipeDef): 'noBuckwheat' | 'noCoins' | null {
  if ((recipe.cost?.buckwheat ?? 0) > state.buckwheat) return 'noBuckwheat';
  if ((recipe.cost?.coins ?? 0) > state.coins) return 'noCoins';
  return null;
}

/** How many of a recipe's materials would come out of storage (board units are used first). */
export function storedMaterials(state: GameState, result: string): number {
  const recipe = state.data.recipes.find(r => r.result === result);
  if (!recipe || !state.storage?.length) return 0;
  const board = new Map<string, number>();
  for (const u of state.slots) if (u) board.set(u.defId, (board.get(u.defId) ?? 0) + 1);
  const stored = new Map<string, number>();
  for (const u of state.storage) stored.set(u.defId, (stored.get(u.defId) ?? 0) + 1);
  let n = 0;
  for (const m of recipe.materials) {
    const c = board.get(m) ?? 0;
    const k = stored.get(m) ?? 0;
    if (c > 0) board.set(m, c - 1);
    else if (k > 0) { stored.set(m, k - 1); n++; }
  }
  return n;
}

export function availableRecipes(state: GameState): string[] {
  return state.data.recipes
    .filter(r => missingMaterials(state, r.result).length === 0 && combineLockRound(state, r) === null && costShortfall(state, r) === null)
    .map(r => r.result);
}

export function recipesUsing(state: GameState, slot: number): { result: string; missing: string[] }[] {
  const unit = state.slots[slot];
  if (!unit) return [];
  return state.data.recipes
    .filter(recipe => recipe.materials.includes(unit.defId))
    .map(recipe => ({ result: recipe.result, missing: missingFrom(state, recipe.materials) }));
}

/** Where a combine result lands: the first of `slots` holding the highest grade. */
export function pickResultSlot(state: GameState, slots: number[]): number {
  const gradeOf = (slot: number) => unitDefFast(state.data, state.slots[slot]!.defId).grade;
  let best = slots[0]!;
  for (const i of slots) if (gradeOf(i) > gradeOf(best)) best = i;
  return best;
}

/** board: slot indexes the combine takes (resultSlot among them when it is a material); stored: storage indexes. */
export interface CombinePlan { resultSlot: number | null; board: number[]; stored: number[] }

/** The units a combine would take, without looking at its cost or lock round. */
export function combinePlan(state: GameState, result: string, slot?: number): CombinePlan | null {
  const recipe = state.data.recipes.find(r => r.result === result);
  if (!recipe) return null;
  if (slot !== undefined) {
    const chosen = state.slots[slot];
    if (!chosen || !recipe.materials.includes(chosen.defId)) return null;
  }
  if (missingFrom(state, recipe.materials).length) return null;

  // the result takes a board material's place; with no board material it needs a free slot
  let resultSlot: number | null = slot ?? null;
  if (resultSlot === null) {
    const materialSlots = state.slots
      .map((u, i) => (u && recipe.materials.includes(u.defId) ? i : -1))
      .filter(i => i >= 0);
    if (materialSlots.length) resultSlot = pickResultSlot(state, materialSlots);
  }

  // board units first, so a board that holds everything combines exactly as before storage existed
  const used = new Set<number>();
  const stored = new Set<number>();
  const storage = state.storage ?? [];
  for (const m of recipe.materials) {
    if (resultSlot !== null && !used.has(resultSlot) && state.slots[resultSlot]!.defId === m) { used.add(resultSlot); continue; }
    let found = false;
    for (let i = state.slots.length - 1; i >= 0; i--) {
      if (i === resultSlot || used.has(i)) continue;
      if (state.slots[i]?.defId === m) { used.add(i); found = true; break; }
    }
    if (found) continue;
    for (let j = storage.length - 1; j >= 0; j--) {
      if (!stored.has(j) && storage[j]!.defId === m) { stored.add(j); break; }
    }
  }
  return { resultSlot, board: [...used], stored: [...stored] };
}

registerCommand('combine', (state, cmd, events) => {
  if (cmd.type !== 'combine') return 'unknown';
  const chosen = cmd.slot === undefined ? null : state.slots[cmd.slot];
  if (cmd.slot !== undefined && !chosen) return 'noUnit';

  const recipe = state.data.recipes.find(r => r.result === cmd.result);
  if (!recipe) return 'unknown';
  if (chosen && !recipe.materials.includes(chosen.defId)) return 'missingMaterials';
  if (missingFrom(state, recipe.materials).length) return 'missingMaterials';
  if (combineLockRound(state, recipe) !== null) return 'tameLocked';
  const short = costShortfall(state, recipe);
  if (short) return short;

  const plan = combinePlan(state, cmd.result, cmd.slot)!;
  const storage = state.storage ?? [];
  const replacedUnitId = plan.resultSlot === null ? -1 : state.slots[plan.resultSlot]!.id;
  const resultSlot = plan.resultSlot ?? chooseSlot(state, unitDefFast(state.data, recipe.result));
  if (resultSlot === null) return 'noSlot';
  if (recipe.cost?.buckwheat) state.buckwheat -= recipe.cost.buckwheat;
  if (recipe.cost?.coins) state.coins -= recipe.cost.coins;
  let cost = 0;
  for (const i of plan.board) cost += state.slots[i]!.cost ?? 0;
  for (const j of plan.stored) cost += storage[j]!.cost ?? 0;
  for (const i of plan.board) state.slots[i] = null;
  if (plan.stored.length) state.storage = storage.filter((_, j) => !plan.stored.includes(j));
  const unit = addUnit(state, recipe.result, resultSlot, events);
  if (state.econ) unit.cost = cost;
  events.push({ type: 'combine', replacedUnitId, unitId: unit.id, defId: unit.defId, slot: resultSlot });
  if (state.econ) onCollectionCombine(state, unit.defId, events);
  return null;
});
