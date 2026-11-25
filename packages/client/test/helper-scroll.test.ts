// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from 'vitest';
import { createGame, loadGameData, step } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { helperModel, nextCombines } from '../src/ui/models';
import { soloPanelHtml } from '../src/ui/panels';
import { setHtml } from '../src/ui/dom';

function stateWithStoredMaterials() {
  const s = createGame(loadGameData(), 1);
  placeUnitForTest(s, 'sotlid', 4);
  placeUnitForTest(s, 'bujigaengi', 2);
  step(s, [{ type: 'store', slot: 2 }]);
  return s;
}

const solo = (s: ReturnType<typeof createGame>) => soloPanelHtml(s, {
  selected: null, list: nextCombines(s), idleList: true, wPick: null, hover: null, showAllOne: false, skillOpen: false,
});

describe('the whole next list in the solo panel', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="left"></div>'; });

  test('one row per recipe, and a recipe made from storage has no extra note line', () => {
    const s = stateWithStoredMaterials();
    expect(helperModel(s)[0]).toMatchObject({ recipe: 'gamasot', stored: 1 });
    setHtml(document.getElementById('left')!, solo(s));
    const rows = document.querySelectorAll('#left .nc-list button.recipe-row');
    expect(rows).toHaveLength(helperModel(s).length);
    expect(document.querySelector('#left .combine-stored')).toBeNull();
    expect(document.querySelector('#left button[data-action="combine"]')).not.toBeNull();
  });

  test('the solo list keeps its scroll position while its scope and unit stay, and starts at the top for another', () => {
    const left = document.getElementById('left')!;
    const list = (key: string, n: number) => `<div class="nc-list" data-scroll-key="${key}">${'<p>x</p>'.repeat(n)}</div>`;
    setHtml(left, list('all:', 10));
    left.querySelector<HTMLElement>('.nc-list')!.scrollTop = 80;
    setHtml(left, list('all:', 11));
    expect(left.querySelector<HTMLElement>('.nc-list')!.scrollTop).toBe(80);
    setHtml(left, list('unit:7', 11));
    expect(left.querySelector<HTMLElement>('.nc-list')!.scrollTop).toBe(0);
  });

  test('the online helper list keeps its scroll position when the panel is redrawn', () => {
    const left = document.getElementById('left')!;
    const list = (n: number) => `<button>t</button><ul class="helper">${'<li>x</li>'.repeat(n)}</ul>`;
    setHtml(left, list(10));
    left.querySelector<HTMLElement>('.helper')!.scrollTop = 80;
    setHtml(left, list(11));
    expect(left.querySelectorAll('.helper li')).toHaveLength(11);
    expect(left.querySelector<HTMLElement>('.helper')!.scrollTop).toBe(80);
  });
});
