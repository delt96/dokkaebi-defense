import stageHtml from '../index.html?raw';
import { resultHtml } from '../src/ui/result';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createGame, loadGameData, step } from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { mountUi } from '../src/ui/mount';
import { combineOptions, hudModel, helperModel, upgradeRows, unitCard, dexEntries } from '../src/ui/models';
import { renderRight } from '../src/ui/panels';
import { renderHud } from '../src/ui/hud';
import { settingsHtml } from '../src/ui/settings';

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
    expect(helperModel(s).map(noMats)).toEqual([{ recipe: 'gamasot', name: '가마솥', grade: 2 }]);
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

    expect(combineOptions(s, 3).map(noMats)).toEqual([
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

const textOf = (html: string) => html.replace(/<[^>]+>/g, '');

function mountTestUi(s: ReturnType<typeof createGame>, onRestart?: () => void, onHome?: () => void) {
  const driver = new GameDriver(s);
  const queue = vi.spyOn(driver, 'queue');
  const events = new EventTarget();
  const panels = new Map<string, EventTarget & { innerHTML: string; classList: { toggle: () => void } }>();
  let select: (slot: number) => void = () => {};
  const scene = { onFrame: () => {}, onSelect: (cb: typeof select) => { select = cb; }, onEvents: () => {} };
  const press = (code: string, modifiers: Partial<KeyboardEvent> = {}) => {
    const { target, ...rest } = modifiers;
    const ev = Object.assign(new Event('keydown'), { code, key: 'Process', ...rest });
    if (target) Object.defineProperty(ev, 'target', { value: target });
    events.dispatchEvent(ev);
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
        innerHTML: '', querySelector: () => null, querySelectorAll: () => [], classList: { toggle: () => {} }, contains: () => true,
      }));
      return panels.get(id);
    },
  });

  const ui = mountUi(driver, scene as never, { onRestart, onHome });
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
  const card = panels.get('left')!;
  expect(card.innerHTML).toContain(`data-action="combine" data-arg="gamasot@${chosen.id}" class="recipe-row">`);
  expect(textOf(card.innerHTML)).toMatch(/\[Z\] 가마솥 [물마]/);
  expect(card.innerHTML).toContain('<b>화로</b> <span class="type-badge');
  expect(card.innerHTML).toContain('class="mat-chip lack" title="호롱 없음"');
  expect(card.innerHTML).toContain(`data-action="sell" data-arg="${chosen.id}"`);
  click('left', `gamasot@${chosen.id}`);
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
  expect(textOf(panels.get('left')!.innerHTML)).toContain('[Z] 가마솥');
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
  const sale = panels.get('left')!.innerHTML.match(/data-action="sell" data-arg="(\d+)"/)![1]!;
  press('KeyZ');
  driver.update(50);
  click('left', sale, 'sell');
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
  // solo the open dex stops the clock; P is ignored behind it
  expect(driver.paused).toBe(true);
  click('modal', '', 'closeModal', true);
  expect(panels.get('modal')!.innerHTML).toBe('');
  expect(driver.paused).toBe(false);
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
  expect(panels.get('left')!.innerHTML).toContain('<b>가마솥</b>');
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
  const html = panels.get('left')!.innerHTML;
  expect(textOf(html)).toContain('[Z] 풀무');
  expect(html.indexOf('<b>풀무</b>')).toBeLessThan(html.indexOf('class="recipe-row combine-missing"'));
});

import { activeNotice, nextUnitId, selectedSlot, rightModel, rejectText } from '../src/ui/models';

