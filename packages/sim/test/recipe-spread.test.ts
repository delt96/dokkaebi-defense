import { describe, expect, test } from 'vitest';
import { buildGameData, loadGameData, recipeDemand, recipeValue, unitDef } from '@dorandi/logic';
import {
  applySwaps, changedRecipes, editableRecipes, grade1Balance, grade1Totals, leafCounts, leftoverShare, lockedMaterials, searchSpread, spreadDemand, spreadLowerBound, swapProblems, targetMisses, topGrade1,
  type Swap,
} from '../src/stage3/spread';
import v5Recipes from './recipes-stage3-v5.json';
import baseline from './spread-v6-baseline.json';
import { preV7Sources, v6Stage3 } from './pre-v7';

// The search is pinned on the skewed stage 3 recipes of content draft v5, before v6 evened them out.
const d3 = buildGameData('stage3', preV7Sources(v5Recipes));
const editable = editableRecipes(preV7Sources());
const normal = (g: number) => d3.units.filter(u => u.grade === g && !u.hidden);
const ALLOW: Record<string, Record<string, string[]>> = { bihyeongrang: { kkeul: ['hahoetal', 'eomang'] }, gildal: { kkeul: ['beoseon'] }, jejuyeonggam: { buk: ['ssatba'] } };

describe('demand and targets', () => {
  test('spreadDemand matches the spec current table', () => {
    const d = spreadDemand(d3);
    expect(Object.fromEntries(['kkeul', 'sil', 'gat', 'ja', 'onggigama', 'cheongsachorong', 'saekkijul', 'baneul'].map(id => [id, d.get(id)])))
      .toEqual({ kkeul: 7, sil: 5, gat: 1, ja: 7, onggigama: 6, cheongsachorong: 2, saekkijul: 5, baneul: 5 });
    expect(normal(3).filter(u => d.get(u.id) === 1).length).toBe(10);
    expect(normal(1).map(u => d.get(u.id))).toEqual(Array(8).fill(7));
  });

  test('the current stage 3 data meets every target', () => {
    expect(targetMisses(loadGameData('stage3'))).toEqual([]);
  });

  test('targetMisses lists the current misses', () => {
    const misses = targetMisses(d3).join('\n');
    for (const id of ['kkeul', 'ja', 'meongseok', 'cheongsachorong']) expect(misses).toContain(id);
    expect(misses).toMatch(/grade 3.*10/);
  });

  test('editableRecipes is the stage 3 file only', () => {
    expect(editable.has('kkeul')).toBe(true);
    expect(editable.has('bihyeongrang')).toBe(true);
    expect(editable.has('yeonjabangga')).toBe(false);
    expect(editable.has('ja')).toBe(false);
    expect(editable.has('baekbalbaneulgaksi')).toBe(false);
  });

  test('lockedMaterials holds grade 1 materials and skill sources', () => {
    expect(lockedMaterials(d3, 'jejuyeonggam').has('buk')).toBe(true);
    const sangmo = lockedMaterials(d3, 'cheonnyeonsangmo');
    expect([sangmo.has('gat'), sangmo.has('manggeon'), sangmo.has('gawi')]).toEqual([true, true, false]);
    expect([...lockedMaterials(d3, 'didilbangga')].sort()).toEqual(['dadeumi', 'jipsin']);
  });
});

