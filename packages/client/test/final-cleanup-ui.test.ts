// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, type GameState, type RoundStats } from '@dorandi/logic';
import { forceRound, spawnEnemyForTest } from '@dorandi/logic/testing';
import { hudModel } from '../src/ui/models';
import { resultHtml } from '../src/ui/result';
import { soloLogBody } from '../src/soloLog';

const d3 = loadGameData('stage3');
const stat = (round: number, endEnemies: number): RoundStats =>
  ({ round, hpSpawned: 0, damageDealt: 0, damageInRound: 0, maxEnemies: endEnemies + 10, endEnemies, bossKillSeconds: null });

function cleared(opts: { cleanupFrom?: number; helperCombines?: number; last: number }): GameState {
  const s = createGame(d3, 1, 'hard');
  s.phase = 'ended';
  s.result = { outcome: 'clear', reason: null, round: 70 };
  s.stats = Array.from({ length: 70 }, (_, i) => stat(i + 1, i === 69 ? opts.last : 20));
  if (opts.cleanupFrom !== undefined) s.cleanupFrom = opts.cleanupFrom;
  if (opts.helperCombines !== undefined) s.helperCombines = opts.helperCombines;
  return s;
}

const textOf = (html: string) => { const box = document.createElement('div'); box.innerHTML = html; return box.textContent ?? ''; };

describe('cleanup after the final boss on screen', () => {
  test('the boss spot of the top bar reads 보스 처치 · 남은 잡귀 정리 during cleanup', () => {
    const s = createGame(d3, 1, 'hard');
    forceRound(s, 70);
    s.enemies = [];
    for (let i = 0; i < 5; i++) spawnEnemyForTest(s, 'japgwi', 0);
    expect(hudModel(s).bossText).toBeNull();
    s.cleanupFrom = 5;
    const m = hudModel(s);
    expect([m.bossText, m.bossTitle]).toEqual(['보스 처치 · 남은 잡귀 정리', '보스 처치 · 남은 잡귀 정리']);
  });

  test('the result puts the count when the boss fell beside the last count', () => {
    const text = textOf(resultHtml(cleared({ cleanupFrom: 24, helperCombines: 37, last: 3 }), null));
    expect(text).toContain('마지막 3마리 (보스 잡을 때 24마리) · 가장 많았을 때');
    expect(text).toContain('도우미로 조합 37회');
  });

  test('without a cleanup the last count has no bracket, and no list combine reads 0', () => {
    const text = textOf(resultHtml(cleared({ last: 7 }), null));
    expect(text).toContain('마지막 7마리 · 가장 많았을 때');
    expect(text).not.toContain('보스 잡을 때');
    expect(text).toContain('도우미로 조합 0회');
  });

  test('the solo play log summary carries both counts', () => {
    const body = soloLogBody(cleared({ cleanupFrom: 24, helperCombines: 37, last: 3 }), 1, 'hard', 'stage3', []);
    expect(body.summary).toMatchObject({ bossKillEnemies: 24, helperCombines: 37 });
    const plain = soloLogBody(cleared({ last: 7 }), 1, 'hard', 'stage3', []);
    expect('bossKillEnemies' in plain.summary).toBe(false);
    expect(plain.summary.helperCombines).toBe(0);
  });

});
