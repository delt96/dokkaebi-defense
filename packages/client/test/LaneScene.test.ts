import { EventEmitter } from 'node:events';
import { cellCorner, cellPx, laneToCanvas } from '../src/layout';
import { createGame, loadGameData, type GameData } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { expect, test, vi } from 'vitest';
import { GameDriver } from '../src/driver';
import { LaneScene, triangleAlpha } from '../src/LaneScene';
import { FX_DEPTH } from '../src/fx/FxLayer';
import { NO_MARKS } from '../src/ui/models';

vi.mock('phaser', () => ({ default: { Scene: class {}, Loader: { File: class {} } } }));

const CREAM = 0xe8e0d0;
type Mock = ReturnType<typeof vi.fn>;

function setupScene(data: GameData = loadGameData()) {
  const state = createGame(data, 1);
  const driver = new GameDriver(state);
  const scene = new LaneScene(driver);
  const circle = vi.fn((_x: number, _y: number, _radius: number, _color: number) => {
    const arc = { setVisible: vi.fn(), setStrokeStyle: vi.fn(() => arc) };
    return arc;
  });
  const container = vi.fn(() => {
    const view = Object.assign(new EventEmitter(), {
      x: 0, y: 0, add: vi.fn(), destroy: vi.fn(),
      setSize: () => view, setInteractive: () => view, setDepth: () => view,
      setPosition: (x: number, y: number) => { view.x = x; view.y = y; },
    });
    return view;
  });
  const text = vi.fn(() => {
    const tag: Record<string, Mock> = {};
    for (const name of ['setOrigin', 'setDepth', 'setText', 'setPosition', 'setAlpha', 'setVisible']) tag[name] = vi.fn(() => tag);
    return tag;
  });
  const tweens = { add: vi.fn() };
  Object.assign(scene, {
    textures: { exists: () => true },
    add: { circle, container, image: vi.fn(), text },
    tweens,
  });
  return { state, driver, scene, circle, tweens, container, text };
}

const OVERLAY_CALLS = [
  'clear', 'fillStyle', 'fillCircle', 'strokeCircle', 'fillRect', 'strokeRect', 'fillPoints', 'strokePoints',
  'fillTriangle', 'strokeTriangle', 'lineStyle', 'lineBetween',
] as const;
type Overlay = Record<(typeof OVERLAY_CALLS)[number], Mock>;

function mockOverlay(): Overlay {
  const g = {} as Overlay;
  for (const name of OVERLAY_CALLS) g[name] = vi.fn(() => g);
  return g;
}

/** Places the units, shows every view at scale 1 on its cell and swaps in a recording overlay. */
function drawn(ids: string[], data?: GameData) {
  const setup = setupScene(data);
  ids.forEach((id, slot) => placeUnitForTest(setup.state, id, slot));
  setup.scene['placeUnits']();
  const views = setup.container.mock.results.map(r => r.value);
  views.forEach((view, i) => {
    const c = laneToCanvas(setup.scene.lane.cells[i]!);
    Object.assign(view, { visible: true, scaleY: 1, alpha: 1 });
    view.setPosition(c.x, c.y);
  });
  const overlay = mockOverlay();
  Object.assign(setup.scene, { overlay, coverage: { clear: vi.fn() } });
  return { ...setup, views, overlay };
}

/** The arguments of the last `style` call made before the n-th `draw` call. */
function styleBefore(g: Overlay, style: keyof Overlay, draw: keyof Overlay, n = 0): unknown[] {
  const at = g[draw].mock.invocationCallOrder[n]!;
  const orders = g[style].mock.invocationCallOrder;
  let i = orders.length - 1;
  while (i >= 0 && orders[i]! > at) i--;
  return g[style].mock.calls[i]!;
}

