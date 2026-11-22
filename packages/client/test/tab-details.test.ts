// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { mountUi } from '../src/ui/mount';
import { key, STAGE_HTML } from './fixtures/net';

class FakeScene {
  selectedId: number | null = null;
  onFrame?: () => void;
  select?: (slot: number | null) => void;
  onSelect(cb: (slot: number | null) => void): void { this.select = cb; }
  onEvents(): void {}
}

const details = () => document.querySelector('#modal .unit-details');

// one mount per file: mountUi leaves its window key listener behind
describe('Tab opens the unit details', () => {
  let scene: FakeScene;
  let driver: GameDriver;
  beforeEach(() => {
    document.body.innerHTML = STAGE_HTML;
    const s = createGame(loadGameData('stage3'), 1);
    forceRound(s, 3);
    driver = new GameDriver(s);
    scene = new FakeScene();
    mountUi(driver, scene as never);
  });

  test('Tab toggles 상세 for the selected unit; W still moves to the next unit', () => {
    const data = driver.state.data;
    const a = placeUnitForTest(driver.state, data.units.find(u => u.grade === 1)!.id, 0);
    const b = placeUnitForTest(driver.state, data.units.find(u => u.grade === 2)!.id, 1);
    key('Tab');
    expect(details()).toBeNull();
    scene.select!(0);
    key('Tab');
    expect(details()).not.toBeNull();
    expect(scene.selectedId).toBe(a.id);
    key('Tab');
    expect(details()).toBeNull();
    key('KeyW');
    expect(scene.selectedId).toBe(b.id);
    expect(details()).toBeNull();
  });
});
