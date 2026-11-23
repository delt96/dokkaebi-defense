// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, econView, loadGameData, step, type ClientView, type EconMine, type GameState } from '@dorandi/logic';
import { forceRound, placeUnitForTest, spawnEnemyForTest, withoutMarketLock } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import {
  econPanelHtml, marketModel, noteText, questChips, tameModel, tameRejectText,
} from '../src/ui/econ';
import { rejectText } from '../src/ui/models';
import { mountUi } from '../src/ui/mount';
import { press, STAGE_HTML } from './fixtures/net';

const d3 = withoutMarketLock(loadGameData('stage3'));
const eco = d3.economy!;

function lane(round: number, coins = 1000): GameState {
  const s = createGame(d3, 1);
  if (round > 0) forceRound(s, round);
  s.coins = coins;
  return s;
}
const econOf = (s: GameState, extra: Partial<EconMine> = {}): EconMine => ({ ...econView(s)!, team: null, ...extra });
const fill = (s: GameState) => { for (let i = 0; i < s.slots.length; i++) if (s.open[i] && !s.slots[i]) placeUnitForTest(s, 'jipsin', i); };

/** Just the parts of a server view the economy models read: who I am and the six rows. */
function view(me: number, rows: { seat: number; name: string; alive?: boolean; connected?: boolean; count?: number }[]): ClientView {
  return {
    me: { seat: me, key: 'k' },
    rows: rows.map(r => ({ seat: r.seat, name: r.name, status: r.alive === false ? 'spirit' : 'alive', connected: r.connected ?? true, count: r.count ?? 0 })),
  } as unknown as ClientView;
}

describe('B market', () => {
  const panel = (s: GameState, extra: Partial<EconMine> = {}) => {
    const div = document.createElement('div');
    div.innerHTML = econPanelHtml(marketModel(econOf(s, extra), s));
    return div;
  };

  test('B shows the unified draw and 지게 without the daily section', () => {
    const s = lane(30, 0);
    s.buckwheat = 1;
    const p = panel(s, { jige: 2 });
    for (const text of ['보따리 · 묵 1', '큰 보따리 · 묵 2', '보따리 남은 횟수 2/2', '3%', '보유 지게 2개', '메밀묵 1개 부족']) {
      expect(p.textContent, text).toContain(text);
    }
    expect(p.textContent).not.toMatch(/헌 살림|라운드까지/);
    expect(Array.from(p.querySelectorAll('[data-action="gambleUnit"]'), b => b.getAttribute('data-arg'))).toEqual(['small', 'big', 'coin']);
    expect(p.querySelector<HTMLButtonElement>('[data-action="gambleUnit"][data-arg="small"]')!.disabled).toBe(false);
    fill(s);
    expect(panel(s).textContent).toContain('진영 한 칸 비우기');
  });

  test('prep says when the market opens', () => {
    const s = lane(0, 0);
    expect(panel(s).textContent).toContain('1라운드부터');
  });
});

describe('quest tracker text', () => {
  test('collection marks', () => {
    const c = eco.collection!;
    const t = lane(c.fromRound);
    t.econ!.collection.done = [c.items[0]!];
    const names = c.items.map(id => d3.units.find(u => u.id === id)!.name);
    expect(questChips(econOf(t), t, null)).toEqual([{ title: '살림 한 벌', quest: 'collection', text: `${names[0]} ✓ ${names[1]} □ ${names[2]} □` }]);
  });

  test('event enemies show time left; the team night count reads the six rows', () => {
    const sh = eco.shadow!;
    const s = lane(sh.round);
    // forceRound already brought this round's shadow; start from a clean lane
    s.enemies = []; s.econ!.events = [];
    const e = spawnEnemyForTest(s, sh.enemy, 3);
    e.maxHp = 4000; e.hp = 1000;
    s.econ!.events.push({ id: e.id, kind: 'shadow', spawnTick: s.tick - 80, grown: false });
    expect(questChips(econOf(s), s, null)).toContainEqual({ title: '그늘손', quest: 'shadow', text: `${sh.growSeconds - 4}초 뒤 커짐 · 체력 25%`, tone: 'hot' });
    s.econ!.events[0]!.grown = true;
    expect(questChips(econOf(s), s, null)[0]!.text).toBe('커졌음 · 라운드 끝에 도주 · 체력 25%');
    const ss = eco.ssireum!;
    const r = lane(ss.round);
    r.enemies = []; r.econ!.events = [];
    const foe = spawnEnemyForTest(r, ss.enemy, 3);
    r.econ!.events.push({ id: foe.id, kind: 'ssireum', spawnTick: r.tick - 240, grown: false });
    expect(questChips(econOf(r), r, null)[0]).toMatchObject({ title: '도깨비 씨름', text: `샅바가 풀리기까지 ${ss.seconds - 12}초 · 체력 100%` });
    const team = eco.team!;
    const q = lane(team.fromRound);
    const v = view(1, [{ seat: 1, name: '가', count: 10 }, { seat: 2, name: '나', count: 4 }, { seat: 3, name: '다', alive: false }]);
    const chips = questChips(econOf(q, { team: { streak: 2, paid: false } }), q, v);
    // two seats alive here: the line names the living lanes, never a fixed count
    expect(chips).toContainEqual({ title: '서낭당 정성', quest: 'team', text: `살아 있는 고개 잡귀 14/${2 * team.perSurvivor} · 2/${team.nights}밤` });
  });
});

