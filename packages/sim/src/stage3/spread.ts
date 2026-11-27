import { createRng, nextFloat, nextInt, validateData, type DataSources, type GameData, type RngState } from '@dorandi/logic';

export interface Swap { result: string; from: string; to: string }

export const SPREAD_TARGETS: Record<2 | 3 | 4 | 5, { min: number; max: number }> = {
  2: { min: 3, max: 6 }, 3: { min: 1, max: 3 }, 4: { min: 2, max: 4 }, 5: { min: 2, max: 3 },
};
export const GRADE3_MAX_SINGLES = 5;
const MAX_DEMAND = 7;

const ordinary = (data: GameData) => data.recipes.filter(r => r.kind !== 'tame');
const unitMap = (data: GameData) => new Map(data.units.map(u => [u.id, u]));

export function spreadDemand(data: GameData): Map<string, number> {
  const demand = new Map(data.units.filter(u => !u.hidden).map(u => [u.id, 0]));
  for (const r of ordinary(data)) for (const m of new Set(r.materials)) if (demand.has(m)) demand.set(m, demand.get(m)! + 1);
  return demand;
}

function tameDemand(data: GameData): Map<string, number> {
  const demand = new Map<string, number>();
  for (const r of data.recipes) if (r.kind === 'tame') for (const m of new Set(r.materials)) demand.set(m, (demand.get(m) ?? 0) + 1);
  return demand;
}

interface Graded { id: string; grade: number; damageType: string }

function misses(units: Graded[], demand: (id: string) => number, tame: Map<string, number>): { text: string; size: number }[] {
  const out: { text: string; size: number }[] = [];
  let singles = 0;
  for (const u of units) {
    const d = demand(u.id);
    if (d + (tame.get(u.id) ?? 0) > MAX_DEMAND) out.push({ text: `${u.id} is used in ${d + (tame.get(u.id) ?? 0)} recipes with taming (max ${MAX_DEMAND})`, size: 10 });
    const t = SPREAD_TARGETS[u.grade as 2 | 3 | 4 | 5];
    if (!t) continue;
    if (u.grade === 3 && d === 1) singles++;
    if (d < t.min || d > t.max) out.push({ text: `${u.id} (grade ${u.grade}) demand ${d} not in ${t.min}-${t.max}`, size: d < t.min ? t.min - d : d - t.max });
  }
  if (singles > GRADE3_MAX_SINGLES) out.push({ text: `grade 3 has ${singles} single-use materials (max ${GRADE3_MAX_SINGLES})`, size: singles - GRADE3_MAX_SINGLES });
  return out;
}

const targetUnits = (data: GameData): Graded[] => data.units.filter(u => !u.hidden && u.grade >= 2 && u.grade <= 5);

export function targetMisses(data: GameData): string[] {
  const demand = spreadDemand(data);
  return misses(targetUnits(data), id => demand.get(id) ?? 0, tameDemand(data)).map(m => m.text);
}

/** Moves of material slots needed at least, per grade and family: the larger of the excess over and the shortfall under the targets. */
export function spreadLowerBound(data: GameData): number {
  const demand = spreadDemand(data);
  const groups = new Map<string, { over: number; under: number }>();
  for (const u of targetUnits(data)) {
    const t = SPREAD_TARGETS[u.grade as 2 | 3 | 4 | 5];
    const d = demand.get(u.id) ?? 0;
    const key = `${u.grade}:${u.damageType}`;
    const g = groups.get(key) ?? { over: 0, under: 0 };
    g.over += Math.max(0, d - t.max);
    g.under += Math.max(0, t.min - d);
    groups.set(key, g);
  }
  return [...groups.values()].reduce((sum, g) => sum + Math.max(g.over, g.under), 0);
}

export function editableRecipes(src: DataSources): Set<string> {
  return new Set((src.stage3.recipes as { result: string; kind?: string }[]).filter(r => r.kind === undefined).map(r => r.result));
}

export interface SpreadRules { crossFamily?: boolean; unlockGrade1?: boolean }

