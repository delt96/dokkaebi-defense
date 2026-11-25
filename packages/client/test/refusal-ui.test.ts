// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import { forceRound, withoutMarketLock } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { mountUi } from '../src/ui/mount';
import { STAGE_HTML, key, press } from './fixtures/net';

class FakeScene {
  selectedId: number | null = null;
  storageCovered = false;
  reduceEffects = false;
  onFrame?: () => void;
  onSelect(): void {}
  onEvents(): void {}
  showGambleResult(): void {}
  showBirth(): void {}
  setNoticeSpan = vi.fn();
}

// happy-dom lays nothing out: the stage, the right window box and the two summon buttons get fixed boxes
const RECTS: [string, { left: number; top: number; width: number; height: number }][] = [
  ['#stage', { left: 0, top: 0, width: 640, height: 360 }],
  ['#win-right', { left: 458, top: 24, width: 182, height: 308 }],
  ['#right [data-action="summon"]', { left: 540, top: 200, width: 90, height: 24 }],
  ['#win-right .win-summon', { left: 470, top: 60, width: 71, height: 24 }],
];

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
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const r = RECTS.find(([sel]) => this.matches(sel))?.[1] ?? { left: 0, top: 0, width: 0, height: 0 };
    return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON: () => r } as DOMRect;
  });
});
afterEach(() => {
  for (const [type, fn] of listeners.splice(0)) window.removeEventListener(type, fn);
  delete document.documentElement.dataset.wins;
  vi.restoreAllMocks();
});

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);

function mountSolo(data = withoutMarketLock(loadGameData('stage3'))) {
  const s = createGame(data, 1);
  forceRound(s, 3);
  s.coins = 5000;
  const driver = new GameDriver(s);
  const scene = new FakeScene();
  mountUi(driver, scene as never);
  const frame = (ms = 150): void => { clock += ms; scene.onFrame?.(); };
  // the driver steps the queued commands and hands back what it refused
  const tick = (): void => { driver.update(50); frame(0); };
  return { s, driver, scene, frame, tick };
}

test('Space with no token: the box sits over the right panel 뚝딱', () => {
  const { s, tick } = mountSolo();
  s.tokens = 0;
  key('Space');
  tick();
  const box = $('.refusal')!;
  expect(box.parentElement).toBe($('#stage'));
  expect(box.textContent).toBe('도깨비불이 없습니다');
  // centred on the button (540 + 90 / 2) with the box and its tail ending on the button's top edge (200)
  expect(box.style.left).toBe('585px');
  expect(box.style.top).toBe('180px');
  expect($('#top .notice')).toBeNull();
  expect($('#round-banner')!.textContent).toBe('');
});

test('with the market in the pillar the box goes over the window 뚝딱', () => {
  const { s, tick } = mountSolo();
  document.documentElement.dataset.wins = 'inside';
  s.tokens = 0;
  key('KeyB');
  expect($('#right')!.inert).toBe(true);
  key('Space');
  tick();
  const box = $('#win-right .refusal')!;
  expect(box).not.toBeNull();
  expect(box.textContent).toBe('도깨비불이 없습니다');
  expect(document.querySelectorAll('.refusal')).toHaveLength(1);
  // window px: (470 - 458) + 71 / 2 = 47.5 → 48; 60 - 24 - 20 = 16
  expect(box.style.left).toBe('48px');
  expect(box.style.top).toBe('16px');
});

test('창이 다시 그려져도 거절 상자가 남는다', () => {
  const { s, tick, frame } = mountSolo();
  document.documentElement.dataset.wins = 'inside';
  s.tokens = 0;
  key('KeyB');
  key('Space');
  tick();
  const first = $('#win-right .refusal')!;
  expect(first.classList.contains('shake')).toBe(true);
  s.coins -= 10;
  frame(700);
  const again = $('#win-right .refusal')!;
  expect(again).not.toBeNull();
  expect(again).not.toBe(first);
  expect(again.textContent).toBe('도깨비불이 없습니다');
  // put back after the redraw, it does not shake a second time
  expect(again.classList.contains('shake')).toBe(false);
  frame(700);
  expect($('#win-right .refusal')).not.toBeNull();
  frame(200);
  expect($('.refusal')).toBeNull();
});

