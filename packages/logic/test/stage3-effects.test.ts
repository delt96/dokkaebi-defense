import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, speedBonus, step, TICKS_PER_SECOND, type GameData, type StepResult } from '../src/index';
import { auraAttackPower, vulnOf } from '../src/effects';
import { forceRound, makeData, placeUnitForTest, spawnEnemyForTest } from '../src/testing';

const d3 = loadGameData('stage3');
const quiet3 = (data: GameData = d3) => { const s = createGame(data, 1); forceRound(s, 1); s.spawned = 30; s.roundEndTick = 10 ** 9; s.enemies = []; return s; };
const dmg = (r: StepResult, id: number) => r.events.filter(e => e.type === 'damage' && e.enemyId === id).map(e => (e as { amount: number }).amount);
const firstEvery = (ids: string[]) => makeData(d => {
  for (const u of d.units) if (ids.includes(u.id)) for (const s of u.skills) if (s.trigger.kind === 'nth' || s.trigger.kind === 'chance') s.trigger = { kind: 'always' };
}, 'stage3');

describe('stage 3 effect extensions', () => {
  test('a chain bounce prefers the event enemy over a lower-id normal enemy', () => {
    const s = quiet3();
    placeUnitForTest(s, 'bitdondokkaebi', 2);
    const normal = spawnEnemyForTest(s, 'japgwi', 3, 1e6);
    const boss = spawnEnemyForTest(s, 'jinegaksi', 3, 1e6);
    const event = spawnEnemyForTest(s, 'ev_ssireum', 3, 1e6);

    const hits = step(s, []).events.filter(e => e.type === 'damage').map(e => e.enemyId);
    expect(hits.indexOf(boss.id)).toBe(0);
    expect(hits).toContain(normal.id);
    expect(hits).toContain(event.id);
    expect(hits.indexOf(event.id)).toBeLessThan(hits.indexOf(normal.id));
  });

  test('onBasicHit: tteoksiru adds 20% to target and 20% within 3 tiles', () => {
    const s = quiet3(); placeUnitForTest(s, 'tteoksiru', 2);
    const t = spawnEnemyForTest(s, 'japgwi', 3, 1e6); const near = spawnEnemyForTest(s, 'japgwi', 5, 1e6); const far = spawnEnemyForTest(s, 'japgwi', 6.7, 1e6);
    const r = step(s, []);
    expect(dmg(r, t.id)).toEqual([480, 96]); expect(dmg(r, near.id)).toEqual([96]); expect(dmg(r, far.id)).toEqual([]);
  });

  test('onBasicHit: a zero side emits nothing and stage 2 units carry no extra hit', () => {
    const s = quiet3(); placeUnitForTest(s, 'hwaetbul', 2);
    const t = spawnEnemyForTest(s, 'japgwi', 3, 1e6); const near = spawnEnemyForTest(s, 'japgwi', 4, 1e6);
    const r = step(s, []);
    expect(dmg(r, t.id).length).toBe(2); expect(dmg(r, near.id)).toEqual([]);
    const s2 = createGame(loadGameData('stage2'), 1); forceRound(s2, 1); s2.spawned = 30; s2.roundEndTick = 10 ** 9; s2.enemies = [];
    placeUnitForTest(s2, 'hwaetbul', 2); const t2 = spawnEnemyForTest(s2, 'japgwi', 3, 1e6);
    expect(dmg(step(s2, []), t2.id).length).toBe(1);
  });

  test('groundFire align ahead and behind', () => {
    const s = quiet3(firstEvery(['jipbae'])); placeUnitForTest(s, 'jipbae', 2);
    const t = spawnEnemyForTest(s, 'japgwi', 3, 1e6); step(s, []);
    expect(s.fires[0]!.to - s.fires[0]!.from).toBeCloseTo(2.5); expect(s.fires[0]!.from).toBeCloseTo(t.d);
    const s2 = quiet3(); placeUnitForTest(s2, 'jaetmulsiru', 2);
    const t2 = spawnEnemyForTest(s2, 'japgwi', 3, 1e6); step(s2, []);
    expect(s2.fires[0]!.to).toBeCloseTo(t2.d); expect(s2.fires[0]!.to - s2.fires[0]!.from).toBeCloseTo(1.5);
  });

  test('nth phase: odd attacks crit for cheonnyeondadeumitdol', () => {
    const s = quiet3(); placeUnitForTest(s, 'cheonnyeondadeumitdol', 2); const t = spawnEnemyForTest(s, 'japgwi', 3, 1e7);
    const r = step(s, []);
    expect(r.events.filter(e => e.type === 'damage' && e.enemyId === t.id)[0]).toMatchObject({ amount: 1865, effect: 'crit' });
  });

  test('status radius and area', () => {
    const s = quiet3(firstEvery(['indupan'])); placeUnitForTest(s, 'indupan', 2);
    spawnEnemyForTest(s, 'japgwi', 3, 1e6); const close = spawnEnemyForTest(s, 'japgwi', 3.8, 1e6); const away = spawnEnemyForTest(s, 'japgwi', 4.5, 1e6);
    step(s, []);
    expect([close.stunTicks, away.stunTicks]).toEqual([18, 0]);

    // slow areas only matter without the zone slow
    const local = (ids: string[]) => { const d = firstEvery(ids); delete d.balance.zoneSlow; return d; };
    const k = quiet3(local(['kkeul'])); placeUnitForTest(k, 'kkeul', 2);
    const kt = spawnEnemyForTest(k, 'japgwi', 3, 1e6); const kf = spawnEnemyForTest(k, 'japgwi', 2, 1e6);
    step(k, []);
    expect([kt.slow, kf.slow?.pct]).toEqual([null, 0.28]);

    const j = quiet3(local(['jejuheobeok'])); placeUnitForTest(j, 'jejuheobeok', 2);
    const jt = spawnEnemyForTest(j, 'japgwi', 3, 1e6); const jf = spawnEnemyForTest(j, 'japgwi', 2, 1e6); const jo = spawnEnemyForTest(j, 'japgwi', 4.5, 1e6);
    step(j, []);
    expect([jt.slow?.pct, jf.slow?.pct, jo.slow]).toEqual([0.3, 0.3, null]); // the 5% on-hit splash does not carry the slow

    const w = quiet3(firstEvery(['kkeul'])); placeUnitForTest(w, 'kkeul', 2);
    const wt = spawnEnemyForTest(w, 'japgwi', 3, 1e6); const wf = spawnEnemyForTest(w, 'japgwi', 2, 1e6);
    step(w, []);
    expect([wt.slow?.pct, wf.slow?.pct]).toEqual([0.28, 0.28]);
  });

  test('aura damage type filter and source dedupe', () => {
    const s = createGame(d3, 1); placeUnitForTest(s, 'mulle', 1); placeUnitForTest(s, 'top', 0); placeUnitForTest(s, 'meok', 2);
    expect([speedBonus(s, 0), speedBonus(s, 2)]).toEqual([0.12, 0]);
    const t = createGame(d3, 1); placeUnitForTest(t, 'gat', 1); placeUnitForTest(t, 'cheonnyeonsangmo', 2); placeUnitForTest(t, 'meok', 7);
    expect(auraAttackPower(t, 7)).toBeCloseTo(0.13);
  });

  test('vuln source key and enemy-vuln damage type', () => {
    const s = quiet3(firstEvery(['gireumteul'])); placeUnitForTest(s, 'cheonnyeonmaetbangseok', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 1e7); step(s, []);
    expect(Object.keys(e.vulns)).toEqual(['gireumteul']);
    placeUnitForTest(s, 'gireumteul', 3); for (let i = 0; i < 30; i++) step(s, []);
    expect(Object.keys(e.vulns)).toEqual(['gireumteul']); expect(vulnOf(s, e, 'physical')).toBeCloseTo(0.3);

    const b = createGame(d3, 1); placeUnitForTest(b, 'buk', 2); placeUnitForTest(b, 'jejuyeonggam', 1);
    const be = spawnEnemyForTest(b, 'japgwi', 3);
    expect([vulnOf(b, be, 'physical'), vulnOf(b, be, 'magical')]).toEqual([0.15, 0]);
  });

  test('a weaker, shorter hit on the same vuln key keeps the stronger pct and the longer time', () => {
    const s = quiet3(firstEvery(['gireumteul'])); placeUnitForTest(s, 'gireumteul', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 1e7); step(s, []);
    expect(e.vulns.gireumteul).toMatchObject({ pct: 0.3, stacks: 1 });
    expect(e.vulns.gireumteul!.ticks).toBeGreaterThan(11 * TICKS_PER_SECOND);
    s.slots[2] = null; placeUnitForTest(s, 'cheonnyeonmaetbangseok', 3);
    for (let i = 0; i < 30; i++) step(s, []);
    expect(e.vulns.gireumteul!.pct).toBe(0.3);
    expect(e.vulns.gireumteul!.ticks).toBeGreaterThan(3 * TICKS_PER_SECOND);
  });

  test('stacking vuln on a shared key still stacks to its cap at its own pct', () => {
    const s = quiet3(); placeUnitForTest(s, 'cheonnyeonjing', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 1e8);
    for (let i = 0; i < 400; i++) step(s, []);
    expect(e.vulns.moru).toMatchObject({ pct: 0.04, stacks: 5 });
  });

  test('area stun reaches 1.25 around the hit', () => {
    const s = quiet3(firstEvery(['soemangchi'])); placeUnitForTest(s, 'soemangchi', 2);
    spawnEnemyForTest(s, 'japgwi', 3, 1e6); const near = spawnEnemyForTest(s, 'japgwi', 4, 1e6); const far = spawnEnemyForTest(s, 'japgwi', 5, 1e6);
    step(s, []);
    expect([near.stunTicks > 0, far.stunTicks]).toEqual([true, 0]);
  });

  test('periodic all-in-range applies its statuses to every target', () => {
    const s = quiet3(); placeUnitForTest(s, 'meok', 2);
    const a = spawnEnemyForTest(s, 'japgwi', 3, 1e6); const b = spawnEnemyForTest(s, 'japgwi', 3.5, 1e6);
    step(s, []); expect([a.slow?.pct, b.slow?.pct]).toEqual([0.2, 0.2]);
  });
});
