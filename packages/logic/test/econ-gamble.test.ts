import { expect, test } from 'vitest';
import { applyCommand, canonicalJson, createGame, createMatch, loadGameData, marketView, replayMatch, roundStartTick, step, stepMatch, validateData, type Command, type GameEvent } from '../src';
import { unitValue } from '../src/econ/ledger';
import { forceRound, placeUnitForTest, withoutMarketLock } from '../src/testing';
import { nextFloat } from '../src/rng';

const data = loadGameData('stage3');
const bet = { type: 'gambleCoins', stake: 10 } as const;
const small = { type: 'gambleUnit', table: 'small' } as const;
const big = { type: 'gambleUnit', table: 'big' } as const;
function lane(round = 30) {
  const s = createGame(data, 51);
  forceRound(s, round);
  s.econ!.marketOpen = true;
  s.coins = 2000;
  s.buckwheat = 3;
  return s;
}
function fixedRoll(lo: number, hi: number) {
  for (let seed = 0; ; seed++) {
    const x = nextFloat({ s: seed });
    if (x >= lo && x < hi) return { s: seed };
  }
}

test.each([
  [0, .38, 0], [.38, .58, .5], [.58, .86, 1.5], [.86, .95, 2], [.95, .995, 5], [.995, 1, 10],
])('coin outcome in [%s, %s) pays ×%s', (lo, hi, multiplier) => {
  const s = lane();
  s.econ!.rng.gambleCoins = fixedRoll(lo, hi);
  const events: GameEvent[] = [];
  expect(applyCommand(s, bet, events)).toBeNull();
  expect(events).toContainEqual({ type: 'gambleCoins', stake: 10, multiplier, payout: 10 * multiplier });
  expect(s.coins).toBe(1990 + 10 * multiplier);
});

test.each([
  ['small', 0, .4, 0], ['small', .4, .85, 3], ['small', .85, .98, 4], ['small', .98, 1, 5],
  ['big', 0, .35, 0], ['big', .35, .8, 4], ['big', .8, .97, 5], ['big', .97, .995, 6], ['big', .995, 1, 'hidden'],
] as const)('%s table outcome in [%s, %s) is %s', (table, lo, hi, result) => {
  const s = lane();
  s.econ!.rng.gambleUnit = fixedRoll(lo, hi);
  s.econ!.rng.jige = fixedRoll(.03, 1);
  const events: GameEvent[] = [];
  expect(applyCommand(s, { type: 'gambleUnit', table }, events)).toBeNull();
  const ev = events.find(e => e.type === 'gambleUnit')!;
  const buckwheatCost = table === 'small' ? 1 : 2;
  const consolation = result === 0 ? (table === 'small' ? 15 : 40) : 0;
  expect(ev).toMatchObject({ result, buckwheatCost, consolation, jige: false });
  expect(ev).not.toHaveProperty('refund');
  expect(s.coins).toBe(2000 + consolation);
  expect(s.buckwheat).toBe(3 - buckwheatCost);
  if (result !== 0) {
    const unit = s.slots.find(u => u?.id === ev.unitId)!;
    const def = data.units.find(u => u.id === unit.defId)!;
    expect(def.hidden ? 'hidden' : def.grade).toBe(result);
    expect(data.economy!.tame!.targets.some(t => t.unit === def.id)).toBe(false);
    expect(unit.cost).toBe(unitValue(data, def.id));
  }
});

test('unit tables require whole buckwheat and never charge coins', () => {
  const s = lane();
  s.coins = 0;
  s.buckwheat = 1;
  s.econ!.rng.gambleUnit = fixedRoll(0, .35);
  const before = canonicalJson(s);
  expect(marketView(s)!.gamble!.units.tables.big).toMatchObject({ buckwheatCost: 2, consolation: 40, why: 'noBuckwheat' });
  expect(applyCommand(s, big, [])).toBe('noBuckwheat');
  expect(canonicalJson(s)).toBe(before);
  expect(applyCommand(s, small, [])).toBeNull();
  expect(s.coins).toBe(15);
  expect(s.buckwheat).toBe(0);
  expect(applyCommand(s, small, [])).toBe('noBuckwheat');
});

test('market lock, big-table gate and full board refuse without mutating the lane', () => {
  const s = lane(29);
  s.econ!.marketOpen = false;
  expect(applyCommand(s, bet, [])).toBe('marketLocked');
  expect(applyCommand(s, small, [])).toBe('marketLocked');
  s.econ!.marketOpen = true;
  expect(applyCommand(s, big, [])).toBe('gambleRound');
  forceRound(s, 30);
  for (let i = 0; i < s.slots.length; i++) if (s.open[i]) placeUnitForTest(s, 'jipsin', i);
  const before = canonicalJson(s);
  expect(applyCommand(s, big, [])).toBe('noSlot');
  expect(canonicalJson(s)).toBe(before);
});

