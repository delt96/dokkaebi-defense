// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, loadGameData, type GameData } from '@dorandi/logic';
import { makeData, placeUnitForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { dexHtml } from '../src/ui/dex';
import { withRo } from '../src/ui/josa';
import { mountUi } from '../src/ui/mount';
import {
  boardUnits, costText, dexBack, dexEntries, dexFold, dexGo, dexNavStart, dexShows, dexToggle, recipeTree, treeSize, type RecipeNode,
} from '../src/ui/models';
import { STAGE_HTML, press } from './fixtures/net';

const d3 = loadGameData('stage3');
const d2 = loadGameData('stage2');

/** A tiny recipe book over real units: c = a + b (5냥), d = c + a + a (메밀묵 1개 · 60냥). */
function tiny(): { data: GameData; a: string; b: string; c: string; d: string } {
  const ofGrade = (g: number) => d3.units.filter(u => u.grade === g && !u.hidden).map(u => u.id);
  const [a, b] = ofGrade(1) as [string, string];
  const c = ofGrade(2)[0]!;
  const d = ofGrade(3)[0]!;
  const data = makeData(x => {
    x.recipes = [
      { result: c, materials: [a, b], cost: { coins: 5 } },
      { result: d, materials: [c, a, a], cost: { buckwheat: 1, coins: 60 } },
    ];
  }, 'stage3');
  return { data, a, b, c, d };
}

const marks = (nodes: RecipeNode[]): string[] => nodes.flatMap(n => [`${n.id}:${n.mark}`, ...marks(n.children).map(m => `  ${m}`)]);

describe('recipe tree', () => {
  test('units without a recipe (grade 1, hidden units) have no tree; every recipe unit has one', () => {
    for (const data of [d2, d3]) {
      for (const u of data.units) {
        const tree = recipeTree(data, u.id);
        expect(tree === null).toBe(!data.recipes.some(r => r.result === u.id));
        if (u.hidden) expect(tree).toBeNull();
      }
    }
    expect(d3.units.some(u => u.hidden)).toBe(true);
  });

  test('the tree goes down to units without a recipe and carries each node\'s own cost', () => {
    const walk = (data: GameData, nodes: RecipeNode[]): void => {
      for (const n of nodes) {
        const recipe = data.recipes.find(r => r.result === n.id);
        expect(n.cost).toBe(costText(recipe));
        expect(n.children.map(c => c.id)).toEqual(recipe?.materials ?? []);
        walk(data, n.children);
      }
    };
    for (const data of [d2, d3]) for (const r of data.recipes) walk(data, recipeTree(data, r.result)!);
    const { data, a, b, c } = tiny();
    const tree = recipeTree(data, tiny().d)!;
    expect(tree.map(n => n.id)).toEqual([c, a, a]);
    expect(tree[0]!.cost).toBe('엽전 5냥');
    expect(tree[1]!.cost).toBeNull();
    expect(tree[0]!.children.map(n => n.id)).toEqual([a, b]);
  });

  test('with an empty board everything is missing', () => {
    const { data, a, b, c, d } = tiny();
    expect(marks(recipeTree(data, d)!)).toEqual([`${c}:missing`, `  ${a}:missing`, `  ${b}:missing`, `${a}:missing`, `${a}:missing`]);
  });

  test('two of the same material need two board units, and one board unit fills one branch only', () => {
    const { data, a, b, c, d } = tiny();
    // one a: the top level takes it first, the second a and the a under c stay missing
    expect(marks(recipeTree(data, d, [a])!)).toEqual([`${c}:missing`, `  ${a}:missing`, `  ${b}:missing`, `${a}:have`, `${a}:missing`]);
    expect(marks(recipeTree(data, d, [a, a])!)).toEqual([`${c}:missing`, `  ${a}:missing`, `  ${b}:missing`, `${a}:have`, `${a}:have`]);
    expect(marks(recipeTree(data, d, [a, a, a, b])!)).toEqual([`${c}:missing`, `  ${a}:have`, `  ${b}:have`, `${a}:have`, `${a}:have`]);
  });

  test('a material on the board covers its whole branch', () => {
    const { data, a, b, c, d } = tiny();
    expect(marks(recipeTree(data, d, [c, a, b])!)).toEqual([`${c}:have`, `  ${a}:covered`, `  ${b}:covered`, `${a}:have`, `${a}:missing`]);
  });

  test('real data: 귀교 목수 lists 톱·끌·자 and marks them from the board, locked units excluded', () => {
    const tree = recipeTree(d3, 'bihyeongrang')!;
    expect(tree.map(n => n.name)).toEqual(['톱', '끌', '자']);
    expect(tree[0]!.cost).toBe('메밀묵 1개');
    const s = createGame(d3, 1);
    placeUnitForTest(s, 'kkeul', 0);
    placeUnitForTest(s, 'ja', 1);
    placeUnitForTest(s, 'ja', 2).locked = true;
    expect(boardUnits(s)).toEqual(['kkeul', 'ja']);
    const marked = recipeTree(d3, 'bihyeongrang', boardUnits(s))!;
    expect(marked.map(n => n.mark)).toEqual(['missing', 'have', 'have']);
    // 끌's own materials are not needed any more; the 자 inside 끌 is not counted twice
    expect(marked[1]!.children.every(n => n.mark === 'covered')).toBe(true);
  });
});

describe('dex link navigation', () => {
  test('a link focuses the target and remembers where it came from; back restores it', () => {
    let nav = dexNavStart('6');
    nav = dexGo(d3, nav, 'top', 'bihyeongrang');
    expect(nav).toMatchObject({ filter: 'all', query: '', focus: 'top', back: [{ id: 'bihyeongrang', filter: '6', query: '' }] });
    nav = dexGo(d3, { ...nav, focus: null }, 'jige', 'top');
    expect(nav.back.map(b => b.id)).toEqual(['bihyeongrang', 'top']);
    nav = dexBack(nav);
    expect(nav).toMatchObject({ filter: 'all', focus: 'top', back: [{ id: 'bihyeongrang' }] });
    nav = dexBack(nav);
    expect(nav).toMatchObject({ filter: '6', query: '', focus: 'bihyeongrang', back: [] });
    expect(dexBack(nav)).toBe(nav);
  });

  test('the filter and search change only when they would hide the target', () => {
    const top = dexEntries(d3).find(e => e.id === 'top')!;
    // a grade filter that already shows the target stays
    expect(dexGo(d3, dexNavStart('5'), 'top', 'bihyeongrang').filter).toBe('5');
    // a search that matches the target (by a material name) stays; one that does not is dropped before the filter
    expect(dexShows(d3, top, '5', '지게')).toBe(true);
    expect(dexGo(d3, { ...dexNavStart('5'), query: '지게' }, 'top', 'bihyeongrang')).toMatchObject({ filter: '5', query: '지게' });
    expect(dexGo(d3, { ...dexNavStart('5'), query: '귀교' }, 'top', 'bihyeongrang')).toMatchObject({ filter: '5', query: '' });
    // the filter goes back to 전체 and keeps a search that still shows the target
    expect(dexGo(d3, { ...dexNavStart('hidden'), query: '지게' }, 'top', 'bihyeongrang')).toMatchObject({ filter: 'all', query: '지게' });
    expect(dexGo(d3, { ...dexNavStart('6'), query: '귀교' }, 'top', 'bihyeongrang')).toMatchObject({ filter: 'all', query: '' });
  });

  test('stage 1-2 data has no filter to change; unknown targets change nothing; history keeps the last ten', () => {
    const nav = dexNavStart();
    const first = d2.recipes[0]!;
    expect(dexGo(d2, nav, first.materials[0]!, first.result)).toMatchObject({ filter: 'all', focus: first.materials[0] });
    expect(dexGo(d3, nav, 'nope', 'top')).toBe(nav);
    let long = nav;
    for (let i = 0; i < 12; i++) long = dexGo(d3, long, 'top', i % 2 ? 'kkeul' : 'ja');
    expect(long.back).toHaveLength(10);
  });

  test('trees open and close per entry and stay open across links', () => {
    let nav = dexToggle(dexNavStart(), 'bihyeongrang');
    nav = dexToggle(nav, 'gildal');
    expect(nav.open).toEqual(['bihyeongrang', 'gildal']);
    nav = dexGo(d3, nav, 'top', 'bihyeongrang');
    expect(dexToggle(nav, 'bihyeongrang').open).toEqual(['gildal']);
  });

  test('으로/로 after the unit name on the back button', () => {
    expect(withRo('귀교 목수')).toBe('귀교 목수로');
    expect(withRo('톱')).toBe('톱으로');
    expect(withRo('실')).toBe('실로');
    expect(withRo('천년 징')).toBe('천년 징으로');
  });
});

describe('dex html', () => {
  test('material names link to their entries; only recipe units get the tree toggle', () => {
    const html = dexHtml(d3, undefined, '6');
    expect(html).toContain('data-action="dexGo" data-arg="top@bihyeongrang">톱</button>');
    const rows = html.split('<tr data-dex-id=').slice(1);
    for (const row of rows) {
      const id = row.slice(1, row.indexOf('"', 1));
      expect(row.includes('data-action="dexTree"')).toBe(d3.recipes.some(r => r.result === id));
    }
    expect(dexHtml(d2)).toContain('data-action="dexGo"');
  });

  test('an open tree shows marks, costs and links back to its entry, and the back button names the last step', () => {
    const html = dexHtml(d3, undefined, 'all', '', 1, {
      open: ['bihyeongrang'], board: ['kkeul'], back: [{ id: 'bihyeongrang', filter: '6', query: '' }],
    });
    const tree = html.slice(html.indexOf('dex-tree-box'), html.indexOf('dex-skill', html.indexOf('dex-tree-box')));
    expect(tree).toContain('<li class="missing"><div class="node"><span class="mark missing"');
    expect(tree).toContain('<li class="have">');
    expect(tree).toContain('data-arg="jige@bihyeongrang">지게</button>');
    expect(tree).toContain('+ 메밀묵 1개');
    expect(html).toContain('aria-expanded="true">재료 접기 ▴');
    expect(html).toContain('<button class="dex-back" data-action="dexBack">← 귀교 목수로</button>');
    expect(dexHtml(d3)).not.toContain('dex-back');
  });

  test('a ✓ material keeps its own materials folded until its branch is unfolded; ✗ branches stay open', () => {
    const kkeul = recipeTree(d3, 'bihyeongrang', ['kkeul'])![1]!;
    const n = treeSize(kkeul);
    expect(n).toBeGreaterThan(0);
    const folded = dexHtml(d3, undefined, '6', '', 1, { open: ['bihyeongrang'], board: ['kkeul'] });
    expect(folded).toContain(`data-action="dexFold" data-arg="bihyeongrang:1" aria-expanded="false">▸ 하위 ${n}개</button>`);
    expect(folded).not.toContain('<li class="covered">');
    // the missing 톱 branch shows down to grade 1
    expect(folded).toContain('data-arg="jige@bihyeongrang">지게</button>');
    expect(folded).toContain('✓ 보드에 있음 · ✗ 없음 · ▸ 하위 재료 펼치기');
    const open = dexHtml(d3, undefined, '6', '', 1, { open: ['bihyeongrang'], board: ['kkeul'], unfold: ['bihyeongrang:1'] });
    expect(open).toContain(`aria-expanded="true">▾ 하위 ${n}개</button>`);
    expect(open.match(/<li class="covered">/g)).toHaveLength(n);
    // only ✓ nodes fold: nothing to fold on an empty board
    expect(dexHtml(d3, undefined, '6', '', 1, { open: ['bihyeongrang'] })).not.toContain('dexFold');
  });

  test('folding is per branch and toggles back', () => {
    let nav = dexFold(dexNavStart(), 'bihyeongrang:1');
    nav = dexFold(nav, 'gildal:0.2');
    expect(nav.unfold).toEqual(['bihyeongrang:1', 'gildal:0.2']);
    expect(dexFold(nav, 'bihyeongrang:1').unfold).toEqual(['gildal:0.2']);
    expect(recipeTree(d3, 'bihyeongrang')![1]!.children.map(c => c.path)).toEqual(['1.0', '1.1']);
  });
});

class FakeScene {
  selectedId: number | null = null;
  reduceEffects = false;
  onFrame?: () => void;
  onSelect(): void {}
  onEvents(): void {}
}

describe('dex links in the mounted ui', () => {
  beforeEach(() => { document.body.innerHTML = STAGE_HTML; localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  test('a link switches the filter, the back button returns, and the tree marks the board', () => {
    const s = createGame(d3, 1);
    placeUnitForTest(s, 'ja', 0);
    mountUi(new GameDriver(s), new FakeScene() as never);
    const modal = document.getElementById('modal')!;
    press(document.querySelector('[data-action="openDex"]'));
    press(modal.querySelector('[data-action="dexFilter"][data-arg="6"]'));
    press(modal.querySelector('[data-action="dexTree"][data-arg="bihyeongrang"]'));
    const treeRow = modal.querySelector('tr[data-dex-id="bihyeongrang"] .dex-tree-box')!;
    expect(Array.from(treeRow.querySelector('.dex-tree')!.children).map(li => li.className)).toEqual(['missing', 'missing', 'have']);
    press(modal.querySelector('tr[data-dex-id="bihyeongrang"] .dex-tree [data-action="dexGo"][data-arg="top@bihyeongrang"]'));
    expect(modal.querySelector('[data-action="dexFilter"][aria-pressed="true"]')!.getAttribute('data-arg')).toBe('all');
    expect(modal.querySelector('tr[data-dex-id="top"]')!.classList.contains('dex-flash')).toBe(true);
    expect(modal.querySelector('.dex-back')!.textContent).toBe('← 귀교 목수로');
    expect(document.activeElement).toBe(modal.querySelector('.dex-back'));
    press(modal.querySelector('.dex-back'));
    expect(modal.querySelector('[data-action="dexFilter"][aria-pressed="true"]')!.getAttribute('data-arg')).toBe('6');
    expect(modal.querySelector('.dex-back')).toBeNull();
    // the tree is still open where it was left
    expect(modal.querySelector('tr[data-dex-id="bihyeongrang"] .dex-tree-box')).not.toBeNull();
  });

  test('an unfolded ✓ branch stays unfolded when a board change redraws the tree', () => {
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const s = createGame(d3, 1);
    placeUnitForTest(s, 'kkeul', 0);
    const scene = new FakeScene();
    mountUi(new GameDriver(s), scene as never);
    const modal = document.getElementById('modal')!;
    press(document.querySelector('[data-action="openDex"]'));
    press(modal.querySelector('[data-action="dexFilter"][data-arg="6"]'));
    press(modal.querySelector('[data-action="dexTree"][data-arg="bihyeongrang"]'));
    const box = () => modal.querySelector('tr[data-dex-id="bihyeongrang"] .dex-tree-box')!;
    expect(box().querySelector('li.covered')).toBeNull();
    press(box().querySelector('[data-action="dexFold"][data-arg="bihyeongrang:1"]'));
    expect(box().querySelector('li.covered')).not.toBeNull();
    expect(document.activeElement).toBe(box().querySelector('.dex-fold'));
    // a new board unit changes the marks (자 now ✓): the redraw keeps the branch open
    placeUnitForTest(s, 'ja', 1);
    clock += 200;
    scene.onFrame!();
    expect(box().querySelector('.dex-tree')!.lastElementChild!.className).toBe('have');
    expect(box().querySelector('[data-arg="bihyeongrang:1"]')!.getAttribute('aria-expanded')).toBe('true');
    press(box().querySelector('[data-action="dexFold"][data-arg="bihyeongrang:1"]'));
    expect(box().querySelector('li.covered')).toBeNull();
  });
});
