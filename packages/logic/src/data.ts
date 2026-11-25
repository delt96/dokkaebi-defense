import type { BalanceDef, CoopDef, EconomyDef, EnemyDef, GameData, RecipeDef, UnitDef } from './types';
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
import coop3 from '../data/stage3/coop.json';

const SOURCES = {
  stage1: { units, recipes, enemies, waves, balance, upgrades },
  stage2: { units: units2, recipes: recipes2, enemies: enemies2, balance: balance2, coop: coop2 },
  stage3: {
    units: units3, recipes: recipes3, enemies: enemies3, waves: waves3, balance: balance3,
    onBasicHit: onBasicHit3, economy: economy3, coop: coop3,
  },
};

type Sources = typeof SOURCES;
export type DataSources = {
  [S in keyof Sources]: Omit<Sources[S], 'balance'> & {
    balance: Omit<Sources[S]['balance'], 'summonOddsByRound'> & Pick<BalanceDef, 'summonOddsByRound'>;
  };
};
export type DataStage = 'stage1' | 'stage2' | 'stage3';

/** A fresh copy of the raw per-stage JSON that loadGameData builds from. */
export function dataSources(): DataSources {
  return structuredClone(SOURCES);
}

export function loadGameData(stage: DataStage = 'stage1'): GameData {
  return buildGameData(stage, SOURCES);
}

/**
 * Stage 2 layers its balance over stage 1's. Stage 3's balance and coop files
 * are complete on their own, so stage 1 and 2 tuning never reaches stage 3.
 */
export function buildGameData(stage: DataStage, src: DataSources): GameData {
  const s1 = src.stage1, s2 = src.stage2, s3 = src.stage3;
  if (stage === 'stage1') return structuredClone(s1) as GameData;
  const three = stage === 'stage3';
  const gradeOf = new Map<string, number>();
  const allUnits = [...s1.units, ...s2.units, ...(three ? s3.units : [])] as UnitDef[];
  for (const u of allUnits) if (!gradeOf.has(u.id)) gradeOf.set(u.id, u.grade);
  const allRecipes = [...s1.recipes, ...s2.recipes, ...(three ? s3.recipes : [])] as RecipeDef[];
  const data = structuredClone({
    units: allUnits.sort((a, b) => a.grade - b.grade),
    recipes: allRecipes.sort((a, b) => (gradeOf.get(a.result) ?? 0) - (gradeOf.get(b.result) ?? 0)),
    enemies: [...s1.enemies, ...s2.enemies, ...(three ? s3.enemies : [])],
    waves: three ? s3.waves : s1.waves,
    balance: three ? s3.balance : { ...s1.balance, ...s2.balance },
    upgrades: s1.upgrades,
    coop: (three ? s3.coop : s2.coop) as CoopDef,
  }) as GameData;
  if (three) {
    const byId = new Map(data.units.map(u => [u.id, u]));
    for (const [id, hit] of Object.entries(s3.onBasicHit as Record<string, { targetPct: number; splashPct: number }>)) {
      const u = byId.get(id);
      if (!u) throw new Error(`onBasicHit for unknown unit ${id}`);
      u.onBasicHit = { ...hit };
    }
    data.economy = structuredClone(s3.economy) as EconomyDef;
  }
  return data;
}

export function summonOddsForRound(balance: BalanceDef, round: number): number[] {
  let odds = balance.summonOdds;
  for (const band of balance.summonOddsByRound ?? []) {
    if (band.fromRound > Math.max(1, round)) break;
    odds = band.odds;
  }
  return odds;
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
  const late = b.hp.late && round >= b.hp.late.fromRound ? 1 + b.hp.late.perRound * (round - b.hp.late.fromRound + 1) : 1;
  return Math.round((b.hp.base + b.hp.coef * round ** b.hp.exp) * def.hpMult * late);
}

/** The hidden table includes recipe units and excludes direct tame recruits. */
export function gamblePool(data: GameData, result: number | 'hidden'): UnitDef[] {
  if (result === 'hidden') {
    const recruits = new Set(data.economy?.tame?.targets.map(t => t.unit));
    return data.units.filter(u => u.hidden && !recruits.has(u.id) && !data.recipes.some(r =>
      r.kind === 'tame' && r.materials.includes(u.id)));
  }
  return data.units.filter(u => !u.hidden && u.grade === result);
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
