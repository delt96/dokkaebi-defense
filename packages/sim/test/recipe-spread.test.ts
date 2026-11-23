import { describe, expect, test } from 'vitest';
import { dataSources, loadGameData, recipeValue, unitDef } from '@dorandi/logic';
import {
  applySwaps, changedRecipes, editableRecipes, leafCounts, lockedMaterials, searchSpread, spreadDemand, spreadLowerBound, swapProblems, targetMisses,
  type Swap,
} from '../src/stage3/spread';

const d3 = loadGameData('stage3');
const editable = editableRecipes(dataSources());
const normal = (g: number) => d3.units.filter(u => u.grade === g && !u.hidden);

describe('demand and targets', () => {
  test('spreadDemand matches the spec current table', () => {
    const d = spreadDemand(d3);
    expect(Object.fromEntries(['kkeul', 'sil', 'gat', 'ja', 'onggigama', 'cheongsachorong', 'saekkijul', 'baneul'].map(id => [id, d.get(id)])))
      .toEqual({ kkeul: 7, sil: 5, gat: 1, ja: 7, onggigama: 6, cheongsachorong: 2, saekkijul: 5, baneul: 5 });
    expect(normal(3).filter(u => d.get(u.id) === 1).length).toBe(10);
    expect(normal(1).map(u => d.get(u.id))).toEqual(Array(8).fill(7));
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
