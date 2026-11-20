import { describe, expect, test, vi } from 'vitest';
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
      { result: 'hwaro', name: '화로', grade: 2, missing: ['호롱'], key: null },
      { result: 'hwaetbul', name: '횃불', grade: 2, missing: [], key: 'X' },
      { result: 'meongseok', name: '멍석', grade: 2, missing: [], key: 'C' },
      { result: 'jeolgu', name: '절구', grade: 2, missing: [], key: null },
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

test('the card and physical keys combine at the selected slot while the helper uses the default slot', () => {
  const s = createGame(data, 1);
  placeUnitForTest(s, 'sotlid', 0);
  placeUnitForTest(s, 'bujigaengi', 3);
  const driver = new GameDriver(s);
  const queue = vi.spyOn(driver, 'queue');
  const events = new EventTarget();
  const panels = new Map<string, EventTarget & { innerHTML: string; classList: { toggle: () => void } }>();
  let select: (slot: number) => void = () => {};
  const scene = { onSelect: (cb: typeof select) => { select = cb; }, onEvents: () => {} };
  const press = (code: string, modifiers: Partial<KeyboardEvent> = {}) => {
    events.dispatchEvent(Object.assign(new Event('keydown'), { code, key: 'Process', ...modifiers }));
  };
  const click = (panel: string, dataArg: string) => {
    const button = { dataset: { action: 'combine', arg: dataArg }, hasAttribute: () => false };
    const node = Object.assign(panels.get(panel)!, { closest: () => button });
    node.dispatchEvent(Object.assign(new Event('pointerdown'), { button: 0 }));
  };
  vi.useFakeTimers();
  vi.stubGlobal('window', events);
  vi.stubGlobal('document', {
    getElementById: (id: string) => {
      if (!panels.has(id)) panels.set(id, Object.assign(new EventTarget(), {
        innerHTML: '', classList: { toggle: () => {} }, contains: () => true,
      }));
      return panels.get(id);
    },
  });

  try {
    mountUi(driver, scene as never);
    select(3);
    const card = panels.get('bottom')!;
    expect(card.innerHTML).toContain('data-action="combine" data-arg="gamasot@3">[Z] 가마솥</button>');
    expect(card.innerHTML).toContain('화로 (모자람: 호롱)');
    expect(card.innerHTML).toContain('data-action="sell" data-arg="3"');
    click('bottom', 'gamasot@3');
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
    expect(card.innerHTML).toContain('<b>가마솥</b>');
    expect(card.innerHTML).toContain('data-action="sell" data-arg="3"');
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

import { rightModel, rejectText } from '../src/ui/models';

describe('final review fixes: right panel and reject notices', () => {
  const unit = (id: number) => ({ id, defId: 'sotlid', cooldown: 0, attackCount: 0, periodic: [] });
  test('summon is disabled when no open cell is free, convert is not', () => {
    const s = createGame(data, 1);
    expect(rightModel(s)).toMatchObject({ canSummon: true, canConvert: true, pending: 0 });
    s.open.forEach((o, i) => { if (o) s.slots[i] = unit(i + 1); });
    expect(rightModel(s)).toMatchObject({ canSummon: false, canConvert: true });
  });
  test('stored pity units are counted', () => {
    const s = createGame(data, 1);
    s.pendingPity.push('bitjaru', 'japgwi' as never);
    expect(rightModel(s).pending).toBe(2);
  });
  test('the bonus countdown starts over at each grade-one summon threshold', () => {
    const s = createGame(data, 1);
    const interval = data.balance.pityEvery;
    for (const [summons, remaining] of [[0, interval], [interval - 1, 1], [interval, interval], [interval + 3, interval - 3]]) {
      s.grade1Summons = summons!;
      expect(rightModel(s).bonusIn).toBe(remaining);
    }
  });
  test('the right panel shows the remaining summons and the bonus countdown', () => {
    const s = createGame(data, 1);
    s.tokens = 3;
    s.grade1Summons = 3;
    const panel = { innerHTML: '' };
    vi.stubGlobal('document', { getElementById: () => panel });
    try {
      renderRight(s);
      expect(panel.innerHTML).toContain('도깨비불 (뽑기)');
      expect(panel.innerHTML).toContain('>뚝딱! (3번)</button>');
      expect(panel.innerHTML).toContain('보너스까지 1등급 4번');
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