describe('swapProblems', () => {
  const problems = (...swaps: Swap[]) => swapProblems(d3, editable, swaps);

  test('rejects a different family', () => {
    expect(problems({ result: 'bihyeongrang', from: 'kkeul', to: 'sil' })).not.toEqual([]);
  });

  test('rejects a different grade', () => {
    expect(problems({ result: 'bihyeongrang', from: 'kkeul', to: 'moru' })).not.toEqual([]);
  });

  test('rejects a stage1 or stage2 row', () => {
    expect(problems({ result: 'yeonjabangga', from: 'meongseok', to: 'gamasot' })).not.toEqual([]);
    expect(problems({ result: 'ja', from: 'mumyeong', to: 'cheongsachorong' })).not.toEqual([]);
  });

  test('rejects removing a skill source', () => {
    expect(problems({ result: 'jejuyeonggam', from: 'buk', to: 'hahoetal' })).not.toEqual([]);
  });

  test('rejects a duplicated material', () => {
    expect(problems({ result: 'bihyeongrang', from: 'top', to: 'kkeul' })).not.toEqual([]);
  });

  test('rejects a material missing from the recipe', () => {
    expect(problems({ result: 'bihyeongrang', from: 'sil', to: 'janggu' })).not.toEqual([]);
  });

  test('runs validateData on the swapped data', () => {
    const hosts = d3.recipes.filter(r => editable.has(r.result) && !r.materials.includes('top'));
    const swaps: Swap[] = [];
    for (const r of hosts) {
      const locked = lockedMaterials(d3, r.result);
      const from = r.materials.find(m => !locked.has(m) && unitDef(d3, m).grade === 5 && unitDef(d3, m).damageType === 'physical');
      if (from) swaps.push({ result: r.result, from, to: 'top' });
      if (swaps.length === 3) break;
    }
    expect(swaps.length).toBe(3);
    expect(problems(...swaps).join('\n')).toContain('top is used in 8 recipes');
  });

  test('accepts a legal swap', () => {
    expect(problems({ result: 'bihyeongrang', from: 'kkeul', to: 'hahoetal' })).toEqual([]);
  });
});

describe('swaps and trees', () => {
  test('applySwaps changes only the swapped slot in a copy', () => {
    const swapped = applySwaps(d3, [{ result: 'bihyeongrang', from: 'kkeul', to: 'hahoetal' }]);
    expect(swapped.recipes.find(r => r.result === 'bihyeongrang')!.materials).toEqual(['top', 'hahoetal', 'ja']);
    expect(d3.recipes.find(r => r.result === 'bihyeongrang')!.materials).toEqual(['top', 'kkeul', 'ja']);
    expect(changedRecipes([{ result: 'a', from: 'x', to: 'y' }, { result: 'a', from: 'z', to: 'w' }, { result: 'b', from: 'x', to: 'y' }]))
      .toEqual(['a', 'b']);
  });

  test('leafCounts expands down to grade 1', () => {
    expect(Object.fromEntries(leafCounts(d3, 'dunggumi'))).toEqual({ jipsin: 2 });
    for (const u of normal(6)) {
      const recipe = d3.recipes.find(r => r.result === u.id && r.kind !== 'tame')!;
      const total = [...leafCounts(d3, u.id).values()].reduce((a, b) => a + b, 0);
      expect([u.id, total]).toEqual([u.id, recipeValue(d3, recipe)]);
    }
  });
});

test('searchSpread meets every target', () => {
  const swaps = searchSpread(d3, editable, {
    seed: 1, ban: [{ result: 'bihyeongrang', material: 'hahoetal' }], keep: new Set(['bihyeongrang']),
  });
  expect(swapProblems(d3, editable, swaps)).toEqual([]);
  expect(targetMisses(applySwaps(d3, swaps))).toEqual([]);
  expect(swaps.some(s => s.result === 'bihyeongrang')).toBe(false);
  expect(changedRecipes(swaps).length).toBeLessThanOrEqual(20);
  const bound = spreadLowerBound(d3);
  expect(bound).toBeGreaterThan(0);
  expect(swaps.length).toBeGreaterThanOrEqual(bound);
}, 120_000);

test('searchSpread with an allow list only makes listed swaps', () => {
  const swaps = searchSpread(d3, editable, { seed: 1, allow: ALLOW });
  expect(swaps.length).toBeGreaterThan(0);
  for (const s of swaps) expect(ALLOW[s.result]?.[s.from]).toContain(s.to);
  expect(swaps.some(s => s.result === 'jejuyeonggam')).toBe(false);
  expect(swapProblems(d3, editable, swaps)).toEqual([]);
});

