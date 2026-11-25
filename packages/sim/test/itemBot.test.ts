import { describe, expect, test } from 'vitest';
import {
  applyCommand, createGame, loadGameData, shopItem, unitAttack, unitDefFast,
  type Command, type GameEvent, type GameState,
} from '@dorandi/logic';
import { forceRound, placeUnitForTest, withoutMarketLock } from '@dorandi/logic/testing';
import { itemCommands, reserveCoins, type EconPolicy } from '../src/stage3/econBot';
import { targetBot } from '../src/stage3/targetBot';
import { firepowerRun } from '../src/stage3/firepower';
import { STANDARD_CONFIGS } from '../src/stage3/econRun';

const d3 = withoutMarketLock(loadGameData('stage3'));
const price = (id: string) => shopItem(d3, id)!.coins;
const attack = (id: string) => unitAttack(unitDefFast(d3, id), d3.balance);

// cheonnyeondatdol hits harder than bihyeongrang, which hits harder than gamtudokkaebi
const STRONG = 'cheonnyeondatdol';
const MID = 'bihyeongrang';
const WEAK = 'gamtudokkaebi';

function board(units: [string, number][], coins = 0): GameState {
  const s = createGame(d3, 1);
  forceRound(s, 41);
  for (const [id, slot] of units) placeUnitForTest(s, id, slot);
  s.coins = coins;
  return s;
}

function apply(s: GameState, cmds: Command[]): GameEvent[] {
  const events: GameEvent[] = [];
  for (const c of cmds) expect(applyCommand(s, c, events)).toBeNull();
  return events;
}

describe('itemCommands', () => {
  test('the test units are ordered by attack', () => {
    expect(attack(STRONG)).toBeGreaterThan(attack(MID));
    expect(attack(MID)).toBeGreaterThan(attack(WEAK));
  });

  test('buys and attaches to the strongest grade 6', () => {
    const s = board([[WEAK, 7], [MID, 8]], 10_000);
    const first = itemCommands(s, 'powerCharm', 0);
    expect(first).toEqual({ commands: [{ type: 'buyItem', item: 'powerCharm' }], saving: false });
    apply(s, first.commands);
    expect(s.econ!.items!.powerCharm).toBe(1);
    const second = itemCommands(s, 'powerCharm', 0);
    expect(second.saving).toBe(false);
    expect(second.commands).toEqual([{ type: 'attachItem', item: 'powerCharm', slot: 8, unitId: s.slots[8]!.id }]);
    apply(s, second.commands);
    expect(s.slots[8]!.item).toBe('powerCharm');
  });

  test('keeps one holder when a stronger grade 6 arrives', () => {
    const s = board([[MID, 8]], 10_000);
    apply(s, itemCommands(s, 'powerCharm', 0).commands);
    apply(s, itemCommands(s, 'powerCharm', 0).commands);
    expect(s.slots[8]!.item).toBe('powerCharm');
    placeUnitForTest(s, STRONG, 9);
    expect(itemCommands(s, 'powerCharm', 0)).toEqual({ commands: [], saving: false });
  });

  test('rebuys for the strongest survivor after the holder is gone', () => {
    const s = board([[WEAK, 7], [STRONG, 8], [MID, 9]], 10_000);
    apply(s, itemCommands(s, 'powerCharm', 0).commands);
    apply(s, itemCommands(s, 'powerCharm', 0).commands);
    expect(s.slots[8]!.item).toBe('powerCharm');
    s.slots[8] = null;
    const rebuy = itemCommands(s, 'powerCharm', 0);
    expect(rebuy.commands).toEqual([{ type: 'buyItem', item: 'powerCharm' }]);
    apply(s, rebuy.commands);
    const attach = itemCommands(s, 'powerCharm', 0);
    expect(attach.commands).toEqual([{ type: 'attachItem', item: 'powerCharm', slot: 9, unitId: s.slots[9]!.id }]);
    apply(s, attach.commands);
    expect(s.econ!.itemsBought!.powerCharm).toBe(2);

    const r = board([[WEAK, 7], [STRONG, 8]], 10_000);
    apply(r, itemCommands(r, 'rangeCharm', 0).commands);
    apply(r, itemCommands(r, 'rangeCharm', 0).commands);
    expect(r.slots[8]!.item).toBe('rangeCharm');
    r.slots[8] = null;
    expect(itemCommands(r, 'rangeCharm', 0)).toEqual({ commands: [], saving: false });
    expect(r.econ!.itemsBought!.rangeCharm).toBe(1);
  });

  test('keeps the grade 6 reserve and waits without a grade 6', () => {
    const p = price('powerCharm');
    const short = board([[MID, 8]], p + 59);
    expect(itemCommands(short, 'powerCharm', 60)).toEqual({ commands: [], saving: true });
    const broke = board([[MID, 8]], p - 1);
    expect(itemCommands(broke, 'powerCharm', 0)).toEqual({ commands: [], saving: true });
    const enough = board([[MID, 8]], p + 60);
    expect(itemCommands(enough, 'powerCharm', 60).commands).toEqual([{ type: 'buyItem', item: 'powerCharm' }]);
    const none = board([['eomang', 8]], 10_000);
    expect(itemCommands(none, 'powerCharm', 0)).toEqual({ commands: [], saving: false });
  });

  test('a locked market is not saved for', () => {
    const s = createGame(loadGameData('stage3'), 1);
    placeUnitForTest(s, MID, 8);
    s.coins = 10_000;
    expect(s.econ!.marketOpen).toBe(false);
    expect(itemCommands(s, 'powerCharm', 0)).toEqual({ commands: [], saving: false });
  });
});

