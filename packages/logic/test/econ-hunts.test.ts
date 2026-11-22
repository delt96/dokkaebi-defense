import { describe, expect, test } from 'vitest';
import {
  countNormalEnemies, createGame, createMatch, econView, roundStartTick, huntCheck, loadGameData, matchHash, nextFloat, stepMatch, step, tameChance,
  validateData, type GameData, type GameEvent, type GameState, type MatchInput,
} from '../src/index';
import { forceRound, jumpToTick, makeData, spawnEnemyForTest } from '../src/testing';

const d3 = loadGameData('stage3');
const hunts = d3.economy!.hunts!;
const [first, second, third] = hunts.targets as [typeof hunts.targets[0], typeof hunts.targets[0], typeof hunts.targets[0]];
const TICKS = (s: number) => Math.round((s * 1000) / d3.balance.tickMs);

function lane(round: number, coins = 500): GameState {
  const s = createGame(d3, 1);
  forceRound(s, round);
  // no wave spawns, so the lane holds only what a test puts there
  s.spawned = d3.balance.spawnCount;
  s.coins = coins;
  s.buckwheat = 0;
  return s;
}

const summon = (s: GameState, enemy = first.enemy) => step(s, [{ type: 'hunt', enemy }]);
const reason = (s: GameState, enemy = first.enemy) => summon(s, enemy).rejected[0]?.reason ?? null;
const targetOf = (s: GameState, enemy = first.enemy) => s.enemies.find(e => e.defId === enemy);
const huntEvents = (events: GameEvent[]) => events.filter(e => e.type === 'hunt');

function kill(s: GameState, enemy = first.enemy): GameEvent[] {
  targetOf(s, enemy)!.hp = 0;
  return step(s, []).events;
}

describe('격파 data', () => {
  test('three targets open at rounds 5, 15 and 30 with their own HP, fee and pay', () => {
    expect(hunts.targets.map(t => [t.enemy, t.fromRound])).toEqual([['ev_soebap', 5], ['ev_oenun', 15], ['ev_yagwang', 30]]);
    expect(hunts.targets.map(t => t.reward.buckwheat)).toEqual([1, 1, 2]);
    expect([hunts.seconds, hunts.cooldownSeconds, hunts.hpGrowth]).toEqual([45, 20, 2]);
    for (const t of hunts.targets) expect(d3.enemies.find(e => e.id === t.enemy)!.event).toBe(true);
    expect(d3.economy).not.toHaveProperty('mission');
  });

  test('validate rejects broken hunt settings', () => {
    const broken = (patch: (d: GameData) => void) => validateData(makeData(patch, 'stage3')).errors;
    expect(validateData(d3).errors).toEqual([]);
    expect(broken(d => { d.economy!.hunts!.targets[0]!.enemy = 'japgwi'; })).toContain('hunt target must be an event enemy: japgwi');
    expect(broken(d => { d.economy!.hunts!.targets[1]!.enemy = 'ev_soebap'; })).toContain('duplicate hunt target: ev_soebap');
    expect(broken(d => { d.economy!.hunts!.targets[0]!.fromRound = 0; })).toContain('invalid hunt fromRound: ev_soebap');
    expect(broken(d => { d.economy!.hunts!.targets[0]!.hp = 1.5; })).toContain('invalid hunt hp: ev_soebap');
    expect(broken(d => { d.economy!.hunts!.targets[0]!.fee = -1; })).toContain('invalid hunt fee or reward: ev_soebap');
    expect(broken(d => { d.economy!.hunts!.targets[0]!.reward.coinsPerLevel = 0.5; })).toContain('invalid hunt fee or reward: ev_soebap');
    expect(broken(d => { d.economy!.hunts!.hpGrowth = 0.9; })).toContain('invalid hunts timing or growth');
    expect(broken(d => { d.economy!.hunts!.seconds = 0; })).toContain('invalid hunts timing or growth');
  });
});

