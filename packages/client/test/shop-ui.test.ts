// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  applyCommand, attackIntervalTicks, combineEatsItem, createGame, damageBonus, econView, jigeCandidates, loadGameData, pickStored, shopItem,
  speedBonus, unitAttack, unitDefFast, type Command, type EconMine, type GameState, type Unit,
} from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { econPanelHtml, marketModel, shopModel } from '../src/ui/econ';
import { blockedText } from '../src/ui/gamble';
import { combineOptions, helperModel, itemShort, nextCombines, rejectText, storedCombineOptions, unitCard } from '../src/ui/models';
import { mountUi } from '../src/ui/mount';
import { soloPanelHtml, unitDetailsHtml } from '../src/ui/panels';
import { refusalSpot } from '../src/ui/signals';
import { storageInfoHtml, storageInfoModel } from '../src/ui/storage';
import { press, STAGE_HTML } from './fixtures/net';

const d3 = loadGameData('stage3');
const price = (id: string) => shopItem(d3, id)!.coins;
const EATS = '아이템이 사라집니다';
const REPLACE = '붙이면 지금 아이템은 사라집니다';

/** The solo left panel with `slot` selected, or the whole next list (the old helper) with nothing selected. */
const panel = (s: GameState, slot: number | null, shop = econView(s)?.shop ?? null) => soloPanelHtml(s, {
  selected: slot, list: nextCombines(s, slot === null ? {} : { slot }), idleList: true, wPick: null, hover: null, showAllOne: false, skillOpen: false, shop,
});
const WIN = { wins: 'outside', bar: '', historyOpen: false, historyCount: 0 } as const;

class FakeScene {
  selectedId: number | null = null;
  onFrame?: () => void;
  select?: (slot: number | null) => void;
  onSelect(cb: (slot: number | null) => void): void { this.select = cb; }
  onEvents(): void {}
}

function openGame(): GameState {
  const s = createGame(d3, 3);
  forceRound(s, 12);
  s.econ!.marketOpen = true;
  return s;
}
const mineOf = (s: GameState): EconMine => ({ ...econView(s)!, team: null });

function storeForTest(s: GameState, defId: string, item?: string): Unit {
  const unit: Unit = { id: s.nextId++, defId, cooldown: 0, attackCount: 0, periodic: [], ...(item && { item }) };
  (s.storage ??= []).push(unit);
  return unit;
}

describe('effect lines', () => {
  test('each charm says what it does', () => {
    const rows = shopModel(mineOf(openGame()), 0, 0)!;
    const text = Object.fromEntries(rows.map(r => [r.id, r.effectText]));
    expect(text).toEqual({
      rangeCharm: '유닛 하나 사거리 +0.5 · 한 판 1번',
      powerCharm: '유닛 하나 공격력 +20%',
      swiftCharm: '유닛 하나 공격 속도 +15%',
      weakCharm: '때린 적이 받는 같은 종류 피해 +10% · 3초',
      evolveCharm: '무언가를 진화시키는 부적이다.',
    });
    expect(rows.find(r => r.id === 'powerCharm')!.price).toBe(`${price('powerCharm')}냥`);
  });
});