// the material chips are tested in recipe-chips.test.ts
const noMats = <T extends { materials: unknown }>({ materials: _m, ...rest }: T) => rest;

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
    const panel = { innerHTML: '', querySelectorAll: () => [], classList: { toggle: () => {} } };
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
      // no dim 도우미 or 배속 buttons; the settings gear lives in the top bar
      expect(panel.innerHTML).not.toContain('data-action="speed"');
      expect(panel.innerHTML).not.toContain('data-action="toggleHelper"');
      expect(panel.innerHTML).not.toContain('data-action="openSettings"');
      const top = { ...panel, innerHTML: '' };
      vi.stubGlobal('document', { getElementById: (id: string) => (id === 'top' ? top : panel) });
      renderHud(s, false);
      expect(top.innerHTML).toMatch(/<button class="settings-open" data-action="openSettings" aria-label="설정"[^>]*>/);
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

test('the solo result offers 다시 하기 and a way back to the first screen', () => {
  const restart = vi.fn();
  const home = vi.fn();
  const s = createGame(data, 1);
  const { click } = mountTestUi(s, restart, home);
  s.phase = 'ended';
  s.result = { outcome: 'defeat', reason: 'limit', round: 3 };
  const html = resultHtml(s, null);
  expect(html).toContain('data-action="restart"');
  expect(html).toContain('<button class="big" data-action="home">처음 화면으로</button>');
  click('modal', '', 'home');
  expect(home).toHaveBeenCalledOnce();
  expect(restart).not.toHaveBeenCalled();
});

describe('upgrade window keys', () => {
  const buys = (q: { mock: { calls: unknown[][] } }) => q.mock.calls.filter(c => (c[0] as { type: string }).type === 'upgrade');

  test('E opens and closes the window, Esc closes it, and nothing pauses', () => {
    const { press, panels, driver } = mountTestUi(createGame(data, 1));
    const modal = () => panels.get('modal')!.innerHTML;
    expect(modal()).toBe('');
    press('KeyE');
    expect(modal()).toContain('class="upgrades"');
    expect(modal()).toContain('E·Esc 닫기');
    press('KeyE');
    expect(modal()).toBe('');
    press('KeyE');
    press('Escape');
    expect(modal()).toBe('');
    expect(driver.paused).toBe(false);
  });

  test('digits buy only while the window is open', () => {
    const s = createGame(data, 1); s.coins = 1000;
    const { press, queue, driver } = mountTestUi(s);
    for (const key of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) press(key);
    expect(buys(queue)).toHaveLength(0);
    press('KeyE');
    press('Digit1'); press('Digit2'); press('Digit3'); press('Digit4');
    expect(buys(queue).map(c => (c[0] as { id: string }).id)).toEqual(['physical', 'magical', 'polish', 'slots']);
    press('KeyE');
    queue.mockClear();
    press('Digit1');
    expect(buys(queue)).toHaveLength(0);
    expect(driver.paused).toBe(false);
  });

  test('E and digits are ignored while typing or composing', () => {
    const s = createGame(data, 1); s.coins = 1000;
    const { press, queue, panels } = mountTestUi(s);
    const input = { tagName: 'INPUT', isContentEditable: false, closest: (sel: string) => (sel.includes('input') ? input : null) };
    press('KeyE', { target: input as never });
    expect(panels.get('modal')!.innerHTML).toBe('');
    press('KeyE', { isComposing: true });
    expect(panels.get('modal')!.innerHTML).toBe('');
    press('KeyE');
    press('Digit1', { target: input as never });
    press('Digit1', { isComposing: true });
    expect(buys(queue)).toHaveLength(0);
  });

  test('labels show the key', () => {
    const { panels } = mountTestUi(createGame(data, 1));
    expect(panels.get('right')!.innerHTML).toContain('강화 (E)');
    expect(panels.get('bottom')!.innerHTML).toContain('E 강화');
  });
});

