// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { mountUi } from '../src/ui/mount';
import { renderBottom, soloPanelHtml } from '../src/ui/panels';
import { nextCombines } from '../src/ui/models';
import { key, press, STAGE_HTML } from './fixtures/net';

const d3 = loadGameData('stage3');

/** The solo left panel as mount draws it: the selected unit's scope, or the whole list with nothing selected. */
const soloHtml = (s: ReturnType<typeof createGame>, slot: number | null) => soloPanelHtml(s, {
  selected: slot, list: nextCombines(s, { slot }), idleList: true, wPick: null, hover: null, showAllOne: false, skillOpen: false,
});

describe('the selected unit card stores grades 1-2 one at a time', () => {
  beforeEach(() => { document.body.innerHTML = STAGE_HTML; });

  test('the solo panel shows 보관 (title A) for grade 1 and nothing for grade 3', () => {
    const s = createGame(d3, 1);
    const low = placeUnitForTest(s, 'sotlid', 0);
    placeUnitForTest(s, 'samtaegi', 1);
    const div = document.createElement('div');
    div.innerHTML = soloHtml(s, 0);
    const button = div.querySelector('[data-action="store"]');
    expect(button?.textContent).toBe('보관');
    expect(button?.getAttribute('title')).toBe('A');
    expect(button?.getAttribute('data-arg')).toBe(String(low.id));
    div.innerHTML = soloHtml(s, 1);
    expect(div.querySelector('[data-action="store"]')).toBeNull();
  });

  test('the online card has the button and the help line names A only for a storable unit', () => {
    const s = createGame(d3, 1);
    placeUnitForTest(s, 'sotlid', 0);
    placeUnitForTest(s, 'samtaegi', 1);
    renderBottom(s, 0, true, null);
    expect(document.querySelector('#bottom [data-action="store"]')?.textContent).toBe('보관(A)');
    renderBottom(s, 0, false, 'B 장터');
    expect(document.getElementById('bottom')!.textContent).toBe(
      'Z/X/C 조합(판에 짝 표시) · S 판매 · A 보관 · R 지게 · Tab 상세 · M 옮기기 · W 다음 조합 · Esc 해제');
    renderBottom(s, 1, false, 'B 장터');
    expect(document.getElementById('bottom')!.textContent).not.toContain('A 보관');
  });

  const mounted = (defId: string) => {
    const s = createGame(d3, 1);
    placeUnitForTest(s, defId, 3);
    const driver = new GameDriver(s);
    const queue = vi.spyOn(driver, 'queue');
    let select: (slot: number | null) => void = () => {};
    mountUi(driver, { selectedId: null, onSelect(f: typeof select) { select = f; }, onEvents() {} } as never);
    select(3);
    return { driver, queue };
  };

  test('A and the button queue a store for the selected unit', () => {
    const { queue } = mounted('sotlid');
    key('KeyA');
    expect(queue).toHaveBeenLastCalledWith({ type: 'store', slot: 3 });
    queue.mockClear();
    press(document.querySelector('[data-action="store"]'));
    expect(queue).toHaveBeenLastCalledWith({ type: 'store', slot: 3 });
  });

  // the command refuses grade 3+ with notStorable, the same refusal (and notice) as dropping the unit on storage
  test('A on a grade 3 unit sends the store and the unit stays on the board', () => {
    const { driver, queue } = mounted('samtaegi');
    key('KeyA');
    expect(queue).toHaveBeenLastCalledWith({ type: 'store', slot: 3 });
    driver.update(50);
    expect(driver.state.slots[3]?.defId).toBe('samtaegi');
  });
});
