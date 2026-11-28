// @vitest-environment happy-dom
import { createGame, laneOf, loadGameData, step } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { expect, test, vi } from 'vitest';
import { GameDriver } from '../src/driver';
import { mountUi } from '../src/ui/mount';
import { attackRangeText, combineOptions, pinnedTarget, unitSkillText } from '../src/ui/models';
import { storageInfoHtml, storageInfoModel } from '../src/ui/storage';
import { key, press, STAGE_HTML } from './fixtures/net';

const d3 = loadGameData('stage3');

test('attack range is shown in board cells, so it matches the ring on a board with smaller cells too', () => {
  const unit = d3.units.find(u => u.skills.some(s => s.effects.some(e => e.kind === 'auraAttackSpeed')))!;
  expect(laneOf({ data: d3 }).pitch).toBe(1);
  expect(attackRangeText(d3, unit.range)).toBe(`${unit.range}칸`);
  expect(unitSkillText(d3, unit)).toContain(`주변 ${d3.balance.auraRadius}칸`);
  const small = structuredClone(d3);
  small.balance.grid = { ...small.balance.grid, cols: 8, frame: { cols: 6, rows: 4 } };
  const pitch = laneOf({ data: small }).pitch;
  expect(pitch).toBe(0.75);
  // combat measures path units: 3 of them span 4 of the smaller cells
  expect(attackRangeText(small, 3)).toBe('4칸');
  expect(attackRangeText(small, 2.5)).toBe('3.3칸');
});

test('all recipes sort by readiness then missing material count, with cost gaps and stored materials', () => {
  const data = structuredClone(d3);
  const ids = ['gamasot', 'hwaro', 'meongseok', 'jangdok', 'jipsin'];
  data.recipes = [
    { result: ids[3]!, materials: ['ki', 'sotlid', 'sotlid'] },
    { result: ids[0]!, materials: ['ki', 'bujigaengi'], cost: { coins: 10 } },
    { result: ids[2]!, materials: ['ki', 'bujigaengi'] },
    { result: ids[1]!, materials: ['ki', 'ki'] },
    { result: ids[4]!, materials: ['ki', 'sotlid'], cost: { coins: 20 } },
  ];
  const state = createGame(data, 1);
  state.coins = 0;
  placeUnitForTest(state, 'bujigaengi', 1);
  step(state, [{ type: 'store', slot: 1 }]);
  placeUnitForTest(state, 'ki', 0);
  const list = combineOptions(state, 0);
  expect(list.map(r => [r.result, r.key, r.missing.length])).toEqual([
    [ids[2], 'Z', 0], [ids[0], null, 0], [ids[1], null, 1], [ids[4], null, 1], [ids[3], null, 2],
  ]);
  expect(list[3]!.short).toContain('20냥');
  expect(list[4]!.missing).toEqual(['솥뚜껑', '솥뚜껑']);
});

test('storage info follows the selected stack and its count', () => {
  const state = createGame(d3, 1);
  placeUnitForTest(state, 'ki', 0);
  placeUnitForTest(state, 'ki', 1);
  step(state, [{ type: 'storeAll' }]);
  expect(storageInfoModel(state, 'ki')).toMatchObject({ name: '키', count: 2, grade: 1, sellPrice: d3.balance.sellPrice[0] });
  expect(storageInfoModel(state, 'sotlid')).toBeNull();
});

test('a stored stack lists the combines it can make now, and the button combines out of storage', () => {
  const state = createGame(d3, 1);
  placeUnitForTest(state, 'jipsin', 0);
  step(state, [{ type: 'storeAll' }]);
  expect(storageInfoModel(state, 'jipsin')!.combines).toEqual([]);
  placeUnitForTest(state, 'jipsin', 0);
  step(state, [{ type: 'storeAll' }]);
  const info = storageInfoModel(state, 'jipsin')!;
  expect(info.combines.map(o => o.result)).toContain('dunggumi');
  expect(storageInfoHtml(state, info)).toContain('data-action="storageCombine" data-arg="dunggumi"');
  step(state, [{ type: 'combine', result: 'dunggumi' }]);
  expect(state.storage ?? []).toHaveLength(0);
  expect(state.slots.some(u => u?.defId === 'dunggumi')).toBe(true);
});