describe('tame button', () => {
  test('shows from spawn with the price and odds; the missing condition, deficits, slot and wait are named', () => {
    const s = lane(20);
    s.buckwheat = 2; s.coins = 75;
    const boss = spawnEnemyForTest(s, 'gangcheori', 3, 20000);
    boss.maxHp = 100000;
    boss.hp = 100000;
    let m = tameModel(econOf(s), s)!;
    expect(m).toMatchObject({ enemyId: boss.id, ready: false, label: '둔화 필요', hp: '체력 100%' });
    boss.slow = { pct: 0.3, ticks: 20 };
    m = tameModel(econOf(s), s)!;
    expect(m).toMatchObject({ ready: true, label: 'T 우리 편으로 · 묵 2 · 75냥 · 성공 10%' });
    boss.hp = 50000;
    expect(tameModel(econOf(s), s)!.label).toBe('T 우리 편으로 · 묵 2 · 75냥 · 성공 35%');
    boss.hp = 50001;
    expect(tameModel(econOf(s), s)!.label).toBe('T 우리 편으로 · 묵 2 · 75냥 · 성공 25%');
    s.buckwheat = 1; s.coins = 67;
    expect(tameModel(econOf(s), s)).toMatchObject({ ready: false, label: '묵 1개 부족 · 8냥 부족' });
    s.buckwheat = 2; s.coins = 75;
    fill(s);
    expect(tameModel(econOf(s), s)).toMatchObject({ ready: false, label: '진영 한 칸 비우기' });
    s.slots[0] = null;
    s.econ!.tameReady = [{ enemyId: boss.id, tick: s.tick + 60 }];
    expect(tameModel(econOf(s), s)).toMatchObject({ ready: false, label: '다시 시도 3초' });
    expect(tameRejectText(econOf(s), boss.id, 'tameCondition', d3)).toBe('둔화가 풀렸습니다');
  });

  test('R10 지네각시 asks only for coins', () => {
    const s = lane(10);
    s.buckwheat = 0; s.coins = 30;
    spawnEnemyForTest(s, 'jinegaksi', 3, 5000);
    expect(tameModel(econOf(s), s)!.label).toBe('T 우리 편으로 · 30냥 · 성공 10%');
  });
});

describe('refusals', () => {
  test('every economy refusal has a line', () => {
    for (const r of ['marketClosed', 'marketLocked', 'gambleLimit', 'gambleRound', 'huntClosed', 'huntOut', 'noTarget', 'tameHp', 'tameCondition', 'cooldown', 'noJige']) {
      expect(rejectText(r), r).toBeTruthy();
    }
  });

});

describe('notes and particles', () => {
  test('reward and taming lines', () => {
    expect(noteText({ type: 'questReward', quest: 'collection', coins: 20, buckwheat: 0, tokens: 0 }, d3)).toBe('살림 한 벌 완성 · +20냥');
    expect(noteText({ type: 'tame', enemyId: 1, defId: 'gangcheori', unitId: 2, slot: 0 }, d3)).toBe('길들이기 성공 · 강철이가 우리 편이 됐습니다');
  });
});

