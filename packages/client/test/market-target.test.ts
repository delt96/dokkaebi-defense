// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, loadGameData } from '@dorandi/logic';
import { withoutMarketLock } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { mountUi } from '../src/ui/mount';
import { key, press, STAGE_HTML } from './fixtures/net';

afterEach(() => { delete document.documentElement.dataset.wins; });

// the market sits right of x 458 or off the board, so the pinned recipe never has to move out of its way
test('opening the market leaves the pinned recipe where it is', () => {
  document.body.innerHTML = STAGE_HTML;
  const driver = new GameDriver(createGame(withoutMarketLock(loadGameData('stage3')), 1));
  mountUi(driver, { selectedId: null, onSelect() {}, onEvents() {} } as never);
  key('KeyD');
  press(document.querySelector('[data-dex-id="gamasot"] .pin-btn'));
  key('Escape');
  const stage = document.getElementById('stage')!;
  const overlay = document.getElementById('target-overlay')!;
  expect(overlay.textContent).toContain('가마솥');
  const before = overlay.innerHTML;
  key('KeyB');
  expect(document.querySelector('#win-right .econ-panel')).not.toBeNull();
  expect(stage.classList.contains('market-open')).toBe(false);
  expect(overlay.innerHTML).toBe(before);
  expect(overlay.inert).toBe(true);
  key('KeyB');
  expect(document.querySelector('#win-right .econ-panel')).toBeNull();
  expect(overlay.inert).toBe(false);
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/ui/style.css'), 'utf8');
  expect(css).not.toContain('market-open');
});
