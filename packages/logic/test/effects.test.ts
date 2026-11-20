import { describe, expect, test } from 'vitest';
import { createGame, step } from '../src/index';
import type { Command } from '../src/types';
import { forceRound, spawnEnemyForTest, placeUnitForTest, makeData } from '../src/testing';
import { vulnOf } from '../src/effects';
import { speedBonus, damageBonus } from '../src/combat';

const always = makeData(d => { for (const u of d.units) for (const s of u.skills) if (s.trigger.kind === 'chance') s.trigger.p = 1; });
const quiet = (data = always) => { const s = createGame(data, 1); forceRound(s, 1); s.spawned = 30; s.roundEndTick = 10 ** 9; s.enemies = []; return s; };
const dmg = (r: ReturnType<typeof step>, id: number) => r.events.filter(e => e.type === 'damage' && e.enemyId === id).map(e => (e as { amount: number }).amount);

describe('effects', () => {
  test('extraAttack hits twice', () => {
    const s = quiet(); placeUnitForTest(s, 'jipsin', 2); const e = spawnEnemyForTest(s, 'japgwi', 3, 1000);
    expect(dmg(step(s, []), e.id).length).toBe(2);
  });
  test('crit plus splash (jeolgu)', () => {
    const s = quiet(); placeUnitForTest(s, 'jeolgu', 2);
    const a = spawnEnemyForTest(s, 'japgwi', 3, 10000); const b = spawnEnemyForTest(s, 'japgwi', 3.8, 10000);
    const r = step(s, []);
    expect(dmg(r, a.id)[0]).toBe(Math.round(26 * 1.3 * 1.0 * 2));
    expect(dmg(r, b.id)[0]).toBe(Math.round(26 * 1.3 * 1.0 * 0.5));
  });
  test('execute doubles below 30%', () => {
    const s = quiet(); placeUnitForTest(s, 'bujigaengi', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 1000); e.hp = 300;
    expect(dmg(step(s, []), e.id)[0]).toBe(Math.round(10 * 0.9 * 0.9 * 2));
  });
  test('pierce hits followers only', () => {
    const s = quiet(); placeUnitForTest(s, 'hwaetbul', 2);
    const t = spawnEnemyForTest(s, 'japgwi', 3, 10000);
    const behind = spawnEnemyForTest(s, 'japgwi', 1.5, 10000); const ahead = spawnEnemyForTest(s, 'japgwi', 4, 10000);
    t.id = -1;
    const r = step(s, []);
    expect(dmg(r, t.id).length).toBe(1); expect(dmg(r, behind.id).length).toBe(1); expect(dmg(r, ahead.id).length).toBe(0);
  });
  test('stun stops movement, half on boss', () => {
    const s = quiet(); placeUnitForTest(s, 'sotlid', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 10000); step(s, []);
    expect(e.stunTicks).toBe(10);
    const s2 = quiet(); placeUnitForTest(s2, 'sotlid', 2); const boss = spawnEnemyForTest(s2, 'jinegaksi', 3); step(s2, []);
    expect(boss.stunTicks).toBe(5);
  });
  test('knockback moves back, never below 0, emits speedChange', () => {
    const s = quiet(); placeUnitForTest(s, 'buchae', 7);
    const e = spawnEnemyForTest(s, 'japgwi', 2.5, 10000);
    const r = step(s, []);
    expect(e.d).toBeCloseTo(2.5 + 0.08 - 1, 5);
    expect(r.events.some(x => x.type === 'speedChange' && x.enemyId === e.id)).toBe(true);
    e.d = 0.3; s.slots[7]!.cooldown = 0; step(s, []); expect(e.d).toBe(0);
  });
  test('vuln: same source refreshes, moru stacks to 5, cap 0.5', () => {
    const s = quiet(); placeUnitForTest(s, 'moru', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 10 ** 6); e.stunTicks = 10 ** 6;
    for (let i = 0; i < 200; i++) step(s, []);
    expect(e.vulns.moru!.stacks).toBe(5);
    expect(vulnOf(s, e, 'physical')).toBeCloseTo(0.2); expect(vulnOf(s, e, 'magical')).toBeCloseTo(0);
    e.vulns.x = { pct: 0.4, damageType: 'all', ticks: 100, stacks: 1 };
    expect(vulnOf(s, e, 'physical')).toBeCloseTo(0.5);
  });
  test('dot: fixed total over 6 pulses, reapply replaces', () => {
    const s = quiet(); placeUnitForTest(s, 'horong', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 10 ** 6); step(s, []);
    expect(e.dots.horong!.pulsesLeft).toBe(6);
    expect(e.dots.horong!.remaining).toBe(Math.round(10 * 1.0 * 0.85));
  });
  test('ground fire stays after the unit is sold and hits once per pulse', () => {
    const s = quiet(); placeUnitForTest(s, 'hwaro', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 10 ** 6); e.stunTicks = 10 ** 6;
    step(s, []); expect(s.fires.length).toBe(1);
    step(s, [{ type: 'sell', slot: 2 }]);
    const hits: number[] = [];
    for (let i = 0; i < 40; i++) hits.push(...dmg(step(s, []), e.id));
    expect(hits.length).toBe(4); expect(s.fires.length).toBe(0);
  });
  test('splash kill explodes, explosion kill does not chain', () => {
    const s = quiet(); placeUnitForTest(s, 'onggigama', 7);
    spawnEnemyForTest(s, 'japgwi', 2.5, 1); spawnEnemyForTest(s, 'japgwi', 3.5, 1);
    const c = spawnEnemyForTest(s, 'japgwi', 4.8, 1); const far = spawnEnemyForTest(s, 'japgwi', 6.0, 1000);
    const r = step(s, []);
    expect(s.enemies.find(x => x.id === c.id)).toBeUndefined();
    expect(dmg(r, far.id).length).toBe(0);
  });
  test('auras: speed adds by kind, power by damage type, jangdok vuln', () => {
    const s = quiet();
    placeUnitForTest(s, 'horong', 8); placeUnitForTest(s, 'cheongsachorong', 1); placeUnitForTest(s, 'cheongsachorong', 3);
    expect(speedBonus(s, 8)).toBeCloseTo(0.10);
    placeUnitForTest(s, 'daljip', 9); expect(speedBonus(s, 8)).toBeCloseTo(0.30);
    placeUnitForTest(s, 'pulmu', 14); placeUnitForTest(s, 'sotlid', 13);
    expect(damageBonus(s, 8)).toBeCloseTo(0.15); expect(damageBonus(s, 13)).toBeCloseTo(0);
    placeUnitForTest(s, 'jangdok', 2); const e = spawnEnemyForTest(s, 'japgwi', 3, 1000);
    expect(vulnOf(s, e, 'magical')).toBeCloseTo(0.10);
  });
  test('nth: didilbangga 5th attack crits and stuns, counter survives a move', () => {
    const s = quiet(); placeUnitForTest(s, 'didilbangga', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 10 ** 6); e.stunTicks = 10 ** 6;
    const amounts: number[] = [];
    for (let i = 0; i < 4 * 20 + 1; i++) {
      const cmds: Command[] = i === 30 ? [{ type: 'move', from: 2, to: 3 }, { type: 'move', from: 3, to: 2 }] : [];
      amounts.push(...dmg(step(s, cmds), e.id));
    }
    expect(amounts.length).toBe(5);
    expect(amounts[0]).toBe(Math.round(67.6 * 1.0 * 0.9));
    expect(amounts[4]).toBe(Math.round(67.6 * 1.0 * 0.9 * 2.5));
  });
  test('periodic allInRange waits when no target', () => {
    const s = quiet(); placeUnitForTest(s, 'yeonjabangga', 2);
    for (let i = 0; i < 100; i++) step(s, []);
    expect(s.slots[2]!.periodic[0]).toBe(0);
  });
});

