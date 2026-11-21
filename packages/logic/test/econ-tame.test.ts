import { describe, expect, test } from 'vitest';
import {
  createGame, createMatch, loadGameData, roundStartTick, spawnEventEnemy, step, stepMatch, tameCheck, tameChance, validateData,
  type Enemy, type GameData, type GameEvent, type GameState,
} from '../src/index';
import { nextFloat } from '../src/rng';
import { forceRound, jumpToTick, placeUnitForTest, spawnEnemyForTest } from '../src/testing';

const d3 = loadGameData('stage3');
const tame = d3.economy!.tame!;

function lane(round: number, data: GameData = d3): GameState {
  const s = createGame(data, 1);
  forceRound(s, round);
  return s;
}

function fillOpen(s: GameState): void {
  for (let i = 0; i < s.slots.length; i++) if (s.open[i] && !s.slots[i]) placeUnitForTest(s, 'jipsin', i);
}

/** Moves the lane's tame stream until its next roll makes an attempt at `chance` succeed (or fail). */
function rig(s: GameState, success: boolean, chance: number): void {
  for (let k = 0; k < 1000; k++) {
    const roll = nextFloat({ ...s.econ!.rng.tame });
    if ((roll < chance) === success) return;
    nextFloat(s.econ!.rng.tame);
  }
  throw new Error('no roll found');
}

/** A round-20 lane whose wave boss is the slowed gangcheori, with the money for one attempt. */
function gangcheoriLane(hpFrac = 0.15): { s: GameState; boss: Enemy } {
  const s = lane(20);
  step(s, []);
  const boss = s.enemies.find(e => e.defId === 'gangcheori')!;
  boss.hp = Math.round(boss.maxHp * hpFrac);
  boss.slow = { pct: 0.3, ticks: 400 };
  s.buckwheat = 2;
  s.coins = 75;
  return { s, boss };
}

const kills = (ev: GameEvent[]) => ev.filter(e => e.type === 'kill');
const tries = (ev: GameEvent[]) => ev.filter(e => e.type === 'tameTry');

describe('tame odds by remaining HP', () => {
  test('every band boundary and just above it', () => {
    const at = (hp: number) => tameChance(d3, hp, 1000);
    expect([1, 150, 151, 300, 301, 500, 501, 750, 751, 1000].map(at))
      .toEqual([0.7, 0.7, 0.5, 0.5, 0.35, 0.35, 0.25, 0.25, 0.1, 0.1]);
    // the ratio is not rounded: 150.5/1000 is above 15%
    expect(tameChance(d3, 150.5, 1000)).toBe(0.5);
  });

  test('bands, heal, cooldown and costs come from the data and are validated', () => {
    const data = structuredClone(d3);
    data.economy!.tame!.hpBands = [{ upTo: 0.5, chance: 0.9 }, { upTo: 1, chance: 0.2 }];
    expect([tameChance(data, 500, 1000), tameChance(data, 501, 1000)]).toEqual([0.9, 0.2]);
    const bad = (edit: (t: NonNullable<GameData['economy']>['tame'] & object) => void) => {
      const d = structuredClone(d3);
      edit(d.economy!.tame!);
      return validateData(d).errors.length;
    };
    expect(bad(() => {})).toBe(0);
    expect(bad(t => { t.hpBands = [{ upTo: 0.5, chance: 0.5 }, { upTo: 0.3, chance: 0.5 }, { upTo: 1, chance: 0.1 }]; })).toBeGreaterThan(0);
    expect(bad(t => { t.hpBands = [{ upTo: 0.5, chance: 0.5 }]; })).toBeGreaterThan(0);
    expect(bad(t => { t.hpBands[0]!.chance = 1.2; })).toBeGreaterThan(0);
    expect(bad(t => { t.failureHealPct = -0.1; })).toBeGreaterThan(0);
    expect(bad(t => { t.cooldownSeconds = 0; })).toBeGreaterThan(0);
    expect(bad(t => { t.targets[0]!.cost = { coins: -1 }; })).toBeGreaterThan(0);
  });

  test('target costs (묵, 냥): R10/12/20/32/43', () => {
    const cost = (enemy: string) => {
      const c = tame.targets.find(t => t.enemy === enemy)!.cost;
      return [c.buckwheat ?? 0, c.coins ?? 0];
    };
    expect(['jinegaksi', 'ev_soebap', 'gangcheori', 'ev_ssireum', 'ev_shadow'].map(cost))
      .toEqual([[0, 30], [2, 65], [2, 75], [2, 90], [2, 105]]);
  });
});

