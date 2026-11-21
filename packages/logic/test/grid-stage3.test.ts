import { describe, expect, test } from 'vitest';
import { cellDistance, createGame, laneOf, loadGameData, slotsOpenedAt, step, unitDef } from '../src/index';
import { chooseSlot } from '../src/units';
import { forceRound, makeData, placeUnitForTest, spawnEnemyForTest } from '../src/testing';
import type { GameData } from '../src/types';

const d3 = loadGameData('stage3');
const old3 = makeData(d => { d.balance.grid = { cols: 6, rows: 4, initialOpenRows: 3 }; }, 'stage3');

function lapTicks(data: GameData): number {
  const s = createGame(data, 1);
  forceRound(s, 1);
  s.enemies = [];
  const e = spawnEnemyForTest(s, 'japgwi', 0, 1e9);
  let ticks = 0;
  while (e.d < laneOf(s).perimeter) { step(s, []); ticks++; }
  return ticks;
}

describe('stage 3 board, 8 x 5 inside the 6 x 4 path', () => {
  test('a lap takes as many ticks as on the old 6 x 4 board', () => {
    expect(laneOf({ data: d3 }).perimeter).toBe(24);
    expect(lapTicks(d3)).toBe(lapTicks(old3));
    expect(lapTicks(d3)).toBeGreaterThan(100);
  });
  test('cells are 0.75 path units, centred, and stay inside the path', () => {
    const lane = laneOf({ data: d3 });
    expect([lane.cols, lane.rows, lane.cells.length, lane.pitch]).toEqual([8, 5, 40, 0.75]);
    expect(lane.cells[0]).toMatchObject({ x: 0.375, y: 0.5, isEdge: true });
    expect(lane.cells[39]).toMatchObject({ x: 5.625, y: 3.5, isEdge: true });
    expect(lane.pointAt(7)).toEqual({ x: 6.5, y: -0.5 });
    expect(lane.cells.filter(c => !c.isEdge).length).toBe(18);
  });
  test('stage 3 starts with 24 open cells and the slots upgrade opens the last 16, 4 a level', () => {
    const s = createGame(d3, 1);
    expect(s.slots.length).toBe(40);
    expect(s.open.filter(Boolean).length).toBe(24);
    expect([0, 1, 2, 3].map(l => slotsOpenedAt(d3, l))).toEqual([[24, 25, 26, 27], [28, 29, 30, 31], [32, 33, 34, 35], [36, 37, 38, 39]]);
    s.coins = 1000;
    for (let i = 0; i < 4; i++) expect(step(s, [{ type: 'upgrade', id: 'slots' }]).rejected).toEqual([]);
    expect(s.coins).toBe(1000 - 50 - 100 - 150 - 200);
    expect(s.open.every(Boolean)).toBe(true);
    expect(step(s, [{ type: 'upgrade', id: 'slots' }]).rejected[0]!.reason).toBe('maxed');
  });
  test.each(['stage1', 'stage2'] as const)('%s keeps 6 x 4: 18 open, the upgrade opens 6 more', stage => {
    const d = loadGameData(stage);
    const s = createGame(d, 1);
    expect([s.slots.length, s.open.filter(Boolean).length]).toEqual([24, 18]);
    expect(laneOf(s).pitch).toBe(1);
    s.coins = 1000;
    for (let i = 0; i < 3; i++) step(s, [{ type: 'upgrade', id: 'slots' }]);
    expect(s.open.every(Boolean)).toBe(true);
  });
  test('melee goes to the new edges first, ranged to the 6 x 3 inner block', () => {
    const s = createGame(d3, 1);
    const melee = d3.units.find(u => u.grade === 1 && u.range <= 2)!;
    const ranged = d3.units.find(u => u.grade === 1 && u.range > 2)!;
    expect(chooseSlot(s, unitDef(d3, melee.id))).toBe(0);
    expect(chooseSlot(s, unitDef(d3, ranged.id))).toBe(9);
    const inner = laneOf(s).cells.filter(c => !c.isEdge && s.open[c.index]).map(c => c.index);
    expect(inner).toEqual([9, 10, 11, 12, 13, 14, 17, 18, 19, 20, 21, 22]);
    for (const i of inner) placeUnitForTest(s, ranged.id, i);
    expect(chooseSlot(s, unitDef(d3, ranged.id))).toBe(0);
    for (let i = 0; i < 24; i++) if (!s.slots[i]) placeUnitForTest(s, melee.id, i);
    expect(chooseSlot(s, unitDef(d3, melee.id))).toBeNull();
  });
  test('auras count cells: 8 neighbours inside, 3 in a corner, none across the row end', () => {
    const lane = laneOf({ data: d3 });
    const r = d3.balance.auraRadius;
    const near = (i: number) => lane.cells.filter(c => c.index !== i && cellDistance(lane, i, c.index) <= r + 1e-9).map(c => c.index);
    expect(near(18)).toEqual([9, 10, 11, 17, 19, 25, 26, 27]);
    expect(near(0)).toEqual([1, 8, 9]);
    expect(near(7)).toEqual([6, 14, 15]);
    expect(near(8)).not.toContain(7);
    expect(near(39)).toEqual([30, 31, 38]);
  });
});
