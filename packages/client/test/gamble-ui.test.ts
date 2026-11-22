// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { createGame, econView, loadGameData, type GambleEvent } from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { gambleHtml, gambleModel, advanceReveal, revealDisplay, startReveal } from '../src/ui/gamble';

const data = loadGameData('stage3');

test('the market model gives both round quotas, odds and live button reasons', () => {
  const s = createGame(data, 1);
  const view = () => gambleModel(econView(s)!.market!.gamble!, s.coins, s.buckwheat);
  forceRound(s, 29);
  expect(view().coins.buttons[0]!.blocked).toBe('엽전 10냥 부족');
  expect(view().coins.buttons[1]!.blocked).toBe('10라운드 보스를 잡으면 열림');
  expect(view().cheap!).toMatchObject({ count: '엽전 보따리 3/3', buttons: [{ label: '엽전 보따리 · 30냥', blocked: '엽전 30냥 부족' }] });
  expect(view().cheap!.buttons[0]!.odds).toBe('1등급 75% · 2등급 25%');
  s.econ!.marketOpen = true;
  s.coins = 20;
  expect(view().coins.count).toBe('돈 도박 5/5');
  expect(view().units.count).toBe('보따리 남은 횟수 2/2');
  expect(view().coins.buttons[1]!).toMatchObject({ label: '100냥', blocked: '엽전 80냥 부족' });
  expect(view().coins.buttons[1]!.odds).toContain('×10 0.5%');
  expect(view().units.buttons[1]!.blocked).toBe('30라운드부터');
  s.econ!.gamble = { round: 29, coins: 5, units: 1 };
  expect(view().coins.buttons[0]!.blocked).toBe('이번 라운드 몫을 다 씀');
  expect(view().units.count).toBe('보따리 남은 횟수 1/2');
  for (let i = 0; i < s.slots.length; i++) if (s.open[i]) placeUnitForTest(s, 'jipsin', i);
  expect(view().units.buttons[0]!.blocked).toBe('진영 한 칸 비우기');
});

test('unit buttons show 묵 prices and consolation odds, with the bundle-style shortage reason', () => {
  const s = createGame(data, 1);
  forceRound(s, 30);
  s.econ!.marketOpen = true;
  s.buckwheat = 1;
  const model = gambleModel(econView(s)!.market!.gamble!, s.coins, s.buckwheat);
  expect(model.units.buttons).toMatchObject([
    { label: '보따리 · 묵 1', blocked: null },
    { label: '큰 보따리 · 묵 2', blocked: '메밀묵 1개 부족' },
  ]);
  expect(model.units.buttons[0]!.odds).toContain('꽝이면 15냥 위로금');
  expect(model.units.buttons[1]!.odds).toContain('꽝이면 40냥 위로금');
  expect(gambleHtml(model, null)).toContain('보따리 · 묵 1');
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
