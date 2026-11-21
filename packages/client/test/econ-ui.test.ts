// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, econView, loadGameData, step, type ClientView, type EconMine, type GameState } from '@dorandi/logic';
import { forceRound, placeUnitForTest, spawnEnemyForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import {
  econPanelHtml, marketModel, noteText, questChips, tameModel, tameRejectText,
} from '../src/ui/econ';
import { rejectText, unitSkillText } from '../src/ui/models';
import { mountUi } from '../src/ui/mount';
import { press, STAGE_HTML } from './fixtures/net';

const d3 = loadGameData('stage3');
const eco = d3.economy!;
const market = eco.market!;

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
  const panel = (s: GameState, receipt: Parameters<typeof marketModel>[2] = null, extra: Partial<EconMine> = {}) => {
    const div = document.createElement('div');
    div.innerHTML = econPanelHtml(marketModel(econOf(s, extra), s, receipt));
    return div;
  };

  test('B shows daily terms and the confirmed draw', () => {
    const s = lane(10, 0);
    s.buckwheat = 0;
    let p = panel(s, null, { jige: 2 });
    for (const text of ['10라운드까지', '헌 살림 보따리 · 메밀묵 1', '3등급 2/3 · 2등급 1/3', '3회 남음', '3%', '보유 지게 2개', '메밀묵 1개 부족']) {
      expect(p.textContent, text).toContain(text);
    }
    expect(p.querySelector<HTMLButtonElement>('[data-action="buy"]')!.disabled).toBe(true);
    s.buckwheat = 1;
    p = panel(s);
    expect(p.querySelector<HTMLButtonElement>('[data-action="buy"]')!.disabled).toBe(false);
    expect(p.textContent).toContain('보유 지게 0개');
    fill(s);
    p = panel(s);
    expect(p.textContent).toContain('진영 한 칸 비우기');
    expect(p.textContent).toContain('1·2등급은 G로 보관');
    expect(p.querySelector<HTMLButtonElement>('[data-action="buy"]')!.disabled).toBe(true);
  });

  test('the receipt names the confirmed unit, its grade, damage type and one skill line, and the bonus', () => {
    const s = lane(3, 0);
    const def = d3.units.find(u => !u.hidden && u.grade === 3 && u.skills.length > 0)!;
    const receipt = { type: 'buy' as const, item: 'draw' as const, defId: def.id, spentBuckwheat: 1, jige: true };
    const text = panel(s, receipt).textContent!;
    expect(text).toContain(`${def.name} · 3등급 · ${def.damageType === 'physical' ? '물딜' : '마딜'}`);
    expect(text).toContain(unitSkillText(d3, def).split(' / ')[0]!);
    expect(text).toContain('지게도 얻었습니다');
    expect(panel(s, { ...receipt, jige: false }).textContent).not.toContain('지게도 얻었습니다');
  });

  test('cost and odds come from the data', () => {
    const data = structuredClone(d3);
    data.economy!.market!.draw = { ...data.economy!.market!.draw, buckwheatCost: 2, weights: [1, 3] };
    data.economy!.market!.jigeChance = 0.05;
    const s = createGame(data, 1);
    forceRound(s, 2);
    const text = panel(s).textContent!;
    expect(text).toContain('헌 살림 보따리 · 메밀묵 2');
    expect(text).toContain('3등급 1/4 · 2등급 3/4');
    expect(text).toContain('5%');
  });

  test('prep says when the market opens', () => {
    const s = lane(0, 0);
    expect(panel(s).textContent).toContain('1라운드부터');
  });
});

describe('quest tracker text', () => {
  test('mission entry window, then kills and the beast; collection marks', () => {
    const m = eco.mission!;
    const s = lane(m.round, m.fee);
    s.roundStartTick = s.tick;
    let chips = questChips(econOf(s), s, null);
    expect(chips[0]).toMatchObject({ title: '쇠밥 한 끼', text: `입장 ${m.fee}냥 · ${m.entrySeconds}초 안에`, action: { name: 'missionEnter', label: '입장' } });
    step(s, [{ type: 'missionEnter' }]);
    s.econ!.roundKills = 14;
    chips = questChips(econOf(s), s, null);
    expect(chips[0]!.text).toMatch(new RegExp(`^잡귀 14/${m.kills} · 짐승 남음 · 체력 \\d+%$`));
    const c = eco.collection!;
    const t = lane(c.fromRound);
    t.econ!.collection.done = [c.items[0]!];
    const names = c.items.map(id => d3.units.find(u => u.id === id)!.name);
    expect(questChips(econOf(t), t, null)).toEqual([{ title: '살림 한 벌', text: `${names[0]} ✓ ${names[1]} □ ${names[2]} □` }]);
  });

  test('event enemies show time left; the team night count reads the six rows', () => {
    const sh = eco.shadow!;
    const s = lane(sh.round);
    // forceRound already brought this round's shadow; start from a clean lane
    s.enemies = []; s.econ!.events = [];
    const e = spawnEnemyForTest(s, sh.enemy, 3);
    e.maxHp = 4000; e.hp = 1000;
    s.econ!.events.push({ id: e.id, kind: 'shadow', spawnTick: s.tick - 80, grown: false });
    expect(questChips(econOf(s), s, null)).toContainEqual({ title: '그늘손', text: `${sh.growSeconds - 4}초 뒤 커짐 · 체력 25%`, tone: 'hot' });
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
    expect(chips).toContainEqual({ title: '서낭당 정성', text: `살아 있는 고개 잡귀 14/${2 * team.perSurvivor} · 2/${team.nights}밤` });
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
    for (const r of ['marketClosed', 'soldOut', 'missionClosed', 'noTarget', 'tameHp', 'tameCondition', 'cooldown', 'noJige']) {
      expect(rejectText(r), r).toBeTruthy();
    }
  });

});

describe('notes and particles', () => {
  test('purchase, reward and taming lines', () => {
    expect(noteText({ type: 'buy', item: 'draw', defId: 'moru', spentBuckwheat: 1, jige: true }, d3)).toMatch(/^보따리에서 모루 \(\d등급\) · 지게 도깨비가 왔습니다!$/);
    expect(noteText({ type: 'questReward', quest: 'mission', coins: 30, buckwheat: 1, tokens: 0 }, d3)).toBe('쇠밥 한 끼 성공 · +30냥 · 묵 +1');
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
    expect(document.getElementById('bottom')!.textContent).toBe('유닛을 눌러 선택하고 끌어서 옮기세요. · Tab/W 다음 유닛 · Space 소환 · E 강화 · D 도감 · G 1·2등급 보관 · Esc 선택 해제');
  });

  test('B opens and closes the market; the help line names it', () => {
    mountSolo();
    expect(document.getElementById('bottom')!.textContent).toContain('B 장터');
    keydown(window, { code: 'KeyB' });
    expect(panel()).toContain('헌 살림 보따리');
    keydown(window, { code: 'KeyB' });
    expect(panel()).toBe('');
  });


  test('the draw button queues one draw and B shows the confirmed unit', () => {
    const driver = mountSolo();
    forceRound(driver.state, 1);
    driver.state.buckwheat = 1;
    driver.update(0);
    keydown(window, { code: 'KeyB' });
    press(document.querySelector('#econ-panel [data-action="buy"]'));
    driver.update(50);
    const bought = driver.state.slots.find(Boolean)!;
    expect(panel()).toContain(d3.units.find(u => u.id === bought.defId)!.name);
    expect(panel()).toContain('2회 남음');
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
    press(box.querySelector('[data-action="tame"]'));
    expect(queued).toEqual([{ type: 'tame', enemyId: boss.id }]);
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
