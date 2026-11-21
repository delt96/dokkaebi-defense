import type { GameData } from './types';
import { gradeValue, recipeDemand, recipeValue } from './data';

const SHAPES: Record<number, number[][]> = { 2: [[1, 1]], 3: [[1, 1, 2]], 4: [[2, 2, 3]], 5: [[4, 4]], 6: [[3, 5, 5], [4, 5, 5]] };
const COSTS: Record<number, { buckwheat?: number; coins?: number }> = { 5: { buckwheat: 1 }, 6: { buckwheat: 1, coins: 60 } };

const costKey = (c: { buckwheat?: number; coins?: number } | undefined): string =>
  JSON.stringify({ ...(c?.buckwheat && { buckwheat: c.buckwheat }), ...(c?.coins && { coins: c.coins }) });

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
  const sameMaterials = new Map<string, string>();

  for (const r of data.recipes) {
    const result = byId.get(r.result);
    if (!result) { errors.push(`recipe result ${r.result} is not a unit`); continue; }
    const missing = r.materials.filter(m => !byId.has(m));
    for (const m of missing) errors.push(`recipe ${r.result} uses unknown unit ${m}`);
    if (missing.length) continue;
    for (const id of [r.result, ...new Set(r.materials)]) if (byId.get(id)!.hidden) errors.push(`hidden unit ${id} is in recipe ${r.result}`);
    if (result.grade <= 5 && recipeValue(data, r) !== gradeValue(result.grade)) {
      errors.push(`recipe ${r.result} value ${recipeValue(data, r)} != ${gradeValue(result.grade)}`);
    }
    const shapes = SHAPES[result.grade];
    const grades = r.materials.map(m => byId.get(m)!.grade).sort((a, b) => a - b);
    if (shapes && !shapes.some(s => s.join(',') === grades.join(','))) {
      errors.push(`recipe ${r.result} shape ${grades.join('+')} != ${shapes.map(s => s.join('+')).join(' or ')}`);
    }
    const wantCost = costKey(COSTS[result.grade]);
    if (costKey(r.cost) !== wantCost) errors.push(`recipe ${r.result} cost ${costKey(r.cost)} != ${wantCost}`);
    for (const m of r.materials) {
      const g = byId.get(m)!.grade;
      if (g >= result.grade) errors.push(`recipe ${r.result} material ${m} grade ${g} is not below ${result.grade}`);
    }
    if (result.grade === 6) {
      const fives = r.materials.filter(m => byId.get(m)!.grade === 5);
      for (const m of new Set(fives)) if (fives.filter(x => x === m).length > 1) errors.push(`recipe ${r.result} uses grade-5 ${m} twice`);
    }
    const key = [...r.materials].sort().join('+');
    const prev = sameMaterials.get(key);
    if (prev !== undefined) errors.push(`recipes ${prev} and ${r.result} have the same materials`);
    else sameMaterials.set(key, r.result);
  }

  const reachable = new Set(data.units.filter(u => u.grade === 1 && !u.hidden).map(u => u.id));
  for (let grew = true; grew;) {
    grew = false;
    for (const r of data.recipes) {
      if (reachable.has(r.result) || !r.materials.every(m => reachable.has(m))) continue;
      reachable.add(r.result);
      grew = true;
    }
  }
  const maxGrade = Math.max(...data.units.filter(u => !u.hidden).map(u => u.grade));

  for (const u of data.units) {
    if (u.hidden) continue;
    if (u.grade >= 2 && !data.recipes.some(r => r.result === u.id)) errors.push(`unit ${u.id} (grade ${u.grade}) has no recipe`);
    if (!reachable.has(u.id)) errors.push(`unit ${u.id} (grade ${u.grade}) is not reachable from summons`);
    const demand = recipeDemand(data, u.id);
    if (demand > 7) errors.push(`unit ${u.id} is used in ${demand} recipes (max 7)`);
    if (u.grade < maxGrade && !data.recipes.some(r => r.materials.includes(u.id))) errors.push(`unit ${u.id} (grade ${u.grade}) is not used in any recipe`);
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