describe('targetBot with an item policy', () => {
  const base: EconPolicy = { quests: false, tame: false, jige: false, hunts: false };

  test('targetBot saves for the charm', () => {
    const p = price('powerCharm');
    const types = (s: GameState, policy: EconPolicy) =>
      targetBot(1, { targets: ['gimseobang'], policy }).decide(s).map(c => c.type);
    // enough for an upgrade, not for the charm
    expect(types(board([[MID, 8]], p - 1), { ...base, item: 'powerCharm' })).not.toContain('upgrade');
    expect(types(board([[MID, 8]], p - 1), base)).toContain('upgrade');
    const ready = types(board([[MID, 8]], p), { ...base, item: 'powerCharm' });
    expect(ready).toContain('buyItem');
    expect(ready).not.toContain('upgrade');
  });

  test('one decision batch does not spend the reserve twice', () => {
    const p = price('powerCharm');
    const policy: EconPolicy = { ...base, hunts: true, item: 'powerCharm' };
    const make = (coins: number) => board([[MID, 8], ['eomang', 9]], coins);
    const probe = make(0);
    const reserve = reserveCoins(probe, 'gimseobang');
    expect(reserve).toBeGreaterThan(0);
    const fee = d3.economy!.hunts!.targets[0]!.fee;
    // each alone fits above the reserve, both together do not
    const coins = reserve + p + fee - 1;
    expect(coins - fee).toBeGreaterThanOrEqual(reserve);
    expect(coins - p).toBeGreaterThanOrEqual(reserve);
    const s = make(coins);
    const cmds = targetBot(1, { targets: ['gimseobang'], policy }).decide(s);
    const types = cmds.map(c => c.type);
    expect(types).toContain('hunt');
    expect(types).not.toContain('buyItem');
    for (const c of cmds) applyCommand(s, c, []);
    expect(s.coins).toBeGreaterThanOrEqual(reserve);

    const rich = make(reserve + p + fee);
    const both = targetBot(1, { targets: ['gimseobang'], policy }).decide(rich).map(c => c.type);
    expect(both).toContain('hunt');
    expect(both).toContain('buyItem');
  });
});

describe('firepowerRun item record', () => {
  const base = STANDARD_CONFIGS.find(x => x.name === 'switch-full-q2')!;
  const data = loadGameData('stage3');

  test('records the charms each seat bought and attached', () => {
    const cheap = structuredClone(data);
    shopItem(cheap, 'powerCharm')!.coins = 1;
    const on = firepowerRun(cheap, 1, { ...base, noDefeat: true, item: 'powerCharm' }, [41], []);
    expect(on.items.length).toBe(6);
    expect(on.items.some(x => x.bought >= 1)).toBe(true);
    for (const x of on.items) {
      expect(x.item).toBe('powerCharm');
      if (x.attached > 0) {
        expect(x.firstDefId).not.toBeNull();
        expect(x.firstRange).toBe(unitDefFast(data, x.firstDefId!).range);
      } else {
        expect(x.firstDefId).toBeNull();
      }
    }
    const off = firepowerRun(data, 1, { ...base, noDefeat: true }, [41], []);
    expect(off.items.every(x => x.bought === 0 && x.attached === 0 && x.firstDefId === null)).toBe(true);
  }, 120_000);
});