test('the grade shape sits at the top-left corner above attack effects: circle, square, diamond with a black edge', () => {
  const { scene, views, overlay, circle } = drawn(['sotlid', 'jangdok', 'top'], loadGameData('stage3'));
  views.forEach((view, i) => view.setPosition(80 + 40 * i, 90));
  expect(circle).not.toHaveBeenCalled();
  expect(FX_DEPTH.unitOverlay).toBeGreaterThan(FX_DEPTH.air);
  const k = 12 * scene.lane.pitch;

  scene['drawSelection']();
  expect(overlay.fillCircle).toHaveBeenCalledExactlyOnceWith(80 - k, 90 - k, 2.5);
  expect(overlay.strokeCircle).toHaveBeenCalledExactlyOnceWith(80 - k, 90 - k, 2.5);
  expect(styleBefore(overlay, 'lineStyle', 'strokeCircle')).toEqual([1, 0x000000, 1]);
  expect(overlay.fillRect).toHaveBeenCalledExactlyOnceWith(120 - k - 2.5, 90 - k - 2.5, 5, 5);
  expect(overlay.strokeRect).toHaveBeenCalledOnce();
  expect(overlay.fillPoints).toHaveBeenCalledOnce();
  expect(overlay.strokePoints).toHaveBeenCalledOnce();
  const diamond = overlay.fillPoints.mock.calls[0]![0] as { x: number; y: number }[];
  expect(diamond).toHaveLength(4);
  for (const p of diamond) expect(Math.abs(p.x - (160 - k)) + Math.abs(p.y - (90 - k))).toBeGreaterThan(2.5);

  for (const fn of Object.values(overlay)) fn.mockClear();
  for (const view of views) view.visible = false;
  scene['drawSelection']();
  expect(overlay.fillCircle).not.toHaveBeenCalled();
  expect(overlay.fillRect).not.toHaveBeenCalled();
  expect(overlay.fillPoints).not.toHaveBeenCalled();
});

test('▲ goes to the triangle slots only, cream with a black edge at the top right', () => {
  const { scene, views, overlay } = drawn(['sotlid', 'bujigaengi', 'buchae']);
  scene['drawSelection']();
  expect(overlay.fillTriangle).not.toHaveBeenCalled();

  scene.boardMarks = { ...NO_MARKS, triangles: [0] };
  scene['drawSelection']();
  expect(overlay.fillTriangle).toHaveBeenCalledOnce();
  expect(overlay.strokeTriangle).toHaveBeenCalledOnce();
  expect(styleBefore(overlay, 'fillStyle', 'fillTriangle')[0]).toBe(CREAM);
  expect(styleBefore(overlay, 'lineStyle', 'strokeTriangle').slice(0, 2)).toEqual([1, 0x000000]);
  const [x1, y1, x2, y2, x3, y3] = overlay.fillTriangle.mock.calls[0] as number[];
  const view = views[0]!;
  expect(Math.min(x1!, x2!, x3!)).toBeGreaterThan(view.x);
  expect(Math.max(y1!, y2!, y3!)).toBeLessThan(view.y);
  expect(y1).toBeLessThan(y2!);
});

test('only the first ▲ breathes; the others stay at 0.7, and reduced effects keep the first bright', () => {
  const { scene, overlay } = drawn(['sotlid', 'bujigaengi', 'buchae']);
  scene['reduceFx'] = true;
  scene.boardMarks = { ...NO_MARKS, triangles: [2, 0] };
  scene['drawSelection']();
  expect(overlay.fillTriangle).toHaveBeenCalledTimes(2);
  expect(styleBefore(overlay, 'fillStyle', 'fillTriangle', 0)).toEqual([CREAM, 1]);
  expect(styleBefore(overlay, 'fillStyle', 'fillTriangle', 1)).toEqual([CREAM, 0.7]);
});

test('triangleAlpha breathes once a second and holds still when reduced or held by a higher loop', () => {
  expect(triangleAlpha(0, true, false)).toBe(1);
  expect(triangleAlpha(750, false, true)).toBe(1);
  expect(triangleAlpha(250, false, false)).toBeCloseTo(1);
  expect(triangleAlpha(750, false, false)).toBeCloseTo(0.55);
  expect(triangleAlpha(1250, false, false)).toBeCloseTo(1);
});

