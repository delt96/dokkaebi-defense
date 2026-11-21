// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, econView, loadGameData, step, type ClientView, type EconMine, type GameState } from '@dorandi/logic';
import { forceRound, placeUnitForTest, spawnEnemyForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import {
  econPanelHtml, incomingModel, marketModel, noteText, questChips, shipModel, storyModel, tameModel, tameRejectText, transferEndText,
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
const econOf = (s: GameState, extra: Partial<EconMine> = {}): EconMine => ({ ...econView(s)!, transfer: null, team: null, ...extra });
const fill = (s: GameState) => { for (let i = 0; i < s.slots.length; i++) if (s.open[i] && !s.slots[i]) placeUnitForTest(s, 'jipsin', i); };

/** Just the parts of a server view the economy models read: who I am and the six rows. */
function view(me: number, rows: { seat: number; name: string; alive?: boolean; connected?: boolean; count?: number }[]): ClientView {
  return {
    me: { seat: me, key: 'k' },
    rows: rows.map(r => ({ seat: r.seat, name: r.name, status: r.alive === false ? 'spirit' : 'alive', connected: r.connected ?? true, count: r.count ?? 0 })),
  } as unknown as ClientView;
}

describe('market text', () => {
  test('prices, buys left and odds come from the data and the deck; reasons are given before paying', () => {
    const s = lane(1, market.jar.price + 5);
    const m = marketModel(econOf(s), s)!;
    expect(m.head).toBe(`1장날 · ${market.dayRounds}라운드까지`);
    const [bundle, jar] = m.shops;
    expect(bundle).toMatchObject({ name: '헌 살림 보따리', price: market.bundle.price, left: `남은 ${market.bundle.perDay}/${market.bundle.perDay}번`, lines: ['3등급 2/3 · 2등급 1/3'], blocked: '엽전 부족' });
    expect(jar).toMatchObject({ price: market.jar.price, blocked: null, lines: ['묵 50% · 재료 50%', '이번에 재료가 나오면 다음 묵 확정'] });
    s.coins = 1000;
    fill(s);
    expect(marketModel(econOf(s), s)!.shops.map(x => x.blocked)).toEqual(['빈칸 없음', '빈칸 없음']);
    expect(marketModel(econOf(lane(0)), lane(0))!.shops.map(x => x.blocked)).toEqual(['1라운드부터', '1라운드부터']);
  });

  test('a missed jar promises buckwheat, a one-grade deck says so, and a grade-6 target shows the shortfall', () => {
    const s = lane(1);
    s.econ!.jar = { period: 1, done: 0, missed: true };
    s.econ!.bundle.left = [3];
    let m = marketModel(econOf(s), s)!;
    expect(m.shops[1]!.lines).toEqual(['이번엔 묵 확정']);
    expect(m.shops[0]!.lines).toEqual(['다음은 3등급 확정']);
    const fee = d3.recipes.find(r => r.result === 'cheonnyeonjing')!.cost!.coins!;
    step(s, [{ type: 'storyTarget', id: 'cheonnyeonjing' }]);
    s.coins = market.bundle.price + fee - 10;
    m = marketModel(econOf(s), s)!;
    expect(m.shops[0]!.short).toBe('조합비까지 10냥 부족');
    expect(m.shops[1]!.short).toBeNull();
  });

  test('sold out today names the next market day', () => {
    const s = lane(13);
    s.econ!.bundle = { day: 2, bought: market.bundle.perDay, left: [3, 3, 2] };
    const m = marketModel(econOf(s), s)!;
    expect(m.shops[0]).toMatchObject({ left: `남은 0/${market.bundle.perDay}번`, blocked: '이번 장날 다 삼', lines: [`다음 장날 ${2 * market.dayRounds + 1}라운드부터`] });
  });

  test('a sold-out jar names the next jar by its own period, not the market day', () => {
    const jar = market.jar;
    const s = lane(jar.periodRounds + 3);
    s.econ!.jar = { period: 2, done: jar.perPeriod, missed: false };
    const m = marketModel(econOf(s), s)!;
    expect(m.shops[1]).toMatchObject({
      left: `남은 0/${jar.perPeriod}번`, blocked: `다음 단지 ${2 * jar.periodRounds + 1}라운드부터`,
      lines: [`단지는 ${jar.periodRounds}라운드마다 ${jar.perPeriod}번`],
    });
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

describe('delivery prompt and countdown', () => {
  const v = view(2, [{ seat: 1, name: '가나' }, { seat: 2, name: '다라' }, { seat: 3, name: '마바', connected: false }]);
  const transfer = (over = {}) => ({
    ready: 0, readyRounds: { 1: 0, 2: 0, 3: 0 }, busy: [], offer: null, rewarded: false, rewardsLeft: 6, delivered: [], ...over,
  });

  test('the receiver sees who sends what, the reward, the slot and the seconds left', () => {
    const s = lane(22);
    const offer = { offerId: 7, from: 1, to: 2, defId: 'moru', slot: 3, unitId: 9, deadlineTick: s.tick + 140 };
    const e = econOf(s, { transfer: transfer({ offer, busy: [1, 2] }) });
    const m = incomingModel(e, s, v, null)!;
    expect(m).toEqual({ text: '가나가 모루를 보냅니다', reward: `받으면 묵 +${eco.transfer!.reward}`, slot: 0, secondsLeft: 7, frac: 0.7 });
    expect(incomingModel(e, s, v, 5)!.slot).toBe(5);
    s.tick += 139;
    expect(incomingModel(e, s, v, null)!.secondsLeft).toBe(1);
    fill(s);
    expect(incomingModel(e, s, v, 5)!.slot).toBeNull();
    // the sender's own offer is not a prompt to accept
    expect(incomingModel(e, s, view(1, [{ seat: 1, name: '가나' }, { seat: 2, name: '다라' }]), null)).toBeNull();
  });

  test('the sender picks a unit and a living seat; locks and rests are spelled out', () => {
    const s = lane(22);
    const unit = placeUnitForTest(s, 'jipsin', 0);
    placeUnitForTest(s, 'gangcheori', 1);
    const me = view(1, [{ seat: 1, name: '가나' }, { seat: 2, name: '다라' }, { seat: 3, name: '마바', connected: false }]);
    expect(shipModel(econOf(s, { transfer: transfer() }), s, me, 0)!.lines[0]).toMatch(/지게 도깨비가 옵니다$/);
    s.econ!.jige = true;
    let m = shipModel(econOf(s, { transfer: transfer({ readyRounds: { 1: 0, 2: 25, 3: 0 } }) }), s, me, 0)!;
    expect(m.unit).toEqual({ slot: 0, unitId: unit.id });
    expect(m.targets).toEqual([{ seat: 2, label: '2 다라 · 쉬는 중', disabled: true }, { seat: 3, label: '3 마바 · 단절', disabled: true }]);
    expect(shipModel(econOf(s, { transfer: transfer() }), s, me, 1)!.lines[0]).toBe('강철이 · 히든은 보낼 수 없습니다');
    expect(shipModel(econOf(s, { transfer: transfer({ delivered: [unit.id] }) }), s, me, 0)!.lines[0]).toMatch(/받은 유닛은 다시 보낼 수 없습니다$/);
    const sut = placeUnitForTest(s, 'sutdarimi', 2);
    const two = view(1, [{ seat: 1, name: '가나' }, { seat: 2, name: '다라' }]);
    expect(shipModel(econOf(s, { transfer: transfer() }), s, two, 2)!).toMatchObject({ lines: ['숯다리미(3등급)를 누구에게?'], unit: { slot: 2, unitId: sut.id } });
    m = shipModel(econOf(s, { transfer: transfer({ ready: 25 }) }), s, me, 0)!;
    expect(m.lines).toEqual(['다음 배달 25라운드부터 (3라운드 남음)']);
    expect(m.targets).toEqual([]);
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

describe('story request page', () => {
  test('the offer separates kill progress, settlement costs and support usage', () => {
    const s = lane(31, 40);
    placeUnitForTest(s, 'janggu', 0);
    placeUnitForTest(s, 'moru', 1);
    step(s, [{ type: 'storyTarget', id: 'cheonnyeonjing' }]);
    s.econ!.story.active = { target: 'cheonnyeonjing', missing: 1, round: 31 };
    s.econ!.roundKills = 17;
    const m = storyModel(econOf(s), s)!;
    const fee = eco.story!.fee;
    expect(m.title).toBe('설화 의뢰 · 31라운드');
    const panel = document.createElement('div');
    panel.innerHTML = econPanelHtml('story', null, null, m);
    const terms = Array.from(panel.querySelectorAll('.story-terms dt, .story-terms dd'), el => el.textContent);
    expect(terms).toEqual([
      '잡귀 처치', '17/' + eco.story!.kills,
      '라운드 종료 시 지불', '장구·모루 · ' + fee.coins + '냥 · 묵 ' + fee.buckwheat + '개',
      '이번 판 지원 사용', econOf(s).story!.view!.used + '/' + econOf(s).story!.view!.cap,
    ]);
    expect(m.shortfalls).toContain(`엽전 ${fee.coins - 40}냥 부족`);
    expect(m.shortfalls).toContain(`메밀묵 ${fee.buckwheat}개 부족`);
    expect(m.shortfalls.some(x => /^유닛 값 \d+ 더 필요$/.test(x))).toBe(true);
  });
});

describe('refusals', () => {
  test('every economy refusal has a line', () => {
    for (const r of ['marketClosed', 'soldOut', 'badTarget', 'notOffered', 'missionClosed', 'noTarget', 'tameHp', 'tameCondition', 'locked', 'busy', 'targetBusy', 'targetAway', 'cooldown', 'noJige', 'noOffer']) {
      expect(rejectText(r), r).toBeTruthy();
    }
  });

  test('a delivery refusal says whether the target is gone, away, or busy, and whether the busy one is me', () => {
    expect(rejectText('targetNotAlive')).toBe('그 고개는 이미 뚫렸습니다');
    expect(rejectText('targetAway')).toBe('그 고개는 연결이 끊겼습니다');
    expect(rejectText('busy')).toBe('이미 배달을 주고받는 중입니다');
    expect(rejectText('targetBusy')).toBe('상대가 다른 배달을 주고받는 중입니다');
  });
});

describe('delivery end lines', () => {
  const end = (outcome: 'accepted' | 'declined' | 'expired' | 'invalid', by: number | null = null, cause: 'eliminated' | 'disconnected' | 'unitGone' | null = null) =>
    ({ from: 1, to: 2, defId: 'sutdarimi', outcome, by, cause });
  test('each side reads the server reason from its own seat', () => {
    const say = (e: ReturnType<typeof end>, me: number) => transferEndText(e, me, d3);
    expect([say(end('accepted'), 1), say(end('accepted'), 2)]).toEqual(['숯다리미 배달을 마쳤습니다', '숯다리미를 받았습니다']);
    expect([say(end('declined', 1), 1), say(end('declined', 1), 2)]).toEqual(['보내기를 취소했습니다', '보내는 쪽이 배달을 취소했습니다']);
    expect([say(end('declined', 2), 1), say(end('declined', 2), 2)]).toEqual(['상대가 배달을 사양했습니다', '배달을 사양했습니다']);
    expect(say(end('expired'), 1)).toBe('시간이 지나 배달이 끝났습니다');
    expect([say(end('invalid', 2, 'disconnected'), 1), say(end('invalid', 2, 'eliminated'), 1)])
      .toEqual(['상대 연결이 끊겨 배달이 취소됐습니다', '상대 고개가 뚫려 배달이 취소됐습니다']);
    expect([say(end('invalid', 1, 'eliminated'), 1), say(end('invalid', 1, 'unitGone'), 2)])
      .toEqual(['고개가 뚫려 배달이 취소됐습니다', '보낼 유닛이 없어져 배달이 취소됐습니다']);
  });
});

describe('notes and particles', () => {
  test('purchase, reward and taming lines', () => {
    expect(noteText({ type: 'buy', item: 'jar', defId: null, buckwheat: 1, jige: false }, d3)).toBe('단지에서 메밀묵 1개');
    expect(noteText({ type: 'buy', item: 'bundle', defId: 'moru', buckwheat: 0, jige: true }, d3)).toMatch(/^보따리에서 모루 \(\d등급\) · 지게 도깨비가 왔습니다!$/);
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

  test('a story request opens its page only over an idle left column; otherwise the 장터 button and the tab are marked', () => {
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const scene = new FakeScene();
    const driver = new GameDriver(createGame(d3, 1));
    mountUi(driver, scene as never);
    const s = driver.state;
    forceRound(s, 31);
    s.enemies = [];
    placeUnitForTest(s, 'janggu', 0);
    placeUnitForTest(s, 'moru', 1);
    step(s, [{ type: 'storyTarget', id: 'cheonnyeonjing' }]);
    const frame = () => { clock += 150; scene.onFrame?.(); };
    press(document.querySelector('[data-action="toggleHelper"]'));
    s.econ!.story.active = { target: 'cheonnyeonjing', missing: 1, round: 31 };
    frame();
    // the open helper stays; the request waits behind a mark
    expect(panel()).toBe('');
    expect(document.getElementById('left')!.textContent).toContain('조합 도우미 (Q) ▾');
    expect(document.querySelector('.market-btn .badge')?.textContent).toBe('의뢰');
    press(document.querySelector('.market-btn'));
    expect(document.querySelector('.econ-head .unread')?.textContent).toBe('의뢰 !');
    press(document.querySelector('.econ-head .unread'));
    expect(panel()).toContain('설화 의뢰 · 31라운드');
    expect(document.querySelector('.econ-head .unread')).toBeNull();
    expect(document.querySelector('.market-btn .badge')).toBeNull();
    // the page closes with 닫기; there is no 받기 that sends nothing
    expect(Array.from(document.querySelectorAll('#econ-panel .story-actions button')).map(b => b.textContent)).toEqual(['닫기', '의뢰 거절']);
    press(document.querySelector('[data-action="econClose"]'));
    expect(panel()).toBe('');
    // the next request comes over an idle left column and opens its page
    s.econ!.story.active = { target: 'cheonnyeonjing', missing: 1, round: 46 };
    frame();
    expect(panel()).toContain('설화 의뢰 · 46라운드');
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

describe('online: delivery prompt on the receiver', () => {
  test('a mine with an offer shows the prompt with its countdown; 받기 sends transferAccept for the picked slot', async () => {
    const { buildFull, createMatch, roundStartTick } = await import('@dorandi/logic');
    const { jumpToTick } = await import('@dorandi/logic/testing');
    const { NetClient } = await import('../src/net/NetClient');
    const { NetDriver } = await import('../src/net/NetDriver');
    const { FakeRoom, press } = await import('./fixtures/net');
    document.body.innerHTML = STAGE_HTML;
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const match = createMatch(d3, 2, [1, 2]);
    jumpToTick(match, roundStartTick(d3, 22) + 1);
    const full = buildFull(match, 2, { watching: 2, names: { 1: '가나', 2: '다라' }, key: 'k', n: 0 });
    const room = new FakeRoom();
    const net = new NetClient(room, full.dataVersion);
    room.emit('full', full);
    const driver = new NetDriver(net, d3, () => clock);
    const scene = { selectedId: null, onFrame: undefined as (() => void) | undefined, onSelect() {}, onEvents() {} };
    mountUi(driver, scene as never, {}, {
      online: true, view: () => net.view, data: d3,
      actions: { support() {}, watch() {}, forfeit() {}, transfer: cmd => { net.send(cmd); } },
    });
    const mine = structuredClone(full.mine);
    mine.tick = full.clock.tick + 1;
    mine.econ!.transfer!.offer = { offerId: 7, from: 1, to: 2, defId: 'moru', slot: 0, unitId: 77, deadlineTick: full.clock.tick + 100 };
    room.emit('mine', mine);
    clock += 150; driver.update(16); scene.onFrame?.();
    const top = document.getElementById('econ-top')!;
    expect(top.textContent).toContain('가나가 모루를 보냅니다');
    expect(top.textContent).toContain('5초');
    press(top.querySelector('[data-action="receive"]'));
    expect(room.cmds('transferAccept')).toEqual([{ seq: 1, type: 'transferAccept', args: { offerId: 7, slot: 0 } }]);
    press(top.querySelector('[data-action="refuse"]'));
    expect(room.cmds('transferDecline').length).toBe(1);
  });

  /** Seat 2 with a delivery from seat 1 on screen; `send` streams the next mine and draws a frame. */
  /** `tame`: a tame target at its tame HP is on seat 2's lane too, so a second prompt row shows. */
  async function mountReceiver(opts: { tame?: boolean } = {}) {
    const { buildFull, createMatch, roundStartTick } = await import('@dorandi/logic');
    const { jumpToTick } = await import('@dorandi/logic/testing');
    const { NetClient } = await import('../src/net/NetClient');
    const { NetDriver } = await import('../src/net/NetDriver');
    const { FakeRoom, press } = await import('./fixtures/net');
    document.body.innerHTML = STAGE_HTML;
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const match = createMatch(d3, 2, [1, 2]);
    jumpToTick(match, roundStartTick(d3, 22) + 1);
    if (opts.tame) {
      const foe = spawnEnemyForTest(match.lanes[2]!, 'gangcheori', 3, 20000);
      foe.maxHp = 100000;
      foe.hp = Math.floor(foe.maxHp * eco.tame!.hpPct);
    }
    const full = buildFull(match, 2, { watching: 2, names: { 1: '가나', 2: '다라' }, key: 'k', n: 0 });
    const room = new FakeRoom();
    const net = new NetClient(room, full.dataVersion);
    room.emit('full', full);
    const driver = new NetDriver(net, d3, () => clock);
    const scene = { selectedId: null, onFrame: undefined as (() => void) | undefined, onSelect() {}, onEvents() {} };
    mountUi(driver, scene as never, {}, {
      online: true, view: () => net.view, data: d3,
      actions: { support() {}, watch() {}, forfeit() {}, transfer: cmd => { net.send(cmd); } },
    });
    let tick = full.clock.tick;
    const send = (edit: (m: typeof full.mine) => void) => {
      const m = structuredClone(net.view!.mine);
      m.tick = ++tick;
      m.acks = [];
      delete m.transferEnds;
      edit(m);
      room.emit('mine', m);
      // the notice line is drawn before the economy part decides what ended, so it shows a frame later
      for (let i = 0; i < 2; i++) { clock += 150; driver.update(16); scene.onFrame?.(); }
    };
    send(m => { m.econ!.transfer!.offer = { offerId: 7, from: 1, to: 2, defId: 'moru', slot: 0, unitId: 77, deadlineTick: full.clock.tick + 100 }; });
    const top = () => document.getElementById('econ-top')!;
    return {
      send, top,
      receive: () => press(top().querySelector('[data-action="receive"]')),
      banner: () => document.getElementById('round-banner')!.textContent ?? '',
      bannerLow: () => document.getElementById('round-banner')!.classList.contains('low'),
      right: () => document.getElementById('right')!.textContent ?? '',
      refusal: (m: typeof full.mine, reason: 'noOffer' | 'noSlot') => { m.acks = [{ seat: 2, seq: 1, tick: m.tick, ok: false, reason }]; },
    };
  }

  test('a 받기 the server turned down is not reported as received', async () => {
    const r = await mountReceiver();
    r.receive();
    // the offer ran out on the server just before the press got there
    r.send(m => { m.econ!.transfer!.offer = null; });
    expect(r.banner()).not.toContain('받았습니다');
    r.send(m => r.refusal(m, 'noOffer'));
    expect(r.banner()).toBe('받을 배달이 없습니다');
  });

  test('a delivery that lands is reported from the server end reason', async () => {
    const r = await mountReceiver();
    r.receive();
    r.send(m => {
      m.econ!.transfer!.offer = null;
      m.units[0] = { id: 500, defId: 'moru' };
      m.econ!.transfer!.delivered = [500];
      m.acks = [{ seat: 2, seq: 1, tick: m.tick, ok: true }];
      m.transferEnds = [{ from: 1, to: 2, defId: 'moru', outcome: 'accepted', by: null, cause: null }];
    });
    expect(r.banner()).toBe('모루를 받았습니다');
  });

  test('the sender dropping out is told as such, not as a cancel', async () => {
    for (const [cause, text] of [['disconnected', '상대 연결이 끊겨 배달이 취소됐습니다'], ['eliminated', '상대 고개가 뚫려 배달이 취소됐습니다']] as const) {
      const r = await mountReceiver();
      r.send(m => {
        m.econ!.transfer!.offer = null;
        m.transferEnds = [{ from: 1, to: 2, defId: 'moru', outcome: 'invalid', by: 1, cause }];
      });
      expect(r.banner()).toBe(text);
    }
  });

  test('my own elimination ends the delivery with its own line', async () => {
    const r = await mountReceiver();
    r.send(m => {
      m.econ!.transfer!.offer = null;
      m.transferEnds = [{ from: 1, to: 2, defId: 'moru', outcome: 'invalid', by: 2, cause: 'eliminated' }];
    });
    expect(r.banner()).toBe('고개가 뚫려 배달이 취소됐습니다');
  });

  test('with one prompt row the notice takes the second row on one line; with two it moves to the right column', async () => {
    const one = await mountReceiver();
    expect(one.top().querySelectorAll('.prompt').length).toBe(1);
    one.receive();
    one.send(m => { m.units[0] = { id: 400, defId: 'jipsin' }; one.refusal(m, 'noSlot'); });
    expect(one.bannerLow()).toBe(true);
    expect(one.banner()).toBe('그 칸이 막 찼습니다 · 다시 받아 주세요');
    vi.restoreAllMocks();
    const two = await mountReceiver({ tame: true });
    expect(two.top().querySelectorAll('.prompt').length).toBe(2);
    two.receive();
    two.send(m => { m.units[0] = { id: 400, defId: 'jipsin' }; two.refusal(m, 'noSlot'); });
    expect(two.banner()).toBe('');
    expect(two.right()).toContain('그 칸이 막 찼습니다 · 다시 받아 주세요');
    // the offer gone, one row is left and the line comes back over the lane
    two.send(m => { m.econ!.transfer!.offer = null; m.transferEnds = [{ from: 1, to: 2, defId: 'moru', outcome: 'expired', by: null, cause: null }]; });
    expect(two.top().querySelectorAll('.prompt').length).toBe(1);
    expect(two.banner()).toBe('시간이 지나 배달이 끝났습니다');
  });

  test('an offer that leaves without a server reason (the match ended) says nothing', async () => {
    const r = await mountReceiver();
    r.send(m => { m.econ!.transfer!.offer = null; });
    expect(r.banner()).toBe('');
  });

  test('a 받기 whose cell was just taken says so, offers the next free cell and is not reported as received', async () => {
    const r = await mountReceiver();
    r.receive();
    // a summon sent just before took cell 1 first
    r.send(m => { m.units[0] = { id: 400, defId: 'jipsin' }; r.refusal(m, 'noSlot'); });
    expect(r.banner()).toBe('그 칸이 막 찼습니다 · 다시 받아 주세요');
    expect(r.top().querySelector('[data-action="receive"]')?.getAttribute('data-arg')).toBe('1');
    r.send(m => { m.econ!.transfer!.offer = null; });
    expect(r.banner()).not.toContain('받았습니다');
  });
});
