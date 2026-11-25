import { describe, expect, test } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { combineOptions, helperModel, nextCombines, type NextList } from '../src/ui/models';
import { MOCK_TARGET, mockBoardState } from './fixtures/next-board';

const d3 = loadGameData('stage3');
const group = (list: NextList, g: string) => list.rows.filter(r => r.group === g).map(r => r.result);

describe('nextCombines', () => {
  test('all scope on the mockup board with 연자방아: target, ready, then one', () => {
    const list = nextCombines(mockBoardState(), { target: MOCK_TARGET });
    expect(list.scope).toBe('all');
    expect(group(list, 'target')).toEqual(['didilbangga', 'meongseok', 'jeolgu']);
    expect(group(list, 'ready')).toEqual(['pulmu', 'baneul', 'but', 'cheongsachorong', 'sseurebatgi', 'mumyeong', 'hanji', 'dunggumi']);
    expect(group(list, 'one').slice(0, 6)).toEqual(['moru', 'gawi', 'ja', 'samtaegi', 'saekkijul', 'jipsingol']);
    expect(list.far).toEqual([]);
    expect(list.counts).toEqual({ unit: null, all: 11 });
    expect(list.target).toEqual({ id: 'yeonjabangga', name: '연자방아' });
    expect(list.rows.every(r => r.key === null)).toBe(true);
  });

  test('unit scope for 짚신 keys the ready rows in list order', () => {
    const list = nextCombines(mockBoardState(), { target: MOCK_TARGET, slot: 0 });
    expect(list.scope).toBe('unit');
    expect(list.rows.map(r => [r.result, r.key, r.group])).toEqual([
      ['didilbangga', 'Z', 'target'],
      ['meongseok', 'X', 'target'],
      ['baneul', 'C', 'ready'],
      ['dunggumi', null, 'ready'],
      ['saekkijul', null, 'one'],
      ['jipsingol', null, 'one'],
      ['hwaetbul', null, 'one'],
    ]);
    expect(list.rows.every(r => r.uses)).toBe(true);
    expect(list.counts).toEqual({ unit: 4, all: 11 });
    expect(list.far).toEqual([]);
  });

  test("all scope with the unit selected keeps the unit's keys", () => {
    const list = nextCombines(mockBoardState(), { target: MOCK_TARGET, slot: 0, scope: 'all' });
    expect(list.scope).toBe('all');
    const key = (id: string) => list.rows.find(r => r.result === id)?.key;
    expect([key('didilbangga'), key('meongseok'), key('baneul'), key('pulmu')]).toEqual(['Z', 'X', 'C', null]);
    expect(list.rows.find(r => r.result === 'pulmu')?.uses).toBe(false);
    expect(list.counts).toEqual({ unit: 4, all: 11 });
  });

  test('without a target the ready group leads with the highest grade', () => {
    const list = nextCombines(mockBoardState());
    expect(list.rows.slice(0, 4).map(r => r.result)).toEqual(['didilbangga', 'pulmu', 'baneul', 'but']);
    expect(group(list, 'target')).toEqual([]);
    expect(list.target).toBeNull();
  });

  test('cost-short rows close the ready group and get no key', () => {
    const s = createGame(d3, 1);
    for (const [id, i] of [['meok', 0], ['jige', 1], ['sotlid', 2], ['bujigaengi', 3]] as const) placeUnitForTest(s, id, i);
    s.buckwheat = 0;
    const list = nextCombines(s);
    expect(group(list, 'ready')).toEqual(['gamasot', 'top']);
    expect(list.rows.find(r => r.result === 'top')?.short).toBe('메밀묵 1개 모자람');
    expect(nextCombines(s, { slot: 0 }).rows.find(r => r.result === 'top')?.key).toBeNull();
  });

  test('unit scope folds two-or-more missing into far', () => {
    const s = createGame(d3, 1);
    placeUnitForTest(s, 'jipsin', 0);
    const list = nextCombines(s, { slot: 0 });
    expect(list.far.map(r => r.result)).toEqual(['didilbangga', 'baneul', 'saekkijul', 'jipsingol']);
    expect(list.far.every(r => r.group === 'far')).toBe(true);
    expect(list.counts.unit).toBe(0);
  });

  test('a tame recipe whose recruit is not evolved is short, not keyed', () => {
    const s = createGame(d3, 1);
    placeUnitForTest(s, 'jinegaksi', 0);
    placeUnitForTest(s, 'banjitgori', 1);
    s.buckwheat = 1; s.coins = 60;
    const ready = nextCombines(s, { slot: 0 }).rows.filter(r => r.group === 'ready');
    expect(ready.at(-1)).toMatchObject({ result: 'baekbalbaneulgaksi', short: '진화 필요', key: null });
    s.slots[0]!.item = 'evolveCharm';
    expect(nextCombines(s, { slot: 0 }).rows.find(r => r.result === 'baekbalbaneulgaksi')).toMatchObject({ key: 'Z' });
  });

  test('combineOptions and helperModel read the same list', () => {
    const s = mockBoardState();
    const unit = nextCombines(s, { target: MOCK_TARGET, slot: 0 });
    expect(combineOptions(s, 0, MOCK_TARGET).map(o => [o.result, o.key]))
      .toEqual([...unit.rows, ...unit.far].map(r => [r.result, r.key]));
    const all = nextCombines(s, { target: MOCK_TARGET });
    expect(helperModel(s, MOCK_TARGET).map(i => i.recipe))
      .toEqual(all.rows.filter(r => (r.group === 'target' || r.group === 'ready') && !r.missing.length).map(r => r.result));
  });
});
