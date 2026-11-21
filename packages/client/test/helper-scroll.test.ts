// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from 'vitest';
import { createGame, loadGameData, step } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { helperModel } from '../src/ui/models';
import { renderHelper } from '../src/ui/helper';
import { setHtml } from '../src/ui/dom';

function stateWithStoredMaterials() {
  const s = createGame(loadGameData(), 1);
  placeUnitForTest(s, 'sotlid', 4);
  placeUnitForTest(s, 'bujigaengi', 2);
  step(s, [{ type: 'store', slot: 2 }]);
  return s;
}

describe('combine helper list', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="left"></div>'; });

  test('one row per recipe, and a recipe made from storage has no extra note line', () => {
    const s = stateWithStoredMaterials();
    expect(helperModel(s)[0]).toMatchObject({ recipe: 'gamasot', stored: 1 });
    renderHelper(s, true);
    const rows = document.querySelectorAll('#left ul.helper li');
    expect(rows).toHaveLength(helperModel(s).length);
    expect(document.querySelector('#left .combine-stored')).toBeNull();
    expect(document.querySelector('#left ul.helper li small')).toBeNull();
    expect(document.querySelector('#left button[data-action="combine"]')).not.toBeNull();
  });

  test('the list keeps its scroll position when the panel is redrawn', () => {
    const left = document.getElementById('left')!;
    const list = (n: number) => `<button>t</button><ul class="helper">${'<li>x</li>'.repeat(n)}</ul>`;
    setHtml(left, list(10));
    left.querySelector<HTMLElement>('.helper')!.scrollTop = 80;
    setHtml(left, list(11));
    expect(left.querySelectorAll('.helper li')).toHaveLength(11);
    expect(left.querySelector<HTMLElement>('.helper')!.scrollTop).toBe(80);
  });
});