test('the pinned tree assigns inventory only once and prioritizes top-level materials', () => {
  const state = createGame(d3, 1);
  placeUnitForTest(state, 'sotlid', 0);
  placeUnitForTest(state, 'ki', 1);
  step(state, [{ type: 'store', slot: 1 }]);
  const target = pinnedTarget(d3, 'jangdok', state.slots, state.storage);
  expect(target?.location).toBe('missing');
  expect(target?.children.map(n => [n.id, n.location])).toEqual([
    ['gamasot', 'missing'], ['ki', 'storage'], ['sotlid', 'board'],
  ]);
  expect(target?.children[0]?.children[0]).toMatchObject({ id: 'sotlid', location: 'missing' });
  placeUnitForTest(state, 'jangdok', 2);
  expect(pinnedTarget(d3, 'jangdok', state.slots, state.storage)?.location).toBe('board');
});

test('pinning from details replaces the dex target, follows inventory, and survives Esc', () => {
  document.body.innerHTML = STAGE_HTML;
  const state = createGame(d3, 1);
  const unit = placeUnitForTest(state, 'ki', 0);
  const scene = { selectedId: unit.id, onSelect() {}, onEvents() {} };
  const driver = new GameDriver(state);
  const queue = vi.spyOn(driver, 'queue');
  mountUi(driver, scene as never);
  scene.selectedId = unit.id;
  const overlay = document.getElementById('target-overlay')!;
  key('KeyD');
  press(document.querySelector('[data-dex-id="gamasot"] .pin-btn'));
  key('Escape');
  expect(overlay.textContent).toContain('가마솥');
  key('Tab');
  press(document.querySelector('#win-left .pin-btn[data-arg="jangdok"]'));
  key('Escape');
  key('Escape');
  expect(overlay.querySelector('.target-head')!.textContent).toContain('장독');
  expect(overlay.querySelector('.target-material.target-board')!.getAttribute('title')).toContain('진영');
  step(state, [{ type: 'store', slot: 0 }]);
  key('Escape');
  const stored = overlay.querySelector('.target-material.target-storage')!;
  expect(stored.getAttribute('title')).toContain('보관함');
  // depth 1 is what 장독 takes itself; the title says so, and the name keeps its grade color
  expect(stored.getAttribute('title')).toMatch(/^바로 넣는 재료 · /);
  expect(stored.querySelector('b')!.getAttribute('style')).toMatch(/--g:#/);
  press(overlay.querySelector('[data-action="foldTarget"]'));
  expect(overlay.querySelector('.target-scroll')).toBeNull();
  press(overlay.querySelector('[data-action="clearTarget"]'));
  expect(overlay.textContent).toBe('');
  expect(queue).not.toHaveBeenCalled();
});

test('a redraw keeps the recipe list scroll for the same unit only, and stubbed nodes without querySelector still work', async () => {
  const { setHtml } = await import('../src/ui/dom');
  const node = document.createElement('div');
  const list = (unit: number) => `<div class="card-recipes"><div class="combine-options" data-scroll-key="${unit}">a</div></div><div class="helper">h</div>`;
  setHtml(node, list(1));
  node.querySelector<HTMLElement>('.combine-options')!.scrollTop = 30;
  node.querySelector<HTMLElement>('.helper')!.scrollTop = 12;
  setHtml(node, `${list(1)} `);
  expect(node.querySelector<HTMLElement>('.combine-options')!.scrollTop).toBe(30);
  expect(node.querySelector<HTMLElement>('.helper')!.scrollTop).toBe(12);
  setHtml(node, list(2));
  expect(node.querySelector<HTMLElement>('.combine-options')!.scrollTop).toBe(0);
  const stub = { innerHTML: '', querySelectorAll: () => [] } as unknown as HTMLElement;
  setHtml(stub, '<b>x</b>');
  expect(stub.innerHTML).toBe('<b>x</b>');
});

test("a details recipe shows the result's own spec against the selected unit, not the lost-control line", async () => {
  const { unitDetailsHtml } = await import('../src/ui/panels');
  const state = createGame(d3, 1);
  placeUnitForTest(state, 'jipsin', 0);
  const html = unitDetailsHtml(state, 0);
  expect(html).toContain('class="result-spec"');
  expect(html).toMatch(/공격력<\/i> \d+ → <b/);
  expect(html).not.toContain('조합하면 사라지는 제어');
});

test('a missing material whose own materials are all on hand is marked as makeable now', () => {
  const state = createGame(d3, 1);
  // the first 솥뚜껑 goes to 장독 itself (top-level materials come first), the second to 가마솥
  placeUnitForTest(state, 'sotlid', 0);
  placeUnitForTest(state, 'sotlid', 5);
  placeUnitForTest(state, 'bujigaengi', 1);
  const target = pinnedTarget(d3, 'jangdok', state.slots, state.storage)!;
  const gamasot = target.children.find(n => n.id === 'gamasot')!;
  expect(gamasot).toMatchObject({ location: 'missing', ready: true });
  expect(target.ready).toBe(false);
  expect(target.children.find(n => n.id === 'ki')).toMatchObject({ location: 'missing', ready: false });
  placeUnitForTest(state, 'gamasot', 2);
  placeUnitForTest(state, 'ki', 3);
  expect(pinnedTarget(d3, 'jangdok', state.slots, state.storage)!.ready).toBe(true);
});

test('the pinned tree tells board from storage by its mark, not only by color, and says what can be made now', () => {
  const state = createGame(d3, 1);
  placeUnitForTest(state, 'sotlid', 0);
  placeUnitForTest(state, 'sotlid', 5);
  placeUnitForTest(state, 'bujigaengi', 1);
  placeUnitForTest(state, 'ki', 2);
  step(state, [{ type: 'store', slot: 2 }]);
  document.body.innerHTML = '<div id="t"></div>';
  return import('../src/ui/target').then(({ targetHtml }) => {
    const root = document.getElementById('t')!;
    root.innerHTML = targetHtml(pinnedTarget(d3, 'jangdok', state.slots, state.storage)!, false);
    const mark = (cls: string) => root.querySelector(`.target-depth-1 > li > .target-material.${cls} i`)!.textContent;
    expect(mark('target-storage')).not.toBe(mark('target-board'));
    expect(root.querySelector('.target-legend')!.textContent).toContain(`${mark('target-storage')}보관`);
    const ready = root.querySelector('.target-depth-1 > li.ready')!;
    expect(ready.querySelector('.target-ready')!.textContent).toBe('지금 조합 가능');
    expect(ready.querySelector('.target-material')!.getAttribute('title')).toContain('지금 조합 가능');
    expect(root.querySelectorAll('.target-ready')).toHaveLength(1);
  });
});

test('the pinned tree names whose material a deeper node is', () => {
  const state = createGame(d3, 1);
  document.body.innerHTML = '<div id="t"></div>';
  return import('../src/ui/target').then(({ targetHtml }) => {
    const root = document.getElementById('t')!;
    root.innerHTML = targetHtml(pinnedTarget(d3, 'geumulbaneul', state.slots, state.storage)!, false);
    const deep = root.querySelector('.target-depth-2 .target-material')!;
    expect(deep.getAttribute('title')).toMatch(/^새끼줄의 재료 · /);
  });
});

test('a target whose materials are all on hand but which cannot be paid or is still shut says why instead of makeable now', () => {
  const state = createGame(d3, 1);
  placeUnitForTest(state, 'meok', 0);
  placeUnitForTest(state, 'jige', 1);
  state.buckwheat = 0;
  expect(pinnedTarget(d3, 'top', state.slots, state.storage, state)).toMatchObject({ ready: false, blocked: '메밀묵 1개 모자람' });
  state.buckwheat = 1;
  expect(pinnedTarget(d3, 'top', state.slots, state.storage, state)).toMatchObject({ ready: true, blocked: null });

  const tame = createGame(d3, 1);
  placeUnitForTest(tame, 'jinegaksi', 0);
  placeUnitForTest(tame, 'banjitgori', 1);
  tame.buckwheat = 5;
  tame.coins = 500;
  expect(pinnedTarget(d3, 'baekbalbaneulgaksi', tame.slots, tame.storage, tame)).toMatchObject({ ready: false, blocked: '진화 필요' });
  tame.slots[0]!.item = 'evolveCharm';
  expect(pinnedTarget(d3, 'baekbalbaneulgaksi', tame.slots, tame.storage, tame)).toMatchObject({ ready: true, blocked: null });

  state.buckwheat = 0;
  return import('../src/ui/target').then(({ targetHtml }) => {
    document.body.innerHTML = '<div id="t"></div>';
    const root = document.getElementById('t')!;
    root.innerHTML = targetHtml(pinnedTarget(d3, 'top', state.slots, state.storage, state)!, false);
    expect(root.querySelector('.target-ready')).toBeNull();
    expect(root.querySelector('.target-blocked')!.textContent).toBe('재료 다 있음 · 메밀묵 1개 모자람');
  });
});