describe('summon command', () => {
  test('pays the fee and brings a level-1 target into the own lane; the spawn carries its HP', () => {
    const s = lane(first.fromRound, 100);
    const r = summon(s);
    expect(r.rejected).toEqual([]);
    const t = targetOf(s)!;
    expect([t.hp, t.maxHp]).toEqual([first.hp, first.hp]);
    expect(s.coins).toBe(100 - first.fee);
    expect(r.events).toContainEqual({ type: 'spawn', enemyId: t.id, defId: first.enemy, hp: first.hp });
    expect(s.econ!.hunts![first.enemy]).toMatchObject({ level: 1, enemyId: t.id, deadlineTick: s.tick - 1 + TICKS(hunts.seconds) });
  });

  test('refused before its round, in preparation, without the fee, and for an unknown or stage-1 target', () => {
    expect(reason(lane(first.fromRound - 1))).toBe('huntClosed');
    expect(reason(lane(second.fromRound - 1), second.enemy)).toBe('huntClosed');
    expect(reason(lane(third.fromRound - 1), third.enemy)).toBe('huntClosed');
    expect(reason(createGame(d3, 1))).toBe('huntClosed');
    expect(reason(lane(first.fromRound, first.fee - 1))).toBe('noCoins');
    expect(reason(lane(40), 'ev_ssireum')).toBe('noTarget');
    expect(reason(lane(40), 'japgwi')).toBe('noTarget');
    const s1 = createGame(loadGameData('stage1'), 1);
    forceRound(s1, 5);
    s1.coins = 500;
    expect(reason(s1)).toBe('noTarget');
  });

  test('a refused summon changes nothing', () => {
    const s = lane(first.fromRound, first.fee - 1);
    const before = structuredClone({ coins: s.coins, enemies: s.enemies.length, econ: s.econ, nextId: s.nextId });
    summon(s);
    expect({ coins: s.coins, enemies: s.enemies.length, econ: s.econ, nextId: s.nextId }).toEqual(before);
  });

  test('one of each target at a time; different targets may be out together', () => {
    const s = lane(third.fromRound);
    summon(s);
    expect(reason(s)).toBe('huntOut');
    expect(summon(s, second.enemy).rejected).toEqual([]);
    expect(summon(s, third.enemy).rejected).toEqual([]);
    expect(hunts.targets.map(t => s.enemies.filter(e => e.defId === t.enemy).length)).toEqual([1, 1, 1]);
  });
});

describe('kill, level and pay', () => {
  test('a kill pays 묵 and coins, raises the level and the next summon is stronger and pays more', () => {
    const s = lane(first.fromRound);
    summon(s);
    const coins = s.coins;
    const ev = kill(s);
    expect(huntEvents(ev)).toEqual([{ type: 'hunt', enemy: first.enemy, level: 1, outcome: 'won', coins: first.reward.coins, buckwheat: 1 }]);
    expect([s.coins - coins, s.buckwheat]).toEqual([first.reward.coins, 1]);
    expect(s.econ!.hunts![first.enemy]).toMatchObject({ level: 2, enemyId: null, last: 'won' });
    s.tick = s.econ!.hunts![first.enemy]!.readyTick;
    summon(s);
    expect(targetOf(s)!.maxHp).toBe(Math.round(first.hp * hunts.hpGrowth));
    const c2 = s.coins;
    kill(s);
    expect(s.coins - c2).toBe(first.reward.coins + first.reward.coinsPerLevel);
    expect(s.econ!.hunts![first.enemy]!.level).toBe(3);
  });

  test('the third target pays 2 묵', () => {
    const s = lane(third.fromRound);
    summon(s, third.enemy);
    kill(s, third.enemy);
    expect(s.buckwheat).toBe(2);
  });

  test('a target is not a normal enemy: no limit count, no normal kill coin or count', () => {
    const s = lane(first.fromRound);
    summon(s);
    expect(countNormalEnemies(s)).toBe(0);
    const coins = s.coins;
    kill(s);
    expect(s.coins - coins).toBe(first.reward.coins);
    expect(s.econ!.roundKills).toBe(0);
  });
});

describe('time-out and cooldown', () => {
  test('at the time limit the target leaves with nothing paid; the level stays', () => {
    const s = lane(first.fromRound);
    summon(s);
    const t = targetOf(s)!;
    t.hp = t.maxHp = 1e9;
    const deadline = s.econ!.hunts![first.enemy]!.deadlineTick;
    s.tick = deadline - 1;
    step(s, []);
    expect(targetOf(s)).toBeDefined();
    const coins = s.coins;
    const ev = step(s, []).events;
    expect(targetOf(s)).toBeUndefined();
    expect(ev).toContainEqual({ type: 'flee', enemyId: t.id });
    expect(huntEvents(ev)).toEqual([{ type: 'hunt', enemy: first.enemy, level: 1, outcome: 'fled', coins: 0, buckwheat: 0 }]);
    expect([s.coins, s.buckwheat]).toEqual([coins, 0]);
    expect(s.econ!.hunts![first.enemy]).toMatchObject({ level: 1, enemyId: null, last: 'fled', readyTick: deadline + TICKS(hunts.cooldownSeconds) });
  });

  test('a target outlives the round end; only its own clock sends it away', () => {
    const s = lane(first.fromRound);
    s.tick = s.roundEndTick - 5;
    summon(s);
    targetOf(s)!.hp = targetOf(s)!.maxHp = 1e9;
    while (s.round === first.fromRound && s.phase !== 'ended') step(s, []);
    expect(targetOf(s)).toBeDefined();
  });

  test('a new summon opens only after the cooldown, after a kill or a time-out', () => {
    const s = lane(first.fromRound);
    summon(s);
    kill(s);
    const ready = s.econ!.hunts![first.enemy]!.readyTick;
    expect(ready).toBe(s.tick - 1 + TICKS(hunts.cooldownSeconds));
    s.tick = ready - 1;
    expect(reason(s)).toBe('cooldown');
    expect(huntCheck(s, first.enemy)).toBe(null);
    expect(summon(s).rejected).toEqual([]);
  });

  test('taming a summon ends it without pay or level; the cooldown runs', () => {
    const s = lane(first.fromRound);
    s.buckwheat = 5;
    summon(s);
    const t = targetOf(s)!;
    t.vulns['moru'] = { pct: 0.04, damageType: 'physical', ticks: 60, stacks: 5 };
    t.hp = 1;
    const chance = tameChance(d3, t.hp, t.maxHp);
    while (nextFloat({ ...s.econ!.rng.tame }) >= chance) nextFloat(s.econ!.rng.tame);
    const r = step(s, [{ type: 'tame', enemyId: t.id }]);
    expect(r.events.some(e => e.type === 'tame')).toBe(true);
    expect(huntEvents(r.events)).toEqual([]);
    expect(s.econ!.hunts![first.enemy]).toMatchObject({ level: 1, enemyId: null, last: 'tamed' });
    expect(reason(s)).toBe('cooldown');
  });
});

