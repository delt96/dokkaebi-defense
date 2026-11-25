// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { mountUi } from '../src/ui/mount';
import { key, press, STAGE_HTML } from './fixtures/net';

class FakeScene {
  selectedId: number | null = null;
  onFrame?: () => void;
  select?: (slot: number | null) => void;
  onSelect(cb: (slot: number | null) => void): void { this.select = cb; }
  onEvents(): void {}
}

const details = () => document.querySelector('#win-left .unit-details');
const shownName = () => document.querySelector('#win-left .ud-name')?.textContent;

describe('Tab opens the unit details', () => {
  let scene: FakeScene;
  let driver: GameDriver;
  let clock = 1000;
  // each test mounts again; the keydown listeners of earlier mounts would still answer and redraw the shared page
  const listeners: [string, EventListenerOrEventListenerObject][] = [];
  beforeEach(() => {
    const add = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => {
      listeners.push([type, fn]);
      add(type, fn, o);
    });
    clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    document.body.innerHTML = STAGE_HTML;
    const s = createGame(loadGameData('stage3'), 1);
    forceRound(s, 3);
    driver = new GameDriver(s);
    scene = new FakeScene();
    mountUi(driver, scene as never);
  });
  afterEach(() => {
    for (const [type, fn] of listeners.splice(0)) window.removeEventListener(type, fn);
    vi.restoreAllMocks();
  });
  const frame = (): void => { clock += 150; scene.onFrame?.(); };

  test('Tab toggles 상세 for the selected unit in the left window; W still moves to the next unit', () => {
    const data = driver.state.data;
    const a = placeUnitForTest(driver.state, data.units.find(u => u.grade === 1)!.id, 0);
    const b = placeUnitForTest(driver.state, data.units.find(u => u.grade === 2)!.id, 1);
    key('Tab');
    expect(details()).toBeNull();
    scene.select!(0);
    key('Tab');
    expect(details()).not.toBeNull();
    expect(document.getElementById('modal')!.innerHTML).toBe('');
    expect(scene.selectedId).toBe(a.id);
    key('Tab');
    expect(details()).toBeNull();
    key('KeyW');
    expect(scene.selectedId).toBe(b.id);
    expect(details()).toBeNull();
  });

  test('상세 follows the selection and closes when it goes', () => {
    const data = driver.state.data;
    const ua = data.units.find(u => u.grade === 1)!;
    const ub = data.units.find(u => u.grade === 2)!;
    placeUnitForTest(driver.state, ua.id, 0);
    placeUnitForTest(driver.state, ub.id, 1);
    scene.select!(0);
    key('Tab');
    expect(shownName()).toBe(ua.name);
    scene.select!(1);
    expect(details()).not.toBeNull();
    expect(shownName()).toBe(ub.name);
    scene.select!(null);
    expect(details()).toBeNull();
  });

  test('with the focus on a window button Tab moves the focus, otherwise it closes 상세', () => {
    placeUnitForTest(driver.state, driver.state.data.units.find(u => u.grade === 1)!.id, 0);
    scene.select!(0);
    key('Tab');
    const close = document.querySelector<HTMLButtonElement>('#win-left .win-close')!;
    close.focus();
    const ev = new KeyboardEvent('keydown', { code: 'Tab', bubbles: true, cancelable: true });
    close.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(details()).not.toBeNull();
    close.blur();
    key('Tab');
    expect(details()).toBeNull();
  });

  test('a combine from 상세 keeps it open on the result', () => {
    const s = driver.state;
    const queue = vi.spyOn(driver, 'queue');
    placeUnitForTest(s, 'sotlid', 0);
    placeUnitForTest(s, 'bujigaengi', 1);
    scene.select!(0);
    key('Tab');
    const combine = document.querySelector<HTMLElement>('#win-left [data-action="combine"]')!;
    const result = combine.dataset.arg!.split('@')[0]!;
    press(combine);
    expect(queue).toHaveBeenCalledWith(expect.objectContaining({ type: 'combine', result }));
    expect(details()).not.toBeNull();
    driver.update(50);
    frame();
    expect(details()).not.toBeNull();
    expect(shownName()).toBe(s.data.units.find(u => u.id === result)!.name);
  });
});
