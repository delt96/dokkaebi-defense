import { describe, expect, test } from 'vitest';
import { GRADE_COLOR, STORAGE_BOX, cellCorner, cellPx, computeZoom, laneToStage, stageToCell } from '../src/layout';
import { createGame, createLane, laneOf, loadGameData } from '@dorandi/logic';
import { placeUnitForTest, spawnEnemyForTest } from '@dorandi/logic/testing';
import { GameDriver, ticksToRun } from '../src/driver';

describe('client helpers', () => {
  test('zoom: integer from 2x, a 1.5 step below', () => {
    expect(computeZoom(1280, 720)).toBe(2); expect(computeZoom(1920, 1080)).toBe(3);
    expect(computeZoom(1000, 700)).toBe(1.5); expect(computeZoom(900, 500)).toBe(1); expect(computeZoom(300, 200)).toBe(1);
  });
  test('lane to stage and back', () => {
    expect(laneToStage({ x: 0.5, y: 0.5 })).toEqual({ x: 248, y: 130 });
    const six = createLane(6, 4);
    expect(stageToCell(six, 248, 130)).toBe(0);
    expect(stageToCell(six, 232 + 32 * 5 + 1, 114 + 32 * 3 + 1)).toBe(23);
    expect(stageToCell(six, 10, 10)).toBeNull();
  });
  test('stage 3 draws the same 6 x 4 board of 32px cells as stage 1, clear of the storage column', () => {
    const lane = laneOf({ data: loadGameData('stage3') });
    expect([lane.cols, lane.rows, cellPx(lane)]).toEqual([6, 4, 32]);
    expect(cellCorner(lane, 0)).toEqual({ x: 232 - 128, y: 114 - 24 });
    expect(cellCorner(lane, 23)).toEqual({ x: 232 + 5 * 32 - 128, y: 114 + 3 * 32 - 24 });
    expect(stageToCell(lane, 232 + 32 * 3 + 1, 114 + 32 + 1)).toBe(9);
    expect(stageToCell(lane, 232 + 32 * 6 + 1, 130)).toBeNull();
    expect(STORAGE_BOX.x + STORAGE_BOX.w).toBeLessThanOrEqual(232 - 32 / 2);
    expect(laneToStage(lane.pointAt(0))).toEqual(laneToStage(createLane(6, 4).pointAt(0)));
  });
  test('grade colours cover grades 1 to 6, matching the sprite flames', () => {
    expect(GRADE_COLOR[5]).toBe('#ff4a3a');
    expect(GRADE_COLOR[6]).toBe('#ffe35a');
  });
  test('fixed step with carry and cap', () => {
    expect(ticksToRun(120, 0)).toEqual({ ticks: 2, carryMs: 20 });
    expect(ticksToRun(40, 20)).toEqual({ ticks: 1, carryMs: 10 });
    expect(ticksToRun(60_000, 0)).toEqual({ ticks: 40, carryMs: 0 });
  });
});

import { stagePlacement } from '../src/layout';
import { onAction } from '../src/ui/dom';

describe('final review fixes: placement and press handling', () => {
  test('stage is centred, with a 1.5 step between 1x and 2x', () => {
    expect(stagePlacement(1280, 720)).toEqual({ zoom: 2, left: 0, top: 0 });
    expect(stagePlacement(1536, 700)).toEqual({ zoom: 1.5, left: 288, top: 80 });
    expect(stagePlacement(1920, 1000)).toEqual({ zoom: 2, left: 320, top: 140 });
    expect(stagePlacement(900, 500)).toEqual({ zoom: 1, left: 130, top: 70 });
    expect(stagePlacement(500, 300)).toEqual({ zoom: 1, left: 0, top: 0 });
  });
  test('actions fire on press, so a re-render before release cannot swallow them', () => {
    const listeners: Record<string, (ev: unknown) => void> = {};
    const button = { dataset: { action: 'summon', arg: '' }, hasAttribute: () => false, closest: () => button };
    const node = { addEventListener: (t: string, f: (ev: unknown) => void) => { listeners[t] = f; }, contains: () => true };
    const got: string[] = [];
    onAction(node as never, a => got.push(a));
    listeners.pointerdown?.({ target: button, button: 0 });
    listeners.click?.({ target: button, detail: 1 });
    listeners.pointerdown?.({ target: button, button: 2 });
    expect(got).toEqual(['summon']);
    listeners.click?.({ target: button, detail: 0 });
    expect(got).toEqual(['summon', 'summon']);
  });
});

test('movement interpolates the last fixed step through a lap boundary and freezes on pause', () => {
  const state = createGame(loadGameData(), 1);
  const enemy = spawnEnemyForTest(state, 'japgwi', 23.9);
  const driver = new GameDriver(state);
  driver.update(125);
  expect(enemy.d).toBeCloseTo(24.06);
  expect(driver.enemyDistance(enemy.id, enemy.d)).toBeCloseTo(24.02);
  driver.paused = true;
  driver.update(20);
  expect(driver.enemyDistance(enemy.id, enemy.d)).toBeCloseTo(24.02);
});

test('paused commands are dropped and a restarted game runs immediately', () => {
  const state = createGame(loadGameData(), 1);
  const driver = new GameDriver(state);
  driver.paused = true;
  driver.queue({ type: 'summon' });
  driver.paused = false;
  driver.update(50);
  expect(state.slots.every(unit => unit === null)).toBe(true);
  driver.paused = true;
  driver.reset(createGame(state.data, 2));
  driver.update(50);
  expect(driver.state.tick).toBe(1);
});

test('a sale pressed before a queued swap finishes still sells the picked unit', () => {
  const state = createGame(loadGameData(), 1);
  placeUnitForTest(state, 'sotlid', 0);
  const other = placeUnitForTest(state, 'sotlid', 1);
  const driver = new GameDriver(state);
  driver.queue({ type: 'move', from: 0, to: 1 });
  driver.queue({ type: 'sell', slot: 0 });
  driver.update(100);
  expect(state.slots[0]?.id).toBe(other.id);
  expect(state.slots[1]).toBeNull();
  expect(state.coins).toBe(5);
});

test('solo speed runs two or three steps per real step and cycles 1, 2, 3', () => {
  const state = createGame(loadGameData(), 1);
  const driver = new GameDriver(state);
  expect(driver.speed).toBe(1);
  driver.update(100);
  expect(state.tick).toBe(2);
  driver.speed = 2;
  driver.update(100);
  expect(state.tick).toBe(6);
  driver.speed = 3;
  driver.update(100);
  expect(state.tick).toBe(12);
});
