// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { buildFull, createGame, createMatch, loadGameData, step, type GameState } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { canvasInStorage, STORAGE_BOX } from '../src/layout';
import { dimmedSlots, predictStorage, type PendingCmd } from '../src/net/predict';
import { viewToGameState } from '../src/net/viewState';
import { boardUnits, helperModel, recipeTree, rejectText, storageStacks } from '../src/ui/models';
import { mountUi } from '../src/ui/mount';
import { storageHtml } from '../src/ui/storage';
import { STAGE_HTML } from './fixtures/net';

// the material chips are tested in recipe-chips.test.ts
const noMats = <T extends { materials: unknown }>({ materials: _m, ...rest }: T) => rest;

const d1 = loadGameData();
const d2 = loadGameData('stage2');

function lane(data = d1): GameState {
  return createGame(data, 1);
}

describe('storage view models', () => {
  test('stacks group by kind, lower grades first, then in table order, with the grade sell price', () => {
    const s = lane();
    placeUnitForTest(s, 'gamasot', 0);
    placeUnitForTest(s, 'ki', 1);
    placeUnitForTest(s, 'sotlid', 2);
    placeUnitForTest(s, 'ki', 3);
    step(s, [{ type: 'storeAll' }]);
    const order = (id: string) => d1.units.findIndex(u => u.id === id);
    const grade1 = ['ki', 'sotlid'].sort((a, b) => order(a) - order(b));
    expect(storageStacks(s).map(x => [x.defId, x.count])).toEqual([[grade1[0], grade1[0] === 'ki' ? 2 : 1], [grade1[1], grade1[1] === 'ki' ? 2 : 1], ['gamasot', 1]]);
    expect(storageStacks(s).find(x => x.defId === 'gamasot')).toMatchObject({ name: '가마솥', grade: 2, sellPrice: d1.balance.sellPrice[1] });
    expect(storageStacks(lane())).toEqual([]);
  });

  test('the helper and the dex tree count stored materials', () => {
    const s = lane();
    placeUnitForTest(s, 'sotlid', 4);
    placeUnitForTest(s, 'bujigaengi', 2);
    expect(helperModel(s).map(noMats)).toEqual([{ recipe: 'gamasot', name: '가마솥', grade: 2 }]);
    step(s, [{ type: 'store', slot: 2 }]);
    expect(helperModel(s).map(noMats)).toEqual([{ recipe: 'gamasot', name: '가마솥', grade: 2, stored: 1 }]);
    expect(boardUnits(s)).toEqual(['sotlid', 'bujigaengi']);
    const tree = recipeTree(d1, 'jangdok', boardUnits(s))!;
    expect(tree.map(n => [n.id, n.mark])).toEqual([['gamasot', 'missing'], ['ki', 'missing'], ['sotlid', 'have']]);
    expect(tree[0]!.children.map(n => [n.id, n.mark])).toEqual([['sotlid', 'missing'], ['bujigaengi', 'have']]);
  });

  test('the column: sprite, grade colour, ×N and a sell button per stack; dense past twelve kinds', () => {
    const s = lane(d2);
    placeUnitForTest(s, 'ki', 0);
    placeUnitForTest(s, 'ki', 1);
    placeUnitForTest(s, 'ki', 2);
    step(s, [{ type: 'storeAll' }]);
    document.body.innerHTML = `<div id="x">${storageHtml(s)}</div>`;
    const stack = document.querySelector<HTMLElement>('.stack')!;
    expect(stack.getAttribute('style')).toContain('#4f9dff');
    expect(stack.querySelector('img')!.getAttribute('src')).toBe('/sprites/ki.png');
    expect(stack.querySelector('.stack-n')!.textContent).toBe('×3');
    expect(stack.querySelector('[data-action="sellStack"]')!.getAttribute('title')).toBe(`키 1개 판매 +${d2.balance.sellPrice[0]}냥`);
    expect(stack.querySelector('.stack-take [data-action]')).toBeNull();
    expect(document.querySelector('[data-action="storeAll"]')!.textContent).toBe('1·2등급모두 보관');
    expect(document.querySelector('.stacks.dense')).toBeNull();
    const kinds = d2.units.filter(u => u.grade <= 2).slice(0, 13).map(u => u.id);
    s.storage = kinds.map((defId, i) => ({ id: 100 + i, defId, cooldown: 0, attackCount: 0, periodic: [] }));
    document.body.innerHTML = `<div id="x">${storageHtml(s)}</div>`;
    expect(document.querySelectorAll('.stack')).toHaveLength(13);
    expect(document.querySelector('.stacks.dense')).not.toBeNull();
    document.body.innerHTML = `<div id="x">${storageHtml(lane())}</div>`;
    expect(document.querySelector('.storage-empty')!.textContent).toContain('끌어 놓으세요');
  });

  test('new refusals have Korean text', () => {
    expect(rejectText('notStorable')).toBe('1·2등급만 보관할 수 있습니다');
    expect(rejectText('nothingToStore')).toBe('보관할 1·2등급 유닛이 없습니다');
    expect(rejectText('notStored')).toBe('보관함에 없는 유닛입니다');
    expect(rejectText('slotTaken')).toBe('그 칸에는 이미 유닛이 있습니다');
  });

  test('the column sits left of the lane path and inside the lane canvas', () => {
    expect(STORAGE_BOX.x + STORAGE_BOX.w).toBeLessThanOrEqual(196);
    expect(STORAGE_BOX.y + STORAGE_BOX.h).toBeLessThanOrEqual(272);
    expect(canvasInStorage(STORAGE_BOX.x - 128 + 5, STORAGE_BOX.y - 24 + 5)).toBe(true);
    expect(canvasInStorage(100, 5)).toBe(false);
  });
});

