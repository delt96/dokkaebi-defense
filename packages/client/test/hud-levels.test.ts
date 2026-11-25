// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, loadGameData, type GameState } from '@dorandi/logic';
import { forceRound, spawnEnemyForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { gameAudio } from '../src/audio/engine';
import { renderAlert, renderHud } from '../src/ui/hud';
import { hudModel } from '../src/ui/models';
import { mountUi } from '../src/ui/mount';
import { STAGE_HTML } from './fixtures/net';

const d3 = loadGameData('stage3');

function withEnemies(n: number, s: GameState = createGame(d3, 1)): GameState {
  if (s.phase !== 'round') forceRound(s, 30);
  for (let i = 0; i < n; i++) spawnEnemyForTest(s, 'japgwi', 0);
  return s;
}

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);

function withBoss(round: number, n: number): GameState {
  const s = createGame(d3, 1);
  forceRound(s, round);
  s.enemies = [];
  const boss = spawnEnemyForTest(s, 'jinegaksi', 0, 24000);
  boss.hp = 18400;
  for (let i = 0; i < n; i++) spawnEnemyForTest(s, 'japgwi', 0);
  return s;
}

describe('the boss label in the top bar', () => {
  const pick = (s: GameState) => { const { bossText, bossTitle } = hudModel(s); return { bossText, bossTitle }; };

  test('reads in full until the resist line or the danger step needs the room', () => {
    expect(pick(withBoss(10, 31))).toEqual({ bossText: '보스 체력 18400 / 24000', bossTitle: '보스 체력 18400 / 24000' });
    expect(pick(withBoss(10, 58))).toEqual({ bossText: '보스 18400', bossTitle: '보스 체력 18400 / 24000' });
    expect(pick(withBoss(10, 63)).bossText).toBe('보스 체력 18400 / 24000');
    const late = withBoss(61, 10);
    expect(hudModel(late).resistText).not.toBeNull();
    expect(pick(late)).toEqual({ bossText: '보스 18400', bossTitle: '보스 체력 18400 / 24000' });
  });

  test('no living boss, no label', () => {
    expect(pick(withEnemies(31))).toEqual({ bossText: null, bossTitle: null });
    const s = withBoss(10, 5);
    s.enemies.find(e => e.boss)!.hp = 0;
    expect(pick(s)).toEqual({ bossText: null, bossTitle: null });
  });
});

describe('solo HUD in three steps', () => {
  beforeEach(() => { document.body.innerHTML = STAGE_HTML; });

  test.each([
    [47, 'lv-ok', null],
    [48, 'lv-warn', '· 주의'],
    [58, 'lv-danger', '· 2마리 남음'],
    [60, 'lv-danger', '· 한계'],
    [63, 'lv-over', '· 초과'],
  ] as const)('%i enemies: %s, tail %s', (n, cls, tail) => {
    renderHud(withEnemies(n), false);
    const enemies = $('#top .enemies')!;
    expect(enemies.classList.contains(cls)).toBe(true);
    expect(enemies.querySelector('.n')!.textContent).toBe(String(n));
    expect(enemies.querySelector('.tail')?.textContent ?? null).toBe(tail);
    expect($('#top .gauge')!.classList.contains(cls)).toBe(true);
  });

  test('a calm count reads as before: no tail, the same words', () => {
    renderHud(withEnemies(47), false);
    expect($('#top .enemies')!.textContent).toBe('내 잡귀 47 / 60');
    expect($('#top .gauge-text')!.textContent).toBe('장승 금 감');
  });

  test('the 장승 word hides in danger and comes back as 무너짐 over the limit', () => {
    renderHud(withEnemies(58), false);
    expect($('#top .gauge-text')).toBeNull();
    expect($('#top .gauge')!.title).toBe('장승: 금 감');
    renderHud(withEnemies(63), false);
    expect($('#top .gauge-text')!.textContent).toBe('장승 무너짐');
  });

  test('the top bar shortens the boss and drops the 장승 word only where the design says', () => {
    renderHud(withBoss(10, 31), false);
    expect($('#top .boss')!.textContent).toBe('보스 체력 18400 / 24000');
    expect($('#top .boss')!.title).toBe('보스 체력 18400 / 24000');
    renderHud(withBoss(10, 58), false);
    expect($('#top .boss')!.textContent).toBe('보스 18400');
    expect($('#top .boss')!.title).toBe('보스 체력 18400 / 24000');
    expect($('#top .gauge-text')).toBeNull();
    renderHud(withBoss(10, 63), false);
    expect($('#top .boss')!.textContent).toBe('보스 체력 18400 / 24000');
    expect($('#top .gauge-text')!.textContent).toBe('장승 무너짐');
    const last = Array.from($('#top .hud')!.children).slice(-2);
    expect(last.map(c => c.classList.contains('settings-open'))).toEqual([true, false]);
    expect(last[1]!.classList.contains('menu-btn')).toBe(true);
  });

  test('no living boss, no boss label in the bar', () => {
    renderHud(withEnemies(31), false);
    expect($('#top .boss')).toBeNull();
  });

  test('the second argument draws the pill', () => {
    renderHud(withEnemies(31), true);
    expect($('#top .time .pill')!.textContent).toBe('멈춤');
    renderHud(withEnemies(31), false);
    expect($('#top .pill')).toBeNull();
  });

  test.each([[30, []], [48, ['warn']], [58, ['danger']], [63, ['on']]] as const)('the edge at %i: %j', (n, classes) => {
    renderAlert(withEnemies(n));
    expect(Array.from($('#alert')!.classList)).toEqual(classes);
  });

  test('over the limit the countdown box says how many to cut', () => {
    renderAlert(withEnemies(63));
    expect($('#alert .countdown')!.textContent).toBe('잡귀 한도 초과5초3마리 줄이면 멈춤');
    expect($('#alert .countdown .cut')!.textContent).toBe('3마리 줄이면 멈춤');
  });

  test('still holds the breathing edge', () => {
    const s = withEnemies(58);
    renderAlert(s, { still: true });
    expect($('#alert')!.classList.contains('still')).toBe(true);
    renderAlert(s);
    expect($('#alert')!.classList.contains('still')).toBe(false);
  });

  test('no edge once the game has ended', () => {
    const s = withEnemies(58);
    s.phase = 'ended';
    renderAlert(s);
    expect(Array.from($('#alert')!.classList)).toEqual([]);
  });
});

