import { describe, expect, test } from 'vitest';
import { applyBossKnockback, createGame, loadGameData, step, type GameData } from '../src/index';
import { forceRound, makeData, placeUnitForTest, spawnEnemyForTest } from '../src/testing';

const d3 = loadGameData('stage3');
const quietOf = (data: GameData) => { const s = createGame(data, 1); forceRound(s, 1); s.spawned = 30; s.roundEndTick = 10 ** 9; s.enemies = []; return s; };
const sure = (stage: 'stage1' | 'stage3') => makeData(d => {
  for (const u of d.units) if (u.id === 'sotlid' || u.id === 'buchae') u.skills[0]!.trigger = { kind: 'chance', p: 1 };
}, stage);

describe('lane boss control caps', () => {
  test('perma-stunned boss stops at most 60 of any 200 ticks and 30% overall', () => {
    const s = quietOf(d3); const b = spawnEnemyForTest(s, 'jinegaksi', 5);
    for (let i = 0; i < 1000; i++) {
      b.stunTicks = 10 ** 6; step(s, []);
      expect(b.ctl!.stunLog.length).toBeLessThanOrEqual(60);
      expect(b.ctl!.stopped).toBeLessThanOrEqual(Math.floor(0.3 * b.ctl!.alive));
    }
    expect(b.ctl!.stopped).toBeGreaterThanOrEqual(280);
    expect(b.ctl!.maxWindowStopped).toBeLessThanOrEqual(60);
  });

  test('a stun right after spawn is dropped and the boss moves', () => {
    const s = quietOf(d3); const b = spawnEnemyForTest(s, 'jinegaksi', 5); b.stunTicks = 100;
    const d0 = b.d; const r = step(s, []);
    expect([b.stunTicks, b.d > d0, b.ctl!.stunClipped, b.stunEndTick]).toEqual([0, true, 100, 0]);
    expect(r.events.some(e => e.type === 'speedChange' && e.enemyId === b.id)).toBe(true);
  });

  test('knockback budget 3 tiles per 200 ticks and entrance clip', () => {
    const s = quietOf(d3); const b = spawnEnemyForTest(s, 'gangcheori', 10);
    expect(applyBossKnockback(s, b, 2)).toBe(2); expect(applyBossKnockback(s, b, 2)).toBe(1);
    expect([b.d, b.ctl!.pushClipped, b.ctl!.pushApplied]).toEqual([7, 1, 3]);
    s.tick += 200; expect(applyBossKnockback(s, b, 2)).toBe(2);
    const c = spawnEnemyForTest(s, 'gangcheori', 0.5); expect(applyBossKnockback(s, c, 2)).toBe(0.5); expect(c.ctl!.entranceClipped).toBe(1.5);
    expect(c.d).toBe(0);
  });

  test('buchae knockback on a stage 3 lane boss goes through the budget', () => {
    const s = quietOf(sure('stage3')); placeUnitForTest(s, 'buchae', 9);
    const b = spawnEnemyForTest(s, 'gangcheori', 3);
    for (let i = 0; i < 400; i++) { b.d = 3; step(s, []); }
    expect(b.ctl!.pushApplied).toBeGreaterThan(0);
    expect(b.ctl!.pushLog.reduce((a, [, d]) => a + d, 0)).toBeLessThanOrEqual(3 + 1e-9);
    expect(b.ctl!.pushClipped).toBeGreaterThan(0);
  });

  test('yeoksin stays fully immune in stage 3', () => {
    const s = quietOf(sure('stage3')); placeUnitForTest(s, 'sotlid', 2); placeUnitForTest(s, 'buchae', 7);
    const y = spawnEnemyForTest(s, 'yeoksin1', 3, 1e9);
    for (let i = 0; i < 60; i++) {
      const d = y.d; step(s, []);
      expect([y.stunTicks, y.slow, y.d]).toEqual([0, null, d]);
    }
    expect('ctl' in y).toBe(false);
  });

  test('stage 1 bosses get no ctl', () => {
    const s = quietOf(sure('stage1')); placeUnitForTest(s, 'sotlid', 2);
    const b = spawnEnemyForTest(s, 'jinegaksi', 3);
    let maxStun = 0;
    for (let i = 0; i < 100; i++) { b.d = 3; step(s, []); maxStun = Math.max(maxStun, b.stunTicks); }
    expect('ctl' in b).toBe(false);
    expect(maxStun).toBe(5);
  });
});
