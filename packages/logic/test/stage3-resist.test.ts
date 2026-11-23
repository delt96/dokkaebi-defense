import { describe, expect, test } from 'vitest';
import {
  createGame, laneOf, loadGameData, roundResistBonus, zoneOf, roundResistRange, resistAt, step, summonOddsForRound, validateData,
  type GameData, type GameState,
} from '../src/index';
import { computeHitDamage, enemyResist, hitDamage } from '../src/combat';
import { forceRound, makeData, placeUnitForTest, spawnEnemyForTest } from '../src/testing';

const d1 = loadGameData('stage1');
const d2 = loadGameData('stage2');
const d3 = loadGameData('stage3');
const quiet = (data: GameData, round = 1): GameState => {
  const s = createGame(data, 1); forceRound(s, round); s.spawned = 30; s.roundEndTick = 10 ** 9; s.enemies = []; return s;
};
const always = (data: GameData, ids: string[]) => {
  for (const u of data.units) if (ids.includes(u.id)) for (const sk of u.skills) if (sk.trigger.kind === 'nth' || sk.trigger.kind === 'chance') sk.trigger = { kind: 'always' };
};

describe('weakening cuts resistance', () => {
  test('flag on adds vuln after resist, flag off multiplies', () => {
    const hit = { attack: 100, mult: 1, bonus: 0, resist: 0.6, vuln: 0.3 };
    expect(computeHitDamage(hit)).toBe(52);
    expect(computeHitDamage({ ...hit, cutsResist: true })).toBe(70);
    expect(computeHitDamage({ ...hit, resist: 0, cutsResist: true })).toBe(computeHitDamage({ ...hit, resist: 0 }));
    expect(computeHitDamage({ ...hit, resist: 0.6, vuln: 0, cutsResist: true })).toBe(40);
  });

  test('only the 60-round data turns it on', () => {
    expect(d3.balance.vulnCutsResist).toBe(true);
    expect(d1.balance.vulnCutsResist).toBeUndefined();
    expect(d2.balance.vulnCutsResist).toBeUndefined();
  });

  test('a stage 3 hit on an armoured enemy uses the cut, vulnCap still applies', () => {
    const data = makeData(d => {
      d.balance.resistByRound = undefined;
      d.enemies.find(e => e.id === 'geuseundae')!.resist.physical = 0.6;
    }, 'stage3');
    const s = quiet(data);
    placeUnitForTest(s, 'dunggumi', 2);
    const e = spawnEnemyForTest(s, 'geuseundae', 3, 1e6);
    e.vulns.x = { pct: 0.9, damageType: 'all', ticks: 100, stacks: 1 };
    const plain = hitDamage(s, 2, spawnEnemyForTest(s, 'japgwi', 3, 1e6), 1);
    // vuln capped at 0.5: 1 - 0.6 + 0.5 = 0.9 of the unresisted hit
    expect(hitDamage(s, 2, e, 1)).toBe(Math.round(plain * 0.9));
  });
});