describe('grade 1 totals', () => {
  const d = v6Stage3();
  test('grade1Totals matches the spec table', () => {
    expect(Object.fromEntries(grade1Totals(d))).toEqual({
      bujigaengi: 189, dadeumi: 183, horong: 181, jipsin: 180, buchae: 118, sotlid: 111, ki: 93, bitjaru: 85 });
  });
  test('grade1Balance is 1.33 / 0.60 today', () => {
    const b = grade1Balance(d);
    expect(b.mean).toBeCloseTo(142.5, 5);
    expect(b.maxRatio).toBeCloseTo(189 / 142.5, 5);
    expect(b.minRatio).toBeCloseTo(85 / 142.5, 5);
  });
  test('topGrade1 of the fast and slow grade 6', () => {
    expect(topGrade1(d, 'bangmangidokkaebi')).toEqual({ id: 'jipsin', n: 6 });
    expect(topGrade1(d, 'cheonnyeonjing')).toEqual({ id: 'bujigaengi', n: 14 });
    expect(d.units.filter(u => u.grade === 6 && !u.hidden && topGrade1(d, u.id).n > 10).length).toBe(13);
  });
  test('leftoverShare of samtaegi is 1', () => {
    expect(leftoverShare(d, 'samtaegi')).toBe(1);
  });
});

describe('v7 rules', () => {
  const rules = { crossFamily: true, unlockGrade1: true };
  test('options off reproduce the v6 search', () => {
    expect(searchSpread(d3, editable, { seed: 1, ban: [{ result: 'bihyeongrang', material: 'hahoetal' }], keep: new Set(['bihyeongrang']) }))
      .toEqual(baseline.banKeep);
    // the allow-list run of the existing test, same inputs
    expect(searchSpread(d3, editable, { seed: 1, allow: ALLOW })).toEqual(baseline.allow);
  }, 240_000);
  test('crossFamily accepts a family change only when on', () => {
    expect(swapProblems(d3, editable, [{ result: 'bihyeongrang', from: 'kkeul', to: 'sil' }])).not.toEqual([]);
    expect(swapProblems(d3, editable, [{ result: 'bihyeongrang', from: 'kkeul', to: 'sil' }], rules)).toEqual([]);
  });
  test('unlockGrade1: a single grade 1 swap breaks the 7 cap, a pair passes', () => {
    const v6 = v6Stage3();
    const one = [{ result: 'sutdarimi', from: 'dadeumi', to: 'ki' }];
    expect(swapProblems(v6, editable, one, rules).join('\n')).toContain('ki is used in 8 recipes');
    expect(swapProblems(v6, editable, [...one, { result: 'samtaegi', from: 'ki', to: 'dadeumi' }], rules)).toEqual([]);
    // 모깃불↔삼태기 pair would give samtaegi the jaetmulsiru material set
    expect(swapProblems(v6, editable, [{ result: 'mogitbul', from: 'bujigaengi', to: 'ki' }, { result: 'samtaegi', from: 'ki', to: 'bujigaengi' }], rules).join('\n'))
      .toContain('same materials');
  });
  test('unlock keeps skill sources', () => {
    expect(lockedMaterials(d3, 'jejuyeonggam', rules).has('buk')).toBe(true);
    const sangmo = lockedMaterials(d3, 'cheonnyeonsangmo', rules);
    expect([sangmo.has('gat'), sangmo.has('manggeon')]).toEqual([true, true]);
    expect(lockedMaterials(d3, 'didilbangga', rules).size).toBe(0);
  });
  test('pairSwap legality: never empties one copy of a doubled grade 1', () => {
    const v6 = v6Stage3();
    const swaps = searchSpread(v6, editable, { seed: 1, iterations: 20_000, rules, balance: { weight: 1, max: 1.1, min: 0.9 } });
    expect(swapProblems(v6, editable, swaps, rules)).toEqual([]);
    expect(swaps.some(s => unitDef(v6, s.from).grade === 1)).toBe(true);
    for (const id of ['dunggumi', 'hongdukkae', 'jipsingol']) expect(swaps.some(s => s.result === id && unitDef(v6, s.from).grade === 1)).toBe(false);
    const g1 = v6.units.filter(u => u.grade === 1).map(u => recipeDemand(applySwaps(v6, swaps), u.id));
    expect(g1).toEqual(Array(8).fill(7));
  }, 120_000);
  test('balance and topCap penalties lower the skew', () => {
    const v6 = v6Stage3();
    const swaps = searchSpread(v6, editable, { seed: 1, iterations: 50_000, rules,
      balance: { weight: 1, max: 1.1, min: 0.9 }, topCap: { weight: 1, cap: 10 } });
    const after = applySwaps(v6, swaps);
    expect(grade1Balance(after).maxRatio).toBeLessThan(grade1Balance(v6).maxRatio);
    expect(targetMisses(after)).toEqual([]);
  }, 120_000);
});
