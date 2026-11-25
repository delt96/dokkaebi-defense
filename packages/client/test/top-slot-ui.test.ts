// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, loadGameData, type GameEvent, type GameState, type StepResult } from '@dorandi/logic';
import { forceRound, spawnEnemyForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { NetClient } from '../src/net/NetClient';
import { NetDriver } from '../src/net/NetDriver';
import { gameAudio } from '../src/audio/engine';
import { BIRTH_MS } from '../src/ui/birth';
import { mountUi } from '../src/ui/mount';
import { FakeRoom, STAGE_HTML, data as netData, fixtureFull, key } from './fixtures/net';

const d3 = loadGameData('stage3');
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

type Listener = (events: GameEvent[], rejected: StepResult['rejected']) => void;

function mountSolo(round = 3) {
  const s = createGame(d3, 1);
  forceRound(s, round);
  const driver = new GameDriver(s);
  const scene = new FakeScene();
  const play = vi.spyOn(gameAudio, 'play').mockImplementation(() => {});
  mountUi(driver, scene as never);
  const frame = (ms = 150): void => { clock += ms; scene.onFrame?.(); };
  const emit = (...events: GameEvent[]) => {
    for (const cb of (driver as unknown as { listeners: Listener[] }).listeners) cb(events, []);
  };
  return { s, driver, scene, play, frame, emit };
}

function mountOnline() {
  const room = new FakeRoom();
  const full = fixtureFull();
  const net = new NetClient(room, full.dataVersion);
  room.emit('full', full);
  const driver = new NetDriver(net, netData, () => clock);
  driver.update(16);
  const scene = new FakeScene();
  const play = vi.spyOn(gameAudio, 'play').mockImplementation(() => {});
  mountUi(driver, scene as never, {}, { online: true, view: () => net.view, data: netData, actions: { support: vi.fn(), watch: vi.fn(), forfeit: vi.fn() } });
  const frame = (ms = 150, step = true): void => { clock += ms; if (step) driver.update(16); scene.onFrame?.(); };
  return { room, net, driver, scene, play, frame };
}

/** Counts writes to the element's textContent from now on. */
function countWrites(node: HTMLElement): () => number {
  let proto: object | null = Object.getPrototypeOf(node);
  let desc: PropertyDescriptor | undefined;
  while (proto && !(desc = Object.getOwnPropertyDescriptor(proto, 'textContent'))) proto = Object.getPrototypeOf(proto);
  let writes = 0;
  Object.defineProperty(node, 'textContent', {
    configurable: true,
    get() { return desc!.get!.call(this); },
    set(v: string) { writes++; desc!.set!.call(this, v); },
  });
  return () => writes;
}

function withEnemies(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) spawnEnemyForTest(s, 'japgwi', 0);
}

describe('the top slot over the lane', () => {
  test('the round banner and a note share one slot, the note waits', () => {
    const { emit, frame } = mountSolo();
    emit({ type: 'roundStart', round: 4 } as GameEvent);
    emit({ type: 'jigeSwap', defId: 'sotlid' } as unknown as GameEvent);
    frame();
    expect(slotText()).toContain('4라운드');
    expect(slotText()).not.toContain('지게로');
    frame(1800);
    expect(slotText()).toContain('지게로');
    expect(slotText()).not.toContain('4라운드');
  });

  test('only #slot-say speaks, and only when the sentence changes', () => {
    const { emit, frame } = mountSolo();
    const say = $('#slot-say')!;
    expect(say.getAttribute('role')).toBe('status');
    expect(say.getAttribute('aria-atomic')).toBe('true');
    expect(say.classList.contains('sr-only')).toBe(true);
    const writes = countWrites(say);
    emit({ type: 'roundStart', round: 4 } as GameEvent);
    frame();
    frame();
    frame();
    expect(writes()).toBe(1);
    expect(say.textContent).toBe(slotText().replace(/\n/g, ' · '));
    expect(say.textContent).not.toContain('\n');
    expect(document.querySelectorAll('#stage [aria-live], #stage [role="status"]').length).toBe(1);
    expect($('#round-banner')!.getAttribute('aria-hidden')).toBe('true');
    expect($('#round-banner')!.hasAttribute('aria-live')).toBe(false);
  });

  test('index.html leaves the banner silent', () => {
    const html = readFileSync(resolve(here, '../index.html'), 'utf8');
    const tag = html.match(/<div id="round-banner"[^>]*>/)![0];
    expect(tag).toContain('aria-hidden="true"');
    expect(tag).not.toContain('aria-live');
  });

  test('a phaser toast lands in the slot', () => {
    const { scene, frame } = mountSolo();
    scene.onToast!('★ 귀교 목수', 0xffe35a);
    frame();
    expect(slotText()).toContain('★ 귀교 목수');
    frame(1500);
    expect(slotText()).toBe('');
  });

  test('a banner over two lines keeps them and marks its tail', () => {
    const { emit, frame } = mountSolo();
    emit({ type: 'roundStart', round: 4 } as GameEvent);
    frame();
    const text = $('#round-banner .slot-text')!;
    expect(text.textContent).toBe('3라운드 종료 · +' + d3.balance.coins.roundEnd + '냥\n4라운드');
  });

  test('the slot is emptied when the game ends', () => {
    const { s, emit, frame } = mountSolo();
    emit({ type: 'roundStart', round: 4 } as GameEvent);
    frame();
    expect(slotText()).not.toBe('');
    s.phase = 'ended';
    frame();
    expect(slotText()).toBe('');
    s.phase = 'round';
    frame();
    expect(slotText()).toBe('');
  });
});

