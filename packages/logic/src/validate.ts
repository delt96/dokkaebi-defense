import { DIFFICULTIES, type GameData } from './types';
import { gamblePool, gradeValue, recipeDemand, recipeValue } from './data';

const SHAPES: Record<number, number[][]> = { 2: [[1, 1]], 3: [[1, 1, 2]], 4: [[2, 2, 3]], 5: [[4, 4]], 6: [[3, 5, 5], [4, 5, 5]] };
const COSTS: Record<number, { buckwheat?: number; coins?: number }> = { 5: { buckwheat: 1 }, 6: { buckwheat: 1, coins: 60 } };

const costKey = (c: { buckwheat?: number; coins?: number } | undefined): string =>
  JSON.stringify({ ...(c?.buckwheat && { buckwheat: c.buckwheat }), ...(c?.coins && { coins: c.coins }) });

const positiveInt = (n: unknown): boolean => Number.isSafeInteger(n) && Number(n) > 0;
const validOdds = (rows: unknown): rows is { result: unknown; chance: number }[] =>
  Array.isArray(rows) && rows.length > 0
  && rows.every(r => r && Number.isFinite(r.chance) && r.chance > 0 && r.chance <= 1)
  && new Set(rows.map(r => r.result)).size === rows.length
  && Math.abs(rows.reduce((sum, r) => sum + r.chance, 0) - 1) < 1e-9;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const positive = (n: unknown): boolean => typeof n === 'number' && Number.isFinite(n) && n > 0;
const EFFECT_KEYS: Record<string, string[]> = { range: ['amount'], attack: ['pct'], speed: ['pct'], vuln: ['pct', 'seconds'] };

function validShop(shop: unknown): boolean {
  if (!isObject(shop) || !Array.isArray(shop.items)) return false;
  const ids = new Set<string>();
  for (const item of shop.items as unknown[]) {
    if (!isObject(item) || !isObject(item.effect)) return false;
    if (typeof item.id !== 'string' || !item.id || ids.has(item.id)) return false;
    ids.add(item.id);
    if (!positiveInt(item.coins) || (item.perGame !== undefined && !positiveInt(item.perGame))) return false;
    const keys = typeof item.effect.kind === 'string' && Object.hasOwn(EFFECT_KEYS, item.effect.kind) ? EFFECT_KEYS[item.effect.kind]! : null;
    if (!keys || !keys.every(k => positive((item.effect as Record<string, unknown>)[k]))) return false;
  }
  return true;
}

