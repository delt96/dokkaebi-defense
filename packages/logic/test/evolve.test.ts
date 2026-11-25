import { describe, expect, test } from 'vitest';
import {
  applyCommand, availableRecipes, buyBlock, combineEatsItem, createGame, damageBonus, econView, evolveMult, loadGameData,
  needsEvolve, shopItem, validateData, type Command, type GameEvent, type GameState, type RejectReason,
} from '../src';
import { hitDamage } from '../src/combat';
import { forceRound, makeData, placeUnitForTest, spawnEnemyForTest, withoutMarketLock } from '../src/testing';

const d3 = withoutMarketLock(loadGameData('stage3'));
const CHARM = 'evolveCharm';
const charm = shopItem(d3, CHARM)!;
const PAIRS = d3.recipes.filter(r => r.kind === 'tame');
const TAMED = d3.economy!.tame!.targets.map(t => t.unit);
const ENEMY = d3.waves.find(w => w.type === 'normal')!.pattern[0]!;

function game(round = 20): GameState {
  const s = createGame(d3, 1);
  forceRound(s, round);
  s.econ!.marketOpen = true;
  return s;
}

const ok = (s: GameState, cmd: Command) => expect(applyCommand(s, cmd, [])).toBeNull();

function refused(s: GameState, cmd: Command, reason: RejectReason) {
  const before = JSON.stringify({ coins: s.coins, buckwheat: s.buckwheat, econ: s.econ, slots: s.slots, storage: s.storage });
  const events: GameEvent[] = [];
  expect(applyCommand(s, cmd, events)).toBe(reason);
  expect(events).toEqual([]);
  expect(JSON.stringify({ coins: s.coins, buckwheat: s.buckwheat, econ: s.econ, slots: s.slots, storage: s.storage })).toBe(before);
}

function holdCharm(s: GameState, n = 1) {
  s.econ!.items = { ...s.econ!.items, [CHARM]: (s.econ!.items?.[CHARM] ?? 0) + n };
}

test('the evolve charm is the fifth item: 묵 1 + 60냥 from round 20', () => {
  expect(d3.economy!.shop!.items.map(i => i.id)).toEqual(['rangeCharm', 'powerCharm', 'swiftCharm', 'weakCharm', CHARM]);
  expect(charm).toEqual({ id: CHARM, name: '진화부적', coins: 60, buckwheat: 1, fromRound: 20, effect: { kind: 'evolve' } });
  expect(d3.economy!.tame).not.toHaveProperty('combineFromRound');
  for (const t of d3.economy!.tame!.targets) expect(t.evolvedMult).toBeGreaterThan(1);
});

describe('buying', () => {
  test('before round 20 it is too early, at 20 it sells', () => {
    const s = game(19);
    s.coins = 60; s.buckwheat = 1;
    expect(buyBlock(s, CHARM)).toBe('itemTooEarly');
    refused(s, { type: 'buyItem', item: CHARM }, 'itemTooEarly');
    forceRound(s, 20);
    expect(buyBlock(s, CHARM)).toBeNull();
    ok(s, { type: 'buyItem', item: CHARM });
  });

  test('it takes the 묵 and the 냥 together', () => {
    const s = game();
    s.coins = 65; s.buckwheat = 3;
    const events: GameEvent[] = [];
    expect(applyCommand(s, { type: 'buyItem', item: CHARM }, events)).toBeNull();
    expect([s.coins, s.buckwheat]).toEqual([5, 2]);
    expect(s.econ!.items![CHARM]).toBe(1);
    expect(events).toEqual([{ type: 'itemBought', item: CHARM }]);
  });

  test('short 묵 or short 냥 refuse', () => {
    const s = game();
    s.coins = 60; s.buckwheat = 0;
    expect(buyBlock(s, CHARM)).toBe('noBuckwheat');
    refused(s, { type: 'buyItem', item: CHARM }, 'noBuckwheat');
    s.coins = 59; s.buckwheat = 1;
    expect(buyBlock(s, CHARM)).toBe('noCoins');
    refused(s, { type: 'buyItem', item: CHARM }, 'noCoins');
  });

  test('the shop view carries the 묵 price and the opening round only on the charm', () => {
    const s = game(12);
    const rows = econView(s)!.shop!.items;
    expect(rows.find(i => i.id === CHARM)).toMatchObject({ coins: 60, buckwheat: 1, fromRound: 20, why: 'itemTooEarly' });
    expect(rows.find(i => i.id === 'powerCharm')).not.toHaveProperty('buckwheat');
    expect(rows.find(i => i.id === 'powerCharm')).not.toHaveProperty('fromRound');
  });
});

