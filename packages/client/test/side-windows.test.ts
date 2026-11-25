// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { NetClient } from '../src/net/NetClient';
import { NetDriver } from '../src/net/NetDriver';
import { mountUi } from '../src/ui/mount';
import { FakeRoom, STAGE_HTML, data as netData, fixtureFull, key, press } from './fixtures/net';

class FakeScene {
  selectedId: number | null = null;
  onFrame?: () => void;
  private selectCb: ((slot: number | null) => void) | null = null;
  onSelect(cb: (slot: number | null) => void): void { this.selectCb = cb; }
  onEvents(): void {}
  select(slot: number | null): void { this.selectCb?.(slot); }
}

let clock = 1000;
// each test mounts again; the keydown listeners of earlier mounts would still answer and redraw the shared page
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
const upgrades = () => $('#win-right .win.upgrades');

function mountSolo() {
  const s = createGame(loadGameData('stage3'), 1);
  forceRound(s, 3);
  s.coins = 5000;
  const driver = new GameDriver(s);
  const queue = vi.spyOn(driver, 'queue');
  const scene = new FakeScene();
  mountUi(driver, scene as never);
  const frame = (): void => { clock += 150; scene.onFrame?.(); };
  const sent = (type: string) => queue.mock.calls.filter(c => (c[0] as { type: string }).type === type);
  return { s, driver, queue, scene, frame, sent };
}

