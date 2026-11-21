import { describe, expect, test } from 'vitest';
import {
  availableRecipes, buildFull, createGame, createMatch, loadGameData, MatchStreamer, missingMaterials, nonQuestValue,
  parseClientCommand, recipesUsing, speedBonus, stateHash, step, stepMatch, storedMaterials, toWire, type Command, type GameState,
} from '../src/index';
import { placeUnitForTest, spawnEnemyForTest, forceRound } from '../src/testing';

const data = loadGameData();
const data2 = loadGameData('stage2');
const data3 = loadGameData('stage3');

const reasons = (s: GameState, cmds: Command[]) => step(s, cmds).rejected.map(r => r.reason);
const storedIds = (s: GameState) => (s.storage ?? []).map(u => u.defId);

function fill(s: GameState, defId: string): void {
  s.slots.forEach((u, i) => { if (!u && s.open[i]) placeUnitForTest(s, defId, i); });
}

describe('storage commands', () => {
  test('store moves the same unit object off the board', () => {
    const s = createGame(data, 1);
    const u = placeUnitForTest(s, 'sotlid', 3);
    expect(s.storage).toBeUndefined();
    expect(reasons(s, [{ type: 'store', slot: 3 }])).toEqual([]);
    expect(s.slots[3]).toBeNull();
    expect(s.storage).toEqual([u]);
    expect(s.storage![0]).toBe(u);
  });

  test('only grade 1 and 2 units can be stored', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'gamasot', 0);
    placeUnitForTest(s, 'jangdok', 1);
    expect(reasons(s, [{ type: 'store', slot: 1 }, { type: 'store', slot: 5 }, { type: 'store', slot: 99 }])).toEqual(['notStorable', 'noUnit', 'noUnit']);
    expect(reasons(s, [{ type: 'store', slot: 0 }])).toEqual([]);
    expect(storedIds(s)).toEqual(['gamasot']);
    expect(s.slots[1]!.defId).toBe('jangdok');
  });

  test('storeAll takes every unlocked grade 1-2 unit in slot order and nothing else', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'ki', 7);
    placeUnitForTest(s, 'jangdok', 2);
    placeUnitForTest(s, 'gamasot', 0);
    placeUnitForTest(s, 'sotlid', 4).locked = true;
    expect(reasons(s, [{ type: 'storeAll' }])).toEqual([]);
    expect(storedIds(s)).toEqual(['gamasot', 'ki']);
    expect(s.slots[2]!.defId).toBe('jangdok');
    expect(s.slots[4]!.defId).toBe('sotlid');
    expect(reasons(s, [{ type: 'storeAll' }, { type: 'store', slot: 4 }])).toEqual(['nothingToStore', 'locked']);
  });

  test('retrieve places the newest stored unit: best free slot when clicked, the given slot when dragged', () => {
    const s = createGame(data, 1);
    const a = placeUnitForTest(s, 'sotlid', 0);
    const b = placeUnitForTest(s, 'sotlid', 1);
    placeUnitForTest(s, 'horong', 2);
    step(s, [{ type: 'storeAll' }]);
    expect(storedIds(s)).toEqual(['sotlid', 'sotlid', 'horong']);
    // sotlid is melee: chooseSlot puts it on an edge cell, horong (range 3) inside
    expect(reasons(s, [{ type: 'retrieve', defId: 'sotlid' }, { type: 'retrieve', defId: 'horong' }])).toEqual([]);
    expect(s.slots[0]).toBe(b);
    expect(s.slots[7]!.defId).toBe('horong');
    expect(reasons(s, [{ type: 'retrieve', defId: 'sotlid', slot: 9 }])).toEqual([]);
    expect(s.slots[9]).toBe(a);
    expect(s.storage).toEqual([]);
  });

  test('retrieve rejections', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'ki', 0);
    placeUnitForTest(s, 'ki', 1);
    step(s, [{ type: 'store', slot: 1 }]);
    const closed = s.open.indexOf(false);
    expect(reasons(s, [
      { type: 'retrieve', defId: 'sotlid' }, { type: 'retrieve', defId: 'ki', slot: 0 },
      { type: 'retrieve', defId: 'ki', slot: closed }, { type: 'retrieve', defId: 'ki', slot: -1 },
    ])).toEqual(['notStored', 'slotTaken', 'closedSlot', 'closedSlot']);
    fill(s, 'jangdok');
    expect(reasons(s, [{ type: 'retrieve', defId: 'ki' }])).toEqual(['noSlot']);
    expect(storedIds(s)).toEqual(['ki']);
  });

  test('selling from storage pays the grade price and takes the newest unit', () => {
    const s = createGame(data3, 1);
    placeUnitForTest(s, 'gamasot', 0);
    placeUnitForTest(s, 'ki', 1);
    step(s, [{ type: 'storeAll' }]);
    const coins = s.coins;
    expect(reasons(s, [{ type: 'sellStored', defId: 'gamasot' }, { type: 'sellStored', defId: 'gamasot' }])).toEqual(['notStored']);
    expect(s.coins).toBe(coins + data3.balance.sellPrice[1]!);
    expect(storedIds(s)).toEqual(['ki']);
  });

  test('stored units do not attack and do not give auras', () => {
    const s = createGame(data, 1);
    forceRound(s, 1);
    placeUnitForTest(s, 'cheongsachorong', 7);
    placeUnitForTest(s, 'ki', 8);
    const buffed = speedBonus(s, 8);
    expect(buffed).toBeGreaterThan(0);
    step(s, [{ type: 'storeAll' }]);
    expect(speedBonus(s, 8)).toBe(0);
    const stored = s.storage!.map(u => u.id);
    s.enemies = [];
    spawnEnemyForTest(s, 'geuseundae', 1);
    let attacks = 0;
    for (let i = 0; i < 60; i++) for (const e of step(s, []).events) if (e.type === 'attack' && stored.includes(e.unitId)) attacks++;
    expect(attacks).toBe(0);
  });
});

