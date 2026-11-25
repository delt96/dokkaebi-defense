import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, type GameState } from '@dorandi/logic';
import { forceRound, placeUnitForTest, spawnEnemyForTest } from '@dorandi/logic/testing';
import { boardFirepower, firepowerMarkdown, firepowerRun, measureBoard, roundNeed, roundPlay } from '../src/stage3/firepower';
import { STANDARD_CONFIGS } from '../src/stage3/econRun';

const d3 = loadGameData('stage3');

function board(round: number, units: string[]): GameState {
  const s = createGame(d3, 1);
  forceRound(s, round);
  units.forEach((id, i) => placeUnitForTest(s, id, i));
  return s;
}

describe('round need', () => {
  test('is the HP of the 30 spawns in pattern order over the round time, NaN on a boss round', () => {
    // round 21 japgwi: round(63.75 + 13.6 * 21^1.5) = 1373
    expect(roundNeed(d3, 21)).toBeCloseTo((30 * 1373) / 34, 6);
    // round 59 japgwi, geuseundae, dueoksini in turn: 6227, 6227, round(6227.15 * 1.5) = 9341
    expect(roundNeed(d3, 59)).toBeCloseTo((10 * (6227 + 6227 + 9341)) / 34, 6);
    expect(roundNeed(d3, 21, ['dueoksini'])).toBeCloseTo((30 * 2059) / 34, 6);
    expect(roundNeed(d3, 20)).toBeNaN();
  });
});

describe('board firepower', () => {
  test('an empty board deals nothing, units add firepower, and the snapshot is left as it was', () => {
    const s = board(21, []);
    expect(boardFirepower(s, 21)).toBe(0);
    placeUnitForTest(s, 'top', 0);
    const one = boardFirepower(s, 21);
    expect(one).toBeGreaterThan(0);
    expect(boardFirepower(s, 21)).toBe(one);
    placeUnitForTest(s, 'kkeul', 1);
    expect(boardFirepower(s, 21)).toBeGreaterThan(one);
    expect([s.round, s.enemies.length, s.slots.filter(Boolean).length]).toEqual([21, 0, 2]);
  });

  test('measures the round it is asked for, whatever round the snapshot is in', () => {
    // a magical board against round 15 dueoksini (magical resist 0.5) deals half of what it deals to round 14 japgwi
    const s = board(14, ['che', 'che']);
    expect(boardFirepower(s, 15) / boardFirepower(s, 14)).toBeCloseTo(0.5, 1);
    expect(boardFirepower(s, 15)).toBe(boardFirepower(board(15, ['che', 'che']), 15));
  });

  test('stands the whole pattern of a mixed round, or the enemies it is given', () => {
    const s = board(59, ['dunggumi', 'dunggumi']);
    const japgwi = boardFirepower(s, 59, ['japgwi']);
    const geuseundae = boardFirepower(s, 59, ['geuseundae']);
    const mixed = boardFirepower(s, 59);
    expect(geuseundae).toBeLessThan(japgwi);
    expect(mixed).toBeLessThan(japgwi);
    expect(mixed).toBeGreaterThan(geuseundae);
  });
});

describe('measure board', () => {
  test('names the normal enemy the board is weakest against', () => {
    const physical = measureBoard(board(41, ['dunggumi', 'dunggumi']), 41);
    expect(physical.weakestEnemy).toBe('geuseundae');
    expect(physical.weakest).toBeLessThan(physical.ratio);
    expect(measureBoard(board(41, ['che', 'che']), 41).weakestEnemy).toBe('dueoksini');
  });
});

describe('round play', () => {
  test('an empty board leaves every spawn of the round alive', () => {
    const s = board(21, []);
    expect(roundPlay(s, 21)).toEqual({ left: 30, peak: 30, hpLeftPct: 100 });
    expect([s.round, s.enemies.length]).toEqual([21, 0]);
  });

  test('a strong board clears round 1', () => {
    const r = roundPlay(board(1, ['dunggumi', 'dunggumi', 'dunggumi', 'dunggumi']), 1);
    expect([r.left, r.hpLeftPct]).toEqual([0, 0]);
    expect(r.peak).toBeGreaterThan(0);
  });

  test('leaves out enemies carried over from the round before', () => {
    const s = board(20, []);
    spawnEnemyForTest(s, 'japgwi', 3);
    expect(roundPlay(s, 21).left).toBe(30);
  });
});

describe('firepower run', () => {
  test('measures every live seat at the asked rounds and the markdown reports ratios, leftovers and the ratio bands', () => {
    const c = STANDARD_CONFIGS.find(x => x.name === 'switch-full-q2')!;
    const rows = firepowerRun(d3, 1, c, [5, 11]);
    expect(rows.map(r => r.round)).toEqual([...Array(6).fill(5), ...Array(6).fill(11)]);
    for (const r of rows) {
      expect(r.ratio).toBeCloseTo(r.firepower / r.need);
      expect(r.weakest).toBeLessThanOrEqual(r.ratio + 1e-9);
      expect(r.left).toBeGreaterThanOrEqual(0);
    }
    const md = firepowerMarkdown(rows);
    expect(md).toContain('switch-full-q2');
    expect(md).toContain('| 배수 구간 |');
  }, 120_000);
});
