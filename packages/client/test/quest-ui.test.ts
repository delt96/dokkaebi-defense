// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, econView, loadGameData, type ClientView, type EconMine, type GameState, type QuestRecord } from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { questBoxModel, questRows } from '../src/ui/econ';
import { mountUi } from '../src/ui/mount';
import { press, STAGE_HTML } from './fixtures/net';

const d3 = loadGameData('stage3');
const NONE = { coins: 0, buckwheat: 0, tokens: 0 };

function lane(round: number): GameState {
  const s = createGame(d3, 1);
  if (round > 0) forceRound(s, round);
  return s;
}
const econOf = (s: GameState, extra: Partial<EconMine> = {}): EconMine => ({ ...econView(s)!, team: null, ...extra });
const put = (s: GameState, id: string, rec: Partial<QuestRecord>) => {
  (s.econ!.questResults as Record<string, QuestRecord>)[id] = { outcome: 'active', reward: NONE, progress: {}, ...rec };
};
const row = (rows: ReturnType<typeof questRows>, id: string) => rows.find(r => r.id === id)!;

describe('questRows', () => {
  test('prep lists every quest as upcoming; solo marks the cooperative ones', () => {
    const s = lane(0);
    const rows = questRows(econOf(s), s, false);
    expect(rows.map(r => [r.id, r.group])).toEqual([
      ['mission', '곧 열림'], ['collection', '곧 열림'], ['team', '곧 열림'], ['ssireum', '곧 열림'], ['shadow', '곧 열림'],
    ]);
    expect(row(rows, 'team').outcome).toBe('협동 전용');
    expect(row(rows, 'ssireum').outcome).toBe('협동 전용');
    expect(row(questRows(econOf(s), s, true), 'team').outcome).toBe('');
  });

  test('at 24: 살림 한 벌 runs, 쇠밥 한 끼 keeps its result, 32R 씨름 is next online', () => {
    const s = lane(24);
    put(s, 'mission', { outcome: 'won', reward: { coins: 30, buckwheat: 1, tokens: 0 }, progress: { kills: 20, beastDown: true } });
    s.econ!.collection.done = ['gamasot', 'hwaro'];
    const rows = questRows(econOf(s), s, true);
    expect(row(rows, 'collection')).toMatchObject({ group: '진행 중', short: '2/3' });
    expect(row(rows, 'collection').progress).toContain('가마솥 ✓');
    expect(row(rows, 'collection').progress).toContain('멍석 □');
    expect(row(rows, 'mission')).toMatchObject({ group: '끝남', outcome: '성공', reward: '+30냥 · 묵 1' });
    expect(row(rows, 'ssireum').group).toBe('곧 열림');
    const box = questBoxModel(econOf(s), s, true);
    expect(box.active.map(a => a.title)).toEqual(['살림 한 벌', '서낭당 정성']);
    expect(box.next).toBe('다음 32라운드 씨름');
    expect(questBoxModel(econOf(s), s, false).next).toBe('다음 43라운드 그늘손');
  });

  test('settled outcomes are told apart with the rewards actually paid', () => {
    const s = lane(50);
    put(s, 'mission', { outcome: 'missedEntry' });
    put(s, 'collection', { outcome: 'timedOut', progress: { done: ['gamasot'] } });
    put(s, 'team', { outcome: 'capped', progress: { remaining: 40, survivors: 6, streak: 3 } });
    put(s, 'ssireum', { outcome: 'otherSeat', progress: { winnerSeat: 2 } });
    put(s, 'shadow', { outcome: 'tamed', progress: { tamedDefId: 'eoduksini' } });
    const rows = questRows(econOf(s), s, true);
    expect(rows.every(r => r.group === '끝남')).toBe(true);
    expect(rows.map(r => r.outcome)).toEqual(['미입장', '시간 종료', '지급 한도', '2번 고개 당첨', '그늘손 획득']);
    expect(row(rows, 'shadow').reward).toBe('처치 보상 0냥');
    expect(row(rows, 'team').reward).toBe('보상 없음');
    put(s, 'ssireum', { outcome: 'fled', progress: { winnerSeat: 1 } });
    expect(row(questRows(econOf(s), s, true), 'ssireum').outcome).toBe('도주');
  });

  test('round 12 after the entry window says 미입장 before the round closes', () => {
    const s = lane(12);
    s.tick = s.roundStartTick + 99;
    expect(row(questRows(econOf(s), s, false), 'mission').group).toBe('진행 중');
    s.tick = s.roundStartTick + 100;
    expect(row(questRows(econOf(s), s, false), 'mission')).toMatchObject({ group: '끝남', outcome: '미입장' });
  });
});

