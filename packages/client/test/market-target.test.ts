// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import { withoutMarketLock } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { mountUi } from '../src/ui/mount';
import { key, press, STAGE_HTML } from './fixtures/net';

// the pinned recipe sits at the lane's right edge, under the B drawer; the stage class moves it beside the drawer
test('the stage is marked market-open while the B drawer is out, so the pinned recipe stays visible', () => {
  document.body.innerHTML = STAGE_HTML;
  const driver = new GameDriver(createGame(withoutMarketLock(loadGameData('stage3')), 1));
  mountUi(driver, { selectedId: null, onSelect() {}, onEvents() {} } as never);
  key('KeyD');
  press(document.querySelector('[data-dex-id="gamasot"] .pin-btn'));
  key('Escape');
  const stage = document.getElementById('stage')!;
  expect(document.getElementById('target-overlay')!.textContent).toContain('가마솥');
  expect(stage.classList.contains('market-open')).toBe(false);
  key('KeyB');
  expect(document.getElementById('econ-panel')!.firstChild).not.toBeNull();
  expect(stage.classList.contains('market-open')).toBe(true);
  key('KeyB');
  expect(stage.classList.contains('market-open')).toBe(false);
});