describe('paid attempts', () => {
  test('R10 지네각시 can be tried at full HP with 0묵 and 30냥, not with 29냥', () => {
    const s = lane(10);
    step(s, []);
    const boss = s.enemies.find(e => e.defId === 'jinegaksi')!;
    expect(boss.hp).toBe(boss.maxHp);
    s.buckwheat = 0;
    s.coins = 29;
    expect(tameCheck(s, boss.id)).toBe('noCoins');
    s.coins = 30;
    expect(tameCheck(s, boss.id)).toBeNull();
    const m = createMatch(d3, 2, [1, 2]);
    jumpToTick(m, roundStartTick(d3, 10));
    stepMatch(m, []);
    const ml = m.lanes[1]!;
    const mb = ml.enemies.find(e => e.defId === 'jinegaksi')!;
    ml.buckwheat = 0;
    ml.coins = 30;
    expect(tameCheck(ml, mb.id)).toBeNull();
  });

  test('success: one roll, the target leaves with no kill, reward or drop, and one cost-zero recruit arrives', () => {
    const { s, boss } = gangcheoriLane(0.15);
    rig(s, true, 0.7);
    const other = structuredClone({ g: s.econ!.rng.marketGrade, u: s.econ!.rng.marketUnit, j: s.econ!.rng.jige, d: s.econ!.rng.drop, c: s.rng });
    const tameBefore = { ...s.econ!.rng.tame };
    const r = step(s, [{ type: 'tame', enemyId: boss.id }]);
    expect(r.rejected).toEqual([]);
    expect([s.buckwheat, s.coins]).toEqual([0, 0]);
    expect(kills(r.events)).toEqual([]);
    expect(s.enemies.some(e => e.id === boss.id)).toBe(false);
    expect(tries(r.events)).toEqual([{ type: 'tameTry', enemyId: boss.id, defId: 'gangcheori', chance: 0.7, success: true, buckwheat: 2, coins: 75, tokens: 0 }]);
    const recruits = s.slots.filter(u => u?.defId === 'gangcheori');
    expect(recruits).toHaveLength(1);
    expect(recruits[0]!.cost).toBe(0);
    // no R20 boss drop on a recruit
    expect(s.slots.filter(Boolean)).toHaveLength(1);
    const after = nextFloat({ ...tameBefore });
    expect(after).toBeLessThan(0.7);
    expect({ g: s.econ!.rng.marketGrade, u: s.econ!.rng.marketUnit, j: s.econ!.rng.jige, d: s.econ!.rng.drop }).toEqual({ g: other.g, u: other.u, j: other.j, d: other.d });
    expect(s.econ!.tamed).toEqual(['gangcheori']);
    // the round's boss is resolved: the round closes without a defeat
    s.tick = s.roundEndTick;
    step(s, []);
    expect(s.result).toBeNull();
  });

  test('failure: the cost is lost, the target heals 25% (rounded up, capped) and waits 5 s', () => {
    const { s, boss } = gangcheoriLane(0.15);
    rig(s, false, 0.7);
    const r = step(s, [{ type: 'tame', enemyId: boss.id }]);
    expect(tries(r.events)[0]).toMatchObject({ success: false, chance: 0.7 });
    expect([s.buckwheat, s.coins]).toEqual([0, 0]);
    expect(boss.hp).toBeLessThanOrEqual(Math.round(boss.maxHp * 0.15) + Math.ceil(boss.maxHp * 0.25));
    expect(boss.hp).toBeGreaterThan(Math.round(boss.maxHp * 0.15) + Math.ceil(boss.maxHp * 0.25) - 2000);
    const failTick = s.tick - 1;
    s.buckwheat = 2; s.coins = 75;
    const readyTick = failTick + 100;
    while (s.tick < readyTick - 1) step(s, []);
    const before = { ...s.econ!.rng.tame };
    // one tick early: refused, nothing spent and no roll
    expect(step(s, [{ type: 'tame', enemyId: boss.id }]).rejected.map(x => x.reason)).toEqual(['cooldown']);
    expect([s.buckwheat, s.coins, s.econ!.rng.tame]).toEqual([2, 75, before]);
    expect(step(s, [{ type: 'tame', enemyId: boss.id }]).rejected).toEqual([]);
  });

  test('heal: at 90% the target is back to full; at exactly 15% it reaches 40%', () => {
    const a = gangcheoriLane(0.9);
    rig(a.s, false, 0.1);
    a.boss.d = 0;
    step(a.s, [{ type: 'tame', enemyId: a.boss.id }]);
    expect(a.boss.hp).toBe(a.boss.maxHp);
    const s = lane(10);
    step(s, []);
    const j = s.enemies.find(e => e.defId === 'jinegaksi')!;
    j.maxHp = 1001;
    j.hp = 150.15;
    s.coins = 30;
    rig(s, false, 0.7);
    s.slots.fill(null);
    step(s, [{ type: 'tame', enemyId: j.id }]);
    expect(j.hp).toBeCloseTo(150.15 + Math.ceil(1001 * 0.25), 5);
  });

  test('two failed attempts then a kill: two full costs and one ordinary boss payout', () => {
    const { s, boss } = gangcheoriLane(0.15);
    s.buckwheat = 4; s.coins = 150;
    rig(s, false, 0.7);
    step(s, [{ type: 'tame', enemyId: boss.id }]);
    for (let k = 0; k < 100; k++) step(s, []);
    boss.hp = Math.round(boss.maxHp * 0.15);
    rig(s, false, 0.7);
    expect(step(s, [{ type: 'tame', enemyId: boss.id }]).rejected).toEqual([]);
    expect([s.buckwheat, s.coins]).toEqual([0, 0]);
    boss.hp = 0;
    const r = step(s, []);
    expect(kills(r.events).map(k => k.enemyId)).toContain(boss.id);
    expect([s.buckwheat, s.coins]).toEqual([2, 60]);
  });

  test('refusals spend nothing and draw nothing', () => {
    const cases: [string, (x: ReturnType<typeof gangcheoriLane>) => void, string][] = [
      ['no slot', x => fillOpen(x.s), 'noSlot'],
      ['slow lost', x => { x.boss.slow = null; }, 'tameCondition'],
      ['coins', x => { x.s.coins = 74; }, 'noCoins'],
      ['muk', x => { x.s.buckwheat = 1; }, 'noBuckwheat'],
    ];
    for (const [name, edit, reason] of cases) {
      const x = gangcheoriLane();
      edit(x);
      const before = structuredClone({ b: x.s.buckwheat, c: x.s.coins, r: x.s.econ!.rng.tame });
      const r = step(x.s, [{ type: 'tame', enemyId: x.boss.id }]);
      expect(r.rejected.map(y => y.reason), name).toEqual([reason]);
      expect({ b: x.s.buckwheat, c: x.s.coins, r: x.s.econ!.rng.tame }, name).toEqual(before);
    }
  });

  test('beast: 4 stacks refused, 5 stacks accepted; a recruit counts as down and pays only on full completion', () => {
    const s = lane(12);
    s.coins = 200;
    step(s, [{ type: 'missionEnter' }]);
    const beast = s.enemies.find(e => e.defId === 'ev_soebap')!;
    beast.vulns['moru'] = { pct: 0.04, damageType: 'physical', ticks: 60, stacks: 4 };
    s.buckwheat = 2;
    expect(step(s, [{ type: 'tame', enemyId: beast.id }]).rejected[0]!.reason).toBe('tameCondition');
    beast.vulns['moru'] = { pct: 0.04, damageType: 'physical', ticks: 60, stacks: 5 };
    rig(s, true, tameChance(d3, beast.hp, beast.maxHp));
    const r = step(s, [{ type: 'tame', enemyId: beast.id }]);
    expect(r.rejected).toEqual([]);
    expect(tries(r.events)[0]).toMatchObject({ success: true, buckwheat: 2, coins: 65 });
    expect(s.buckwheat).toBe(0);
    expect(s.econ!.mission.beastDown).toBe(true);
    expect(s.econ!.events.some(e => e.id === beast.id)).toBe(false);
    expect(s.slots.some(u => u?.defId === 'bulgasari')).toBe(true);
  });

  test('ssireum and shadow recruits pay no 묵 and no coins', () => {
    const s = lane(32);
    const w = spawnEventEnemy(s, 'ssireum', []);
    s.buckwheat = 2; s.coins = 90;
    rig(s, true, tameChance(d3, w.hp, w.maxHp));
    expect(step(s, [{ type: 'tame', enemyId: w.id }]).rejected).toEqual([]);
    expect([s.buckwheat, s.coins]).toEqual([0, 0]);
    expect(s.slots.some(u => u?.defId === 'ssireumdokkaebi')).toBe(true);
    const h = lane(43);
    const sh = h.enemies.find(e => e.defId === 'ev_shadow')!;
    h.buckwheat = 2; h.coins = 105;
    rig(h, true, tameChance(d3, sh.hp, sh.maxHp));
    expect(step(h, [{ type: 'tame', enemyId: sh.id }]).rejected).toEqual([]);
    expect([h.buckwheat, h.coins]).toEqual([0, 0]);
  });

  test('ssireum can be tried 399 ticks after it appears, not at 400 (it has fled)', () => {
    for (const [late, ok] of [[399, true], [400, false]] as const) {
      const s = lane(32);
      const w = spawnEventEnemy(s, 'ssireum', []);
      s.buckwheat = 2; s.coins = 90;
      s.tick += late;
      const r = step(s, [{ type: 'tame', enemyId: w.id }]);
      expect(r.rejected.length === 0, String(late)).toBe(ok);
    }
  });

  test('a T and a lethal hit on the same tick: the command comes first; after a kill T finds no target', () => {
    const { s, boss } = gangcheoriLane();
    for (let i = 0; i < 6; i++) placeUnitForTest(s, 'cheonnyeonjing', i);
    boss.d = 1;
    boss.hp = 1;
    rig(s, true, 0.7);
    const r = step(s, [{ type: 'tame', enemyId: boss.id }]);
    expect(kills(r.events)).toEqual([]);
    expect(s.slots.some(u => u?.defId === 'gangcheori')).toBe(true);
    const b = gangcheoriLane();
    b.boss.hp = 0;
    step(b.s, []);
    expect(step(b.s, [{ type: 'tame', enemyId: b.boss.id }]).rejected[0]!.reason).toBe('noTarget');
  });

  test('jinegaksi3, a yeoksin and ordinary enemies are not tameable', () => {
    const s = lane(30);
    const j = spawnEnemyForTest(s, 'jinegaksi3', 2);
    expect(tameCheck(s, j.id)).toBe('noTarget');
    const y = spawnEnemyForTest(s, 'yeoksin1', 2, 10);
    expect(tameCheck(s, y.id)).toBe('noTarget');
    expect(tameCheck(s, 99999)).toBe('noTarget');
  });

  test('in a match a recruited round-20 boss resolves the seat clock without a kill or a timeout', () => {
    const m = createMatch(d3, 1, [1]);
    jumpToTick(m, roundStartTick(d3, 20));
    stepMatch(m, []);
    const lane1 = m.lanes[1]!;
    const boss = lane1.enemies.find(e => e.defId === 'gangcheori')!;
    boss.slow = { pct: 0.3, ticks: 400 };
    lane1.buckwheat = 2; lane1.coins = 75;
    rig(lane1, true, tameChance(d3, boss.hp, boss.maxHp));
    const r = stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'tame', enemyId: boss.id } }]);
    expect(r.acks[0]).toMatchObject({ ok: true });
    expect(m.seats[1]!.bosses[20]!.status).toBe('tamed');
    expect(r.events.some(e => e.type === 'bossKilled')).toBe(false);
    for (let k = 0; k < 2000 && m.seats[1]!.alive && m.round === 20; k++) stepMatch(m, []);
    expect(m.seats[1]!.alive).toBe(true);
  });
});

describe('personal boss payouts', () => {
  test('each of the six bosses pays 60냥 and 2묵 on a kill; drops at 20, 40 and 50', () => {
    let muk = 0;
    for (const round of [10, 20, 30, 40, 50, 60]) {
      const s = lane(round);
      step(s, []);
      const boss = s.enemies.find(e => e.boss)!;
      const [c, b] = [s.coins, s.buckwheat];
      boss.hp = 0;
      step(s, []);
      expect([s.coins - c, s.buckwheat - b], String(round)).toEqual([60, 2]);
      muk += s.buckwheat - b;
      expect(s.slots.filter(Boolean).length + s.econ!.pendingDrops.length, String(round)).toBe([20, 40, 50].includes(round) ? 1 : 0);
    }
    expect(muk).toBe(12);
  });

  test('a boss that outlives its round pays nothing', () => {
    const s = lane(10);
    step(s, []);
    const b = s.buckwheat;
    s.tick = s.roundEndTick;
    step(s, []);
    expect(s.result?.outcome).toBe('defeat');
    expect(s.buckwheat).toBe(b);
  });
});
