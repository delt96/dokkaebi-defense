// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { buildFull, createMatch, loadGameData, roundStartTick, type FullMsg } from '@dorandi/logic';
import { jumpToTick, placeUnitForTest, withoutMarketLock } from '@dorandi/logic/testing';
import { NetClient } from '../src/net/NetClient';
import { NetDriver } from '../src/net/NetDriver';
import { FORFEIT_TEXT, onlineActions } from '../src/online/spirit';
import { mountUi, type OnlineActions } from '../src/ui/mount';
import { unitCard } from '../src/ui/models';
import { FakeRoom, STAGE_HTML, data, fixtureFull, key, press } from './fixtures/net';

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
  clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  for (const [type, fn] of listeners.splice(0)) window.removeEventListener(type, fn);
  delete document.documentElement.dataset.wins;
  vi.restoreAllMocks();
});

function mountOnline(full: FullMsg = fixtureFull(), real = false) {
  const room = new FakeRoom();
  const net = new NetClient(room, full.dataVersion);
  room.emit('full', full);
  const driver = new NetDriver(net, data, () => clock);
  driver.update(16);
  const scene = new FakeScene();
  const actions: OnlineActions = real ? onlineActions(net) : { support: vi.fn(), watch: vi.fn(), forfeit: vi.fn() };
  mountUi(driver, scene as never, {}, { online: true, view: () => net.view, data, actions });
  /** One animation frame: the driver steps, then the 100 ms panel redraw runs. */
  const frame = (step = true): void => { clock += 150; if (step) driver.update(16); scene.onFrame?.(); };
  return { room, net, driver, scene, actions, frame, full };
}

