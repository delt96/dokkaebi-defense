// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { nextCombines, type NextList } from '../src/ui/models';
import { nextListHtml, type ListOpts } from '../src/ui/next-list';
import { unitFaceHtml } from '../src/ui/storage';
import { helperPopHtml } from '../src/ui/helper';
import { gradeShape } from '../src/layout';
import { MOCK_TARGET, mockBoardState } from './fixtures/next-board';

const d3 = loadGameData('stage3');

function dom(html: string): HTMLElement {
  const box = document.createElement('div');
  box.innerHTML = html;
  return box;
}

const opts = (o: Partial<ListOpts> = {}): ListOpts => ({ unitId: null, wPick: null, hover: null, showAllOne: false, ...o });
const titles = (box: HTMLElement) => Array.from(box.querySelectorAll('.next-group'), g => g.querySelector('.next-title')!.textContent);
const rowOf = (box: HTMLElement, id: string) => box.querySelector(`[data-recipe="${id}"]`)!;

function jipsinScope() {
  const s = mockBoardState();
  const list = nextCombines(s, { target: MOCK_TARGET, slot: 0 });
  return { s, list, id: s.slots[0]!.id };
}

describe('group titles and legends', () => {
  test('target, ready and one-short titles in order, the target one in gold', () => {
    const s = mockBoardState();
    const box = dom(nextListHtml(s, nextCombines(s, { target: MOCK_TARGET }), opts()));
    expect(titles(box)).toEqual(['목표 · 연자방아', '지금 가능', '1개 부족']);
    const groups = box.querySelectorAll('.next-group');
    expect(groups[0]!.classList.contains('target')).toBe(true);
    expect(groups[1]!.classList.contains('target')).toBe(false);
    expect(groups[1]!.textContent).toContain('나눠 씀');
    expect(groups[1]!.querySelector('.next-legend')!.getAttribute('title')).toBe('위 조합을 먼저 하면 이 재료가 빕니다');
    expect(groups[2]!.textContent).toContain('만들 수 있음');
  });

  test('without a target there is no target title', () => {
    const s = mockBoardState();
    const box = dom(nextListHtml(s, nextCombines(s), opts()));
    expect(titles(box)).toEqual(['지금 가능', '1개 부족']);
  });
});

describe('rows', () => {
  test('a ready row that uses the selected unit combines with it and carries its key', () => {
    const { s, list, id } = jipsinScope();
    const box = dom(nextListHtml(s, list, opts({ unitId: id })));
    const row = box.querySelector('button[data-recipe="didilbangga"]')!;
    expect(row.getAttribute('data-action')).toBe('combine');
    expect(row.getAttribute('data-arg')).toBe(`didilbangga@${id}`);
    expect(row.textContent!.trimStart().startsWith('[Z]')).toBe(true);
  });

  test('in the all scope a row the selected unit is not in combines without it', () => {
    const s = mockBoardState();
    const id = s.slots[0]!.id;
    const box = dom(nextListHtml(s, nextCombines(s, { target: MOCK_TARGET, slot: 0, scope: 'all' }), opts({ unitId: id })));
    expect(rowOf(box, 'pulmu').getAttribute('data-arg')).toBe('pulmu');
    expect(rowOf(box, 'didilbangga').getAttribute('data-arg')).toBe(`didilbangga@${id}`);
  });

  test('a one-short row is a text row that opens the dex', () => {
    const { s, list, id } = jipsinScope();
    const box = dom(nextListHtml(s, list, opts({ unitId: id })));
    expect(box.querySelector('span.recipe-row.combine-missing[data-action="dexOpen"][data-arg="saekkijul"]')).not.toBeNull();
  });

  test('result faces carry the grade shape', () => {
    const { s, list, id } = jipsinScope();
    const box = dom(nextListHtml(s, list, opts({ unitId: id })));
    expect(rowOf(box, 'didilbangga').querySelector('.recipe-top .unit-face .gshape.s')).not.toBeNull();
    expect(rowOf(box, 'meongseok').querySelector('.recipe-top .unit-face .gshape.c')).not.toBeNull();
  });
});

describe('shared and makeable chips', () => {
  test('a chip an upper row takes is marked ⇄ and names those rows', () => {
    const { s, list, id } = jipsinScope();
    const box = dom(nextListHtml(s, list, opts({ unitId: id })));
    const chip = rowOf(box, 'baneul').querySelector('.mat-chip[data-taken]')!;
    expect(chip.getAttribute('aria-label')).toBe('짚신, 위 조합과 나눔');
    expect(chip.getAttribute('title')).toBe('짚신: 디딜방아·멍석이 먼저 씀');
    expect(chip.getAttribute('data-taken')).toBe('didilbangga meongseok');
    expect(chip.querySelector('.mat-mark svg')).not.toBeNull();
    expect(chip.textContent).not.toMatch(/[✓✗]/);
  });

  test('the online helper names the taking rows in Korean too', () => {
    const box = dom(helperPopHtml(mockBoardState()));
    const titles = Array.from(box.querySelectorAll('.mat-chip[data-taken]'), c => c.getAttribute('title')!);
    expect(titles.length).toBeGreaterThan(0);
    for (const t of titles) expect(t).not.toMatch(/[a-z]/);
  });

  test('a missing chip a ready recipe yields is marked ▲', () => {
    const { s, list, id } = jipsinScope();
    const box = dom(nextListHtml(s, list, opts({ unitId: id })));
    const chip = rowOf(box, 'saekkijul').querySelector('.mat-chip.lack.make')!;
    expect(chip.getAttribute('aria-label')).toBe('둥구미, 지금 만들 수 있음');
    expect(chip.querySelector('.mat-mark svg')).not.toBeNull();
  });
});

