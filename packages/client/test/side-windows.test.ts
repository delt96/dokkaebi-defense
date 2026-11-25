// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import { forceRound, placeUnitForTest, withoutMarketLock } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { NetClient } from '../src/net/NetClient';
import { NetDriver } from '../src/net/NetDriver';
import { mountUi } from '../src/ui/mount';
import { FakeRoom, STAGE_HTML, data as netData, fixtureFull, key, press } from './fixtures/net';

class FakeScene {
  selectedId: number | null = null;
  storageCovered = false;
  onFrame?: () => void;
  private selectCb: ((slot: number | null) => void) | null = null;
  onSelect(cb: (slot: number | null) => void): void { this.selectCb = cb; }
  onEvents(): void {}
  showGambleResult(): void {}
  showBirth(): void {}
  setNoticeSpan = vi.fn();
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

function mountSolo(data = loadGameData('stage3')) {
  const s = createGame(data, 1);
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

  test('a pillar window narrows the notice zone; outside windows do not', () => {
    const { scene } = mountSolo();
    const stage = $('#stage')!;
    expect(stage.classList.contains('pillar-open')).toBe(false);
    expect(scene.setNoticeSpan).not.toHaveBeenCalled();
    key('KeyE');
    expect(stage.classList.contains('pillar-open')).toBe(true);
    expect(scene.setNoticeSpan.mock.calls).toEqual([[true]]);
    key('KeyE');
    expect(stage.classList.contains('pillar-open')).toBe(false);
    expect(scene.setNoticeSpan.mock.calls).toEqual([[true], [false]]);
    document.documentElement.dataset.wins = 'outside';
    key('KeyE');
    expect(upgrades()).not.toBeNull();
    expect(stage.classList.contains('pillar-open')).toBe(false);
    expect(scene.setNoticeSpan.mock.calls).toEqual([[true], [false]]);
  });

  test('style.css narrows the zone under .pillar-open and keeps the chip row narrow in the pillar layout', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/ui/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = (sel: string) => css.split('}').find(r => r.split('{')[0]!.split(',').map(x => x.trim()).includes(sel))?.split('{')[1] ?? '';
    for (const sel of ['#stage.pillar-open #round-banner', '#stage.pillar-open #econ-top']) {
      expect(rule(sel)).toContain('left: 200px');
      expect(rule(sel)).toMatch(/(^|[^-])width: 254px/);
    }
    expect(rule('#stage.pillar-open #tame-anchor:not(.floating)')).toContain('left: 200px');
    expect(rule('#stage.pillar-open #tame-anchor:not(.floating)')).toContain('max-width: 254px');
    expect(rule('#stage.pillar-open .countdown')).toContain('left: 327px');
    expect(rule('#stage.pillar-open .countdown')).toContain('max-width: 254px');
    expect(rule(':root[data-wins="inside"] #econ-bottom')).toMatch(/left: 200px;.*(^|[^-])width: 254px/s);
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

  test('J opens 퀘스트 in #win-right; its 소환 sends hunt while the board keeps running', () => {
    const { s, queue, frame } = mountSolo();
    forceRound(s, 15);
    s.spawned = s.data.balance.spawnCount;
    frame();
    const quests = () => $('#win-right .win.quest-modal');
    key('KeyJ');
    expect(quests()).not.toBeNull();
    expect($('#win-right-title')!.textContent).toBe('퀘스트 (J)');
    expect($('#modal')!.innerHTML).toBe('');
    expect($('#lane')!.inert).toBe(false);
    // the pillar bar sits under the head on the board
    expect(quests()!.querySelector('.win-bar [data-action="summon"]')).not.toBeNull();
    press($('#win-right .hunt-row [data-action="hunt"]'));
    expect(queue).toHaveBeenCalledWith({ type: 'hunt', enemy: 'ev_soebap' });
    key('Space');
    expect(queue).toHaveBeenCalledWith({ type: 'summon' });
    key('KeyJ');
    expect(quests()).toBeNull();
    key('KeyE');
    key('KeyJ');
    expect(quests()).not.toBeNull();
    expect(upgrades()).toBeNull();
  });

  test('a box line opens the list on its row and scrolls to it, also when the list is already open', () => {
    const { s, frame } = mountSolo();
    forceRound(s, 15);
    s.spawned = s.data.balance.spawnCount;
    document.documentElement.dataset.wins = 'outside';
    frame();
    const scrolled: Element[] = [];
    const proto = HTMLElement.prototype as { scrollIntoView?: (o?: unknown) => void };
    const before = proto.scrollIntoView;
    proto.scrollIntoView = function (this: Element) { scrolled.push(this); };
    try {
      key('KeyJ');
      expect(scrolled).toHaveLength(0);
      press($('#right .quest-box .quest-more'));
      const row = $('#win-right .quest-row.focus')!;
      expect(row.dataset.quest).toBe('hunts');
      expect(scrolled).toEqual([row]);
      expect($('#win-right .win.quest-modal')).not.toBeNull();
      frame();
      expect(scrolled).toHaveLength(1);
    } finally {
      proto.scrollIntoView = before;
    }
    // the outside layout has no pillar bar; the close button hands the focus back to the box head
    expect($('#win-right .win-bar')).toBeNull();
    const close = $<HTMLButtonElement>('#win-right .win-close')!;
    close.focus();
    press(close);
    expect($('#win-right .quest-modal')).toBeNull();
    expect(document.activeElement).toBe($('#right .quest-box .panel-title'));
  });

  test('the market sits on the right with the bar inside and the wallet outside', () => {
    const { s, frame } = mountSolo(withoutMarketLock(loadGameData('stage3')));
    s.buckwheat = 7;
    const opener = $<HTMLButtonElement>('#right [data-action="toggleMarket"]')!;
    opener.focus();
    press(opener);
    const market = () => $('#win-right .win.market.econ-panel');
    expect(market()).not.toBeNull();
    expect(market()!.getAttribute('role')).toBe('dialog');
    expect(market()!.getAttribute('aria-labelledby')).toBe('win-right-title');
    expect($('#win-right-title')!.textContent).toBe('장터 (B)');
    expect(market()!.querySelector('.win-bar [data-action="summon"]')).not.toBeNull();
    expect(market()!.querySelector('.win-body.econ-body')).not.toBeNull();
    // opening does not pull the focus into the window, so Space keeps summoning
    expect($('#win-right')!.contains(document.activeElement)).toBe(false);
    // a redraw of the window (the token count changed) keeps the focus on the same button
    $<HTMLButtonElement>('#win-right .win-bar [data-action="summon"]')!.focus();
    s.tokens += 1;
    frame();
    expect(document.activeElement).toBe($('#win-right .win-bar [data-action="summon"]'));
    document.documentElement.dataset.wins = 'outside';
    frame();
    expect(market()!.querySelector('.win-bar')).toBeNull();
    expect(market()!.querySelector('.win-head')!.textContent).toContain('엽전 5000 · 묵 7');
    key('KeyB');
    expect(market()).toBeNull();
    key('KeyB');
    expect($('#win-right')!.contains(document.activeElement)).toBe(false);
  });

  test('inside, 최근 결과 folds to one line and opens on press; outside it stays open', () => {
    const { s, driver, frame } = mountSolo(withoutMarketLock(loadGameData('stage3')));
    s.buckwheat = 7;
    key('KeyB');
    for (let i = 0; i < 2; i++) {
      press($('#win-right [data-action="gambleUnit"][data-arg="small"]'));
      driver.update(50);
      clock += 1000;
      frame();
    }
    const history = () => $('#win-right .gamble-history')!;
    expect(history().textContent!.trim()).toBe('최근 결과 ▸ 2개');
    expect(history().querySelectorAll('li')).toHaveLength(0);
    const toggle = $<HTMLButtonElement>('#win-right [data-action="marketHistory"]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.focus();
    press(toggle);
    expect(history().querySelectorAll('li')).toHaveLength(2);
    const open = $<HTMLButtonElement>('#win-right [data-action="marketHistory"]')!;
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(open);
    press(open);
    expect(history().querySelectorAll('li')).toHaveLength(0);
    document.documentElement.dataset.wins = 'outside';
    frame();
    expect(history().querySelectorAll('li')).toHaveLength(2);
    expect($('#win-right [data-action="marketHistory"]')).toBeNull();
  });

  test('B replaces another right window', () => {
    mountSolo(withoutMarketLock(loadGameData('stage3')));
    key('KeyE');
    expect(upgrades()).not.toBeNull();
    key('KeyB');
    expect($('#win-right .econ-panel')).not.toBeNull();
    expect(upgrades()).toBeNull();
    key('KeyE');
    expect($('#win-right .econ-panel')).toBeNull();
    expect(upgrades()).not.toBeNull();
  });

  test('a purchase while the market is open goes through and the board stays live', () => {
    const { s, queue } = mountSolo(withoutMarketLock(loadGameData('stage3')));
    s.buckwheat = 7;
    key('KeyB');
    expect($('#lane')!.inert).toBe(false);
    press($('#win-right .gamble-buy[data-arg="small"]'));
    expect(queue).toHaveBeenCalledWith({ type: 'gambleUnit', table: 'small' });
    key('Space');
    expect(queue).toHaveBeenCalledWith({ type: 'summon' });
  });

  test('a left pillar covers the left panel and storage, frees the focus there and refuses storage drops', () => {
    const { s, scene, frame } = mountSolo();
    placeUnitForTest(s, s.data.units.find(u => u.grade === 1)!.id, 0);
    scene.select(0);
    const scopeBtn = $<HTMLButtonElement>('#left .scope-btn')!;
    scopeBtn.focus();
    expect(document.activeElement).toBe(scopeBtn);
    press($('#left [data-action="unitDetails"]'));
    expect($('#win-left .unit-details')).not.toBeNull();
    expect($('#left')!.inert).toBe(true);
    expect($('#storage')!.inert).toBe(true);
    expect($('#left')!.contains(document.activeElement)).toBe(false);
    expect(scene.storageCovered).toBe(true);
    // a redraw does not hand the focus back into the covered panel
    frame();
    expect($('#left')!.contains(document.activeElement)).toBe(false);
    key('Tab');
    expect($('#win-left .unit-details')).toBeNull();
    expect($('#left')!.inert).toBe(false);
    expect($('#storage')!.inert).toBe(false);
    expect(scene.storageCovered).toBe(false);
    document.documentElement.dataset.wins = 'outside';
    frame();
    key('Tab');
    expect($('#win-left .unit-details')).not.toBeNull();
    expect($('#left')!.inert).toBe(false);
    expect($('#storage')!.inert).toBe(false);
    expect(scene.storageCovered).toBe(false);
  });

  test('상세 and the market together; Esc closes the one opened last first', () => {
    const { s, scene } = mountSolo(withoutMarketLock(loadGameData('stage3')));
    const unit = placeUnitForTest(s, s.data.units.find(u => u.grade === 1)!.id, 0);
    scene.select(0);
    key('Tab');
    key('KeyB');
    expect($('#win-left .unit-details')).not.toBeNull();
    expect($('#win-right .econ-panel')).not.toBeNull();
    key('Escape');
    expect($('#win-right .econ-panel')).toBeNull();
    expect($('#win-left .unit-details')).not.toBeNull();
    key('Escape');
    expect($('#win-left .unit-details')).toBeNull();
    expect(scene.selectedId).toBe(unit.id);
  });

  test('closing 상세 with its close button gives the focus to the 상세 button', () => {
    const { s, scene } = mountSolo();
    placeUnitForTest(s, s.data.units.find(u => u.grade === 1)!.id, 0);
    scene.select(0);
    key('Tab');
    const close = $<HTMLButtonElement>('#win-left .win-close')!;
    close.focus();
    press(close);
    expect($('#win-left .unit-details')).toBeNull();
    expect(document.activeElement).toBe($('#left [data-action="unitDetails"]'));
  });

  test('closing the market from inside gives the focus to the 장터 (B) button', () => {
    mountSolo(withoutMarketLock(loadGameData('stage3')));
    document.documentElement.dataset.wins = 'outside';
    key('KeyB');
    const close = $<HTMLButtonElement>('#win-right .win-close')!;
    close.focus();
    press(close);
    expect($('#win-right .econ-panel')).toBeNull();
    expect(document.activeElement).toBe($('#right [data-action="toggleMarket"]'));
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

  test('the helper on the board (helper-pop) does not narrow the notice zone', () => {
    const room = new FakeRoom();
    const full = fixtureFull();
    const net = new NetClient(room, full.dataVersion);
    room.emit('full', full);
    const driver = new NetDriver(net, netData, () => clock);
    driver.update(16);
    const scene = new FakeScene();
    mountUi(driver, scene as never, {}, { online: true, view: () => net.view, data: netData, actions: { support: vi.fn(), watch: vi.fn(), forfeit: vi.fn() } });
    key('KeyQ');
    expect($('#left .helper-pop')).not.toBeNull();
    expect($('#stage')!.classList.contains('pillar-open')).toBe(false);
    expect(scene.setNoticeSpan).not.toHaveBeenCalled();
    key('KeyE');
    expect($('#stage')!.classList.contains('pillar-open')).toBe(true);
    expect(scene.setNoticeSpan.mock.calls).toEqual([[true]]);
  });
});
