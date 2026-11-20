import type { BalanceDef, EnemyDef, GameData, RecipeDef, UnitDef } from './types';
import units from '../data/units.json';
import recipes from '../data/recipes.json';
import enemies from '../data/enemies.json';
import waves from '../data/waves.json';
import balance from '../data/balance.json';
import upgrades from '../data/upgrades.json';

export function loadGameData(): GameData {
  return structuredClone({ units, recipes, enemies, waves, balance, upgrades }) as GameData;
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
