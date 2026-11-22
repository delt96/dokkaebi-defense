// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { applyCommand, createGame, jigeCandidates, loadGameData, type Command, type GameState } from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { swapRows } from '../src/ui/econ';
import { mountUi } from '../src/ui/mount';
import { press, STAGE_HTML } from './fixtures/net';

const d3 = loadGameData('stage3');
const normalsOf = (grade: number) => d3.units.filter(u => !u.hidden && u.grade === grade).map(u => u.id).sort();

class FakeScene {
  selectedId: number | null = null;
  onFrame?: () => void;
  select?: (slot: number | null) => void;
  onSelect(cb: (slot: number | null) => void): void { this.select = cb; }
  onEvents(): void {}
}

const keydown = (target: EventTarget, init: KeyboardEventInit) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
const modal = () => document.getElementById('modal')!;
const rows = () => Array.from(modal().querySelectorAll<HTMLButtonElement>('[data-action="jigeSwap"]'));

describe('swapRows', () => {
  test('lists every same-grade normal and filters by name and damage type', () => {
    for (const grade of [1, 2, 3, 4]) {
      const id = normalsOf(grade)[0]!;
      expect(swapRows(d3, id, '', null).map(u => u.id).sort()).toEqual(normalsOf(grade));
    }
    const pick = d3.units.find(u => !u.hidden && u.grade === 3)!;
    const part = pick.name.slice(0, 1);
    for (const type of ['physical', 'magical'] as const) {
      const got = swapRows(d3, pick.id, part, type);
      expect(got.every(u => u.name.includes(part) && u.damageType === type && u.grade === 3)).toBe(true);
      expect(got.map(u => u.id)).toEqual(jigeCandidates(d3, pick.id).filter(u => u.name.includes(part) && u.damageType === type).map(u => u.id));
    }
    const hidden = d3.units.find(u => u.hidden)!;
    const grade5 = d3.units.find(u => !u.hidden && u.grade === 5)!;
    expect(swapRows(d3, hidden.id, '', null)).toEqual([]);
    expect(swapRows(d3, grade5.id, '', null)).toEqual([]);
  });
});

