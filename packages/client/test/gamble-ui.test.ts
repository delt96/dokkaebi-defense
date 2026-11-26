// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { createGame, econView, loadGameData, type GambleEvent } from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { gambleHtml, gambleModel, gambleHistoryHtml, recordGamble, type GambleHistoryEntry, advanceReveal, gambleRevealHtml, heldCoins, revealDisplay, startReveal } from '../src/ui/gamble';

const data = loadGameData('stage3');

function panel(html: string): HTMLDivElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

test('every group shows remaining uses and each unavailable purchase owns its reason', () => {
  const s = createGame(data, 1);
  forceRound(s, 29);
  s.econ!.marketOpen = true;
  s.coins = 46;
  s.econ!.gamble = { round: 29, coins: 1, units: 1 };
  const html = panel(gambleHtml(gambleModel(econView(s)!.market!.gamble!, s.coins, s.buckwheat), null));
  expect(Array.from(html.querySelectorAll('.gamble-count'), e => e.textContent)).toEqual([
    '남은 횟수 1/2', '남은 횟수 3/3', '남은 횟수 4/5',
  ]);
  const buy = (id: string) => html.querySelector<HTMLButtonElement>(`[data-arg="${id}"]`)!;
  for (const [id, reason] of [['big', '30라운드부터'], ['100', '엽전 54냥 부족']]) {
    const button = buy(id!);
    expect(button.disabled).toBe(true);
    expect(button.parentElement?.querySelector('.gamble-why')?.textContent).toBe(reason);
  }
  expect(buy('10').disabled).toBe(false);
  const free = buy('10').parentElement?.querySelector('.gamble-why');
  expect([free?.textContent, free?.id, buy('10').hasAttribute('aria-describedby')]).toEqual(['', '', false]);
  expect(html.querySelector('[title], .gamble-odds')).toBeNull();
  s.econ!.marketOpen = false;
  const locked = panel(gambleHtml(gambleModel(econView(s)!.market!.gamble!, s.coins, s.buckwheat), null));
  expect(Array.from(locked.querySelectorAll('.gamble-why'), e => e.textContent).filter(Boolean)).toEqual(Array(3).fill('10라운드 보스 격파 후'));
});

test('a reason appearing or going away keeps every buy button where it was', () => {
  const s = createGame(data, 1);
  forceRound(s, 29);
  s.econ!.marketOpen = true;
  s.coins = 500;
  s.buckwheat = 10;
  const layout = () => {
    const html = panel(gambleHtml(gambleModel(econView(s)!.market!.gamble!, s.coins, s.buckwheat), null));
    return Array.from(html.querySelectorAll('.gamble-option'), o => Array.from(o.children, c => c.className));
  };
  const open = layout();
  s.econ!.gamble = { round: 29, coins: 5, units: 5 };
  s.coins = 0;
  s.buckwheat = 0;
  expect(layout()).toEqual(open);
  expect(open.every(row => row.includes('gamble-why'))).toBe(true);
});

test('the market draws no odds box and no name buttons', () => {
  const s = createGame(data, 1);
  const html = panel(gambleHtml(gambleModel(econView(s)!.market!.gamble!, s.coins, s.buckwheat), null));
  expect(html.querySelector('.gamble-inspect, .gamble-odds, .gamble-info, [data-market-item]')).toBeNull();
  expect(Array.from(html.querySelectorAll('.gamble-name'), e => e.textContent)).toEqual(['보따리', '큰 보따리']);
  expect(html.textContent).not.toContain('%');
});

test('history caps at five settled results and identifies the unit’s current board cell', () => {
  const s = createGame(data, 1);
  placeUnitForTest(s, 'hongdukkae', 0);
  const unit = s.slots[0]!;
  const win: GambleEvent = { type: 'gambleUnit', table: 'small', buckwheatCost: 1, result: 3,
    consolation: 0, jige: false, defId: unit.defId, unitId: unit.id };
  const miss: GambleEvent = { type: 'gambleUnit', table: 'small', buckwheatCost: 1, result: 0, consolation: 15, jige: false };
  const bet: GambleEvent = { type: 'gambleCoins', stake: 10, multiplier: 2, payout: 20 };
  let history: GambleHistoryEntry[] = [];
  for (const [i, event] of [bet, bet, bet, miss, bet, win].entries()) {
    history = recordGamble(history, { event, round: i + 10 });
  }
  expect(history.map(e => e.round)).toEqual([15, 14, 13, 12, 11]);
  const shown = panel(gambleHistoryHtml(history, s));
  expect(shown.querySelectorAll('li')).toHaveLength(5);
  expect(shown.querySelector('li .unit-face')).not.toBeNull();
  expect(shown.querySelector('[data-action="marketCell"]')?.textContent).toBe('칸 보기 · 1행 1열');
  expect(shown.textContent).toContain('위로금 15냥');
  expect(shown.textContent).toContain('받음 20냥 · 이득 10냥');
  s.slots[0] = null;
  expect(panel(gambleHistoryHtml(history, s)).textContent).toContain('진영에 없음');
});

