// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { createGame, econView, loadGameData, unitAttack, unitDefFast, type EconMine, type GameState } from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { econPanelHtml, marketModel, shopModel } from '../src/ui/econ';
import { combineOptions, helperModel, itemShort, nextCombines, rejectText, unitCard } from '../src/ui/models';
import { renderBottom, soloPanelHtml } from '../src/ui/panels';
import { STAGE_HTML } from './fixtures/net';

const d3 = loadGameData('stage3');
const CHARM = 'evolveCharm';
const PAIR = d3.recipes.find(r => r.kind === 'tame')!;
const TAMED = PAIR.materials[0]!;
const MULT = d3.economy!.tame!.targets.find(t => t.unit === TAMED)!.evolvedMult!;
const NEEDS = '진화부적을 붙여야 합니다';
const NEEDS_SHORT = '진화 필요';

/** The solo left panel with `slot` selected, or the whole next list (the old helper) with nothing selected. */
const panel = (s: GameState, slot: number | null, shop = econView(s)?.shop ?? null) => soloPanelHtml(s, {
  selected: slot, list: nextCombines(s, slot === null ? {} : { slot }), idleList: true, wPick: null, hover: null, showAllOne: false, skillOpen: false, shop,
});
const WIN = { wins: 'outside', bar: '', historyOpen: false, historyCount: 0 } as const;

function openGame(round = 20): GameState {
  const s = createGame(d3, 3);
  forceRound(s, round);
  s.econ!.marketOpen = true;
  return s;
}
const mineOf = (s: GameState): EconMine => ({ ...econView(s)!, team: null });
const row = (s: GameState) => shopModel(mineOf(s), s.coins, s.buckwheat)!.find(r => r.id === CHARM)!;

describe('the evolve charm row', () => {
  test('price reads 묵 1 · 60냥 and the effect names the tamed units', () => {
    const s = openGame();
    s.coins = 100; s.buckwheat = 2;
    const r = row(s);
    expect(r.price).toBe('묵 1 · 60냥');
    expect(r.effectText).toBe('무언가를 진화시키는 부적이다.');
    expect(r.blocked).toBeNull();
    expect(shopModel(mineOf(s), s.coins, s.buckwheat)!.find(x => x.id === 'powerCharm')!.price).toBe('150냥');
  });

  test('before round 20 it says 20라운드부터, short 묵 names the shortfall', () => {
    const early = openGame(15);
    early.coins = 999; early.buckwheat = 5;
    expect(row(early).blocked).toBe('20라운드부터');
    const box = document.createElement('div');
    box.innerHTML = econPanelHtml(marketModel(mineOf(early), early)!, null, false, { ...WIN, tab: 'items' });
    const buy = box.querySelector<HTMLButtonElement>(`[data-action="buyItem"][data-arg="${CHARM}"]`)!;
    expect(buy.disabled).toBe(true);
    expect(box.textContent).toContain('20라운드부터');
    expect(box.textContent).toContain('묵 1 · 60냥');

    const poor = openGame();
    poor.coins = 999; poor.buckwheat = 0;
    expect(row(poor).blocked).toBe('메밀묵 1개 부족');
  });

  test('the new refusals have Korean text', () => {
    for (const r of ['itemTooEarly', 'notTamed', 'notEvolved']) expect(rejectText(r)).toMatch(/[가-힣]/);
    expect(rejectText('notEvolved')).toBe(NEEDS);
    expect(rejectText('tameLocked')).toBeNull();
  });
});

describe('붙이기 for the evolve charm', () => {
  test('a tamed unit gets it, another unit does not', () => {
    const s = openGame();
    s.econ!.items = { [CHARM]: 1, powerCharm: 1 };
    const tamed = placeUnitForTest(s, TAMED, 0);
    const other = placeUnitForTest(s, PAIR.materials[1]!, 1);
    const args = (slot: number) => {
      const box = document.createElement('div');
      box.innerHTML = panel(s, slot);
      return Array.from(box.querySelectorAll<HTMLElement>('[data-action="attachItem"]')).map(b => b.dataset.arg);
    };
    expect(args(0)).toEqual([`powerCharm@${tamed.id}`, `${CHARM}@${tamed.id}`]);
    expect(args(1)).toEqual([`powerCharm@${other.id}`]);

    document.body.innerHTML = STAGE_HTML;
    const menuArgs = (slot: number) => {
      renderBottom(s, slot, true, null, 0, false, null, false, false, { shop: econView(s)!.shop, open: true });
      return document.querySelector('#bottom .item-pop')!.textContent!;
    };
    expect(menuArgs(0)).toContain('진화부적');
    expect(menuArgs(1)).not.toContain('진화부적');
  });
});

describe('combine candidates name the missing evolution', () => {
  test('the unit card option and the helper say 진화부적을 붙여야 합니다 until it is on', () => {
    document.body.innerHTML = STAGE_HTML;
    const s = openGame();
    s.buckwheat = 5; s.coins = 500;
    placeUnitForTest(s, TAMED, 0);
    placeUnitForTest(s, PAIR.materials[1]!, 1);
    expect(combineOptions(s, 0).find(o => o.result === PAIR.result)!.short).toBe(NEEDS_SHORT);
    expect(helperModel(s).find(h => h.recipe === PAIR.result)!.short).toBe(NEEDS_SHORT);
    const box = document.createElement('div');
    box.innerHTML = panel(s, null);
    expect(box.querySelector('.next-list')!.textContent).toContain(NEEDS_SHORT);
    s.slots[0]!.item = CHARM;
    const ready = combineOptions(s, 0).find(o => o.result === PAIR.result)!;
    expect(ready.short).toBeUndefined();
    expect(ready.eatsItem).toBeUndefined();
  });
});

describe('the card of an evolved unit', () => {
  test('shows 진화 and the corner letter 진 but hides the share', () => {
    const s = openGame();
    placeUnitForTest(s, TAMED, 0).item = CHARM;
    const card = unitCard(s, 0)!;
    expect(card.share.attack).toBeCloseTo(MULT - 1);
    expect(card.attack).toBe(Math.round(unitAttack(unitDefFast(d3, TAMED), d3.balance) * MULT));
    expect(itemShort(s, 0)).toBe('진');
    const html = panel(s, 0);
    expect(html).toContain(`공격 ${card.attack}`);
    expect(html).not.toContain('% 진화');
    expect(html).not.toContain(String(Math.round((MULT - 1) * 100)));
    expect(html).toContain('· 진화');
    document.body.innerHTML = STAGE_HTML;
    renderBottom(s, 0, true, null, 0, false, null, false, false, { shop: econView(s)!.shop, open: false });
    const bottom = document.querySelector('#bottom .card')!.textContent!;
    expect(bottom).not.toContain(`${Math.round((MULT - 1) * 100)}%`);
    expect(bottom).toContain('진');
  });
});