describe('combining with stored materials', () => {
  test('availability, missing materials and the helper count see storage', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 4);
    placeUnitForTest(s, 'bujigaengi', 2);
    step(s, [{ type: 'store', slot: 2 }]);
    expect(availableRecipes(s)).toEqual(['gamasot']);
    expect(missingMaterials(s, 'gamasot')).toEqual([]);
    expect(recipesUsing(s, 4).find(r => r.result === 'gamasot')!.missing).toEqual([]);
    expect(storedMaterials(s, 'gamasot')).toBe(1);
    expect(storedMaterials(s, 'hwaro')).toBe(1);
  });

  test('all materials from storage: the result goes to the best free slot', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 0);
    placeUnitForTest(s, 'bujigaengi', 1);
    step(s, [{ type: 'storeAll' }]);
    const r = step(s, [{ type: 'combine', result: 'gamasot' }]);
    expect(r.rejected).toEqual([]);
    // gamasot is melee (range 1.5): the first free edge cell
    expect(s.slots[0]!.defId).toBe('gamasot');
    expect(r.events.find(e => e.type === 'combine')).toMatchObject({ replacedUnitId: -1, defId: 'gamasot', slot: 0 });
    expect(s.storage).toEqual([]);
  });

  test('mixed board and storage: the result takes the board material slot', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'jeolgu', 0);
    placeUnitForTest(s, 'dadeumi', 1);
    placeUnitForTest(s, 'jipsin', 8);
    step(s, [{ type: 'store', slot: 0 }, { type: 'store', slot: 1 }]);
    expect(reasons(s, [{ type: 'combine', result: 'didilbangga' }])).toEqual([]);
    expect(s.slots[8]!.defId).toBe('didilbangga');
    expect(s.storage).toEqual([]);
    expect(s.slots.filter(Boolean)).toHaveLength(1);
  });

  test('duplicates: one material on the board, the same one from storage', () => {
    const s = createGame(data2, 1);
    placeUnitForTest(s, 'dadeumi', 5);
    placeUnitForTest(s, 'dadeumi', 6);
    placeUnitForTest(s, 'ki', 7);
    step(s, [{ type: 'store', slot: 6 }, { type: 'store', slot: 7 }]);
    expect(reasons(s, [{ type: 'combine', result: 'dadeumitdol' }])).toEqual([]);
    expect(s.slots[5]!.defId).toBe('dadeumitdol');
    expect(storedIds(s)).toEqual(['ki']);
  });

  test('board units are used before stored ones', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 0);
    step(s, [{ type: 'store', slot: 0 }]);
    placeUnitForTest(s, 'sotlid', 3);
    placeUnitForTest(s, 'bujigaengi', 4);
    expect(reasons(s, [{ type: 'combine', result: 'gamasot' }])).toEqual([]);
    expect(s.slots[3]!.defId).toBe('gamasot');
    expect(storedIds(s)).toEqual(['sotlid']);
  });

  test('a chosen board unit still receives the result when the rest is stored', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'gamasot', 0);
    placeUnitForTest(s, 'ki', 1);
    placeUnitForTest(s, 'sotlid', 2);
    step(s, [{ type: 'store', slot: 1 }, { type: 'store', slot: 2 }]);
    expect(reasons(s, [{ type: 'combine', result: 'jangdok', slot: 0 }])).toEqual([]);
    expect(s.slots[0]!.defId).toBe('jangdok');
    expect(s.storage).toEqual([]);
  });

  test('everything stored and no free slot: noSlot, and nothing is spent', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 0);
    placeUnitForTest(s, 'bujigaengi', 1);
    step(s, [{ type: 'storeAll' }]);
    fill(s, 'jangdok');
    const before = stateHash(s.storage);
    expect(reasons(s, [{ type: 'combine', result: 'gamasot' }])).toEqual(['noSlot']);
    expect(stateHash(s.storage)).toBe(before);
    expect(s.slots.some(u => u?.defId === 'gamasot')).toBe(false);
  });

  test('the ledger cost of stored materials carries into the result', () => {
    const s = createGame(data3, 1);
    const a = placeUnitForTest(s, 'sotlid', 0);
    const b = placeUnitForTest(s, 'bujigaengi', 1);
    a.cost = 0; b.cost = 1;
    expect(nonQuestValue(s)).toBe(1);
    step(s, [{ type: 'storeAll' }]);
    expect(nonQuestValue(s)).toBe(1);
    expect(s.storage!.map(u => u.cost)).toEqual([0, 1]);
    step(s, [{ type: 'retrieve', defId: 'sotlid' }]);
    expect(s.slots.find(u => u?.defId === 'sotlid')).toBe(a);
    step(s, [{ type: 'combine', result: 'gamasot' }]);
    expect(s.slots.find(u => u?.defId === 'gamasot')!.cost).toBe(1);
  });
});