describe('online mountUi', () => {
  test('a combine result stays selected when mine and a redraw come before the lane event (checkpoint 17-19, finding 1)', () => {
    const { room, driver, scene, frame, full } = mountOnline();
    scene.select(0);
    const oldId = driver.state.slots[0]!.id;
    expect(scene.selectedId).toBe(oldId);
    driver.queue({ type: 'combine', result: 'gamasot', slot: 0 });
    const tick = full.clock.tick + 1;
    const newUnit = { id: oldId + 100, defId: 'gamasot' };
    room.emit('mine', { ...structuredClone(full.mine), tick, lastSeq: 1, acks: [{ seq: 1, ok: true }], units: [newUnit, ...full.mine.units.slice(1)] });
    frame(false);
    frame();
    room.emit('lane', { n: full.n, seat: 1, batches: [{ tick, events: [{ t: 'combine', unitId: newUnit.id, defId: 'gamasot', slot: 0 }] }] });
    frame();
    expect(scene.selectedId).toBe(newUnit.id);
  });

  test('the menu opens the 40-unit dex; Q shows the helper and only then sends helperOpened (checkpoint 17-19, finding 3)', () => {
    const { room, driver } = mountOnline();
    press(document.querySelector('#top [data-action="openMenu"]'));
    const modal = document.getElementById('modal')!;
    // the helper and reduce-effects switches moved to the settings window
    expect(modal.querySelector('[data-action="toggleHelper"], [data-action="toggleFx"], [data-action="setHelper"]')).toBeNull();
    press(modal.querySelector('[data-action="openDex"]'));
    expect(modal.querySelectorAll('table.dex tbody tr')).toHaveLength(40);
    // online time is shared: the dex never pauses it
    expect(driver.paused).toBe(false);
    key('Escape');
    expect(modal.textContent).toBe('');
    key('KeyQ');
    expect(document.querySelector('#left .helper-pop')).not.toBeNull();
    expect(room.cmds('helperOpened')).toHaveLength(1);
    key('KeyQ');
    expect(document.querySelector('#left .helper-pop')).toBeNull();
    expect(room.cmds('helperOpened')).toHaveLength(1);
    key('KeyQ');
    expect(document.querySelector('#left .helper-pop .helper')).not.toBeNull();
    expect(document.querySelectorAll('#left .lane-row')).toHaveLength(6);
    expect(room.cmds('helperOpened')).toHaveLength(2);
  });

  test('online settings: the gear opens the helper and reduce-effects rows, no speed row', () => {
    const { room } = mountOnline();
    const modal = document.getElementById('modal')!;
    // the gear sits in the top bar, just before 메뉴
    const gear = document.querySelector('#top [data-action="openSettings"]')!;
    expect(gear.nextElementSibling?.getAttribute('data-action')).toBe('openMenu');
    expect(document.querySelector('#right [data-action="openSettings"]')).toBeNull();
    press(gear);
    expect(Array.from(modal.querySelectorAll('.settings-row')).map(r => r.getAttribute('data-setting'))).toEqual(['helper', 'fx', 'help']);
    expect(modal.querySelector('[data-action="speed"]')).toBeNull();
    press(gear);
    expect(modal.querySelector('.settings-row')).toBeNull();
    press(gear);
    press(modal.querySelector('[data-action="setHelper"][data-arg="on"]'));
    expect(document.querySelector('#left .helper-pop')).not.toBeNull();
    expect(room.cmds('helperOpened')).toHaveLength(1);
    // pressing 켬 again keeps it open and sends nothing more
    press(modal.querySelector('[data-action="setHelper"][data-arg="on"]'));
    expect(document.querySelector('#left .helper-pop')).not.toBeNull();
    expect(room.cmds('helperOpened')).toHaveLength(1);
    expect(modal.querySelector('.settings-row')).not.toBeNull();
    key('Escape');
    expect(modal.textContent).toBe('');
  });

  test('forfeit asks first: menu → 포기 sends one forfeit, 취소 sends none (checkpoint 17-19, finding 7)', () => {
    const { actions } = mountOnline();
    const modal = document.getElementById('modal')!;
    press(document.querySelector('#top [data-action="openMenu"]'));
    press(modal.querySelector('[data-action="askForfeit"]'));
    expect(modal.textContent).toContain(FORFEIT_TEXT);
    // Space is the summon key: a hand still mashing it must land on 취소, not 포기
    expect((document.activeElement as HTMLElement).dataset.action).toBe('closeModal');
    press(modal.querySelector('[data-action="closeModal"]'));
    expect(actions.forfeit).not.toHaveBeenCalled();
    expect(modal.textContent).toBe('');
    press(document.querySelector('#top [data-action="openMenu"]'));
    press(modal.querySelector('[data-action="askForfeit"]'));
    press(modal.querySelector('[data-action="forfeit"]'));
    expect(actions.forfeit).toHaveBeenCalledTimes(1);
    expect(modal.textContent).toBe('');
  });

  test('a spirit can pick only alive rows to watch (checkpoint 17-19, finding 7)', () => {
    const full = fixtureFull([1, 2, 3]);
    full.rows = full.rows.map(r => (r.seat === 1 || r.seat === 3 ? { ...r, status: 'spirit' as const } : r));
    const { actions } = mountOnline(full);
    const picks = Array.from(document.querySelectorAll<HTMLElement>('#left [data-action="watch"]'));
    expect(picks.map(p => p.dataset.arg)).toEqual(['2']);
    press(picks[0]!);
    expect(actions.watch).toHaveBeenCalledWith(2);
  });

  test('after a spirit sends its support, the card says who got it once the spent token comes back', () => {
    const full = fixtureFull([1, 2]);
    full.rows[0]!.status = 'spirit';
    full.watching = 2;
    full.mine.supportTokens = 1;
    const { room, frame } = mountOnline(full, true);
    press(document.querySelector('#bottom [data-action="support"]'));
    expect(room.cmds('support').map(c => c.args)).toEqual([{ target: 2 }]);
    const tick = full.clock.tick + 1;
    room.emit('mine', { ...structuredClone(full.mine), tick, supportTokens: 0, lastSeq: 1, acks: [{ seq: 1, ok: true }] });
    frame();
    expect(document.querySelector('#bottom')!.textContent).toContain(`2번에게 ${data.coop!.support.coins}냥을 보냈습니다`);
  });

  test('spectators see watch instructions instead of unusable battle controls', () => {
    const full = fixtureFull([1, 2]);
    full.rows[0]!.status = 'spirit';
    mountOnline(full);
    expect(document.querySelector('#right [data-action]')).toBeNull();
    // the gear in the top bar stays, so a spirit can still turn the effects down
    expect(document.querySelector('#top [data-action="openSettings"]')).not.toBeNull();
    expect(document.querySelector('#right')!.textContent).toContain('관전');
  });

  test('the online card lists only the keyed recipes and opens details from the overflow line', () => {
    const full = fixtureFull();
    ['bujigaengi', 'sotlid', 'horong', 'buchae', 'jipsin'].forEach((defId, i) => {
      full.mine.units[i] = { id: 30 + i, defId };
    });
    const { room, scene } = mountOnline(full);
    scene.select(0);
    // online the left panel holds the six lanes, so the unit card stays under the board
    const quick = Array.from(document.querySelectorAll('#bottom [data-action="combine"]'), btn => btn.textContent!.trim());
    expect(quick.map(text => text.slice(0, 3))).toEqual(['[Z]', '[X]', '[C]']);
    expect(document.querySelector('#bottom .recipe-more')!.textContent).toBe('+1개 더');
    expect(document.querySelector('#bottom')!.textContent).not.toContain('부족');
    expect(document.querySelector('#left .unit-panel')).toBeNull();
    press(document.querySelector('#bottom .recipe-more'));
    const options = document.querySelectorAll('#win-left .unit-details [data-action="combine"]');
    expect(options.length).toBeGreaterThan(3);
    expect(document.querySelector('#modal .modal')).toBeNull();
    press(options[3]!);
    expect(room.cmds('combine')[0]?.args).toMatchObject({ slot: 0, unitId: 30 });
    // the window does not lock the board, so a combine leaves it open on the selection
    expect(document.querySelector('#win-left .unit-details')).not.toBeNull();
  });

  test('inspecting a stored stack shows its info and sends nothing to the room', () => {
    const full = fixtureFull();
    full.mine.storage = [{ id: 30, defId: 'ki' }];
    const { room } = mountOnline(full);
    const before = room.sent.length;
    press(document.querySelector('#storage [data-stack="ki"]'));
    expect(document.querySelector('#bottom .storage-info')!.textContent).toContain('키 ×1');
    expect(room.sent).toHaveLength(before);
  });

  test('a spirit round banner does not promise the survivor coin reward', () => {
    const full = fixtureFull();
    full.rows[0]!.status = 'spirit';
    const { net, frame } = mountOnline(full);
    net.view!.clock.round++;
    frame();
    const banner = document.querySelector('#round-banner')!.textContent;
    expect(banner).toContain('2라운드');
    expect(banner).not.toContain('냥');
  });

  test('a survivor gets no watch rows (checkpoint 17-19, finding 7)', () => {
    mountOnline(fixtureFull([1, 2, 3]));
    expect(document.querySelectorAll('#left [data-action="watch"]')).toHaveLength(0);
  });

  test('the settings window holds the reduce-effects switch and pressing it flips the scene setting', () => {
    const { scene } = mountOnline();
    const fx = Object.assign(scene, { reduceEffects: false, setReduceEffects(on: boolean) { this.reduceEffects = on; } });
    press(document.querySelector('#top [data-action="openSettings"]'));
    const on = () => document.querySelector<HTMLButtonElement>('#modal [data-action="setFx"][data-arg="on"]')!;
    expect(on().getAttribute('aria-pressed')).toBe('false');
    press(on());
    expect(fx.reduceEffects).toBe(true);
    expect(on().getAttribute('aria-pressed')).toBe('true');
    expect(on().textContent).toBe('줄임');
  });

  test('online 도움말 끔 hides the hotkey line but not the unit card', () => {
    localStorage.clear();
    const { scene } = mountOnline();
    expect(document.getElementById('bottom')!.textContent).toContain('Space 소환');
    press(document.querySelector('#top [data-action="openSettings"]'));
    press(document.querySelector('#modal [data-action="setHelp"][data-arg="off"]'));
    key('Escape');
    expect(document.getElementById('bottom')!.textContent).toBe('');
    scene.select(0);
    expect(document.querySelector('#bottom [data-action="sell"]')).not.toBeNull();
    localStorage.clear();
  });

  test('20-round online dex: a material link jumps to its entry, opens its tree, and the back button returns', () => {
    mountOnline();
    press(document.querySelector('#top [data-action="openMenu"]'));
    const modal = document.getElementById('modal')!;
    press(modal.querySelector('[data-action="openDex"]'));
    const link = modal.querySelector<HTMLElement>('table.dex [data-action="dexGo"]')!;
    const [target, from] = link.dataset.arg!.split('@') as [string, string];
    const fromName = data.units.find(u => u.id === from)!.name;
    press(link);
    expect(modal.querySelector(`tr[data-dex-id="${target}"]`)!.classList.contains('dex-flash')).toBe(true);
    expect(modal.querySelector('.dex-back')!.textContent).toContain(`← ${fromName}`);
    press(modal.querySelector(`[data-action="dexTree"][data-arg="${from}"]`));
    expect(modal.querySelector(`tr[data-dex-id="${from}"] .dex-tree li`)).not.toBeNull();
    press(modal.querySelector('.dex-back'));
    expect(modal.querySelector('.dex-back')).toBeNull();
    expect(modal.querySelectorAll('table.dex tbody tr')).toHaveLength(40);
  });
});

