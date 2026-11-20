import type { GameState } from './types';
import { registerCommand } from './game';
import { addUnit, unitDefFast } from './units';

function ownedCounts(state: GameState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const u of state.slots) if (u) counts.set(u.defId, (counts.get(u.defId) ?? 0) + 1);
  return counts;
}

export function missingMaterials(state: GameState, result: string): string[] {
  const recipe = state.data.recipes.find(r => r.result === result);
  if (!recipe) return [];
  const counts = ownedCounts(state);
  const missing: string[] = [];
  for (const m of recipe.materials) {
    const c = counts.get(m) ?? 0;
    if (c > 0) counts.set(m, c - 1);
    else missing.push(m);
  }
  return missing;
}

export function availableRecipes(state: GameState): string[] {
  return state.data.recipes.filter(r => missingMaterials(state, r.result).length === 0).map(r => r.result);
}

registerCommand('combine', (state, cmd, events) => {
  if (cmd.type !== 'combine') return 'unknown';
  const recipe = state.data.recipes.find(r => r.result === cmd.result);
  if (!recipe) return 'unknown';
  if (missingMaterials(state, cmd.result).length) return 'missingMaterials';

  const gradeOf = (slot: number) => unitDefFast(state.data, state.slots[slot]!.defId).grade;
  const materialSlots = state.slots
    .map((u, i) => (u && recipe.materials.includes(u.defId) ? i : -1))
    .filter(i => i >= 0);
  let resultSlot = materialSlots[0]!;
  for (const i of materialSlots) if (gradeOf(i) > gradeOf(resultSlot)) resultSlot = i;

  const used = new Set<number>();
  for (const m of recipe.materials) {
    if (!used.has(resultSlot) && state.slots[resultSlot]!.defId === m) { used.add(resultSlot); continue; }
    for (let i = state.slots.length - 1; i >= 0; i--) {
      if (i === resultSlot || used.has(i)) continue;
      if (state.slots[i]?.defId === m) { used.add(i); break; }
    }
  }
  for (const i of used) state.slots[i] = null;
  const unit = addUnit(state, recipe.result, resultSlot, events);
  events.push({ type: 'combine', unitId: unit.id, defId: unit.defId, slot: resultSlot });
  return null;
});
