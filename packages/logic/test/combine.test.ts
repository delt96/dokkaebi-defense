import { describe, expect, test } from 'vitest';
import { createGame, step, loadGameData, recipesUsing } from '../src/index';
import { availableRecipes, missingMaterials } from '../src/combine';
import { forceRound, placeUnitForTest } from '../src/testing';

const data = loadGameData();

describe('combine', () => {
  test('available recipes', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 4); placeUnitForTest(s, 'bujigaengi', 2);
    expect(availableRecipes(s)).toEqual(['gamasot']);
    expect(missingMaterials(s, 'hwaro')).toEqual(['horong']);
  });
  test('2nd grade result goes to the lower slot', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 4); placeUnitForTest(s, 'bujigaengi', 2);
    step(s, [{ type: 'combine', result: 'gamasot' }]);
    expect(s.slots[2]!.defId).toBe('gamasot'); expect(s.slots[4]).toBeNull();
  });
  test('3rd grade goes to the highest-grade material slot and uses highest duplicate slot', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 3); placeUnitForTest(s, 'sotlid', 9);
    placeUnitForTest(s, 'ki', 1); placeUnitForTest(s, 'gamasot', 11);
    step(s, [{ type: 'combine', result: 'jangdok' }]);
    expect(s.slots[11]!.defId).toBe('jangdok');
    expect(s.slots[3]!.defId).toBe('sotlid'); expect(s.slots[9]).toBeNull(); expect(s.slots[1]).toBeNull();
  });
  test('rejections, including materials sold earlier in the same tick', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 0); placeUnitForTest(s, 'bujigaengi', 1);
    const r = step(s, [{ type: 'sell', slot: 0 }, { type: 'combine', result: 'gamasot' }, { type: 'combine', result: 'nope' }]);
    expect(r.rejected.map(x => x.reason)).toEqual(['missingMaterials', 'unknown']);
  });
  test('a chosen lower-grade material slot receives the result', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'ki', 1);
    placeUnitForTest(s, 'sotlid', 3);
    placeUnitForTest(s, 'gamasot', 11);

    const r = step(s, [{ type: 'combine', result: 'jangdok', slot: 3 }]);

    expect(r.rejected).toEqual([]);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'combine', defId: 'jangdok', slot: 3 }));
    expect(s.slots[3]?.defId).toBe('jangdok');
    expect(s.slots[11]).toBeNull();
    expect(s.slots[1]).toBeNull();
  });
  test('a chosen duplicate is consumed and other materials come from the highest slots', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 0);
    placeUnitForTest(s, 'bujigaengi', 1);
    placeUnitForTest(s, 'sotlid', 3);
    placeUnitForTest(s, 'sotlid', 4);
    placeUnitForTest(s, 'bujigaengi', 5);

    step(s, [{ type: 'combine', result: 'gamasot', slot: 3 }]);

    expect(s.slots.slice(0, 6).map(u => u?.defId ?? null)).toEqual([
      'sotlid', 'bujigaengi', null, 'gamasot', 'sotlid', null,
    ]);
  });
  test('invalid chosen slots and incomplete recipes leave the board unchanged', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 0);
    placeUnitForTest(s, 'bujigaengi', 1);
    placeUnitForTest(s, 'ki', 2);
    const before = s.slots.slice();

    const r = step(s, [
      { type: 'combine', result: 'gamasot', slot: 2 },
      { type: 'combine', result: 'gamasot', slot: 3 },
      { type: 'combine', result: 'jangdok', slot: 0 },
    ]);

    expect(r.rejected.map(x => x.reason)).toEqual(['missingMaterials', 'noUnit', 'missingMaterials']);
    expect(s.slots).toEqual(before);
  });
  test('recipesUsing reports matching recipes in order and counts the chosen copy once', () => {
    const s = createGame({
      ...data,
      recipes: [
        ...data.recipes,
        { result: 'hwaro', materials: ['sotlid', 'sotlid', 'horong'] },
      ],
    }, 1);
    placeUnitForTest(s, 'sotlid', 0);
    placeUnitForTest(s, 'bujigaengi', 1);

    expect(recipesUsing(s, 0)).toEqual([
      { result: 'gamasot', missing: [] },
      { result: 'jangdok', missing: ['gamasot', 'ki'] },
      { result: 'hwaro', missing: ['sotlid', 'horong'] },
    ]);
    expect(recipesUsing(s, 2)).toEqual([]);
  });
});

describe('exclusive recipes combine like any grade 6', () => {
  const d3 = loadGameData('stage3');
  const PAIRS = d3.recipes.filter(r => r.kind === 'tame');

  test('both materials and 묵 1 + 60냥 make one hidden grade 6, even on a full board', () => {
    expect(PAIRS.length).toBe(5);
    for (const r of PAIRS) {
      const s = createGame(d3, 1);
      forceRound(s, 20);
      s.open = s.open.map(() => true);
      const [a, b] = r.materials as [string, string];
      const ua = placeUnitForTest(s, a, 0);
      ua.cost = 0;
      placeUnitForTest(s, b, 1);
      for (let i = 2; i < s.slots.length; i++) placeUnitForTest(s, 'jipsin', i);
      s.buckwheat = 1; s.coins = 60;
      const r1 = step(s, [{ type: 'combine', result: r.result, slot: 0 }]);
      expect([r.result, r1.rejected]).toEqual([r.result, []]);
      expect([s.buckwheat, s.coins]).toEqual([0, 0]);
      expect(s.slots.filter(u => u?.defId === r.result)).toHaveLength(1);
      expect(s.slots.some(u => u?.defId === a || u?.defId === b)).toBe(false);
      const made = s.slots.find(u => u?.defId === r.result)!;
      expect(d3.units.find(u => u.id === made.defId)).toMatchObject({ grade: 6, hidden: true });
      // the duplicate submit finds no materials
      expect(step(s, [{ type: 'combine', result: r.result }]).rejected.map(x => x.reason)).toEqual(['missingMaterials']);
    }
  });

  test('exclusive recipes open at round 20: refused and left out of the available list before it', () => {
    expect(d3.economy!.tame!.combineFromRound).toBe(20);
    for (const r of PAIRS) {
      const s = createGame(d3, 1);
      forceRound(s, 19);
      r.materials.forEach((id, i) => placeUnitForTest(s, id, i));
      s.buckwheat = 1; s.coins = 60;
      expect(availableRecipes(s)).not.toContain(r.result);
      expect(step(s, [{ type: 'combine', result: r.result }]).rejected.map(x => x.reason)).toEqual(['tameLocked']);
      forceRound(s, 20);
      expect(availableRecipes(s)).toContain(r.result);
      expect(step(s, [{ type: 'combine', result: r.result }]).rejected).toEqual([]);
    }
  });

  test('a missing recruit, a missing partner or a short fee is refused', () => {
    const r = PAIRS[0]!;
    const [a, b] = r.materials as [string, string];
    for (const [have, bw, coins, reason] of [[[a], 1, 60, 'missingMaterials'], [[b], 1, 60, 'missingMaterials'], [[a, b], 1, 59, 'noCoins'], [[a, b], 0, 60, 'noBuckwheat']] as const) {
      const s = createGame(d3, 1);
      forceRound(s, 20);
      have.forEach((id, i) => placeUnitForTest(s, id, i));
      s.buckwheat = bw; s.coins = coins;
      expect(step(s, [{ type: 'combine', result: r.result }]).rejected.map(x => x.reason)).toEqual([reason]);
    }
  });
});