export function lockedMaterials(data: GameData, result: string, rules?: SpreadRules): Set<string> {
  const units = unitMap(data);
  const recipe = ordinary(data).find(r => r.result === result);
  const locked = new Set(rules?.unlockGrade1 ? [] : (recipe?.materials ?? []).filter(m => units.get(m)?.grade === 1));
  for (const skill of units.get(result)?.skills ?? []) {
    for (const e of skill.effects) if ('source' in e && e.source) locked.add(e.source);
  }
  return locked;
}

export function applySwaps(data: GameData, swaps: Swap[]): GameData {
  const copy = structuredClone(data);
  for (const s of swaps) {
    const r = copy.recipes.find(x => x.result === s.result && x.kind !== 'tame');
    const i = r ? r.materials.indexOf(s.from) : -1;
    if (r && i >= 0) r.materials[i] = s.to;
  }
  return copy;
}

export function swapProblems(data: GameData, editable: Set<string>, swaps: Swap[], rules?: SpreadRules): string[] {
  const units = unitMap(data);
  const out: string[] = [];
  const current = new Map(ordinary(data).map(r => [r.result, [...r.materials]]));
  for (const s of swaps) {
    const mats = current.get(s.result);
    const from = units.get(s.from);
    const to = units.get(s.to);
    if (!mats || !editable.has(s.result)) { out.push(`recipe ${s.result} is not editable`); continue; }
    const i = mats.indexOf(s.from);
    if (i < 0 || !from) { out.push(`recipe ${s.result} has no ${s.from}`); continue; }
    if (lockedMaterials(data, s.result, rules).has(s.from)) out.push(`recipe ${s.result} must keep ${s.from}`);
    if (!to || to.hidden) { out.push(`${s.to} is not a normal unit`); continue; }
    if (rules?.crossFamily) {
      if (to.grade !== from.grade) out.push(`${s.from} -> ${s.to} changes grade`);
    } else if (to.grade !== from.grade || to.damageType !== from.damageType) out.push(`${s.from} -> ${s.to} changes grade or family`);
    if (mats.includes(s.to)) out.push(`recipe ${s.result} would hold ${s.to} twice`);
    mats[i] = s.to;
  }
  out.push(...validateData(applySwaps(data, swaps)).errors);
  return out;
}

export function changedRecipes(swaps: Swap[]): string[] {
  return [...new Set(swaps.map(s => s.result))];
}

export function leafCounts(data: GameData, unitId: string): Map<string, number> {
  const recipes = new Map(ordinary(data).map(r => [r.result, r.materials]));
  const out = new Map<string, number>();
  const walk = (id: string) => {
    const mats = recipes.get(id);
    if (!mats) { out.set(id, (out.get(id) ?? 0) + 1); return; }
    for (const m of mats) walk(m);
  };
  walk(unitId);
  return out;
}

export const LEFTOVER_GRADE1 = ['bitjaru', 'ki', 'sotlid', 'buchae'] as const;

const grade1Units = (data: GameData) => data.units.filter(u => u.grade === 1);

export function grade1Totals(data: GameData): Map<string, number> {
  const totals = new Map(grade1Units(data).map(u => [u.id, 0]));
  for (const u of data.units) {
    if (u.grade !== 6 || u.hidden) continue;
    for (const [id, n] of leafCounts(data, u.id)) if (totals.has(id)) totals.set(id, totals.get(id)! + n);
  }
  return totals;
}

export function grade1Balance(data: GameData): { mean: number; maxRatio: number; minRatio: number } {
  const values = [...grade1Totals(data).values()];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { mean, maxRatio: Math.max(...values) / mean, minRatio: Math.min(...values) / mean };
}

export function topGrade1(data: GameData, unitId: string): { id: string; n: number } {
  const leaves = leafCounts(data, unitId);
  let best = { id: '', n: 0 };
  for (const u of grade1Units(data)) {
    const n = leaves.get(u.id) ?? 0;
    if (n > best.n) best = { id: u.id, n };
  }
  return best;
}

export function leftoverShare(data: GameData, unitId: string): number {
  const leaves = leafCounts(data, unitId);
  let total = 0;
  let leftover = 0;
  for (const u of grade1Units(data)) {
    const n = leaves.get(u.id) ?? 0;
    total += n;
    if ((LEFTOVER_GRADE1 as readonly string[]).includes(u.id)) leftover += n;
  }
  return total === 0 ? 0 : leftover / total;
}