describe('blocked text', () => {
  test('short coins name the shortfall, the market reuses the same words', () => {
    const s = openGame();
    const a = shopModel(mineOf(s), 0, 0)!.find(r => r.id === 'powerCharm')!;
    const b = shopModel(mineOf(s), 40, 0)!.find(r => r.id === 'powerCharm')!;
    s.coins = 0;
    const why = shopModel(mineOf(s), 0, 0)!.find(r => r.id === 'powerCharm')!;
    expect(why.blocked).toBe(`엽전 ${price('powerCharm')}냥 부족`);
    expect(why.blocked).toBe(blockedText('noCoins', price('powerCharm'), 0));
    expect(a.blocked).not.toBe(b.blocked);
    expect(b.blocked).toBe(`엽전 ${price('powerCharm') - 40}냥 부족`);
  });
  test('a used-up per-game charm is done and its button reads 삼', () => {
    const s = openGame();
    s.coins = 9999;
    s.econ!.itemsBought = { rangeCharm: 1 };
    const row = shopModel(mineOf(s), s.coins, 0)!.find(r => r.id === 'rangeCharm')!;
    expect(row.done).toBe(true);
    const box = document.createElement('div');
    box.innerHTML = econPanelHtml(marketModel(mineOf(s), s)!, null, false, { ...WIN, tab: 'items' });
    const buy = box.querySelector<HTMLButtonElement>('[data-action="buyItem"][data-arg="rangeCharm"]')!;
    expect(buy.disabled).toBe(true);
    expect(buy.textContent!.trim()).toBe('삼');
    expect(box.querySelector<HTMLButtonElement>('[data-action="buyItem"][data-arg="powerCharm"]')!.disabled).toBe(false);
  });
  test('watching, a bought-up row points at no reason while the others point at the shown one', () => {
    const s = openGame();
    s.econ!.itemsBought = { rangeCharm: 1 };
    const box = document.createElement('div');
    box.innerHTML = econPanelHtml(marketModel(mineOf(s), s)!, null, true, { ...WIN, tab: 'items' });
    const done = box.querySelector<HTMLButtonElement>('[data-action="buyItem"][data-arg="rangeCharm"]')!;
    expect(done.hasAttribute('aria-describedby')).toBe(false);
    const other = box.querySelector<HTMLButtonElement>('[data-action="buyItem"][data-arg="powerCharm"]')!;
    expect(box.querySelector(`#${other.getAttribute('aria-describedby')}`)!.textContent).toBe('관전 중에는 살 수 없어요');
  });
  test('a locked market names the boss', () => {
    const s = openGame();
    s.econ!.marketOpen = false;
    s.coins = 9999;
    expect(shopModel(mineOf(s), s.coins, 0)!.every(r => r.blocked === '10라운드 보스 격파 후')).toBe(true);
  });
  test('the item tab lists rows and the held count line', () => {
    const s = openGame();
    s.coins = 9999;
    s.econ!.items = { powerCharm: 2 };
    const box = document.createElement('div');
    box.innerHTML = econPanelHtml(marketModel(mineOf(s), s)!, null, false, { ...WIN, tab: 'items' });
    expect(box.querySelectorAll('[data-action="econTab"]')).toHaveLength(2);
    expect(box.querySelectorAll('[data-action="buyItem"]')).toHaveLength(d3.economy!.shop!.items.length);
    expect(box.textContent).toContain('들고 있는 아이템');
    expect(box.textContent!.replace(/ /g, ' ')).toContain('힘 부적 2');
    expect(box.querySelector('.gamble-products')).toBeNull();
    box.innerHTML = econPanelHtml(marketModel(mineOf(s), s)!, null, false, WIN);
    expect(box.querySelector('.gamble-products')).not.toBeNull();
    expect(box.querySelector('[data-action="buyItem"]')).toBeNull();
  });
});

