import { describe, expect, test } from 'vitest';
import {
  applyCommand, buyBlock, createGame, itemOf, jigeCandidates, loadGameData, shopItem, validateData,
  type GameData, type GameEvent, type GameState, type RejectReason,
} from '../src';
import { makeData, placeUnitForTest, withoutMarketLock } from '../src/testing';

const locked = loadGameData('stage3');
const d3 = withoutMarketLock(locked);
const price = (id: string) => shopItem(d3, id)!.coins;

function game(data: GameData = d3): GameState {
  return createGame(data, 1);
}

function snapshot(s: GameState) {
  return JSON.stringify({ coins: s.coins, econ: s.econ, slots: s.slots, storage: s.storage });
}

function refused(s: GameState, cmd: Parameters<typeof applyCommand>[1], reason: RejectReason) {
  const before = snapshot(s);
  const events: GameEvent[] = [];
  expect(applyCommand(s, cmd, events)).toBe(reason);
  expect(events).toEqual([]);
  expect(snapshot(s)).toBe(before);
}

function buy(s: GameState, item: string) {
  s.coins += price(item);
  const events: GameEvent[] = [];
  expect(applyCommand(s, { type: 'buyItem', item }, events)).toBeNull();
  return events;
}

test('stage 3 lists the four charms; stages 1 and 2 have no shop', () => {
  expect(d3.economy!.shop!.items.map(i => i.id)).toEqual(['rangeCharm', 'powerCharm', 'swiftCharm', 'weakCharm']);
  expect(loadGameData('stage1').economy).toBeUndefined();
  expect(loadGameData('stage2').economy).toBeUndefined();
});

test('buying takes its coins and adds one held', () => {
  const s = game();
  s.coins = price('powerCharm');
  const events: GameEvent[] = [];
  expect(applyCommand(s, { type: 'buyItem', item: 'powerCharm' }, events)).toBeNull();
  expect(s.coins).toBe(0);
  expect(s.econ!.items!.powerCharm).toBe(1);
  expect(s.econ!.itemsBought!.powerCharm).toBe(1);
  expect(events).toEqual([{ type: 'itemBought', item: 'powerCharm' }]);

  const t = game();
  t.coins = price('powerCharm') + 7;
  expect(applyCommand(t, { type: 'buyItem', item: 'powerCharm' }, [])).toBeNull();
  expect(t.coins).toBe(7);
});

describe('a locked market, a used-up limit and short coins refuse', () => {
  test('a locked market refuses both commands', () => {
    const s = game(locked);
    expect(s.econ!.marketOpen).toBe(false);
    s.coins = price('powerCharm');
    expect(buyBlock(s, 'powerCharm')).toBe('marketLocked');
    refused(s, { type: 'buyItem', item: 'powerCharm' }, 'marketLocked');
    s.econ!.items = { powerCharm: 1 };
    placeUnitForTest(s, 'jipsin', 0);
    refused(s, { type: 'attachItem', item: 'powerCharm', slot: 0 }, 'marketLocked');
  });

  test('a missing marketOpen key counts as open', () => {
    const s = game(locked);
    delete s.econ!.marketOpen;
    s.coins = price('powerCharm');
    expect(buyBlock(s, 'powerCharm')).toBeNull();
    expect(applyCommand(s, { type: 'buyItem', item: 'powerCharm' }, [])).toBeNull();
  });

  test('prep time allows buying and attaching', () => {
    const s = game();
    expect(s.phase).toBe('prep');
    buy(s, 'powerCharm');
    placeUnitForTest(s, 'jipsin', 0);
    expect(applyCommand(s, { type: 'attachItem', item: 'powerCharm', slot: 0 }, [])).toBeNull();
  });

  test('a second rangeCharm is over its limit, attached or not', () => {
    const s = game();
    buy(s, 'rangeCharm');
    s.coins = price('rangeCharm');
    expect(buyBlock(s, 'rangeCharm')).toBe('itemLimit');
    refused(s, { type: 'buyItem', item: 'rangeCharm' }, 'itemLimit');
    placeUnitForTest(s, 'jipsin', 0);
    expect(applyCommand(s, { type: 'attachItem', item: 'rangeCharm', slot: 0 }, [])).toBeNull();
    expect(s.econ!.items!.rangeCharm).toBe(0);
    refused(s, { type: 'buyItem', item: 'rangeCharm' }, 'itemLimit');
  });

  test('short coins refuse', () => {
    const s = game();
    s.coins = price('powerCharm') - 1;
    expect(buyBlock(s, 'powerCharm')).toBe('noCoins');
    refused(s, { type: 'buyItem', item: 'powerCharm' }, 'noCoins');
  });

  test('unknown ids and a stage without a shop are unknown', () => {
    const s = game();
    s.coins = 1000;
    placeUnitForTest(s, 'jipsin', 0);
    expect(buyBlock(s, 'nope')).toBe('unknown');
    refused(s, { type: 'buyItem', item: 'nope' }, 'unknown');
    refused(s, { type: 'attachItem', item: 'nope', slot: 0 }, 'unknown');
    const one = game(loadGameData('stage1'));
    one.coins = 1000;
    placeUnitForTest(one, 'jipsin', 0);
    expect(buyBlock(one, 'powerCharm')).toBe('unknown');
    refused(one, { type: 'buyItem', item: 'powerCharm' }, 'unknown');
    refused(one, { type: 'attachItem', item: 'powerCharm', slot: 0 }, 'unknown');
  });
});