export interface SpreadSearchOptions {
  seed: number; iterations?: number;
  ban?: { result: string; material: string }[];
  keep?: Set<string>;
  /** When given, only these swaps are tried: result -> material -> replacements. */
  allow?: Record<string, Record<string, string[]>>;
  rules?: SpreadRules;
  /** max and min are ratios to the mean grade 1 total. */
  balance?: { weight: number; max: number; min: number };
  topCap?: { weight: number; cap: number; perUnit?: Record<string, number> };
  leftover?: { weight: number; units: string[]; min: number };
}

interface Slot { recipe: number; pos: number; options: string[] }

function grade1Tracker(data: GameData, recipes: { result: string }[], mats: string[][], opts: SpreadSearchOptions) {
  const units = unitMap(data);
  const g1 = grade1Units(data).map(u => u.id);
  const n = g1.length;
  const g1Index = new Map(g1.map((id, i) => [id, i]));
  const recipeOf = new Map(recipes.map((r, i) => [r.result, i]));
  const order = recipes.map((_, i) => i).sort((a, b) => units.get(recipes[a]!.result)!.grade - units.get(recipes[b]!.result)!.grade);
  const rank = new Array<number>(recipes.length);
  order.forEach((i, k) => { rank[i] = k; });
  const vec = new Float64Array(recipes.length * n);
  const leftover = g1.map(id => (LEFTOVER_GRADE1 as readonly string[]).includes(id));

  // A material always has a lower grade than its result, so a pass in grade order sees finished material vectors.
  const refresh = (from: number) => {
    for (let k = from; k < order.length; k++) {
      const i = order[k]!;
      vec.fill(0, i * n, i * n + n);
      for (const m of mats[i]!) {
        const g = g1Index.get(m);
        if (g !== undefined) { vec[i * n + g]!++; continue; }
        const j = recipeOf.get(m);
        if (j !== undefined) for (let x = 0; x < n; x++) vec[i * n + x]! += vec[j * n + x]!;
      }
    }
  };
  const recipeIndex = (id: string) => {
    const i = recipeOf.get(id);
    if (i === undefined) throw new Error(`unit ${id} has no recipe`);
    return i;
  };
  const top = (i: number) => { let t = 0; for (let x = 0; x < n; x++) t = Math.max(t, vec[i * n + x]!); return t; };

  const grade6 = data.units.filter(u => u.grade === 6 && !u.hidden).map(u => u.id);
  const capped = opts.topCap ? [...new Set([...grade6, ...Object.keys(opts.topCap.perUnit ?? {})])]
    .map(id => ({ i: recipeIndex(id), cap: opts.topCap!.perUnit?.[id] ?? opts.topCap!.cap })) : [];
  const sums = grade6.map(recipeIndex);
  const shares = (opts.leftover?.units ?? []).map(recipeIndex);
  const totals = new Float64Array(n);

  const penalty = (): number => {
    let p = 0;
    if (opts.balance) {
      const b = opts.balance;
      totals.fill(0);
      for (const i of sums) for (let x = 0; x < n; x++) totals[x]! += vec[i * n + x]!;
      const mean = totals.reduce((a, v) => a + v, 0) / n;
      let miss = 0;
      for (const t of totals) miss += Math.max(0, t - b.max * mean) + Math.max(0, b.min * mean - t);
      p += miss * b.weight;
    }
    if (opts.topCap) {
      let over = 0;
      for (const c of capped) over += Math.max(0, top(c.i) - c.cap);
      p += over * opts.topCap.weight;
    }
    if (opts.leftover) {
      const l = opts.leftover;
      for (const i of shares) {
        let total = 0;
        let left = 0;
        for (let x = 0; x < n; x++) { total += vec[i * n + x]!; if (leftover[x]) left += vec[i * n + x]!; }
        p += Math.max(0, l.min - (total === 0 ? 0 : left / total)) * 10 * l.weight;
      }
    }
    return p;
  };

  refresh(0);
  return { penalty, refresh: (touched: number[]) => refresh(Math.min(...touched.map(i => rank[i]!))) };
}