describe('resistance by round', () => {
  const b = d3.balance;
  test('zero up to the start round, linear to the top, flat after', () => {
    const r = b.resistByRound!;
    expect(roundResistBonus(b, 1)).toBe(0);
    expect(roundResistBonus(b, r.fromRound)).toBe(0);
    expect(roundResistBonus(b, r.toRound)).toBeCloseTo(r.top);
    expect(roundResistBonus(b, (r.fromRound + r.toRound) / 2)).toBeCloseTo(r.top / 2);
    expect(roundResistBonus(b, r.toRound + 5)).toBeCloseTo(r.top);
    expect(roundResistBonus(d1.balance, 60)).toBe(0);
    expect(roundResistBonus(d2.balance, 20)).toBe(0);
  });

  test('base plus growth, stopped at the cap', () => {
    const custom = { ...b, resistByRound: { fromRound: 20, toRound: 60, top: 0.45, cap: 0.8 } };
    expect(resistAt(custom, 0, 60)).toBeCloseTo(0.45);
    expect(resistAt(custom, 0.5, 60)).toBeCloseTo(0.8);
    expect(resistAt(custom, 0.5, 40)).toBeCloseTo(0.725);
    expect(resistAt(custom, 0.3, 20)).toBeCloseTo(0.3);
    expect(resistAt(d1.balance, 0.5, 60)).toBe(0.5);
  });

  test('normal enemies, bosses and shared visits grow; event enemies keep their own', () => {
    const s = quiet(d3, 50);
    const bonus = roundResistBonus(d3.balance, 50);
    expect(bonus).toBeGreaterThan(0);
    const normal = spawnEnemyForTest(s, 'japgwi', 3);
    const armoured = spawnEnemyForTest(s, 'geuseundae', 3);
    const boss = spawnEnemyForTest(s, 'jinegaksi5', 3);
    const shared = spawnEnemyForTest(s, 'yeoksin3', 3);
    expect(enemyResist(s, normal, 'physical')).toBeCloseTo(bonus);
    expect(enemyResist(s, normal, 'magical')).toBeCloseTo(bonus);
    expect(enemyResist(s, armoured, 'physical')).toBeCloseTo(Math.min(0.5 + bonus, d3.balance.resistByRound!.cap));
    expect(enemyResist(s, boss, 'magical')).toBeCloseTo(bonus);
    expect(enemyResist(s, shared, 'physical')).toBeCloseTo(bonus);
    for (const id of ['ev_soebap', 'ev_oenun', 'ev_yagwang', 'ev_ssireum', 'ev_shadow']) {
      const ev = spawnEnemyForTest(s, id, 3);
      expect(enemyResist(s, ev, 'physical')).toBe(0);
      expect(enemyResist(s, ev, 'magical')).toBe(0);
    }
  });

  test('an enemy keeps the resistance of the round it came in', () => {
    const s = quiet(d3, 40);
    const e = spawnEnemyForTest(s, 'japgwi', 3);
    s.round = 55;
    expect(enemyResist(s, e, 'physical')).toBeCloseTo(roundResistBonus(d3.balance, 40));
  });

  test('stage 1 and 2 enemies keep their data resists', () => {
    const s = quiet(d2, 20);
    const e = spawnEnemyForTest(s, 'geuseundae', 3);
    expect(enemyResist(s, e, 'physical')).toBe(0.5);
    expect(enemyResist(s, e, 'magical')).toBe(0);
  });

  test('the round range lists the wave enemies the same way combat does', () => {
    expect(roundResistRange(d1, 10)).toBeNull();
    const r = d3.balance.resistByRound!;
    const late = 60;
    const top = roundResistBonus(d3.balance, late);
    // round 60 is the last 강철이: magical base 0.3
    expect(roundResistRange(d3, late)).toEqual({
      physical: [top, top].map(x => expect.closeTo(x, 9)),
      magical: [Math.min(0.3 + top, r.cap), Math.min(0.3 + top, r.cap)].map(x => expect.closeTo(x, 9)),
    });
    // round 56 mixes 잡귀, 그슨대 and 두억시니
    const mid = roundResistBonus(d3.balance, 56);
    const range = roundResistRange(d3, 56)!;
    expect(range.physical[0]).toBeCloseTo(mid);
    expect(range.physical[1]).toBeCloseTo(Math.min(0.5 + mid, r.cap));
    expect(range.magical[1]).toBeCloseTo(Math.min(0.5 + mid, r.cap));
  });
});

describe('summon odds', () => {
  test('every 60-round summon is grade 1', () => {
    for (let round = 0; round <= 60; round++) expect(summonOddsForRound(d3.balance, round)).toEqual([1, 0, 0]);
    expect(d3.balance.summonOdds).toEqual([1, 0, 0]);
    expect(d3.balance.pityEvery).toBe(5);
  });

  test('a long run of summons never gives grade 3', () => {
    const s = createGame(d3, 7);
    let grade3 = 0;
    for (let i = 0; i < 400; i++) {
      s.tokens = 1; s.coins = 0;
      for (let k = 0; k < s.slots.length; k++) s.slots[k] = null;
      const r = step(s, [{ type: 'summon' }]);
      for (const e of r.events) if (e.type === 'summon' && e.grade >= 3) grade3++;
    }
    expect(grade3).toBe(0);
  });
});

