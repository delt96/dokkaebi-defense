// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, econView, loadGameData, step, type ClientView, type EconMine, type GameState, type QuestRecord } from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { huntRows, noteText, questBoxHtml, questBoxModel, questChips, questListHtml, questRows } from '../src/ui/econ';
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
      ['collection', '곧 열림'], ['team', '곧 열림'], ['ssireum', '곧 열림'], ['shadow', '곧 열림'],
    ]);
    expect(row(rows, 'team').outcome).toBe('협동 전용');
    expect(row(rows, 'ssireum').outcome).toBe('협동 전용');
    expect(row(questRows(econOf(s), s, true), 'team').outcome).toBe('');
  });

  test('at 24: 살림 한 벌 runs, 32R 씨름 is next online', () => {
    const s = lane(24);
    s.econ!.collection.done = ['gamasot', 'hwaro'];
    const rows = questRows(econOf(s), s, true);
    expect(row(rows, 'collection')).toMatchObject({ group: '진행 중', short: '2/3' });
    expect(row(rows, 'collection').progress).toContain('가마솥 ✓');
    expect(row(rows, 'collection').progress).toContain('멍석 □');
    expect(row(rows, 'ssireum').group).toBe('곧 열림');
    const box = questBoxModel(econOf(s), s, true);
    expect(box.active.map(a => a.title)).toEqual(['살림 한 벌', '서낭당 정성']);
    expect(box.next).toBe('다음 30라운드 야광귀 격파');
    expect(box.hunts.map(h => h.name)).toEqual(['쇠밥짐승', '외눈박이']);
    s.econ!.hunts = { ev_yagwang: { level: 1, enemyId: null, deadlineTick: 0, readyTick: 0, last: null } };
    forceRound(s, 31);
    expect(questBoxModel(econOf(s), s, true).next).toBe('다음 32라운드 씨름');
    expect(questBoxModel(econOf(s), s, false).next).toBe('다음 43라운드 그늘손');
  });

  test('settled outcomes are told apart with the rewards actually paid', () => {
    const s = lane(50);
    put(s, 'collection', { outcome: 'timedOut', progress: { done: ['gamasot'] } });
    put(s, 'team', { outcome: 'capped', progress: { remaining: 40, survivors: 6, streak: 3 } });
    put(s, 'ssireum', { outcome: 'otherSeat', progress: { winnerSeat: 2 } });
    put(s, 'shadow', { outcome: 'tamed', progress: { tamedDefId: 'eoduksini' } });
    const rows = questRows(econOf(s), s, true);
    expect(rows.every(r => r.group === '끝남')).toBe(true);
    expect(rows.map(r => r.outcome)).toEqual(['시간 종료', '지급 한도', '2번 고개 당첨', '그늘손 획득']);
    expect(row(rows, 'shadow').reward).toBe('처치 보상 0냥');
    expect(row(rows, 'team').reward).toBe('보상 없음');
    put(s, 'ssireum', { outcome: 'fled', progress: { winnerSeat: 1 } });
    expect(row(questRows(econOf(s), s, true), 'ssireum').outcome).toBe('도주');
  });

});

