// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from 'vitest';
import { createGame, loadGameData, unitDefFast } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { combineOptions, nextCombines } from '../src/ui/models';
import { renderBottom, soloPanelHtml, unitDetailsHtml } from '../src/ui/panels';
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

  test('modal, bottom card and the solo list show each result type', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 0);
    placeUnitForTest(s, 'bujigaengi', 1);
    const options = combineOptions(s, 0);
    expect(options.length).toBeGreaterThan(0);
    const expected = options.map(o => unitDefFast(data, o.result).damageType);
    const own = unitDefFast(data, s.slots[0]!.defId).damageType;

    const modal = unitDetailsHtml(s, 0);
    expect(types(modal)).toEqual([own, ...expected]);

    // solo the unit is in the left panel, online under the board; the panel draws the rows of the next list
    const solo = (slot: number | null) => soloPanelHtml(s, {
      selected: slot, list: nextCombines(s, { slot }), idleList: true, wPick: null, hover: null, showAllOne: false, skillOpen: false,
    });
    const rowTypes = (slot: number | null) => nextCombines(s, { slot }).rows.map(r => unitDefFast(data, r.result).damageType);
    setHtml(document.getElementById('left')!, solo(0));
    expect(types(document.getElementById('left')!.innerHTML)).toEqual([own, ...rowTypes(0)]);
    expect(document.querySelectorAll('#left .nc-list .type-badge').length).toBe(rowTypes(0).length);
    document.querySelectorAll('#left .nc-list .type-badge').forEach(b => expect(b.textContent).toHaveLength(1));
    renderBottom(s, 0, true);
    expect(types(document.getElementById('bottom')!.innerHTML)[0]).toBe(own);

    setHtml(document.getElementById('left')!, solo(null));
    expect(types(document.getElementById('left')!.innerHTML)).toEqual(rowTypes(null));
  });

  test('both types appear across the recipe results', () => {
    const results = new Set(data.recipes.map(r => unitDefFast(data, r.result).damageType));
    expect(results).toEqual(new Set(['physical', 'magical']));
  });
});