describe('attaching', () => {
  test('only the five tamed units take it', () => {
    const s = game();
    holdCharm(s);
    placeUnitForTest(s, 'jipsin', 0);
    placeUnitForTest(s, PAIRS[0]!.materials[1]!, 1);
    refused(s, { type: 'attachItem', item: CHARM, slot: 0 }, 'notTamed');
    refused(s, { type: 'attachItem', item: CHARM, slot: 1 }, 'notTamed');
    TAMED.forEach((id, i) => {
      holdCharm(s);
      placeUnitForTest(s, id, 2 + i);
      ok(s, { type: 'attachItem', item: CHARM, slot: 2 + i });
      expect(s.slots[2 + i]!.item).toBe(CHARM);
    });
  });

  test('other charms still go on a tamed unit', () => {
    const s = game();
    s.econ!.items = { powerCharm: 1 };
    placeUnitForTest(s, TAMED[0]!, 0);
    ok(s, { type: 'attachItem', item: 'powerCharm', slot: 0 });
  });
});

describe('exclusive recipes need the tamed material evolved', () => {
  test('a bare recruit is refused with notEvolved, an evolved one combines at any round', () => {
    for (const r of PAIRS) {
      for (const round of [12, 20]) {
        const s = game(round);
        const [a, b] = r.materials as [string, string];
        placeUnitForTest(s, a, 0);
        placeUnitForTest(s, b, 1);
        s.buckwheat = 1; s.coins = 60;
        expect(needsEvolve(s, r)).toBe(true);
        expect(availableRecipes(s)).not.toContain(r.result);
        refused(s, { type: 'combine', result: r.result }, 'notEvolved');
        refused(s, { type: 'combine', result: r.result, slot: 0 }, 'notEvolved');
        s.slots[0]!.item = CHARM;
        expect(needsEvolve(s, r)).toBe(false);
        expect(availableRecipes(s)).toContain(r.result);
        ok(s, { type: 'combine', result: r.result, slot: 0 });
        expect(s.slots.filter(u => u?.defId === r.result)).toHaveLength(1);
        expect(s.slots.some(u => u?.defId === a || u?.defId === b)).toBe(false);
        expect(s.slots.some(u => u?.item)).toBe(false);
      }
    }
  });

  test('missing materials still read missingMaterials first', () => {
    const r = PAIRS[0]!;
    const s = game();
    placeUnitForTest(s, r.materials[0]!, 0);
    s.buckwheat = 1; s.coins = 60;
    expect(needsEvolve(s, r)).toBe(false);
    refused(s, { type: 'combine', result: r.result }, 'missingMaterials');
  });

  test('swapping the evolve charm for another charm undoes the evolution', () => {
    const r = PAIRS[1]!;
    const s = game();
    placeUnitForTest(s, r.materials[0]!, 0);
    placeUnitForTest(s, r.materials[1]!, 1);
    s.buckwheat = 1; s.coins = 60;
    holdCharm(s);
    ok(s, { type: 'attachItem', item: CHARM, slot: 0 });
    expect(needsEvolve(s, r)).toBe(false);
    s.econ!.items = { ...s.econ!.items, powerCharm: 1 };
    ok(s, { type: 'attachItem', item: 'powerCharm', slot: 0 });
    expect(needsEvolve(s, r)).toBe(true);
    refused(s, { type: 'combine', result: r.result }, 'notEvolved');
  });

  test('the evolved copy is used over a bare one, wherever it sits, and its charm is no surprise', () => {
    const r = PAIRS[2]!;
    const [a, b] = r.materials as [string, string];
    const s = game();
    const bare = placeUnitForTest(s, a, 0);
    const evolved = placeUnitForTest(s, a, 5);
    evolved.item = CHARM;
    placeUnitForTest(s, b, 3);
    s.buckwheat = 1; s.coins = 60;
    expect(combineEatsItem(s, r.result)).toBe(false);
    expect(combineEatsItem(s, r.result, 0)).toBe(false);
    ok(s, { type: 'combine', result: r.result, slot: 0 });
    expect(s.slots[0]).toBe(bare);
    expect(s.slots.includes(evolved)).toBe(false);
    expect(s.slots.filter(u => u?.defId === r.result)).toHaveLength(1);

    const t = game();
    const e2 = placeUnitForTest(t, a, 2);
    e2.item = CHARM;
    t.slots[2] = null;
    t.storage = [e2];
    placeUnitForTest(t, a, 0);
    placeUnitForTest(t, b, 1);
    t.buckwheat = 1; t.coins = 60;
    expect(needsEvolve(t, r)).toBe(false);
    ok(t, { type: 'combine', result: r.result });
    expect(t.storage).toEqual([]);
    expect(t.slots[0]!.defId).toBe(a);
    expect(t.slots[1]!.defId).toBe(r.result);
  });
});