test('quotas are shared between stakes and tables, reset each round, and default on old snapshots', () => {
  const oldSnapshot = lane();
  Object.assign(oldSnapshot.econ!, { market: { day: 3, draws: 3 }, jige: 2, gamble: { round: 30, coins: 3, units: 1 } });
  Object.assign(oldSnapshot.econ!.rng, { marketGrade: { s: 123 }, marketUnit: { s: 456 } });
  const s = JSON.parse(JSON.stringify(oldSnapshot)) as ReturnType<typeof lane>;
  s.data = data;
  expect(s.econ!.jige).toBe(2);
  expect(marketView(s)!.gamble).toMatchObject({ coins: { left: 2 }, units: { left: 1 } });
  delete s.econ!.gamble;
  delete s.econ!.rng.gambleCoins;
  delete s.econ!.rng.gambleUnit;
  expect(marketView(s)!.gamble).toMatchObject({ coins: { left: 5 }, units: { left: 2 } });
  expect(applyCommand(s, { ...bet, stake: 50 }, [])).toBe('badArgs');
  expect(marketView(s)!.gamble!.coins.stakes.map(s => s.price)).toEqual([10, 100]);
  const cmds: Command[] = [bet, bet, bet, bet, { ...bet, stake: 100 }, bet, small, big, small];
  expect(step(s, cmds).rejected.map(r => r.reason)).toEqual(['gambleLimit', 'gambleLimit']);
  expect(marketView(s)!.gamble).toMatchObject({ coins: { left: 0 }, units: { left: 0 } });
  forceRound(s, 31);
  expect(marketView(s)!.gamble).toMatchObject({ coins: { left: 5 }, units: { left: 2 } });
});

test('gamble config validates odds, pools, stakes, prices and limits', () => {
  const clone = () => structuredClone(data);
  expect(validateData(data).errors).toEqual([]);
  for (const change of [
    (m: NonNullable<NonNullable<NonNullable<typeof data.economy>['market']>['gamble']>) => { m.coins.stakes[0] = -10; },
    (m: NonNullable<NonNullable<NonNullable<typeof data.economy>['market']>['gamble']>) => { m.coins.outcomes[0]!.chance = .39; },
    (m: NonNullable<NonNullable<NonNullable<typeof data.economy>['market']>['gamble']>) => { m.units.perRound = 0; },
    (m: NonNullable<NonNullable<NonNullable<typeof data.economy>['market']>['gamble']>) => { m.units.tables.big.buckwheatCost = 1.5; },
    (m: NonNullable<NonNullable<NonNullable<typeof data.economy>['market']>['gamble']>) => { m.units.tables.small.consolation = -1; },
    (m: NonNullable<NonNullable<NonNullable<typeof data.economy>['market']>['gamble']>) => { m.units.tables.big.consolation = 0.5; },
    (m: NonNullable<NonNullable<NonNullable<typeof data.economy>['market']>['gamble']>) => { m.units.tables.small.outcomes[1]!.result = 42 as never; },
  ]) {
    const d = clone();
    change(d.economy!.market!.gamble!);
    expect(validateData(d).errors.some(e => e.includes('gamble'))).toBe(true);
  }
});

test('data without table configuration refuses both commands without changing the lane', () => {
  const old = structuredClone(data);
  delete old.economy!.market!.gamble;
  const s = createGame(old, 51);
  forceRound(s, 30);
  s.econ!.marketOpen = true;
  s.coins = 500;
  const before = canonicalJson(s);
  expect(applyCommand(s, bet, [])).toBe('badArgs');
  expect(applyCommand(s, small, [])).toBe('badArgs');
  expect(canonicalJson(s)).toBe(before);
});

test('coin payout rounds down for odd stakes', () => {
  const d = structuredClone(data);
  d.economy!.market!.gamble!.coins.stakes.push(11);
  const s = createGame(d, 51);
  forceRound(s, 30);
  s.econ!.marketOpen = true;
  s.econ!.rng.gambleCoins = fixedRoll(.38, .58);
  s.coins = 100;
  const events: GameEvent[] = [];
  expect(applyCommand(s, { ...bet, stake: 11 }, events)).toBeNull();
  expect(events).toMatchObject([{ payout: 5 }]);
  expect(s.coins).toBe(94);
});

test('accepted gambles replay deterministically and change the recorded state', () => {
  const d = withoutMarketLock(data);
  const tick = roundStartTick(d, 1) + 1;
  d.balance.tokens.start = 10;
  const inputs = [
    ...Array.from({ length: 10 }, (_, i) => ({ seat: 1, seq: i + 1, cmd: { type: 'convertToken' as const } })),
    { seat: 1, seq: 11, cmd: small }, { seat: 1, seq: 12, cmd: bet },
  ];
  const match = createMatch(d, 932, [1, 2]);
  while (match.tick < tick) stepMatch(match, []);
  const resolved = stepMatch(match, inputs);
  expect(resolved.acks.slice(-2).map(a => a.ok)).toEqual([true, true]);
  expect(match.lanes[2]!.econ!.gamble).toBeUndefined();
  const log = [{ tick, inputs }];
  const hashes = replayMatch(d, 932, [1, 2], log, 200);
  expect(replayMatch(d, 932, [1, 2], log, 200)).toEqual(hashes);
  expect(replayMatch(d, 932, [1, 2], [{ tick, inputs: [...inputs.slice(0, -2), { seat: 1, seq: 12, cmd: { type: 'invalid' } }] }], 200)).not.toEqual(hashes);
});

test.each([
  [small, 0, .4], [small, .85, .98], [big, 0, .35], [big, .8, .97],
] as const)('%j grants 지게 on both a miss and a hit', (cmd, lo, hi) => {
  const s = lane();
  s.econ!.rng.gambleUnit = fixedRoll(lo, hi);
  s.econ!.rng.jige = fixedRoll(0, .03);
  const events: GameEvent[] = [];
  expect(applyCommand(s, cmd, events)).toBeNull();
  expect(s.econ!.jige).toBe(1);
  expect(events.find(e => e.type === 'gambleUnit')).toMatchObject({ jige: true });
});
