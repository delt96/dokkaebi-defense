// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { combineOptions, helperModel } from '../src/ui/models';
import { materialChipHtml, materialChipsHtml } from '../src/ui/chips';
import { renderBottom, unitDetailsHtml, unitPanelHtml } from '../src/ui/panels';

const data = loadGameData();

describe('recipe materials', () => {
  test('each combine option lists its materials in recipe order, marking the ones on hand', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'bujigaengi', 0);
    const gamasot = combineOptions(s, 0).find(o => o.result === 'gamasot')!;
    expect(gamasot.materials).toEqual([
      { id: 'sotlid', name: '솥뚜껑', grade: 1, have: false },
      { id: 'bujigaengi', name: '부지깽이', grade: 1, have: true },
    ]);
  });

  test('a material needed twice is drawn twice; with one on hand only the first is marked', () => {
    const s = createGame({ ...data, recipes: [{ result: 'gamasot', materials: ['sotlid', 'sotlid'] }] }, 1);
    placeUnitForTest(s, 'sotlid', 0);
    expect(combineOptions(s, 0)[0]!.materials.map(m => [m.id, m.have])).toEqual([['sotlid', true], ['sotlid', false]]);
  });

  test('the helper lists the materials of every recipe it offers', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 0);
    placeUnitForTest(s, 'bujigaengi', 1);
    expect(helperModel(s)[0]!.materials.map(m => [m.id, m.have])).toEqual([['sotlid', true], ['bujigaengi', true]]);
  });
});

describe('material chips', () => {
  test('a chip on hand has a solid mark and its name under it', () => {
    const html = materialChipHtml({ id: 'sotlid', name: '솥뚜껑', grade: 1, have: true });
    expect(html).toContain('class="mat-chip have"');
    expect(html).toContain('sprites/sotlid.png');
    expect(html).toContain('<small>솥뚜껑</small>');
    expect(html).toContain('✓');
  });

  test('a missing chip is marked with ✗; a chip without a mark has neither', () => {
    expect(materialChipHtml({ id: 'sotlid', name: '솥뚜껑', grade: 1, have: false })).toMatch(/class="mat-chip lack".*✗/s);
    const plain = materialChipHtml({ id: 'sotlid', name: '솥뚜껑', grade: 1 });
    expect(plain).not.toMatch(/✓|✗/);
    expect(plain).toContain('class="mat-chip"');
  });

  test('a unit without a sprite falls back to the grade disc', () => {
    expect(materialChipHtml({ id: 'no-such-sprite', name: '없음', grade: 2, have: true })).toContain('stack-disc');
  });

  test('a link chip jumps to the material entry in the dex', () => {
    const html = materialChipHtml({ id: 'sotlid', name: '솥뚜껑', grade: 1 }, 'sotlid@gamasot');
    expect(html).toMatch(/^<button class="mat-chip dex-link" data-action="dexGo" data-arg="sotlid@gamasot"/);
  });

  test('the chip row ends with the extra cost text', () => {
    const html = materialChipsHtml([{ id: 'sotlid', name: '솥뚜껑', grade: 1, have: true }], '메밀묵 1개');
    expect(html).toMatch(/^<span class="mat-chips">/);
    expect(html).toContain('<span class="mat-cost">+ 메밀묵 1개</span>');
  });
});

describe('recipe rows', () => {
  const board = () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 0);
    placeUnitForTest(s, 'bujigaengi', 1);
    return s;
  };
  const dom = (html: string) => {
    const box = document.createElement('div');
    box.innerHTML = html;
    return box;
  };

  test('the solo card shows each recipe on two lines: result face, then material chips', () => {
    const box = dom(unitPanelHtml(board(), 1));
    const row = box.querySelector('.combine-options > button.recipe-row[data-action="combine"]')!;
    expect(row.querySelector('.recipe-top .unit-face img')!.getAttribute('src')).toContain('sprites/gamasot.png');
    expect(Array.from(row.querySelectorAll('.mat-chips .mat-chip.have small'), n => n.textContent)).toEqual(['솥뚜껑', '부지깽이']);
    expect(box.querySelector('.combine-missing .mat-chip.lack')).not.toBeNull();
  });

  test('the 상세 window uses the same two-line rows', () => {
    const box = dom(unitDetailsHtml(board(), 1));
    expect(box.querySelectorAll('.recipe-list .recipe-row .mat-chips').length).toBeGreaterThan(0);
  });

  test('the online bottom card keeps one line: the result face and missing names in words, no chips', () => {
    document.body.innerHTML = '<div id="bottom"></div>';
    renderBottom(board(), 1, true);
    const bottom = document.getElementById('bottom')!;
    expect(bottom.querySelector('.recipe-row .unit-face')).not.toBeNull();
    expect(bottom.querySelector('.mat-chips')).toBeNull();
    expect(bottom.textContent).toContain('부족');
  });
});
