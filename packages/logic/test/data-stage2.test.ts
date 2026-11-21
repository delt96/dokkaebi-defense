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
      yeoksin: [{ stage: 1, startRound: 6, deadlineRound: 9, baseHp: 10700, startIndex: 0 }, { stage: 2, startRound: 15, deadlineRound: 19, baseHp: 33000, startIndex: 1 }] });
  });
  test('plan Task 3 table: every added unit and recipe', () => {
    const T: [string, number, string, number, number, number, Array<{ kind: string; p?: number; n?: number }>, string[]][] = [
      ['sseurebatgi', 2, 'physical', 2.0, 0.9, 0.94, [{ kind: 'chance', p: 0.25 }], ['bitjaru', 'ki']],
      ['sut', 2, 'magical', 2.5, 1.25, 0.93, [{ kind: 'chance', p: 0.3 }], ['bujigaengi', 'buchae']],
      ['dadeumitdol', 2, 'physical', 2.0, 1.25, 1.02, [{ kind: 'nth', n: 3 }], ['dadeumi', 'dadeumi']],
      ['mumyeong', 2, 'magical', 3.0, 1.15, 0.82, [{ kind: 'nth', n: 4 }], ['dadeumi', 'horong']],
      ['hanji', 2, 'physical', 2.0, 0.7, 0.93, [{ kind: 'chance', p: 0.25 }], ['buchae', 'dadeumi']],
      ['baneul', 3, 'magical', 3.0, 1.1, 0.85, [{ kind: 'nth', n: 5 }], ['mumyeong', 'jipsin', 'horong']],
      ['but', 3, 'magical', 3.0, 1.2, 0.78, [{ kind: 'nth', n: 4 }], ['hanji', 'buchae', 'horong']],
      ['gireumbyeong', 3, 'physical', 1.5, 0.85, 0.97, [{ kind: 'chance', p: 0.3 }], ['gamasot', 'horong', 'sotlid']],
      ['hamjibak', 3, 'physical', 1.5, 1.25, 1.05, [{ kind: 'nth', n: 4 }], ['jeolgu', 'sotlid', 'ki']],
      ['bagaji', 3, 'physical', 2.0, 1.0, 0.92, [{ kind: 'nth', n: 4 }], ['meongseok', 'sotlid', 'ki']],
      ['golmu', 4, 'physical', 2.0, 1.25, 0.96, [{ kind: 'nth', n: 3 }], ['baneul', 'mumyeong', 'dadeumitdol']],
      ['tteongme', 4, 'physical', 1.5, 1.35, 1.1, [{ kind: 'nth', n: 3 }], ['hamjibak', 'gamasot', 'jeolgu']],
      ['gawi', 4, 'physical', 2.0, 1.15, 1.02, [{ kind: 'chance', p: 0.25 }], ['baneul', 'mumyeong', 'hwaro']],
      ['sokuri', 4, 'physical', 2.0, 0.85, 0.94, [{ kind: 'chance', p: 0.25 }], ['hamjibak', 'jeolgu', 'meongseok']],
      ['byeoru', 4, 'magical', 2.5, 1.15, 0.88, [{ kind: 'always' }, { kind: 'nth', n: 4 }], ['but', 'hanji', 'sut']],
      ['ja', 4, 'magical', 3.0, 1.2, 0.81, [{ kind: 'nth', n: 4 }], ['baneul', 'hanji', 'mumyeong']],
      ['chaeban', 4, 'magical', 2.5, 1.3, 0.85, [{ kind: 'nth', n: 3 }], ['bagaji', 'gamasot', 'sseurebatgi']],
      ['jumadeung', 4, 'magical', 3.0, 0.95, 0.82, [{ kind: 'nth', n: 4 }], ['gireumbyeong', 'cheongsachorong', 'hanji']],
    ];
    const ids = new Set(T.map(r => r[0]));
    const units = d2.units.filter(u => ids.has(u.id)).map(u => [u.id, u.grade, u.damageType, u.range, u.interval, u.factor, u.skills.map(s => s.trigger)]);
    const recipes = d2.recipes.filter(r => ids.has(r.result)).map(r => [r.result, r.materials]);
    expect(units).toEqual(T.map(r => r.slice(0, 7)));
    expect(recipes).toEqual(T.map(r => [r[0], r[7]]));
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
