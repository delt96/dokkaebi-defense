import type { GameData } from './types';
import { gradeValue, recipeDemand, recipeValue } from './data';

const SHAPES: Record<number, number[]> = { 2: [1, 1], 3: [1, 1, 2], 4: [2, 2, 3] };

export function validateData(data: GameData): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byId = new Map(data.units.map(u => [u.id, u]));
  const seen = new Set<string>();
  for (const u of data.units) {
    if (seen.has(u.id)) errors.push(`duplicate unit id ${u.id}`);
    seen.add(u.id);
  }
  const enemyIds = new Set(data.enemies.map(e => e.id));

  for (const r of data.recipes) {
    const result = byId.get(r.result);
    if (!result) { errors.push(`recipe result ${r.result} is not a unit`); continue; }
    const missing = r.materials.filter(m => !byId.has(m));
    for (const m of missing) errors.push(`recipe ${r.result} uses unknown unit ${m}`);
    if (missing.length) continue;
    if (recipeValue(data, r) !== gradeValue(result.grade)) {
      errors.push(`recipe ${r.result} value ${recipeValue(data, r)} != ${gradeValue(result.grade)}`);
    }
    const shape = SHAPES[result.grade];
    const grades = r.materials.map(m => byId.get(m)!.grade).sort((a, b) => a - b);
    if (shape && grades.join(',') !== shape.join(',')) {
      errors.push(`recipe ${r.result} shape ${grades.join('+')} != ${shape.join('+')}`);
    }
  }

  for (const u of data.units) {
    if (u.grade >= 2 && !data.recipes.some(r => r.result === u.id)) errors.push(`unit ${u.id} (grade ${u.grade}) has no recipe`);
    const demand = recipeDemand(data, u.id);
    if (demand > 7) errors.push(`unit ${u.id} is used in ${demand} recipes (max 7)`);
    if (u.grade <= 3 && !data.recipes.some(r => r.materials.includes(u.id))) errors.push(`unit ${u.id} (grade ${u.grade}) is not used in any recipe`);
  }

  for (const w of data.waves) {
    const ids = w.type === 'normal' ? w.pattern : [w.boss];
    for (const id of ids) if (!enemyIds.has(id)) errors.push(`wave ${w.round} uses unknown enemy ${id}`);
  }

  for (const u of data.units.filter(x => x.grade === 1)) {
    const sides = new Set<string>();
    for (const r of data.recipes) {
      const result = byId.get(r.result);
      if (!result || result.grade > 3 || !r.materials.includes(u.id)) continue;
      sides.add(result.damageType);
    }
    if (sides.size < 2) warnings.push(`grade 1 ${u.id} is used only in ${[...sides].join('/') || 'no'} recipes`);
  }

  return { errors, warnings };
}