describe('dex hotkey', () => {
  test('D opens and closes the dex, Esc closes it', () => {
    const { press, panels, driver } = mountTestUi(createGame(data, 1));
    const modal = () => panels.get('modal')!.innerHTML;
    press('KeyD');
    expect(modal()).toContain('class="dex"');
    press('KeyD');
    expect(modal()).toBe('');
    press('KeyD');
    press('Escape');
    expect(modal()).toBe('');
    expect(driver.paused).toBe(false);
  });

  test('D does not replace another window and is ignored while typing or composing', () => {
    const { press, panels } = mountTestUi(createGame(data, 1));
    const input = { tagName: 'INPUT', isContentEditable: false, closest: (sel: string) => (sel.includes('input') ? input : null) };
    press('KeyD', { target: input as never });
    press('KeyD', { isComposing: true });
    expect(panels.get('modal')!.innerHTML).toBe('');
    press('KeyE');
    press('KeyD');
    expect(panels.get('modal')!.innerHTML).toContain('class="upgrades"');
  });

  test('labels show the key', () => {
    const { panels } = mountTestUi(createGame(data, 1));
    expect(panels.get('right')!.innerHTML).toContain('도감 (D)');
    expect(panels.get('bottom')!.innerHTML).toContain('D 도감');
  });
});

describe('settings window', () => {
  const rows = (html: string) => Array.from(html.matchAll(/<div class="settings-row"[^>]*><span>([^<]+)<\/span>/g)).map(m => m[1]);
  const pressed = (html: string) => Array.from(html.matchAll(/data-action="(\w+)" data-arg="(\w+)" aria-pressed="true"/g)).map(m => `${m[1]}:${m[2]}`);

  test('solo: helper, speed and reduce-effects rows show the current choice', () => {
    const html = settingsHtml({ helper: false, speed: 1, reducedFx: false, help: true });
    expect(html).toContain('설정');
    expect(rows(html)).toEqual(['조합 도우미', '배속', '효과 줄이기', '도움말']);
    expect(pressed(html)).toEqual(['setHelper:off', 'speed:1', 'setFx:off', 'setHelp:on']);
    expect(html).toContain('data-action="closeModal"');
    expect(pressed(settingsHtml({ helper: true, speed: 3, reducedFx: true, help: false }))).toEqual(['setHelper:on', 'speed:3', 'setFx:on', 'setHelp:off']);
    expect(Array.from(html.matchAll(/data-action="speed" data-arg="\d"[^>]*>([^<]+)</g)).map(m => m[1])).toEqual(['1×', '2×', '3×']);
  });

  test('online: no speed row', () => {
    const html = settingsHtml({ helper: true, reducedFx: false, help: true });
    expect(rows(html)).toEqual(['조합 도우미', '효과 줄이기', '도움말']);
    expect(html).not.toContain('data-action="speed"');
  });
});

test('S sells grades 1-2 at once; grade 3 and up asks for a second press within 2 seconds', () => {
  const s = createGame(data, 1);
  placeUnitForTest(s, 'sotlid', 0);
  const high = placeUnitForTest(s, 'daljip', 3);
  const { select, press, panels, queue } = mountTestUi(s);
  select(0);
  press('KeyS');
  expect(queue).toHaveBeenLastCalledWith({ type: 'sell', slot: 0 });
  queue.mockClear();
  select(3);
  press('KeyS');
  expect(queue).not.toHaveBeenCalled();
  expect(panels.get('left')!.innerHTML).toContain(`data-arg="${high.id}" class="armed">한 번 더 누르면 판매 +`);
  press('KeyS');
  expect(queue).toHaveBeenCalledExactlyOnceWith({ type: 'sell', slot: 3 });
  queue.mockClear();
  press('KeyS');
  vi.advanceTimersByTime(2001);
  press('KeyS');
  expect(queue).not.toHaveBeenCalled();
});

test('a P pause outlives opening and closing the dex; the other windows never pause', () => {
  const s = createGame(data, 1);
  const { driver, press, click } = mountTestUi(s);
  click('left', '', 'openUpgrades');
  expect(driver.paused).toBe(false);
  click('modal', '', 'closeModal', true);
  press('KeyP');
  expect(driver.paused).toBe(true);
  press('KeyD');
  expect(driver.paused).toBe(true);
  press('KeyD');
  expect(driver.paused).toBe(true);
  press('KeyP');
  expect(driver.paused).toBe(false);
});
