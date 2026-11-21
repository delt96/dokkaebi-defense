import type { BalanceDef, CoopDef, DamageType, EconomyDef, EnemyDef, GameData, RecipeDef, UnitDef } from './types';
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
import units3 from '../data/stage3/units.json';
import recipes3 from '../data/stage3/recipes.json';
import enemies3 from '../data/stage3/enemies.json';
import waves3 from '../data/stage3/waves.json';
import balance3 from '../data/stage3/balance.json';
import onBasicHit3 from '../data/stage3/onBasicHit.json';
import economy3 from '../data/stage3/economy.json';

export function loadGameData(stage: 'stage1' | 'stage2' | 'stage3' = 'stage1'): GameData {
  if (stage === 'stage1') return structuredClone({ units, recipes, enemies, waves, balance, upgrades }) as GameData;
  const three = stage === 'stage3';
  const gradeOf = new Map<string, number>();
  const allUnits = [...units, ...units2, ...(three ? units3 : [])] as UnitDef[];
  for (const u of allUnits) if (!gradeOf.has(u.id)) gradeOf.set(u.id, u.grade);
  const allRecipes = [...recipes, ...recipes2, ...(three ? recipes3 : [])] as RecipeDef[];
  const data = structuredClone({
    units: allUnits.sort((a, b) => a.grade - b.grade),
    recipes: allRecipes.sort((a, b) => (gradeOf.get(a.result) ?? 0) - (gradeOf.get(b.result) ?? 0)),
    enemies: [...enemies, ...enemies2, ...(three ? enemies3 : [])],
    waves: three ? waves3 : waves,
    balance: three ? { ...balance, ...balance2, ...balance3 } : { ...balance, ...balance2 },
    upgrades,
    coop: coop2 as CoopDef,
  }) as GameData;
  if (three) {
    const byId = new Map(data.units.map(u => [u.id, u]));
    for (const [id, hit] of Object.entries(onBasicHit3 as Record<string, { targetPct: number; splashPct: number }>)) {
      const u = byId.get(id);
      if (!u) throw new Error(`onBasicHit for unknown unit ${id}`);
      u.onBasicHit = { ...hit };
    }
    addLineage(data);
    data.economy = structuredClone(economy3) as EconomyDef;
  }
  return data;
}

const LINEAGE_ORDER: DamageType[] = ['magical', 'physical'];

function addLineage(data: GameData): void {
  const recipeOf = new Map(data.recipes.map(r => [r.result, r]));
  const byId = new Map(data.units.map(u => [u.id, u]));
  const visit = (u: UnitDef, stack: Set<string>): DamageType[] => {
    if (u.lineage) return u.lineage;
    if (stack.has(u.id)) throw new Error(`recipe cycle at ${u.id}`);
    stack.add(u.id);
    const set = new Set<DamageType>([u.damageType]);
    const recipe = u.grade > 1 ? recipeOf.get(u.id) : undefined;
    for (const m of recipe?.materials ?? []) {
      const mu = byId.get(m);
      if (mu) for (const t of visit(mu, stack)) set.add(t);
    }
    stack.delete(u.id);
    u.lineage = LINEAGE_ORDER.filter(t => set.has(t));
    return u.lineage;
  };
  for (const u of data.units) visit(u, new Set());
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
  if ((def.boss || def.event) && def.hp !== undefined) return def.hp;
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
