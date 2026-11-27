// @vitest-environment happy-dom
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