test('brackets and a key tag on pair cells; a hovered row dims the other brackets to 0.3', () => {
  const { scene, overlay, text } = drawn(['sotlid', 'bujigaengi', 'buchae']);
  scene.boardMarks = { ...NO_MARKS, pairs: [{ slot: 1, key: 'Z' }] };
  scene['drawSelection']();
  expect(overlay.lineBetween).toHaveBeenCalledTimes(8);
  expect(styleBefore(overlay, 'lineStyle', 'lineBetween')).toEqual([expect.any(Number), CREAM, 1]);
  expect(text).toHaveBeenCalledOnce();
  const tag = text.mock.results[0]!.value as Record<string, Mock>;
  expect(tag.setText).toHaveBeenLastCalledWith('Z');
  expect(tag.setVisible).toHaveBeenLastCalledWith(true);
  const corner = cellCorner(scene.lane, 1);
  const size = cellPx(scene.lane);
  const [tx, ty] = tag.setPosition!.mock.lastCall as number[];
  expect(tx).toBeGreaterThan(corner.x + size / 2);
  expect(ty).toBeGreaterThan(corner.y + size / 2);
  expect(tx).toBeLessThan(corner.x + size);
  expect(ty).toBeLessThan(corner.y + size);
  expect(styleBefore(overlay, 'fillStyle', 'fillRect')[0]).toBe(CREAM);

  for (const fn of Object.values(overlay)) fn.mockClear();
  scene.boardMarks = { ...NO_MARKS, pairs: [{ slot: 1, key: 'Z' }], focus: [2] };
  scene['drawSelection']();
  expect(overlay.lineStyle).toHaveBeenCalledWith(expect.any(Number), CREAM, 0.3);
  expect(overlay.lineStyle).toHaveBeenCalledWith(expect.any(Number), CREAM, 1);
  expect(tag.setAlpha).toHaveBeenLastCalledWith(0.3);
  expect(text).toHaveBeenCalledOnce();

  scene.boardMarks = NO_MARKS;
  scene['drawSelection']();
  expect(tag.setVisible).toHaveBeenLastCalledWith(false);
});

test('nothing selected: a hovered row brackets its cells without key tags', () => {
  const { scene, overlay, text } = drawn(['sotlid', 'bujigaengi', 'buchae']);
  scene.boardMarks = { ...NO_MARKS, focus: [0, 2] };
  scene['drawSelection']();
  expect(overlay.lineBetween).toHaveBeenCalledTimes(16);
  expect(overlay.lineStyle).not.toHaveBeenCalledWith(expect.any(Number), CREAM, 0.3);
  expect(text).not.toHaveBeenCalled();
});

test('drop moves the dragged unit after a pending swap', () => {
  const { scene, driver, state, container } = setupScene();
  const a = placeUnitForTest(state, 'sotlid', 0);
  const b = placeUnitForTest(state, 'bujigaengi', 1);
  scene['placeUnits']();
  const view = container.mock.results[1]!.value!;
  driver.queue({ type: 'move', from: 0, to: 1 });
  view.emit('dragstart', { rightButtonDown: () => false });
  driver.update(50);
  const target = laneToCanvas({ x: 2.5, y: 0.5 });
  view.setPosition(target.x, target.y);
  view.emit('dragend');
  driver.update(50);
  expect(state.slots[2]?.id).toBe(b.id);
  expect(state.slots[1]?.id).toBe(a.id);
});

const DANGER = 0xff3b2f;
const press = (downTime: number) => ({ rightButtonDown: () => false, button: 0, getDistance: () => 0, downTime });

/** The cell's frame as drawn: inset by one pixel like the selected unit's frame. */
function frameOf(scene: LaneScene, slot: number) {
  const p = cellCorner(scene.lane, slot);
  const size = cellPx(scene.lane);
  return { x0: p.x, y0: p.y, x1: p.x + size, y1: p.y + size };
}
const inside = (f: ReturnType<typeof frameOf>, x: number, y: number) => x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1;

test('while dragging, the cell under the pointer gets a cream frame and its unit fades to 0.5 until the drop', () => {
  const { scene, views, overlay } = drawn(['sotlid', 'bujigaengi']);
  const [a, b] = views;
  a.emit('dragstart', press(1));
  const over = laneToCanvas(scene.lane.cells[1]!);
  a.emit('drag', press(1), over.x, over.y);
  expect(scene['dropCell']).toBe(1);

  scene['drawSelection']();
  const f = frameOf(scene, 1);
  const frame = overlay.strokeRect.mock.calls.findIndex(([x, y]) => inside(f, x as number, y as number));
  expect(frame).toBeGreaterThanOrEqual(0);
  expect(styleBefore(overlay, 'lineStyle', 'strokeRect', frame)).toEqual([2, CREAM, 1]);
  // the swap arrow sits on the partner's cell
  expect(overlay.lineBetween.mock.calls.some(([x, y]) => inside(f, x as number, y as number))).toBe(true);

  scene['placeUnits']();
  expect(b.alpha).toBe(0.5);
  expect(a.alpha).toBe(1);
  a.emit('dragend');
  expect(scene['dropCell']).toBeNull();
  scene['placeUnits']();
  expect(b.alpha).toBe(1);
});

