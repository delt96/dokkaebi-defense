import { describe, expect, test } from 'vitest';
import { createGame, createMatch, deriveSeed, laneSeed, loadGameData, matchHash, roundStartTick, stepMatch, type MatchInput } from '../src/index';
import { placeUnitForTest, stepMatchUntil } from '../src/testing';

const data = loadGameData('stage2');
const summon = (seat: number, seq: number): MatchInput => ({ seat, seq, cmd: { type: 'summon' } });

describe('match flow', () => {
  test('schedule', () => {
    expect([1, 2, 6, 10, 11, 15, 20, 21].map(r => roundStartTick(data, r))).toEqual([600, 1400, 4600, 7800, 9300, 12500, 16500, 18000]);
  });
  test('lanes only for given seats; seat 1 keeps the base seed, others pass:<seat>', () => {
    const m = createMatch(data, 77, [3, 1, 5]);
    expect(m.ring).toEqual([1, 3, 5]);
    expect(Object.keys(m.lanes).map(Number)).toEqual([1, 3, 5]);
    expect(m.lanes[1]!.rng).toEqual(createGame(data, 77).rng);
    expect(m.lanes[3]!.rng).toEqual(createGame(data, deriveSeed(77, 'pass:3')).rng);
    expect(laneSeed(77, 1)).toBe(77);
    const n = createMatch(data, 77, [2, 3]);
    expect(Object.values(n.lanes).some(l => JSON.stringify(l.rng) === JSON.stringify(createGame(data, 77).rng))).toBe(false);
  });
  test('rejects bad seat lists and stage 1 data', () => {
    for (const seats of [[], [1, 1], [7], [0], [1.5]]) expect(() => createMatch(data, 1, seats)).toThrow();
    expect(() => createMatch(loadGameData(), 1, [1])).toThrow();
  });
  test.each([[[1]], [[1, 2]], [[1, 2, 3, 4, 5, 6]]])('boundaries, 30 spawns and round-end coins for seats %j', seats => {
    const m = createMatch(data, 5, seats);
    stepMatchUntil(m, 600);
    for (const s of seats) expect(m.lanes[s]).toMatchObject({ phase: 'prep', round: 0, tokens: 4, coins: 0 });
    stepMatch(m, []);
    for (const s of seats) {
      expect(m.lanes[s]).toMatchObject({ tick: 600, phase: 'round', round: 1, roundStartTick: 600, roundEndTick: 1400, tokens: 6, result: null });
      expect(m.lanes[s]!.enemies.map(e => e.id)).toEqual([1]);
    }
    stepMatchUntil(m, 1064);
    for (const s of seats) expect(m.lanes[s]!.enemies.length).toBe(29);
    stepMatch(m, []);
    stepMatchUntil(m, 1399);
    for (const s of seats) { expect(m.lanes[s]!.coins).toBe(0); expect(m.lanes[s]!.enemies.length).toBe(30); }
    stepMatch(m, []);
    for (const s of seats) { expect(m.lanes[s]!.coins).toBe(10); expect(m.lanes[s]!.stats[0]!.endEnemies).toBe(30); }
    stepMatch(m, []);
    for (const s of seats) expect(m.lanes[s]).toMatchObject({ round: 2, tokens: 8, coins: 10 });
  });
  test('lane time fields are overwritten at the start of each tick', () => {
    const m = createMatch(data, 1, [1]);
    m.lanes[1]!.tick = 999; m.lanes[1]!.round = 7;
    stepMatch(m, []);
    expect(m.lanes[1]).toMatchObject({ tick: 0, round: 0, phase: 'prep', result: null });
    expect(m.tick).toBe(1);
  });
  test('a summon in one lane leaves the other lane\'s summon stream alone', () => {
    const a = createMatch(data, 9, [1, 2]); const b = createMatch(data, 9, [1, 2]);
    stepMatch(a, [summon(1, 1), summon(1, 2)]); stepMatch(b, []);
    expect(a.lanes[2]!.rng).toEqual(b.lanes[2]!.rng);
    stepMatch(a, [summon(2, 1)]); stepMatch(b, [summon(2, 1)]);
    expect(a.lanes[2]!.slots.map(u => u?.defId ?? null)).toEqual(b.lanes[2]!.slots.map(u => u?.defId ?? null));
  });
  test('acks, duplicate seq, stale unit ids, invalid input, unknown seat', () => {
    const m = createMatch(data, 3, [1, 2]);
    const u = placeUnitForTest(m.lanes[1]!, 'sotlid', 0);
    let r = stepMatch(m, [
      summon(1, 1), summon(1, 1),
      { seat: 1, seq: 2, cmd: { type: 'sell', slot: 0, unitId: u.id + 100 } },
      { seat: 1, seq: 3, cmd: { type: 'move', from: 0, to: 5, unitId: u.id, toUnitId: 999 } },
      { seat: 2, seq: 1, cmd: { type: 'invalid' } },
      summon(4, 1),
    ]);
    expect(r.acks).toEqual([
      { seat: 1, seq: 1, tick: 0, ok: true },
      { seat: 1, seq: 2, tick: 0, ok: false, reason: 'staleUnit' },
      { seat: 1, seq: 3, tick: 0, ok: false, reason: 'staleUnit' },
      { seat: 2, seq: 1, tick: 0, ok: false, reason: 'badArgs' },
    ]);
    expect(m.lanes[1]!.tokens).toBe(3);
    expect(m.lanes[1]!.slots[0]!.id).toBe(u.id);
    expect(m.seats[1]!.lastSeq).toBe(3);
    expect(r.lanes[1]!.events.some(e => e.type === 'summon')).toBe(true);
    r = stepMatch(m, [summon(1, 2)]);
    expect(r.acks).toEqual([]); expect(m.lanes[1]!.tokens).toBe(3);
  });
  test('replaying the same inputs gives the same hash every 100 ticks', () => {
    const script = (t: number): MatchInput[] => (t % 200 === 0 ? [summon(1, t / 200 + 1), summon(2, t / 200 + 1)] : []);
    const run = () => { const m = createMatch(data, 21, [1, 2]); const hs: string[] = [];
      while (m.tick < 3000) { stepMatch(m, script(m.tick)); if (m.tick % 100 === 0) hs.push(matchHash(m)); } return hs; };
    const a = run();
    expect(a.length).toBe(30); expect(run()).toEqual(a);
  });
});
