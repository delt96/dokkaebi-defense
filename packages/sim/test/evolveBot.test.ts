import { describe, expect, test } from 'vitest';
import { applyCommand, createGame, loadGameData, unitDefFast, type Command, type GameState } from '@dorandi/logic';
import { forceRound, placeUnitForTest, withoutMarketLock } from '@dorandi/logic/testing';
import { coinsSpent, evolveCommands } from '../src/stage3/econBot';
import { expandTree, targetBot } from '../src/stage3/targetBot';

const d3 = withoutMarketLock(loadGameData('stage3'));
const PAIR = d3.recipes.find(r => r.kind === 'tame')!;
const [RECRUIT, PARTNER] = PAIR.materials as [string, string];
const usesPartner = d3.units.find(u => u.grade === 6 && !u.hidden && expandTree(d3, u.id).has(PARTNER))!.id;
const freeOfPair = d3.units.find(u => u.grade === 6 && !u.hidden && !expandTree(d3, u.id).has(PARTNER))!.id;

function board(round: number, coins = 500, buckwheat = 5): GameState {
  const s = createGame(d3, 1);
  forceRound(s, round);
  s.econ!.marketOpen = true;
  placeUnitForTest(s, RECRUIT, 0);
  placeUnitForTest(s, PARTNER, 1);
  s.coins = coins;
  s.buckwheat = buckwheat;
  return s;
}

function apply(s: GameState, cmds: Command[]) {
  for (const c of cmds) expect(applyCommand(s, c, [])).toBeNull();
}

describe('evolveCommands', () => {
  test('from round 20 it buys the charm, puts it on the recruit and makes the exclusive recipe', () => {
    const s = board(21);
    const buy = evolveCommands(s, freeOfPair);
    expect(buy).toEqual([{ type: 'buyItem', item: 'evolveCharm' }]);
    expect(coinsSpent(s, buy)).toBe(60);
    apply(s, buy);
    const attach = evolveCommands(s, freeOfPair);
    expect(attach).toEqual([{ type: 'attachItem', item: 'evolveCharm', slot: 0, unitId: s.slots[0]!.id }]);
    apply(s, attach);
    const combine = evolveCommands(s, freeOfPair);
    expect(combine).toEqual([{ type: 'combine', result: PAIR.result }]);
    apply(s, combine);
    expect(s.slots.some(u => u?.defId === PAIR.result)).toBe(true);
    expect(unitDefFast(d3, PAIR.result)).toMatchObject({ grade: 6, hidden: true });
    expect(evolveCommands(s, freeOfPair)).toEqual([]);
  });

  test('nothing before round 20, while the target keeps the partner, or without 묵 and 냥 for both steps', () => {
    expect(evolveCommands(board(19), freeOfPair)).toEqual([]);
    expect(evolveCommands(board(21), usesPartner)).toEqual([]);
    expect(evolveCommands(board(21, 119), freeOfPair)).toEqual([]);
    expect(evolveCommands(board(21, 500, 1), freeOfPair)).toEqual([]);
  });

  test('with the exclusive result as the target, its own partner is fair game', () => {
    const s = board(21);
    expect(evolveCommands(s, PAIR.result)).toEqual([{ type: 'buyItem', item: 'evolveCharm' }]);
    apply(s, evolveCommands(s, PAIR.result));
    apply(s, evolveCommands(s, PAIR.result));
    expect(s.slots[0]!.item).toBe('evolveCharm');
    // the target bot's own recipe pass makes the combine
    expect(evolveCommands(s, PAIR.result)).toEqual([]);
  });
});

describe('a taming bot chases the exclusive recipe from round 20', () => {
  const policy = { quests: false, tame: true, jige: false, hunts: false };
  const decide = (round: number) => {
    const s = board(round);
    s.slots[1] = null;
    const bot = targetBot(1, { policy, switchTargets: true });
    bot.decide(s);
    return { s, bot };
  };

  test('before round 20 it keeps its grade 6 target', () => {
    expect(decide(19).bot.currentTarget()).not.toBe(PAIR.result);
  });

  test('from round 20 the recruit result becomes the target and the old one comes back after it', () => {
    const { s, bot } = decide(21);
    expect(bot.currentTarget()).toBe(PAIR.result);
    s.slots[0] = null;
    placeUnitForTest(s, PAIR.result, 0);
    bot.decide(s);
    expect(bot.currentTarget()).not.toBe(PAIR.result);
    expect(unitDefFast(d3, bot.currentTarget()!)).toMatchObject({ grade: 6 });
    expect(unitDefFast(d3, bot.currentTarget()!).hidden).toBeFalsy();
  });

  test('a target closer to done than the exclusive result is kept', () => {
    const near = d3.recipes.find(r => r.result === freeOfPair)!;
    const s = board(21);
    s.slots[1] = null;
    near.materials.forEach((m, i) => placeUnitForTest(s, m, 4 + i));
    const bot = targetBot(1, { policy, targets: [freeOfPair] });
    bot.decide(s);
    expect(bot.currentTarget()).toBe(freeOfPair);
  });

  test('a recruit that is gone ends the chase', () => {
    const { s, bot } = decide(21);
    s.slots[0] = null;
    bot.decide(s);
    expect(bot.currentTarget()).not.toBe(PAIR.result);
  });
});
