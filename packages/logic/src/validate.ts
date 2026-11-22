import { DIFFICULTIES, type GameData } from './types';
import { gradeValue, recipeDemand, recipeValue } from './data';

const SHAPES: Record<number, number[][]> = { 2: [[1, 1]], 3: [[1, 1, 2]], 4: [[2, 2, 3]], 5: [[4, 4]], 6: [[3, 5, 5], [4, 5, 5]] };
const COSTS: Record<number, { buckwheat?: number; coins?: number }> = { 5: { buckwheat: 1 }, 6: { buckwheat: 1, coins: 60 } };

const costKey = (c: { buckwheat?: number; coins?: number } | undefined): string =>
  JSON.stringify({ ...(c?.buckwheat && { buckwheat: c.buckwheat }), ...(c?.coins && { coins: c.coins }) });

export function validateData(data: GameData): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  if (data.balance.rounds === 60) {
    if (data.balance.defaultDifficulty !== 'normal') errors.push('invalid defaultDifficulty');
    for (const d of DIFFICULTIES) {
      const grant = data.balance.difficulties?.[d]?.tokensPerRound;
      if (grant === undefined || !Number.isInteger(grant) || grant <= 0) errors.push(`invalid difficulties.${d}`);
    }
  }
  const eco = data.economy;
  if (eco && (!Number.isInteger(eco.startingBuckwheat) || eco.startingBuckwheat < 0)) errors.push('invalid startingBuckwheat');
  const market = eco?.market;
  if (market) {
    const draw = market.draw;
    if (!draw || ![market.dayRounds, draw.perDay, draw.buckwheatCost].every(n => Number.isInteger(n) && n > 0))
      errors.push('invalid market price or limit');
    const w = draw?.weights;
    if (!Array.isArray(w) || w.length !== 2 || !w.every(n => Number.isFinite(n) && n >= 0) || !(w[0]! + w[1]! > 0))
      errors.push('invalid market weights');
    if (!(market.jigeChance >= 0 && market.jigeChance <= 1)) errors.push('invalid jige chance');
    for (const grade of [2, 3]) if (!data.units.some(u => !u.hidden && u.grade === grade)) errors.push('empty market pool');
  }

  const tame = eco?.tame;
  if (tame) {
    const b = tame.hpBands;
    const sorted = Array.isArray(b) && b.length > 0 && b.every((x, i) => x.upTo > (i === 0 ? 0 : b[i - 1]!.upTo));
    if (!sorted || b[b.length - 1]!.upTo !== 1 || !b.every(x => x.chance >= 0 && x.chance <= 1)) errors.push('invalid tame hpBands');
    if (!(tame.failureHealPct >= 0 && tame.failureHealPct <= 1)) errors.push('invalid tame failureHealPct');
    if (!(tame.cooldownSeconds > 0)) errors.push('invalid tame cooldownSeconds');
    for (const t of tame.targets) {
      if (!Object.values(t.cost).every(n => Number.isInteger(n) && n! >= 0)) errors.push(`invalid tame cost: ${t.enemy}`);
      if (!data.units.some(u => u.id === t.unit)) errors.push(`unknown tame unit: ${t.unit}`);
    }
  }

  const warnings: string[] = [];
  const bands = data.balance.summonOddsByRound;
  if (bands !== undefined) {
    if (!Array.isArray(bands) || bands[0]?.fromRound !== 1) {
      errors.push('summonOddsByRound must start at round 1');
    }
    let previous = 0;
    for (const band of Array.isArray(bands) ? bands : []) {
      if (!Number.isInteger(band?.fromRound) || band.fromRound <= previous) {
        errors.push('summonOddsByRound rounds must be strictly increasing integers');
      }
      previous = band?.fromRound;
      const odds = band?.odds;
      if (!Array.isArray(odds) || odds.some(p => !Number.isFinite(p) || p < 0)
        || Math.abs(odds.reduce((sum, p) => sum + p, 0) - 1) > 1e-10) {
        errors.push(`summonOddsByRound round ${previous} needs nonnegative probabilities summing to 1`);
      }
    }
  }
  const byId = new Map(data.units.map(u => [u.id, u]));
  const seen = new Set<string>();
  for (const u of data.units) {
    if (seen.has(u.id)) errors.push(`duplicate unit id ${u.id}`);
    seen.add(u.id);
  }
  const enemyIds = new Set(data.enemies.map(e => e.id));
  const sameMaterials = new Map<string, string>();

  const recruits = new Set(data.economy?.tame?.targets.map(t => t.unit) ?? []);
  const results = new Set<string>();
  const usedRecruits = new Set<string>();
  for (const r of data.recipes) {
    const result = byId.get(r.result);
    if (!result) { errors.push(`recipe result ${r.result} is not a unit`); continue; }
    if (results.has(r.result)) errors.push(`unit ${r.result} has two recipes`);
    results.add(r.result);
    const missing = r.materials.filter(m => !byId.has(m));
    for (const m of missing) errors.push(`recipe ${r.result} uses unknown unit ${m}`);
    if (missing.length) continue;
    const key = [...r.materials].sort().join('+');
    const prev = sameMaterials.get(key);
    if (prev !== undefined) errors.push(`recipes ${prev} and ${r.result} have the same materials`);
    else sameMaterials.set(key, r.result);
    if (r.kind === 'tame') {
      // one tamed recruit and one normal grade 5 into a hidden grade 6, at the grade 6 fee
      const recruit = r.materials.filter(m => recruits.has(m) && byId.get(m)!.hidden && byId.get(m)!.grade === 4);
      const partner = r.materials.filter(m => !byId.get(m)!.hidden && byId.get(m)!.grade === 5);
      if (!data.economy?.tame) errors.push(`exclusive recipe ${r.result} without taming`);
      if (r.materials.length !== 2 || recruit.length !== 1 || partner.length !== 1) errors.push(`exclusive recipe ${r.result} needs one recruit and one normal grade 5`);
      if (!result.hidden || result.grade !== 6) errors.push(`exclusive recipe ${r.result} must make a hidden grade 6`);
      if (costKey(r.cost) !== costKey(COSTS[6])) errors.push(`exclusive recipe ${r.result} cost ${costKey(r.cost)} != ${costKey(COSTS[6])}`);
      for (const m of recruit) {
        if (usedRecruits.has(m)) errors.push(`recruit ${m} is in two exclusive recipes`);
        usedRecruits.add(m);
      }
      continue;
    }
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
  }
  if (data.recipes.some(r => r.kind === 'tame')) {
    for (const id of recruits) if (!usedRecruits.has(id)) errors.push(`recruit ${id} has no exclusive recipe`);
    for (const u of data.units) {
      if (u.hidden && u.grade === 6 && !data.recipes.some(r => r.result === u.id && r.kind === 'tame')) errors.push(`hidden ${u.id} has no exclusive recipe`);
    }
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