describe('the unit card shows the item and its share', () => {
  const ranged = d3.units.find(u => !u.hidden && u.range === 1.5 && u.grade <= 4)!;
  const auraOf = (type: string) => d3.units.find(u => !u.hidden && u.skills.some(k => k.effects.some(e => e.kind === 'auraAttackSpeed' && e.damageType === type)))!;

  test('range charm on a 1.5 unit', () => {
    const s = openGame();
    placeUnitForTest(s, ranged.id, 0).item = 'rangeCharm';
    expect(unitCard(s, 0)!.item).toEqual({ id: 'rangeCharm', name: '사거리 부적', short: '사' });
    expect(panel(s, 0)).toContain('사거리 2칸');
    expect(unitDetailsHtml(s, 0)).toContain('2칸 (+0.5 사거리 부적)');
  });
  test('power charm adds its 0.2 on top of the upgrade', () => {
    const s = openGame();
    s.upgrades[ranged.damageType] = 2;
    placeUnitForTest(s, ranged.id, 0);
    const before = damageBonus(s, 0);
    expect(before).toBeGreaterThan(0);
    s.slots[0]!.item = 'powerCharm';
    const card = unitCard(s, 0)!;
    expect(card.attackBonus).toBeCloseTo(before + 0.2);
    expect(card.attack).toBe(Math.round(unitAttack(ranged, d3.balance) * (1 + before + 0.2)));
    const html = panel(s, 0);
    const line = html.match(/공격 \d+[^<]*/)![0];
    expect(line).toContain(`공격 ${card.attack}`);
    const box = document.createElement('div');
    box.innerHTML = html;
    expect(box.querySelector('.unit-item')!.textContent).toContain('힘 부적');
    box.innerHTML = unitDetailsHtml(s, 0);
    expect(box.querySelector('.ud-item')!.textContent).toBe('아이템 힘 부적 (+20%)');
  });
  test('the 상세 item line names the charm once with its share, and the bonus title counts items', () => {
    const s = openGame();
    placeUnitForTest(s, ranged.id, 0).item = 'powerCharm';
    const box = document.createElement('div');
    box.innerHTML = unitDetailsHtml(s, 0);
    const line = box.querySelector('.ud-item')!.textContent!;
    expect(line).toBe('아이템 힘 부적 (+20%)');
    expect(box.querySelector('.ud-bonus')!.getAttribute('title')).toBe('강화·오라·아이템 포함');
  });
  test('swift charm shows its share and the tick-rounded interval', () => {
    const s = openGame();
    const aura = auraOf(ranged.damageType);
    placeUnitForTest(s, ranged.id, 0);
    placeUnitForTest(s, aura.id, 1);
    const before = speedBonus(s, 0);
    expect(before).toBeGreaterThan(0);
    s.slots[0]!.item = 'swiftCharm';
    const card = unitCard(s, 0)!;
    expect(card.speedBonus).toBeCloseTo(before + 0.15);
    expect(card.interval).toBe(attackIntervalTicks(ranged.interval, speedBonus(s, 0)) * d3.balance.tickMs / 1000);
    expect(panel(s, 0)).toContain(`${card.interval}초마다`);
    const box = document.createElement('div');
    box.innerHTML = unitDetailsHtml(s, 0);
    expect(box.querySelector('.ud-item')!.textContent).toBe('아이템 날쌘 부적 (+15%)');
  });
  test('the board corner letter follows the attached item', () => {
    const s = openGame();
    placeUnitForTest(s, ranged.id, 0).item = 'weakCharm';
    placeUnitForTest(s, ranged.id, 1);
    expect(itemShort(s, 0)).toBe('약');
    expect(itemShort(s, 1)).toBeNull();
    expect(itemShort(s, 2)).toBeNull();
  });
});

