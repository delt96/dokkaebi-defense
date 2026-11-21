import { describe, expect, test } from 'vitest';
import {
  createGame, createRng, currentStats, deriveSeed, economyVariant, fitsCaps, loadGameData, nonQuestValue, pickTarget,
  questLoad, step, stripEconomy, unitValue, countNormalEnemies, type GameState,
} from '../src/index';
import { dealDamage } from '../src/combat';
import { forceRound, makeData, placeUnitForTest, spawnEnemyForTest } from '../src/testing';

const d3 = loadGameData('stage3');

function jumpLaneToRound(s: GameState, round: number): void {
  forceRound(s, round);
}

const units = (s: GameState) => s.slots.filter(Boolean).map(u => u!);

describe('economy ledger', () => {
  test('stage 1 and 2 data carry no economy and lanes get no econ or cost', () => {
    expect(loadGameData('stage1').economy).toBeUndefined();
    expect(loadGameData('stage2').economy).toBeUndefined();
    const s2 = createGame(loadGameData('stage2'), 7);
    step(s2, []); jumpLaneToRound(s2, 1); step(s2, [{ type: 'summon' }]);
    expect('econ' in s2).toBe(false);
    expect(units(s2).length).toBeGreaterThan(0);
    expect(units(s2).every(u => !('cost' in u))).toBe(true);
  });

  test('stage 3 lane starts with a fresh econ seeded from the lane seed', () => {
    const s = createGame(d3, 7);
    expect(s.econ!.rng.bundle.s).toBe(createRng(deriveSeed(7, 'bundle')).s);
    expect(s.econ!.rng.drop.s).toBe(createRng(deriveSeed(7, 'drop')).s);
    expect(s.econ!.bundle.left).toEqual([3, 3, 2]);
    expect(s.econ!.questTokens).toBe(0);
    expect(s.econ!.ledger).toEqual({ story: 0, tokens: 0 });
  });

  test('unit cost: summon = grade value, combine = sum, pity = 1', () => {
    const s = createGame(d3, 3);
    jumpLaneToRound(s, 1);
    s.tokens = 30;
    for (let i = 0; i < 12; i++) step(s, [{ type: 'summon' }]);
    for (const u of units(s)) {
      const g = d3.units.find(x => x.id === u.defId)!.grade;
      expect(u.cost).toBe(2 ** (g - 1));
    }

    const c = createGame(d3, 3);
    placeUnitForTest(c, 'sotlid', 0); placeUnitForTest(c, 'bujigaengi', 1);
    c.slots[0]!.cost = 1; c.slots[1]!.cost = 3;
    step(c, [{ type: 'combine', result: 'gamasot' }]);
    expect(units(c).map(u => [u.defId, u.cost])).toEqual([['gamasot', 4]]);

    const p = createGame(makeData(d => { d.balance.summonOdds = [1]; }, 'stage3'), 3);
    jumpLaneToRound(p, 1);
    p.tokens = 1; p.grade1Summons = 6;
    step(p, [{ type: 'summon' }]);
    expect(units(p).map(u => u.cost)).toEqual([1, 1]);
  });

  test('a quest token summon and the pity it triggers cost 0 and spend the quest token first', () => {
    const s = createGame(makeData(d => { d.balance.summonOdds = [1]; }, 'stage3'), 3);
    jumpLaneToRound(s, 1);
    s.tokens = 2; s.econ!.questTokens = 1; s.grade1Summons = 6;
    step(s, [{ type: 'summon' }]);
    expect(units(s).map(u => u.cost)).toEqual([0, 0]);
    expect([s.econ!.questTokens, s.tokens]).toEqual([0, 1]);
    step(s, [{ type: 'summon' }]);
    expect(units(s).map(u => u.cost).sort()).toEqual([0, 0, 1]);
  });

  test('a queued quest pity unit keeps cost 0 when it lands later', () => {
    const s = createGame(makeData(d => { d.balance.summonOdds = [1]; }, 'stage3'), 3);
    jumpLaneToRound(s, 1);
    for (let i = 0; i < s.slots.length; i++) if (s.open[i] && i !== 0) placeUnitForTest(s, 'jipsin', i);
    s.tokens = 1; s.econ!.questTokens = 1; s.grade1Summons = 6;
    step(s, [{ type: 'summon' }]);
    expect(s.pendingPity.length).toBe(1);
    expect(s.econ!.pityQuest).toEqual([true]);
    step(s, [{ type: 'sell', slot: 1 }]);
    expect(s.pendingPity.length).toBe(0);
    expect(s.econ!.pityQuest).toEqual([]);
    expect(s.slots[1]!.cost).toBe(0);
  });

  test('convertToken spends a quest token first and keeps the Q reservation', () => {
    const s = createGame(d3, 3);
    s.tokens = 2; s.econ!.questTokens = 1; s.econ!.ledger.tokens = 4;
    step(s, [{ type: 'convertToken' }]);
    expect([s.tokens, s.econ!.questTokens, s.econ!.ledger.tokens]).toEqual([1, 0, 4]);
  });

  test('N sums held costs; Q adds story and token ledgers; fitsCaps checks all three caps', () => {
    const s = createGame(d3, 3);
    placeUnitForTest(s, 'janggu', 0); placeUnitForTest(s, 'moru', 1);
    expect(nonQuestValue(s)).toBe(24);
    s.slots[1]!.cost = 0;
    expect(nonQuestValue(s)).toBe(16);
    s.econ!.ledger.tokens = 4; s.econ!.ledger.story = 0;
    expect(questLoad(s)).toBe(4);
    expect(fitsCaps(s, 16, 0, 60)).toBe(true);
    expect(fitsCaps(s, 16, 0, 59)).toBe(false);
    expect(fitsCaps(s, 17, 0, 999)).toBe(false);
    s.econ!.ledger.story = 16;
    expect(fitsCaps(s, 0, 4, 999)).toBe(false);
  });

  test('unitValue: grade 5 = 16, cheonnyeonjing = 40, hidden = 0', () => {
    expect(unitValue(d3, 'jipsin')).toBe(1);
    expect(unitValue(d3, 'moru')).toBe(8);
    expect(unitValue(d3, 'janggu')).toBe(16);
    expect(unitValue(d3, 'cheonnyeonjing')).toBe(40);
    expect(unitValue(d3, 'gangcheori')).toBe(0);
    const sixes = d3.units.filter(u => u.grade === 6 && !u.hidden).map(u => unitValue(d3, u.id));
    expect(new Set(sixes)).toEqual(new Set([36, 40]));
  });

  test('economyVariant drops only the switched-off sections; stripEconomy removes economy', () => {
    const base = loadGameData('stage3');
    const d = economyVariant(base, { market: false, team: false });
    expect(d.economy!.market).toBeUndefined(); expect(d.economy!.team).toBeUndefined(); expect(d.economy!.story).toBeDefined();
    expect(base.economy!.market).toBeDefined();
    expect(stripEconomy(loadGameData('stage3')).economy).toBeUndefined();
    expect('econ' in createGame(stripEconomy(loadGameData('stage3')), 1)).toBe(false);
  });

  test('event enemies: fixed hp, not counted as normal, targeted first, no round stats', () => {
    const s = createGame(d3, 3);
    jumpLaneToRound(s, 1);
    placeUnitForTest(s, 'jipsin', 0);
    const imp = spawnEnemyForTest(s, 'japgwi', 0.6);
    const beast = spawnEnemyForTest(s, 'ev_soebap', 0.6);
    expect(beast.hp).toBe(3000);
    expect(beast.boss).toBe(false);
    expect(countNormalEnemies(s)).toBe(1);
    expect(pickTarget(s, 0)?.id).toBe(beast.id);
    expect(imp.id).toBeLessThan(beast.id);
    const before = { ...currentStats(s)! };
    dealDamage(s, beast, 100, 'x', []);
    expect(currentStats(s)).toEqual(before);
    for (const id of ['ev_soebap', 'ev_ssireum', 'ev_shadow']) expect(d3.enemies.find(e => e.id === id)!.event).toBe(true);
  });

  test('an event kill pays no per-kill coin and does not count as a round kill', () => {
    const s = createGame(d3, 3);
    jumpLaneToRound(s, 1);
    const beast = spawnEnemyForTest(s, 'ev_soebap', 0.6);
    beast.hp = 0;
    const imp = spawnEnemyForTest(s, 'japgwi', 0.6);
    imp.hp = 0;
    const coins = s.coins;
    step(s, []);
    expect(s.coins).toBe(coins + 1);
    expect(s.econ!.roundKills).toBe(1);
  });
});
