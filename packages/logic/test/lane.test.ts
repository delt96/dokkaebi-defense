import { describe, expect, test } from 'vitest';
import { createLane, loopPos } from '../src/lane';

const lane = createLane(6, 4);

describe('lane', () => {
  test('path points', () => {
    expect(lane.perimeter).toBe(24);
    expect(lane.pointAt(0)).toEqual({ x: -0.5, y: -0.5 });
    expect(lane.pointAt(3.5)).toEqual({ x: 3, y: -0.5 });
    expect(lane.pointAt(7)).toEqual({ x: 6.5, y: -0.5 });
    expect(lane.pointAt(12)).toEqual({ x: 6.5, y: 4.5 });
    expect(lane.pointAt(19)).toEqual({ x: -0.5, y: 4.5 });
    expect(lane.pointAt(24)).toEqual(lane.pointAt(0));
    expect(lane.pointAt(30)).toEqual(lane.pointAt(6));
    expect(loopPos(-1, 24)).toBe(23);
  });
  test('cells', () => {
    expect(lane.cells.length).toBe(24);
    expect(lane.cells[0]).toMatchObject({ x: 0.5, y: 0.5, isEdge: true });
    expect(lane.cells.filter(c => !c.isEdge).map(c => c.index)).toEqual([7, 8, 9, 10, 13, 14, 15, 16]);
  });
  test('coverage matches spec table', () => {
    expect(lane.coverageLength(2, 1.5)).toBeCloseTo(2.236, 2);
    expect(lane.coverageLength(2, 2.0)).toBeCloseTo(3.464, 2);
    expect(lane.coverageLength(2, 3.0)).toBeCloseTo(5.657, 2);
    expect(lane.coverageLength(8, 2.0)).toBeCloseTo(0, 5);
    expect(lane.coverageLength(8, 2.5)).toBeCloseTo(3.0, 2);
    expect(lane.coverageLength(8, 3.0)).toBeCloseTo(4.472, 2);
  });
  test('coverage interval position', () => {
    const [iv] = lane.coverage(2, 1.5);
    expect(iv![0]).toBeCloseTo(3 - 1.118, 2);
    expect(iv![1]).toBeCloseTo(3 + 1.118, 2);
  });
});
