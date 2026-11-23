import { describe, expect, test } from 'vitest';
import { cellDistance, createGame, createLane, dist, laneOf, loadGameData, step } from '../src/index';
import { forceRound, spawnEnemyForTest } from '../src/testing';
import type { GameData } from '../src/types';

const d3 = loadGameData('stage3');

function lapTicks(data: GameData): number {
  const s = createGame(data, 1);
  forceRound(s, 1);
  s.enemies = [];
  const e = spawnEnemyForTest(s, 'japgwi', 0, 1e9);
  let ticks = 0;
  while (e.d < laneOf(s).perimeter) { step(s, []); ticks++; }
  return ticks;
}

describe('every stage on the 6 x 4 board', () => {
  test.each(['stage1', 'stage2', 'stage3'] as const)('%s: 24 cells, all open from the start, no slots upgrade', stage => {
    const d = loadGameData(stage);
    const s = createGame(d, 1);
    expect([s.slots.length, s.open.filter(Boolean).length, laneOf(s).pitch, laneOf(s).perimeter]).toEqual([24, 24, 1, 24]);
    expect(d.upgrades.map(u => u.id)).toEqual(['physical', 'magical', 'polish']);
    s.coins = 1000;
    expect(step(s, [{ type: 'upgrade', id: 'slots' as never }]).rejected[0]!.reason).toBe('unknown');
    expect(s.coins).toBe(1000);
  });
  test('a japgwi lap takes 301 ticks in stage 3, the same as stage 1', () => {
    expect(lapTicks(d3)).toBe(301);
    expect(lapTicks(loadGameData())).toBe(301);
  });
  test('on a board that fills its frame, cell distance is the plain distance (auras unchanged)', () => {
    const lane = laneOf({ data: d3 });
    for (let a = 0; a < 24; a++) for (let b = 0; b < 24; b++) expect(cellDistance(lane, a, b)).toBeCloseTo(dist(lane.cells[a]!, lane.cells[b]!), 12);
    expect(lane.cells[7]).toMatchObject({ x: 1.5, y: 1.5 });
  });
  test('a lane given a frame keeps the frame path whatever its cell count', () => {
    expect(createLane(8, 5, { cols: 6, rows: 4 }).perimeter).toBe(createLane(6, 4).perimeter);
  });
});