describe('the item line warns before a replace', () => {
  test('a unit with an item gets the warning and one button per held kind', () => {
    const s = openGame();
    s.econ!.items = { powerCharm: 1, swiftCharm: 2, weakCharm: 0 };
    const unit = placeUnitForTest(s, d3.units.find(u => !u.hidden && u.grade === 2)!.id, 0);
    unit.item = 'rangeCharm';
    const box = document.createElement('div');
    box.innerHTML = panel(s, 0);
    const line = box.querySelector<HTMLElement>('.unit-item')!;
    expect(line.title).toContain(REPLACE);
    expect(line.textContent).toContain('사거리 부적');
    const buttons = Array.from(line.querySelectorAll<HTMLElement>('[data-action="attachItem"]'));
    expect(buttons.map(b => b.dataset.arg)).toEqual([`powerCharm@${unit.id}`, `swiftCharm@${unit.id}`]);
    expect(buttons.every(b => b.title.includes(REPLACE))).toBe(true);
    expect(line.nextElementSibling!.classList.contains('up-actions')).toBe(true);
    delete unit.item;
    box.innerHTML = panel(s, 0);
    expect(box.innerHTML).not.toContain(REPLACE);
    expect(box.querySelectorAll('[data-action="attachItem"]')).toHaveLength(2);
  });
  test('pressing 붙이기 in solo sends attachItem for that cell', () => {
    document.body.innerHTML = STAGE_HTML;
    const s = openGame();
    s.econ!.items = { powerCharm: 1 };
    const unit = placeUnitForTest(s, d3.units.find(u => !u.hidden && u.grade === 2)!.id, 4);
    const driver = new GameDriver(s);
    const scene = new FakeScene();
    mountUi(driver, scene as never);
    const queued: Command[] = [];
    vi.spyOn(driver, 'queue').mockImplementation(cmd => { queued.push(cmd); });
    scene.select!(4);
    press(document.querySelector(`#left [data-action="attachItem"][data-arg="powerCharm@${unit.id}"]`));
    expect(queued).toEqual([{ type: 'attachItem', item: 'powerCharm', slot: 4, unitId: unit.id }]);
    vi.restoreAllMocks();
  });
  test('a swap queued in the same tick leaves the charm held and says the board changed', () => {
    document.body.innerHTML = STAGE_HTML;
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const s = openGame();
    s.econ!.items = { rangeCharm: 1 };
    const def = d3.units.find(u => !u.hidden && u.grade === 2)!.id;
    const first = placeUnitForTest(s, def, 4);
    const second = placeUnitForTest(s, def, 5);
    const driver = new GameDriver(s);
    const scene = new FakeScene();
    mountUi(driver, scene as never);
    scene.select!(4);
    const button = document.querySelector(`#left [data-action="attachItem"][data-arg="rangeCharm@${first.id}"]`);
    driver.queue({ type: 'move', from: 4, to: 5 });
    press(button);
    driver.update(d3.balance.tickMs);
    expect(s.slots[4]).toBe(second);
    expect(s.slots[5]).toBe(first);
    expect(first.item).toBeUndefined();
    expect(second.item).toBeUndefined();
    expect(s.econ!.items!.rangeCharm).toBe(1);
    clock += 1000;
    scene.onFrame!();
    expect(document.body.textContent).toContain(rejectText('staleUnit'));
    vi.restoreAllMocks();
  });
});

