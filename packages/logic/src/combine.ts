import type { GameState, RecipeDef } from './types';
import { registerCommand } from './registry';
import { addUnit, unitDefFast } from './units';

function ownedCounts(state: GameState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const u of state.slots) if (u) counts.set(u.defId, (counts.get(u.defId) ?? 0) + 1);
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

function costShortfall(state: GameState, recipe: RecipeDef): 'noBuckwheat' | 'noCoins' | null {
  if ((recipe.cost?.buckwheat ?? 0) > state.buckwheat) return 'noBuckwheat';
  if ((recipe.cost?.coins ?? 0) > state.coins) return 'noCoins';
  return null;
}

export function availableRecipes(state: GameState): string[] {
  return state.data.recipes
    .filter(r => missingMaterials(state, r.result).length === 0 && costShortfall(state, r) === null)
    .map(r => r.result);
}

export function recipesUsing(state: GameState, slot: number): { result: string; missing: string[] }[] {
  const unit = state.slots[slot];
  if (!unit) return [];
  return state.data.recipes
    .filter(recipe => recipe.materials.includes(unit.defId))
    .map(recipe => ({ result: recipe.result, missing: missingFrom(state, recipe.materials) }));
}

registerCommand('combine', (state, cmd, events) => {
  if (cmd.type !== 'combine') return 'unknown';
  const chosen = cmd.slot === undefined ? null : state.slots[cmd.slot];
  if (cmd.slot !== undefined && !chosen) return 'noUnit';

  const recipe = state.data.recipes.find(r => r.result === cmd.result);
  if (!recipe) return 'unknown';
  if (chosen && !recipe.materials.includes(chosen.defId)) return 'missingMaterials';
  if (missingFrom(state, recipe.materials).length) return 'missingMaterials';
  const short = costShortfall(state, recipe);
  if (short) return short;

  let resultSlot = cmd.slot;
  if (resultSlot === undefined) {
    const gradeOf = (slot: number) => unitDefFast(state.data, state.slots[slot]!.defId).grade;
    const materialSlots = state.slots
      .map((u, i) => (u && recipe.materials.includes(u.defId) ? i : -1))
      .filter(i => i >= 0);
    resultSlot = materialSlots[0]!;
    for (const i of materialSlots) if (gradeOf(i) > gradeOf(resultSlot)) resultSlot = i;
  }

  const used = new Set<number>();
  for (const m of recipe.materials) {
    if (!used.has(resultSlot) && state.slots[resultSlot]!.defId === m) { used.add(resultSlot); continue; }
    for (let i = state.slots.length - 1; i >= 0; i--) {
      if (i === resultSlot || used.has(i)) continue;
      if (state.slots[i]?.defId === m) { used.add(i); break; }
    }
  }
  const replacedUnitId = state.slots[resultSlot]!.id;
  if (recipe.cost?.buckwheat) state.buckwheat -= recipe.cost.buckwheat;
  if (recipe.cost?.coins) state.coins -= recipe.cost.coins;
  for (const i of used) state.slots[i] = null;
  const unit = addUnit(state, recipe.result, resultSlot, events);
  events.push({ type: 'combine', replacedUnitId, unitId: unit.id, defId: unit.defId, slot: resultSlot });
  return null;
});
