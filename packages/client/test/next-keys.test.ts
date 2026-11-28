// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GameDriver } from '../src/driver';
import { mountUi } from '../src/ui/mount';
import { helpLineHtml } from '../src/ui/panels';
import type { FirstTip } from '../src/ui/first-visit';
import { key, STAGE_HTML } from './fixtures/net';
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

const text = (html: string) => { const box = document.createElement('div'); box.innerHTML = html; return box.textContent; };

describe('help line', () => {
  test('solo with nothing selected: W picks the next combine, Q flips the scope', () => {
    expect(text(helpLineHtml('B 장터', { quests: true, pause: true }))).toBe(
      'W 다음 조합 고르기 · Space 소환 · E 강화 · D 도감 · Q 이 유닛/전체 · G 1·2등급 보관 · B 장터 · 1~9 바로 사기 · J 퀘스트 · P 멈춤');
    expect(text(helpLineHtml(undefined, { pause: true }))).toBe(
      'W 다음 조합 고르기 · Space 소환 · E 강화 · D 도감 · Q 이 유닛/전체 · G 1·2등급 보관 · 1~9 바로 사기 · P 멈춤');
  });

  test('an empty board still opens with how to summon', () => {
    const tip: FirstTip = { step: 'summon', text: 'Space나 뚝딱!으로 유닛을 뽑으세요 (도깨비불 4개)', drop: ['W', 'Space', 'G'] };
    expect(text(helpLineHtml('B 장터', { quests: true, pause: true, tip }))).toBe(
      'Space나 뚝딱!으로 유닛을 뽑으세요 (도깨비불 4개) · E 강화 · D 도감 · Q 이 유닛/전체 · B 장터 · 1~9 바로 사기 · J 퀘스트 · P 멈춤');
  });

  test('solo with a unit selected', () => {
    expect(text(helpLineHtml('B 장터', { selected: true, storable: true, jige: true }))).toBe(
      'Z/X/C 조합(판에 짝 표시) · S 판매 · A 보관 · R 지게 · Tab 상세 · M 옮기기 · W 다음 조합 · Esc 해제');
    expect(text(helpLineHtml(undefined, { selected: true }))).toBe(
      'Z/X/C 조합(판에 짝 표시) · S 판매 · Tab 상세 · M 옮기기 · W 다음 조합 · Esc 해제');
  });

  test('online with nothing selected keeps Q 도우미 and has no P', () => {
    expect(text(helpLineHtml('B 장터', { online: true, quests: true }))).toBe(
      'W 다음 조합 고르기 · Space 소환 · E 강화 · D 도감 · Q 도우미 · G 1·2등급 보관 · B 장터 · 1~9 바로 사기 · J 퀘스트');
  });

  test('moving a unit', () => {
    expect(text(helpLineHtml(undefined, { moving: true, selected: true }))).toBe('옮길 칸을 누르세요 · Esc 취소');
  });

});

describe('W, Shift+W and Z/X/C off the next list', () => {
  let driver: GameDriver;
  let scene: FakeScene;
  let queue: ReturnType<typeof vi.spyOn>;
  // each test mounts again; the keydown listeners of earlier mounts would still answer and redraw the shared page
  const listeners: [string, EventListenerOrEventListenerObject][] = [];
  const left = () => document.getElementById('left')!;
  const slotOf = (id: number | null) => driver.state.slots.findIndex(u => u?.id === id);
  const combines = () => queue.mock.calls.map(c => c[0] as { type: string; result?: string; slot?: number }).filter(c => c.type === 'combine');
  function mount(target: string | null): void {
    sessionStorage.clear();
    if (target) sessionStorage.setItem('t', target);
    document.body.innerHTML = STAGE_HTML;
    driver = new GameDriver(mockBoardState());
    queue = vi.spyOn(driver, 'queue');
    scene = new FakeScene();
    mountUi(driver, scene as never, {}, { targetKey: 't' });
  }
  beforeEach(() => {
    const add = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => {
      listeners.push([type, fn]);
      add(type, fn, o);
    });
    localStorage.clear();
  });
  afterEach(() => {
    for (const [type, fn] of listeners.splice(0)) window.removeEventListener(type, fn);
    vi.restoreAllMocks();
  });

  test('W walks the ready combines of 전체 and marks the row it picked', () => {
    mount(MOCK_TARGET);
    key('KeyW');
    expect(slotOf(scene.selectedId)).toBe(6);
    expect(left().querySelectorAll('.w-pick')).toHaveLength(1);
    expect(left().querySelector('.w-pick')!.getAttribute('data-recipe')).toBe('didilbangga');
    key('KeyW');
    expect(slotOf(scene.selectedId)).toBe(0);
    expect(left().querySelector('.w-pick')!.getAttribute('data-recipe')).toBe('meongseok');
    key('KeyW');
    expect(slotOf(scene.selectedId)).toBe(7);
    expect(left().querySelector('.w-pick')!.getAttribute('data-recipe')).toBe('jeolgu');
  });

  test('Shift+W walks the slots and drops the W mark', () => {
    mount(MOCK_TARGET);
    key('KeyW');
    key('KeyW');
    key('KeyW');
    key('KeyW', { shiftKey: true });
    expect(slotOf(scene.selectedId)).toBe(8);
    expect(left().querySelector('.w-pick')).toBeNull();
    key('KeyW', { shiftKey: true });
    expect(slotOf(scene.selectedId)).toBe(9);
  });

  test('selecting another way drops the W mark', () => {
    mount(MOCK_TARGET);
    key('KeyW');
    scene.select(0);
    expect(left().querySelector('.w-pick')).toBeNull();
  });

  test('Z/X/C follow the list: the target group first', () => {
    mount(MOCK_TARGET);
    scene.select(0);
    for (const code of ['KeyZ', 'KeyX', 'KeyC']) key(code);
    expect(combines()).toEqual([
      { type: 'combine', result: 'didilbangga', slot: 0, via: 'list' },
      { type: 'combine', result: 'meongseok', slot: 0, via: 'list' },
      { type: 'combine', result: 'baneul', slot: 0, via: 'list' },
    ]);
  });

  test('without a target Z stays 디딜방아 and X goes back to grade order', () => {
    mount(null);
    scene.select(0);
    key('KeyZ');
    key('KeyX');
    expect(combines()).toEqual([
      { type: 'combine', result: 'didilbangga', slot: 0, via: 'list' },
      { type: 'combine', result: 'baneul', slot: 0, via: 'list' },
    ]);
  });

  test('the 상세 window lists the combines in the same order with the same keys', () => {
    mount(MOCK_TARGET);
    scene.select(0);
    key('Tab');
    const heads = Array.from(document.querySelectorAll('#win-left .recipe-head .recipe-row'), r => r.textContent!.trim());
    expect(heads[0]!.startsWith('[Z]')).toBe(true);
    expect(heads[0]).toContain('디딜방아');
    expect(heads[1]!.startsWith('[X]')).toBe(true);
    expect(heads[1]).toContain('멍석');
  });

  test('after W and Z the selection follows the new unit, scope 이 유닛, no W mark', () => {
    mount(MOCK_TARGET);
    key('KeyW');
    key('KeyZ');
    const sent = combines()[0]!;
    expect(sent.slot).toBe(6);
    driver.update(driver.state.data.balance.tickMs);
    const unit = driver.state.slots.find(u => u?.id === scene.selectedId);
    expect(unit?.defId).toBe(sent.result);
    expect(left().querySelector('.scope-btn[aria-pressed="true"]')!.getAttribute('data-arg')).toBe('unit');
    expect(left().querySelector('.w-pick')).toBeNull();
  });
});