describe('births', () => {
  const birth = (seat: number, name: string) => ({ kind: 'birth', seat, name, defId: 'jumadeung', unitId: 3, via: 'combine', firstSix: false });

  test('my birth takes the slot before a waiting banner and is handed to the scene once', () => {
    const { room, net, scene, frame } = mountOnline();
    scene.onToast!('★ 화로', 0xffd28a);
    frame();
    expect(slotText()).toContain('★ 화로');
    net.view!.clock.round++;
    room.emit('notice', birth(1, '하나'));
    frame();
    expect(scene.showBirth).not.toHaveBeenCalled();
    frame(1500);
    expect(scene.showBirth).toHaveBeenCalledTimes(1);
    expect(scene.showBirth.mock.calls[0]![0]).toMatchObject({ who: '조합', title: '주마등', mine: true });
    // the band is drawn on the board; the slot holds no words over it
    expect(slotText()).toBe('');
    expect($('#slot-say')!.textContent).toBe('조합 · 4등급 · 마딜 · 주마등');
    frame();
    frame();
    expect(scene.showBirth).toHaveBeenCalledTimes(1);
    frame(BIRTH_MS);
    expect(slotText()).toContain('라운드');
  });

  test('a peer birth shows no band and plays sparkle only', () => {
    const { room, scene, play, frame } = mountOnline();
    room.emit('notice', birth(2, 'two'));
    frame();
    frame(BIRTH_MS);
    expect(scene.showBirth).not.toHaveBeenCalled();
    const sounds = play.mock.calls.map(c => c[0]);
    expect(sounds).toContain('sparkle');
    expect(sounds).not.toContain('combineBig');
    expect(slotText()).toBe('');
  });
});

describe('the fixed row under the slot', () => {
  test('61마리면 바로 패배 from round 65 in danger, on the right of the fixed row', () => {
    const late = mountSolo(65);
    withEnemies(late.s, 58);
    late.frame();
    const row = $('#slot-row')!;
    expect(row.querySelector('#gate-near')).not.toBeNull();
    expect(row.querySelector('#limit-instant')!.textContent).toBe('61마리면 바로 패배');
    late.s.phase = 'ended';
    late.frame();
    expect($('#limit-instant')!.textContent).toBe('');
  });

  test('no 61 line before round 65 or below danger', () => {
    const early = mountSolo(64);
    withEnemies(early.s, 58);
    early.frame();
    expect($('#limit-instant')!.textContent).toBe('');
    document.body.innerHTML = STAGE_HTML;
    const calm = mountSolo(65);
    withEnemies(calm.s, 50);
    calm.frame();
    expect($('#limit-instant')!.textContent).toBe('');
  });

  test('a pillar window narrows the fixed row; a P pause lifts the narrowing again', () => {
    document.documentElement.dataset.wins = 'inside';
    mountSolo();
    const stage = $('#stage')!;
    key('KeyE');
    expect(stage.classList.contains('pillar-open')).toBe(true);
    key('KeyP');
    expect(stage.classList.contains('pillar-open')).toBe(false);
    key('KeyP');
    expect(stage.classList.contains('pillar-open')).toBe(true);
  });

  test('style.css places the two rows of the slot and narrows the fixed row with the pillars', () => {
    const css = readFileSync(resolve(here, '../src/ui/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = (sel: string) => css.split('}').filter(r => r.split('{')[0]!.split(',').map(x => x.trim()).includes(sel)).map(r => r.split('{')[1]).join(';');
    expect(rule('#slot-row')).toMatch(/left: 128px/);
    expect(rule('#slot-row')).toMatch(/top: 68px/);
    expect(rule('#slot-row')).toMatch(/(^|[^-])width: 400px/);
    expect(rule('#slot-row')).toMatch(/(^|[^-])height: 14px/);
    expect(rule('#slot-row')).toContain('pointer-events: none');
    expect(rule('#stage.pillar-open #slot-row')).toContain('left: 200px');
    expect(rule('#stage.pillar-open #slot-row')).toMatch(/(^|[^-])width: 254px/);
    expect(rule('#round-banner')).toContain('top: 26px');
    expect(rule('#round-banner')).toMatch(/(^|[^-])height: 42px/);
    expect(rule('#round-banner .slot-text')).toContain('-webkit-line-clamp: 2');
  });
});