describe('the online card menu lists held items', () => {
  beforeEach(() => { document.body.innerHTML = STAGE_HTML; });
  afterEach(() => { vi.restoreAllMocks(); });

  test('with nothing held the menu says where items come from', async () => {
    const { buildFull, createMatch, roundStartTick } = await import('@dorandi/logic');
    const { jumpToTick } = await import('@dorandi/logic/testing');
    const { NetClient } = await import('../src/net/NetClient');
    const { NetDriver } = await import('../src/net/NetDriver');
    const { FakeRoom } = await import('./fixtures/net');
    const clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const match = createMatch(d3, 5, [1, 2]);
    jumpToTick(match, roundStartTick(d3, 12) + 1);
    const lane = match.lanes[1]!;
    lane.econ!.marketOpen = true;
    placeUnitForTest(lane, d3.units.find(u => !u.hidden && u.grade === 3)!.id, 2);
    const room = new FakeRoom();
    const full = () => buildFull(match, 1, { watching: 1, names: { 1: '가', 2: '나' }, key: 'k', n: 0 });
    const net = new NetClient(room, full().dataVersion);
    room.emit('full', full());
    const driver = new NetDriver(net, d3, () => clock);
    driver.update(16);
    const scene = new FakeScene();
    mountUi(driver, scene as never, {}, { online: true, view: () => net.view, data: d3, actions: { support() {}, watch() {}, forfeit() {} } });
    scene.select!(2);
    press(document.querySelector('#bottom [data-action="itemMenu"]'));
    expect(document.querySelector('#bottom .item-pop .item-hint')?.textContent).toBe('장터(B) 아이템 탭에서 삽니다');
  });

  test('the menu reads the held count from the shop view and drops it after the ack', async () => {
    const { buildFull, createMatch, roundStartTick } = await import('@dorandi/logic');
    const { jumpToTick } = await import('@dorandi/logic/testing');
    const { NetClient } = await import('../src/net/NetClient');
    const { NetDriver } = await import('../src/net/NetDriver');
    const { FakeRoom } = await import('./fixtures/net');
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const match = createMatch(d3, 5, [1, 2]);
    jumpToTick(match, roundStartTick(d3, 12) + 1);
    const lane = match.lanes[1]!;
    lane.econ!.marketOpen = true;
    lane.econ!.items = { powerCharm: 2 };
    const unit = placeUnitForTest(lane, d3.units.find(u => !u.hidden && u.grade === 3)!.id, 2);
    const full = () => buildFull(match, 1, { watching: 1, names: { 1: '가', 2: '나' }, key: 'k', n: 0 });
    const room = new FakeRoom();
    const net = new NetClient(room, full().dataVersion);
    room.emit('full', full());
    const driver = new NetDriver(net, d3, () => clock);
    driver.update(16);
    const scene = new FakeScene();
    mountUi(driver, scene as never, {}, { online: true, view: () => net.view, data: d3, actions: { support() {}, watch() {}, forfeit() {} } });
    scene.select!(2);
    expect(document.querySelector('#bottom .item-pop')).toBeNull();
    press(document.querySelector('#bottom [data-action="itemMenu"]'));
    const pop = () => document.querySelector<HTMLElement>('#bottom .item-pop');
    expect(pop()!.textContent).toContain('힘 부적 (2개)');
    press(pop()!.querySelector('[data-action="attachItem"][data-arg^="powerCharm@"]'));
    expect(room.cmds('attachItem')).toEqual([{ seq: expect.any(Number), type: 'attachItem', args: { item: 'powerCharm', slot: 2, unitId: unit.id } }]);
    expect(applyCommand(lane, { type: 'attachItem', item: 'powerCharm', slot: 2 }, [])).toBeNull();
    room.emit('full', full());
    clock += 150; driver.update(16);
    scene.select!(2);
    press(document.querySelector('#bottom [data-action="itemMenu"]'));
    expect(pop()!.textContent).toContain('힘 부적 (1개)');
    expect(pop()!.textContent).toContain(REPLACE);
    expect(document.querySelector('#bottom .card')!.textContent).toContain('(+20%)');
  });

  async function onlineSeat(items: Record<string, number>, slots: number[]) {
    const { buildFull, createMatch, roundStartTick, stepMatch } = await import('@dorandi/logic');
    const { jumpToTick } = await import('@dorandi/logic/testing');
    const { NetClient } = await import('../src/net/NetClient');
    const { NetDriver } = await import('../src/net/NetDriver');
    const { FakeRoom } = await import('./fixtures/net');
    vi.spyOn(performance, 'now').mockImplementation(() => 1000);
    const match = createMatch(d3, 5, [1, 2]);
    jumpToTick(match, roundStartTick(d3, 12) + 1);
    const lane = match.lanes[1]!;
    lane.econ!.marketOpen = true;
    lane.econ!.items = items;
    const def = d3.units.find(u => !u.hidden && u.grade === 3)!.id;
    const units = slots.map(slot => placeUnitForTest(lane, def, slot));
    const full = () => buildFull(match, 1, { watching: 1, names: { 1: '가', 2: '나' }, key: 'k', n: 0 });
    const room = new FakeRoom();
    const net = new NetClient(room, full().dataVersion);
    room.emit('full', full());
    const driver = new NetDriver(net, d3, () => 1000);
    driver.update(16);
    const scene = new FakeScene();
    mountUi(driver, scene as never, {}, { online: true, view: () => net.view, data: d3, actions: { support() {}, watch() {}, forfeit() {} } });
    scene.select!(slots[0]!);
    return { match, lane, units, room, scene, full, stepMatch };
  }
  const pop = () => document.querySelector<HTMLElement>('#bottom .item-pop');

  test('while the first attach waits for its answer the menu already warns about it and counts it out', async () => {
    const { lane, units: [unit], room } = await onlineSeat({ rangeCharm: 1, powerCharm: 1 }, [2]);
    press(document.querySelector('#bottom [data-action="itemMenu"]'));
    expect(pop()!.textContent).not.toContain(REPLACE);
    press(pop()!.querySelector(`[data-action="attachItem"][data-arg="rangeCharm@${unit!.id}"]`));
    expect(room.cmds('attachItem')).toHaveLength(1);
    press(document.querySelector('#bottom [data-action="itemMenu"]'));
    expect(pop()!.textContent).toContain(`사거리 부적 · ${REPLACE}`);
    expect(pop()!.querySelector('[data-arg^="rangeCharm@"]')).toBeNull();
    expect(pop()!.textContent).toContain('사거리 부적 (0개)');
    expect(pop()!.querySelector<HTMLElement>('[data-action="attachItem"]')!.dataset.arg).toBe(`powerCharm@${unit!.id}`);
    expect(lane.econ!.items).toEqual({ rangeCharm: 1, powerCharm: 1 });
  });

  test('a button pressed after a full view swapped its cell sends its own unit and the server keeps the charm', async () => {
    const { match, lane, units: [drawn, other], room, full, stepMatch } = await onlineSeat({ powerCharm: 2 }, [2, 3]);
    press(document.querySelector('#bottom [data-action="itemMenu"]'));
    const button = document.querySelector<HTMLElement>(`#bottom .item-pop [data-action="attachItem"][data-arg="powerCharm@${drawn!.id}"]`)!;
    [lane.slots[2], lane.slots[3]] = [lane.slots[3]!, lane.slots[2]!];
    room.emit('full', full());
    press(button);
    const sent = room.cmds('attachItem').at(-1)!;
    expect(sent.args).toEqual({ item: 'powerCharm', slot: 2, unitId: drawn!.id });
    const r = stepMatch(match, [{ seat: 1, seq: sent.seq, cmd: { type: 'attachItem', ...sent.args } }]);
    expect(r.acks[0]).toMatchObject({ ok: false, reason: 'staleUnit' });
    expect(other!.item).toBeUndefined();
    expect(drawn!.item).toBeUndefined();
    expect(lane.econ!.items!.powerCharm).toBe(2);
  });

  test('the keyboard moves into the opened list and back to its 아이템 ▾ button', async () => {
    const { units: [unit], room } = await onlineSeat({ rangeCharm: 0, powerCharm: 1 }, [2]);
    const menuButton = () => document.querySelector<HTMLElement>(`#bottom [data-action="itemMenu"][data-arg="${unit!.id}"]`)!;
    menuButton().focus();
    press(menuButton());
    expect(document.activeElement).toBe(pop()!.querySelector(`[data-action="attachItem"][data-arg="powerCharm@${unit!.id}"]`));
    press(menuButton());
    expect(pop()).toBeNull();
    expect(document.activeElement).toBe(menuButton());
    press(menuButton());
    press(document.activeElement);
    expect(room.cmds('attachItem')).toHaveLength(1);
    expect(pop()).toBeNull();
    expect(document.activeElement).toBe(menuButton());
  });
});

