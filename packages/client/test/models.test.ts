import stageHtml from '../index.html?raw';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createGame, loadGameData, step } from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { mountUi } from '../src/ui/mount';
import { combineOptions, hudModel, helperModel, upgradeRows, unitCard, dexEntries } from '../src/ui/models';
import { renderRight } from '../src/ui/panels';

const data = loadGameData();

describe('ui models', () => {
  test('hud', () => {
    const s = createGame(data, 1);
    expect(hudModel(s).roundText).toBe('준비');
    for (let i = 0; i < 401; i++) step(s, []);
    expect(hudModel(s)).toMatchObject({ roundText: '1 / 20 라운드', enemyText: '우리 고개 잡귀 1 / 60' });
    expect(hudModel(s).secondsLeft).toBe(40);
  });
  test('helper and card', () => {
    const s = createGame(data, 1);
    s.slots[0] = { id: 1, defId: 'sotlid', cooldown: 0, attackCount: 0, periodic: [] };
    s.slots[1] = { id: 2, defId: 'bujigaengi', cooldown: 0, attackCount: 0, periodic: [] };
    expect(helperModel(s)).toEqual([{ recipe: 'gamasot', name: '가마솥', grade: 2 }]);
    expect(unitCard(s, 0)).toMatchObject({ name: '솥뚜껑', grade: 1, typeText: '물딜', skillText: '20% 스턴 0.5초', usedIn: ['가마솥', '장독'], sellPrice: 5 });
    expect(unitCard(s, 5)).toBeNull();
  });
  test('combine options show Korean material names and assign keys only to the first three ready recipes', () => {
    const s = createGame({
      ...data,
      recipes: [
        ...data.recipes.filter(r => r.result !== 'meongseok' && r.result !== 'jeolgu'),
        { result: 'meongseok', materials: ['bujigaengi', 'jipsin'] },
        { result: 'jeolgu', materials: ['bujigaengi', 'jipsin'] },
      ],
    }, 1);
    placeUnitForTest(s, 'sotlid', 0);
    placeUnitForTest(s, 'jipsin', 1);
    placeUnitForTest(s, 'bujigaengi', 3);

    expect(combineOptions(s, 3)).toEqual([
      { result: 'gamasot', name: '가마솥', grade: 2, missing: [], key: 'Z' },
      { result: 'hwaetbul', name: '횃불', grade: 2, missing: [], key: 'X' },
      { result: 'meongseok', name: '멍석', grade: 2, missing: [], key: 'C' },
      { result: 'jeolgu', name: '절구', grade: 2, missing: [], key: null },
      { result: 'hwaro', name: '화로', grade: 2, missing: ['호롱'], key: null },
    ]);
    expect(combineOptions(s, 2)).toEqual([]);
  });
  test('upgrade rows', () => {
    const s = createGame(data, 1); s.coins = 30; s.upgrades.slots = 3;
    const rows = upgradeRows(s);
    expect(rows.map(r => r.label)).toEqual(['물딜 강화', '마딜 강화', '등급 손질', '칸 늘리기']);
    expect(rows[0]).toMatchObject({ level: 0, cost: 25, affordable: true });
    expect(rows[3]).toMatchObject({ cost: null, affordable: false });
  });
  test('dex has 22 entries with recipes for grade 2+', () => {
    const d = dexEntries(data);
    expect(d.length).toBe(22);
    expect(d.find(x => x.id === 'daljip')!.recipe).toEqual(['쥐불', '횃불', '청사초롱']);
    expect(d.find(x => x.id === 'sotlid')!.recipe).toEqual([]);
  });
});

import { resultModel } from '../src/ui/models';
test('result model', () => {
  const s = createGame(data, 1); forceRound(s, 10);
  for (let i = 0; i < 1501; i++) step(s, []);
  s.helperOpens = 3;
  const m = resultModel(s, 'gamasot');
  expect(m).toMatchObject({ title: '탈락', reasonText: '고개 보스를 놓쳤습니다', roundReached: 10, bestUnit: { name: '가마솥', grade: 2 }, helperText: '도우미 3회' });
  expect(m.series.length).toBe(s.stats.length);
});