describe('R jige swap in solo', () => {
  let scene: FakeScene;
  let driver: GameDriver;
  let queued: Command[];
  beforeEach(() => {
    document.body.innerHTML = STAGE_HTML;
    const s: GameState = createGame(d3, 1);
    forceRound(s, 3);
    driver = new GameDriver(s);
    scene = new FakeScene();
    mountUi(driver, scene as never);
    queued = [];
    const queue = driver.queue.bind(driver);
    vi.spyOn(driver, 'queue').mockImplementation(cmd => { queued.push(cmd); queue(cmd); });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  const board = (defId: string, slot: number) => placeUnitForTest(driver.state, defId, slot);

  test('R lists every normal peer and filters without spending; two picks spend two jige', () => {
    const s = driver.state;
    s.econ!.jige = 2;
    const g4 = normalsOf(4)[0]!;
    const unit = board(g4, 3);
    unit.cost = 8;
    scene.select!(3);
    const bottom = document.getElementById('left')!.textContent!;
    expect(bottom).toContain('보유 지게 2개');
    expect(bottom).toContain('R 지게 바꾸기');
    keydown(window, { code: 'KeyR' });
    expect(rows().map(b => b.dataset.arg).sort()).toEqual(normalsOf(4));
    for (const row of rows()) {
      const def = d3.units.find(u => u.id === row.dataset.arg)!;
      expect(row.textContent).toContain(def.name);
      expect(row.textContent).toMatch(/물딜|마딜/);
    }
    // filters: a name part and a damage type
    const input = modal().querySelector<HTMLInputElement>('.jige-search input')!;
    const part = d3.units.find(u => u.id === g4)!.name.slice(0, 1);
    input.value = part;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(rows().every(b => b.textContent!.includes(part))).toBe(true);
    // typing R in the box neither closes nor reopens anything
    keydown(input, { code: 'KeyR', key: 'r' });
    expect(modal().querySelector('.jige-search')).not.toBeNull();
    press(modal().querySelector('[data-action="jigeType"][data-arg="magical"]'));
    expect(rows().every(b => b.textContent!.includes('마딜'))).toBe(true);
    press(modal().querySelector('[data-action="closeModal"]'));
    expect(queued).toEqual([]);
    expect(s.econ!.jige).toBe(2);

    keydown(window, { code: 'KeyR' });
    const target = rows().find(b => b.dataset.arg !== g4)!.dataset.arg!;
    press(rows().find(b => b.dataset.arg === target)!);
    expect(queued).toEqual([{ type: 'jigeSwap', source: { zone: 'board', index: 3, unitId: unit.id }, result: target }]);
    expect(modal().textContent).toBe('');
    driver.update(50);
    expect(s.slots[3]).toMatchObject({ defId: target, cost: 8 });
    expect(s.econ!.jige).toBe(1);

    // a stored grade 2 from the strip
    const g2 = normalsOf(2)[0]!;
    board(g2, 7).cost = 0;
    applyCommand(s, { type: 'store', slot: 7, unitId: s.slots[7]!.id }, []);
    driver.update(0);
    scene.select!(null);
    const swapBtn = document.querySelector<HTMLButtonElement>(`#storage [data-action="jigeOpen"][data-arg="storage:${g2}"]`)!;
    press(swapBtn);
    const other = rows().find(b => b.dataset.arg !== g2)!.dataset.arg!;
    press(rows().find(b => b.dataset.arg === other)!);
    driver.update(50);
    expect(s.storage![0]).toMatchObject({ defId: other, cost: 0 });
    expect(s.econ!.jige).toBe(0);
    // G still stores
    board(normalsOf(1)[0]!, 9);
    keydown(window, { code: 'KeyG' });
    driver.update(50);
    expect(s.slots[9]).toBeNull();
  });

  test('a list whose unit moved, sold or changed never sends the stale pick', () => {
    const s = driver.state;
    s.econ!.jige = 1;
    const g3 = normalsOf(3)[0]!;
    const unit = board(g3, 2);
    scene.select!(2);
    keydown(window, { code: 'KeyR' });
    const pick = rows().find(b => b.dataset.arg !== g3)!;
    // the unit is replaced by another with the same definition before the click
    s.slots[2] = { ...unit, id: unit.id + 100 };
    press(pick);
    expect(queued.filter(c => c.type === 'jigeSwap')).toEqual([]);
    expect(document.getElementById('alert')!.textContent + document.getElementById('bottom')!.textContent).toBeTruthy();
    expect(s.econ!.jige).toBe(1);
  });

  test('hidden, grade 5-6 and empty stock show no usable swap', () => {
    const s = driver.state;
    s.econ!.jige = 0;
    board(normalsOf(2)[0]!, 0);
    scene.select!(0);
    expect(document.querySelector<HTMLButtonElement>('#left [data-action="jigeOpen"]')!.disabled).toBe(true);
    s.econ!.jige = 3;
    board(d3.units.find(u => !u.hidden && u.grade === 5)!.id, 1);
    scene.select!(1);
    expect(document.querySelector('#left [data-action="jigeOpen"]')).toBeNull();
    board(d3.units.find(u => u.hidden)!.id, 4);
    scene.select!(4);
    expect(document.querySelector('#left [data-action="jigeOpen"]')).toBeNull();
  });
});

describe('R jige swap online', () => {
  beforeEach(() => { document.body.innerHTML = STAGE_HTML; });
  afterEach(() => { vi.restoreAllMocks(); });

  test('rejoin during R never spends the stale selection, and a fresh pick on the live lane goes once', async () => {
    const { buildFull, createMatch, roundStartTick } = await import('@dorandi/logic');
    const { jumpToTick } = await import('@dorandi/logic/testing');
    const { NetClient } = await import('../src/net/NetClient');
    const { NetDriver } = await import('../src/net/NetDriver');
    const { FakeRoom } = await import('./fixtures/net');
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const match = createMatch(d3, 5, [1, 2]);
    jumpToTick(match, roundStartTick(d3, 3) + 1);
    const g3 = normalsOf(3)[0]!;
    const unit = placeUnitForTest(match.lanes[1]!, g3, 2);
    unit.cost = 4;
    match.lanes[1]!.econ!.jige = 1;
    const full = () => buildFull(match, 1, { watching: 1, names: { 1: '가', 2: '나' }, key: 'k', n: 0 });
    const room = new FakeRoom();
    const net = new NetClient(room, full().dataVersion);
    room.emit('full', full());
    const driver = new NetDriver(net, d3, () => clock);
    driver.update(16);
    const scene = new FakeScene();
    mountUi(driver, scene as never, {}, { online: true, view: () => net.view, data: d3, actions: { support() {}, watch() {}, forfeit() {} } });
    scene.select!(2);
    press(document.querySelector('#bottom [data-action="jigeOpen"]'));
    const old = rows().find(b => b.dataset.arg !== g3)!;
    // a rejoin: a new full with the same slot index and the same numeric unit id
    room.emit('full', full());
    clock += 150; driver.update(16);
    press(old);
    expect(room.cmds('jigeSwap')).toHaveLength(0);
    expect(modal().querySelector('.jige-modal')).toBeNull();
    // the authoritative cost and 지게 are still there; a new pick goes once
    expect(driver.state.slots[2]).toMatchObject({ id: unit.id, cost: 4 });
    scene.select!(2);
    press(document.querySelector('#bottom [data-action="jigeOpen"]'));
    const fresh = rows().find(b => b.dataset.arg !== g3)!;
    press(fresh);
    press(fresh);
    expect(room.cmds('jigeSwap')).toEqual([{ seq: expect.any(Number), type: 'jigeSwap',
      args: { source: { zone: 'board', index: 2, unitId: unit.id }, result: fresh.dataset.arg } }]);
  });
});