describe('a combine that eats an item says so', () => {
  const recipe = d3.recipes.find(r => new Set(r.materials).size === r.materials.length && unitDefFast(d3, r.result).grade === 3)!;
  function board(): GameState {
    const s = openGame();
    recipe.materials.forEach((m, i) => placeUnitForTest(s, m, i));
    s.slots[0]!.item = 'powerCharm';
    return s;
  }

  test('unit card options and the helper list follow combineEatsItem with their own arguments', () => {
    document.body.innerHTML = STAGE_HTML;
    const s = board();
    expect(combineEatsItem(s, recipe.result, 0)).toBe(true);
    for (let slot = 0; slot < recipe.materials.length; slot++) {
      for (const o of combineOptions(s, slot)) expect(o.eatsItem === true).toBe(combineEatsItem(s, o.result, slot));
    }
    for (const h of helperModel(s)) expect(h.eatsItem === true).toBe(combineEatsItem(s, h.recipe));
    const box = document.createElement('div');
    box.innerHTML = panel(s, 0);
    const row = box.querySelector<HTMLElement>(`[data-action="combine"][data-arg="${recipe.result}@${s.slots[0]!.id}"]`)!;
    expect(row.textContent).toContain(EATS);
    box.innerHTML = panel(s, null);
    const li = box.querySelector<HTMLElement>(`[data-action="combine"][data-arg="${recipe.result}"]`)!;
    expect(li.textContent).toContain(EATS);
  });
  test('a bare copy on the board takes the warning away from the helper', () => {
    document.body.innerHTML = STAGE_HTML;
    const s = board();
    placeUnitForTest(s, recipe.materials[0]!, 10);
    expect(combineEatsItem(s, recipe.result)).toBe(false);
    const box = document.createElement('div');
    box.innerHTML = panel(s, null);
    const li = box.querySelector<HTMLElement>(`[data-action="combine"][data-arg="${recipe.result}"]`)!;
    expect(li.textContent).not.toContain(EATS);
  });
});

