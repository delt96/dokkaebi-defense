import type { GameState, RecipeDef, Unit } from './types';
import { registerCommand } from './registry';
import { addUnit, chooseSlot, unitDefFast } from './units';
import { onCollectionCombine } from './econ/quests';
import { isEvolved, isTamedKind } from './econ/shop';

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

/** An exclusive (tame) recipe takes its recruit only as an evolved copy. */
const needsEvolved = (state: GameState, recipe: RecipeDef, m: string): boolean => recipe.kind === 'tame' && isTamedKind(state.data, m);

/** Whether `u` can stand in for material `m` of `recipe`. */
function fits(state: GameState, recipe: RecipeDef, u: Unit | null | undefined, m: string): boolean {
  return !!u && u.defId === m && (!needsEvolved(state, recipe, m) || isEvolved(state.data, u));
}

/** Every material is owned but a recruit an exclusive recipe takes has no evolved copy. */
export function needsEvolve(state: GameState, recipe: RecipeDef | undefined): boolean {
  if (recipe?.kind !== 'tame' || missingFrom(state, recipe.materials).length) return false;
  const units = [...state.slots, ...(state.storage ?? [])];
  for (const m of new Set(recipe.materials)) {
    if (!needsEvolved(state, recipe, m)) continue;
    const want = recipe.materials.filter(x => x === m).length;
    if (units.filter(u => fits(state, recipe, u, m)).length < want) return true;
  }
  return false;
}

function costShortfall(state: GameState, recipe: RecipeDef): 'noBuckwheat' | 'noCoins' | null {
  if ((recipe.cost?.buckwheat ?? 0) > state.buckwheat) return 'noBuckwheat';
  if ((recipe.cost?.coins ?? 0) > state.coins) return 'noCoins';
  return null;
}

interface MaterialPick {
  used: Set<number>;
  stored: Set<number>;
  /** null: no slot for the result (the combine is refused with noSlot). */
  resultSlot: number | null;
  /** The board unit the result replaces, -1 when it lands on an empty slot. */
  replacedSlot: number;
  eatsItem: boolean;
}

/**
 * Which board slots and storage indexes a combine uses, without changing the state.
 * Units with an item are used only after every bare copy; with no item among the
 * candidates this is the pre-item algorithm, which the golden test and hashes pin.
 */
function pickMaterials(state: GameState, recipe: RecipeDef, slot?: number): MaterialPick {
  const storage = state.storage ?? [];
  const bare = (u: { item?: string } | null | undefined) => !!u && !u.item;
  const clicked = slot === undefined ? undefined : state.slots[slot];
  const ok = (u: Unit | null | undefined, m: string) => fits(state, recipe, u, m);

  const clickedFits = recipe.kind !== 'tame' || recipe.materials.some(m => ok(clicked, m));
  let resultSlot: number | undefined = clicked && bare(clicked) && clickedFits ? slot : undefined;
  if (resultSlot === undefined) {
    const materialSlots = state.slots
      .map((u, i) => (bare(u) && recipe.materials.some(m => ok(u, m)) ? i : -1))
      .filter(i => i >= 0);
    if (materialSlots.length) resultSlot = pickResultSlot(state, materialSlots);
  }

  const used = new Set<number>();
  const stored = new Set<number>();
  const unfilled: string[] = [];
  for (const m of recipe.materials) {
    if (resultSlot !== undefined && !used.has(resultSlot) && ok(state.slots[resultSlot], m)) { used.add(resultSlot); continue; }
    let found = false;
    for (let i = state.slots.length - 1; i >= 0 && !found; i--) {
      if (i === resultSlot || used.has(i)) continue;
      const u = state.slots[i];
      if (bare(u) && ok(u, m)) { used.add(i); found = true; }
    }
    for (let j = storage.length - 1; j >= 0 && !found; j--) {
      if (!stored.has(j) && bare(storage[j]) && ok(storage[j], m)) { stored.add(j); found = true; }
    }
    if (!found) unfilled.push(m);
  }

  const equippedUsed: number[] = [];
  for (const m of unfilled) {
    let found = false;
    if (slot !== undefined && clicked?.item && !used.has(slot) && ok(clicked, m)) { used.add(slot); equippedUsed.push(slot); found = true; }
    for (let i = state.slots.length - 1; i >= 0 && !found; i--) {
      const u = state.slots[i];
      if (!used.has(i) && u?.item && ok(u, m)) { used.add(i); equippedUsed.push(i); found = true; }
    }
    for (let j = storage.length - 1; j >= 0 && !found; j--) {
      if (!stored.has(j) && storage[j]!.item && ok(storage[j], m)) { stored.add(j); found = true; }
    }
  }

  let replacedSlot = resultSlot ?? -1;
  if (resultSlot === undefined && equippedUsed.length) {
    resultSlot = pickResultSlot(state, equippedUsed.sort((a, b) => a - b));
    replacedSlot = resultSlot;
  }
  let finalSlot: number | null = resultSlot ?? chooseSlot(state, unitDefFast(state.data, recipe.result));

  if (finalSlot === null) {
    // full board: trade a used stored copy for an equipped board copy of the same kind so the result has a slot
    const storedKinds = new Set([...stored].map(j => storage[j]!.defId));
    const swaps = state.slots
      .map((u, i) => (u?.item && !used.has(i) && storedKinds.has(u.defId) && ok(u, u.defId) ? i : -1))
      .filter(i => i >= 0);
    if (swaps.length) {
      const at = slot !== undefined && swaps.includes(slot) ? slot : pickResultSlot(state, swaps);
      const kind = state.slots[at]!.defId;
      const oldest = Math.min(...[...stored].filter(j => storage[j]!.defId === kind));
      stored.delete(oldest);
      used.add(at);
      finalSlot = at;
      replacedSlot = at;
    }
  }

  // the evolve charm an exclusive recipe requires is spent on purpose, not lost by surprise
  const surprise = (u: Unit) => !!u.item && !needsEvolved(state, recipe, u.defId);
  let eatsItem = false;
  for (const i of used) if (surprise(state.slots[i]!)) eatsItem = true;
  for (const j of stored) if (surprise(storage[j]!)) eatsItem = true;
  return { used, stored, resultSlot: finalSlot, replacedSlot, eatsItem };
}

