import { describe, expect, test } from 'vitest';
import { availableRecipes, createGame, damageBonus, loadGameData, speedBonus, step } from '../src/index';
import { auraAttackPower } from '../src/effects';
import { placeUnitForTest } from '../src/testing';

const d3 = loadGameData('stage3');
const ids = (s: ReturnType<typeof createGame>) => s.slots.filter(Boolean).map(u => u!.defId);

describe('stage 3 board rules', () => {
  test('grade 5 combine needs one buckwheat; rejection consumes nothing', () => {
    const s = createGame(d3, 1); placeUnitForTest(s, 'meok', 7); placeUnitForTest(s, 'jige', 0);
    expect(availableRecipes(s)).not.toContain('top');
    const r = step(s, [{ type: 'combine', result: 'top' }]);
    expect(r.rejected[0]!.reason).toBe('noBuckwheat');
    expect(ids(s).sort()).toEqual(['jige', 'meok']);
    s.buckwheat = 1;
    expect(availableRecipes(s)).toContain('top');
    step(s, [{ type: 'combine', result: 'top' }]);
    expect([s.buckwheat, ids(s)]).toEqual([0, ['top']]);
  });

  test('grade 6 combine needs 60 coins too', () => {
    const s = createGame(d3, 1);
    for (const [id, i] of [['top', 0], ['kkeul', 1], ['ja', 7]] as const) placeUnitForTest(s, id, i);
    s.buckwheat = 1; s.coins = 59;
    expect(step(s, [{ type: 'combine', result: 'bihyeongrang' }]).rejected[0]!.reason).toBe('noCoins');
    expect([s.buckwheat, s.coins, ids(s).length]).toEqual([1, 59, 3]);
    s.coins = 60; step(s, [{ type: 'combine', result: 'bihyeongrang' }]);
    expect([s.coins, s.buckwheat, ids(s)]).toEqual([0, 0, ['bihyeongrang']]);
  });

  test('upgrade inheritance reads the highest line in the lineage', () => {
    for (const [data, want] of [[d3, 0.7], [loadGameData('stage2'), 0.2]] as const) {
      const s = createGame(data, 1); s.upgrades.physical = 2; s.upgrades.magical = 7;
      placeUnitForTest(s, 'jangdok', 7); // physical; lineage magical+physical in stage 3; polish level 0
      expect(damageBonus(s, 7)).toBeCloseTo(want);
    }
  });

  test('aura caps: attack speed 0.5, attack power 0.4', () => {
    const s = createGame(d3, 1);
    placeUnitForTest(s, 'top', 9); // physical, so the physical-only auras of mulle and byeongpung count too
    for (const [id, i] of [['cheongsachorong', 0], ['daljip', 1], ['mulle', 2], ['cheonnyeonbyeongpung', 8]] as const) placeUnitForTest(s, id, i);
    expect(speedBonus(s, 9)).toBe(0.5); // 0.1 + 0.2 + 0.12 + 0.12 = 0.54 uncapped
    const t = createGame(d3, 1); placeUnitForTest(t, 'meok', 9);
    for (const [id, i] of [['pulmu', 0], ['gat', 1], ['cheonnyeonjokja', 8], ['bihyeongrang', 10]] as const) placeUnitForTest(t, id, i);
    expect(auraAttackPower(t, 9)).toBe(0.4); // 0.15 + 0.13 + 0.12 + 0.1 = 0.5 uncapped
  });

  test('periodic skills start ready in stage 3 only', () => {
    const s3 = createGame(d3, 1); expect(placeUnitForTest(s3, 'yeonjabangga', 7).periodic).toEqual([0]);
    const s1 = createGame(loadGameData(), 1); expect(placeUnitForTest(s1, 'yeonjabangga', 7).periodic).toEqual([40]);
  });

  test('sell price of grade 6 comes from stage 3 balance', () => {
    const s = createGame(d3, 1); placeUnitForTest(s, 'gildal', 0); step(s, [{ type: 'sell', slot: 0 }]); expect(s.coins).toBe(180);
  });
});