test('folded history is one toggle with the count; unfolded it keeps the toggle above the list', () => {
  const s = createGame(data, 1);
  const bet: GambleEvent = { type: 'gambleCoins', stake: 10, multiplier: 2, payout: 20 };
  const history = [bet, bet].reduce<GambleHistoryEntry[]>((h, event) => recordGamble(h, { event, round: 3 }), []);
  const folded = panel(gambleHistoryHtml(history, s, { folded: true }));
  expect(folded.textContent!.trim()).toBe('최근 결과 ▸ 2개');
  expect(folded.querySelectorAll('li')).toHaveLength(0);
  expect(folded.querySelector('[data-action="marketHistory"]')!.getAttribute('aria-expanded')).toBe('false');
  const open = panel(gambleHistoryHtml(history, s, { folded: false }));
  expect(open.querySelector('[data-action="marketHistory"]')!.getAttribute('aria-expanded')).toBe('true');
  expect(open.querySelectorAll('li')).toHaveLength(2);
  const plain = panel(gambleHistoryHtml(history, s));
  expect(plain.querySelector('[data-action="marketHistory"]')).toBeNull();
  expect(plain.querySelectorAll('li')).toHaveLength(2);
});

test.each([
  [{ type: 'gambleCoins', stake: 10, multiplier: 0, payout: 0 }, 'lose', 700],
  [{ type: 'gambleCoins', stake: 10, multiplier: 1.5, payout: 15 }, 'small', 850],
  [{ type: 'gambleCoins', stake: 100, multiplier: 10, payout: 1000 }, 'big', 850],
  [{ type: 'gambleUnit', table: 'small', buckwheatCost: 1, result: 0, consolation: 15, jige: true }, 'lose', 700],
  [{ type: 'gambleUnit', table: 'big', buckwheatCost: 2, result: 'hidden', defId: 'baekbalbaneulgaksi', unitId: 3, consolation: 0, jige: false }, 'big', 850],
] satisfies [GambleEvent, string, number][])('%j settles as %s after the reveal', (event, tier, duration) => {
  const start = startReveal(100);
  expect(start.phase).toBe('start');
  expect(advanceReveal(start, 120, data)).toBe(start);
  const rolling = advanceReveal(start, 125, data, event)!;
  expect(rolling).toMatchObject({ phase: 'rolling', event, tier });
  expect(advanceReveal(rolling, 125 + duration - 1, data)).toBe(rolling);
  const result = advanceReveal(rolling, 125 + duration, data);
  expect(result).toMatchObject({ phase: 'result', event, tier });
  expect(advanceReveal(result, 1500, data)).toBe(result);
  expect(revealDisplay(rolling, 140, data, true)).toMatchObject({ label: '굴리는 중…' });
  expect(revealDisplay(result, 125 + duration, data, true)?.motion).toBe(false);
  if (event.type === 'gambleUnit' && event.result === 0) {
    expect(revealDisplay(result, 125 + duration, data, true)).toMatchObject({
      label: '꽝', detail: '위로금 +15냥 · 지게 획득', announcement: '꽝 · 위로금 +15냥 · 지게 획득',
    });
  }
});

test('the 엽전 count holds back a draw winnings until its result shows', () => {
  const bet: GambleEvent = { type: 'gambleCoins', stake: 10, multiplier: 2, payout: 20 };
  const miss: GambleEvent = { type: 'gambleUnit', table: 'small', buckwheatCost: 1, consolation: 15, jige: false, result: 0 };
  expect(heldCoins(null)).toBe(0);
  expect(heldCoins(startReveal(0))).toBe(0);
  const rolling = advanceReveal(startReveal(0), 100, data, bet);
  expect(heldCoins(rolling)).toBe(20);
  expect(heldCoins(advanceReveal(rolling, 2000, data))).toBe(0);
  expect(heldCoins(advanceReveal(startReveal(0), 100, data, miss))).toBe(15);
});

test('a grade 6 prize keeps the result line gold for 1.2 s, with reduced effects too; other prizes do not', () => {
  const six: GambleEvent = { type: 'gambleUnit', table: 'big', buckwheatCost: 2, result: 6, defId: 'gildal', unitId: 4, consolation: 0, jige: false };
  const five: GambleEvent = { type: 'gambleUnit', table: 'big', buckwheatCost: 2, result: 5, defId: 'top', unitId: 5, consolation: 0, jige: false };
  const settle = (event: GambleEvent) => advanceReveal(advanceReveal(startReveal(0), 0, data, event), 10_000, data)!;
  const gold = (event: GambleEvent, ms: number, reduced: boolean) => {
    const result = settle(event);
    return !!panel(gambleRevealHtml(revealDisplay(result, result.at + ms, data, reduced))).querySelector('.gamble-reveal.gold');
  };
  for (const reduced of [false, true]) {
    expect([gold(six, 0, reduced), gold(six, 1199, reduced), gold(six, 1201, reduced)]).toEqual([true, true, false]);
    expect(gold(five, 0, reduced)).toBe(false);
  }
  const reduced = settle(six);
  expect(panel(gambleRevealHtml(revealDisplay(reduced, reduced.at + 100, data, true))).querySelector('.flash')).toBeNull();
});