/** How many of a recipe's materials would come out of storage (bare copies first; within each, board before storage). */
export function storedMaterials(state: GameState, result: string, slot?: number): number {
  const recipe = state.data.recipes.find(r => r.result === result);
  if (!recipe || !state.storage?.length) return 0;
  return pickMaterials(state, recipe, slot).stored.size;
}

/** Whether this combine (with the same arguments the combine command gets) would use a unit that has an item. */
export function combineEatsItem(state: GameState, result: string, slot?: number): boolean {
  const recipe = state.data.recipes.find(r => r.result === result);
  if (!recipe || missingFrom(state, recipe.materials).length || needsEvolve(state, recipe)) return false;
  if (slot !== undefined) {
    const chosen = state.slots[slot];
    if (!chosen || !recipe.materials.includes(chosen.defId)) return false;
  }
  const pick = pickMaterials(state, recipe, slot);
  return pick.resultSlot !== null && pick.eatsItem;
}

export function availableRecipes(state: GameState): string[] {
  return state.data.recipes
    .filter(r => missingMaterials(state, r.result).length === 0 && !needsEvolve(state, r) && costShortfall(state, r) === null)
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

/** The units a combine would take, without looking at its cost; null when the materials (or their evolved copies) are not all there. */
export function combinePlan(state: GameState, result: string, slot?: number): CombinePlan | null {
  const recipe = state.data.recipes.find(r => r.result === result);
  if (!recipe) return null;
  if (slot !== undefined) {
    const chosen = state.slots[slot];
    if (!chosen || !recipe.materials.includes(chosen.defId)) return null;
  }
  if (missingFrom(state, recipe.materials).length || needsEvolve(state, recipe)) return null;
  const { used, stored, replacedSlot } = pickMaterials(state, recipe, slot);
  return { resultSlot: replacedSlot < 0 ? null : replacedSlot, board: [...used], stored: [...stored] };
}

registerCommand('combine', (state, cmd, events) => {
  if (cmd.type !== 'combine') return 'unknown';
  const chosen = cmd.slot === undefined ? null : state.slots[cmd.slot];
  if (cmd.slot !== undefined && !chosen) return 'noUnit';

  const recipe = state.data.recipes.find(r => r.result === cmd.result);
  if (!recipe) return 'unknown';
  if (chosen && !recipe.materials.includes(chosen.defId)) return 'missingMaterials';
  if (missingFrom(state, recipe.materials).length) return 'missingMaterials';
  if (needsEvolve(state, recipe)) return 'notEvolved';
  const short = costShortfall(state, recipe);
  if (short) return short;

  const { used, stored, resultSlot, replacedSlot } = pickMaterials(state, recipe, cmd.slot);
  if (resultSlot === null) return 'noSlot';
  const storage = state.storage ?? [];
  const replacedUnitId = replacedSlot < 0 ? -1 : state.slots[replacedSlot]!.id;
  if (recipe.cost?.buckwheat) state.buckwheat -= recipe.cost.buckwheat;
  if (recipe.cost?.coins) state.coins -= recipe.cost.coins;
  let cost = 0;
  for (const i of used) cost += state.slots[i]!.cost ?? 0;
  for (const j of stored) cost += storage[j]!.cost ?? 0;
  for (const i of used) state.slots[i] = null;
  if (stored.size) state.storage = storage.filter((_, j) => !stored.has(j));
  const unit = addUnit(state, recipe.result, resultSlot, events);
  if (state.econ) unit.cost = cost;
  events.push({ type: 'combine', replacedUnitId, unitId: unit.id, defId: unit.defId, slot: resultSlot });
  if (state.econ) onCollectionCombine(state, unit.defId, events);
  return null;
});
