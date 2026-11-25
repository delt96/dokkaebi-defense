import { describe, expect, test } from 'vitest';
import { availableRecipes, combinePlan, createGame, loadGameData, step, type GameState } from '../src/index';
import { placeUnitForTest } from '../src/testing';

const data = loadGameData();
const data3 = loadGameData('stage3');

const MOCKUP_BOARD = [
  'jipsin', 'bitjaru', 'horong', 'jangdok', 'jipsin', 'buchae', 'jeolgu', 'dadeumi',
  'mumyeong', 'hwaro', 'ki', 'gamasot', 'moru', 'top', 'gimseobang', 'hanji',
];

function jangdokBoard(): GameState {
  const s = createGame(data, 1);
  placeUnitForTest(s, 'sotlid', 3); placeUnitForTest(s, 'sotlid', 9);
  placeUnitForTest(s, 'ki', 1); placeUnitForTest(s, 'gamasot', 11);
  return s;
}

function mockupBoard(): GameState {
  const s = createGame(data3, 1);
  MOCKUP_BOARD.forEach((defId, i) => placeUnitForTest(s, defId, i));
  return s;
}

describe('combinePlan', () => {
  test('names the board slots the command empties', () => {
    const s = jangdokBoard();
    const plan = combinePlan(s, 'jangdok')!;
    expect(plan.resultSlot).toBe(11);
    expect([...plan.board].sort((a, b) => a - b)).toEqual([1, 9, 11]);
    expect(plan.stored).toEqual([]);

    step(s, [{ type: 'combine', result: 'jangdok' }]);
    expect(s.slots[1]).toBeNull();
    expect(s.slots[9]).toBeNull();
    expect(s.slots[3]!.defId).toBe('sotlid');
    expect(s.slots[11]!.defId).toBe('jangdok');
  });

  test('a given slot is the result slot', () => {
    const plan = combinePlan(jangdokBoard(), 'jangdok', 3)!;
    expect(plan.resultSlot).toBe(3);
    expect(plan.board).toEqual(expect.arrayContaining([3, 1, 11]));
    expect(plan.board).not.toContain(9);
  });

  test('storage materials come after the board', () => {
    const s = createGame(data3, 1);
    placeUnitForTest(s, 'sotlid', 4);
    placeUnitForTest(s, 'bujigaengi', 2);
    expect(step(s, [{ type: 'store', slot: 2 }]).rejected).toEqual([]);
    expect(combinePlan(s, 'gamasot')).toEqual({ resultSlot: 4, board: [4], stored: [0] });
  });

  test('null when a material is missing or the slot is not a material', () => {
    const s = jangdokBoard();
    expect(combinePlan(s, 'hwaro')).toBeNull();
    expect(combinePlan(s, 'jangdok', 0)).toBeNull();
    expect(combinePlan(s, 'jangdok', 1)).not.toBeNull();
    expect(combinePlan(s, 'gamasot', 1)).toBeNull();
    expect(combinePlan(s, 'nope')).toBeNull();
  });

  test('agrees with the command on every recipe of the mockup board', () => {
    const results = availableRecipes(mockupBoard());
    expect(results.length).toBe(11);
    for (const result of results) {
      const s = mockupBoard();
      const plan = combinePlan(s, result)!;
      expect(plan, result).not.toBeNull();
      const storedBefore = s.storage?.length ?? 0;
      const before = s.slots.map(u => u?.id ?? null);

      expect(step(s, [{ type: 'combine', result }]).rejected, result).toEqual([]);

      const emptied = before.flatMap((id, i) => (id !== null && s.slots[i] === null ? [i] : []));
      const expected = plan.board.filter(i => i !== plan.resultSlot).sort((a, b) => a - b);
      expect(emptied, result).toEqual(expected);
      expect(plan.resultSlot, result).not.toBeNull();
      expect(s.slots[plan.resultSlot!]!.defId, result).toBe(result);
      expect(storedBefore - (s.storage?.length ?? 0), result).toBe(plan.stored.length);
    }
  });
});