export function searchSpread(data: GameData, editable: Set<string>, opts: SpreadSearchOptions): Swap[] {
  const rng: RngState = createRng(opts.seed);
  const units = unitMap(data);
  const recipes = ordinary(data);
  const orig = recipes.map(r => [...r.materials]);
  const mats = recipes.map(r => [...r.materials]);
  const tame = tameDemand(data);
  const graded = targetUnits(data);
  const banned = new Set((opts.ban ?? []).map(b => `${b.result}|${b.material}`));
  const rules = opts.rules ?? {};

  const poolKey = (u: { grade: number; damageType: string }) => rules.crossFamily ? `${u.grade}` : `${u.grade}:${u.damageType}`;
  const pool = new Map<string, string[]>();
  for (const u of data.units) if (!u.hidden) pool.set(poolKey(u), [...(pool.get(poolKey(u)) ?? []), u.id]);
  const slots: Slot[] = [];
  const pairSlots: Slot[] = [];
  recipes.forEach((r, i) => {
    if (!editable.has(r.result) || opts.keep?.has(r.result)) return;
    const locked = lockedMaterials(data, r.result, rules);
    r.materials.forEach((m, pos) => {
      if (locked.has(m)) return;
      const u = units.get(m)!;
      const allowed = opts.allow ? opts.allow[r.result]?.[m] : undefined;
      if (opts.allow && !allowed) return;
      const options = pool.get(poolKey(u))!
        .filter(o => o === m || (!banned.has(`${r.result}|${o}`) && (!allowed || allowed.includes(o))));
      if (options.length > 1) (u.grade === 1 ? pairSlots : slots).push({ recipe: i, pos, options });
    });
  });
  if (!slots.length && !pairSlots.length) return [];
  const slotsOf = (id: string) => slots.filter(s => mats[s.recipe]![s.pos] === id);

  const demand = new Map<string, number>();
  for (const m of mats) for (const id of new Set(m)) demand.set(id, (demand.get(id) ?? 0) + 1);
  const keyOf = (m: string[]) => [...m].sort().join('+');
  const keys = new Map<string, number>();
  for (const r of data.recipes) keys.set(keyOf(r.materials), (keys.get(keyOf(r.materials)) ?? 0) + 1);
  const differs = (i: number) => mats[i]!.some((m, j) => m !== orig[i]![j]);
  let changed = 0;

  const tracker = opts.balance || opts.topCap || opts.leftover ? grade1Tracker(data, recipes, mats, opts) : null;
  const penalty = () => misses(graded, id => demand.get(id) ?? 0, tame).reduce((s, m) => s + m.size, 0);
  const extraPenalty = () => tracker?.penalty() ?? 0;
  const cost = (pen: number, extra: number) => pen * 10 + extra + changed;

  // A slot may take a material the recipe already had only by reverting to it, so the diff never chains swaps.
  const revertOnly = (s: Slot, to: string) => orig[s.recipe]!.includes(to) && orig[s.recipe]![s.pos] !== to;
  const legal = (s: Slot, to: string): boolean => {
    const m = mats[s.recipe]!;
    if (to === m[s.pos]) return false;
    if (m.includes(to)) return false;
    if (revertOnly(s, to)) return false;
    const next = [...m];
    next[s.pos] = to;
    return !keys.get(keyOf(next));
  };
  // Grade 1 units already sit at the validateData cap of 7 recipes, so grade 1 slots only trade materials in pairs.
  const pairLegal = (x: Slot, y: Slot): boolean => {
    if (x.recipe === y.recipe) return false;
    const mx = mats[x.recipe]!;
    const my = mats[y.recipe]!;
    const a = mx[x.pos]!;
    const b = my[y.pos]!;
    if (a === b || !x.options.includes(b) || !y.options.includes(a)) return false;
    if (mx.includes(b) || my.includes(a)) return false;
    if (mx.indexOf(a) !== mx.lastIndexOf(a) || my.indexOf(b) !== my.lastIndexOf(b)) return false;
    if (revertOnly(x, b) || revertOnly(y, a)) return false;
    const nx = [...mx];
    nx[x.pos] = b;
    const ny = [...my];
    ny[y.pos] = a;
    const kx = keyOf(nx);
    const ky = keyOf(ny);
    if (kx === ky) return false;
    const oldX = keyOf(mx);
    const oldY = keyOf(my);
    const taken = (k: string) => (keys.get(k) ?? 0) - Number(k === oldX) - Number(k === oldY) > 0;
    return !taken(kx) && !taken(ky);
  };
  const set = (s: Slot, to: string) => {
    const m = mats[s.recipe]!;
    const before = differs(s.recipe);
    keys.set(keyOf(m), keys.get(keyOf(m))! - 1);
    demand.set(m[s.pos]!, demand.get(m[s.pos]!)! - 1);
    m[s.pos] = to;
    demand.set(to, (demand.get(to) ?? 0) + 1);
    keys.set(keyOf(m), (keys.get(keyOf(m)) ?? 0) + 1);
    changed += Number(differs(s.recipe)) - Number(before);
  };

  const propose = (): [Slot, string] | null => {
    const roll = nextFloat(rng);
    if (roll < 0.4) {
      const over = graded.filter(u => (demand.get(u.id) ?? 0) > SPREAD_TARGETS[u.grade as 2 | 3 | 4 | 5].max);
      const id = over.length ? over[nextInt(rng, over.length)]!.id : null;
      const from = id ? slotsOf(id) : [];
      if (from.length) {
        const s = from[nextInt(rng, from.length)]!;
        const low = s.options.filter(o => legal(s, o)).sort((a, b) => (demand.get(a) ?? 0) - (demand.get(b) ?? 0));
        if (low.length) return [s, low[nextInt(rng, Math.min(3, low.length))]!];
      }
    } else if (roll < 0.6) {
      const back = slots.filter(s => mats[s.recipe]![s.pos] !== orig[s.recipe]![s.pos]);
      if (back.length) {
        const s = back[nextInt(rng, back.length)]!;
        if (legal(s, orig[s.recipe]![s.pos]!)) return [s, orig[s.recipe]![s.pos]!];
      }
    }
    if (!slots.length) return null;
    const s = slots[nextInt(rng, slots.length)]!;
    const to = s.options[nextInt(rng, s.options.length)]!;
    return legal(s, to) ? [s, to] : null;
  };
  const proposePair = (): [Slot, string][] | null => {
    const x = pairSlots[nextInt(rng, pairSlots.length)]!;
    const ys = pairSlots.filter(y => pairLegal(x, y));
    if (!ys.length) return null;
    const y = ys[nextInt(rng, ys.length)]!;
    return [[x, mats[y.recipe]![y.pos]!], [y, mats[x.recipe]![x.pos]!]];
  };
  const pairShare = pairSlots.length / (pairSlots.length + slots.length);

  const iterations = opts.iterations ?? 200_000;
  let pen = penalty();
  let extra = extraPenalty();
  let best: { pen: number; score: number; mats: string[][] } = { pen, score: extra + changed, mats: mats.map(m => [...m]) };
  for (let it = 0; it < iterations; it++) {
    const temp = 2 * Math.pow(0.01, it / iterations);
    let moves: [Slot, string][] | null;
    if (pairSlots.length && nextFloat(rng) < pairShare) moves = proposePair();
    else {
      const move = propose();
      moves = move && [move];
    }
    if (!moves) continue;
    const was = moves.map(([s]) => mats[s.recipe]![s.pos]!);
    const touched = moves.map(([s]) => s.recipe);
    const oldCost = cost(pen, extra);
    for (const [s, to] of moves) set(s, to);
    tracker?.refresh(touched);
    const nextPen = penalty();
    const nextExtra = extraPenalty();
    const delta = cost(nextPen, nextExtra) - oldCost;
    if (delta <= 0 || nextFloat(rng) < Math.exp(-delta / temp)) {
      pen = nextPen;
      extra = nextExtra;
      if (pen < best.pen || (pen === best.pen && extra + changed < best.score)) best = { pen, score: extra + changed, mats: mats.map(m => [...m]) };
    } else {
      moves.forEach(([s], k) => set(s, was[k]!));
      tracker?.refresh(touched);
    }
  }

  const swaps: Swap[] = [];
  best.mats.forEach((m, i) => m.forEach((to, j) => {
    if (to !== orig[i]![j]) swaps.push({ result: recipes[i]!.result, from: orig[i]![j]!, to });
  }));
  return swaps;
}