describe('online helper and card off the next list', () => {
  const pop = () => document.querySelector<HTMLElement>('#left .helper-pop');
  const pressedScope = () => pop()?.querySelector('.scope-btn[aria-pressed="true"]')?.getAttribute('data-arg');
  /** Seat 1: sotlid at slot 0 and, unless left out, bujigaengi at slot 1 (together 가마솥). */
  function withUnits(defIds: string[] = ['sotlid', 'bujigaengi']) {
    const full = fixtureFull();
    full.mine.units = full.mine.units.map(() => null);
    defIds.forEach((defId, i) => { full.mine.units[i] = { id: 30 + i, defId }; });
    return mountOnline(full);
  }

  test('Q opens on 이 유닛 with a unit selected; Shift+Q flips the scope while it is open and sends nothing', () => {
    const { room, scene } = withUnits();
    scene.select(0);
    key('KeyQ');
    expect(pressedScope()).toBe('unit');
    expect(Array.from(pop()!.querySelectorAll('.scope-btn'), b => b.getAttribute('title'))).toEqual(['Shift+Q', 'Shift+Q']);
    expect(Array.from(pop()!.querySelectorAll('.scope-btn'), b => b.textContent)).toEqual(['이 유닛 1', '전체 1']);
    key('KeyQ', { shiftKey: true });
    expect(pressedScope()).toBe('all');
    key('KeyQ', { shiftKey: true });
    expect(pressedScope()).toBe('unit');
    key('KeyQ', { shiftKey: true });
    expect(room.cmds('helperOpened')).toHaveLength(1);
    // closing and opening again starts from the selection once more
    key('KeyQ');
    expect(pop()).toBeNull();
    key('KeyQ', { shiftKey: true });
    expect(pop()).toBeNull();
    key('KeyQ');
    expect(pressedScope()).toBe('unit');
    expect(room.cmds('helperOpened')).toHaveLength(2);
  });

  test('opened with nothing selected it shows 전체 and 이 유닛 stays off', () => {
    withUnits();
    key('KeyQ');
    expect(pressedScope()).toBe('all');
    expect(pop()!.querySelector<HTMLButtonElement>('.scope-btn[data-arg="unit"]')!.disabled).toBe(true);
    key('KeyQ', { shiftKey: true });
    expect(pressedScope()).toBe('all');
  });

  test('the rows are the combine buttons under group titles, with the selected unit keyed in 전체 too', () => {
    const { room, scene } = withUnits();
    key('KeyQ');
    expect(pop()!.querySelector('.next-group')).not.toBeNull();
    expect(pop()!.querySelector('li button, li')).toBeNull();
    const rows = Array.from(pop()!.querySelectorAll<HTMLElement>('[data-action="combine"]'));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.classList.contains('recipe-row')).toBe(true);
    key('KeyQ');
    scene.select(0);
    key('KeyQ');
    key('KeyQ', { shiftKey: true });
    const gamasot = pop()!.querySelector<HTMLElement>('[data-recipe="gamasot"]')!;
    expect(gamasot.textContent!.trimStart().startsWith('[Z]')).toBe(true);
    press(gamasot);
    expect(room.cmds('combine')[0]?.args).toMatchObject({ slot: 0, unitId: 30 });
  });

  test('one ready recipe: the card has the [Z] row only', () => {
    const { scene } = withUnits();
    scene.select(0);
    const quick = Array.from(document.querySelectorAll('#bottom [data-action="combine"]'), b => b.textContent!.trim());
    expect(quick).toHaveLength(1);
    expect(quick[0]!.startsWith('[Z]')).toBe(true);
    expect(document.querySelector('#bottom .recipe-more, #bottom .card-none')).toBeNull();
  });

  test('nothing ready: the card says so and points at Q, and leaves out the short recipes', () => {
    const { scene } = withUnits(['sotlid']);
    scene.select(0);
    expect(document.querySelector('#bottom .card-none')!.textContent).toBe('지금 가능 없음 · Q 도우미');
    expect(document.querySelector('#bottom [data-action="combine"], #bottom .combine-missing')).toBeNull();
    expect(document.querySelector('#bottom')!.textContent).not.toContain('부족');
  });
});