describe('storage and determinism', () => {
  test('a lane that never stores has no storage field', () => {
    const s = createGame(data, 7);
    for (let i = 0; i < 40; i++) step(s, i % 5 === 0 ? [{ type: 'summon' }, { type: 'combine', result: 'gamasot' }] : []);
    expect('storage' in s).toBe(false);
  });

  test('the same commands give the same state', () => {
    const run = () => {
      const s = createGame(data2, 3);
      const cmds: Command[][] = [[{ type: 'summon' }, { type: 'summon' }, { type: 'summon' }], [{ type: 'storeAll' }], [{ type: 'retrieve', defId: 'sotlid' }]];
      for (let i = 0; i < 30; i++) step(s, cmds[i] ?? []);
      return stateHash(s);
    };
    expect(run()).toBe(run());
  });
});

describe('storage online', () => {
  test('parse and toWire round-trip the storage commands', () => {
    const cmds: Command[] = [
      { type: 'store', slot: 3, unitId: 9 }, { type: 'storeAll' }, { type: 'retrieve', defId: 'sotlid' },
      { type: 'retrieve', defId: 'ki', slot: 5 }, { type: 'sellStored', defId: 'gamasot' },
    ];
    for (const cmd of cmds) expect(parseClientCommand({ seq: 1, ...toWire(cmd) })!.cmd).toEqual(cmd);
    const bad = [
      { type: 'store', args: { slot: 3 } }, { type: 'store', args: { slot: 24, unitId: 1 } }, { type: 'store', args: { slot: 0, unitId: null } },
      { type: 'storeAll', args: { x: 1 } }, { type: 'retrieve', args: {} }, { type: 'retrieve', args: { defId: '' } },
      { type: 'retrieve', args: { defId: 'ki', slot: -1 } }, { type: 'retrieve', args: { defId: 'x'.repeat(33) } },
      { type: 'retrieve', args: { defId: 'ki', slot: 1, unitId: 2 } }, { type: 'sellStored', args: { defId: 3 } }, { type: 'sellStored' },
    ];
    for (const raw of bad) expect(parseClientCommand({ seq: 1, ...raw })).toEqual({ seq: 1, cmd: { type: 'invalid' } });
  });

  test('toWire fills the stored unit id from the lane', () => {
    const s = createGame(data2, 1);
    const u = placeUnitForTest(s, 'ki', 4);
    expect(toWire({ type: 'store', slot: 4 }, s)).toEqual({ type: 'store', args: { slot: 4, unitId: u.id } });
  });

  test('a match stores per seat, checks the unit id and streams the storage to its owner only', () => {
    const m = createMatch(data2, 1, [1, 2]);
    const lane = m.lanes[1]!;
    const a = placeUnitForTest(lane, 'ki', 0);
    const b = placeUnitForTest(lane, 'sotlid', 1);
    const streamer = new MatchStreamer(m);
    const full = buildFull(m, 1, { watching: 1, names: {}, key: 'k', n: 1 });
    expect('storage' in full.mine).toBe(false);
    const r = stepMatch(m, [
      { seat: 1, seq: 1, cmd: { type: 'store', slot: 0, unitId: b.id } },
      { seat: 1, seq: 2, cmd: { type: 'store', slot: 0, unitId: a.id } },
    ]);
    expect(r.acks.map(x => (x.ok ? 'ok' : x.reason))).toEqual(['staleUnit', 'ok']);
    const out = streamer.afterStep(r);
    expect(out.mine[1]!.storage).toEqual([{ id: a.id, defId: 'ki' }]);
    expect(out.mine[2]?.storage).toBeUndefined();
    expect(out.lanes[1]!.find(e => e.t === 'board')).toBeTruthy();
    const r2 = stepMatch(m, [{ seat: 1, seq: 3, cmd: { type: 'retrieve', defId: 'ki', slot: 5 } }]);
    expect(r2.acks[0]).toMatchObject({ ok: true });
    expect(streamer.afterStep(r2).mine[1]!.storage).toEqual([]);
    expect(lane.slots[5]).toBe(a);
  });

  test('an eliminated seat loses its storage with its board', () => {
    const m = createMatch(data2, 1, [1, 2]);
    const lane = m.lanes[1]!;
    placeUnitForTest(lane, 'ki', 0);
    stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'storeAll' } }]);
    expect(lane.storage).toHaveLength(1);
    stepMatch(m, [{ seat: 1, seq: 2, cmd: { type: 'forfeit' } }]);
    expect(m.seats[1]!.alive).toBe(false);
    expect(lane.storage).toEqual([]);
  });
});