// Stage 3 path (frame 6 x 4, centre 3,2): top side d 0-7, right 7-12, bottom 12-19, left 19-24.
// Quadrants: top-left d < 3.5 or d > 21.5, top-right 3.5-9.5, bottom-right 9.5-15.5, bottom-left 15.5-21.5.
describe('zone slow', () => {
  const slowData = (patch?: (d: GameData) => void) => makeData(d => { always(d, ['samtaegi']); patch?.(d); }, 'stage3');
  const pctOf = (data: GameData) =>
    (data.units.find(u => u.id === 'samtaegi')!.skills[0]!.effects.find(e => e.kind === 'slow') as { pct: number }).pct * data.balance.zoneSlow!.pctFactor;

  test('quadrants split at the board centre; a point on a centre line counts as right or bottom', () => {
    const lane = laneOf({ data: d3 });
    expect([1, 3.49, 23].map(d => zoneOf(lane, d))).toEqual([0, 0, 0]);
    expect([3.5, 5, 9.49].map(d => zoneOf(lane, d))).toEqual([1, 1, 1]);
    expect([9.5, 12, 15.5].map(d => zoneOf(lane, d))).toEqual([2, 2, 2]);
    expect([15.51, 19, 21.5].map(d => zoneOf(lane, d))).toEqual([3, 3, 3]);
    expect(zoneOf(lane, 21.51)).toBe(0);
  });

  test('one slow reaches every non-shared enemy in its quadrant, the boss for half as long; other quadrants stay', () => {
    const data = slowData();
    const s = quiet(data);
    placeUnitForTest(s, 'samtaegi', 2);
    const target = spawnEnemyForTest(s, 'japgwi', 3, 1e6);
    const sameZone = spawnEnemyForTest(s, 'japgwi', 23, 1e6);
    const boss = spawnEnemyForTest(s, 'jinegaksi3', 0.5, 1e6);
    const event = spawnEnemyForTest(s, 'ev_soebap', 22, 1e6);
    const shared = spawnEnemyForTest(s, 'yeoksin3', 1, 1e6);
    const nextZone = spawnEnemyForTest(s, 'japgwi', 5, 1e6);
    const far = spawnEnemyForTest(s, 'japgwi', 14, 1e6);
    step(s, []);
    const pct = pctOf(data);
    for (const e of [target, sameZone, event, boss]) expect(e.slow?.pct).toBeCloseTo(pct);
    expect(boss.slow!.ticks).toBeLessThan(sameZone.slow!.ticks);
    expect(shared.slow).toBeNull();
    expect(nextZone.slow).toBeNull();
    expect(far.slow).toBeNull();
  });

  test('an enemy exactly on the centre line belongs to the right-hand quadrant', () => {
    const t = quiet(slowData());
    placeUnitForTest(t, 'samtaegi', 3);
    const onLine = spawnEnemyForTest(t, 'japgwi', 3.5, 1e6);
    const sameSide = spawnEnemyForTest(t, 'japgwi', 6, 1e6);
    const left = spawnEnemyForTest(t, 'japgwi', 0.2, 1e6);
    step(t, []);
    expect(onLine.slow).not.toBeNull();
    expect(sameSide.slow).not.toBeNull();
    expect(left.slow).toBeNull();
  });

  test('an area slow over two quadrants reaches both', () => {
    const s = quiet(slowData());
    placeUnitForTest(s, 'samtaegi', 2);
    spawnEnemyForTest(s, 'japgwi', 3, 1e6);
    spawnEnemyForTest(s, 'japgwi', 3.8, 1e6); // inside the 1-cell radius, top-right
    const tl = spawnEnemyForTest(s, 'japgwi', 23, 1e6);
    const tr = spawnEnemyForTest(s, 'japgwi', 8, 1e6);
    const br = spawnEnemyForTest(s, 'japgwi', 12, 1e6);
    step(s, []);
    expect(tl.slow).not.toBeNull();
    expect(tr.slow).not.toBeNull();
    expect(br.slow).toBeNull();
  });

  test('the strongest slow is kept', () => {
    const s = quiet(slowData());
    placeUnitForTest(s, 'samtaegi', 2);
    spawnEnemyForTest(s, 'japgwi', 3, 1e6);
    const near = spawnEnemyForTest(s, 'japgwi', 1, 1e6);
    near.slow = { pct: 0.9, ticks: 5 };
    step(s, []);
    expect(near.slow).toEqual({ pct: 0.9, ticks: 4 });
  });

  test('a slow that only meets a shared visit slows no one', () => {
    const s = quiet(slowData());
    placeUnitForTest(s, 'samtaegi', 2);
    const shared = spawnEnemyForTest(s, 'yeoksin3', 3, 1e6);
    const near = spawnEnemyForTest(s, 'japgwi', 1, 1e6);
    step(s, []);
    expect(shared.slow).toBeNull();
    expect(near.slow).toBeNull();
  });

  test('periodic slows reach the quadrant too', () => {
    const s = quiet(d3);
    placeUnitForTest(s, 'meok', 2);
    spawnEnemyForTest(s, 'japgwi', 3, 1e6);
    const near = spawnEnemyForTest(s, 'japgwi', 22.5, 1e6);
    const far = spawnEnemyForTest(s, 'japgwi', 13, 1e6);
    step(s, []);
    expect(near.slow).not.toBeNull();
    expect(far.slow).toBeNull();
  });

  test('pctFactor scales every slow', () => {
    const s = quiet(slowData(d => { d.balance.zoneSlow = { pctFactor: 0.5 }; }));
    placeUnitForTest(s, 'samtaegi', 2);
    const t = spawnEnemyForTest(s, 'japgwi', 3, 1e6);
    step(s, []);
    expect(t.slow?.pct).toBeCloseTo(0.1);
  });

  test('without the flag a slow stays where it lands', () => {
    const s = quiet(slowData(d => { delete d.balance.zoneSlow; }));
    placeUnitForTest(s, 'samtaegi', 2);
    const t = spawnEnemyForTest(s, 'japgwi', 3, 1e6);
    const near = spawnEnemyForTest(s, 'japgwi', 1, 1e6);
    step(s, []);
    expect(t.slow?.pct).toBeCloseTo(0.2);
    expect(near.slow).toBeNull();
  });

  test('a refresh at the same strength sends no speed change', () => {
    const s = quiet(slowData());
    placeUnitForTest(s, 'samtaegi', 2);
    spawnEnemyForTest(s, 'japgwi', 3, 1e6);
    const near = spawnEnemyForTest(s, 'japgwi', 23, 1e6);
    step(s, []);
    s.slots[2]!.cooldown = 0;
    const r = step(s, []);
    expect(near.slow).not.toBeNull();
    expect(r.events.some(e => e.type === 'speedChange' && e.enemyId === near.id)).toBe(false);
  });
});