class FakeScene {
  selectedId: number | null = null;
  storageCovered = false;
  pulseHeld = false;
  shakeJangseung = false;
  reduceEffects = false;
  onFrame?: () => void;
  onSelect(): void {}
  onEvents(): void {}
  showGambleResult(): void {}
  showBirth(): void {}
  hideBirth(): void {}
  setNoticeSpan = vi.fn();
}

let clock = 1000;
const listeners: [string, EventListenerOrEventListenerObject][] = [];
describe('mount picks the one moving thing and rings once on going over', () => {
  beforeEach(() => {
    const add = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => {
      listeners.push([type, fn]);
      add(type, fn, o);
    });
    document.body.innerHTML = STAGE_HTML;
    clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });
  afterEach(() => {
    for (const [type, fn] of listeners.splice(0)) window.removeEventListener(type, fn);
    vi.restoreAllMocks();
  });

  function mountSolo() {
    const s = createGame(d3, 1);
    forceRound(s, 30);
    const scene = new FakeScene();
    const play = vi.spyOn(gameAudio, 'play').mockImplementation(() => {});
    mountUi(new GameDriver(s), scene as never);
    const frame = (): void => { clock += 150; scene.onFrame?.(); };
    return { s, scene, play, frame };
  }

  test('the danger edge breathes and the ▲ holds still; a calm board leaves the ▲ to breathe', () => {
    const { s, scene, frame } = mountSolo();
    withEnemies(30, s);
    frame();
    expect(scene.pulseHeld).toBe(false);
    expect($('#alert')!.className).toBe('');
    withEnemies(28, s);
    frame();
    expect(scene.pulseHeld).toBe(true);
    expect(scene.shakeJangseung).toBe(false);
    expect($('#alert')!.className).toBe('danger');
  });

  test('over the limit the 장승 shakes, the edge holds, and limitOver plays once', () => {
    const { s, scene, play, frame } = mountSolo();
    withEnemies(60, s);
    frame();
    expect(play.mock.calls.filter(c => c[0] === 'limitOver')).toHaveLength(0);
    withEnemies(1, s);
    frame();
    frame();
    expect(play.mock.calls.filter(c => c[0] === 'limitOver')).toHaveLength(1);
    expect(scene.shakeJangseung).toBe(true);
    expect(scene.pulseHeld).toBe(true);
  });

  test('reduce effects stops the shake and holds the edge', () => {
    const { s, scene, frame } = mountSolo();
    scene.reduceEffects = true;
    withEnemies(58, s);
    frame();
    expect($('#alert')!.classList.contains('still')).toBe(true);
    withEnemies(5, s);
    frame();
    expect(scene.shakeJangseung).toBe(false);
  });
});
