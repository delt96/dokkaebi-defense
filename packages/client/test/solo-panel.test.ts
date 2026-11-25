// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GameDriver } from '../src/driver';
import { mountUi } from '../src/ui/mount';
import { nextCombines } from '../src/ui/models';
import { soloPanelHtml, type SoloPanelOpts } from '../src/ui/panels';
import { settingsHtml } from '../src/ui/settings';
import { key, press, STAGE_HTML } from './fixtures/net';
import { MOCK_TARGET, mockBoardState } from './fixtures/next-board';

class FakeScene {
  selectedId: number | null = null;
  reduceEffects = false;
  onFrame?: () => void;
  private selectCb: ((slot: number | null) => void) | null = null;
  onSelect(cb: (slot: number | null) => void): void { this.selectCb = cb; }
  onEvents(): void {}
  setReduceEffects(on: boolean): void { this.reduceEffects = on; }
  select(slot: number | null): void { this.selectCb?.(slot); }
}

const left = () => document.getElementById('left')!;
const modal = () => document.getElementById('modal')!;
const scopeBtn = (arg: 'unit' | 'all') => left().querySelector<HTMLButtonElement>(`.scope-btn[data-arg="${arg}"]`)!;
const pressedScope = () => left().querySelector('.scope-btn[aria-pressed="true"]')?.textContent;
const choice = (action: string, arg: string) => modal().querySelector<HTMLButtonElement>(`[data-action="${action}"][data-arg="${arg}"]`)!;
const gear = () => document.querySelector<HTMLElement>('#top [data-action="openSettings"]')!;

describe('solo left panel', () => {
  let driver: GameDriver;
  let scene: FakeScene;
  let queue: ReturnType<typeof vi.spyOn>;
  const opened = () => queue.mock.calls.filter(c => (c[0] as { type: string }).type === 'helperOpened').length;
  // each test mounts again; the keydown listeners of earlier mounts would still answer Q and redraw the shared page
  const listeners: [string, EventListenerOrEventListenerObject][] = [];
  beforeEach(() => {
    const add = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => {
      listeners.push([type, fn]);
      add(type, fn, o);
    });
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('t', MOCK_TARGET);
    document.body.innerHTML = STAGE_HTML;
    driver = new GameDriver(mockBoardState());
    queue = vi.spyOn(driver, 'queue');
    scene = new FakeScene();
    mountUi(driver, scene as never, {}, { targetKey: 't' });
  });
  afterEach(() => {
    for (const [type, fn] of listeners.splice(0)) window.removeEventListener(type, fn);
    vi.restoreAllMocks();
  });

  test('with nothing selected: the three-line head, 전체 pressed and the whole list, no old helper or empty card', () => {
    expect(left().querySelector('.nc-head')!.textContent).toBe('다음 할 일W로 맨 위 조합 고르기그다음 Z로 조합');
    expect(scopeBtn('unit').textContent).toBe('이 유닛');
    expect(scopeBtn('unit').disabled).toBe(true);
    expect(scopeBtn('all').textContent).toBe('전체 11');
    expect(pressedScope()).toBe('전체 11');
    expect(left().querySelector('.scope-q')!.textContent).toBe('Q');
    expect(left().querySelector('.nc-list .next-group .next-title')!.textContent).toBe('목표 · 연자방아');
    expect(left().querySelector('.nc-list')!.getAttribute('data-scroll-key')).not.toBeNull();
    expect(left().querySelector('.unit-panel, .helper, .panel-title')).toBeNull();
    expect(left().textContent).not.toContain('유닛을 누르면');
    expect(left().querySelector('.up-actions')).toBeNull();
  });

  test('selecting a unit: 이 유닛 4, its keyed rows first, the skill line and the short action row', () => {
    scene.select(0);
    expect(pressedScope()).toBe('이 유닛 4');
    expect(scopeBtn('all').textContent).toBe('전체 11');
    const first = left().querySelector('.nc-list .recipe-row')!;
    expect(first.getAttribute('data-recipe')).toBe('didilbangga');
    expect(first.textContent!.trimStart().startsWith('[Z]')).toBe(true);
    expect(left().querySelector('.skill-line')!.getAttribute('aria-expanded')).toBe('false');
    const price = driver.state.data.balance.sellPrice[0];
    const actions = Array.from(left().querySelectorAll('.up-actions button'), b => b.textContent);
    expect(actions).toEqual(['상세', '보관', `판매 +${price}냥`]);
    expect(left().querySelector('.up-actions [data-action="sell"]')!.getAttribute('title')).toBe('S');
    expect(left().querySelector('.up-actions [data-action="store"]')!.getAttribute('title')).toBe('A');
    expect(left().querySelector('.up-actions [data-action="unitDetails"]')!.getAttribute('title')).toBe('Tab');
  });

  test('Q flips the scope of a selected unit and counts only the switch to 전체; Esc goes back to 전체', () => {
    scene.select(0);
    key('KeyQ');
    expect(pressedScope()).toBe('전체 11');
    expect(opened()).toBe(1);
    key('KeyQ');
    expect(pressedScope()).toBe('이 유닛 4');
    expect(opened()).toBe(1);
    key('Escape');
    expect(pressedScope()).toBe('전체 11');
    expect(opened()).toBe(1);
  });

  test('Q with nothing selected changes nothing and sends nothing', () => {
    key('KeyQ');
    expect(pressedScope()).toBe('전체 11');
    expect(opened()).toBe(0);
  });

  test('the scope buttons switch the list too', () => {
    scene.select(0);
    press(scopeBtn('all'));
    expect(pressedScope()).toBe('전체 11');
    expect(opened()).toBe(1);
    press(scopeBtn('unit'));
    expect(pressedScope()).toBe('이 유닛 4');
  });

  test('the skill line unfolds the whole skill text and folds again for another unit', () => {
    scene.select(0);
    press(left().querySelector('.skill-line'));
    expect(left().querySelector('.skill-line')!.getAttribute('aria-expanded')).toBe('true');
    const full = left().querySelector('.skill-line')!.getAttribute('title')!;
    expect(full.length).toBeGreaterThan(0);
    for (const line of full.split(' / ')) expect(left().querySelector('.nc-skill')!.textContent).toContain(line);
    scene.select(4);
    expect(left().querySelector('.skill-line')!.getAttribute('aria-expanded')).toBe('false');
    expect(left().querySelector('.nc-skill')).toBeNull();
  });

  test('a one-short row opens the dex on that unit', () => {
    scene.select(0);
    press(left().querySelector('span.recipe-row[data-recipe="saekkijul"]'));
    expect(modal().querySelector('.dex-modal, .dex')).not.toBeNull();
    expect(modal().querySelector('tr.dex-flash')!.getAttribute('data-dex-id')).toBe('saekkijul');
    expect(modal().querySelector('.dex-back')).toBeNull();
  });

  test('+N개 더 unfolds the one-short group of 전체', () => {
    const more = left().querySelector<HTMLElement>('.next-more');
    expect(more).not.toBeNull();
    press(more);
    expect(left().querySelector('.next-more')).toBeNull();
  });

  test('a grade 3 unit after one S shows only the confirm button in the action row', () => {
    scene.select(3);
    key('KeyS');
    const buttons = Array.from(left().querySelectorAll('.up-actions button'), b => b.textContent);
    const price = driver.state.data.balance.sellPrice[2];
    expect(buttons).toEqual([`한 번 더 누르면 판매 +${price}냥`]);
  });

  test('settings: the solo helper row is 고르지 않았을 때 전체 목록, on by default; off leaves only the head; Q leaves it alone', () => {
    press(gear());
    const row = modal().querySelector('.settings-row[data-setting="helper"]')!;
    expect(row.querySelector('span')!.textContent).toBe('고르지 않았을 때 전체 목록');
    expect(choice('setHelper', 'on').getAttribute('aria-pressed')).toBe('true');
    press(choice('setHelper', 'off'));
    expect(left().querySelector('.nc-head')).not.toBeNull();
    expect(left().querySelector('.scope-btn, .nc-list')).toBeNull();
    key('KeyQ');
    expect(choice('setHelper', 'off').getAttribute('aria-pressed')).toBe('true');
    expect(opened()).toBe(0);
    key('Escape');
    scene.select(0);
    expect(left().querySelector('.scope-btn')).not.toBeNull();
    expect(left().querySelector('.nc-list')).not.toBeNull();
  });
});

