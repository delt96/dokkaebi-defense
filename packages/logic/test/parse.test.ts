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

  test('parses the new economy commands and rejects bad args', () => {
    expect(parseClientCommand({ seq: 1, type: 'buy', args: { item: 'jar' } })!.cmd).toEqual({ type: 'buy', item: 'jar' });
    expect(parseClientCommand({ seq: 2, type: 'buy', args: { item: 'gold' } })!.cmd).toEqual({ type: 'invalid' });
    expect(parseClientCommand({ seq: 3, type: 'storyTarget', args: { id: null } })!.cmd).toEqual({ type: 'storyTarget', id: null });
    expect(parseClientCommand({ seq: 3, type: 'storyTarget', args: { id: 'cheonnyeonjing', unitIds: [4, 9] } })!.cmd)
      .toEqual({ type: 'storyTarget', id: 'cheonnyeonjing', unitIds: [4, 9] });
    expect(parseClientCommand({ seq: 4, type: 'transferOffer', args: { target: 2, slot: 3, unitId: 9 } })!.cmd)
      .toEqual({ type: 'transferOffer', target: 2, slot: 3, unitId: 9 });
    expect(parseClientCommand({ seq: 5, type: 'tame', args: { enemyId: 1.5 } })!.cmd).toEqual({ type: 'invalid' });
    expect(parseClientCommand({ seq: 6, type: 'tame', args: { enemyId: 12 } })!.cmd).toEqual({ type: 'tame', enemyId: 12 });
    expect(parseClientCommand({ seq: 7, type: 'storyDecline' })!.cmd).toEqual({ type: 'storyDecline' });
    expect(parseClientCommand({ seq: 8, type: 'missionEnter' })!.cmd).toEqual({ type: 'missionEnter' });
    expect(parseClientCommand({ seq: 9, type: 'transferAccept', args: { offerId: 1, slot: 4 } })!.cmd).toEqual({ type: 'transferAccept', offerId: 1, slot: 4 });
    expect(parseClientCommand({ seq: 10, type: 'transferDecline', args: { offerId: 1 } })!.cmd).toEqual({ type: 'transferDecline', offerId: 1 });
    const bad = [
      { type: 'transferAccept', args: { slot: 1 } }, { type: 'transferDecline' },
      { type: 'buy' }, { type: 'buy', args: { item: 'jar', n: 2 } },
      { type: 'storyTarget', args: {} }, { type: 'storyTarget', args: { id: '' } }, { type: 'storyTarget', args: { id: 'x'.repeat(33) } },
      { type: 'storyTarget', args: { id: 'a', unitIds: [1, 2, 3, 4] } }, { type: 'storyTarget', args: { id: 'a', unitIds: [1.5] } },
      { type: 'storyTarget', args: { id: 3 } }, { type: 'storyDecline', args: { x: 1 } }, { type: 'missionEnter', args: { x: 1 } },
      { type: 'tame', args: {} }, { type: 'transferOffer', args: { target: 7, slot: 0, unitId: 1 } },
      { type: 'transferOffer', args: { target: 2, slot: 24, unitId: 1 } }, { type: 'transferOffer', args: { target: 2, slot: 0 } },
      { type: 'transferAccept', args: { slot: -1 } }, { type: 'transferDecline', args: { slot: 1 } },
    ];
    for (const raw of bad) expect(parseClientCommand({ seq: 1, ...raw })).toEqual({ seq: 1, cmd: { type: 'invalid' } });
  });
  test('toWire round-trips every new command through parseClientCommand', () => {
    const cmds: Parameters<typeof toWire>[0][] = [
      { type: 'buy', item: 'bundle' }, { type: 'buy', item: 'jar' }, { type: 'storyTarget', id: null },
      { type: 'storyTarget', id: 'cheonnyeonjing', unitIds: [3] }, { type: 'storyDecline' }, { type: 'missionEnter' },
      { type: 'tame', enemyId: -3 }, { type: 'transferOffer', target: 4, slot: 2, unitId: 17 },
      { type: 'transferAccept', offerId: 1, slot: 0 }, { type: 'transferDecline', offerId: 1 },
    ];
    for (const cmd of cmds) expect(parseClientCommand({ seq: 1, ...toWire(cmd) })!.cmd).toEqual(cmd);
  });
});
