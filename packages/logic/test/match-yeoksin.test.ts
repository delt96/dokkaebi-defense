import { describe, expect, test } from 'vitest';
import { createMatch, loadGameData, pickTarget, stepMatch, type MatchState, type StepMatchResult } from '../src/index';
import { jumpToTick, placeUnitForTest, spawnEnemyForTest, stepMatchUntil } from '../src/testing';

const data = loadGameData('stage2');
const Y1 = data.coop!.yeoksin[0]!;
const fill = (m: MatchState, seat: number, n: number) => { for (let i = 0; i < n; i++) spawnEnemyForTest(m.lanes[seat]!, 'japgwi', 0, 1e9); };
const hitsOn = (r: StepMatchResult, id: number) => Object.entries(r.lanes).filter(([, l]) => l.events.some(e => e.type === 'damage' && e.enemyId === id)).map(([s]) => Number(s));
const atStage1 = (seats: number[]) => { const m = createMatch(data, 1, seats); jumpToTick(m, 4600); stepMatch(m, []); return m; };

describe('yeoksin', () => {
  test('max hp grows 10% per extra starter and does not change after eliminations', () => {
    for (const n of [1, 2, 6]) {
      const m = atStage1(Array.from({ length: n }, (_, i) => i + 1));
      const hp = Math.round(Y1.baseHp * (1 + 0.1 * (n - 1)));
      expect(m.yeoksin!.enemy).toMatchObject({ id: -1, hp, maxHp: hp });
      if (n === 6) {
        expect(hp).toBe(Math.round(Y1.baseHp * 1.5));
        stepMatch(m, [{ seat: 2, seq: 1, cmd: { type: 'forfeit' } }, { seat: 3, seq: 1, cmd: { type: 'forfeit' } }]);
        expect(m.yeoksin!.enemy).toMatchObject({ hp, maxHp: hp });
      }
    }
  });
  test('enters the first ring seat at round 6, the second at round 15, the only one for 1 player', () => {
    const m = createMatch(data, 1, [2, 4, 5]); jumpToTick(m, 4600);
    const r = stepMatch(m, []);
    expect(m.yeoksin).toMatchObject({ stage: 1, seat: 2, enterTick: 4600 });
    expect(m.lanes[2]!.enemies.some(e => e.id === -1)).toBe(true);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'yeoksinEnter', stage: 1, seat: 2, from: null, enterTick: 4600 }));
    const n = createMatch(data, 1, [2, 4, 5]); jumpToTick(n, 12500); stepMatch(n, []);
    expect(n.yeoksin).toMatchObject({ stage: 2, seat: 4, enemy: { id: -2 } });
    const one = createMatch(data, 1, [3]); jumpToTick(one, 12500); stepMatch(one, []);
    expect(one.yeoksin).toMatchObject({ stage: 2, seat: 3 });
  });
  test('start seat already eliminated: next alive seat', () => {
    const m = createMatch(data, 1, [1, 2, 3]); jumpToTick(m, 4599);
    stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'forfeit' } }]); stepMatch(m, []);
    expect(m.yeoksin!.seat).toBe(2);
  });
  test('stays 240 ticks: d follows the formula; hit only in lane 1 at T+239 and only in lane 2 at T+240', () => {
    const m = atStage1([1, 2]);
    expect(m.yeoksin!.enemy.d).toBeCloseTo(0.1, 9);
    m.yeoksin!.enemy.hp = m.yeoksin!.enemy.maxHp = 1e9;
    for (const s of [1, 2]) for (const slot of [0, 1]) placeUnitForTest(m.lanes[s]!, 'horong', slot);
    const fire = () => { for (const s of [1, 2]) for (const u of m.lanes[s]!.slots) if (u) u.cooldown = 0; };
    stepMatchUntil(m, 4839);
    fire(); const a = stepMatch(m, []);
    expect(m.yeoksin).toMatchObject({ seat: 1 }); expect(m.yeoksin!.enemy.d).toBeCloseTo(24, 6);
    expect(hitsOn(a, -1)).toEqual([1]);
    fire(); const b = stepMatch(m, []);
    expect(m.yeoksin).toMatchObject({ seat: 2, enterTick: 4840 });
    expect(hitsOn(b, -1)).toEqual([2]);
    expect(m.lanes[1]!.enemies.some(e => e.id === -1)).toBe(false);
  });
  test('wraps from the last seat to the first, skips spirits, a lone survivor loops to itself', () => {
    const m = atStage1([1, 3, 6]); m.yeoksin!.enemy.hp = 1e9;
    stepMatch(m, [{ seat: 3, seq: 1, cmd: { type: 'forfeit' } }]);
    stepMatchUntil(m, 4841); expect(m.yeoksin!.seat).toBe(6);
    stepMatchUntil(m, 5081); expect(m.yeoksin!.seat).toBe(1);
    stepMatch(m, [{ seat: 6, seq: 1, cmd: { type: 'forfeit' } }]);
    stepMatchUntil(m, 5321); expect(m.yeoksin).toMatchObject({ seat: 1, enterTick: 5320 });
  });
  test('owner forfeits: moves the same tick; owner limit-eliminated: moves the next tick', () => {
    const a = atStage1([1, 2]);
    stepMatch(a, [{ seat: 1, seq: 1, cmd: { type: 'forfeit' } }]);
    expect(a.yeoksin).toMatchObject({ seat: 2, enterTick: 4601 });
    const b = atStage1([1, 2]);
    fill(b, 1, 61); stepMatchUntil(b, 4700); stepMatch(b, []);
    expect(b.seats[1]!.alive).toBe(false); expect(b.yeoksin!.seat).toBe(1); expect(b.lanes[1]!.enemies).toEqual([]);
    stepMatch(b, []);
    expect(b.yeoksin).toMatchObject({ seat: 2, enterTick: 4701 });
  });
  test('leaving clears vulns, dots and fireHit, keeps hp; fires stay in the old lane', () => {
    const m = atStage1([1, 2]); const y = m.yeoksin!.enemy; y.hp = 5000;
    y.vulns.x = { pct: 0.1, damageType: 'all', ticks: 999, stacks: 1 };
    y.dots.x = { remaining: 50, pulsesLeft: 5, nextPulse: 1e9 }; y.fireHit.x = 4700;
    m.lanes[1]!.fires.push({ source: 'hwaro', from: 1, to: 2, basePerPulse: 1, nextPulse: 1e9, endTick: 1e9 });
    stepMatchUntil(m, 4841);
    expect(m.yeoksin!.seat).toBe(2);
    expect(y).toMatchObject({ hp: 5000, vulns: {}, dots: {}, fireHit: {} });
    expect(m.lanes[1]!.fires.length).toBe(1);
  });
  test('kill rewards: +15 coins +1 buckwheat to survivors, +10 to the top survivor contributor', () => {
    const m = atStage1([1, 2, 3]);
    m.seats[2]!.yeoksinDamage[0] = 500; m.seats[3]!.yeoksinDamage[0] = 900;
    stepMatch(m, [{ seat: 3, seq: 1, cmd: { type: 'forfeit' } }]);
    const coins = [1, 2].map(s => m.lanes[s]!.coins); const buck = [1, 2].map(s => m.lanes[s]!.buckwheat);
    m.yeoksin!.enemy.hp = 0;
    const r = stepMatch(m, []);
    expect(r.events).toContainEqual({ type: 'yeoksinKilled', stage: 1, seat: 1, topSeat: 2 });
    expect([1, 2].map(s => m.lanes[s]!.coins)).toEqual([coins[0]! + 15, coins[1]! + 25]);
    expect([1, 2].map(s => m.lanes[s]!.buckwheat)).toEqual([buck[0]! + 1, buck[1]! + 1]);
    expect(m.lanes[3]!.coins).toBe(0);
    expect([m.yeoksinKills, m.yeoksin]).toEqual([1, null]);
  });
  test('tie goes to the smaller seat; 1 player gets no bonus', () => {
    const m = atStage1([1, 2]); m.seats[1]!.yeoksinDamage[0] = 300; m.seats[2]!.yeoksinDamage[0] = 300;
    m.yeoksin!.enemy.hp = 0;
    expect(stepMatch(m, []).events).toContainEqual({ type: 'yeoksinKilled', stage: 1, seat: 1, topSeat: 1 });
    const one = atStage1([1]); const c = one.lanes[1]!.coins; one.yeoksin!.enemy.hp = 0;
    expect(stepMatch(one, []).events).toContainEqual({ type: 'yeoksinKilled', stage: 1, seat: 1, topSeat: null });
    expect(one.lanes[1]!.coins).toBe(c + 15);
  });
  test('damage credit is capped at the hp before each hit', () => {
    const m = atStage1([1, 2]);
    placeUnitForTest(m.lanes[1]!, 'horong', 0); m.yeoksin!.enemy.hp = 5;
    stepMatch(m, []);
    expect(m.seats[1]!.yeoksinDamage[0]).toBe(5); expect(m.yeoksinKills).toBe(1);
  });
  test('gate: alive at 7799 means gate; a kill on 7799 passes', () => {
    const a = createMatch(data, 1, [1], { noElimination: true }); jumpToTick(a, 4600);
    stepMatchUntil(a, 7800, { clearEnemies: true });
    expect(a.result).toMatchObject({ outcome: 'gate', tick: 7799, yeoksinKills: 0, seats: [{ seat: 1, outcome: 'aliveTeamLoss' }] });
    const b = createMatch(data, 1, [1], { noElimination: true }); jumpToTick(b, 4600);
    stepMatchUntil(b, 7799, { clearEnemies: true }); b.yeoksin!.enemy.hp = 0; stepMatch(b, []);
    expect(b.result).toBeNull(); expect(b.yeoksinKills).toBe(1);
  });
  test('gate and a limit elimination on the deadline tick: personal cause limit, team outcome gate', () => {
    const m = atStage1([1, 2]);
    stepMatchUntil(m, 7700, { clearEnemies: true }); fill(m, 1, 61);
    stepMatchUntil(m, 7800);
    expect(m.result).toMatchObject({ outcome: 'gate', tick: 7799 });
    expect(m.result!.seats).toEqual([expect.objectContaining({ seat: 1, outcome: 'eliminated', cause: 'limit' }), expect.objectContaining({ seat: 2, outcome: 'aliveTeamLoss' })]);
  });
  test('everyone out on the deadline tick: gate, not wipe', () => {
    const m = atStage1([1, 2]);
    stepMatchUntil(m, 7799, { clearEnemies: true });
    stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'forfeit' } }, { seat: 2, seq: 1, cmd: { type: 'forfeit' } }]);
    expect(m.result).toMatchObject({ outcome: 'gate', alive: 0 });
  });
  test('a held jinegaksi and the second mask in one lane: jinegaksi is targeted first', () => {
    const m = createMatch(data, 1, [1]); jumpToTick(m, 12500); stepMatch(m, []);
    const boss = spawnEnemyForTest(m.lanes[1]!, 'jinegaksi', m.yeoksin!.enemy.d, 1e9);
    placeUnitForTest(m.lanes[1]!, 'horong', 0);
    expect(pickTarget(m.lanes[1]!, 0)!.id).toBe(boss.id);
  });
});
