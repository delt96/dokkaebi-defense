// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from 'vitest';
import { createGame, loadGameData, unitDefFast } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { combineOptions, helperModel } from '../src/ui/models';
import { renderHelper } from '../src/ui/helper';
import { renderBottom, unitDetailsHtml, unitPanelHtml } from '../src/ui/panels';
import { setHtml } from '../src/ui/dom';
import { typeBadgeHtml } from '../src/ui/badge';

const data = loadGameData();
const types = (html: string): string[] => [...html.matchAll(/data-type="(\w+)"/g)].map(m => m[1]!);

describe('type badge', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="left"></div><div id="bottom"></div>'; });

  test('reads the type from data, full word or one character', () => {
    const physical = data.units.find(u => u.damageType === 'physical')!;
    const magical = data.units.find(u => u.damageType === 'magical')!;
    expect(typeBadgeHtml(data, physical.id)).toContain('>물딜<');
    expect(typeBadgeHtml(data, magical.id)).toContain('>마딜<');
    expect(typeBadgeHtml(data, magical.id, true)).toContain('>마<');
    expect(typeBadgeHtml(data, physical.id)).toContain('class="type-badge physical"');
  });

  test('modal, bottom card and helper rows show each result type', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 0);
    placeUnitForTest(s, 'bujigaengi', 1);
    const options = combineOptions(s, 0);
    expect(options.length).toBeGreaterThan(0);
    const expected = options.map(o => unitDefFast(data, o.result).damageType);
    const own = unitDefFast(data, s.slots[0]!.defId).damageType;

    const modal = unitDetailsHtml(s, 0);
    expect(types(modal)).toEqual([own, ...expected]);

    // solo the card is in the left panel, online under the board
    setHtml(document.getElementById('left')!, unitPanelHtml(s, 0));
    expect(types(document.getElementById('left')!.innerHTML)).toEqual([own, ...expected]);
    expect(document.querySelectorAll('#left .combine-options .type-badge').length).toBe(expected.length);
    document.querySelectorAll('#left .combine-options .type-badge').forEach(b => expect(b.textContent).toHaveLength(1));
    renderBottom(s, 0, true);
    expect(types(document.getElementById('bottom')!.innerHTML)[0]).toBe(own);

    renderHelper(s, true);
    expect(types(document.getElementById('left')!.innerHTML)).toEqual(helperModel(s).map(i => unitDefFast(data, i.recipe).damageType));
  });

  test('both types appear across the recipe results', () => {
    const results = new Set(data.recipes.map(r => unitDefFast(data, r.result).damageType));
    expect(results).toEqual(new Set(['physical', 'magical']));
  });
});