describe('J list and the left quest box', () => {
  class FakeScene {
    selectedId: number | null = null;
    onFrame?: () => void;
    onSelect(): void {}
    onEvents(): void {}
  }
  let driver: GameDriver;
  let scene: FakeScene;
  beforeEach(() => {
    document.body.innerHTML = STAGE_HTML;
    driver = new GameDriver(lane(24));
    scene = new FakeScene();
    mountUi(driver, scene as never);
  });
  afterEach(() => { vi.restoreAllMocks(); });
  const keydown = (target: EventTarget, init: KeyboardEventInit) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  const modal = () => document.getElementById('modal')!;

  test('the box sits between Q and D, opens the list, and J/Esc close it keeping the selection', () => {
    const left = document.getElementById('left')!;
    const order = Array.from(left.children).map(c => c.className.split(' ')[0]);
    expect(order.indexOf('quest-box')).toBeGreaterThan(order.indexOf('helper'));
    expect(order.indexOf('quest-box')).toBeLessThan(order.indexOf('dex-open'));
    expect(left.querySelector('.quest-box')!.textContent).toContain('살림 한 벌');
    expect(left.querySelector('.quest-box')!.textContent).toContain('다음 43라운드 그늘손');
    const unit = placeUnitForTest(driver.state, 'jipsin', 3);
    scene.selectedId = unit.id;
    keydown(window, { code: 'KeyJ' });
    const win = modal().querySelector('.quest-modal')!;
    expect(win).not.toBeNull();
    // the title and close stay outside the scrolled body
    expect(win.querySelector('.quest-scroll .modal-head')).toBeNull();
    expect(win.querySelector('.modal-head [data-action="closeModal"]')).not.toBeNull();
    expect(win.querySelector('.quest-scroll')!.textContent).toContain('진행 중');
    keydown(window, { code: 'KeyJ' });
    expect(modal().textContent).toBe('');
    expect(scene.selectedId).toBe(unit.id);
    press(left.querySelector('.quest-box [data-action="openQuests"]'));
    expect(modal().querySelector('.quest-modal')).not.toBeNull();
    keydown(window, { code: 'Escape' });
    expect(modal().textContent).toBe('');
  });

  test('with Q open the box folds to one J line; the list closes back to Q', () => {
    keydown(window, { code: 'KeyQ' });
    const left = document.getElementById('left')!;
    const box = left.querySelector('.quest-box')!;
    expect(box.textContent!.trim()).toMatch(/^J 퀘스트 · 진행 \d+개$/);
    press(box.querySelector('[data-action="openQuests"]'));
    expect(modal().querySelector('.quest-modal')).not.toBeNull();
    press(modal().querySelector('[data-action="closeModal"]'));
    expect(left.querySelector('.helper li')).not.toBeNull();
  });

  test('a chip under the lane opens the list on its row', () => {
    const chip = document.querySelector<HTMLElement>('#econ-bottom [data-action="openQuests"][data-arg="collection"]')!;
    expect(chip).not.toBeNull();
    press(chip);
    expect(modal().querySelector('.quest-row.focus')!.getAttribute('data-quest')).toBe('collection');
  });

  test('J opens in prep and is not taken from a text box', () => {
    driver.reset(lane(0));
    driver.update(0);
    const input = document.createElement('input');
    document.body.append(input);
    keydown(input, { code: 'KeyJ', key: 'j' });
    expect(modal().textContent).toBe('');
    keydown(window, { code: 'KeyJ' });
    expect(modal().querySelector('.quest-scroll')!.textContent).toContain('곧 열림');
  });
});

// a server view is only needed for the cooperative rows
void (null as unknown as ClientView);