test('attaching moves a held item onto the unit; a second one replaces it', () => {
  const s = game();
  buy(s, 'powerCharm');
  buy(s, 'swiftCharm');
  const unit = placeUnitForTest(s, 'jipsin', 0);
  const events: GameEvent[] = [];
  expect(applyCommand(s, { type: 'attachItem', item: 'powerCharm', slot: 0 }, events)).toBeNull();
  expect(unit.item).toBe('powerCharm');
  expect(itemOf(s, 0)?.id).toBe('powerCharm');
  expect(s.econ!.items!.powerCharm).toBe(0);
  expect(events).toEqual([{ type: 'itemAttached', item: 'powerCharm', unitId: unit.id, defId: 'jipsin', replaced: null }]);

  const second: GameEvent[] = [];
  expect(applyCommand(s, { type: 'attachItem', item: 'swiftCharm', slot: 0 }, second)).toBeNull();
  expect(unit.item).toBe('swiftCharm');
  expect(second).toEqual([{ type: 'itemAttached', item: 'swiftCharm', unitId: unit.id, defId: 'jipsin', replaced: 'powerCharm' }]);
  expect(s.econ!.items).toEqual({ powerCharm: 0, swiftCharm: 0 });
  expect(itemOf(s, 1)).toBeNull();
});

test('attaching needs a held item and a unit', () => {
  const s = game();
  placeUnitForTest(s, 'jipsin', 0);
  refused(s, { type: 'attachItem', item: 'powerCharm', slot: 0 }, 'noItem');
  buy(s, 'powerCharm');
  refused(s, { type: 'attachItem', item: 'powerCharm', slot: 1 }, 'noUnit');
  refused(s, { type: 'attachItem', item: 'powerCharm', slot: 999 }, 'noUnit');
  refused(s, { type: 'attachItem', item: 'powerCharm', slot: -1 }, 'noUnit');
});

test('validateData rejects a malformed shop', () => {
  expect(validateData(d3).errors).toEqual([]);
  expect(validateData(locked).errors).toEqual([]);
  type Item = Record<string, unknown> & { effect: Record<string, unknown> };
  const cases: [string, (items: Item[]) => void][] = [
    ['duplicate id', i => { i[1]!.id = i[0]!.id; }],
    ['empty id', i => { i[0]!.id = ''; }],
    ['coins 0', i => { i[0]!.coins = 0; }],
    ['coins negative', i => { i[0]!.coins = -5; }],
    ['coins fraction', i => { i[0]!.coins = 1.5; }],
    ['coins string', i => { i[0]!.coins = '150'; }],
    ['coins missing', i => { delete i[0]!.coins; }],
    ['perGame 0', i => { i[0]!.perGame = 0; }],
    ['perGame fraction', i => { i[0]!.perGame = 1.5; }],
    ['unknown kind', i => { i[1]!.effect.kind = 'heal'; }],
    ['no effect', i => { delete (i[1] as Partial<Item>).effect; }],
    ['effect not an object', i => { i[1]!.effect = 'attack' as never; }],
    ['item not an object', i => { i[0] = null as never; }],
    ...(['amount', 'pct', 'seconds'] as const).flatMap(key => {
      const at = key === 'amount' ? 0 : key === 'pct' ? 1 : 3;
      return ([['0', 0], ['negative', -1], ['NaN', NaN], ['string', '1'], ['missing', undefined]] as const)
        .map(([label, value]): [string, (items: Item[]) => void] => [`${key} ${label}`, i => {
          if (value === undefined) delete i[at]!.effect[key];
          else i[at]!.effect[key] = value;
        }]);
    }),
    ['weak pct missing', i => { delete i[3]!.effect.pct; }],
  ];
  for (const [label, patch] of cases) {
    const data = makeData(d => patch(d.economy!.shop!.items as unknown as Item[]), 'stage3');
    expect(validateData(data).errors, label).toContain('invalid shop');
  }
  const notList = makeData(d => { (d.economy!.shop as unknown as { items: unknown }).items = {}; }, 'stage3');
  expect(validateData(notList).errors).toContain('invalid shop');
});

test('the item follows a move and goes with combine, sell and jige', () => {
  const s = game();
  const attach = (slot: number) => {
    buy(s, 'powerCharm');
    expect(applyCommand(s, { type: 'attachItem', item: 'powerCharm', slot }, [])).toBeNull();
  };
  const a = placeUnitForTest(s, 'jipsin', 0);
  attach(0);
  expect(applyCommand(s, { type: 'move', from: 0, to: 5 }, [])).toBeNull();
  expect(s.slots[5]).toBe(a);
  expect(s.slots[5]!.item).toBe('powerCharm');

  placeUnitForTest(s, 'jipsin', 6);
  expect(applyCommand(s, { type: 'combine', result: 'dunggumi', slot: 5 }, [])).toBeNull();
  expect(s.slots[5]!.defId).toBe('dunggumi');
  expect(s.slots[5]).not.toHaveProperty('item');

  attach(5);
  expect(applyCommand(s, { type: 'sell', slot: 5 }, [])).toBeNull();
  expect(s.slots[5]).toBeNull();
  expect(s.slots.some(u => u?.item)).toBe(false);

  const b = placeUnitForTest(s, 'meok', 2);
  attach(2);
  s.econ!.jige = 1;
  const result = jigeCandidates(s.data, 'meok').find(u => u.id !== 'meok')!.id;
  expect(applyCommand(s, { type: 'jigeSwap', source: { zone: 'board', index: 2, unitId: b.id }, result }, [])).toBeNull();
  expect(s.slots[2]!.defId).toBe(result);
  expect(s.slots[2]).not.toHaveProperty('item');
});

test('no shop state until first use', () => {
  const s = game();
  expect(s.econ).not.toHaveProperty('items');
  expect(s.econ).not.toHaveProperty('itemsBought');
  const u = placeUnitForTest(s, 'jipsin', 0);
  expect(u).not.toHaveProperty('item');
});
