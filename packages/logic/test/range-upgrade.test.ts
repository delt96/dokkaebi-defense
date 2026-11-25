import { describe, expect, test } from 'vitest';
import { createGame, laneOf, loadGameData, parseClientCommand, pickTarget, step, unitDefFast, unitRange } from '../src/index';
import { placeUnitForTest, spawnEnemyForTest } from '../src/testing';

const d3 = loadGameData('stage3');
const def = d3.upgrades.find(u => u.id === 'range')!;

/** A path distance whose point is `dist` cells from cell `slot`, found by walking the path. */
function pathAt(s: ReturnType<typeof createGame>, slot: number, want: number): number {
  const lane = laneOf(s);
  const cell = lane.cells[slot]!;
  let best = 0;
  let bestGap = Infinity;
  for (let k = 0; k < 2400; k++) {
    const d = (k * lane.perimeter) / 2400;
    const p = lane.pointAt(d);
    const gap = Math.abs(Math.hypot(p.x - cell.x, p.y - cell.y) - want);
    if (gap < bestGap) { best = d; bestGap = gap; }
  }
  return best;
}

describe('range upgrade (stage 3)', () => {
  test('stage 3 sells one level of +0.5 range; stages 1 and 2 do not have it', () => {
    expect(def).toMatchObject({ id: 'range', max: 1, amount: 0.5 });
    expect(loadGameData('stage1').upgrades.some(u => u.id === 'range')).toBe(false);
    expect(loadGameData('stage2').upgrades.some(u => u.id === 'range')).toBe(false);
  });

  test('buying it once costs its price, a second buy is refused', () => {
    const s = createGame(d3, 1);
    s.coins = def.costPerLevel * 2;
    step(s, [{ type: 'upgrade', id: 'range' }]);
    expect(s.upgrades.range).toBe(1);
    expect(s.coins).toBe(def.costPerLevel);
    step(s, [{ type: 'upgrade', id: 'range' }]);
    expect(s.upgrades.range).toBe(1);
    expect(s.coins).toBe(def.costPerLevel);
  });

  test('every unit reaches 0.5 further after it', () => {
    const s = createGame(d3, 1);
    placeUnitForTest(s, 'gireumteul', 2);
    const u = unitDefFast(d3, 'gireumteul');
    expect(unitRange(s, u)).toBe(u.range);
    const e = spawnEnemyForTest(s, 'japgwi', pathAt(s, 2, u.range + 0.3));
    expect(pickTarget(s, 2)).toBeNull();
    s.upgrades.range = 1;
    expect(unitRange(s, u)).toBe(u.range + 0.5);
    expect(pickTarget(s, 2)!.id).toBe(e.id);
  });

  test('a match command can name it', () => {
    expect(parseClientCommand({ seq: 1, type: 'upgrade', args: { id: 'range' } })).toEqual({ seq: 1, cmd: { type: 'upgrade', id: 'range' } });
  });
});
