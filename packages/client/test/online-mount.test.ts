// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FullMsg } from '@dorandi/logic';
import { NetClient } from '../src/net/NetClient';
import { NetDriver } from '../src/net/NetDriver';
import { FORFEIT_TEXT } from '../src/online/spirit';
import { mountUi, type OnlineActions } from '../src/ui/mount';
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
beforeEach(() => {
  document.body.innerHTML = STAGE_HTML;
  clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => { vi.restoreAllMocks(); });

function mountOnline(full: FullMsg = fixtureFull()) {
  const room = new FakeRoom();
  const net = new NetClient(room, full.dataVersion);
  room.emit('full', full);
  const driver = new NetDriver(net, data, () => clock);
  driver.update(16);
  const scene = new FakeScene();
  const actions = { support: vi.fn(), watch: vi.fn(), forfeit: vi.fn() } satisfies OnlineActions;
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
    const { room } = mountOnline();
    press(document.querySelector('#top [data-action="openMenu"]'));
    const modal = document.getElementById('modal')!;
    // the helper and reduce-effects switches moved to the settings window
    expect(modal.querySelector('[data-action="toggleHelper"], [data-action="toggleFx"], [data-action="setHelper"]')).toBeNull();
    press(modal.querySelector('[data-action="openDex"]'));
    expect(modal.querySelectorAll('table.dex tbody tr')).toHaveLength(40);
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

  test('spectators see watch instructions instead of unusable battle controls', () => {
    const full = fixtureFull([1, 2]);
    full.rows[0]!.status = 'spirit';
    mountOnline(full);
    expect(document.querySelector('#right [data-action]')).toBeNull();
    // the gear in the top bar stays, so a spirit can still turn the effects down
    expect(document.querySelector('#top [data-action="openSettings"]')).not.toBeNull();
    expect(document.querySelector('#right')!.textContent).toContain('관전');
  });

  test('the online card lists all recipes with three hotkeys and opens details from the overflow line', () => {
    const full = fixtureFull();
    ['bujigaengi', 'sotlid', 'horong', 'buchae', 'jipsin'].forEach((defId, i) => {
      full.mine.units[i] = { id: 30 + i, defId };
    });
    const { room, scene } = mountOnline(full);
    scene.select(0);
    // online the left panel holds the six lanes, so the unit card stays under the board
    const quick = Array.from(document.querySelectorAll('#bottom [data-action="combine"]'), btn => btn.textContent!.trim());
    expect(quick).toHaveLength(4);
    expect(quick.slice(0, 3).map(text => text.slice(0, 3))).toEqual(['[Z]', '[X]', '[C]']);
    expect(quick[3]).not.toMatch(/^\[/);
    expect(document.querySelector('#left .unit-panel')).toBeNull();
    press(document.querySelector('#bottom .recipe-more'));
    const options = document.querySelectorAll('#modal [data-action="combine"]');
    expect(options.length).toBeGreaterThan(3);
    press(options[3]!);
    expect(room.cmds('combine')[0]?.args).toMatchObject({ slot: 0, unitId: 30 });
    expect(document.querySelector('#modal .modal')).toBeNull();
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
    expect(on().textContent).toBe('켬');
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