describe('solo side windows', () => {
  test('E opens 강화 in #win-right and the board keeps taking keys', () => {
    const { queue, sent } = mountSolo();
    key('KeyE');
    expect(upgrades()).not.toBeNull();
    expect($('#modal')!.innerHTML).toBe('');
    expect($('#lane')!.inert).toBe(false);
    expect($('#bottom')!.inert).toBe(false);
    expect($('#win-right')!.contains(document.activeElement)).toBe(false);
    key('Space');
    expect(queue).toHaveBeenCalledWith({ type: 'summon' });
    key('Digit1');
    expect(queue).toHaveBeenCalledWith({ type: 'upgrade', id: 'physical' });
    key('KeyE');
    expect(upgrades()).toBeNull();
    queue.mockClear();
    key('Digit1');
    expect(sent('upgrade')).toHaveLength(0);
  });

  test('the window is laid out as three stacked items with the pillar bar', () => {
    const { frame } = mountSolo();
    key('KeyE');
    const win = upgrades()!;
    expect(win.getAttribute('role')).toBe('dialog');
    expect(win.getAttribute('aria-labelledby')).toBe('win-right-title');
    expect(win.hasAttribute('aria-modal')).toBe(false);
    expect($('#win-right-title')!.textContent).toBe('강화 (E)');
    const items = win.querySelectorAll('.up-item');
    expect(items).toHaveLength(3);
    const first = items[0]!.textContent!;
    expect(first).toContain('1');
    expect(first).toContain('물딜 강화');
    expect(first).toContain('/');
    expect(win.querySelectorAll('.up-item button[data-action="upgrade"]')).toHaveLength(3);
    expect(win.querySelector('.win-bar [data-action="summon"]')).not.toBeNull();
    expect(win.querySelector('table')).toBeNull();
    document.documentElement.dataset.wins = 'outside';
    frame();
    const outside = upgrades()!;
    expect(outside.querySelector('.win-bar')).toBeNull();
    expect(outside.querySelector('.win-head')!.textContent).toContain('엽전 5000');
  });

  test('pillars make the covered panels inert, outside windows do not; a resize moves the inert with them', () => {
    const { frame } = mountSolo();
    key('KeyE');
    expect($('#right')!.inert).toBe(true);
    expect($('#target-overlay')!.inert).toBe(true);
    expect($('#left')!.inert).toBe(false);
    document.documentElement.dataset.wins = 'outside';
    frame();
    expect($('#right')!.inert).toBe(false);
    expect($('#target-overlay')!.inert).toBe(false);
    expect(upgrades()).not.toBeNull();
    document.documentElement.dataset.wins = 'inside';
    frame();
    expect($('#right')!.inert).toBe(true);
  });

  test('the dex, the settings, P and the end of the game lock the side windows without closing them', () => {
    const { sent } = mountSolo();
    key('KeyE');
    const box = $('#win-right')!;
    expect(box.inert).toBe(false);
    key('KeyD');
    expect(box.inert).toBe(true);
    expect(box.classList.contains('locked')).toBe(true);
    press(box.querySelector('[data-action="upgrade"]'));
    expect(sent('upgrade')).toHaveLength(0);
    key('KeyD');
    expect(box.inert).toBe(false);
    expect(box.classList.contains('locked')).toBe(false);
    expect(upgrades()).not.toBeNull();
    key('KeyP');
    expect(box.inert).toBe(true);
    key('KeyP');
    expect(box.inert).toBe(false);
  });

  test('P pause: digit keys and window buttons send nothing', () => {
    const { sent } = mountSolo();
    key('KeyE');
    key('KeyP');
    key('Digit1');
    press($('#win-right [data-action="upgrade"]'));
    press($('#win-right [data-action="summon"]'));
    expect(sent('upgrade')).toHaveLength(0);
    expect(sent('summon')).toHaveLength(0);
  });

  test('P then the settings: closing the settings keeps the pause', () => {
    const { driver } = mountSolo();
    key('KeyP');
    press($('#top [data-action="openSettings"]'));
    expect($('#modal .settings-pop')).not.toBeNull();
    key('Escape');
    expect($('#modal')!.innerHTML).toBe('');
    expect(driver.paused).toBe(true);
  });

  test('the game ending closes a locking window and locks the side windows', () => {
    const { s, frame } = mountSolo();
    key('KeyE');
    press($('#top [data-action="openSettings"]'));
    expect($('#modal .settings-pop')).not.toBeNull();
    s.phase = 'ended';
    s.result = { outcome: 'defeat', reason: 'limit', round: 3 };
    frame();
    expect($('#modal .settings-pop')).toBeNull();
    expect($('#modal .result')).not.toBeNull();
    expect(upgrades()).not.toBeNull();
    expect($('#win-right')!.inert).toBe(true);
  });

  test('Esc closes the dex, then the side window, then the selection', () => {
    const { s, scene } = mountSolo();
    const unit = placeUnitForTest(s, s.data.units.find(u => u.grade === 1)!.id, 0);
    scene.select(0);
    expect(scene.selectedId).toBe(unit.id);
    key('KeyE');
    key('KeyD');
    expect($('#modal .dex')).not.toBeNull();
    key('Escape');
    expect($('#modal')!.innerHTML).toBe('');
    expect(upgrades()).not.toBeNull();
    key('Escape');
    expect(upgrades()).toBeNull();
    expect(scene.selectedId).toBe(unit.id);
    key('Escape');
    expect(scene.selectedId).toBeNull();
  });

  test('closing with the close button gives the focus to the 강화 (E) button', () => {
    mountSolo();
    key('KeyE');
    const close = $<HTMLButtonElement>('#win-right .win-close')!;
    close.focus();
    expect(document.activeElement).toBe(close);
    press(close);
    expect(upgrades()).toBeNull();
    expect(document.activeElement).toBe($('#right [data-action="openUpgrades"]'));
  });
});

describe('online side windows', () => {
  test('a side window does not darken the board; a locking window still does', () => {
    const room = new FakeRoom();
    const full = fixtureFull();
    const net = new NetClient(room, full.dataVersion);
    room.emit('full', full);
    const driver = new NetDriver(net, netData, () => clock);
    driver.update(16);
    mountUi(driver, new FakeScene() as never, {}, { online: true, view: () => net.view, data: netData, actions: { support: vi.fn(), watch: vi.fn(), forfeit: vi.fn() } });
    key('KeyE');
    expect(upgrades()).not.toBeNull();
    expect($('#modal .modal')).toBeNull();
    press($('#top [data-action="openMenu"]'));
    expect($('#modal .modal')).not.toBeNull();
  });
});
