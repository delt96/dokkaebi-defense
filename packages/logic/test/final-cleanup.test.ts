import { describe, expect, test } from 'vitest';
import { createGame, huntCheck, loadGameData, step, type GameEvent, type GameState } from '../src/index';
import { forceRound, spawnEnemyForTest } from '../src/testing';

const d3 = loadGameData('stage3');
const d1 = loadGameData('stage1');

/** The last round with its boss spawned and `normals` lane enemies that nothing on the board can kill. */
function finalRound(normals: number, data = d3, difficulty: 'hard' | undefined = 'hard'): GameState {
  const s = createGame(data, 1, difficulty);
  forceRound(s, s.data.balance.rounds);
  step(s, []);
  for (let i = 0; i < normals; i++) spawnEnemyForTest(s, 'japgwi', 1 + i * 0.3, 1e9);
  return s;
}

function killBoss(s: GameState): GameEvent[] {
  s.enemies.find(e => e.boss)!.hp = 0;
  return step(s, []).events;
}

describe('cleanup after the final boss', () => {
  test('killing the final boss starts cleanup instead of ending', () => {
    const s = finalRound(5);
    const events = killBoss(s);
    expect(s.phase).not.toBe('ended');
    expect(s.cleanupFrom).toBe(5);
    expect(events.filter(e => e.type === 'cleanupStart')).toEqual([{ type: 'cleanupStart', enemies: 5 }]);
  });

  test('cleanup ends as a clear when the boss round time runs out', () => {
    const s = finalRound(5);
    killBoss(s);
    while (s.phase !== 'ended' && s.tick <= s.roundEndTick + 1) step(s, []);
    expect(s.result).toEqual({ outcome: 'clear', reason: null, round: 70 });
    expect(s.tick).toBeGreaterThanOrEqual(s.roundEndTick);
  });

  test('cleanup ends as soon as no normal enemy is left', () => {
    const s = finalRound(3);
    killBoss(s);
    for (const e of s.enemies) e.hp = 0;
    step(s, []);
    expect(s.phase).toBe('ended');
    expect(s.result).toEqual({ outcome: 'clear', reason: null, round: 70 });
    expect(s.tick).toBeLessThan(s.roundEndTick);
  });

  test('an empty lane when the boss falls ends the game on that tick', () => {
    const s = finalRound(0);
    killBoss(s);
    expect(s.phase).toBe('ended');
    expect(s.result?.outcome).toBe('clear');
    expect(s.cleanupFrom).toBe(0);
  });

  test('no hunt summon during cleanup', () => {
    const s = finalRound(2);
    const enemy = d3.economy!.hunts!.targets[0]!.enemy;
    s.coins = 10_000;
    killBoss(s);
    expect(huntCheck(s, enemy)).toBe('huntClosed');
    expect(step(s, [{ type: 'hunt', enemy }]).rejected[0]?.reason).toBe('huntClosed');
  });

  test('stage 1 still ends the moment the final boss dies', () => {
    const s = finalRound(4, d1, undefined);
    killBoss(s);
    expect(s.phase).toBe('ended');
    expect(s.result?.outcome).toBe('clear');
    expect('cleanupFrom' in s).toBe(false);
  });
});
