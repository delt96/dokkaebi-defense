// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import {
  MENU_MODALS, NO_SIDES, closeSide, coveredIds, escStep, openSide, portraitGuide, rightBarHtml, sidesLocked, soloPause, toggleSide, winHeadHtml,
  type PauseInput, type Sides,
} from '../src/ui/windows';

test('one window a side; a second left window replaces the first, left and right stay together', () => {
  let s = openSide(NO_SIDES, 'details');
  s = openSide(s, 'market');
  expect(s).toEqual({ left: 'details', right: 'market', last: 'right' });
  s = openSide(s, 'jige');
  expect(s).toEqual({ left: 'jige', right: 'market', last: 'left' });
  expect(toggleSide(s, 'jige')).toEqual({ left: null, right: 'market', last: 'right' });
  expect(closeSide(closeSide(s, 'left'), 'right')).toEqual(NO_SIDES);
});

test('Esc: scene, then a locking window, then the last side window, then the selection', () => {
  const both: Sides = { left: 'details', right: 'upgrades', last: 'right' };
  expect(escStep({ scene: true, locking: true, sidesLocked: true, sides: both })).toBe('scene');
  expect(escStep({ scene: false, locking: true, sidesLocked: true, sides: both })).toBe('locking');
  expect(escStep({ scene: false, locking: false, sidesLocked: false, sides: both })).toBe('right');
  expect(escStep({ scene: false, locking: false, sidesLocked: false, sides: closeSide(both, 'right') })).toBe('left');
  expect(escStep({ scene: false, locking: false, sidesLocked: false, sides: NO_SIDES })).toBe('selection');
  // P pause locks the side windows but Esc never lifts it: Esc goes on to the selection
  expect(escStep({ scene: false, locking: false, sidesLocked: true, sides: both })).toBe('selection');
});

test('layers 4-6 and 8 lock the side windows', () => {
  const none = { locking: false, paused: false, scene: false, portrait: false, failed: false };
  expect(sidesLocked(none)).toBe(false);
  for (const k of ['locking', 'paused', 'scene', 'portrait', 'failed'] as const) expect(sidesLocked({ ...none, [k]: true })).toBe(true);
});

test('pillars cover the panels under them; outside windows and the online helper-pop cover nothing', () => {
  expect(coveredIds('inside', { left: 'jige', right: 'quests', last: 'left' })).toEqual(['left', 'storage', 'right', 'target-overlay']);
  expect(coveredIds('inside', { left: 'helper', right: null, last: 'left' })).toEqual([]);
  expect(coveredIds('outside', { left: 'details', right: 'market', last: 'right' })).toEqual([]);
});

test('window head and the pillar bar', () => {
  const head = winHeadHtml({ side: 'right', titleHtml: '장터 (B)', closeLabel: '장터 닫기 (B)' });
  expect(head).toContain('id="win-right-title"');
  expect(head).toContain('data-action="closeWin" data-arg="right"');
  const s = createGame(loadGameData('stage3'), 1); s.tokens = 68; s.coins = 3000; s.buckwheat = 20;
  const bar = document.createElement('div'); bar.innerHTML = rightBarHtml(s, 0);
  expect(bar.querySelector('[data-action="summon"]')!.textContent).toBe('뚝딱 (Space)');
  expect(bar.textContent!.replace(/\s+/g, ' ').trim()).toBe('뚝딱 (Space) 불 68 · 엽전 3000 · 묵 20');
  bar.innerHTML = rightBarHtml(s, 500);
  expect(bar.textContent).toContain('엽전 2500');
});

test('soloPause: what stops the solo clock, draws the pill and the cover', () => {
  const p = (o: Partial<PauseInput>) => soloPause({ userPaused: false, modal: null, ended: false, portrait: false, ...o });
  expect(MENU_MODALS).toEqual(['menu', 'restartAsk', 'homeAsk']);
  expect(p({})).toEqual({ paused: false, pill: false, cover: false });
  expect(p({ userPaused: true })).toEqual({ paused: true, pill: true, cover: true });
  for (const modal of MENU_MODALS) expect(p({ modal })).toEqual({ paused: true, pill: true, cover: false });
  // the dex pause draws no pill (B3)
  expect(p({ modal: 'dex' })).toEqual({ paused: true, pill: false, cover: false });
  expect(p({ modal: 'settings' })).toEqual({ paused: false, pill: false, cover: false });
  expect(p({ portrait: true })).toEqual({ paused: true, pill: true, cover: false });
  expect(p({ userPaused: true, modal: 'menu' })).toEqual({ paused: true, pill: true, cover: true });
  expect(p({ userPaused: true, portrait: true })).toEqual({ paused: true, pill: true, cover: true });
  expect(p({ ended: true, modal: 'menu', portrait: true })).toEqual({ paused: false, pill: false, cover: false });
  expect(p({ ended: true, modal: 'dex' })).toEqual({ paused: false, pill: false, cover: false });
  expect(p({ ended: true, userPaused: true })).toEqual({ paused: true, pill: false, cover: false });
});

test('portraitGuide: portrait and narrower than the board, not dismissed, no outer screen', () => {
  const g = (o: object) => portraitGuide({ portrait: true, width: 390, dismissed: false, screenOpen: false, ...o });
  expect(g({})).toBe(true);
  expect(g({ width: 640 })).toBe(false);
  expect(g({ portrait: false, width: 390 })).toBe(false);
  expect(g({ dismissed: true })).toBe(false);
  expect(g({ screenOpen: true })).toBe(false);
});