test('the own cell gets no drop frame; a closed cell gets a red dashed one', () => {
  const { scene, state, views, overlay } = drawn(['sotlid']);
  const [a] = views;
  a.emit('dragstart', press(1));
  const home = laneToCanvas(scene.lane.cells[0]!);
  a.emit('drag', press(1), home.x, home.y);
  scene['drawSelection']();
  expect(overlay.lineStyle).not.toHaveBeenCalledWith(2, CREAM, 1);

  state.open[5] = false;
  const closed = laneToCanvas(scene.lane.cells[5]!);
  a.emit('drag', press(1), closed.x, closed.y);
  for (const fn of Object.values(overlay)) fn.mockClear();
  scene['drawSelection']();
  expect(overlay.lineStyle).not.toHaveBeenCalledWith(2, CREAM, 1);
  const f = frameOf(scene, 5);
  const dashes = overlay.lineBetween.mock.calls.map((c, i) => ({ c, i })).filter(({ c }) => inside(f, c[0] as number, c[1] as number));
  expect(dashes.length).toBeGreaterThan(4);
  expect(styleBefore(overlay, 'lineStyle', 'lineBetween', dashes[0]!.i).slice(1, 2)).toEqual([DANGER]);
});

test('moving: drags do not start and only the empty open cells get a cream dashed frame', () => {
  const { scene, state, views, overlay } = drawn(['sotlid', 'bujigaengi']);
  scene.moving = true;
  views[0].emit('dragstart', press(1));
  expect(scene['dragging']).toBeNull();

  state.open[5] = false;
  scene['drawSelection']();
  expect(overlay.lineBetween).toHaveBeenCalled();
  const empty = scene.lane.cells.map(c => c.index).filter(i => !state.slots[i] && state.open[i]);
  overlay.lineBetween.mock.calls.forEach(([x, y], i) => {
    expect(empty.some(slot => inside(frameOf(scene, slot), x as number, y as number))).toBe(true);
    expect(styleBefore(overlay, 'lineStyle', 'lineBetween', i)[1]).toBe(CREAM);
  });
  const dashed = new Set(overlay.lineBetween.mock.calls.map(([x, y]) => empty.find(slot => inside(frameOf(scene, slot), x as number, y as number))));
  expect(dashed.size).toBe(empty.length);

  for (const fn of Object.values(overlay)) fn.mockClear();
  scene.moving = false;
  scene['drawSelection']();
  expect(overlay.lineBetween).not.toHaveBeenCalled();
});

test('a short press tells the page whether it was on the unit already selected', () => {
  const { scene, views, state } = drawn(['sotlid', 'bujigaengi']);
  const seen: [number | null, string | undefined][] = [];
  scene.onSelect((slot, how) => seen.push([slot, how]));
  const [a, b] = views;
  scene.selectedId = state.slots[0]!.id;
  // Phaser starts a drag (threshold 0) before the object's pointerdown, and ends it before pointerup
  a.emit('dragstart', press(1));
  a.emit('pointerdown', press(1));
  a.emit('dragend');
  a.emit('pointerup', press(1));
  expect(seen).toEqual([[0, 'press'], [0, 'again']]);

  seen.length = 0;
  b.emit('dragstart', press(2));
  scene.selectedId = state.slots[1]!.id;
  b.emit('pointerdown', press(2));
  b.emit('dragend');
  b.emit('pointerup', press(2));
  expect(seen).toEqual([[1, 'press'], [1, 'tap']]);

  seen.length = 0;
  scene.moving = true;
  b.emit('dragstart', press(3));
  b.emit('pointerdown', press(3));
  b.emit('pointerup', press(3));
  expect(seen).toEqual([[1, 'tap']]);
});

test('redrawing an unchanged board starts no slide, a move slides once', () => {
  const { state, driver, scene, tweens } = setupScene();
  placeUnitForTest(state, 'sotlid', 0);
  placeUnitForTest(state, 'sotlid', 1);
  placeUnitForTest(state, 'buchae', 2);
  placeUnitForTest(state, 'bujigaengi', 3);
  scene['placeUnits']();
  scene['placeUnits']();
  expect(tweens.add).not.toHaveBeenCalled();

  driver.queue({ type: 'combine', result: 'gamasot', slot: 0 });
  driver.update(state.data.balance.tickMs);
  scene['placeUnits']();
  driver.queue({ type: 'move', from: 1, to: 8 });
  driver.update(state.data.balance.tickMs);
  scene['placeUnits']();
  scene['placeUnits']();
  expect(tweens.add).toHaveBeenCalledTimes(1);
});

