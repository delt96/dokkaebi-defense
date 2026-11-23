import { describe, expect, test } from 'vitest';
import { createGame, step, loadGameData, nextFloat, summonOddsForRound } from '../src/index';
import { rollSummon, chooseSlot, pityPick } from '../src/units';
import { placeUnitForTest, makeData } from '../src/testing';
import { unitDef } from '../src/data';

const data = loadGameData();

describe('units', () => {
  test.each(['stage1', 'stage2'] as const)('%s resolves each round boundary', stage => {
    const b = loadGameData(stage).balance;
    const early = [0.85, 0.15, 0], mid = [0.77, 0.2, 0.03], late = [0.7, 0.25, 0.05];
    expect([0, 1, 4, 5, 9, 10, 60].map(r => summonOddsForRound(b, r)))
      .toEqual([early, early, early, mid, mid, late, late]);
  });
  test('stage3 summons the same odds every round', () => {
    const b = loadGameData('stage3').balance;
    expect([0, 1, 4, 5, 9, 10, 60].map(r => summonOddsForRound(b, r))).toEqual(Array(7).fill([1, 0, 0]));
  });
  test('a roll near the top of the grade-2 band moves to grade 3 at round 10', () => {
    const s = createGame(data, 11);
    const probe = { ...s.rng.summon };
    let seed: number;
    let roll: number;
    do {
      seed = probe.s;
      roll = nextFloat(probe);
    } while (roll < 0.95 || roll >= 0.97);
    for (const [round, grade] of [[1, 2], [5, 2], [10, 3]] as const) {
      s.round = round;
      s.rng.summon.s = seed;
      expect(unitDef(data, rollSummon(s)).grade).toBe(grade);
    }
  });
  test('prep and early summons never roll grade 3 and each consumes one draw', () => {
    const s = createGame(data, 11);
    const expected = { ...s.rng.summon };
    for (const round of [0, 1, 2, 3, 4]) {
      s.round = round;
      const grades = new Set<number>();
      for (let i = 0; i < 1000; i++) {
        grades.add(unitDef(data, rollSummon(s)).grade);
        nextFloat(expected);
      }
      expect(grades).toEqual(new Set([1, 2]));
      expect(s.rng.summon).toEqual(expected);
    }
  });
  test('summon spends a token and places a unit', () => {
    const s = createGame(data, 5);
    const r = step(s, [{ type: 'summon' }]);
    expect(r.rejected).toEqual([]); expect(s.tokens).toBe(3);
    expect(s.slots.filter(Boolean).length).toBe(1);
    expect(r.events.some(e => e.type === 'summon')).toBe(true);
  });
  test('odds over 40000 rolls, uniform inside a grade', () => {
    const s = createGame(data, 9); const g = [0, 0, 0]; const ids: Record<string, number> = {};
    s.round = 10;
    const N = 40000;
    for (let i = 0; i < N; i++) { const id = rollSummon(s); g[unitDef(data, id).grade - 1]!++; ids[id] = (ids[id] ?? 0) + 1; }
    expect(Math.abs(g[0]! / N - 0.70)).toBeLessThan(0.02);
    expect(Math.abs(g[1]! / N - 0.25)).toBeLessThan(0.02);
    expect(Math.abs(g[2]! / N - 0.05)).toBeLessThan(0.01);
    const grade1 = data.units.filter(u => u.grade === 1).map(u => ids[u.id] ?? 0);
    for (const c of grade1) expect(Math.abs(c / g[0]! - 1 / 8)).toBeLessThan(0.02);
  });
  test('summon with no token is rejected and leaves rng untouched', () => {
    const s = createGame(data, 1); s.tokens = 0;
    const before = s.rng.summon.s;
    expect(step(s, [{ type: 'summon' }]).rejected[0]!.reason).toBe('noToken');
    expect(s.rng.summon.s).toBe(before);
  });
  test('the 7th grade-1 summon becomes the least-summoned grade 1 instead of adding one', () => {
    const g1 = makeData(d => { delete d.balance.summonOddsByRound; d.balance.summonOdds = [1, 0, 0]; });
    const s = createGame(g1, 1);
    s.summonCounts = { bitjaru: 2, jipsin: 2, sotlid: 2, dadeumi: 2, horong: 2, bujigaengi: 2, buchae: 2, ki: 0 };
    s.tokens = 1; s.grade1Summons = 6;
    const drawn = { s: s.rng.summon.s };
    nextFloat(drawn);
    const r = step(s, [{ type: 'summon' }]);
    expect(r.events.filter(e => e.type === 'summon').map(e => (e as { defId: string }).defId)).toEqual(['ki']);
    expect(s.slots.filter(Boolean).map(u => u!.defId)).toEqual(['ki']);
    expect(s.grade1Summons).toBe(7);
    expect(s.summonCounts.ki).toBe(1);
    expect(s.rng.summon.s).toBe(drawn.s);
  });
  test('the pity summon fills the last free slot and nothing waits', () => {
    const g1 = makeData(d => { delete d.balance.summonOddsByRound; d.balance.summonOdds = [1, 0, 0]; });
    const s = createGame(g1, 1);
    for (let i = 0; i < 23; i++) placeUnitForTest(s, 'sotlid', i);
    s.tokens = 2; s.grade1Summons = 6;
    step(s, [{ type: 'summon' }]);
    expect(s.slots.filter(Boolean).length).toBe(24);
    expect(step(s, [{ type: 'summon' }]).rejected[0]!.reason).toBe('noSlot');
    expect(s.tokens).toBe(1);
  });
  test('pity ties go to the grade-1 list order', () => {
    const g1 = makeData(d => { delete d.balance.summonOddsByRound; d.balance.summonOdds = [1, 0, 0]; });
    const s = createGame(g1, 1);
    s.summonCounts = { bitjaru: 3, jipsin: 1, sotlid: 3, dadeumi: 1, horong: 3, bujigaengi: 3, buchae: 3, ki: 3 };
    s.tokens = 1; s.grade1Summons = 13;
    step(s, [{ type: 'summon' }]);
    expect(s.slots.filter(Boolean).map(u => u!.defId)).toEqual(['jipsin']);
  });
  test('stage 3 swaps on every 5th grade-1 summon', () => {
    const g1 = makeData(d => { delete d.balance.summonOddsByRound; d.balance.summonOdds = [1, 0, 0]; }, 'stage3');
    const s = createGame(g1, 1);
    const grade1 = g1.units.filter(u => u.grade === 1 && !u.hidden).map(u => u.id);
    s.summonCounts = Object.fromEntries(grade1.map((id, i) => [id, i === 5 ? 0 : 4]));
    s.tokens = 1; s.grade1Summons = 4;
    step(s, [{ type: 'summon' }]);
    expect(s.grade1Summons).toBe(5);
    expect(s.slots.filter(Boolean).map(u => u!.defId)).toEqual([grade1[5]]);
  });
  test('grade 2 and 3 rolls do not count toward the pity and are never replaced', () => {
    const g2 = makeData(d => { delete d.balance.summonOddsByRound; d.balance.summonOdds = [0, 1, 0]; });
    const s = createGame(g2, 1);
    s.tokens = 1; s.grade1Summons = 6;
    step(s, [{ type: 'summon' }]);
    expect(s.grade1Summons).toBe(6);
    expect(unitDef(g2, s.slots.find(Boolean)!.defId).grade).toBe(2);
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
  test('every summon places exactly one unit, pity summons included', () => {
    const s = createGame(data, 3); s.tokens = 200;
    for (let i = 0; i < 120; i++) {
      const r = step(s, [{ type: 'summon' }]);
      const placed = r.events.filter(e => e.type === 'summon');
      expect(placed.length).toBe(1);
      step(s, [{ type: 'sell', slot: (placed[0] as { slot: number }).slot }]);
    }
    expect(s.grade1Summons).toBeGreaterThanOrEqual(70);
    expect(Object.values(s.summonCounts).reduce((a, b) => a + b, 0)).toBe(120);
  });
  test('move and swap, rejections', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 0); placeUnitForTest(s, 'horong', 7);
    step(s, [{ type: 'move', from: 0, to: 1 }]); expect(s.slots[1]!.defId).toBe('sotlid'); expect(s.slots[0]).toBeNull();
    step(s, [{ type: 'move', from: 1, to: 7 }]); expect(s.slots[7]!.defId).toBe('sotlid'); expect(s.slots[1]!.defId).toBe('horong');
    const r = step(s, [{ type: 'move', from: 7, to: 99 }, { type: 'move', from: 0, to: 2 }, { type: 'move', from: 99, to: 2 }]);
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
