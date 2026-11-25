// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { mountUi } from '../src/ui/mount';
import { key, press, STAGE_HTML } from './fixtures/net';

class FakeScene {
  selectedId: number | null = null;
  reduceEffects = false;
  onFrame?: () => void;
  private selectCb: ((slot: number | null) => void) | null = null;
  onSelect(cb: (slot: number | null) => void): void { this.selectCb = cb; }
  onEvents(): void {}
  setReduceEffects(on: boolean): void { this.reduceEffects = on; }
  select(slot: number | null): void { this.selectCb?.(slot); }
}

const modal = () => document.getElementById('modal')!;
const gear = () => document.querySelector<HTMLElement>('#top [data-action="openSettings"]')!;
const row = (name: string) => modal().querySelector<HTMLElement>(`.settings-row[data-setting="${name}"]`);
const choice = (action: string, arg: string) => modal().querySelector<HTMLButtonElement>(`[data-action="${action}"][data-arg="${arg}"]`)!;
const wholeList = () => document.querySelector('#left .nc-list');
const bottom = () => document.getElementById('bottom')!;
const left = () => document.getElementById('left')!;

describe('solo settings window', () => {
  let driver: GameDriver;
  let scene: FakeScene;
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = STAGE_HTML;
    const s = createGame(loadGameData('stage3'), 1);
    forceRound(s, 24);
    driver = new GameDriver(s);
    scene = new FakeScene();
    mountUi(driver, scene as never);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  test('the gear sits at the right end of the top bar, not in the right panel', () => {
    expect(gear().getAttribute('aria-label')).toBe('설정');
    // design B4 5-1: the gear, then 메뉴 at the end of the row
    expect(document.querySelector('#top')!.lastElementChild!.lastElementChild).toBe(gear().nextElementSibling);
    expect(gear().nextElementSibling!.getAttribute('data-action')).toBe('openMenu');
    expect(document.querySelector('#right [data-action="openSettings"]')).toBeNull();
  });

  test('the gear opens a window with the helper, speed, reduce-effects and help-line rows; Esc closes it', () => {
    expect(modal().textContent).toBe('');
    press(gear());
    expect(Array.from(modal().querySelectorAll('.settings-row')).map(r => r.getAttribute('data-setting'))).toEqual(['helper', 'speed', 'fx', 'help']);
    expect(row('help')!.textContent).toContain('단축키 안내 줄');
    expect(choice('setHelp', 'on').getAttribute('aria-pressed')).toBe('true');
    expect(row('helper')!.textContent).toContain('고르지 않았을 때 전체 목록');
    expect(choice('setHelper', 'on').getAttribute('aria-pressed')).toBe('true');
    expect(choice('speed', '1').getAttribute('aria-pressed')).toBe('true');
    expect(choice('setFx', 'off').getAttribute('aria-pressed')).toBe('true');
    key('Escape');
    expect(modal().textContent).toBe('');
  });

  test('the helper row hides and shows the whole list with nothing selected and keeps the window open', () => {
    press(gear());
    expect(wholeList()).not.toBeNull();
    press(choice('setHelper', 'off'));
    expect(wholeList()).toBeNull();
    expect(choice('setHelper', 'off').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(choice('setHelper', 'off'));
    press(choice('setHelper', 'off'));
    expect(wholeList()).toBeNull();
    press(choice('setHelper', 'on'));
    expect(wholeList()).not.toBeNull();
    expect(row('helper')).not.toBeNull();
  });

  test('Q with the window open leaves the setting and the window as they are', () => {
    press(gear());
    key('KeyQ');
    expect(choice('setHelper', 'on').getAttribute('aria-pressed')).toBe('true');
    expect(wholeList()).not.toBeNull();
    press(choice('setHelper', 'off'));
    key('KeyQ');
    expect(choice('setHelper', 'off').getAttribute('aria-pressed')).toBe('true');
    expect(wholeList()).toBeNull();
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

describe('solo help line and unit card', () => {
  let scene: FakeScene;
  let driver: GameDriver;
  const mount = () => {
    document.body.innerHTML = STAGE_HTML;
    scene = new FakeScene();
    mountUi(driver, scene as never);
  };
  beforeEach(() => {
    localStorage.clear();
    const s = createGame(loadGameData('stage3'), 1);
    forceRound(s, 24);
    placeUnitForTest(s, 'jipsin', 3);
    driver = new GameDriver(s);
    mount();
  });

  test('도움말 끔 hides the hotkey line under the board and is remembered', () => {
    expect(bottom().textContent).toContain('E 강화');
    press(gear());
    press(choice('setHelp', 'off'));
    expect(bottom().textContent).toBe('');
    expect(choice('setHelp', 'off').getAttribute('aria-pressed')).toBe('true');
    mount();
    expect(bottom().textContent).toBe('');
    press(gear());
    press(choice('setHelp', 'on'));
    expect(bottom().textContent).toContain('E 강화');
  });

  test('the selected unit shows in the left panel, not under the board', () => {
    expect(left().textContent).toContain('다음 할 일');
    scene.select(3);
    const card = left().querySelector('.solo-panel')!;
    expect(card.textContent).toContain('짚신');
    expect(card.querySelector('.type-badge')).not.toBeNull();
    expect(card.textContent).toMatch(/공격 \d+/);
    expect(card.querySelector('[data-action="unitDetails"]')).not.toBeNull();
    expect(card.querySelector('[data-action="sell"]')!.textContent).toContain('판매 +');
    expect(card.querySelector('.skill-line')).not.toBeNull();
    expect(left().textContent).not.toContain('다음 할 일');
    expect(bottom().querySelector('[data-action="sell"], .unit-info')).toBeNull();
    expect(bottom().textContent).toContain('Z/X/C 조합(판에 짝 표시)');
    press(card.querySelector('[data-action="unitDetails"]'));
    expect(document.querySelector('#win-left .unit-details')).not.toBeNull();
  });

  test('one panel: head, scope buttons, the list, the 지게 row, then the actions; Q keeps that order', () => {
    scene.select(3);
    const order = () => Array.from(left().querySelector('.solo-panel')!.children).map(c => c.className.split(' ')[0]);
    expect(order()).toEqual(['nc-head', 'nc-scope', 'nc-list', 'up-actions']);
    driver.state.econ!.jige = 1;
    scene.select(3);
    expect(order()).toEqual(['nc-head', 'nc-scope', 'nc-list', 'up-jige', 'up-actions']);
    key('KeyQ');
    expect(order()).toEqual(['nc-head', 'nc-scope', 'nc-list', 'up-jige', 'up-actions']);
    key('Escape');
    expect(order()).toEqual(['nc-head', 'nc-scope', 'nc-list']);
    expect(left().querySelector('.unit-panel, .helper')).toBeNull();
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