test('a frame failure shows the exception once and stops further simulation', () => {
  const driver = new GameDriver(createGame(loadGameData(), 1));
  const scene = new LaneScene(driver);
  const error = new Error('화면 갱신 실패');
  const update = vi.spyOn(driver, 'update').mockImplementation(() => { throw error; });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const banner = { hidden: true };
  const message = { textContent: '' };
  const restart = { focus: vi.fn() };
  vi.stubGlobal('document', {
    getElementById: (id: string) => ({ 'error': banner, 'error-restart': restart, 'error-message': message })[id],
  });
  try {
    scene.update(0, 16);
    scene.update(16, 16);
    expect(banner.hidden).toBe(false);
    expect(message.textContent).toBe('게임 오류 · 화면 갱신 실패');
    expect(restart.focus).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledTimes(1);
    driver.queue({ type: 'summon' });
    expect(driver['pending']).toHaveLength(0);
    const clearable = { clear: vi.fn() };
    Object.assign(scene, {
      tweens: { killAll: vi.fn() }, effects: clearable, overlay: clearable, coverage: clearable,
      fires: clearable, cameras: { main: { resetFX: vi.fn() } },
    });
    update.mockRestore();
    driver.reset(createGame(driver.state.data, 2));
    scene.reset();
    vi.spyOn(scene as unknown as { renderBoard(): void }, 'renderBoard').mockImplementation(() => {});
    scene.update(32, 50);
    expect(banner.hidden).toBe(true);
    expect(driver.state.tick).toBe(1);
    expect(log).toHaveBeenCalledExactlyOnceWith(error);
  } finally {
    vi.unstubAllGlobals();
    log.mockRestore();
  }
});

test('a unit view is rebuilt when the same id comes back as another unit (review checkpoint, finding 2)', () => {
  const { scene, state, container } = setupScene();
  const a = placeUnitForTest(state, 'sotlid', 0);
  scene['placeUnits']();
  const first = container.mock.results.at(-1)!.value!;
  state.slots[0] = { ...state.slots[0]!, id: a.id, defId: 'bujigaengi' };
  scene['placeUnits']();
  expect(first.destroy).toHaveBeenCalled();
  expect(container).toHaveBeenCalledTimes(2);
  expect(scene['units'].get(a.id)).toBe(container.mock.results.at(-1)!.value);
});

test('switching the drawn lane drops every view, effect and the selection (review checkpoint, finding 2)', () => {
  const { scene, state, driver, container } = setupScene();
  const lane = driver as unknown as { laneSeat: number; laneEpoch: number };
  Object.assign(lane, { laneSeat: 1, laneEpoch: 0 });
  const killAll = vi.fn();
  const clearable = () => ({ clear: vi.fn() });
  Object.assign(scene, { effects: clearable(), overlay: clearable(), coverage: clearable() });
  (scene as unknown as { tweens: object }).tweens = { add: vi.fn(), killAll };
  const a = placeUnitForTest(state, 'sotlid', 0);
  scene['syncLane']();
  scene['placeUnits']();
  scene.selectedId = a.id;
  const old = container.mock.results.at(-1)!.value!;
  scene['syncLane']();
  expect(old.destroy).not.toHaveBeenCalled();
  lane.laneEpoch = 1;
  scene['syncLane']();
  expect(old.destroy).toHaveBeenCalled();
  expect(scene.selectedId).toBe(a.id);
  scene['placeUnits']();
  const resynced = container.mock.results.at(-1)!.value!;
  lane.laneSeat = 2; lane.laneEpoch = 2;
  scene['syncLane']();
  expect(resynced.destroy).toHaveBeenCalled();
  expect(killAll).toHaveBeenCalledTimes(2);
  expect(scene['effects'].clear).toHaveBeenCalledWith(true, true);
  expect(scene.selectedId).toBeNull();
  expect(scene['units'].size).toBe(0);
  scene['placeUnits']();
  expect(container).toHaveBeenCalledTimes(3);
});