describe('soloPanelHtml', () => {
  const base = (o: Partial<SoloPanelOpts> = {}): SoloPanelOpts => ({
    selected: null, list: nextCombines(mockBoardState()), idleList: true, wPick: null, hover: null, showAllOne: false, skillOpen: false, ...o,
  });
  const dom = (html: string) => { const box = document.createElement('div'); box.innerHTML = html; return box; };

  test('the held 지게 sits on one row above the actions, the note moved to the button title', () => {
    const s = mockBoardState();
    const box = dom(soloPanelHtml(s, base({ selected: 0, list: nextCombines(s, { slot: 0 }), jige: 2 })));
    const jige = box.querySelector('.up-jige')!;
    expect(jige.textContent).toContain('보유 지게 2개');
    expect(jige.querySelector('[data-action="jigeOpen"]')!.getAttribute('title')).toBe('지게: 같은 등급의 다른 유닛으로 바꿉니다');
    expect(jige.querySelector('.jige-note')).toBeNull();
    expect(jige.nextElementSibling!.classList.contains('up-actions')).toBe(true);
  });

  test('a grade 3 unit has no 보관 button', () => {
    const s = mockBoardState();
    const box = dom(soloPanelHtml(s, base({ selected: 3, list: nextCombines(s, { slot: 3 }) })));
    expect(box.querySelector('[data-action="store"]')).toBeNull();
  });

  test('the settings row keeps its old name outside solo', () => {
    expect(settingsHtml({ helper: true, reducedFx: false, help: true })).toContain('<span>조합 도우미</span>');
    expect(settingsHtml({ helper: true, reducedFx: false, help: true, solo: true })).toContain('<span>고르지 않았을 때 전체 목록</span>');
  });
});