describe('storage paths prefer the bare copy', () => {
  test('the storage combine button warns when the stored copy has the only item', () => {
    const recipe = d3.recipes.find(r => new Set(r.materials).size === r.materials.length && unitDefFast(d3, r.materials[0]!).grade <= 2)!;
    const s = openGame();
    const [first, ...rest] = recipe.materials;
    rest.forEach((m, i) => placeUnitForTest(s, m, i));
    storeForTest(s, first!, 'swiftCharm');
    expect(combineEatsItem(s, recipe.result)).toBe(true);
    const option = storedCombineOptions(s, first!).find(o => o.result === recipe.result)!;
    expect(option.eatsItem).toBe(true);
    const html = storageInfoHtml(s, storageInfoModel(s, first!)!);
    const box = document.createElement('div');
    box.innerHTML = html;
    const btn = box.querySelector<HTMLElement>(`.storage-combine[data-arg="${recipe.result}"]`)!;
    expect(btn.textContent).toContain(EATS);
  });
  test('R on a storage stack opens on the copy pickStored names', () => {
    document.body.innerHTML = STAGE_HTML;
    const s = openGame();
    s.econ!.jige = 1;
    const kind = d3.units.find(u => !u.hidden && u.grade === 2 && jigeCandidates(d3, u.id).length > 1)!;
    storeForTest(s, kind.id, 'powerCharm');
    const bare = storeForTest(s, kind.id);
    storeForTest(s, kind.id, 'swiftCharm');
    expect(pickStored(s.storage!, kind.id)).toBe(1);
    const driver = new GameDriver(s);
    const scene = new FakeScene();
    mountUi(driver, scene as never);
    const queued: Command[] = [];
    vi.spyOn(driver, 'queue').mockImplementation(cmd => { queued.push(cmd); });
    press(document.querySelector(`#storage [data-action="jigeOpen"][data-arg="storage:${kind.id}"]`));
    const pick = Array.from(document.querySelectorAll<HTMLElement>('#win-left [data-action="jigeSwap"]')).find(b => b.dataset.arg !== kind.id)!;
    press(pick);
    expect(queued).toEqual([{ type: 'jigeSwap', source: { zone: 'storage', index: 1, unitId: bare.id }, result: pick.dataset.arg }]);
    vi.restoreAllMocks();
  });
});