describe('online helper and card in the side windows', () => {
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
  const helperWin = () => $('#win-left .helper-win');
  const pressedScope = () => helperWin()?.querySelector('.scope-btn[aria-pressed="true"]')?.getAttribute('data-arg');
  function withUnits() {
    const full = fixtureFull();
    full.mine.units = full.mine.units.map(() => null);
    ['sotlid', 'bujigaengi'].forEach((defId, i) => { full.mine.units[i] = { id: 30 + i, defId }; });
    return mountOnline(full);
  }
  /** Stage 3 with the market open: seat 1 at the start of round 3 with a sotlid at slot 0. */
  function mountStage3() {
    const d3 = withoutMarketLock(loadGameData('stage3'));
    const match = createMatch(d3, 5, [1, 2]);
    jumpToTick(match, roundStartTick(d3, 3) + 1);
    placeUnitForTest(match.lanes[1]!, 'sotlid', 0);
    const full = buildFull(match, 1, { watching: 1, names: { 1: '가', 2: '나' }, key: 'k', n: 0 });
    const room = new FakeRoom();
    const net = new NetClient(room, full.dataVersion);
    room.emit('full', full);
    const driver = new NetDriver(net, d3, () => clock);
    driver.update(16);
    const scene = new FakeScene();
    mountUi(driver, scene as never, {}, { online: true, view: () => net.view, data: d3, actions: { support: vi.fn(), watch: vi.fn(), forfeit: vi.fn() } });
    return { room, driver, scene };
  }

  test('outside, Q opens the helper in the left window and the six rows stay in view', () => {
    document.documentElement.dataset.wins = 'outside';
    const { room, scene } = withUnits();
    key('KeyQ');
    expect(helperWin()).not.toBeNull();
    expect(helperWin()!.getAttribute('role')).toBe('dialog');
    expect(helperWin()!.querySelector('.win-head .win-title')!.textContent).toBe('조합 도우미 (Q)');
    expect(Array.from(helperWin()!.querySelectorAll('.scope-btn'), b => b.getAttribute('title'))).toEqual(['Shift+Q', 'Shift+Q']);
    expect(helperWin()!.querySelector('.win-body.helper [data-action="combine"]')).not.toBeNull();
    expect($('#left .helper-pop')).toBeNull();
    expect(document.querySelectorAll('#left .lane-row')).toHaveLength(6);
    expect(pressedScope()).toBe('all');
    expect(room.cmds('helperOpened')).toHaveLength(1);
    // a row under the mouse in the window lights its cells on the board, as in the helper over the rows
    helperWin()!.querySelector('[data-recipe="gamasot"]')!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    expect((scene as unknown as { boardMarks: { focus: unknown } }).boardMarks.focus).not.toBeNull();
    key('KeyQ');
    expect($('#win-left')!.innerHTML).toBe('');
    scene.select(0);
    key('KeyQ');
    expect(pressedScope()).toBe('unit');
    key('KeyQ', { shiftKey: true });
    expect(pressedScope()).toBe('all');
    expect(room.cmds('helperOpened')).toHaveLength(2);
  });

  test('inside, Q keeps the helper over the six rows', () => {
    withUnits();
    key('KeyQ');
    expect($('#left .helper-pop')).not.toBeNull();
    expect($('#win-left')!.innerHTML).toBe('');
    expect($('#left')!.inert).toBe(false);
  });

  test('a resize with the helper open moves it between the window and the rows without closing it', () => {
    const { room } = withUnits();
    key('KeyQ');
    expect($('#left .helper-pop')).not.toBeNull();
    document.documentElement.dataset.wins = 'outside';
    key('KeyW');
    expect(helperWin()).not.toBeNull();
    expect($('#left .helper-pop')).toBeNull();
    expect(room.cmds('helperOpened')).toHaveLength(1);
  });

  test('the close button and Esc close the helper window', () => {
    document.documentElement.dataset.wins = 'outside';
    withUnits();
    key('KeyQ');
    press(helperWin()!.querySelector('.win-close'));
    expect(helperWin()).toBeNull();
    key('KeyQ');
    key('Escape');
    expect(helperWin()).toBeNull();
  });

  test('Q does nothing while a locking window is up, except in the settings', () => {
    document.documentElement.dataset.wins = 'outside';
    withUnits();
    press($('#top [data-action="openMenu"]'));
    key('KeyQ');
    expect(helperWin()).toBeNull();
  });

  test('the helper and the market are open together; 상세 replaces the helper', () => {
    document.documentElement.dataset.wins = 'outside';
    const { scene } = mountStage3();
    key('KeyQ');
    key('KeyB');
    expect(helperWin()).not.toBeNull();
    expect($('#win-right .econ-panel')).not.toBeNull();
    scene.select(0);
    key('Tab');
    expect($('#win-left .unit-details')).not.toBeNull();
    expect(helperWin()).toBeNull();
    expect($('#left .helper-pop')).toBeNull();
    expect($('#win-right .econ-panel')).not.toBeNull();
  });

  test('the card name opens 상세', () => {
    const { driver, scene } = withUnits();
    scene.select(0);
    const name = $<HTMLButtonElement>('#bottom button.unit-info[data-action="unitDetails"]')!;
    expect(name).not.toBeNull();
    expect(name.textContent!.trim().endsWith('▸')).toBe(true);
    expect(name.title).toBe(unitCard(driver.state, 0)!.skillText);
    // the unit line and the attack line stay as they were
    expect(name.textContent).toContain(unitCard(driver.state, 0)!.name);
    expect(name.textContent).toContain('공격');
    press(name);
    expect($('#win-left .unit-details')).not.toBeNull();
  });

  test('online J opens the quest window without darkening the board', () => {
    mountStage3();
    key('KeyJ');
    expect($('#win-right .quest-modal')).not.toBeNull();
    expect($('#modal .modal')).toBeNull();
  });
});