describe('snapshots, view and matches', () => {
  test('an economy snapshot from before 격파 loads: view shows level 1 and a summon works', () => {
    const s = lane(first.fromRound);
    delete s.econ!.hunts;
    const v = econView(s)!;
    expect(v.hunts.map(h => [h.enemy, h.level, h.best, h.why])).toEqual([
      [first.enemy, 1, 0, null], [second.enemy, 1, 0, 'huntClosed'], [third.enemy, 1, 0, 'huntClosed'],
    ]);
    expect(v.hunts[0]).toMatchObject({ hp: first.hp, fee: first.fee, reward: { coins: first.reward.coins, buckwheat: 1 }, enemyId: null });
    expect(summon(s).rejected).toEqual([]);
  });

  test('the view follows a summon: enemy, deadline, then level 2 and the cooldown', () => {
    const s = lane(first.fromRound);
    summon(s);
    expect(econView(s)!.hunts[0]).toMatchObject({ enemyId: targetOf(s)!.id, why: 'huntOut' });
    kill(s);
    expect(econView(s)!.hunts[0]).toMatchObject({ level: 2, best: 1, hp: Math.round(first.hp * hunts.hpGrowth), why: 'cooldown', last: 'won' });
  });

  test('in a match: only living seats summon, into their own lane; a fallen seat loses its summon', () => {
    const m = createMatch(d3, 7, [1, 2]);
    jumpToTick(m, roundStartTick(d3, first.fromRound));
    stepMatch(m, []);
    m.lanes[1]!.coins = 100;
    const r = stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'hunt', enemy: first.enemy } }]);
    expect(r.acks).toEqual([{ seat: 1, seq: 1, tick: r.tick, ok: true }]);
    expect(m.lanes[1]!.enemies.some(e => e.defId === first.enemy)).toBe(true);
    expect(m.lanes[2]!.enemies.some(e => e.defId === first.enemy)).toBe(false);
    const f = stepMatch(m, [{ seat: 1, seq: 2, cmd: { type: 'forfeit' } }]);
    expect(f.acks[0]!.ok).toBe(true);
    expect(m.lanes[1]!.enemies).toEqual([]);
    expect(m.lanes[1]!.econ!.hunts![first.enemy]!.enemyId).toBe(null);
    const dead = stepMatch(m, [{ seat: 1, seq: 3, cmd: { type: 'hunt', enemy: first.enemy } }]);
    expect(dead.acks[0]).toMatchObject({ ok: false, reason: 'notAlive' });
  });

  test('the same inputs replay to the same match', () => {
    const run = () => {
      const m = createMatch(d3, 11, [1, 2], { noElimination: true, noGate: true });
      jumpToTick(m, roundStartTick(d3, first.fromRound));
      const hashes: string[] = [];
      let seq = 0;
      while (m.round < first.fromRound + 3 && !m.result) {
        const inputs: MatchInput[] = m.tick % 200 === 0
          ? [{ seat: 1, seq: ++seq, cmd: { type: 'hunt', enemy: first.enemy } }] : [];
        stepMatch(m, inputs);
        if (m.tick % 500 === 0) hashes.push(matchHash(m));
      }
      return { hashes, hunt: m.lanes[1]!.econ!.hunts };
    };
    const a = run();
    expect(a.hunt).toBeDefined();
    expect(run()).toEqual(a);
  });

  test('a stray target record does not keep a summon blocked', () => {
    const s = lane(first.fromRound);
    summon(s);
    s.enemies = s.enemies.filter(e => e.defId !== first.enemy);
    step(s, []);
    expect(s.econ!.hunts![first.enemy]!.enemyId).toBe(null);
    spawnEnemyForTest(s, 'japgwi', 0);
  });
});