/** Stage 3 stun units before the pass: [id, range, stun seconds]. */
const STUN_BEFORE: [string, number, number[]][] = [
  ['bujipge', 2, [0.85]], ['indupan', 1.5, [0.6]], ['soemangchi', 1.5, [0.5]], ['top', 1.5, [1.25]],
  ['dongwe', 1.5, [0.85]], ['ssatba', 2, [1.15]], ['buk', 1.5, [1.2]], ['hahoetal', 2, [0.85]],
  ['gamtudokkaebi', 3, [0.4]], ['oedaridokkaebi', 1.5, [0.6]], ['gildal', 2, [0.5]], ['cheonnyeonmuseosot', 1.5, [0.5]],
  ['cheonnyeonjing', 3, [0.5]], ['ssireumdokkaebi', 1.5, [1.5]], ['satbadolgaejangsa', 1.5, [1]],
];

describe('stage 3 stun units', () => {
  test('stun lasts 1.5 times as long (to 0.05 s) and reaches half a cell further', () => {
    for (const [id, range, seconds] of STUN_BEFORE) {
      const u = d3.units.find(x => x.id === id)!;
      const stuns = u.skills.flatMap(sk => sk.effects).filter(e => e.kind === 'stun').map(e => (e as { seconds: number }).seconds);
      expect(u.range, id).toBe(range + 0.5);
      // half-up on hundredths: 0.85 × 1.5 = 1.275 → 1.3
      expect(stuns, id).toEqual(seconds.map(x => Math.round((Math.round(x * 100) * 1.5) / 5) * 5 / 100));
    }
  });

  test('every stage 3 stun unit is in the list, and stage 1 and 2 units are untouched', () => {
    const stage3Ids = new Set(d3.units.filter(u => !d2.units.some(x => x.id === u.id)).map(u => u.id));
    const withStun = d3.units.filter(u => stage3Ids.has(u.id) && u.skills.some(sk => sk.effects.some(e => e.kind === 'stun'))).map(u => u.id);
    expect(withStun.sort()).toEqual(STUN_BEFORE.map(([id]) => id).sort());
    for (const id of ['sotlid', 'gamasot', 'didilbangga', 'hamjibak', 'gawi']) {
      const two = d2.units.find(u => u.id === id)!;
      const three = d3.units.find(u => u.id === id)!;
      expect({ range: three.range, skills: three.skills }, id).toEqual({ range: two.range, skills: two.skills });
    }
  });
});

describe('validation', () => {
  test('the shipped data is valid', () => {
    expect(validateData(d3).errors).toEqual([]);
  });

  test('bad growth or slow factor is an error', () => {
    const bad = (patch: (d: GameData) => void) => validateData(makeData(patch, 'stage3')).errors;
    expect(bad(d => { d.balance.resistByRound = { fromRound: 30, toRound: 20, top: 0.4, cap: 0.8 }; })).toContain('invalid resistByRound');
    expect(bad(d => { d.balance.resistByRound = { fromRound: 0, toRound: 60, top: 0.4, cap: 0.8 }; })).toContain('invalid resistByRound');
    expect(bad(d => { d.balance.resistByRound = { fromRound: 20, toRound: 60, top: -0.1, cap: 0.8 }; })).toContain('invalid resistByRound');
    expect(bad(d => { d.balance.resistByRound = { fromRound: 20, toRound: 60, top: 0.4, cap: 1 }; })).toContain('invalid resistByRound');
    expect(bad(d => { d.balance.resistByRound = { fromRound: 20, toRound: 60, top: 0.4, cap: 0.4 }; })).toContain('resistByRound cap is below a base resist');
    expect(bad(d => { d.balance.zoneSlow = { pctFactor: 0 }; })).toContain('invalid zoneSlow');
    expect(bad(d => { d.balance.zoneSlow = { pctFactor: 1.5 }; })).toContain('invalid zoneSlow');
    expect(bad(d => { d.balance.resistByRound = { fromRound: 20, toRound: 60, top: 0.4, cap: 0.8 }; d.balance.rounds = 20; })).toContain('resistByRound toRound is past the last round');
  });
});
