// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, loadGameData, type MatchResult } from '@dorandi/logic';
import { forceRound } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { gameAudio } from '../src/audio/engine';
import { NetClient } from '../src/net/NetClient';
import { NetDriver } from '../src/net/NetDriver';
import { mountResult } from '../src/online/result';
import { mountUi } from '../src/ui/mount';
import { FakeRoom, STAGE_HTML, data, fixtureFull, key, press } from './fixtures/net';

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
  hideBirth = vi.fn();
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
  vi.spyOn(gameAudio, 'play').mockImplementation(() => {});
});
afterEach(() => {
  for (const [type, fn] of listeners.splice(0)) window.removeEventListener(type, fn);
  delete document.documentElement.dataset.wins;
  vi.restoreAllMocks();
});

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const sceneText = () => $('#end-scene')?.textContent ?? '';

function mountSolo() {
  const s = createGame(loadGameData('stage3'), 1);
  forceRound(s, 3);
  const driver = new GameDriver(s);
  const scene = new FakeScene();
  mountUi(driver, scene as never);
  const frame = (ms = 150): void => { clock += ms; scene.onFrame?.(); };
  const end = (outcome: 'defeat' | 'clear' = 'defeat'): void => {
    s.phase = 'ended';
    s.result = outcome === 'clear' ? { outcome, reason: null, round: 3 } : { outcome, reason: 'limit', round: 3 };
    frame();
  };
  return { s, frame, end };
}

const result = (outcome: MatchResult['outcome']): MatchResult => ({ outcome, tick: 7799, round: 9, yeoksinKills: 0, started: 2, alive: 1, seats: [
  { seat: 1, outcome: 'aliveTeamLoss', cause: null, round: 9, lastEnemies: 20, maxEnemies: 40, series: [1, 2, 3], bestUnit: null, yeoksinDamage: 0, helperOpens: 0, supportSent: 0, supportReceived: 0 },
  { seat: 2, outcome: 'eliminated', cause: 'limit', round: 4, lastEnemies: 61, maxEnemies: 61, series: [5, 61], bestUnit: null, yeoksinDamage: 0, helperOpens: 0, supportSent: 0, supportReceived: 0 },
] });

function mountOnline(before: MatchResult | null = null) {
  const room = new FakeRoom();
  const full = fixtureFull();
  full.result = before;
  const net = new NetClient(room, full.dataVersion);
  room.emit('full', full);
  const driver = new NetDriver(net, data, () => clock);
  driver.update(16);
  const scene = new FakeScene();
  const ui = mountUi(driver, scene as never, {}, { online: true, view: () => net.view, data, actions: { support: vi.fn(), watch: vi.fn(), forfeit: vi.fn() } });
  const frame = (ms = 150): void => { clock += ms; driver.update(16); scene.onFrame?.(); };
  return { room, net, ui, frame };
}

describe('solo end scene', () => {
  test('solo defeat: 장승이 쓰러졌습니다 for 1.5 s, then the result window', () => {
    const { end, frame } = mountSolo();
    end();
    expect(sceneText()).toContain('장승이 쓰러졌습니다');
    expect(sceneText()).toContain('곧 결과 화면 · 누르면 바로');
    expect($('#stage')!.classList.contains('end-scene')).toBe(true);
    expect($('#modal .result')).toBeNull();
    frame(1300);
    expect($('#modal .result')).toBeNull();
    frame(200);
    expect($('#modal .result')).not.toBeNull();
    expect(sceneText()).toBe('');
  });

  test('a solo clear says 고개를 지켜 냈습니다', () => {
    const { end } = mountSolo();
    end('clear');
    expect(sceneText()).toContain('고개를 지켜 냈습니다');
  });

  test('a press, Enter or Esc skips to the result', () => {
    for (const skip of [() => press($('#end-scene')), () => key('Enter'), () => key('Escape')]) {
      document.body.innerHTML = STAGE_HTML;
      const { end } = mountSolo();
      end();
      expect($('#modal .result')).toBeNull();
      skip();
      expect($('#modal .result')).not.toBeNull();
      expect(sceneText()).toBe('');
      for (const [type, fn] of listeners.splice(0)) window.removeEventListener(type, fn);
    }
  });

  test('Esc during the scene skips it and leaves an open side window alone', () => {
    const { end } = mountSolo();
    key('KeyE');
    expect($('#win-right .win.upgrades')).not.toBeNull();
    end();
    expect($('#modal .result')).toBeNull();
    key('Escape');
    expect($('#modal .result')).not.toBeNull();
    expect($('#win-right .win.upgrades')).not.toBeNull();
  });

  test('the end closes the settings window and locks the side windows during the scene', () => {
    const { end } = mountSolo();
    key('KeyE');
    press($('#top [data-action="openSettings"]'));
    expect($('#modal .settings-pop')).not.toBeNull();
    end();
    expect($('#modal')!.innerHTML).toBe('');
    expect($('#win-right')!.inert).toBe(true);
    expect($('#win-right')!.classList.contains('locked')).toBe(true);
  });
});

describe('online end scene', () => {
  test('the end closes an open menu and locks the side windows', () => {
    const { room, frame } = mountOnline();
    press($('#top [data-action="openMenu"]'));
    expect($('#modal .modal')).not.toBeNull();
    room.emit('result', { result: result('wipe') });
    frame();
    expect($('#modal')!.innerHTML).toBe('');
    expect(sceneText()).toContain('모두 쓰러졌습니다');
    expect($('#win-right')!.classList.contains('locked')).toBe(true);
  });

  test('gate failure names the stage', () => {
    const { room, net, frame } = mountOnline();
    net.view!.gate = { ...net.view!.gate, stage: 1 };
    room.emit('result', { result: result('gate') });
    frame();
    expect(sceneText()).toContain('관문 실패 · 역신(첫째)을 막지 못했습니다');
  });

  test('the team result waits for the scene', () => {
    const { room, net, ui, frame } = mountOnline();
    const screen = $('#screen')!;
    mountResult(net, screen, data, vi.fn(), vi.fn(), cb => ui.afterEndScene(cb));
    room.emit('result', { result: result('clear') });
    frame();
    expect(sceneText()).toContain('고개를 지켜 냈습니다');
    expect(screen.querySelector('.result-screen')).toBeNull();
    frame(1600);
    expect(screen.querySelector('.result-screen')).not.toBeNull();
    expect(sceneText()).toBe('');
  });

  test('붙을 때 이미 끝난 판은 장면 없이 결과', () => {
    const { net, ui, frame } = mountOnline(result('gate'));
    frame();
    expect(sceneText()).toBe('');
    const cb = vi.fn();
    ui.afterEndScene(cb);
    expect(cb).toHaveBeenCalledOnce();
    const screen = $('#screen')!;
    mountResult(net, screen, data, vi.fn(), vi.fn(), show => ui.afterEndScene(show));
    expect(screen.querySelector('.result-screen')).not.toBeNull();
  });
});
