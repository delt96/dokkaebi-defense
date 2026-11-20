import { createGame, loadGameData } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { expect, test, vi } from 'vitest';
import { GameDriver } from '../src/driver';
import { LaneScene } from '../src/LaneScene';

vi.mock('phaser', () => ({ default: { Scene: class {} } }));

test('combine markers appear for every eligible copy and clear when a material is consumed', () => {
  const state = createGame(loadGameData(), 1);
  const driver = new GameDriver(state);
  const scene = new LaneScene(driver);
  const circle = vi.fn((_x: number, _y: number, _radius: number, _color: number) => ({ setVisible: vi.fn() }));
  const container = () => {
    const view = {
      x: 0, y: 0, add: vi.fn(), on: vi.fn(), destroy: vi.fn(),
      setSize: () => view, setInteractive: () => view, setDepth: () => view,
      setPosition: (x: number, y: number) => { view.x = x; view.y = y; },
    };
    return view;
  };
  const tweens = { add: vi.fn() };
  Object.assign(scene, {
    textures: { exists: () => true },
    add: { circle, container, image: vi.fn() },
    tweens,
  });
  const markers = () => circle.mock.calls.flatMap(([, , radius], i) =>
    radius === 3 ? [circle.mock.results[i]!.value.setVisible] : [],
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
  const banner = { textContent: '', hidden: true };
  vi.stubGlobal('document', { getElementById: () => banner });
  try {
    scene.update(0, 16);
    scene.update(16, 16);
    expect(banner).toEqual({ textContent: '게임 오류 · 화면 갱신 실패', hidden: false });
    expect(update).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledExactlyOnceWith(error);
  } finally {
    vi.unstubAllGlobals();
    log.mockRestore();
  }
});