describe('an item refusal sits over the pressed button', () => {
  const vis = (selector: string) => !!document.querySelector(selector);
  const spotNode = (cmd: { type: string; arg?: string }) => {
    const spot = refusalSpot(cmd, vis);
    return spot.at === 'slot' ? null : document.querySelector(spot.selector);
  };
  test('buyItem over its 사기 button in the market window, else the slot', () => {
    document.body.innerHTML = STAGE_HTML;
    document.getElementById('win-right')!.innerHTML = '<button data-action="buyItem" data-arg="powerCharm"></button>';
    expect(refusalSpot({ type: 'buyItem', arg: 'powerCharm' }, vis)).toMatchObject({ at: 'win', side: 'right' });
    expect(refusalSpot({ type: 'buyItem', arg: 'swiftCharm' }, vis)).toEqual({ at: 'slot' });
  });
  test('attachItem over the solo 붙이기 button, online over the 아이템 ▾ button the list closed back to', () => {
    document.body.innerHTML = STAGE_HTML;
    document.getElementById('left')!.innerHTML = '<button data-action="attachItem" data-arg="powerCharm@7"></button>';
    expect(spotNode({ type: 'attachItem', arg: 'powerCharm@7' })).toBe(document.querySelector('#left [data-action="attachItem"]'));
    document.getElementById('left')!.innerHTML = '';
    document.getElementById('bottom')!.innerHTML = '<button data-action="itemMenu" data-arg="7"></button>';
    expect(spotNode({ type: 'attachItem', arg: 'powerCharm@7' })).toBe(document.querySelector('#bottom [data-action="itemMenu"]'));
    expect(refusalSpot({ type: 'attachItem', arg: 'powerCharm@8' }, vis)).toEqual({ at: 'slot' });
  });
  test('a combine refusal (notEvolved among them) sits over the pressed row, not over a shut one', () => {
    document.body.innerHTML = STAGE_HTML;
    document.getElementById('left')!.innerHTML = '<button data-action="combine" data-arg="jangdok@7"></button>';
    expect(spotNode({ type: 'combine', arg: 'jangdok@7' })).toBe(document.querySelector('#left [data-action="combine"]'));
    document.getElementById('left')!.innerHTML = '<button data-action="combine" data-arg="jangdok@7" disabled></button>';
    expect(refusalSpot({ type: 'combine', arg: 'jangdok@7' }, vis)).toEqual({ at: 'slot' });
    document.getElementById('win-left')!.innerHTML = '<button data-action="combine" data-arg="jangdok@7"></button>';
    expect(refusalSpot({ type: 'combine', arg: 'jangdok@7' }, vis)).toMatchObject({ at: 'win', side: 'left' });
    expect(rejectText('notEvolved')).toBe('진화부적을 붙여야 합니다');
  });
});

describe('no shop, no tab', () => {
  test('stage 1 has no item line, menu or tab', () => {
    document.body.innerHTML = STAGE_HTML;
    const s = createGame(loadGameData(), 1);
    placeUnitForTest(s, s.data.units.find(u => u.grade === 1)!.id, 0);
    const html = panel(s, 0, null);
    expect(html).not.toContain('attachItem');
    expect(html).not.toContain('unit-item');
    expect(unitCard(s, 0)!.item).toBeNull();
    expect(itemShort(s, 0)).toBeNull();
    const scene = new FakeScene();
    mountUi(new GameDriver(s), scene as never);
    scene.select!(0);
    expect(document.getElementById('left')!.innerHTML).not.toContain('attachItem');
    expect(document.getElementById('win-right')!.innerHTML).toBe('');
  });
  test('a market without a shop draws no tabs', () => {
    const s = openGame();
    const market = marketModel(mineOf(s), s)!;
    const { shop: _shop, ...noShop } = market;
    expect(econPanelHtml(noShop, null, false, WIN)).not.toContain('data-action="econTab"');
    expect(econPanelHtml(market, null, false, WIN)).toContain('data-action="econTab"');
  });
});
