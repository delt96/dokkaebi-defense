// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, loadGameData, type MatchResult } from '@dorandi/logic';
import { forceRound, withoutMarketLock } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { NetClient } from '../src/net/NetClient';
import { NetDriver } from '../src/net/NetDriver';
import { mountUi } from '../src/ui/mount';
import { soloMenuHtml } from '../src/ui/solo-menu';
import { FakeRoom, STAGE_HTML, data, fixtureFull, key, press } from './fixtures/net';

class FakeScene {
  selectedId: number | null = null;
  storageCovered = false;
  reduceEffects = false;
  onFrame?: () => void;
  onSelect(): void {}
  onEvents(): void {}
  showGambleResult(): void {}
  showGambleNotice(): void {}
  showBirth(): void {}
  hideBirth(): void {}
  setNoticeSpan = vi.fn();
}

let clock = 1000;
const listeners: [string, EventListenerOrEventListenerObject][] = [];
beforeEach(() => {
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => {
    listeners.push([type, fn]);
    add(type, fn, o);
  });
  document.body.innerHTML = STAGE_HTML;
  delete document.documentElement.dataset.wins;
  clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  for (const [type, fn] of listeners.splice(0)) window.removeEventListener(type, fn);
  delete document.documentElement.dataset.wins;
  vi.restoreAllMocks();
});

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const actions = () => Array.from($('#modal .modal-actions')!.children).map(b => b.textContent);

function mountSolo() {
  const s = createGame(withoutMarketLock(loadGameData('stage3')), 1);
  forceRound(s, 3);
  s.coins = 5000;
  const driver = new GameDriver(s);
  const scene = new FakeScene();
  const onRestart = vi.fn();
  const onHome = vi.fn();
  mountUi(driver, scene as never, { onRestart, onHome });
  const queue = vi.spyOn(driver, 'queue');
  const frame = (ms = 150): void => { clock += ms; scene.onFrame?.(); };
  return { s, driver, frame, queue, onRestart, onHome };
}

describe('soloMenuHtml', () => {
  test('the menu: 메뉴 + 닫기, two equal buttons, then the line about the lost game', () => {
    const box = document.createElement('div');
    box.innerHTML = soloMenuHtml('menu');
    const modal = box.querySelector('.modal.solo-menu')!;
    expect(modal.getAttribute('role')).toBe('dialog');
    expect(modal.querySelector('.modal-head')!.textContent).toBe('메뉴닫기');
    expect(modal.querySelector('.modal-head [data-action="closeModal"]')!.textContent).toBe('닫기');
    expect(Array.from(modal.querySelectorAll('.modal-actions button')).map(b => [b.getAttribute('data-action'), b.textContent]))
      .toEqual([['askRestart', '다시 시작'], ['askHome', '처음 화면으로']]);
    expect(modal.querySelector('.modal-text')!.textContent)
      .toBe('시간이 멈춰 있습니다. 다시 시작하거나 처음 화면으로 가면 지금 판은 기록되지 않고 사라집니다.');
    expect(modal.querySelector('.danger')).toBeNull();
  });

  test('the two confirm windows: danger left, 취소 right with the focus', () => {
    for (const [kind, head, text, action] of [
      ['restartAsk', '다시 시작', '지금 판을 버리고 같은 난이도로 다시 시작할까요?', 'restart'],
      ['homeAsk', '처음 화면으로', '지금 판을 버리고 처음 화면으로 갈까요?', 'home'],
    ] as const) {
      const box = document.createElement('div');
      box.innerHTML = soloMenuHtml(kind);
      const modal = box.querySelector('.modal.solo-menu')!;
      expect(modal.getAttribute('role')).toBe('alertdialog');
      expect(modal.querySelector('.modal-head')!.textContent).toBe(head);
      expect(modal.querySelector('.modal-text')!.textContent).toBe(text);
      const buttons = Array.from(modal.querySelectorAll('.modal-actions button'));
      expect(buttons.map(b => b.textContent)).toEqual([head, '취소']);
      expect(buttons[0]!.classList.contains('danger')).toBe(true);
      expect(buttons[0]!.getAttribute('data-action')).toBe(action);
      expect(buttons[1]!.getAttribute('data-action')).toBe('menuBack');
      expect(buttons[1]!.hasAttribute('data-autofocus')).toBe(true);
    }
  });
});

