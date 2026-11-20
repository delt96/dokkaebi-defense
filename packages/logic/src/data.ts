import type { BalanceDef, CoopDef, EnemyDef, GameData, RecipeDef, UnitDef } from './types';
import units from '../data/units.json';
import recipes from '../data/recipes.json';
import enemies from '../data/enemies.json';
import waves from '../data/waves.json';
import balance from '../data/balance.json';
import upgrades from '../data/upgrades.json';
import units2 from '../data/stage2/units.json';
import recipes2 from '../data/stage2/recipes.json';
import enemies2 from '../data/stage2/enemies.json';
import balance2 from '../data/stage2/balance.json';
import coop2 from '../data/stage2/coop.json';

export function loadGameData(stage: 'stage1' | 'stage2' = 'stage1'): GameData {
  if (stage === 'stage1') return structuredClone({ units, recipes, enemies, waves, balance, upgrades }) as GameData;
  const gradeOf = new Map<string, number>();
  const allUnits = [...units, ...units2] as UnitDef[];
  for (const u of allUnits) if (!gradeOf.has(u.id)) gradeOf.set(u.id, u.grade);
  const allRecipes = [...recipes, ...recipes2] as RecipeDef[];
  return structuredClone({
    units: allUnits.sort((a, b) => a.grade - b.grade),
    recipes: allRecipes.sort((a, b) => (gradeOf.get(a.result) ?? 0) - (gradeOf.get(b.result) ?? 0)),
    enemies: [...enemies, ...enemies2],
    waves,
    balance: { ...balance, ...balance2 },
    upgrades,
    coop: coop2 as CoopDef,
  }) as GameData;
}

export function recipeDemand(data: GameData, unitId: string): number {
  return data.recipes.filter(r => r.materials.includes(unitId)).length;
}

export function unitDef(data: GameData, id: string): UnitDef {
  const u = data.units.find(x => x.id === id);
  if (!u) throw new Error(`unknown unit ${id}`);
  return u;
}

export function enemyDef(data: GameData, id: string): EnemyDef {
  const e = data.enemies.find(x => x.id === id);
  if (!e) throw new Error(`unknown enemy ${id}`);
  return e;
}

export function gradeDps(b: BalanceDef, grade: number): number {
  return b.gradeDps.base * b.gradeDps.mult ** (grade - 1);
}

export function unitAttack(def: UnitDef, b: BalanceDef): number {
  return gradeDps(b, def.grade) * def.interval * def.factor;
}

export function enemyHp(def: EnemyDef, round: number, b: BalanceDef): number {
  if (def.boss && def.hp !== undefined) return def.hp;
  return Math.round((b.hp.base + b.hp.coef * round ** b.hp.exp) * def.hpMult);
}

export function gradeValue(grade: number): number {
  return 2 ** (grade - 1);
}

export function recipeValue(data: GameData, recipe: RecipeDef): number {
  return recipe.materials.reduce((sum, id) => {
    const u = data.units.find(x => x.id === id);
    return sum + (u ? gradeValue(u.grade) : 0);
  }, 0);
}
