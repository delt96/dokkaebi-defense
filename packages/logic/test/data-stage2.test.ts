import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, recipeDemand, step, validateData } from '../src/index';
import { placeUnitForTest } from '../src/testing';

const d2 = loadGameData('stage2');
const G2 = ['gamasot', 'meongseok', 'jeolgu', 'hwaro', 'cheongsachorong', 'hwaetbul', 'sseurebatgi', 'sut', 'dadeumitdol', 'mumyeong', 'hanji'];

describe('stage 2 data', () => {
  test('40 units 8/11/9/12, 21 physical, 32 recipes, prep 30; stage 1 untouched', () => {
    expect([1, 2, 3, 4].map(g => d2.units.filter(u => u.grade === g).length)).toEqual([8, 11, 9, 12]);
    expect(d2.units.filter(u => u.damageType === 'physical').length).toBe(21);
    expect(d2.recipes.length).toBe(32);
    expect(d2.balance.prepSeconds).toBe(30);
    const d1 = loadGameData();
    expect([d1.units.length, d1.recipes.length, d1.balance.prepSeconds, d1.coop]).toEqual([22, 14, 20, undefined]);
  });
  test('table order: grouped by grade, stage 1 first within a grade', () => {
    expect(d2.units.filter(u => u.grade === 2).map(u => u.id)).toEqual(G2);
    expect(d2.recipes.slice(0, 11).map(r => r.result)).toEqual(G2);
    expect(d2.units.filter(u => u.grade === 4).map(u => u.id).slice(0, 5)).toEqual(['yeonjabangga', 'moru', 'onggigama', 'daljip', 'golmu']);
  });
  test('demand table from spec section 9', () => {
    const g1 = ['bitjaru', 'jipsin', 'sotlid', 'dadeumi', 'horong', 'bujigaengi', 'buchae', 'ki'];
    expect(g1.map(id => recipeDemand(d2, id))).toEqual([3, 4, 5, 5, 7, 4, 5, 6]);
    expect(G2.map(id => recipeDemand(d2, id))).toEqual([5, 3, 5, 4, 2, 3, 1, 1, 1, 4, 4]);
    const g3 = ['didilbangga', 'jangdok', 'pulmu', 'jwibul', 'baneul', 'but', 'gireumbyeong', 'hamjibak', 'bagaji'];
    expect(g3.map(id => recipeDemand(d2, id))).toEqual([1, 1, 1, 1, 3, 1, 1, 2, 1]);
  });
  test('spot values', () => {
    expect(d2.units.find(u => u.id === 'chaeban')).toMatchObject({ grade: 4, damageType: 'magical', range: 2.5, interval: 1.3, factor: 0.85,
      skills: [{ trigger: { kind: 'nth', n: 3 }, effects: [{ kind: 'crit', mult: 1.85 }, { kind: 'slow', pct: 0.42, seconds: 3 }] }] });
    expect(d2.recipes.find(r => r.result === 'dadeumitdol')!.materials).toEqual(['dadeumi', 'dadeumi']);
    expect(d2.enemies.find(e => e.id === 'yeoksin2')).toMatchObject({ shared: true, boss: false, speed: 2 });
    expect(d2.coop).toMatchObject({ hpPerExtraPlayer: 0.1, staySeconds: 12, topDamageBonus: 10, danger: 48,
      yeoksin: [{ stage: 1, startRound: 6, deadlineRound: 9, baseHp: 8000, startIndex: 0 }, { stage: 2, startRound: 15, deadlineRound: 19, baseHp: 30000, startIndex: 1 }] });
  });
  test('validator: stage 2 has no errors and only the sotlid warning; stage 1 still 4 warnings', () => {
    const r = validateData(d2);
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBe(1); expect(r.warnings[0]).toContain('sotlid');
    expect(validateData(loadGameData()).warnings.length).toBe(4);
  });
  test('validator catches duplicate ids and demand above 7', () => {
    const bad = loadGameData('stage2');
    bad.units.push({ ...bad.units[0]! });
    for (let i = 0; i < 2; i++) bad.recipes.push({ result: 'gamasot', materials: ['horong', 'bujigaengi'] });
    const r = validateData(bad);
    expect(r.errors.some(e => e.includes('duplicate') && e.includes('bitjaru'))).toBe(true);
    expect(r.errors.some(e => e.includes('horong') && e.includes('9'))).toBe(true);
  });
  test('dadeumitdol needs two dadeumi; result goes to the chosen slot; pity is placed when the combine frees a cell', () => {
    const s = createGame(d2, 1);
    placeUnitForTest(s, 'dadeumi', 4);
    expect(step(s, [{ type: 'combine', result: 'dadeumitdol', slot: 4 }]).rejected[0]!.reason).toBe('missingMaterials');
    placeUnitForTest(s, 'dadeumi', 9);
    expect(step(s, [{ type: 'combine', result: 'dadeumitdol', slot: 9 }]).rejected).toEqual([]);
    expect(s.slots[9]!.defId).toBe('dadeumitdol'); expect(s.slots[4]).toBeNull();
    const t = createGame(d2, 1);
    placeUnitForTest(t, 'bitjaru', 0);
    for (let i = 1; i < 18; i++) placeUnitForTest(t, 'ki', i);
    t.pendingPity.push('jipsin');
    step(t, [{ type: 'combine', result: 'sseurebatgi', slot: 0 }]);
    expect(t.slots[0]!.defId).toBe('sseurebatgi');
    expect(t.pendingPity).toEqual([]); expect(t.slots[17]!.defId).toBe('jipsin');
  });
});
