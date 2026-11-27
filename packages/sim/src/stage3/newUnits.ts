import { dataSources, type DamageType, type GameData, type RecipeDef, type UnitDef } from '@dorandi/logic';
import { grade1Balance, leftoverShare, targetMisses, topGrade1 } from './spread';
import type { SummonReport } from './summonSim';

/** Stats and skills an overlay unit leaves out are taken from its grade and type peers (median stats, no skills). */
export type NewUnitDef = { id: string; name: string; grade: 5 | 6; damageType: DamageType }
  & Partial<Pick<UnitDef, 'range' | 'interval' | 'factor' | 'skills' | 'onBasicHit'>>;

export interface NewUnitOverlay {
  units: NewUnitDef[];
  recipes: RecipeDef[];
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Units are sorted by grade and recipes by result grade, the overlay ones last within a grade, as buildGameData would.
 * An overlay recipe is skipped when its result already has a recipe, so data built from a written recipes file keeps
 * its (possibly swapped) copy; an overlay unit the data already has is skipped the same way.
 */
export function withNewUnits(data: GameData, overlay: NewUnitOverlay): GameData {
  if (!overlay.units.length && !overlay.recipes.length) return structuredClone(data);
  const x = structuredClone(data);
  for (const n of overlay.units) {
    if (data.units.some(u => u.id === n.id)) continue;
    const peers = data.units.filter(u => !u.hidden && u.grade === n.grade && u.damageType === n.damageType);
    const peerMedian = (key: 'range' | 'interval' | 'factor') => {
      if (!peers.length) throw new Error(`no grade ${n.grade} ${n.damageType} unit to take ${key} from`);
      return median(peers.map(u => u[key]));
    };
    const unit: UnitDef = {
      id: n.id, name: n.name, grade: n.grade, damageType: n.damageType,
      range: n.range ?? peerMedian('range'), interval: n.interval ?? peerMedian('interval'), factor: n.factor ?? peerMedian('factor'),
      skills: structuredClone(n.skills ?? []),
    };
    if (n.onBasicHit) unit.onBasicHit = { ...n.onBasicHit };
    x.units.push(unit);
  }
  const has = new Set(x.recipes.filter(r => r.kind !== 'tame').map(r => r.result));
  for (const r of overlay.recipes) if (!has.has(r.result)) x.recipes.push(structuredClone(r));

  const grade = new Map<string, number>();
  for (const u of x.units) if (!grade.has(u.id)) grade.set(u.id, u.grade);
  const fresh = new Set(overlay.units.map(u => u.id));
  x.units.sort((a, b) => a.grade - b.grade);
  const key = (r: RecipeDef) => 2 * (grade.get(r.result) ?? 0) + Number(fresh.has(r.result));
  x.recipes.sort((a, b) => key(a) - key(b));
  return x;
}

/** The stage 3 recipes file for searched data: the stage 3 file's recipes in file order, then the overlay recipes. */
export function recipesFile(searched: GameData, overlay: NewUnitOverlay): RecipeDef[] {
  const now = new Map(searched.recipes.filter(r => r.kind !== 'tame').map(r => [r.result, r.materials]));
  const stage3 = dataSources().stage3.recipes as RecipeDef[];
  return [...stage3, ...overlay.recipes].map(r => {
    const copy = structuredClone(r);
    const mats = r.kind === 'tame' ? undefined : now.get(r.result);
    if (mats) copy.materials = [...mats];
    return copy;
  });
}

export interface V7Goals {
  g1: { maxRatio: number; minRatio: number; pass: boolean };
  g2: { over10: string[]; over9: string[]; pass: boolean };
  g3: { id: string; share: number; top: number; pass: boolean }[];
  g4: { misses: string[]; pass: boolean };
}

/**
 * buildGameData accepts recipes for units it does not know, so a recipes file with the new recipes but no overlay
 * would quietly measure without the new units.
 */
export function assertKnownUnits(data: GameData): void {
  const known = new Set(data.units.map(u => u.id));
  const unknown = [...new Set(data.recipes.flatMap(r => [r.result, ...r.materials]).filter(id => !known.has(id)))];
  if (unknown.length) throw new Error(`recipes use unknown units ${unknown.join(', ')}: pass --new-units with the overlay that defines them`);
}

export function v7Goals(data: GameData, newIds: string[]): V7Goals {
  const b = grade1Balance(data);
  const grade6 = data.units.filter(u => u.grade === 6 && !u.hidden).map(u => ({ id: u.id, top: topGrade1(data, u.id).n }));
  for (const id of newIds) {
    const u = data.units.find(x => x.id === id);
    if (!u) throw new Error(`new unit ${id} is not in the data: apply the overlay first`);
    if (u.hidden || (u.grade !== 5 && u.grade !== 6)) throw new Error(`new unit ${id} must be a normal grade 5 or 6 unit`);
    if (u.grade === 6 && !grade6.some(g => g.id === id)) throw new Error(`new unit ${id} is not counted among the normal grade 6 units`);
  }
  const over10 = grade6.filter(u => u.top > 10).map(u => u.id);
  const misses = targetMisses(data);
  return {
    g1: { maxRatio: b.maxRatio, minRatio: b.minRatio, pass: b.maxRatio <= 1.1 && b.minRatio >= 0.9 },
    g2: { over10, over9: grade6.filter(u => u.top > 9).map(u => u.id), pass: over10.length === 0 },
    g3: newIds.map(id => {
      const grade = data.units.find(u => u.id === id)?.grade;
      const share = leftoverShare(data, id);
      const top = topGrade1(data, id).n;
      return { id, share, top, pass: share >= 0.6 && top <= (grade === 5 ? 4 : 7) };
    }),
    g4: { misses, pass: misses.length === 0 },
  };
}

export interface RecipeCandidate<M extends string[]> { materials: M; share: number; top: number; misses: string[] }

const PROBE = '__probe';
const materialKey = (ms: string[]) => [...ms].sort().join('+');

/** Shallow copy with one extra unit: enough for leafCounts and targetMisses, which only read units and recipes. */
function probe(data: GameData, grade: number, materials: string[]): GameData {
  const unit: UnitDef = { id: PROBE, name: PROBE, grade, damageType: 'physical', range: 0, interval: 0, factor: 0, skills: [] };
  return { ...data, units: [...data.units, unit], recipes: [...data.recipes, { result: PROBE, materials }] };
}

function candidates<M extends string[]>(data: GameData, grade: number, sets: M[], opts: { minShare: number; maxTop: number }): RecipeCandidate<M>[] {
  const taken = new Set(data.recipes.map(r => materialKey(r.materials)));
  const before = new Set(targetMisses(data));
  const out: RecipeCandidate<M>[] = [];
  for (const materials of sets) {
    if (taken.has(materialKey(materials))) continue;
    const x = probe(data, grade, materials);
    const share = leftoverShare(x, PROBE);
    const top = topGrade1(x, PROBE).n;
    if (share < opts.minShare || top > opts.maxTop) continue;
    // The probe grade 5 itself is unused until a grade 6 takes it, so its own demand miss is left out.
    const misses = targetMisses(x).filter(m => !before.has(m) && !m.startsWith(`${PROBE} `));
    out.push({ materials, share, top, misses });
  }
  return out;
}

const normal = (data: GameData, grades: number[]) => data.units.filter(u => !u.hidden && grades.includes(u.grade)).map(u => u.id);

export function grade5Candidates(data: GameData, opts: { minShare: number; maxTop: number }): RecipeCandidate<[string, string]>[] {
  const fours = normal(data, [4]);
  const sets: [string, string][] = [];
  fours.forEach((a, i) => fours.slice(i + 1).forEach(b => sets.push([a, b])));
  return candidates(data, 5, sets, opts);
}

/** Materials are [one of fives, another normal grade 5, a normal grade 3 or 4]; a pair of two fives is listed once. */
export function grade6Candidates(data: GameData, fives: string[], opts: { minShare: number; maxTop: number }): RecipeCandidate<[string, string, string]>[] {
  const grade5 = normal(data, [5]);
  for (const f of fives) if (!grade5.includes(f)) throw new Error(`${f} is not a normal grade 5 unit in the data`);
  const thirds = normal(data, [3, 4]);
  const sets: [string, string, string][] = [];
  fives.forEach((f, i) => {
    for (const o of grade5) {
      if (o === f || fives.slice(0, i + 1).includes(o)) continue;
      for (const t of thirds) sets.push([f, o, t]);
    }
  });
  return candidates(data, 6, sets, opts);
}

export function goal6(r: SummonReport): { topShare: number; over5pct: number; pass: boolean } {
  const topShare = Math.max(0, ...r.pickAt30.map(p => p.share));
  const over5pct = r.pickAt30.filter(p => p.share > 0.05).length;
  return { topShare, over5pct, pass: topShare <= 0.4 && over5pct >= 5 };
}
