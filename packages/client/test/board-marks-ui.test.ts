// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { applyCommand, createGame, loadGameData, type GameState } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { mountUi } from '../src/ui/mount';
import { NO_MARKS, rowCells, type BoardMarks } from '../src/ui/models';
import { STAGE_HTML } from './fixtures/net';
import { MOCK_TARGET, mockBoardState } from './fixtures/next-board';

class FakeScene {
  selectedId: number | null = null;
  reduceEffects = false;
  boardMarks: BoardMarks = NO_MARKS;
  onFrame?: () => void;
  private selectCb: ((slot: number | null) => void) | null = null;
  onSelect(cb: (slot: number | null) => void): void { this.selectCb = cb; }
  onEvents(): void {}
  setReduceEffects(on: boolean): void { this.reduceEffects = on; }
  select(slot: number | null): void { this.selectCb?.(slot); }
}

describe('board marks from the page', () => {
  let driver: GameDriver;
  let scene: FakeScene;
  let clock = 1e6;
  const left = () => document.getElementById('left')!;
  const rowOf = (id: string) => left().querySelector<HTMLElement>(`[data-recipe="${id}"]`);
  const over = (node: Element, pointerType = 'mouse') => node.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType }));
  /** A frame later than the render throttle. */
  const frame = () => { clock += 1000; scene.onFrame!(); };
  function mount(state: GameState, target: string | null = MOCK_TARGET, setup: (d: GameDriver) => void = () => {}): void {
    sessionStorage.clear();
    if (target) sessionStorage.setItem('t', target);
    document.body.innerHTML = STAGE_HTML;
    driver = new GameDriver(state);
    setup(driver);
    scene = new FakeScene();
    mountUi(driver, scene as never, {}, { targetKey: 't' });
  }
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  test('nothing selected: triangles on the top three of 전체', () => {
    mount(mockBoardState());
    expect(scene.boardMarks.triangles).toEqual([6, 0, 7]);
    expect(scene.boardMarks.pairs).toEqual([]);
  });

  test('짚신 selected: partner cells, no triangles', () => {
    mount(mockBoardState());
    scene.select(0);
    expect(scene.boardMarks.triangles).toEqual([]);
    expect(scene.boardMarks.pairs.map(p => p.slot)).toEqual([1, 2, 6, 7, 8]);
  });

  test('a stored partner marks its stack with the key', () => {
    const s = createGame(loadGameData('stage3'), 1);
    placeUnitForTest(s, 'jipsin', 0);
    placeUnitForTest(s, 'bitjaru', 1);
    expect(applyCommand(s, { type: 'store', slot: 1, unitId: s.slots[1]!.id }, [])).toBeNull();
    mount(s, null);
    expect(document.querySelector('#storage .stack.pair')).toBeNull();
    scene.select(0);
    const stack = document.querySelector('#storage .stack.pair');
    expect(stack?.querySelector('.pair-key')?.textContent).toBe('Z');
    expect(document.querySelectorAll('#storage .stack.pair')).toHaveLength(1);
  });

  test('watching another lane or a finished game shows no board marks (review focus 2)', () => {
    mount(mockBoardState(), MOCK_TARGET, d => { d.readOnly = true; });
    expect(scene.boardMarks).toEqual(NO_MARKS);
    const ended = mockBoardState();
    ended.phase = 'ended';
    mount(ended);
    expect(scene.boardMarks).toEqual(NO_MARKS);
  });

  test('a hovered row stays lit through redraws and goes dark when the row leaves the list (review focus 5)', () => {
    mount(mockBoardState());
    over(rowOf('baneul')!);
    expect(rowOf('baneul')!.classList.contains('hov')).toBe(true);
    expect(scene.boardMarks.focus).toEqual(rowCells(driver.state, 'baneul', null));
    expect(scene.boardMarks.focus!.length).toBeGreaterThan(0);
    driver.update(driver.state.data.balance.tickMs);
    frame();
    expect(rowOf('baneul')!.classList.contains('hov')).toBe(true);

    over(rowOf('jeolgu')!);
    expect(rowOf('jeolgu')!.classList.contains('hov')).toBe(true);
    expect(left().querySelectorAll('.hov')).toHaveLength(1);
    for (const slot of [7, 10]) {
      driver.queue({ type: 'sell', slot });
      driver.update(driver.state.data.balance.tickMs);
    }
    expect(driver.state.slots[7]).toBeNull();
    expect(driver.state.slots[10]).toBeNull();
    frame();
    expect(rowOf('jeolgu')).toBeNull();
    expect(left().querySelector('.hov')).toBeNull();
    expect(scene.boardMarks.focus).toBeNull();
  });

  test('leaving the panel clears the hover; touch does not hover', () => {
    mount(mockBoardState());
    over(rowOf('baneul')!, 'touch');
    expect(left().querySelector('.hov')).toBeNull();
    expect(scene.boardMarks.focus).toBeNull();
    over(rowOf('baneul')!);
    expect(scene.boardMarks.focus).not.toBeNull();
    left().dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    expect(left().querySelector('.hov')).toBeNull();
    expect(scene.boardMarks.focus).toBeNull();
  });
});