describe('solo menu on the board', () => {
  test('메뉴 sits right after the gear in the top bar', () => {
    mountSolo();
    const gear = $('#top .settings-open')!;
    const menu = $('#top [data-action="openMenu"]')!;
    expect(gear.nextElementSibling).toBe(menu);
    expect(menu.classList.contains('menu-btn')).toBe(true);
    expect(menu.textContent).toBe('메뉴');
  });

  test('메뉴 stops the clock without the P cover and locks the side windows', () => {
    const { driver, queue } = mountSolo();
    press($('#top [data-action="openMenu"]'));
    expect($('#modal .solo-menu')!.textContent).toContain('시간이 멈춰 있습니다.');
    expect(driver.paused).toBe(true);
    expect($('#pause-cover')!.hidden).toBe(true);
    expect($('#win-left')!.inert).toBe(true);
    expect($('#win-right')!.inert).toBe(true);
    key('Space');
    expect(queue).not.toHaveBeenCalled();
    key('Escape');
    expect($('#modal')!.innerHTML).toBe('');
    expect(driver.paused).toBe(false);
    expect($('#win-right')!.inert).toBe(false);
  });

  test('닫기 closes the menu too', () => {
    const { driver } = mountSolo();
    press($('#top [data-action="openMenu"]'));
    press($('#modal .modal-head [data-action="closeModal"]'));
    expect($('#modal')!.innerHTML).toBe('');
    expect(driver.paused).toBe(false);
  });

  test('다시 시작 asks first: focus on 취소, Esc goes back to the menu, the danger button restarts once', () => {
    const { driver, onRestart, onHome } = mountSolo();
    press($('#top [data-action="openMenu"]'));
    press($('#modal [data-action="askRestart"]'));
    expect($('#modal .modal-text')!.textContent).toBe('지금 판을 버리고 같은 난이도로 다시 시작할까요?');
    expect(document.activeElement!.textContent).toBe('취소');
    expect(actions()).toEqual(['다시 시작', '취소']);
    expect(driver.paused).toBe(true);
    key('Escape');
    expect($('#modal .solo-menu [data-action="askRestart"]')).not.toBeNull();
    expect(driver.paused).toBe(true);
    press($('#modal [data-action="askRestart"]'));
    press($('#modal .danger'));
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onHome).not.toHaveBeenCalled();
  });

  test('처음 화면으로 asks first and goes home once; 취소 goes back to the menu', () => {
    const { onRestart, onHome } = mountSolo();
    press($('#top [data-action="openMenu"]'));
    press($('#modal [data-action="askHome"]'));
    expect($('#modal .modal-text')!.textContent).toBe('지금 판을 버리고 처음 화면으로 갈까요?');
    expect(document.activeElement!.textContent).toBe('취소');
    expect(actions()).toEqual(['처음 화면으로', '취소']);
    press($('#modal [data-action="menuBack"]'));
    expect($('#modal .solo-menu [data-action="askHome"]')).not.toBeNull();
    press($('#modal [data-action="askHome"]'));
    press($('#modal .danger'));
    expect(onHome).toHaveBeenCalledTimes(1);
    expect(onRestart).not.toHaveBeenCalled();
  });

  test('the pill shows for the menu pause, the dex pause stays without it', () => {
    const { frame } = mountSolo();
    press($('#top [data-action="openMenu"]'));
    frame();
    expect($('#top .pill')!.textContent).toBe('멈춤');
    press($('#modal [data-action="askHome"]'));
    frame();
    expect($('#top .pill')!.textContent).toBe('멈춤');
    key('Escape');
    key('Escape');
    frame();
    expect($('#modal')!.innerHTML).toBe('');
    expect($('#top .pill')).toBeNull();
    key('KeyD');
    frame();
    expect($('#modal')!.innerHTML).not.toBe('');
    expect($('#top .pill')).toBeNull();
  });

  test('P pause survives the menu and a confirm round trip (review focus 3)', () => {
    const { driver, frame } = mountSolo();
    key('KeyP');
    frame();
    expect($('#pause-cover')!.hidden).toBe(false);
    press($('#top [data-action="openMenu"]'));
    expect($('#modal .solo-menu')).not.toBeNull();
    // the cover (z 3) stays under the menu (z 4)
    expect($('#pause-cover')!.hidden).toBe(false);
    press($('#modal [data-action="askHome"]'));
    press($('#modal [data-action="menuBack"]'));
    key('Escape');
    expect($('#modal')!.innerHTML).toBe('');
    frame();
    expect(driver.paused).toBe(true);
    expect($('#pause-cover')!.hidden).toBe(false);
  });
});

const result = (outcome: MatchResult['outcome']): MatchResult => ({ outcome, tick: 7799, round: 9, yeoksinKills: 0, started: 2, alive: 1, seats: [
  { seat: 1, outcome: 'aliveTeamLoss', cause: null, round: 9, lastEnemies: 20, maxEnemies: 40, series: [1, 2, 3], bestUnit: null, yeoksinDamage: 0, helperOpens: 0, supportSent: 0, supportReceived: 0 },
  { seat: 2, outcome: 'eliminated', cause: 'limit', round: 4, lastEnemies: 61, maxEnemies: 61, series: [5, 61], bestUnit: null, yeoksinDamage: 0, helperOpens: 0, supportSent: 0, supportReceived: 0 },
] });

describe('online menu', () => {
  test('the end scene closes an open menu and lets go of its focus', () => {
    const room = new FakeRoom();
    const full = fixtureFull();
    const net = new NetClient(room, full.dataVersion);
    room.emit('full', full);
    const driver = new NetDriver(net, data, () => clock);
    driver.update(16);
    const scene = new FakeScene();
    mountUi(driver, scene as never, {}, { online: true, view: () => net.view, data, actions: { support: vi.fn(), watch: vi.fn(), forfeit: vi.fn() } });
    press($('#top [data-action="openMenu"]'));
    const close = $<HTMLButtonElement>('#modal [data-action="closeModal"]')!;
    close.focus();
    expect(document.activeElement).toBe(close);
    // a removed node loses the focus silently; the blur is what tells focus listeners it went
    const blurred = vi.fn();
    close.addEventListener('blur', blurred);
    room.emit('result', { result: result('gate') });
    clock += 150;
    driver.update(16);
    scene.onFrame?.();
    expect($('#modal')!.innerHTML).toBe('');
    expect(document.activeElement).toBe(document.body);
    expect(blurred).toHaveBeenCalledTimes(1);
  });
});
