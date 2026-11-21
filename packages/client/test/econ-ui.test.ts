// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, econView, loadGameData, step, type ClientView, type EconMine, type GameState } from '@dorandi/logic';
import { forceRound, placeUnitForTest, spawnEnemyForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import {
  econPanelHtml, marketModel, noteText, questChips, tameModel, tameRejectText,
} from '../src/ui/econ';
import { rejectText } from '../src/ui/models';
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

test('market shows one fixed-price draw and the blocked reason', () => {
  const s = lane(1, 0);
  const shops = () => marketModel(econOf(s), s)!.shops;
  expect(shops()).toHaveLength(1);
  expect(shops()[0]).toMatchObject({ item: 'draw', name: '헌 살림 보따리', price: 1,
    left: '3회 남음', lines: ['3등급 2/3 · 2등급 1/3'], blocked: null });
  fill(s);
  expect(shops()[0]?.blocked).toBe('진영 한 칸 비우기');
  s.buckwheat = 0;
  expect(shops()[0]?.blocked).toBe('메밀묵 1개 부족');
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

describe('tame prompt', () => {
  test('appears at the tame HP with every condition ticked; a lost slow is named', () => {
    const s = lane(20);
    s.buckwheat = 1;
    const boss = spawnEnemyForTest(s, 'gangcheori', 3, 20000);
    boss.maxHp = 100000;
    expect(tameModel(econOf(s), s)).toBeNull();
    boss.hp = Math.floor(boss.maxHp * eco.tame!.hpPct);
    let m = tameModel(econOf(s), s)!;
    expect(m).toMatchObject({ enemyId: boss.id, title: '강철이 길들이기', ready: false });
    expect(m.parts.map(p => p.text)).toEqual(['체력 15% ✓', '둔화 필요', '묵 1/1', `빈칸 ${s.open.filter(Boolean).length}`]);
    boss.slow = { pct: 0.3, ticks: 20 };
    m = tameModel(econOf(s), s)!;
    expect(m.ready).toBe(true);
    expect(m.parts[1]).toEqual({ text: '둔화 ✓', ok: true });
    expect(tameRejectText(econOf(s), boss.id, 'tameCondition', d3)).toBe('둔화가 풀렸습니다');
    s.buckwheat = 0;
    expect(tameModel(econOf(s), s)).toMatchObject({ ready: false, why: '메밀묵이 모자랍니다' });
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