describe('market hotkey', () => {
  class FakeScene {
    selectedId: number | null = null;
    onFrame?: () => void;
    onSelect(): void {}
    onEvents(): void {}
  }
  beforeEach(() => { document.body.innerHTML = STAGE_HTML; });
  afterEach(() => { vi.restoreAllMocks(); });

  function mountSolo(data = d3) {
    const driver = new GameDriver(createGame(data, 1));
    mountUi(driver, new FakeScene() as never);
    return driver;
  }
  const panel = () => document.getElementById('econ-panel')?.innerHTML ?? '';
  const keydown = (target: EventTarget, init: KeyboardEventInit) => target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

  // first: mountUi's key listener stays on window for the rest of the file
  test('20-round data: no market key, no market button, the help line without the market', () => {
    mountSolo(loadGameData('stage2'));
    keydown(window, { code: 'KeyB' });
    expect(panel()).toBe('');
    expect(document.querySelector('[data-action="toggleMarket"]')).toBeNull();
    expect(document.getElementById('bottom')!.textContent).toBe('유닛을 눌러 선택하고 끌어서 옮기세요. · W 다음 유닛 · Space 소환 · E 강화 · D 도감 · Q 도우미 · G 1·2등급 보관 · P 멈춤');
  });

  test('B opens and closes the market; the help line names it', () => {
    mountSolo();
    expect(document.getElementById('bottom')!.textContent).toContain('B 장터');
    keydown(window, { code: 'KeyB' });
    expect(panel()).toContain('보따리 · 묵 1');
    keydown(window, { code: 'KeyB' });
    expect(panel()).toBe('');
  });


  test('the draw button spends 묵 and decrements the displayed quota', () => {
    const driver = mountSolo();
    forceRound(driver.state, 1);
    driver.state.buckwheat = 1;
    driver.update(0);
    keydown(window, { code: 'KeyB' });
    press(document.querySelector('#econ-panel [data-action="gambleUnit"][data-arg="small"]'));
    driver.update(50);
    expect(panel()).toContain('보따리 남은 횟수 1/2');
    expect(driver.state.buckwheat).toBe(0);
    expect(panel()).toContain('메밀묵 1개 부족');
  });

  test('B does nothing while typing in a text box or during IME composition', () => {
    mountSolo();
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    keydown(input, { code: 'KeyB' });
    expect(panel()).toBe('');
    keydown(window, { code: 'KeyB', isComposing: true });
    expect(panel()).toBe('');
    const area = document.createElement('textarea');
    document.body.append(area);
    keydown(area, { code: 'KeyB' });
    expect(panel()).toBe('');
  });

});

describe('T under the health bar', () => {
  beforeEach(() => { document.body.innerHTML = STAGE_HTML; });
  afterEach(() => { vi.restoreAllMocks(); });

  test('the button follows the bar, and click and T address the displayed target', () => {
    const s = lane(10, 30);
    s.buckwheat = 0;
    const driver = new GameDriver(s);
    const at = { x: 300, y: 120 };
    const scene = {
      selectedId: null as number | null, onFrame: undefined as (() => void) | undefined,
      onSelect() {}, onEvents() {}, enemyBarAnchor: (id: number) => (id === boss.id ? { ...at } : null),
    };
    const boss = spawnEnemyForTest(s, 'jinegaksi', 3, 5000);
    mountUi(driver, scene as never);
    const box = document.getElementById('tame-anchor')!;
    expect(box.textContent).toContain('T 우리 편으로 · 30냥 · 성공 10%');
    expect(box.textContent).toContain('체력 100%');
    expect([box.style.left, box.style.top]).toEqual(['300px', '120px']);
    at.x = 260; at.y = 140;
    scene.onFrame!();
    expect([box.style.left, box.style.top]).toEqual(['260px', '140px']);
    at.x = 200;
    scene.onFrame!();
    expect(box.style.left).toBe('200px');
    const queued: unknown[] = [];
    const queue = driver.queue.bind(driver);
    vi.spyOn(driver, 'queue').mockImplementation(cmd => { queued.push(cmd); queue(cmd); });
    // a tame spends coins on a chance: the first press only asks for a second one
    press(box.querySelector('[data-action="tame"]'));
    expect(queued).toEqual([]);
    expect(box.textContent).toContain('T 한 번 더 · 30냥 · 성공 10%');
    press(box.querySelector('[data-action="tame"]'));
    expect(queued).toEqual([{ type: 'tame', enemyId: boss.id }]);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', bubbles: true }));
    expect(queued).toHaveLength(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', bubbles: true }));
    expect(queued).toEqual([{ type: 'tame', enemyId: boss.id }, { type: 'tame', enemyId: boss.id }]);
    // the target gone: the button goes too
    s.enemies = [];
    scene.onFrame!();
    driver.update(0);
    vi.spyOn(performance, 'now').mockReturnValue(1e9);
    scene.onFrame!();
    expect(box.innerHTML).toBe('');
  });
});