describe('one-short folding, far line and empty lists', () => {
  test('the all scope shows four one-short rows and a more button', () => {
    const s = mockBoardState();
    const list = nextCombines(s, { target: MOCK_TARGET });
    const one = list.rows.filter(r => r.group === 'one').length;
    expect(one).toBeGreaterThan(4);
    const box = dom(nextListHtml(s, list, opts()));
    expect(box.querySelectorAll('.next-one .recipe-row')).toHaveLength(4);
    const more = box.querySelector('button.next-more[data-action="nextMore"]')!;
    expect(more.textContent).toBe(`+${one - 4}개 더`);
    const open = dom(nextListHtml(s, list, opts({ showAllOne: true })));
    expect(open.querySelectorAll('.next-one .recipe-row')).toHaveLength(one);
    expect(open.querySelector('.next-more')).toBeNull();
  });

  test('the unit scope folds recipes two or more short into one line', () => {
    const s = createGame(d3, 1);
    placeUnitForTest(s, 'jipsin', 0);
    const list = nextCombines(s, { slot: 0 });
    const box = dom(nextListHtml(s, list, opts({ unitId: s.slots[0]!.id })));
    expect(box.querySelector('.next-far')!.textContent).toBe(`재료 2개 이상 모자람 ${list.far.length}개 · 상세(Tab)`);
    expect(list.far.length).toBe(4);
  });

  test('nothing ready in the all scope says how to get materials', () => {
    const s = createGame(d3, 1);
    const box = dom(nextListHtml(s, nextCombines(s), opts()));
    expect(box.querySelector('.next-empty')!.textContent).toBe('지금 만들 수 있는 조합이 없습니다 · Space로 뽑아 재료를 모으세요');
    expect(titles(box)).not.toContain('지금 가능');
  });

  test('an empty unit scope points to the all scope with the mode key', () => {
    const s = createGame(d3, 1);
    const empty: NextList = { scope: 'unit', rows: [], far: [], counts: { unit: 0, all: 0 }, target: null };
    expect(dom(nextListHtml(s, empty, opts({ unitId: 1 }))).querySelector('.next-empty')!.textContent)
      .toBe('이 유닛이 들어가는 조합이 지금은 없습니다 · Q로 전체 보기');
    expect(dom(nextListHtml(s, empty, opts({ unitId: 1, online: true }))).querySelector('.next-empty')!.textContent)
      .toBe('이 유닛이 들어가는 조합이 지금은 없습니다 · Shift+Q로 전체 보기');
  });
});

describe('W pick and hover classes', () => {
  test('the W row is outlined; the hovered row and the rows that take its chips are marked', () => {
    const { s, list, id } = jipsinScope();
    const box = dom(nextListHtml(s, list, opts({ unitId: id, wPick: 'didilbangga', hover: 'baneul' })));
    expect(rowOf(box, 'didilbangga').classList.contains('w-pick')).toBe(true);
    expect(rowOf(box, 'baneul').classList.contains('hov')).toBe(true);
    for (const peer of ['didilbangga', 'meongseok']) expect(rowOf(box, peer).classList.contains('peer')).toBe(true);
    expect(rowOf(box, 'baneul').classList.contains('peer')).toBe(false);
    expect(box.querySelectorAll('.w-pick')).toHaveLength(1);
  });
});

describe('grade shapes', () => {
  test('grades 1-2 circle, 3-4 square, 5-6 diamond', () => {
    expect([1, 2, 3, 4, 5, 6].map(gradeShape)).toEqual(['c', 'c', 's', 's', 'd', 'd']);
  });

  test('unitFaceHtml adds the shape only when asked', () => {
    expect(dom(unitFaceHtml('gamasot', '가마솥', 5, true)).querySelector('.unit-face .gshape.d')).not.toBeNull();
    expect(unitFaceHtml('gamasot', '가마솥', 5)).not.toContain('gshape');
  });
});

describe('style', () => {
  test('new list buttons get the gold 2px focus ring', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/ui/style.css'), 'utf8');
    const rule = css.split('}').find(r => r.includes('.next-list button:focus-visible'));
    expect(rule).toBeDefined();
    expect(rule).toContain('outline: 2px solid var(--accent)');
  });
});