describe('the evolved multiplier', () => {
  test('scales basic and skill damage at the damage-bonus spot', () => {
    for (const target of d3.economy!.tame!.targets) {
      const s = game(21);
      s.upgrades.physical = 2; s.upgrades.magical = 2;
      placeUnitForTest(s, target.unit, 10);
      const enemy = spawnEnemyForTest(s, ENEMY, 1, 10 ** 7);
      const plainBonus = damageBonus(s, 10);
      const plain = hitDamage(s, 10, enemy, 1);
      expect(evolveMult(s, 10)).toBe(1);
      s.slots[10]!.item = CHARM;
      expect(evolveMult(s, 10)).toBe(target.evolvedMult);
      expect(1 + damageBonus(s, 10)).toBeCloseTo((1 + plainBonus) * target.evolvedMult!, 9);
      expect(Math.abs(hitDamage(s, 10, enemy, 1) - plain * target.evolvedMult!)).toBeLessThanOrEqual(target.evolvedMult! + 1);
      s.slots[10]!.item = 'powerCharm';
      expect(evolveMult(s, 10)).toBe(1);
    }
  });
});

describe('validation', () => {
  test('the data validates without combineFromRound', () => {
    expect(validateData(loadGameData('stage3')).errors).toEqual([]);
  });

  test('bad buckwheat, fromRound or evolvedMult fail', () => {
    const at = (d: ReturnType<typeof loadGameData>) => d.economy!.shop!.items.find(i => i.id === CHARM)! as unknown as Record<string, unknown>;
    const shopCases: [string, (d: ReturnType<typeof loadGameData>) => void][] = [
      ['buckwheat 0', d => { at(d).buckwheat = 0; }],
      ['buckwheat fraction', d => { at(d).buckwheat = 0.5; }],
      ['fromRound 0', d => { at(d).fromRound = 0; }],
      ['fromRound past the last round', d => { at(d).fromRound = d.balance.rounds + 1; }],
      ['fromRound string', d => { at(d).fromRound = '20'; }],
    ];
    for (const [label, patch] of shopCases) expect(validateData(makeData(patch, 'stage3')).errors, label).toContain('invalid shop');
    for (const bad of [0, -1, NaN, '1.2']) {
      const d = makeData(x => { (x.economy!.tame!.targets[0] as unknown as Record<string, unknown>).evolvedMult = bad; }, 'stage3');
      expect(validateData(d).errors, String(bad)).toContain('invalid tame evolvedMult: jinegaksi');
    }
    const missing = makeData(x => { delete x.economy!.tame!.targets[0]!.evolvedMult; }, 'stage3');
    expect(validateData(missing).errors).toContain('invalid tame evolvedMult: jinegaksi');
  });
});
