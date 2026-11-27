import { describe, expect, test } from 'vitest';
import { cellDistance, createGame, laneOf, laneSeed, loadGameData, roundStartTick, stepMatch, createMatch, unitDefFast, type GameState } from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { lacksShred, pickShredSupport, shredFor, shredPlacement } from '../src/stage3/shred';
import { remainingNeed } from '../src/stage3/targetBot';
import { EconDriver } from '../src/stage3/econDriver';
import { configData, makeBot, SEATS, STANDARD_CONFIGS } from '../src/stage3/econRun';
import { mainType } from '../src/stage3/synergy';

const d3 = loadGameData('stage3');

function board(units: [string, number][], round = 41): GameState {
  const s = createGame(d3, 1);
  forceRound(s, round);
  for (const [id, slot] of units) placeUnitForTest(s, id, slot);
  return s;
}

describe('shred support', () => {
  test('shredFor sums the weakening a unit puts on one damage type', () => {
    expect(shredFor(unitDefFast(d3, 'gireumteul'), 'physical')).toBeCloseTo(0.3);
    expect(shredFor(unitDefFast(d3, 'gireumteul'), 'magical')).toBe(0);
    expect(shredFor(unitDefFast(d3, 'yaktanggi'), 'magical')).toBeCloseTo(0.27);
    expect(shredFor(unitDefFast(d3, 'buk'), 'physical')).toBeCloseTo(0.24);
  });

  test('picks the grade 5 shredder of the main type that is cheapest to build, the bigger shred on a tie', () => {
    // on an empty board all four take 16 grade 1 units
    expect(pickShredSupport(board([]), 'physical')).toBe('gireumteul');
    expect(pickShredSupport(board([]), 'magical')).toBe('yaktanggi');
  });

  test('a board lacks shred until it holds a grade 5 or 6 unit putting 0.15 or more on the main type', () => {
    expect(lacksShred(board([['bujipge', 0]]), 'physical')).toBe(true);
    expect(lacksShred(board([['gireumteul', 0]]), 'physical')).toBe(false);
    expect(lacksShred(board([['gireumteul', 0]]), 'magical')).toBe(true);
    expect(lacksShred(board([['cheonnyeonmuseosot', 0]]), 'magical')).toBe(false);
  });

  test('a reserved unit is not counted as held material', () => {
    const s = board([['yaktanggi', 0]]);
    expect(remainingNeed(s, 'cheonnyeonmuseosot').missing.has('yaktanggi')).toBe(false);
    expect(remainingNeed(s, 'cheonnyeonmuseosot', new Map([['yaktanggi', 1]])).missing.get('yaktanggi')).toBe(1);
  });

  test('moves the shredder next to the main dealers so their reach overlaps on the path', () => {
    // dealers in the top left corner, the shredder in the bottom right corner (both edge cells)
    const s = board([['dunggumi', 0], ['dunggumi', 1], ['dunggumi', 6], ['gireumteul', 23]]);
    const move = shredPlacement(s, 23, 'physical');
    expect(move).not.toBeNull();
    expect(move!.from).toBe(23);
    const lane = laneOf(s);
    expect(lane.cells[move!.to]!.isEdge).toBe(true);
    expect(cellDistance(lane, move!.to, 0)).toBeLessThan(cellDistance(lane, 23, 0));
    // once there it stays
    const near = board([['dunggumi', 0], ['dunggumi', 1], ['dunggumi', 6], ['gireumteul', 2]]);
    expect(shredPlacement(near, 2, 'physical')).toBeNull();
  });
});

describe('bots with shred support', () => {
  const SEEDS = [1, 2, 3];
  const heldShare = (shred: boolean, round: number): number => {
    const c = STANDARD_CONFIGS.find(x => x.name === 'switch-full-q2')!;
    let held = 0;
    for (const seed of SEEDS) {
      const d = configData(d3, c, seed);
      const m = createMatch(d, seed, SEATS, { noElimination: true, noGate: true });
      const policy = { quests: true, tame: true, jige: true, hunts: true, shred };
      const driver = new EconDriver(m, SEATS.map(s => makeBot(c.bot, laneSeed(seed, s), policy)), c.gamble);
      while (m.tick < roundStartTick(d, round)) stepMatch(m, driver.inputs());
      held += SEATS.filter(s => !lacksShred(m.lanes[s]!, mainType(m.lanes[s]!, null))).length;
    }
    return held / (SEATS.length * SEEDS.length);
  };

  test('keep a grade 5-6 shredder of their main type on most boards, clearly more often than without it', () => {
    const on = heldShare(true, 51);
    const off = heldShare(false, 51);
    expect(on).toBeGreaterThanOrEqual(0.5);
    // without support boards still get shred by chance (often a tamed grade 6): 0.28-0.61 over three seeds.
    // The policy adds 0.50 (v6) and 0.56 (v7) at seeds 1-3; no three consecutive seeds in 1-8 add less than 0.27.
    expect(on - off).toBeGreaterThanOrEqual(0.25);
  }, 600_000);
});
