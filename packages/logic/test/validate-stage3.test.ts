import { describe, expect, test } from 'vitest';
import { loadGameData, validateData } from '../src/index';
import { makeData } from '../src/testing';

// captured from the validator before the stage 3 rules were added
const BASE1 = {
  errors: [],
  warnings: [
    'grade 1 sotlid is used only in physical recipes',
    'grade 1 dadeumi is used only in physical recipes',
    'grade 1 horong is used only in magical recipes',
    'grade 1 buchae is used only in magical recipes',
  ],
};
const BASE2 = { errors: [], warnings: ['grade 1 sotlid is used only in physical recipes'] };

describe('stage 3 validator rules', () => {
  test('stage 3 data has no errors', () => expect(validateData(loadGameData('stage3')).errors).toEqual([]));

  test('stage 1 and 2 results unchanged', () => {
    expect(validateData(loadGameData())).toEqual(BASE1);
    expect(validateData(loadGameData('stage2'))).toEqual(BASE2);
  });

  test('broken fixtures are reported', () => {
    const d = makeData(x => {
      x.recipes.find(r => r.result === 'top')!.cost = undefined;
      x.recipes.find(r => r.result === 'gildal')!.materials = ['dokki', 'dokki', 'dwiju'];
      x.recipes.find(r => r.result === 'dunggumi')!.materials = ['dunggumi', 'jipsin'];
      x.recipes = x.recipes.filter(r => r.result !== 'mumyeong');
      x.recipes.push({ result: 'jinegaksi', materials: ['top', 'kkeul', 'ja'], cost: { buckwheat: 1, coins: 60 } });
    }, 'stage3');
    const { errors } = validateData(d);
    expect(errors).toContain('recipe top cost {} != {"buckwheat":1}');
    expect(errors).toContain('recipe gildal uses grade-5 dokki twice');
    expect(errors).toContain('recipe dunggumi material dunggumi grade 2 is not below 2');
    expect(errors).toContain('unit mumyeong (grade 2) has no recipe');
    expect(errors.some(e => e.startsWith('unit baneul (grade 3) is not reachable'))).toBe(true);
    expect(errors).toContain('hidden unit jinegaksi is in recipe jinegaksi');
  });

  test('shape, duplicate materials and orphan rules', () => {
    const d = makeData(x => {
      x.recipes.find(r => r.result === 'gildal')!.materials = ['dokki', 'kkeul', 'dongwe'];
      x.recipes.find(r => r.result === 'cheonnyeonmunbitjang')!.materials = ['top', 'kkeul', 'ja'];
      x.recipes.find(r => r.result === 'cheonnyeonsangmo')!.materials = ['gat', 'gat', 'gawi'];
    }, 'stage3');
    const { errors } = validateData(d);
    expect(errors).toContain('recipe gildal shape 5+5+5 != 3+5+5 or 4+5+5');
    expect(errors).toContain('recipes bihyeongrang and cheonnyeonmunbitjang have the same materials');
    expect(errors).toContain('recipe cheonnyeonsangmo uses grade-5 gat twice');
    expect(errors).toContain('unit manggeon (grade 5) is not used in any recipe');
  });
});

test('invalid market settings fail validation', () => {
  for (const weights of [[0, 0], [-1, 3], [1, Infinity], [3]]) {
    expect(validateData(makeData(d => { d.economy!.market!.draw.weights = weights; }, 'stage3')).errors).toContain('invalid market weights');
  }
  const invalid = makeData(d => {
    d.economy!.startingBuckwheat = -1;
    d.economy!.market!.draw.perDay = 0.5;
    d.economy!.market!.jigeChance = 1.1;
  }, 'stage3');
  expect(validateData(invalid).errors).toEqual(expect.arrayContaining(['invalid startingBuckwheat', 'invalid market price or limit', 'invalid jige chance']));
});
