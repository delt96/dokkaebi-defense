import { expect, test } from 'vitest';
import { applyCommand, createGame, jigeCandidates, loadGameData, nonQuestValue, type GameEvent } from '../src';
import { forceRound, makeData, placeUnitForTest } from '../src/testing';

test('every successful draw can grant another jige', () => {
  const data = makeData(d => { d.economy!.market!.jigeChance = 1; }, 'stage3');
  const s = createGame(data, 1);
  forceRound(s, 1);
  s.buckwheat = 2;
  for (const n of [1, 2]) {
    expect(applyCommand(s, { type: 'buy', item: 'draw' }, [])).toBeNull();
    expect(s.econ!.jige).toBe(n);
  }
});

test('board and stored exchanges preserve exact place and paid or zero cost', () => {
  const s = createGame(loadGameData('stage3'), 1);
  const board = placeUnitForTest(s, 'meok', 2);
  board.cost = 8;
  const stored = placeUnitForTest(s, 'jipsin', 1);
  stored.cost = 0;
  applyCommand(s, { type: 'store', slot: 1, unitId: stored.id }, []);
  const before = nonQuestValue(s);
  s.econ!.jige = 2;
  const events: GameEvent[] = [];
  for (const [zone, index, source] of [['board', 2, board], ['storage', 0, stored]] as const) {
    const choices = jigeCandidates(s.data, source.defId);
    expect(choices.some(u => u.id === source.defId)).toBe(true);
    const result = choices.find(u => u.id !== source.defId)!.id;
    const cmd = { type: 'jigeSwap', source: { zone, index, unitId: source.id }, result } as const;
    expect(applyCommand(s, cmd, events)).toBeNull();
    const replacement = (zone === 'board' ? s.slots : s.storage!)[index]!;
    expect(replacement).toMatchObject({ defId: result, cost: source.cost, attackCount: 0 });
    expect(replacement.id).not.toBe(source.id);
    expect(applyCommand(s, cmd, events)).toBe('staleUnit');
  }
  expect(events.map(e => e.type)).toEqual(['jigeSwap', 'jigeSwap']);
  expect([s.econ!.jige, nonQuestValue(s)]).toEqual([0, before]);
});
