// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import { forceRound, withoutMarketLock } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { NetClient } from '../src/net/NetClient';
import { NetDriver } from '../src/net/NetDriver';
import { mountUi } from '../src/ui/mount';
import { PORTRAIT_TITLE, portraitText } from '../src/ui/first-visit';
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

const SOLO_TEXT = '세로 화면에서는 판 오른쪽(뚝딱·설정)이 잘립니다. 시간은 멈춰 있고, 돌리면 이어서 합니다.';
const ONLINE_TEXT = '세로 화면에서는 판 오른쪽(뚝딱·설정)이 잘립니다. 함께 하는 판이라 시간은 계속 흐릅니다.';

let clock = 1000;
let portrait = false;
let width = 1280;
const listeners: [string, EventListenerOrEventListenerObject][] = [];
const saved: { matchMedia?: PropertyDescriptor; innerWidth?: PropertyDescriptor } = {};
beforeEach(() => {
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => {
    listeners.push([type, fn]);
    add(type, fn, o);
  });
  saved.matchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  saved.innerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  Object.defineProperty(window, 'matchMedia', {
    configurable: true, writable: true,
    value: (q: string) => ({
      matches: q.includes('orientation: portrait') ? portrait : false, media: q,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    }),
  });
  Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => width });
  portrait = false;
  width = 1280;
  document.body.innerHTML = STAGE_HTML;
  delete document.documentElement.dataset.wins;
  clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  for (const [type, fn] of listeners.splice(0)) window.removeEventListener(type, fn);
  for (const name of ['matchMedia', 'innerWidth'] as const) {
    const d = saved[name];
    if (d) Object.defineProperty(window, name, d);
    else delete (window as unknown as Record<string, unknown>)[name];
  }
  delete document.documentElement.dataset.wins;
  vi.restoreAllMocks();
});

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const guide = () => $('#portrait-guide')!;
const turn = (upright: boolean, w = upright ? 390 : 844) => { portrait = upright; width = w; window.dispatchEvent(new Event('resize')); };

function mountSolo() {
  const s = createGame(withoutMarketLock(loadGameData('stage3')), 1);
  forceRound(s, 3);
  const driver = new GameDriver(s);
  const scene = new FakeScene();
  mountUi(driver, scene as never, { onRestart: vi.fn(), onHome: vi.fn() });
  const queue = vi.spyOn(driver, 'queue');
  return { s, driver, scene, queue };
}

function mountOnline() {
  const room = new FakeRoom();
  const full = fixtureFull();
  const net = new NetClient(room, full.dataVersion);
  room.emit('full', full);
  const driver = new NetDriver(net, data, () => clock);
  driver.update(16);
  const scene = new FakeScene();
  mountUi(driver, scene as never, {}, { online: true, view: () => net.view, data, actions: { support: vi.fn(), watch: vi.fn(), forfeit: vi.fn() } });
  return { driver };
}

describe('portrait guide words', () => {
  test('one title, the solo and the online line', () => {
    expect(PORTRAIT_TITLE).toBe('가로로 돌려 주세요');
    expect(portraitText(false)).toBe(SOLO_TEXT);
    expect(portraitText(true)).toBe(ONLINE_TEXT);
  });
});

describe('portrait guide on the board', () => {
  test('a portrait phone gets the guide over everything and the solo clock stops (review focus 5)', () => {
    portrait = true; width = 390;
    const { driver, queue } = mountSolo();
    const g = guide();
    expect(g.hidden).toBe(false);
    expect(document.body.lastElementChild).toBe(g);
    expect($('#stage')!.contains(g)).toBe(false);
    expect(g.getAttribute('role')).toBe('dialog');
    expect(g.getAttribute('aria-modal')).toBe('true');
    expect(g.getAttribute('aria-labelledby')).toBe('pg-title');
    expect($('#pg-title')!.textContent).toBe('가로로 돌려 주세요');
    expect($('#pg-title')!.classList.contains('pg-title')).toBe(true);
    expect($('#portrait-guide .pg-text')!.textContent).toBe(SOLO_TEXT);
    expect(driver.paused).toBe(true);
    expect($('#pause-cover')!.hidden).toBe(true);
    expect($("#top .pill")).not.toBeNull();
    expect($('#stage')!.inert).toBe(true);
    expect($('#win-left')!.inert && $('#win-right')!.inert).toBe(true);
    expect(document.activeElement!.textContent).toBe('이대로 보기');
    key('Space');
    key('KeyP');
    expect(queue).not.toHaveBeenCalled();
    expect($('#pause-cover')!.hidden).toBe(true);
  });

  test('이대로 보기 keeps it away for the page, turning landscape hides it by itself', () => {
    portrait = true; width = 390;
    const first = mountSolo();
    const button = $<HTMLButtonElement>('#portrait-guide [data-action="portraitDismiss"]')!;
    press(button);
    expect(guide().hidden).toBe(true);
    expect(first.driver.paused).toBe(false);
    expect($('#stage')!.inert).toBe(false);
    expect($('#win-left')!.inert).toBe(false);
    expect(document.activeElement).toBe(document.body);
    turn(true);
    expect(guide().hidden).toBe(true);
    first.scene.onFrame?.();
    expect(guide().hidden).toBe(true);

    for (const [type, fn] of listeners.splice(0)) window.removeEventListener(type, fn);
    document.body.innerHTML = STAGE_HTML;
    portrait = true; width = 390;
    const second = mountSolo();
    expect(guide().hidden).toBe(false);
    expect(second.driver.paused).toBe(true);
    turn(false);
    expect(guide().hidden).toBe(true);
    expect(second.driver.paused).toBe(false);
    expect($('#stage')!.inert).toBe(false);
    expect(document.activeElement).toBe(document.body);
    turn(true);
    expect(guide().hidden).toBe(false);
    window.dispatchEvent(new Event('orientationchange'));
    expect(guide().hidden).toBe(false);
  });

  test('wide portrait windows, an outer screen and online', () => {
    portrait = true; width = 700;
    const solo = mountSolo();
    expect(guide().hidden).toBe(true);
    expect(solo.driver.paused).toBe(false);
    width = 390;
    $('#screen')!.innerHTML = '<div class="screen-box"></div>';
    window.dispatchEvent(new Event('resize'));
    expect(guide().hidden).toBe(true);
    $('#screen')!.replaceChildren();
    window.dispatchEvent(new Event('resize'));
    expect(guide().hidden).toBe(false);

    for (const [type, fn] of listeners.splice(0)) window.removeEventListener(type, fn);
    document.body.innerHTML = STAGE_HTML;
    const { driver } = mountOnline();
    expect(guide().hidden).toBe(false);
    expect($('#portrait-guide .pg-text')!.textContent).toBe(ONLINE_TEXT);
    expect(driver.paused).toBe(false);
    expect($('#stage')!.inert).toBe(true);
  });

  test('the guide covers an open solo menu and gives it back', () => {
    const { driver } = mountSolo();
    press($('#top [data-action="openMenu"]'));
    expect($('#modal .solo-menu')).not.toBeNull();
    turn(true);
    expect(guide().hidden).toBe(false);
    expect($('#modal .solo-menu')).not.toBeNull();
    expect(document.activeElement!.textContent).toBe('이대로 보기');
    key('Escape');
    expect($('#modal .solo-menu')).not.toBeNull();
    turn(false);
    expect(guide().hidden).toBe(true);
    expect($('#modal .solo-menu')).not.toBeNull();
    expect(driver.paused).toBe(true);
    expect($('#pause-cover')!.hidden).toBe(true);
  });
});
