import { describe, expect, test } from 'vitest';
import { createGame, step, type Enemy, type GameEvent } from '../src/index';
import { unitAttacks } from '../src/combat';
import { forceRound, makeData, placeUnitForTest, spawnEnemyForTest } from '../src/testing';

const data = makeData(d => { for (const u of d.units) for (const s of u.skills) if (s.trigger.kind === 'chance') s.trigger.p = 1; }, 'stage2');

function attackOnce(id: string, nth = 0) {
  const s = createGame(data, 1); forceRound(s, 1); s.spawned = 30; s.enemies = [];
  const unit = placeUnitForTest(s, id, 2);
  if (nth) unit.attackCount = nth - 1;
  const [target, near, behind, far] = [3, 3.5, 2, 5].map(d => spawnEnemyForTest(s, 'japgwi', d, 1e9)) as [Enemy, Enemy, Enemy, Enemy];
  const events: GameEvent[] = [];
  unitAttacks(s, events);
  const dmg = (e: Enemy) => events.flatMap(x => (x.type === 'damage' && x.enemyId === e.id ? [x.amount] : []));
  return { s, target, near, behind, far, events, dmg };
}
const slow = (pct: number, ticks: number) => ({ pct, ticks });

describe('stage 2 units fire their spec effects', () => {
  test('sseurebatgi: 22, slow 25% 1.5s on target and everything within 1.0', () => {
    const r = attackOnce('sseurebatgi');
    expect(r.dmg(r.target)).toEqual([22]);
    for (const e of [r.target, r.near, r.behind]) expect(e.slow).toEqual(slow(0.25, 30));
    expect(r.far.slow).toBeNull();
  });
  test('sut: 30 and a 2s dot worth 140%', () => {
    const r = attackOnce('sut');
    expect(r.dmg(r.target)).toEqual([30]);
    expect(r.target.dots.sut).toEqual({ remaining: 42, pulsesLeft: 4, nextPulse: r.s.tick + 10 });
  });
  test('dadeumitdol 3rd attack: 33, splash 25 within 0.8 only', () => {
    const r = attackOnce('dadeumitdol', 3);
    expect([r.dmg(r.target), r.dmg(r.near), r.dmg(r.behind)]).toEqual([[33], [25], []]);
  });
  test('mumyeong 4th attack: two hits of 25', () => {
    const r = attackOnce('mumyeong', 4);
    expect(r.dmg(r.target)).toEqual([25, 25]);
  });
  test('hanji: 17 and knockback 0.75', () => {
    const r = attackOnce('hanji');
    expect(r.dmg(r.target)).toEqual([17]); expect(r.target.d).toBeCloseTo(2.25, 9);
  });
  test('baneul 5th attack: 63, pierce 79 behind only', () => {
    const r = attackOnce('baneul', 5);
    expect([r.dmg(r.target), r.dmg(r.behind), r.dmg(r.near), r.dmg(r.far)]).toEqual([[63], [79], [], []]);
  });
  test('but 4th attack: 63, splash 73 within 1.5', () => {
    const r = attackOnce('but', 4);
    expect([r.dmg(r.target), r.dmg(r.near), r.dmg(r.behind), r.dmg(r.far)]).toEqual([[63], [73], [73], []]);
  });
  test('gireumbyeong: 56, physical vuln 18% 2.5s', () => {
    const r = attackOnce('gireumbyeong');
    expect(r.dmg(r.target)).toEqual([56]);
    expect(r.target.vulns.gireumbyeong).toEqual({ pct: 0.18, damageType: 'physical', ticks: 50, stacks: 1 });
  });
  test('hamjibak 4th attack: crit 186 and stun 0.75s', () => {
    const r = attackOnce('hamjibak', 4);
    expect(r.events).toContainEqual({ type: 'damage', enemyId: r.target.id, amount: 186, source: 'hamjibak', effect: 'crit' });
    expect(r.target.stunTicks).toBe(15);
  });
  test('bagaji 4th attack: 62, pierce 47 behind, knockback 1', () => {
    const r = attackOnce('bagaji', 4);
    expect([r.dmg(r.target), r.dmg(r.behind)]).toEqual([[62], [47]]); expect(r.target.d).toBeCloseTo(2, 9);
  });
  test('golmu 3rd attack: 211, splash 179 within 1.3, knockback 1.5', () => {
    const r = attackOnce('golmu', 3);
    expect([r.dmg(r.target), r.dmg(r.near), r.dmg(r.behind), r.dmg(r.far)]).toEqual([[211], [179], [179], []]);
    expect(r.target.d).toBeCloseTo(1.5, 9);
  });
  test('tteongme 3rd attack: crit 613, splash 170 within 0.9', () => {
    const r = attackOnce('tteongme', 3);
    expect([r.dmg(r.target), r.dmg(r.near), r.dmg(r.behind)]).toEqual([[613], [170], []]);
  });
  test('gawi: 206, stun 1.1s, physical vuln 14% 3s', () => {
    const r = attackOnce('gawi');
    expect(r.dmg(r.target)).toEqual([206]); expect(r.target.stunTicks).toBe(22);
    expect(r.target.vulns.gawi).toEqual({ pct: 0.14, damageType: 'physical', ticks: 60, stacks: 1 });
  });
  test('sokuri: 140 and splash 140 within 1.2, slow 26% 2.5s within 1.2 including the target', () => {
    const r = attackOnce('sokuri');
    expect([r.dmg(r.target), r.dmg(r.near), r.dmg(r.behind), r.dmg(r.far)]).toEqual([[140], [140], [140], []]);
    for (const e of [r.target, r.near, r.behind]) expect(e.slow).toEqual(slow(0.26, 50));
  });
  test('byeoru 4th attack: 178, 3s dot worth 105%, knockback 1', () => {
    const r = attackOnce('byeoru', 4);
    expect(r.dmg(r.target)).toEqual([178]);
    expect(r.target.dots.byeoru).toEqual({ remaining: 187, pulsesLeft: 6, nextPulse: r.s.tick + 10 });
    expect(r.target.d).toBeCloseTo(2, 9);
  });
  test('ja 4th attack: 171, pierce 222 behind, 2s dot worth 70%', () => {
    const r = attackOnce('ja', 4);
    expect([r.dmg(r.target), r.dmg(r.behind)]).toEqual([[171], [222]]);
    expect(r.target.dots.ja).toEqual({ remaining: 120, pulsesLeft: 4, nextPulse: r.s.tick + 10 });
  });
  test('chaeban 3rd attack: one damage event at 1.85x and slow 42% 3s on the target only', () => {
    const r = attackOnce('chaeban', 3);
    expect(r.events.filter(x => x.type === 'damage')).toEqual([{ type: 'damage', enemyId: r.target.id, amount: 359, source: 'chaeban', effect: 'crit' }]);
    expect(r.target.slow).toEqual(slow(0.42, 60)); expect(r.near.slow).toBeNull();
  });
  test('jumadeung 4th attack: two hits of 137, magical vuln 18% 3s', () => {
    const r = attackOnce('jumadeung', 4);
    expect(r.dmg(r.target)).toEqual([137, 137]);
    expect(r.target.vulns.jumadeung).toEqual({ pct: 0.18, damageType: 'magical', ticks: 60, stacks: 1 });
  });
  test('nth units: no skill effect on any attack before the nth', () => {
    const N: [string, number][] = [['dadeumitdol', 3], ['mumyeong', 4], ['baneul', 5], ['but', 4], ['hamjibak', 4], ['bagaji', 4],
      ['golmu', 3], ['tteongme', 3], ['byeoru', 4], ['ja', 4], ['chaeban', 3], ['jumadeung', 4]];
    for (const [id, n] of N) for (let k = 1; k < n; k++) {
      const r = attackOnce(id, k);
      const hits = r.events.filter(x => x.type === 'damage');
      expect(hits.length, `${id} attack ${k}`).toBe(1);
      expect(hits[0], `${id} attack ${k}`).toMatchObject({ enemyId: r.target.id });
      expect(hits[0], `${id} attack ${k}`).not.toHaveProperty('effect');
      expect([r.target.d, r.target.stunTicks, r.target.slow, r.target.vulns], `${id} attack ${k}`).toEqual([3, 0, null, {}]);
      expect(Object.keys(r.target.dots), `${id} attack ${k}`).toEqual(id === 'byeoru' ? ['byeoru'] : []);
    }
  });
  test('byeoru dot is replaced on every attack, so 2 of its 6 pulses land per attack', () => {
    const s = createGame(data, 1); forceRound(s, 1); s.spawned = 30; s.roundEndTick = 1e9; s.enemies = [];
    placeUnitForTest(s, 'byeoru', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 1e9); e.stunTicks = 1e6;
    let attacks = 0; let pulses = 0;
    for (let i = 0; i < 115; i++) for (const x of step(s, []).events) {
      if (x.type === 'attack') attacks++;
      if (x.type === 'damage' && x.source === 'byeoru' && x.amount < 100) pulses++;
    }
    expect(attacks).toBe(5); expect(pulses).toBe(10);
  });
});
