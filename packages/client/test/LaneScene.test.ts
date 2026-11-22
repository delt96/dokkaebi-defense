import { EventEmitter } from 'node:events';
import { laneToCanvas } from '../src/layout';
import { createGame, loadGameData } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { expect, test, vi } from 'vitest';
import { GameDriver } from '../src/driver';
import { LaneScene } from '../src/LaneScene';
import { FX_DEPTH } from '../src/fx/FxLayer';

vi.mock('phaser', () => ({ default: { Scene: class {} } }));

function setupScene() {
  const state = createGame(loadGameData(), 1);
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
  const tweens = { add: vi.fn() };
  Object.assign(scene, {
    textures: { exists: () => true },
    add: { circle, container, image: vi.fn() },
    tweens,
  });
  return { state, driver, scene, circle, tweens, container };
}

test('the unit grade dot is drawn above attack effects and follows the visible unit', () => {
  const { scene, state, container } = setupScene();
  placeUnitForTest(state, 'sotlid', 0);
  scene['placeUnits']();
  const view = container.mock.results[0]!.value;
  view.visible = true;
  view.scaleY = 1;
  view.setPosition(80, 90);
  const overlay = { clear: vi.fn(), fillStyle: vi.fn(), fillCircle: vi.fn() };
  Object.assign(scene, { overlay, coverage: { clear: vi.fn() } });
  expect(FX_DEPTH.unitOverlay).toBeGreaterThan(FX_DEPTH.air);

  scene['drawSelection']();
  expect(overlay.fillCircle).toHaveBeenCalledWith(80, 76, 2);
  overlay.fillCircle.mockClear();
  view.visible = false;
  scene['drawSelection']();
  expect(overlay.fillCircle).not.toHaveBeenCalled();
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

test('combine markers appear for every eligible copy and clear when a material is consumed', () => {
  const { state, driver, scene, circle, tweens } = setupScene();
  const markers = () => circle.mock.calls.flatMap(([, , radius], i) =>
    radius === 2 ? [circle.mock.results[i]!.value.setVisible] : [],
  );

  placeUnitForTest(state, 'sotlid', 0);
  placeUnitForTest(state, 'sotlid', 1);
  placeUnitForTest(state, 'buchae', 2);
  scene['placeUnits']();
  expect(markers().map(marker => marker.mock.lastCall)).toEqual([[false], [false], [false]]);

  placeUnitForTest(state, 'bujigaengi', 3);
  scene['placeUnits']();
  expect(markers().map(marker => marker.mock.lastCall)).toEqual([[true], [true], [false], [true]]);

  const visibilityUpdates = markers().map(marker => marker.mock.calls.length);
  scene['placeUnits']();
  expect(markers().map(marker => marker.mock.calls.length)).toEqual(visibilityUpdates);
  expect(tweens.add).not.toHaveBeenCalled();

  driver.queue({ type: 'combine', result: 'gamasot', slot: 0 });
  driver.update(state.data.balance.tickMs);
  scene['placeUnits']();
  expect(markers()[1]).toHaveBeenLastCalledWith(false);
  expect(markers()[4]).toHaveBeenLastCalledWith(false);

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
