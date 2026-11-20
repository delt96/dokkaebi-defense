import { describe, expect, test } from 'vitest';
import { createGame, step, loadGameData, recipesUsing } from '../src/index';
import { availableRecipes, missingMaterials } from '../src/combine';
import { placeUnitForTest } from '../src/testing';

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
