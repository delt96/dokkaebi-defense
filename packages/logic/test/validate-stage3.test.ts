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

  test('stage 3 rules validate at any round count', () => {
    const d = structuredClone(loadGameData('stage3'));
    d.balance.rounds = 70;
    d.balance.resistByRound = { ...d.balance.resistByRound!, toRound: 70 };
    d.waves.push(...Array.from({ length: 10 }, (_, i) => ({ ...d.waves[50 + i]!, round: 61 + i })));
    expect(validateData(d).errors).toEqual([]);
  });

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
      x.recipes.find(r => r.result === 'cheonnyeonmunbitjang')!.materials = ['top', 'kkeul', 'jumadeung'];
      x.recipes.find(r => r.result === 'cheonnyeonsangmo')!.materials = ['gat', 'gat', 'gawi'];
      x.recipes.find(r => r.result === 'gamtudokkaebi')!.materials = ['banjitgori', 'sil', 'sutdarimi'];
    }, 'stage3');
    const { errors } = validateData(d);
    expect(errors).toContain('recipe gildal shape 5+5+5 != 3+5+5 or 4+5+5');
    expect(errors).toContain('recipes bihyeongrang and cheonnyeonmunbitjang have the same materials');
    expect(errors).toContain('recipe cheonnyeonsangmo uses grade-5 gat twice');
    expect(errors).toContain('unit manggeon (grade 5) is not used in any recipe');
  });
});

test('invalid market settings fail validation', () => {
  const invalid = makeData(d => {
    d.economy!.startingBuckwheat = -1;
    d.economy!.market!.openAfterBossRound = 0.5;
    d.economy!.market!.jigeChance = 1.1;
    d.economy!.tame!.combineFromRound = 0.5;
    d.balance.limitInstantFromRound = 0;
  }, 'stage3');
  expect(validateData(invalid).errors).toEqual(expect.arrayContaining(['invalid startingBuckwheat', 'invalid market unlock round', 'invalid jige chance', 'invalid tame combine round', 'invalid limitInstantFromRound']));
});

describe('exclusive recipe checks', () => {
  const d3 = loadGameData('stage3');
  const errs = (edit: (d: ReturnType<typeof loadGameData>) => void) => {
    const d = structuredClone(d3);
    edit(d);
    return validateData(d).errors;
  };
  const tame = (d: ReturnType<typeof loadGameData>, result: string) => d.recipes.find(r => r.result === result)!;

  test('wrong material, fee, grade, hidden flag, unregistered recruit, reuse and ordinary recipes with hidden units are refused', () => {
    expect(errs(() => {})).toEqual([]);
    expect(errs(d => { tame(d, 'baekbalbaneulgaksi').materials = ['jinegaksi', 'meok']; }).length).toBeGreaterThan(0);
    expect(errs(d => { tame(d, 'baekbalbaneulgaksi').materials = ['jinegaksi', 'banjitgori', 'top']; }).length).toBeGreaterThan(0);
    expect(errs(d => { tame(d, 'baekbalbaneulgaksi').cost = { buckwheat: 1, coins: 50 }; }).length).toBeGreaterThan(0);
    expect(errs(d => { d.units.find(u => u.id === 'baekbalbaneulgaksi')!.grade = 5; }).length).toBeGreaterThan(0);
    expect(errs(d => { delete d.units.find(u => u.id === 'baekbalbaneulgaksi')!.hidden; }).length).toBeGreaterThan(0);
    expect(errs(d => { d.economy!.tame!.targets = d.economy!.tame!.targets.filter(t => t.unit !== 'jinegaksi'); }).length).toBeGreaterThan(0);
    expect(errs(d => { tame(d, 'sonakheobeokjigi').materials = ['jinegaksi', 'jejuheobeok']; }).length).toBeGreaterThan(0);
    expect(errs(d => { d.recipes.push({ ...tame(d, 'baekbalbaneulgaksi') }); }).length).toBeGreaterThan(0);
    expect(errs(d => { delete tame(d, 'baekbalbaneulgaksi').kind; }).length).toBeGreaterThan(0);
    expect(errs(d => { d.recipes.find(r => r.kind !== 'tame' && d.units.find(u => u.id === r.result)!.grade === 6)!.materials[0] = 'jinegaksi'; }).length).toBeGreaterThan(0);
  });
});