describe('격파 rows', () => {
  const hunts = d3.economy!.hunts!;
  const [first, second, third] = hunts.targets;
  const fresh = (round: number, coins = 500) => {
    const s = lane(round);
    s.spawned = d3.balance.spawnCount;
    s.coins = coins;
    return s;
  };

  test('each target shows name, level, pay and a summon button; closed ones say their round', () => {
    const s = fresh(first!.fromRound);
    const rows = huntRows(econOf(s), s);
    expect(rows.map(r => [r.name, r.level, r.reward, r.ready, r.short])).toEqual([
      ['쇠밥짐승', 1, `묵 1 · ${first!.reward.coins}냥`, true, '소환'],
      ['외눈박이', 1, `묵 1 · ${second!.reward.coins}냥`, false, `${second!.fromRound}R`],
      ['야광귀', 1, `묵 2 · ${third!.reward.coins}냥`, false, `${third!.fromRound}R`],
    ]);
    expect(rows[1]!.label).toBe(`${second!.fromRound}라운드부터`);
    expect(rows[0]!.hp).toBe(`체력 ${first!.hp.toLocaleString('ko-KR')}`);
  });

  test('button states: out with seconds left, cooldown seconds, coins short', () => {
    const s = fresh(first!.fromRound);
    step(s, [{ type: 'hunt', enemy: first!.enemy }]);
    let r = huntRows(econOf(s), s)[0]!;
    expect([r.ready, r.out, r.short, r.label]).toEqual([false, true, `${hunts.seconds}초`, `이미 나와 있음 · ${hunts.seconds}초 남음`]);
    s.enemies.find(e => e.defId === first!.enemy)!.hp = 0;
    step(s, []);
    r = huntRows(econOf(s), s)[0]!;
    expect([r.level, r.best, r.short, r.label]).toEqual([2, 1, `${hunts.cooldownSeconds}초`, `${hunts.cooldownSeconds}초 뒤 다시 소환`]);
    s.tick = s.econ!.hunts![first!.enemy]!.readyTick;
    s.coins = first!.fee - 3;
    r = huntRows(econOf(s), s)[0]!;
    expect([r.ready, r.poor, r.short, r.label]).toEqual([false, true, `${first!.fee}냥`, '엽전 3냥 부족']);
  });

  test('the box draws open targets with their buttons; the J list adds the best level', () => {
    const s = fresh(second!.fromRound);
    s.econ!.hunts = { [first!.enemy]: { level: 4, enemyId: null, deadlineTick: 0, readyTick: 0, last: 'won' } };
    const box = questBoxModel(econOf(s), s, false);
    const host = document.createElement('div');
    host.innerHTML = questBoxHtml(box, false);
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('[data-action="hunt"]'));
    expect(buttons.map(b => [b.dataset.arg, b.disabled])).toEqual([[first!.enemy, false], [second!.enemy, false]]);
    expect(host.querySelector('.hunt-line')!.textContent).toBe('쇠밥짐승4묵1소환');
    expect(host.querySelector('.hunt-lv')!.getAttribute('title')).toBe('4단계');
    host.innerHTML = questBoxHtml(box, true);
    expect(host.querySelectorAll('[data-action="hunt"]').length).toBe(2);
    host.innerHTML = questListHtml(questRows(econOf(s), s, false), 'hunts', huntRows(econOf(s), s));
    expect(host.querySelector('.quest-row.focus')!.getAttribute('data-quest')).toBe('hunts');
    expect(host.textContent).toContain('최고 3단계 격파');
    expect(host.textContent).toContain('아직 격파 없음');
    expect(host.textContent).toContain(`${hunts.seconds}초 안에 잡으면`);
    expect(Array.from(host.querySelectorAll<HTMLButtonElement>('[data-action="hunt"]')).map(b => b.disabled)).toEqual([false, false, true]);
  });

  test('a lane chip counts down while the target is out; notes for a kill and a getaway', () => {
    const s = fresh(first!.fromRound);
    step(s, [{ type: 'hunt', enemy: first!.enemy }]);
    s.tick += 200;
    expect(questChips(econOf(s), s, null)).toContainEqual({ title: '쇠밥짐승 1단계', quest: 'hunts', text: `${hunts.seconds - 10}초 남음 · 체력 100%`, tone: 'hot' });
    expect(noteText({ type: 'hunt', enemy: first!.enemy, level: 2, outcome: 'won', coins: 20, buckwheat: 1 }, d3)).toBe('쇠밥짐승 2단계 격파 · 묵 +1 · +20냥');
    expect(noteText({ type: 'hunt', enemy: third!.enemy, level: 1, outcome: 'fled', coins: 0, buckwheat: 0 }, d3)).toBe('야광귀 1단계가 달아났습니다');
  });
});

describe('J list and the quest box', () => {
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

  test('the box sits at the bottom right above D, opens the list, and J/Esc close it keeping the selection', () => {
    const left = document.getElementById('right')!;
    expect(document.querySelector('#left .quest-box, #left .dex-open')).toBeNull();
    const foot = left.querySelector('.right-foot')!;
    const order = Array.from(foot.children).map(c => c.className.split(' ')[0]);
    expect(order.indexOf('quest-box')).toBe(0);
    expect(order.indexOf('dex-open')).toBe(1);
    expect(left.querySelector('.quest-box')!.textContent).toContain('살림 한 벌');
    expect(left.querySelector('.quest-box')!.textContent).toContain('다음 30라운드 야광귀 격파');
    expect(left.querySelector('.quest-box [data-action="hunt"][data-arg="ev_soebap"]')).not.toBeNull();
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

  test('a summon button in the box queues the 격파 command for that target', () => {
    const queued: unknown[] = [];
    const queue = driver.queue.bind(driver);
    vi.spyOn(driver, 'queue').mockImplementation(cmd => { queued.push(cmd); queue(cmd); });
    driver.state.coins = 500;
    vi.spyOn(performance, 'now').mockReturnValue(1e9);
    scene.onFrame!();
    const btn = document.querySelector<HTMLButtonElement>('#right .quest-box [data-action="hunt"][data-arg="ev_oenun"]')!;
    expect(btn.disabled).toBe(false);
    press(btn);
    expect(queued).toEqual([{ type: 'hunt', enemy: 'ev_oenun' }]);
  });

  test('opening Q leaves the box and D where they are', () => {
    keydown(window, { code: 'KeyQ' });
    expect(document.querySelector('#left .helper li')).not.toBeNull();
    const box = document.querySelector('#right .right-foot .quest-box')!;
    expect(box.textContent).toContain('살림 한 벌');
    press(document.querySelector('#right .dex-open'));
    expect(modal().textContent).toContain('도감');
  });

  test('the 도우미 switch sits beside the speed button and shows or hides the left list', () => {
    const sw = () => document.querySelector<HTMLElement>('#right .foot-row [data-action="toggleHelper"]')!;
    expect(sw().textContent).toBe('도우미 끔');
    expect(sw().nextElementSibling?.getAttribute('data-action')).toBe('speed');
    expect(document.querySelector('#left [data-action="toggleHelper"]')).toBeNull();
    expect(document.querySelector('#left .helper li')).toBeNull();
    press(sw());
    expect(sw().textContent).toBe('도우미 켬');
    expect(sw().getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('#left .helper li')).not.toBeNull();
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