describe('storage prediction online', () => {
  const pending = (seq: number, type: string, args?: Record<string, unknown>): PendingCmd => ({ seq, type, ...(args ? { args } : {}) });

  test('pending take-outs and sales drop the newest unit of their kind; a pending store dims its slot only', () => {
    const server = [{ id: 1, defId: 'ki' }, { id: 2, defId: 'sotlid' }, { id: 3, defId: 'ki' }];
    expect(predictStorage(server, [pending(1, 'retrieve', { defId: 'ki' })])).toEqual([{ id: 1, defId: 'ki' }, { id: 2, defId: 'sotlid' }]);
    expect(predictStorage(server, [pending(1, 'retrieve', { defId: 'ki' }), pending(2, 'sellStored', { defId: 'ki' }), pending(3, 'sellStored', { defId: 'ki' })]))
      .toEqual([{ id: 2, defId: 'sotlid' }]);
    expect(predictStorage(server, [pending(1, 'store', { slot: 4, unitId: 9 })])).toEqual(server);
    expect(predictStorage(undefined, [])).toBeUndefined();
    expect([...dimmedSlots([pending(1, 'store', { slot: 4, unitId: 9 })])]).toEqual([4]);
  });

  test('the own lane counts each unit once: on the board or in storage, never both', () => {
    const match = createMatch(d2, 1, [1, 2]);
    const own = match.lanes[1]!;
    placeUnitForTest(own, 'sotlid', 0);
    placeUnitForTest(own, 'bujigaengi', 1);
    step(own, [{ type: 'store', slot: 1 }]);
    const full = buildFull(match, 1, { watching: 1, names: {}, key: 'k', n: 0 });
    expect(full.mine.storage).toEqual([{ id: own.storage![0]!.id, defId: 'bujigaengi' }]);
    const s = viewToGameState(full, d2, full.mine.units, 0, full.mine.storage);
    expect(boardUnits(s)).toEqual(['sotlid', 'bujigaengi']);
    expect(helperModel(s).map(h => h.recipe)).toEqual(['gamasot']);
    // another lane on screen: no storage of mine mixed into it
    const watching = buildFull(match, 1, { watching: 2, names: {}, key: 'k', n: 0 });
    expect(viewToGameState(watching, d2, watching.lane.units, 0, watching.mine.storage).storage).toBeUndefined();
  });
});

