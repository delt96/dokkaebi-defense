// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import { forceRound } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { mountUi } from '../src/ui/mount';
import { key, press, STAGE_HTML } from './fixtures/net';

class FakeScene {
  selectedId: number | null = null;
  reduceEffects = false;
  onFrame?: () => void;
  onSelect(): void {}
  onEvents(): void {}
  setReduceEffects(on: boolean): void { this.reduceEffects = on; }
}

const modal = () => document.getElementById('modal')!;
const gear = () => document.querySelector<HTMLElement>('#right [data-action="openSettings"]')!;
const row = (name: string) => modal().querySelector<HTMLElement>(`.settings-row[data-setting="${name}"]`);
const choice = (action: string, arg: string) => modal().querySelector<HTMLButtonElement>(`[data-action="${action}"][data-arg="${arg}"]`)!;
const helperList = () => document.querySelector('#left .helper li');

describe('solo settings window', () => {
  let driver: GameDriver;
  let scene: FakeScene;
  beforeEach(() => {
    document.body.innerHTML = STAGE_HTML;
    const s = createGame(loadGameData('stage3'), 1);
    forceRound(s, 24);
    driver = new GameDriver(s);
    scene = new FakeScene();
    mountUi(driver, scene as never);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  test('the gear opens a window with the helper, speed and reduce-effects rows; Esc closes it', () => {
    expect(modal().textContent).toBe('');
    press(gear());
    expect(Array.from(modal().querySelectorAll('.settings-row')).map(r => r.getAttribute('data-setting'))).toEqual(['helper', 'speed', 'fx']);
    expect(row('helper')!.textContent).toContain('조합 도우미');
    expect(choice('setHelper', 'off').getAttribute('aria-pressed')).toBe('true');
    expect(choice('speed', '1').getAttribute('aria-pressed')).toBe('true');
    expect(choice('setFx', 'off').getAttribute('aria-pressed')).toBe('true');
    key('Escape');
    expect(modal().textContent).toBe('');
  });

  test('the helper row shows the list in the left panel and keeps the window open', () => {
    press(gear());
    expect(helperList()).toBeNull();
    press(choice('setHelper', 'on'));
    expect(helperList()).not.toBeNull();
    expect(choice('setHelper', 'on').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(choice('setHelper', 'on'));
    press(choice('setHelper', 'on'));
    expect(helperList()).not.toBeNull();
    press(choice('setHelper', 'off'));
    expect(helperList()).toBeNull();
    expect(row('helper')).not.toBeNull();
  });

  test('Q flips the helper with the window open and leaves the window as it is', () => {
    press(gear());
    key('KeyQ');
    expect(helperList()).not.toBeNull();
    expect(choice('setHelper', 'on').getAttribute('aria-pressed')).toBe('true');
    key('KeyQ');
    expect(helperList()).toBeNull();
    expect(row('helper')).not.toBeNull();
    key('Escape');
    key('KeyQ');
    expect(helperList()).not.toBeNull();
    expect(modal().textContent).toBe('');
  });

  test('the speed row sets the game speed', () => {
    press(gear());
    press(choice('speed', '3'));
    expect(driver.speed).toBe(3);
    expect(choice('speed', '3').getAttribute('aria-pressed')).toBe('true');
    press(choice('speed', '2'));
    expect(driver.speed).toBe(2);
    press(choice('speed', '1'));
    expect(driver.speed).toBe(1);
  });

  test('the reduce-effects row flips the scene setting', () => {
    press(gear());
    press(choice('setFx', 'on'));
    expect(scene.reduceEffects).toBe(true);
    expect(choice('setFx', 'on').getAttribute('aria-pressed')).toBe('true');
    press(choice('setFx', 'off'));
    expect(scene.reduceEffects).toBe(false);
    expect(document.querySelector('#left [data-action="toggleFx"], #left .fx-toggle')).toBeNull();
  });
});

describe('20-round solo', () => {
  test('keeps the gear and the speed row', () => {
    document.body.innerHTML = STAGE_HTML;
    const driver = new GameDriver(createGame(loadGameData(), 1));
    mountUi(driver, new FakeScene() as never);
    press(gear());
    press(choice('speed', '2'));
    expect(driver.speed).toBe(2);
  });
});
