import { describe, expect, test } from 'vitest';
import { applyCommand, createGame, loadGameData, type GameState } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { boardMarks, nextCombines, nextPick, rowCells, type NextList } from '../src/ui/models';
import { MOCK_TARGET, mockBoardState } from './fixtures/next-board';

const d3 = loadGameData('stage3');
const row = (list: NextList, id: string) => list.rows.find(r => r.result === id)!;
const chip = (list: NextList, result: string, material: string) => row(list, result).materials.find(m => m.id === material)!;

function stored(s: GameState, slot: number) {
  expect(applyCommand(s, { type: 'store', slot, unitId: s.slots[slot]!.id }, [])).toBeNull();
}

describe('share and make marks', () => {
  test('share marks only the copies an upper row takes', () => {
    const list = nextCombines(mockBoardState(), { target: MOCK_TARGET });
    expect(chip(list, 'jeolgu', 'dadeumi')).toMatchObject({ mark: 'share', takenBy: ['didilbangga'] });
    expect(chip(list, 'jeolgu', 'ki').mark).toBeUndefined();
    expect(chip(list, 'pulmu', 'ki')).toMatchObject({ mark: 'share', takenBy: ['jeolgu'] });
    for (const id of ['didilbangga', 'meongseok']) expect(row(list, id).materials.some(m => m.mark === 'share')).toBe(false);
  });

  test('in the 짚신 scope 바늘 and 둥구미 lose 짚신 to the rows above', () => {
    const list = nextCombines(mockBoardState(), { target: MOCK_TARGET, slot: 0 });
    expect(chip(list, 'baneul', 'jipsin')).toMatchObject({ mark: 'share', takenBy: ['didilbangga', 'meongseok'] });
    expect(row(list, 'dunggumi').materials.map(m => m.mark)).toEqual(['share', 'share']);
  });

  test('make marks a missing material a ready recipe yields', () => {
    const list = nextCombines(mockBoardState(), { target: MOCK_TARGET });
    expect(chip(list, 'saekkijul', 'dunggumi')).toMatchObject({ mark: 'make', have: false });
    expect(chip(list, 'moru', 'pulmu')).toMatchObject({ mark: 'make', have: false });
    const torch = chip(list, 'hwaetbul', 'bujigaengi');
    expect(torch.mark).toBeUndefined();
    expect(torch.have).toBe(false);
    for (const r of list.rows.filter(r => r.missing.length)) expect(r.materials.some(m => m.mark === 'share')).toBe(false);
  });
});

describe('boardMarks', () => {
  test('nothing selected: triangles on the result slots of the top three', () => {
    const s = mockBoardState();
    expect(boardMarks(s, nextCombines(s, { target: MOCK_TARGET }), null)).toEqual({ triangles: [6, 0, 7], pairs: [], stored: [], focus: null });
  });

  test('짚신 selected: partner cells carry the first key that needs them', () => {
    const s = mockBoardState();
    const marks = boardMarks(s, nextCombines(s, { target: MOCK_TARGET, slot: 0 }), 0);
    expect(marks.triangles).toEqual([]);
    expect([...marks.pairs].sort((a, b) => a.slot - b.slot)).toEqual([
      { slot: 1, key: 'X' }, { slot: 2, key: 'C' }, { slot: 6, key: 'Z' }, { slot: 7, key: 'Z' }, { slot: 8, key: 'C' },
    ]);
    expect(marks.stored).toEqual([]);
    expect(marks.focus).toBeNull();
  });

  test('a stored material marks its stack', () => {
    const s = createGame(d3, 1);
    placeUnitForTest(s, 'jipsin', 0);
    placeUnitForTest(s, 'bitjaru', 1);
    stored(s, 1);
    const marks = boardMarks(s, nextCombines(s, { slot: 0 }), 0);
    expect(marks.stored).toEqual([{ defId: 'bitjaru', key: 'Z' }]);
    expect(marks.pairs).toEqual([]);
  });
});

describe('nextPick', () => {
  test('W walks the ready rows and wraps', () => {
    const s = mockBoardState();
    const list = nextCombines(s, { target: MOCK_TARGET });
    expect(nextPick(s, list, null)).toEqual({ result: 'didilbangga', slot: 6 });
    expect(nextPick(s, list, 'didilbangga')).toEqual({ result: 'meongseok', slot: 0 });
    expect(nextPick(s, list, 'meongseok')).toEqual({ result: 'jeolgu', slot: 7 });
    expect(nextPick(s, list, 'dunggumi')?.result).toBe('didilbangga');
    expect(nextPick(s, list, 'nothing')?.result).toBe('didilbangga');
  });

  test('storage-only recipes are skipped by W and ▲', () => {
    const s = createGame(d3, 1);
    placeUnitForTest(s, 'hanji', 0);
    placeUnitForTest(s, 'sotlid', 1);
    placeUnitForTest(s, 'bujigaengi', 2);
    stored(s, 1);
    stored(s, 2);
    const list = nextCombines(s);
    expect(list.rows.find(r => r.result === 'gamasot' && !r.missing.length && !r.short)).toBeDefined();
    expect(nextPick(s, list, null)).toBeNull();
    expect(boardMarks(s, list, null).triangles).toEqual([]);
  });

  test('rowCells is the plan without the selected slot', () => {
    const s = mockBoardState();
    expect([...rowCells(s, 'meongseok', null)].sort()).toEqual([0, 1]);
    expect(rowCells(s, 'meongseok', 0)).toEqual([1]);
    expect(rowCells(s, 'mumyeong', 0)).toEqual([]);
  });
});