export function validateData(data: GameData): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  if (data.economy !== undefined || data.balance.difficulties !== undefined) {
    if (data.balance.defaultDifficulty !== 'normal') errors.push('invalid defaultDifficulty');
    for (const d of DIFFICULTIES) {
      const grant = data.balance.difficulties?.[d]?.tokensPerRound;
      if (grant === undefined || !Number.isInteger(grant) || grant <= 0) errors.push(`invalid difficulties.${d}`);
    }
  }
  const growth = data.balance.resistByRound;
  if (growth !== undefined) {
    const { fromRound, toRound, top, cap } = growth ?? {};
    if (!Number.isInteger(fromRound) || fromRound < 1 || !Number.isInteger(toRound) || toRound <= fromRound
      || !(Number.isFinite(top) && top >= 0 && top < 1) || !(Number.isFinite(cap) && cap > 0 && cap < 1)) errors.push('invalid resistByRound');
    else if (data.enemies.some(e => !e.event && (e.resist.physical > cap || e.resist.magical > cap))) errors.push('resistByRound cap is below a base resist');
    if (toRound > data.balance.rounds) errors.push('resistByRound toRound is past the last round');
  }
  const late = data.balance.hp.late;
  if (late !== undefined && !(Number.isInteger(late?.fromRound) && late.fromRound >= 1 && late.fromRound <= data.balance.rounds
    && Number.isFinite(late.perRound) && late.perRound > 0)) errors.push('invalid hp.late');
  const instant = data.balance.limitInstantFromRound;
  if (instant !== undefined && !(Number.isInteger(instant) && instant >= 1 && instant <= data.balance.rounds)) errors.push('invalid limitInstantFromRound');
  const slow = data.balance.zoneSlow;
  if (slow !== undefined && !(Number.isFinite(slow?.pctFactor) && slow.pctFactor > 0 && slow.pctFactor <= 1)) errors.push('invalid zoneSlow');
  const eco = data.economy;
  if (eco && (!Number.isInteger(eco.startingBuckwheat) || eco.startingBuckwheat < 0)) errors.push('invalid startingBuckwheat');
  const market = eco?.market;
  if (market) {
    if (!(market.jigeChance >= 0 && market.jigeChance <= 1)) errors.push('invalid jige chance');
    const unlock = market.openAfterBossRound;
    if (unlock !== undefined && !(Number.isInteger(unlock) && unlock > 0)) errors.push('invalid market unlock round');
  }

  const gamble = market?.gamble;
  if (gamble !== undefined) {
    const coins = gamble?.coins;
    const units = gamble?.units;
    if (!coins || !Array.isArray(coins.stakes) || !coins.stakes.length || !coins.stakes.every(positiveInt)
      || new Set(coins.stakes).size !== coins.stakes.length || !positiveInt(coins.perRound)
      || !positiveInt(coins.bigMultiplier) || !validOdds(coins.outcomes)
      || (coins.openStakes !== undefined && (!Array.isArray(coins.openStakes) || !coins.openStakes.every(s => coins.stakes.includes(s))))
      || !coins.outcomes.every(o => Number.isFinite(o.result) && o.result >= 0
        && coins.stakes.every(s => Number.isSafeInteger(Math.floor(s * o.result))))) errors.push('invalid coin gamble');
    if (!units || !positiveInt(units.perRound) || !positiveInt(units.bigGrade)) errors.push('invalid unit gamble');
    for (const id of ['small', 'big', 'coin'] as const) {
      const table = units?.tables?.[id];
      if (id === 'coin' && table === undefined) continue;
      const paid = id === 'coin'
        ? positiveInt(table?.coinCost) && table!.buckwheatCost === 0 && positiveInt(table!.perRound)
        : positiveInt(table?.buckwheatCost) && (table!.coinCost === undefined || positiveInt(table!.coinCost));
      if (!table || !paid || !Number.isSafeInteger(table.consolation) || table.consolation < 0
        || !positiveInt(table.fromRound) || table.fromRound > data.balance.rounds
        || !validOdds(table.outcomes) || !table.outcomes.every(({ result }) => result === 0
          || ((result === 'hidden' || [1, 2, 3, 4, 5, 6].includes(result)) && gamblePool(data, result).length > 0))) {
        errors.push(`invalid unit gamble table: ${id}`);
      }
    }
  }

  const hunts = eco?.hunts;
  if (hunts) {
    if (!(hunts.seconds > 0) || !positiveInt(hunts.cooldownSeconds) || !(Number.isFinite(hunts.hpGrowth) && hunts.hpGrowth >= 1))
      errors.push('invalid hunts timing or growth');
    if (!Array.isArray(hunts.targets) || hunts.targets.length === 0) errors.push('invalid hunts targets');
    const seenHunt = new Set<string>();
    for (const t of hunts.targets ?? []) {
      const def = data.enemies.find(e => e.id === t.enemy);
      if (!def || !def.event || def.boss || def.shared) errors.push(`hunt target must be an event enemy: ${t.enemy}`);
      if (seenHunt.has(t.enemy)) errors.push(`duplicate hunt target: ${t.enemy}`);
      seenHunt.add(t.enemy);
      if (!Number.isInteger(t.fromRound) || t.fromRound < 1 || t.fromRound > data.balance.rounds) errors.push(`invalid hunt fromRound: ${t.enemy}`);
      if (!(Number.isInteger(t.hp) && t.hp > 0)) errors.push(`invalid hunt hp: ${t.enemy}`);
      if (t.cooldownSeconds !== undefined && !positiveInt(t.cooldownSeconds)) errors.push(`invalid hunt cooldownSeconds: ${t.enemy}`);
      const r = t.reward;
      if (!(Number.isInteger(t.fee) && t.fee >= 0) || !r || ![r.buckwheat, r.coins, r.coinsPerLevel].every(n => Number.isInteger(n) && n >= 0))
        errors.push(`invalid hunt fee or reward: ${t.enemy}`);
    }
  }

  const tame = eco?.tame;
  if (tame) {
    const b = tame.hpBands;
    const sorted = Array.isArray(b) && b.length > 0 && b.every((x, i) => x.upTo > (i === 0 ? 0 : b[i - 1]!.upTo));
    if (!sorted || b[b.length - 1]!.upTo !== 1 || !b.every(x => x.chance >= 0 && x.chance <= 1)) errors.push('invalid tame hpBands');
    if (!(tame.failureHealPct >= 0 && tame.failureHealPct <= 1)) errors.push('invalid tame failureHealPct');
    if (!(tame.cooldownSeconds > 0)) errors.push('invalid tame cooldownSeconds');
    if (tame.combineFromRound !== undefined && !(Number.isInteger(tame.combineFromRound) && tame.combineFromRound >= 1 && tame.combineFromRound <= data.balance.rounds)) {
      errors.push('invalid tame combine round');
    }
    for (const t of tame.targets) {
      if (!Object.values(t.cost).every(n => Number.isInteger(n) && n! >= 0)) errors.push(`invalid tame cost: ${t.enemy}`);
      if (!data.units.some(u => u.id === t.unit)) errors.push(`unknown tame unit: ${t.unit}`);
    }
  }

  const shop = eco?.shop;
  if (shop !== undefined && !validShop(shop)) errors.push('invalid shop');

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
