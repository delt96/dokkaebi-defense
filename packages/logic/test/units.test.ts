import { describe, expect, test } from 'vitest';
import { createGame, step, loadGameData } from '../src/index';
import { rollSummon, chooseSlot, pityPick } from '../src/units';
import { placeUnitForTest } from '../src/testing';
import { unitDef } from '../src/data';

const data = loadGameData();

describe('units', () => {
  test('summon spends a token and places a unit', () => {
    const s = createGame(data, 5);
    const r = step(s, [{ type: 'summon' }]);
    expect(r.rejected).toEqual([]); expect(s.tokens).toBe(3);
    expect(s.slots.filter(Boolean).length).toBe(1);
    expect(r.events.some(e => e.type === 'summon')).toBe(true);
  });
  test('odds over 10000 rolls', () => {
    const s = createGame(data, 9); const g = [0, 0, 0];
    for (let i = 0; i < 10000; i++) g[unitDef(data, rollSummon(s)).grade - 1]!++;
    expect(g[0]! / 10000).toBeCloseTo(0.70, 1); expect(g[1]! / 10000).toBeCloseTo(0.25, 1); expect(g[2]! / 10000).toBeCloseTo(0.05, 1);
  });
  test('placement: melee to edge, ranged to inner', () => {
    const s = createGame(data, 1);
    expect(chooseSlot(s, unitDef(data, 'sotlid'))).toBe(0);
    expect(chooseSlot(s, unitDef(data, 'horong'))).toBe(7);
    for (const i of [7, 8, 9, 10, 13, 14, 15, 16]) placeUnitForTest(s, 'horong', i);
    expect(chooseSlot(s, unitDef(data, 'horong'))).toBe(0);
  });
  test('pity picks least summoned with list order on ties', () => {
    const s = createGame(data, 1);
    s.summonCounts = { bitjaru: 2, jipsin: 1, sotlid: 1, dadeumi: 2, horong: 2, bujigaengi: 2, buchae: 2, ki: 2 };
    expect(pityPick(s)).toBe('jipsin');
  });
  test('every 7th grade-1 summon gives an extra unit', () => {
    const s = createGame(data, 3); s.tokens = 100;
    let summons = 0;
    while (s.grade1Summons < 7) { step(s, [{ type: 'summon' }]); summons++; }
    expect(s.slots.filter(Boolean).length + s.pendingPity.length).toBe(summons + 1);
  });
  test('full board: summon rejected, pity queued then placed after a sale', () => {
    const s = createGame(data, 1);
    for (let i = 0; i < 18; i++) placeUnitForTest(s, 'sotlid', i);
    s.tokens = 2;
    expect(step(s, [{ type: 'summon' }]).rejected[0]!.reason).toBe('noSlot'); expect(s.tokens).toBe(2);
    s.pendingPity.push('jipsin');
    step(s, [{ type: 'sell', slot: 3 }]);
    expect(s.pendingPity).toEqual([]); expect(s.slots[3]!.defId).toBe('jipsin');
  });
  test('move and swap, rejections', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 0); placeUnitForTest(s, 'horong', 7);
    step(s, [{ type: 'move', from: 0, to: 1 }]); expect(s.slots[1]!.defId).toBe('sotlid'); expect(s.slots[0]).toBeNull();
    step(s, [{ type: 'move', from: 1, to: 7 }]); expect(s.slots[7]!.defId).toBe('sotlid'); expect(s.slots[1]!.defId).toBe('horong');
    const r = step(s, [{ type: 'move', from: 7, to: 20 }, { type: 'move', from: 0, to: 2 }, { type: 'move', from: 99, to: 2 }]);
    expect(r.rejected.map(x => x.reason)).toEqual(['closedSlot', 'noUnit', 'noUnit']);
  });
  test('sell, convert, double sell', () => {
    const s = createGame(data, 1); placeUnitForTest(s, 'gamasot', 0);
    const r = step(s, [{ type: 'sell', slot: 0 }, { type: 'sell', slot: 0 }, { type: 'convertToken' }]);
    expect(s.coins).toBe(10 + 25); expect(s.tokens).toBe(3);
    expect(r.rejected.map(x => x.reason)).toEqual(['noUnit']);
    s.tokens = 0; expect(step(s, [{ type: 'convertToken' }]).rejected[0]!.reason).toBe('noToken');
  });
});