function mountTestUi(s: ReturnType<typeof createGame>, onRestart?: () => void) {
  const driver = new GameDriver(s);
  const queue = vi.spyOn(driver, 'queue');
  const events = new EventTarget();
  const panels = new Map<string, EventTarget & { innerHTML: string; classList: { toggle: () => void } }>();
  let select: (slot: number) => void = () => {};
  const scene = { onFrame: () => {}, onSelect: (cb: typeof select) => { select = cb; }, onEvents: () => {} };
  const press = (code: string, modifiers: Partial<KeyboardEvent> = {}) => {
    events.dispatchEvent(Object.assign(new Event('keydown'), { code, key: 'Process', ...modifiers }));
  };
  const click = (panel: string, dataArg: string, action = 'combine', keyboard = false) => {
    const button = { dataset: { action, arg: dataArg }, hasAttribute: () => false };
    const node = Object.assign(panels.get(panel)!, { closest: () => button });
    node.dispatchEvent(Object.assign(new Event(keyboard ? 'click' : 'pointerdown'), { button: 0, detail: keyboard ? 0 : 1 }));
  };
  vi.useFakeTimers();
  vi.stubGlobal('window', events);
  vi.stubGlobal('document', {
    getElementById: (id: string) => {
      if (!panels.has(id)) panels.set(id, Object.assign(new EventTarget(), {
        innerHTML: '', querySelector: () => null, classList: { toggle: () => {} }, contains: () => true,
      }));
      return panels.get(id);
    },
  });

  const ui = mountUi(driver, scene as never, { onRestart });
  return { driver, queue, press, click, panels, select, scene, ui };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('the card and physical keys combine at the selected slot while the helper uses the default slot', () => {
  const s = createGame(data, 1);
  placeUnitForTest(s, 'sotlid', 0);
  const chosen = placeUnitForTest(s, 'bujigaengi', 3);
  const { driver, queue, press, click, panels, select, scene } = mountTestUi(s);
  select(3);
  const card = panels.get('bottom')!;
  expect(card.innerHTML).toContain(`data-action="combine" data-arg="gamasot@${chosen.id}">[Z] 가마솥</button>`);
  expect(card.innerHTML).toContain('화로 (모자람: 호롱)');
  expect(card.innerHTML).toContain(`data-action="sell" data-arg="${chosen.id}"`);
  click('bottom', `gamasot@${chosen.id}`);
  expect(queue).toHaveBeenLastCalledWith({ type: 'combine', result: 'gamasot', slot: 3 });
  press('KeyQ');
  expect(panels.get('left')!.innerHTML).toContain('data-arg="gamasot"');
  click('left', 'gamasot');
  expect(queue).toHaveBeenLastCalledWith({ type: 'combine', result: 'gamasot' });

  driver.reset(s);
  queue.mockClear();
  press('KeyZ', { ctrlKey: true });
  press('KeyZ', { altKey: true });
  press('KeyZ', { metaKey: true });
  press('KeyX');
  expect(queue).not.toHaveBeenCalled();
  press('KeyZ');
  expect(queue).toHaveBeenCalledExactlyOnceWith({ type: 'combine', result: 'gamasot', slot: 3 });
  driver.update(s.data.balance.tickMs);
  vi.advanceTimersByTime(100);
  scene.onFrame();
  expect(card.innerHTML).toContain('<b>가마솥</b>');
  expect(card.innerHTML).toContain(`data-action="sell" data-arg="${s.slots[3]!.id}"`);
});

test('Z uses the recipe shown on the card until it refreshes', () => {
  const s = createGame(data, 1);
  placeUnitForTest(s, 'sotlid', 0);
  placeUnitForTest(s, 'bujigaengi', 1);
  placeUnitForTest(s, 'bujigaengi', 3);
  placeUnitForTest(s, 'horong', 4);
  const { select, click, driver, press, panels } = mountTestUi(s);
  select(1);
  press('KeyQ');
  click('left', 'gamasot');
  driver.update(50);
  expect(panels.get('bottom')!.innerHTML).toContain('[Z] 가마솥');
  press('KeyZ');
  driver.update(50);
  expect(s.slots[1]?.defId).toBe('bujigaengi');
  expect(s.slots[4]?.defId).toBe('horong');
});

test('a stale sell button cannot sell the combine result', () => {
  const s = createGame(data, 1);
  placeUnitForTest(s, 'sotlid', 0);
  placeUnitForTest(s, 'bujigaengi', 3);
  const { select, click, driver, press, panels } = mountTestUi(s);
  select(3);
  const sale = panels.get('bottom')!.innerHTML.match(/data-action="sell" data-arg="(\d+)"/)![1]!;
  press('KeyZ');
  driver.update(50);
  click('bottom', sale, 'sell');
  driver.update(50);
  expect(s.slots[3]?.defId).toBe('gamasot');
  expect(s.coins).toBe(0);
});

test('modal keys preserve resources and keyboard activation closes the dialog', () => {
  const s = createGame(data, 1);
  placeUnitForTest(s, 'sotlid', 0);
  placeUnitForTest(s, 'bujigaengi', 3);
  const { select, click, driver, press, panels, queue } = mountTestUi(s);
  select(3);
  click('left', '', 'openDex');
  for (const key of ['KeyZ', 'Space', 'Digit1', 'KeyP', 'KeyQ']) press(key);
  expect(queue).not.toHaveBeenCalled();
  expect(driver.paused).toBe(false);
  click('modal', '', 'closeModal', true);
  expect(panels.get('modal')!.innerHTML).toBe('');
  press('KeyZ');
  expect(queue).toHaveBeenCalledTimes(1);
});

test('moving then combining before a render selects the result', () => {
  const s = createGame(data, 1);
  placeUnitForTest(s, 'sotlid', 0);
  placeUnitForTest(s, 'bujigaengi', 3);
  const { select, driver, press, scene, panels } = mountTestUi(s);
  select(0);
  driver.queue({ type: 'move', from: 0, to: 2 });
  press('KeyZ');
  driver.update(100);
  vi.advanceTimersByTime(100);
  scene.onFrame();
  expect(s.slots[2]?.defId).toBe('gamasot');
  expect(panels.get('bottom')!.innerHTML).toContain('<b>가마솥</b>');
});

test('paused helper opens are counted on resume and discarded on restart', () => {
  const s = createGame(data, 1);
  const { driver, press, ui } = mountTestUi(s);
  press('KeyP');
  for (let i = 0; i < 4; i++) press('KeyQ');
  press('KeyP');
  driver.update(50);
  expect(s.helperOpens).toBe(2);
  press('KeyP');
  press('KeyQ');
  driver.reset(createGame(data, 2));
  ui.resetUi();
  driver.update(50);
  expect(driver.state.helperOpens).toBe(0);
});

test('ready recipes precede missing materials on the card', () => {
  const s = createGame(data, 1);
  placeUnitForTest(s, 'ki', 0);
  placeUnitForTest(s, 'hwaro', 1);
  placeUnitForTest(s, 'buchae', 2);
  const { select, panels } = mountTestUi(s);
  select(0);
  const html = panels.get('bottom')!.innerHTML;
  expect(html).toContain('[Z] 풀무');
  expect(html.indexOf('[Z] 풀무')).toBeLessThan(html.indexOf('절구 (모자람'));
});

import { activeNotice, nextUnitId, selectedSlot, rightModel, rejectText } from '../src/ui/models';

describe('final review fixes: right panel and reject notices', () => {
  const unit = (id: number) => ({ id, defId: 'sotlid', cooldown: 0, attackCount: 0, periodic: [] });
  test('summon is disabled when no open cell is free, convert is not', () => {
    const s = createGame(data, 1);
    expect(rightModel(s)).toEqual({ canSummon: true, canConvert: true });
    s.open.forEach((o, i) => { if (o) s.slots[i] = unit(i + 1); });
    expect(rightModel(s)).toMatchObject({ canSummon: false, canConvert: true });
  });
  test('the summon tooltip follows the lane round and explains when grade 3 opens', () => {
    const s = createGame(data, 1);
    s.tokens = 3;
    s.grade1Summons = 3;
    const panel = { innerHTML: '' };
    vi.stubGlobal('document', { getElementById: () => panel });
    try {
      renderRight(s);
      expect(panel.innerHTML).toContain('도깨비불 (뽑기)');
      expect(panel.innerHTML).toContain('>뚝딱! (3번)</button>');
      expect(panel.innerHTML).toContain('1등급 85% · 2등급 15% · 3등급 0% (3등급은 5라운드부터)');
      s.round = 5;
      renderRight(s);
      expect(panel.innerHTML).toContain('1등급 77% · 2등급 20% · 3등급 3%');
      expect(panel.innerHTML).not.toContain('보너스까지');
      expect(panel.innerHTML).not.toContain('보관 중');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  test('reject reasons the player caused get a message, stale clicks stay silent', () => {
    expect(rejectText('noSlot')).toBe('빈 칸이 없습니다');
    expect(rejectText('noToken')).toBe('도깨비불이 없습니다');
    expect(rejectText('noCoins')).toBe('엽전이 모자랍니다');
    expect(rejectText('maxed')).toBe('이미 최대 단계입니다');
    expect(rejectText('missingMaterials')).toBe('재료가 모자랍니다');
    expect(rejectText('noUnit')).toBeNull();
    expect(rejectText('ended')).toBeNull();
  });
});

test('selection follows a swapped unit, cycles in board order and clears on sale', () => {
  const state = createGame(data, 1);
  expect(nextUnitId(state, null)).toBeNull();
  const first = placeUnitForTest(state, 'sotlid', 1);
  const second = placeUnitForTest(state, 'sotlid', 5);
  step(state, [{ type: 'move', from: 1, to: 5 }]);
  expect(selectedSlot(state, first.id)).toBe(5);
  expect(nextUnitId(state, null)).toBe(second.id);
  expect(nextUnitId(state, second.id)).toBe(first.id);
  expect(nextUnitId(state, first.id)).toBe(second.id);
  step(state, [{ type: 'sell', slot: 5 }]);
  expect(selectedSlot(state, first.id)).toBeNull();
});

test('notice expires at its deadline', () => {
  const notice = { text: '빈 칸이 없습니다', until: 1500 };
  expect(activeNotice(notice, 1499)).toBe(notice.text);
  expect(activeNotice(notice, 1500)).toBeNull();
  expect(activeNotice(null, 0)).toBeNull();
});

test('card reflects attack upgrades and a nearby speed aura', () => {
  const state = createGame(data, 1);
  placeUnitForTest(state, 'sotlid', 0);
  expect(unitCard(state, 0)).toMatchObject({ attack: 13, interval: 1.2, range: 1.5 });
  state.upgrades.physical = 2;
  placeUnitForTest(state, 'cheongsachorong', 1);
  expect(unitCard(state, 0)!.attack).toBeGreaterThan(13);
  expect(unitCard(state, 0)!.interval).toBe(1.1);
});

test('the crash banner offers an in-game restart', () => {
  const restart = vi.fn();
  const { click, driver, queue, press } = mountTestUi(createGame(data, 1), restart);
  driver.failed = true;
  click('right', '', 'summon');
  press('Space');
  expect(queue).not.toHaveBeenCalled();
  const errorMarkup = stageHtml.split('id="error"')[1]!.split('</div>')[0]!;
  expect(errorMarkup).toContain('data-action="restart"');
  click('error', '', 'restart');
  expect(restart).toHaveBeenCalledOnce();
});
