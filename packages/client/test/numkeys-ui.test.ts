// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import { forceRound, withoutMarketLock } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { mountUi } from '../src/ui/mount';
import { key, press, STAGE_HTML } from './fixtures/net';

class FakeScene {
  selectedId: number | null = null;
  reduceEffects = false;
  storageCovered = false;
  onFrame?: () => void;
  onSelect(): void {}
  onEvents(): void {}
  showGambleResult(): void {}
  showGambleNotice(): void {}
  showBirth(): void {}
  hideBirth(): void {}
  setNoticeSpan(): void {}
  setReduceEffects(on: boolean): void { this.reduceEffects = on; }
}

let clock = 1000;
// each test mounts again; the keydown listeners of earlier mounts would still answer and redraw the shared page
const listeners: [string, EventListenerOrEventListenerObject][] = [];
beforeEach(() => {
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => {
    listeners.push([type, fn]);
    add(type, fn, o);
  });
  localStorage.clear();
  document.body.innerHTML = STAGE_HTML;
  delete document.documentElement.dataset.wins;
  clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  for (const [type, fn] of listeners.splice(0)) window.removeEventListener(type, fn);
  delete document.documentElement.dataset.wins;
  vi.restoreAllMocks();
});

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);

function mountSolo(coins = 5000) {
  const s = createGame(withoutMarketLock(loadGameData('stage3')), 1);
  forceRound(s, 3);
  s.coins = coins;
  const driver = new GameDriver(s);
  const queue = vi.spyOn(driver, 'queue');
  const scene = new FakeScene();
  mountUi(driver, scene as never);
  const frame = (): void => { clock += 150; scene.onFrame?.(); };
  const sent = (type: string) => queue.mock.calls.filter(c => (c[0] as { type: string }).type === type);
  return { s, driver, queue, scene, frame, sent };
}

describe('number keys buy', () => {
  test('4 gambles 10냥 with the market closed', () => {
    const { queue } = mountSolo();
    key('Digit4');
    expect(queue).toHaveBeenCalledWith({ type: 'gambleCoins', stake: 10 });
    expect($('#win-right .econ-panel')).toBeNull();
  });

  test('a second press while the reveal rolls is ignored', () => {
    const { driver, frame, sent } = mountSolo();
    key('Digit4');
    key('Digit4');
    expect(sent('gambleCoins')).toHaveLength(1);
    driver.update(50);
    frame();
    clock += 2000;
    frame();
    key('Digit4');
    expect(sent('gambleCoins')).toHaveLength(2);
  });

  test('a purchase the client already knows is blocked is refused without being sent', () => {
    const { sent } = mountSolo(0);
    $('#slot-say')!.textContent = '';
    key('Digit4');
    expect(sent('gambleCoins')).toHaveLength(0);
    expect($('#slot-say')!.textContent).not.toBe('');
    key('Digit7');
    expect(sent('gambleUnit')).toHaveLength(0);
    expect($('#slot-say')!.textContent).toContain('30라운드');
  });

  test('a refused key purchase says why on the board', () => {
    const { driver } = mountSolo(0);
    $('#slot-say')!.textContent = '';
    key('Digit4');
    driver.update(50);
    expect($('#slot-say')!.textContent).not.toBe('');
  });

  test('the stored assignment is used', () => {
    localStorage.setItem('dorandi.numKeys', JSON.stringify([null, null, null, null, null, null, null, null, 'gambleCoins:10']));
    const { sent } = mountSolo();
    key('Digit4');
    expect(sent('gambleCoins')).toHaveLength(0);
    key('Digit9');
    expect(sent('gambleCoins')).toEqual([[{ type: 'gambleCoins', stake: 10 }]]);
  });

  test('no purchase under the settings window, the pause or while composing', () => {
    const { sent } = mountSolo();
    press($('#top [data-action="openSettings"]'));
    key('Digit1');
    key('Escape');
    key('KeyP');
    key('Digit1');
    key('KeyP');
    key('Digit1', { isComposing: true });
    expect(sent('upgrade')).toHaveLength(0);
  });
});

const keyText = (sel: string) => $(sel)?.querySelector('.num-key')?.textContent ?? null;

describe('number key labels', () => {
  test('the 강화 window shows each row its assigned key', () => {
    mountSolo();
    key('KeyE');
    expect(Array.from(document.querySelectorAll('#win-right .up-item'), r => r.querySelector('.upgrade-key')?.textContent ?? null)).toEqual(['1', '2', '3']);
  });

  test('an unassigned upgrade has no key mark', () => {
    localStorage.setItem('dorandi.numKeys', JSON.stringify(['upgrade:physical', 'upgrade:magical', null, null, null, null, null, null, 'upgrade:polish']));
    mountSolo();
    key('KeyE');
    expect(Array.from(document.querySelectorAll('#win-right .up-item'), r => r.querySelector('.upgrade-key')?.textContent ?? null)).toEqual(['1', '2', '9']);
  });

  test('market buttons show their key; an unassigned product shows none', () => {
    localStorage.setItem('dorandi.numKeys', JSON.stringify(['upgrade:physical', 'upgrade:magical', 'upgrade:polish', 'gambleCoins:10', 'gambleCoins:100', 'gambleUnit:small', 'gambleUnit:big', null, null]));
    mountSolo();
    key('KeyB');
    expect(keyText('[data-action="gambleCoins"][data-arg="10"]')).toBe('4');
    expect(keyText('[data-action="gambleCoins"][data-arg="100"]')).toBe('5');
    expect(keyText('[data-action="gambleUnit"][data-arg="small"]')).toBe('6');
    expect(keyText('[data-action="gambleUnit"][data-arg="big"]')).toBe('7');
    expect(keyText('[data-action="gambleUnit"][data-arg="coin"]')).toBeNull();
    expect($('[data-action="gambleCoins"][data-arg="10"] .num-key')!.getAttribute('aria-hidden')).toBe('true');
    expect($('#win-right .econ-panel [title]')).toBeNull();
  });

  test('the help line names the number keys', () => {
    mountSolo();
    expect($('#bottom')!.textContent).toContain('B 장터 · 1~9 바로 사기');
  });
});

