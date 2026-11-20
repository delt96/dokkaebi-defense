import { describe, expect, test } from 'vitest';
import { computeZoom, laneToStage, stageToCell } from '../src/layout';
import { ticksToRun } from '../src/driver';

describe('client helpers', () => {
  test('integer zoom', () => {
    expect(computeZoom(1280, 720)).toBe(2); expect(computeZoom(1920, 1080)).toBe(3);
    expect(computeZoom(1000, 700)).toBe(1); expect(computeZoom(300, 200)).toBe(1);
  });
  test('lane to stage and back', () => {
    expect(laneToStage({ x: 0.5, y: 0.5 })).toEqual({ x: 248, y: 130 });
    expect(stageToCell(248, 130)).toBe(0);
    expect(stageToCell(232 + 32 * 5 + 1, 114 + 32 * 3 + 1)).toBe(23);
    expect(stageToCell(10, 10)).toBeNull();
  });
  test('fixed step with carry and cap', () => {
    expect(ticksToRun(120, 0)).toEqual({ ticks: 2, carryMs: 20 });
    expect(ticksToRun(40, 20)).toEqual({ ticks: 1, carryMs: 10 });
    expect(ticksToRun(60_000, 0)).toEqual({ ticks: 40, carryMs: 0 });
  });
});
