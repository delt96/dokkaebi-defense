// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ClientView } from '@dorandi/logic';
import { NetClient } from '../src/net/NetClient';
import { NetDriver } from '../src/net/NetDriver';
import { gameAudio } from '../src/audio/engine';
import { mountUi } from '../src/ui/mount';
import { FakeRoom, STAGE_HTML, data, fixtureFull } from './fixtures/net';

const here = dirname(fileURLToPath(import.meta.url));

class FakeScene {
  selectedId: number | null = null;
  storageCovered = false;
  pulseHeld = false;
  shakeJangseung = false;
  reduceEffects = false;
  onFrame?: () => void;
  onToast?: (text: string, color: number) => void;
  onSelect(): void {}
  onEvents(): void {}
  showGambleResult(): void {}
  showGambleNotice(): void {}
  showBirth = vi.fn();
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

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const slotText = () => $('#round-banner')!.textContent ?? '';
/** Every value written to the element's textContent from now on. */
function recordWrites(node: HTMLElement): string[] {
  let proto: object | null = Object.getPrototypeOf(node);
  let desc: PropertyDescriptor | undefined;
  while (proto && !(desc = Object.getOwnPropertyDescriptor(proto, 'textContent'))) proto = Object.getPrototypeOf(proto);
  const writes: string[] = [];
  Object.defineProperty(node, 'textContent', {
    configurable: true,
    get() { return desc!.get!.call(this); },
    set(v: string) { writes.push(v); desc!.set!.call(this, v); },
  });
  return writes;
}

const DEADLINE = 9000;
const stayTicks = data.coop!.staySeconds * 20;

function mountOnline() {
  const room = new FakeRoom();
  const full = fixtureFull();
  const net = new NetClient(room, full.dataVersion);
  room.emit('full', full);
  const driver = new NetDriver(net, data, () => clock);
  driver.update(16);
  const scene = new FakeScene();
  vi.spyOn(gameAudio, 'play').mockImplementation(() => {});
  mountUi(driver, scene as never, {}, { online: true, view: () => net.view, data, actions: { support: vi.fn(), watch: vi.fn(), forfeit: vi.fn() } });
  const frame = (ms = 150): void => { clock += ms; driver.update(16); scene.onFrame?.(); };
  const view = (): ClientView => net.view!;
  /** Round 9 (the deadline round of the first gate) with the 역신 alive in seat 2; its banner has gone by. */
  const deadlineRound = (): void => {
    const v = view();
    v.clock = { ...v.clock, phase: 'round', round: 9, tick: DEADLINE - 600, roundEndTick: DEADLINE };
    v.gate = { stage: 1, kills: 0, deadlineTick: DEADLINE };
    v.yeoksin = { stage: 1, hp: 1462, maxHp: 7480, seat: 2, enterTick: DEADLINE - 600, nextSeat: 1 };
    frame();
    frame(2000);
  };
  const atTick = (tick: number): void => { view().clock = { ...view().clock, tick }; frame(); };
  return { net, scene, frame, view, deadlineRound, atTick };
}

describe('online gate signals on screen', () => {
  test('the deadline round banner ends with a red 관문 마감', () => {
    const { view, frame } = mountOnline();
    const v = view();
    v.gate = { stage: 1, kills: 0, deadlineTick: DEADLINE };
    v.clock = { ...v.clock, phase: 'round', round: 9 };
    frame();
    expect(slotText()).toContain('9라운드');
    expect($('#round-banner .slot-tail')!.textContent).toBe(' · 관문 마감');
  });

  test('a round before the deadline gets no 관문 마감', () => {
    const { view, frame } = mountOnline();
    const v = view();
    v.gate = { stage: 1, kills: 0, deadlineTick: DEADLINE };
    v.clock = { ...v.clock, phase: 'round', round: 8 };
    frame();
    expect(slotText()).toContain('8라운드');
    expect($('#round-banner .slot-tail')).toBeNull();
  });

  test('the second line turns red in the deadline round and no longer carries my turn', () => {
    const { deadlineRound } = mountOnline();
    deadlineRound();
    const second = $('#top .line.second')!;
    expect(second.classList.contains('urgent')).toBe(true);
    expect(second.textContent).toContain('관문 마감 · 남은 30초');
    expect($('#top')!.textContent).not.toContain('다음은 내 고개');
    expect($('#top')!.textContent).not.toContain('역신이 옵니다');
    expect($('#left .arrival')).toBeNull();
    expect($('#left')!.textContent).not.toContain('역신이 옵니다');
  });

  test('the last 10 s take the slot from a waiting notice', () => {
    const { scene, deadlineRound, atTick } = mountOnline();
    deadlineRound();
    atTick(DEADLINE - 200);
    const box = $('#round-banner .gate-countdown')!;
    expect(box).not.toBeNull();
    expect(box.querySelector('.cd-sec')!.textContent).toBe('10초');
    expect(box.textContent).toContain('역신을 쓰러뜨리세요');
    expect(box.querySelector('.cd-where')!.textContent).toBe('2번 two 고개 · 1,462 / 7,480');
    expect(box.querySelector<HTMLElement>('.cd-bar i')!.style.width).toBe('20%');
    scene.onToast!('★ 귀교 목수', 0xffe35a);
    atTick(DEADLINE - 180);
    expect($('#round-banner .gate-countdown')).not.toBeNull();
    expect(slotText()).not.toContain('귀교 목수');
  });

  test('역신을 잡으면 카운트다운이 내려가고 기다린 알림이 뜬다', () => {
    const { scene, view, frame, deadlineRound, atTick } = mountOnline();
    deadlineRound();
    atTick(DEADLINE - 200);
    scene.onToast!('★ 귀교 목수', 0xffe35a);
    atTick(DEADLINE - 180);
    expect($('#round-banner .gate-countdown')).not.toBeNull();
    view().yeoksin = null;
    frame();
    frame();
    expect($('#round-banner .gate-countdown')).toBeNull();
    expect(slotText()).toContain('★ 귀교 목수');
  });

  test('the countdown speaks at 10 and 5 only', () => {
    const { deadlineRound, atTick } = mountOnline();
    deadlineRound();
    const said = recordWrites($('#slot-say')!);
    for (let t = DEADLINE - 200; t <= DEADLINE - 100; t += 20) atTick(t);
    expect(said).toEqual(['관문 마감 10초 전 · 역신 체력 1,462', '관문 마감 5초 전 · 역신 체력 1,462']);
  });

  test('the number pulses from 5 s; reduced effects: no pulse class', () => {
    const { scene, deadlineRound, atTick } = mountOnline();
    deadlineRound();
    atTick(DEADLINE - 120);
    expect($('#round-banner .cd-sec')!.classList.contains('pulse')).toBe(false);
    atTick(DEADLINE - 100);
    expect($('#round-banner .cd-sec')!.classList.contains('pulse')).toBe(true);
    // the countdown number owns the one repeating motion on the board
    expect(scene.pulseHeld).toBe(true);
    scene.reduceEffects = true;
    atTick(DEADLINE - 80);
    expect($('#round-banner .cd-sec')!.textContent).toBe('4초');
    expect($('#round-banner .cd-sec')!.classList.contains('pulse')).toBe(false);
  });
});

describe('역신이 옵니다 over the entrance', () => {
  function comingIn(left: number) {
    const m = mountOnline();
    const v = m.view();
    v.clock = { ...v.clock, phase: 'round', round: 7, tick: 5000, roundEndTick: 5400 };
    v.gate = { stage: 1, kills: 0, deadlineTick: DEADLINE };
    v.yeoksin = { stage: 1, hp: 6632, maxHp: 7480, seat: 2, enterTick: 5000 - stayTicks + left, nextSeat: 1 };
    m.frame();
    return m;
  }

  test('역신이 옵니다 sits in the fixed row, with the seconds red from 5 s', () => {
    const { view, frame } = comingIn(160);
    expect($('#gate-near')!.textContent).toBe('역신이 옵니다 · 8초');
    expect($('#gate-near .near-sec')!.classList.contains('urgent')).toBe(false);
    view().clock = { ...view().clock, tick: 5060 };
    frame();
    expect($('#gate-near')!.textContent).toBe('역신이 옵니다 · 5초');
    expect($('#gate-near .near-sec')!.classList.contains('urgent')).toBe(true);
    expect($('#slot-row #gate-near')).not.toBeNull();
  });

  test('here in my lane it says when it leaves; gone once it has left', () => {
    const { view, frame } = comingIn(160);
    view().yeoksin = { stage: 1, hp: 6632, maxHp: 7480, seat: 1, enterTick: 5000 - stayTicks + 140, nextSeat: 2 };
    frame();
    expect($('#gate-near')!.textContent).toBe('역신이 내 고개에 · 7초 뒤 떠남');
    view().yeoksin = { stage: 1, hp: 6632, maxHp: 7480, seat: 2, enterTick: 5000, nextSeat: 3 };
    frame();
    frame();
    expect($('#gate-near')!.textContent).toBe('');
  });

  test('stage x 232 in the fixed row, also with a pillar window open', () => {
    const css = readFileSync(resolve(here, '../src/ui/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const left = (sel: string) => {
      const rules = css.split('}').filter(r => r.split('{')[0]!.split(',').map(x => x.trim()).includes(sel));
      const found = rules.map(r => /(?:^|[;\s{])left:\s*(-?\d+)px/.exec(r.split('{')[1] ?? '')?.[1]).filter(Boolean);
      return Number(found.at(-1));
    };
    expect(left('#slot-row') + left('#gate-near')).toBe(232);
    expect(left('#stage.pillar-open #slot-row') + left('#stage.pillar-open #gate-near')).toBe(232);
  });
});
