import { describe, expect, test } from 'vitest';
import { birthOf, loadGameData } from '../src/index';

const d3 = loadGameData('stage3');

describe('birthOf', () => {
  test('a grade 6 combine is a birth', () => {
    expect(birthOf(d3, { type: 'combine', replacedUnitId: 1, unitId: 7, defId: 'bihyeongrang', slot: 0 }))
      .toEqual({ via: 'combine', defId: 'bihyeongrang', unitId: 7, grade: 6, hidden: false });
  });

  test('a grade 5 combine is not', () => {
    expect(birthOf(d3, { type: 'combine', replacedUnitId: 1, unitId: 7, defId: 'top', slot: 0 })).toBeNull();
  });

  test('a tamed grade 4 hidden is a birth', () => {
    expect(birthOf(d3, { type: 'tame', enemyId: 3, defId: 'bulgasari', unitId: 9, slot: 2 }))
      .toMatchObject({ via: 'tame', grade: 4, hidden: true });
  });

  test('the tame recipe result counts as a combine birth', () => {
    expect(birthOf(d3, { type: 'combine', replacedUnitId: 1, unitId: 4, defId: 'topnisoemeokbo', slot: 0 }))
      .toMatchObject({ via: 'combine', grade: 6, hidden: true });
  });

  test('gamble: grade 6 and hidden results are births, grade 5, misses and coin bets are not', () => {
    const base = { type: 'gambleUnit', table: 'big', buckwheatCost: 3, consolation: 40, jige: false } as const;
    expect(birthOf(d3, { ...base, result: 6, defId: 'bihyeongrang', unitId: 5 })).toMatchObject({ via: 'gamble', grade: 6 });
    expect(birthOf(d3, { ...base, result: 'hidden', defId: 'bulgasari', unitId: 5 })).toMatchObject({ via: 'gamble', hidden: true });
    expect(birthOf(d3, { ...base, result: 5, defId: 'top', unitId: 5 })).toBeNull();
    expect(birthOf(d3, { ...base, result: 0 })).toBeNull();
    expect(birthOf(d3, { type: 'gambleCoins', stake: 100, multiplier: 10, payout: 1000 })).toBeNull();
  });

  test('a jige swap is never a birth', () => {
    expect(birthOf(d3, { type: 'jigeSwap', source: { zone: 'board', index: 0, unitId: 1 }, unitId: 2, defId: 'bihyeongrang' })).toBeNull();
  });
});