describe('checkpoint 2 fixes', () => {
  test('same-source fires never hit one enemy more than once per pulse', () => {
    const s = quiet();
    const e = spawnEnemyForTest(s, 'japgwi', 3, 10 ** 6); e.stunTicks = 10 ** 6;
    s.fires.push({ source: 'hwaro', from: 2.5, to: 3.5, basePerPulse: 5, nextPulse: s.tick + 10, endTick: s.tick + 40 });
    s.fires.push({ source: 'hwaro', from: 2.5, to: 3.5, basePerPulse: 5, nextPulse: s.tick + 15, endTick: s.tick + 45 });
    const hits: number[] = [];
    for (let i = 0; i < 46; i++) hits.push(...dmg(step(s, []), e.id));
    expect(hits.length).toBe(4);
  });
  test('a killing hit still leaves its ground fire', () => {
    const s = quiet(); placeUnitForTest(s, 'jwibul', 2);
    spawnEnemyForTest(s, 'japgwi', 3, 1);
    step(s, []);
    expect(s.fires.length).toBe(1);
  });
  test('pierce measures the gap around the loop', () => {
    const s = quiet(); placeUnitForTest(s, 'hwaetbul', 2);
    const t = spawnEnemyForTest(s, 'japgwi', 27, 10000); t.id = -1;
    const behind = spawnEnemyForTest(s, 'japgwi', 1.5, 10000);
    const r = step(s, []);
    expect(dmg(r, behind.id).length).toBe(1);
  });
  test('dot pulses add up to the fixed total', () => {
    const s = quiet(); placeUnitForTest(s, 'horong', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 10 ** 6); e.stunTicks = 10 ** 6;
    step(s, []);
    s.slots[2] = null;
    const pulses: number[] = [];
    for (let i = 0; i < 70; i++) pulses.push(...step(s, []).events.filter(x => x.type === 'damage' && x.enemyId === e.id && x.source === 'horong').map(x => (x as { amount: number }).amount));
    expect(pulses.length).toBe(6);
    expect(pulses.reduce((a, b) => a + b, 0)).toBe(Math.round(10 * 1.0 * 0.85));
  });
  test('periodic fires every 2 seconds exactly', () => {
    const s = quiet(); placeUnitForTest(s, 'yeonjabangga', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 10 ** 7); e.stunTicks = 10 ** 7;
    const fireTicks: number[] = [];
    for (let i = 0; i < 130; i++) {
      const t = s.tick;
      const r = step(s, []);
      if (r.events.filter(x => x.type === 'damage' && x.enemyId === e.id).length > (r.events.some(x => x.type === 'attack') ? 1 : 0)) fireTicks.push(t);
    }
    expect(fireTicks.length).toBeGreaterThanOrEqual(3);
    expect(fireTicks[1]! - fireTicks[0]!).toBe(40);
    expect(fireTicks[2]! - fireTicks[1]!).toBe(40);
  });
});
