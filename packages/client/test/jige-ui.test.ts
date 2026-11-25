// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { applyCommand, createGame, jigeCandidates, loadGameData, type Command, type GameState } from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { jigeReasons, jigeRowsHtml, swapRows, type JigeList } from '../src/ui/econ';
import { mountUi } from '../src/ui/mount';
import { unitSkillText } from '../src/ui/models';
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
const win = () => document.getElementById('win-left')!;
const rows = () => Array.from(win().querySelectorAll<HTMLButtonElement>('[data-action="jigeSwap"]'));

describe('swapRows', () => {
  test('lists every other same-grade normal and filters by name and damage type', () => {
    for (const grade of [1, 2, 3, 4]) {
      const id = normalsOf(grade)[0]!;
      expect(swapRows(d3, id, '', null).map(u => u.id).sort()).toEqual(normalsOf(grade).filter(x => x !== id));
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

describe('jige reasons', () => {
  // buchae on cell 0 next to jipsin and ki: no recipe is ready, and each candidate for buchae opens a different one
  const reasonBoard = () => {
    const s: GameState = createGame(d3, 1);
    forceRound(s, 3);
    const unit = placeUnitForTest(s, 'buchae', 0);
    placeUnitForTest(s, 'jipsin', 1);
    placeUnitForTest(s, 'ki', 2);
    return { s, source: { zone: 'board' as const, index: 0, unitId: unit.id } };
  };
  const listOf = (s: GameState, source: JigeList['source'], target: string | null): JigeList => ({
    source, defId: 'buchae', cost: null, seat: undefined, epoch: undefined, name: '', type: null,
    reasons: jigeReasons(s, source, target),
  });
  const rowOf = (html: string, id: string) => {
    const box = document.createElement('div');
    box.innerHTML = html;
    return box.querySelector<HTMLElement>(`button.jige-row[data-arg="${id}"]`)!;
  };

  test('a candidate that makes a recipe ready says which', () => {
    const { s, source } = reasonBoard();
    const reasons = jigeReasons(s, source, null);
    expect(reasons.bitjaru).toEqual({ tag: 'combine', results: ['meongseok', 'sseurebatgi'] });
    expect(reasons.jipsin).toEqual({ tag: 'combine', results: ['dunggumi'] });
    expect(reasons.dadeumi).toEqual({ tag: 'combine', results: ['jeolgu'] });
    expect(reasons.bujigaengi).toEqual({ tag: 'combine', results: ['hwaetbul'] });
    for (const id of ['sotlid', 'horong', 'ki']) expect(reasons[id]).toBeUndefined();
  });

  test('a missing node of the target tree comes first', () => {
    const { s, source } = reasonBoard();
    expect(jigeReasons(s, source, 'meongseok').bitjaru!.tag).toBe('target');
  });

  test('rows: target, then combine by grade, then the rest', () => {
    const { s, source } = reasonBoard();
    const names = swapRows(d3, 'buchae', '', null, jigeReasons(s, source, 'meongseok')).map(u => u.name);
    expect(names).toEqual(['빗자루', '짚신', '다듬이방망이', '부지깽이', '솥뚜껑', '호롱', '키']);
  });

  test('two-line row: face, name, type, then the tag', () => {
    const { s, source } = reasonBoard();
    const goal = rowOf(jigeRowsHtml(d3, listOf(s, source, 'meongseok')), 'bitjaru');
    expect(goal.dataset.action).toBe('jigeSwap');
    expect(goal.querySelector('.jige-l1 .unit-face')).not.toBeNull();
    expect(goal.querySelector('.jige-l1')!.textContent).toBe('빗자루 물딜');
    expect(goal.querySelector('.jige-l2 .jige-tag.target')!.textContent).toBe('목표 재료');
    const free = jigeRowsHtml(d3, listOf(s, source, null));
    const tag = rowOf(free, 'bitjaru').querySelector<HTMLElement>('.jige-l2 .jige-tag')!;
    expect(tag.textContent).toBe('조합 → 멍석 외 1');
    expect(tag.title).toBe('멍석 · 쓰레받기');
    expect(rowOf(free, 'jipsin').querySelector('.jige-tag')!.textContent).toBe('조합 → 둥구미');
    expect(rowOf(free, 'jipsin').querySelector('.jige-tag')!.hasAttribute('title')).toBe(false);
    // no reason: the first skill line, dimmed
    const plain = rowOf(free, 'horong').querySelector('.jige-l2')!;
    expect(plain.querySelector('.jige-tag')).toBeNull();
    expect(plain.textContent).toBe(unitSkillText(d3, d3.units.find(u => u.id === 'horong')!).split(' / ')[0]);
  });
});

describe('R jige swap in solo', () => {
  let scene: FakeScene;
  let driver: GameDriver;
  let queued: Command[];
  let clock = 1000;
  // each test mounts again; the keydown listeners of earlier mounts would still answer and redraw the shared page
  const listeners: [string, EventListenerOrEventListenerObject][] = [];
  beforeEach(() => {
    const add = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => {
      listeners.push([type, fn]);
      add(type, fn, o);
    });
    clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
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
  afterEach(() => {
    for (const [type, fn] of listeners.splice(0)) window.removeEventListener(type, fn);
    vi.restoreAllMocks();
  });

  const board = (defId: string, slot: number) => placeUnitForTest(driver.state, defId, slot);
  const frame = (): void => { clock += 150; scene.onFrame?.(); };
  const slot = () => document.getElementById('round-banner')!.textContent!;
  const CLOSED = '유닛이 바뀌어 지게 목록을 닫았습니다';

  test('when the unit changes the list closes with a notice; a pick that swaps it does not say so', () => {
    const s = driver.state;
    s.econ!.jige = 2;
    const g2 = normalsOf(2)[0]!;
    board(g2, 2);
    scene.select!(2);
    keydown(window, { code: 'KeyR' });
    expect(rows().length).toBeGreaterThan(0);
    // the list is in the left window, so the board still takes the sell key
    keydown(window, { code: 'KeyS' });
    expect(queued).toEqual([{ type: 'sell', slot: 2 }]);
    driver.update(50);
    frame();
    expect(s.slots[2]).toBeNull();
    expect(win().innerHTML).toBe('');
    expect(slot()).toContain(CLOSED);

    clock += 5000;
    board(g2, 3);
    scene.select!(3);
    keydown(window, { code: 'KeyR' });
    press(rows()[0]!);
    expect(queued.filter(c => c.type === 'jigeSwap')).toHaveLength(1);
    driver.update(50);
    frame();
    expect(s.slots[3]!.defId).not.toBe(g2);
    expect(win().innerHTML).toBe('');
    expect(slot()).not.toContain(CLOSED);
  });

  test('typing in the name box is not a hotkey', () => {
    const s = driver.state;
    s.econ!.jige = 1;
    board(normalsOf(3)[0]!, 0);
    scene.select!(0);
    keydown(window, { code: 'KeyR' });
    const input = win().querySelector<HTMLInputElement>('.jige-search input')!;
    input.focus();
    for (const code of ['KeyE', 'KeyB', 'Space', 'KeyJ', 'Tab']) keydown(input, { code, key: code === 'Space' ? ' ' : code.slice(3).toLowerCase() });
    expect(document.getElementById('win-right')!.innerHTML).toBe('');
    expect(queued.filter(c => c.type === 'summon')).toEqual([]);
    expect(win().querySelector('.jige-search')).not.toBeNull();
    input.value = '없는이름';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(rows()).toHaveLength(0);
    expect(document.activeElement).toBe(input);
  });

  test('R lists every other normal peer and filters without spending; two picks spend two jige', () => {
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
    expect(win().querySelector('.win.jige-modal')).not.toBeNull();
    expect(document.getElementById('modal')!.innerHTML).toBe('');
    expect(win().querySelector('#win-left-title')!.textContent).toBe('지게 (R) · 보유 2');
    expect(win().querySelector('.win-close')!.getAttribute('aria-label')).toBe('지게 닫기 (R)');
    const from = win().querySelector<HTMLElement>('.jige-from')!;
    expect(from.textContent).toBe(`${d3.units.find(u => u.id === g4)!.name} (4등급) · 진영 1행 4열 → 같은 등급`);
    expect(from.title).toBe('원가 1등급 8기 값');
    expect(rows().map(b => b.dataset.arg).sort()).toEqual(normalsOf(4).filter(x => x !== g4));
    for (const row of rows()) {
      const def = d3.units.find(u => u.id === row.dataset.arg)!;
      expect(row.textContent).toContain(def.name);
      expect(row.textContent).toMatch(/물딜|마딜/);
    }
    // filters: a name part and a damage type
    const input = win().querySelector<HTMLInputElement>('.jige-search input')!;
    const part = d3.units.find(u => u.id === g4)!.name.slice(0, 1);
    input.value = part;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(rows().every(b => b.textContent!.includes(part))).toBe(true);
    // typing R in the box neither closes nor reopens anything
    keydown(input, { code: 'KeyR', key: 'r' });
    expect(win().querySelector('.jige-search')).not.toBeNull();
    press(win().querySelector('[data-action="jigeType"][data-arg="magical"]'));
    expect(rows().every(b => b.textContent!.includes('마딜'))).toBe(true);
    press(win().querySelector('.win-close'));
    expect(win().innerHTML).toBe('');
    expect(queued).toEqual([]);
    // R closes it again
    keydown(window, { code: 'KeyR' });
    expect(rows().length).toBeGreaterThan(0);
    keydown(window, { code: 'KeyR' });
    expect(win().innerHTML).toBe('');
    expect(s.econ!.jige).toBe(2);

    keydown(window, { code: 'KeyR' });
    const target = rows().find(b => b.dataset.arg !== g4)!.dataset.arg!;
    press(rows().find(b => b.dataset.arg === target)!);
    expect(queued).toEqual([{ type: 'jigeSwap', source: { zone: 'board', index: 3, unitId: unit.id }, result: target }]);
    expect(win().innerHTML).toBe('');
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

  test('R works the reasons out once: the tags stay while the name box filters', () => {
    const s = driver.state;
    s.econ!.jige = 1;
    board('buchae', 0);
    board('jipsin', 1);
    board('ki', 2);
    scene.select!(0);
    keydown(window, { code: 'KeyR' });
    expect(rows().map(b => b.dataset.arg)).toEqual(['bitjaru', 'jipsin', 'dadeumi', 'bujigaengi', 'sotlid', 'horong', 'ki']);
    const tagOf = (id: string) => win().querySelector(`.jige-row[data-arg="${id}"] .jige-tag`)?.textContent;
    expect(tagOf('bitjaru')).toBe('조합 → 멍석 외 1');
    // a board change after opening is not counted again (counting it would drop 쓰레받기)
    s.slots[2] = null;
    const input = win().querySelector<HTMLInputElement>('.jige-search input')!;
    input.value = '빗';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(rows().map(b => b.dataset.arg)).toEqual(['bitjaru']);
    expect(tagOf('bitjaru')).toBe('조합 → 멍석 외 1');
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
    expect(document.querySelector('#left [data-action="jigeOpen"]')).toBeNull();
    s.econ!.jige = 3;
    scene.select!(0);
    expect(document.querySelector<HTMLButtonElement>('#left [data-action="jigeOpen"]')!.disabled).toBe(false);
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
    expect(win().querySelector('.jige-modal')).toBeNull();
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
