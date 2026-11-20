import { describe, expect, test } from 'vitest';
import { loadGameData, unitDef, enemyDef, gradeDps, unitAttack, enemyHp } from '../src/data';
import { validateData as v } from '../src/validate';

const data = loadGameData();

describe('data', () => {
  test('22 units by grade and type', () => {
    const byGrade = [1, 2, 3, 4].map(g => data.units.filter(u => u.grade === g).length);
    expect(byGrade).toEqual([8, 6, 4, 4]);
    expect(data.units.filter(u => u.damageType === 'physical').length).toBe(11);
    expect(data.recipes.length).toBe(14);
  });
  test('jangdok recipe', () => {
    expect([...data.recipes.find(r => r.result === 'jangdok')!.materials].sort()).toEqual(['gamasot', 'ki', 'sotlid']);
  });
  test('derived numbers', () => {
    expect(unitAttack(unitDef(data, 'sotlid'), data.balance)).toBeCloseTo(13.2);
    expect(gradeDps(data.balance, 4)).toBeCloseTo(175.76);
    expect(enemyHp(enemyDef(data, 'japgwi'), 1, data.balance)).toBe(52);
    expect(enemyHp(enemyDef(data, 'japgwi'), 10, data.balance)).toBe(419);
    expect(enemyHp(enemyDef(data, 'japgwi'), 19, data.balance)).toBe(1034);
    expect(enemyHp(enemyDef(data, 'dueoksini'), 10, data.balance)).toBe(629);
    expect(enemyHp(enemyDef(data, 'jinegaksi'), 10, data.balance)).toBe(3000);
  });
  test('shipped data validates with 4 one-sided warnings', () => {
    const r = v(data);
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBe(4);
    for (const id of ['sotlid', 'dadeumi', 'horong', 'buchae']) expect(r.warnings.some(w => w.includes(id))).toBe(true);
  });
  test('validator catches broken data', () => {
    const bad = structuredClone(data);
    bad.recipes.push({ result: 'gamasot', materials: ['nope', 'ki'] });
    bad.recipes.find(r => r.result === 'jangdok')!.materials = ['sotlid', 'sotlid', 'ki', 'ki'];
    bad.recipes = bad.recipes.filter(r => r.result !== 'moru');
    const r = v(bad);
    expect(r.errors.some(e => e.includes('nope'))).toBe(true);
    expect(r.errors.some(e => e.includes('jangdok'))).toBe(true);
    expect(r.errors.some(e => e.includes('moru'))).toBe(true);
  });
});
