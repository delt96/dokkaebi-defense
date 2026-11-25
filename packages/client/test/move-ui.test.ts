// @vitest-environment happy-dom
import { unitDefFast } from '@dorandi/logic';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { GameDriver } from '../src/driver';
import { mountUi } from '../src/ui/mount';
import { renderBottom } from '../src/ui/panels';
import { key, STAGE_HTML } from './fixtures/net';
import { mockBoardState } from './fixtures/next-board';

type How = 'press' | 'again' | 'tap' | 'cancel';

class FakeScene {
  selectedId: number | null = null;
  moving = false;
  reduceEffects = false;
  onFrame?: () => void;
  private selectCb: ((slot: number | null, how?: How) => void) | null = null;
  onSelect(cb: (slot: number | null, how?: How) => void): void { this.selectCb = cb; }
  onEvents(): void {}
  setReduceEffects(on: boolean): void { this.reduceEffects = on; }
  select(slot: number | null, how?: How): void { this.selectCb?.(slot, how); }
}

const HWARO = 9;
const JANGDOK = 3;
const EMPTY = 20;

let driver: GameDriver;
let scene: FakeScene;
let queue: ReturnType<typeof vi.spyOn>;
const listeners: [string, EventListenerOrEventListenerObject][] = [];
const bottom = () => document.getElementById('bottom')!.textContent!.trim();
const moves = () => queue.mock.calls.map(c => c[0] as { type: string }).filter(c => c.type === 'move');
const slotOf = (id: number | null) => driver.state.slots.findIndex(u => u?.id === id);

beforeEach(() => {
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => {
    listeners.push([type, fn]);
    add(type, fn, o);
  });
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = STAGE_HTML;
  driver = new GameDriver(mockBoardState());
  queue = vi.spyOn(driver, 'queue');
  scene = new FakeScene();
  mountUi(driver, scene as never, {}, {});
});
afterEach(() => {
  for (const [type, fn] of listeners.splice(0)) window.removeEventListener(type, fn);
  vi.restoreAllMocks();
});

test('pressing the selected unit again, then an empty cell, moves it there', () => {
  scene.select(HWARO, 'press');
  scene.select(HWARO, 'again');
  expect(scene.moving).toBe(true);
  expect(bottom()).toBe('옮길 칸을 누르세요 · Esc 취소');
  scene.select(EMPTY, 'tap');
  expect(moves()).toEqual([{ type: 'move', from: HWARO, to: EMPTY }]);
  expect(scene.moving).toBe(false);
  expect(bottom()).not.toContain('옮길 칸');
});

test('M, then a unit, swaps with it', () => {
  scene.select(HWARO);
  key('KeyM');
  expect(scene.moving).toBe(true);
  scene.select(JANGDOK, 'tap');
  expect(moves()).toEqual([{ type: 'move', from: HWARO, to: JANGDOK }]);
  expect(scene.moving).toBe(false);
});

test('M with nothing selected does nothing; M again ends moving', () => {
  key('KeyM');
  expect(scene.moving).toBe(false);
  scene.select(HWARO);
  key('KeyM');
  key('KeyM');
  expect(scene.moving).toBe(false);
  expect(slotOf(scene.selectedId)).toBe(HWARO);
});

test('Esc first ends moving, then drops the selection', () => {
  scene.select(HWARO);
  key('KeyM');
  key('Escape');
  expect(scene.moving).toBe(false);
  expect(slotOf(scene.selectedId)).toBe(HWARO);
  key('Escape');
  expect(scene.selectedId).toBeNull();
});

test('a right click while moving ends moving only', () => {
  scene.select(HWARO);
  key('KeyM');
  scene.select(null, 'cancel');
  expect(scene.moving).toBe(false);
  expect(slotOf(scene.selectedId)).toBe(HWARO);
});

test('paused (P), a move is not sent and moving stays on', () => {
  scene.select(HWARO);
  key('KeyP');
  key('KeyM');
  scene.select(EMPTY, 'tap');
  expect(moves()).toEqual([]);
  expect(scene.moving).toBe(true);
});

test('selling the moving unit ends moving, and the next tap sends no move (review focus 1)', () => {
  scene.select(HWARO);
  key('KeyM');
  const grade = unitDefFast(driver.state.data, driver.state.slots[HWARO]!.defId).grade;
  key('KeyS');
  if (grade >= 3) key('KeyS');
  driver.update(driver.state.data.balance.tickMs);
  scene.onFrame?.();
  vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 1000);
  scene.onFrame?.();
  expect(driver.state.slots[HWARO]).toBeFalsy();
  expect(scene.moving).toBe(false);
  scene.select(EMPTY, 'tap');
  expect(moves()).toEqual([]);
});

test('online the line takes the place of the card while moving, and shows with the help line off', () => {
  const s = mockBoardState();
  renderBottom(s, HWARO, true, undefined, undefined, false, null, false);
  expect(document.querySelector('#bottom .unit-info')).not.toBeNull();
  renderBottom(s, HWARO, true, undefined, undefined, false, null, true);
  expect(bottom()).toBe('옮길 칸을 누르세요 · Esc 취소');
  renderBottom(s, HWARO, false, null, undefined, false, null, true);
  expect(bottom()).toBe('옮길 칸을 누르세요 · Esc 취소');
});
