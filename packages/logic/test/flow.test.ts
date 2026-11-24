import { describe, expect, test } from 'vitest';
import { createGame, step, loadGameData, countNormalEnemies } from '../src/index';
import { forceRound, spawnEnemyForTest } from '../src/testing';

const data = loadGameData();
const run = (s: ReturnType<typeof createGame>, n: number) => { for (let i = 0; i < n; i++) step(s, []); };

describe('flow', () => {
  test('initial state', () => {
    const s = createGame(data, 1);
    expect(s).toMatchObject({ tick: 0, phase: 'prep', tokens: 4, coins: 0, round: 0 });
    expect(s.open.filter(Boolean).length).toBe(24);
  });
  test('round 1 starts at tick 400 and spawns every 16 ticks', () => {
    const s = createGame(data, 1);
    run(s, 400); expect(s.phase).toBe('prep');
    run(s, 1); expect(s).toMatchObject({ phase: 'round', round: 1, tokens: 6 });
    expect(s.enemies.length).toBe(1); expect(s.enemies[0]!.hp).toBe(94);
    run(s, 16 * 29); expect(s.enemies.length).toBe(30);
    run(s, 16); expect(s.enemies.length).toBe(30);
  });
  test('enemy moves 1.6 cells per second', () => {
    const s = createGame(data, 1);
    run(s, 401 + 20);
    expect(s.enemies[0]!.d).toBeCloseTo(1.6 * 21 / 20, 5);
  });
  test('round end pays coins and starts next round on the same tick', () => {
    const s = createGame(data, 1);
    run(s, 1201);
    expect(s).toMatchObject({ round: 2, coins: 10, tokens: 8 });
  });
  test('limit defeat after 5 seconds over 60, timer resets', () => {
    const s = createGame(data, 1); forceRound(s, 1);
    s.enemies = [];
    for (let i = 0; i < 61; i++) spawnEnemyForTest(s, 'japgwi', 0, 10 ** 9);
    s.roundEndTick = 10 ** 9; s.spawned = 30;
    run(s, 50); s.enemies.pop(); run(s, 1); expect(s.overLimitTicks).toBe(0);
    spawnEnemyForTest(s, 'japgwi', 0, 10 ** 9);
    run(s, 99); expect(s.phase).not.toBe('ended');
    run(s, 1); expect(s.result).toEqual({ outcome: 'defeat', reason: 'limit', round: 1 });
    expect(s.stats.at(-1)!.endEnemies).toBe(61);
  });
  test('stage 3 from round 65: over the limit is a defeat at once, round 64 still counts 5 seconds', () => {
    const d3 = loadGameData('stage3');
    expect(d3.balance.limitInstantFromRound).toBe(65);
    for (const [round, endsAtOnce] of [[64, false], [65, true]] as const) {
      const s = createGame(d3, 1); forceRound(s, round);
      s.enemies = [];
      for (let i = 0; i < d3.balance.limit + 1; i++) spawnEnemyForTest(s, 'japgwi', 0, 10 ** 9);
      s.roundEndTick = 10 ** 9; s.spawned = d3.balance.spawnCount;
      run(s, 1);
      expect([round, s.result]).toEqual([round, endsAtOnce ? { outcome: 'defeat', reason: 'limit', round } : null]);
    }
  });
  test('boss round: spawn, tokens, fail after 75s', () => {
    const s = createGame(data, 1); forceRound(s, 10);
    const tokens = s.tokens;
    run(s, 1);
    expect(s.enemies.find(e => e.boss)!.hp).toBe(5000);
    run(s, 1499); expect(s.phase).not.toBe('ended');
    run(s, 1); expect(s.result).toEqual({ outcome: 'defeat', reason: 'boss', round: 10 });
    expect(tokens).toBe(6);
  });
  test('after end, commands are rejected and time stops', () => {
    const s = createGame(data, 1); forceRound(s, 10); run(s, 1501);
    const t = s.tick;
    const r = step(s, [{ type: 'summon' }]);
    expect(r.rejected[0]!.reason).toBe('ended'); expect(s.tick).toBe(t);
  });
  test('stats track spawned hp and max enemies', () => {
    const s = createGame(data, 1); run(s, 1201);
    expect(s.stats[0]).toMatchObject({ round: 1, hpSpawned: 94 * 30, maxEnemies: 30, endEnemies: 30 });
    expect(countNormalEnemies(s)).toBeGreaterThanOrEqual(30);
  });
});
