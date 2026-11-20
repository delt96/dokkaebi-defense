import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, parseClientCommand, toWire } from '../src/index';
import { placeUnitForTest } from '../src/testing';

describe('parseClientCommand', () => {
  test('valid commands', () => {
    expect(parseClientCommand({ seq: 1, type: 'summon' })).toEqual({ seq: 1, cmd: { type: 'summon' } });
    expect(parseClientCommand({ seq: 2, type: 'move', args: { from: 0, to: 5, unitId: 3, toUnitId: null } })).toEqual({ seq: 2, cmd: { type: 'move', from: 0, to: 5, unitId: 3, toUnitId: null } });
    expect(parseClientCommand({ seq: 3, type: 'combine', args: { result: 'gamasot' } })).toEqual({ seq: 3, cmd: { type: 'combine', result: 'gamasot' } });
    expect(parseClientCommand({ seq: 4, type: 'support', args: { target: 2 } })).toEqual({ seq: 4, cmd: { type: 'support', target: 2 } });
  });
  test('unusable seq is dropped', () => {
    for (const raw of [null, 'x', 5, {}, { seq: 0, type: 'summon' }, { seq: 1.5, type: 'summon' }, { seq: -1, type: 'summon' }]) expect(parseClientCommand(raw)).toBeNull();
  });
  test('bad content becomes invalid', () => {
    const bad = [
      { seq: 1, type: '__proto__' }, { seq: 1, type: 'toString' }, { seq: 1, type: 'nope' },
      { seq: 1, type: 'move', args: { from: '3', to: 1, unitId: 1, toUnitId: null } },
      { seq: 1, type: 'move', args: { from: 0, to: 24, unitId: 1, toUnitId: null } },
      { seq: 1, type: 'sell', args: { slot: 0 } }, { seq: 1, type: 'summon', args: { extra: 1 } },
      { seq: 1, type: 'combine', args: { result: 'gamasot', slot: 2 } }, { seq: 1, type: 'support', args: { target: 7 } },
      { seq: 1, type: 'upgrade', args: { id: 'speed' } }, { seq: 1, type: 'summon', seat: 2 },
    ];
    for (const raw of bad) expect(parseClientCommand(raw)).toEqual({ seq: 1, cmd: { type: 'invalid' } });
  });
  test('toWire fills unit ids from the lane', () => {
    const s = createGame(loadGameData('stage2'), 1);
    const u = placeUnitForTest(s, 'sotlid', 0); const v = placeUnitForTest(s, 'ki', 5);
    expect(toWire({ type: 'move', from: 0, to: 5 }, s)).toEqual({ type: 'move', args: { from: 0, to: 5, unitId: u.id, toUnitId: v.id } });
    expect(toWire({ type: 'sell', slot: 5 }, s)).toEqual({ type: 'sell', args: { slot: 5, unitId: v.id } });
    expect(toWire({ type: 'summon' })).toEqual({ type: 'summon' });
  });
});