describe('storage on the page', () => {
  class FakeScene {
    selectedId: number | null = null;
    onFrame?: () => void;
    onStorageHover?: (hover: 'ok' | 'no' | null) => void;
    onSelect(): void {}
    onEvents(): void {}
  }
  beforeEach(() => { document.body.innerHTML = STAGE_HTML; });

  function mount(data = d1) {
    const driver = new GameDriver(createGame(data, 1));
    const scene = new FakeScene();
    mountUi(driver, scene as never);
    return { driver, scene, s: driver.state };
  }
  const box = () => document.getElementById('storage')!;
  const keydown = (target: EventTarget, init: KeyboardEventInit) => target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  const pointer = (target: EventTarget, type: string, x = 0, y = 0) =>
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));

  test('pointer and keyboard clicks show stack info without queuing a command, then info can sell one', () => {
    const { driver, s } = mount();
    placeUnitForTest(s, 'ki', 0);
    placeUnitForTest(s, 'ki', 1);
    placeUnitForTest(s, 'jangdok', 2);
    box().querySelector<HTMLElement>('[data-action="storeAll"]')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    driver.update(50);
    expect(s.storage!.map(u => u.defId)).toEqual(['ki', 'ki']);
    expect(s.slots[2]!.defId).toBe('jangdok');
    // the page redraws on the next frame; Esc draws it now
    keydown(window, { code: 'Escape' });
    const take = box().querySelector<HTMLElement>('[data-stack="ki"]')!;
    const queue = vi.spyOn(driver, 'queue');
    expect(box().querySelector('.stack-n')!.textContent).toBe('×2');
    pointer(take, 'pointerdown', 10, 10);
    pointer(window, 'pointerup', 11, 10);
    take.click();
    driver.update(50);
    expect(queue).not.toHaveBeenCalled();
    expect(s.storage!.map(u => u.defId)).toEqual(['ki', 'ki']);
    expect(s.slots.filter(u => u?.defId === 'ki')).toHaveLength(0);
    expect(document.querySelector('.storage-info')!.textContent).toContain('키 ×2');
    const coins = s.coins;
    document.querySelector<HTMLElement>('.storage-info [data-action="sellStored"]')!.click();
    driver.update(50);
    expect(s.storage!.map(u => u.defId)).toEqual(['ki']);
    expect(s.coins).toBe(coins + d1.balance.sellPrice[0]!);
  });

  test('the stack whose info is open is marked in the column until the info closes', () => {
    const { driver, s } = mount();
    placeUnitForTest(s, 'ki', 0);
    placeUnitForTest(s, 'sotlid', 1);
    box().querySelector<HTMLElement>('[data-action="storeAll"]')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    driver.update(50);
    keydown(window, { code: 'Escape' });
    expect(box().querySelector('.stack.inspected')).toBeNull();
    box().querySelector<HTMLElement>('[data-stack="sotlid"]')!.click();
    expect(box().querySelectorAll('.stack.inspected')).toHaveLength(1);
    expect(box().querySelector('.stack.inspected [data-stack="sotlid"]')!.getAttribute('aria-current')).toBe('true');
    expect(box().querySelector('[data-stack="ki"]')!.hasAttribute('aria-current')).toBe(false);
    document.querySelector<HTMLElement>('.storage-info [data-action="closeStorageInfo"]')!.click();
    expect(box().querySelector('.stack.inspected')).toBeNull();
  });

  test('the small sell button on a stack sells only on a second press within two seconds', () => {
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const { driver, s } = mount();
    placeUnitForTest(s, 'ki', 0);
    placeUnitForTest(s, 'ki', 1);
    step(s, [{ type: 'storeAll' }]);
    keydown(window, { code: 'Escape' });
    const sell = () => box().querySelector<HTMLButtonElement>('.stack-sell')!;
    const coins = s.coins;
    pointer(sell(), 'pointerdown');
    driver.update(50);
    expect(s.storage).toHaveLength(2);
    expect(sell().classList.contains('armed')).toBe(true);
    expect(sell().getAttribute('aria-label')).toContain('한 번 더');
    clock += 2001;
    keydown(window, { code: 'Escape' });
    expect(sell().classList.contains('armed')).toBe(false);
    pointer(sell(), 'pointerdown');
    driver.update(50);
    expect(s.storage).toHaveLength(2);
    clock += 500;
    pointer(sell(), 'pointerdown');
    driver.update(50);
    expect(s.storage).toHaveLength(1);
    expect(s.coins).toBe(coins + d1.balance.sellPrice[0]!);
    vi.restoreAllMocks();
  });

  test('dragging a stack onto a board cell places it there', () => {
    const { driver, s } = mount();
    placeUnitForTest(s, 'ki', 0);
    step(s, [{ type: 'storeAll' }]);
    keydown(window, { code: 'Escape' });
    const take = box().querySelector<HTMLElement>('[data-stack="ki"]')!;
    // happy-dom lays nothing out: the stage rect is 0x0 at the origin, so page px are stage px
    const stage = document.getElementById('stage')!;
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 360, right: 640, bottom: 360, x: 0, y: 0, toJSON: () => ({}) });
    pointer(take, 'pointerdown', 160, 100);
    pointer(window, 'pointermove', 200, 120);
    expect(document.querySelector('.stack-ghost')).not.toBeNull();
    // cell 9 = row 1, col 3
    pointer(window, 'pointerup', 232 + 3 * 32 + 5, 114 + 32 + 5);
    expect(document.querySelector('.stack-ghost')).toBeNull();
    driver.update(50);
    expect(s.slots[9]!.defId).toBe('ki');
  });

  test('the G key stores grade 1-2 units, but not while typing or composing', () => {
    const { driver, s } = mount();
    placeUnitForTest(s, 'ki', 0);
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    keydown(input, { code: 'KeyG' });
    keydown(window, { code: 'KeyG', isComposing: true });
    driver.update(50);
    expect(s.storage).toBeUndefined();
    input.blur();
    keydown(window, { code: 'KeyG' });
    driver.update(50);
    expect(s.storage!.map(u => u.defId)).toEqual(['ki']);
    expect(document.getElementById('bottom')!.textContent).toContain('G 1·2등급 보관');
  });

  test('the scene marks the column while a board unit is dragged over it', () => {
    const { scene } = mount();
    scene.onStorageHover?.('ok');
    expect(box().dataset.drop).toBe('ok');
    scene.onStorageHover?.(null);
    expect(box().dataset.drop).toBeUndefined();
  });

  test('a refused store shows its reason', () => {
    const { driver, s } = mount();
    placeUnitForTest(s, 'jangdok', 0);
    driver.queue({ type: 'store', slot: 0 });
    driver.update(50);
    keydown(window, { code: 'Escape' });
    // the store has no button of its own, so the refusal goes to the top slot
    expect(document.getElementById('round-banner')!.textContent).toContain('1·2등급만 보관할 수 있습니다');
    expect(document.querySelector('#top .notice')).toBeNull();
  });
});