test('reduced effects: the box does not shake', () => {
  const { s, scene, tick } = mountSolo();
  scene.reduceEffects = true;
  s.tokens = 0;
  key('Space');
  tick();
  expect($('.refusal')!.classList.contains('shake')).toBe(false);
});

test('a new refusal replaces the box', () => {
  const { s, driver, tick, frame } = mountSolo();
  s.tokens = 0;
  key('Space');
  tick();
  frame(300);
  driver.queue({ type: 'combine', result: 'gamasot' });
  key('Space');
  tick();
  expect(document.querySelectorAll('.refusal')).toHaveLength(1);
});

test('a refusal with no button goes to the slot', () => {
  const { driver, tick } = mountSolo();
  driver.queue({ type: 'combine', result: 'gamasot' });
  tick();
  expect($('#round-banner')!.textContent).toBe('재료가 모자랍니다');
  expect($('.refusal')).toBeNull();
});

test('P pause: cover, pill, Space says 멈춤 중입니다 · P로 계속, 계속 resumes', () => {
  const { driver, frame } = mountSolo();
  const queue = vi.spyOn(driver, 'queue');
  key('KeyP');
  frame();
  const cover = $('#pause-cover')!;
  expect(cover.hidden).toBe(false);
  expect(cover.parentElement).toBe($('#stage'));
  expect(cover.textContent).toContain('멈춤');
  expect($('#top .pill')!.textContent).toBe('멈춤');
  expect($('#top .time')!.textContent).not.toContain('·');
  key('Space');
  expect($('.refusal')!.textContent).toBe('멈춤 중입니다 · P로 계속');
  expect(queue).not.toHaveBeenCalled();
  press($('#pause-cover [data-action="resume"]'));
  expect(driver.paused).toBe(false);
  expect(cover.hidden).toBe(true);
  expect($('#top .pill')).toBeNull();
});

test('the dex pause draws no cover and no pill', () => {
  const { driver, frame } = mountSolo();
  key('KeyD');
  frame();
  expect(driver.paused).toBe(true);
  expect($('#pause-cover')!.hidden).toBe(true);
  expect($('#top .pill')).toBeNull();
});

test('P 멈춤 위에 설정, 닫으면 덮개가 남는다', () => {
  const { driver, frame } = mountSolo();
  key('KeyP');
  frame();
  press($('#top [data-action="openSettings"]'));
  expect($('#modal .settings-pop')).not.toBeNull();
  expect($('#pause-cover')!.hidden).toBe(false);
  expect($('#pause-cover')!.inert).toBe(true);
  key('Escape');
  expect($('#modal')!.innerHTML).toBe('');
  expect($('#pause-cover')!.hidden).toBe(false);
  expect($('#pause-cover')!.inert).toBe(false);
  expect(driver.paused).toBe(true);
});

test('the cover sits under the locking windows, the end scene and the error box', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/ui/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const z = (sel: string) => {
    const rules = css.split('}').filter(r => r.split('{')[0]!.split(',').map(x => x.trim()).includes(sel));
    const found = rules.map(r => /z-index:\s*(-?\d+)/.exec(r.split('{')[1] ?? '')?.[1]).filter(Boolean);
    return Number(found.at(-1));
  };
  expect([z('#pause-cover'), z('#modal'), z('#end-scene'), z('#error')]).toEqual([3, 4, 5, 6]);
});

test('Esc does not lift a P pause', () => {
  const { driver, frame } = mountSolo();
  key('KeyP');
  frame();
  key('Escape');
  frame();
  expect(driver.paused).toBe(true);
  expect($('#pause-cover')!.hidden).toBe(false);
});

test('the HUD no longer has a notice slot', () => {
  const { s, tick } = mountSolo();
  s.open.forEach((o, i) => { if (o) s.slots[i] = { id: 900 + i, defId: 'ki', cooldown: 0, attackCount: 0, periodic: [] } as never; });
  s.tokens = 5;
  key('Space');
  tick();
  expect($('#top .notice')).toBeNull();
  expect($('.refusal')!.textContent).toBe('빈 칸이 없습니다');
});