const ctrlDown = (node: Element | null, init: MouseEventInit = { ctrlKey: true }) => {
  if (!node) throw new Error('nothing to press');
  return node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse', ...init }));
};
const ask = () => $('#win-right .key-ask');
const stored = () => JSON.parse(localStorage.getItem('dorandi.numKeys') ?? 'null') as (string | null)[] | null;
const COINS_10 = '#win-right [data-action="gambleCoins"][data-arg="10"]';

describe('ctrl+click sets a number key', () => {
  test('ctrl+click asks instead of buying', () => {
    const { sent } = mountSolo();
    key('KeyB');
    ctrlDown($(COINS_10));
    expect(sent('gambleCoins')).toHaveLength(0);
    expect(ask()!.textContent).toContain('돈 도박 10냥을 몇 번 키에 걸까요?');
    expect(ask()!.querySelector('[data-action="keyAskPick"][data-arg="4"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(ask()!.querySelector('[data-action="keyAskPick"][data-arg="5"]')!.getAttribute('aria-pressed')).toBe('false');
  });

  test('⌘+click works the same', () => {
    const { sent } = mountSolo();
    key('KeyB');
    ctrlDown($(COINS_10), { metaKey: true });
    expect(sent('gambleCoins')).toHaveLength(0);
    expect(ask()).not.toBeNull();
  });

  test('a digit answers the question and buys only afterwards', () => {
    const { sent } = mountSolo();
    key('KeyB');
    ctrlDown($(COINS_10));
    key('Digit9');
    expect(sent('gambleCoins')).toHaveLength(0);
    expect(ask()).toBeNull();
    expect(stored()![8]).toBe('gambleCoins:10');
    expect(stored()![3]).toBeNull();
    expect($(COINS_10)!.querySelector('.num-key')!.textContent).toBe('9');
    key('Digit9');
    expect(sent('gambleCoins')).toHaveLength(1);
  });

  test('a digit still answers while Ctrl is held from the click', () => {
    const { sent } = mountSolo();
    key('KeyB');
    ctrlDown($(COINS_10));
    const ev = new KeyboardEvent('keydown', { code: 'Digit9', ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(ask()).toBeNull();
    expect(stored()![8]).toBe('gambleCoins:10');
    expect(sent('gambleCoins')).toHaveLength(0);
  });

  test('a disabled 강화 button lets the pointer through to its row', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/ui/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/\.up-item button:disabled\s*\{[^}]*pointer-events:\s*none/);
  });

  test('pressing a number cell answers too', () => {
    const { sent } = mountSolo();
    key('KeyB');
    ctrlDown($(COINS_10));
    press(ask()!.querySelector('[data-action="keyAskPick"][data-arg="2"]'));
    expect(ask()).toBeNull();
    expect(stored()![1]).toBe('gambleCoins:10');
    expect(sent('gambleCoins')).toHaveLength(0);
  });

  test('a locked product can be assigned through its cell', () => {
    mountSolo();
    key('KeyB');
    const locked = $('#win-right [data-action="gambleUnit"][data-arg="big"]')!;
    expect(locked.hasAttribute('disabled')).toBe(true);
    ctrlDown(locked.closest('.gamble-option'));
    expect(ask()!.textContent).toContain('큰 보따리를 몇 번 키에 걸까요?');
  });

  test('강화 rows too', () => {
    const { sent } = mountSolo();
    key('KeyE');
    ctrlDown(document.querySelectorAll('#win-right .up-item')[2]!.querySelector('button'));
    expect(sent('upgrade')).toHaveLength(0);
    expect(ask()!.textContent).toContain('등급 손질을 몇 번 키에 걸까요?');
  });

  test('키 빼기 clears the key; Esc closes only the question', () => {
    mountSolo();
    key('KeyB');
    ctrlDown($(COINS_10));
    press(ask()!.querySelector('[data-action="keyAskClear"]'));
    expect(ask()).toBeNull();
    expect(stored()![3]).toBeNull();
    ctrlDown($(COINS_10));
    key('Escape');
    expect(ask()).toBeNull();
    expect($('#win-right .econ-panel')).not.toBeNull();
  });

  test('closing the window drops the question', () => {
    mountSolo();
    key('KeyB');
    ctrlDown($(COINS_10));
    key('KeyB');
    expect(ask()).toBeNull();
    key('KeyB');
    expect(ask()).toBeNull();
  });

  test('the context menu is held back only with ctrl', () => {
    mountSolo();
    key('KeyB');
    const cell = $(COINS_10)!.closest('.gamble-option')!;
    expect(cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ctrlKey: true }))).toBe(false);
    expect(cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))).toBe(true);
  });
});
