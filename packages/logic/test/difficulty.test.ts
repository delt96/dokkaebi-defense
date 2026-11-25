import { expect, test } from 'vitest';
import { createGame, createMatch, enemyDef, enemyHp, loadGameData, matchHash, replayMatch, startRound, validateData } from '../src/index';

test.each([['easy', 3], ['normal', 3], ['hard', 3], ['hell', 2]] as const)('%s grants only the chosen round income', (difficulty, grant) => {
  const state = createGame(loadGameData('stage3'), 42, difficulty);
  expect([state.tokens, state.difficulty]).toEqual([4, difficulty]);
  for (const r of [1, 2, 3]) {
    startRound(state, r, []);
    expect(state.tokens).toBe(4 + r * grant);
  }
});

test('missing difficulty replays normal and a legacy lane earns normal income', () => {
  const data = loadGameData('stage3');
  const old = createMatch(data, 1, [1]);
  expect(old.options.difficulty).toBe('normal');
  expect(matchHash(old)).toBe(matchHash(createMatch(data, 1, [1], { difficulty: 'normal' })));
  const lane = old.lanes[1]!;
  delete lane.difficulty;
  startRound(lane, 1, []);
  expect(lane.tokens).toBe(7);
});

test('replays without difficulty match normal while hard produces a distinct checkpoint', () => {
  const data = loadGameData('stage3');
  const log = [{ tick: 610, inputs: [{ seat: 1, seq: 1, cmd: { type: 'forfeit' as const } }] }];
  const run = (difficulty?: 'normal' | 'hard') => replayMatch(data, 1, [1], log, 600, difficulty ? { difficulty } : {});
  expect(run()).toEqual(run('normal'));
  expect(run('hard')).not.toEqual(run('normal'));
});

test('stage two match ignores difficulty in options and lanes', () => {
  const data = loadGameData('stage2');
  expect(matchHash(createMatch(data, 1, [1], { difficulty: 'easy' }))).toBe(matchHash(createMatch(data, 1, [1])));
});

test.each(['stage1', 'stage2'] as const)('%s ignores difficulty', stage => {
  const data = loadGameData(stage);
  expect(createGame(data, 1, 'hard')).toEqual(createGame(data, 1));
});

test.each([undefined, 0, -1, 2.5])('invalid difficulty income %s', value => {
  const d = loadGameData('stage3');
  Object.assign(d.balance.difficulties!, { hard: value === undefined ? undefined : { tokensPerRound: value } });
  expect(validateData(d).errors.join(' ')).toContain('difficulties.hard');
});

test('easy ends at round 60 with 80% hp, normal keeps 70 rounds with 90% hp, hard is the shared data', () => {
  const base = loadGameData('stage3');
  const lane = (d: 'easy' | 'normal' | 'hard') => createGame(base, 1, d).data;
  expect(lane('hard')).toBe(base);
  const easy = lane('easy'), normal = lane('normal');
  expect([easy.balance.rounds, normal.balance.rounds]).toEqual([60, 70]);
  const japgwi = enemyDef(base, 'japgwi');
  for (const r of [10, 41, 66]) {
    expect(Math.abs(enemyHp(japgwi, r, normal.balance) - enemyHp(japgwi, r, base.balance) * 0.9)).toBeLessThanOrEqual(1);
  }
  const boss = (d: typeof base) => enemyDef(d, 'gangcheori6').hp!;
  expect([boss(easy), boss(normal)]).toEqual([Math.round(boss(base) * 0.8), Math.round(boss(base) * 0.9)]);
  expect(easy.coop!.yeoksin.map(y => y.stage)).toEqual([1, 2, 3, 4]);
  expect(easy.coop!.yeoksin[3]!.baseHp).toBe(Math.round(base.coop!.yeoksin[3]!.baseHp * 0.8));
  // event and hunt enemies keep their hp
  expect(enemyDef(easy, 'ev_ssireum').hp).toBe(enemyDef(base, 'ev_ssireum').hp);
});

test('hell plays the hard game on the shared data with two tokens a round', () => {
  const base = loadGameData('stage3');
  const hell = createGame(base, 1, 'hell');
  expect(hell.data).toBe(base);
  expect(hell.data.balance.rounds).toBe(70);
  const match = createMatch(base, 1, [1, 2], { difficulty: 'hell' });
  expect(match.data).toBe(base);
  expect(match.lanes[1]!.difficulty).toBe('hell');
});

test('a match derives its difficulty once, keeps the shared data version and ends easy at round 60', () => {
  const base = loadGameData('stage3');
  const easy = createMatch(base, 1, [1, 2], { difficulty: 'easy' });
  const hard = createMatch(base, 1, [1, 2], { difficulty: 'hard' });
  expect(easy.dataVersion).toBe(hard.dataVersion);
  expect(easy.lanes[1]!.data).toBe(easy.data);
  expect(easy.data.balance.rounds).toBe(60);
  expect(easy.seats[1]!.yeoksinDamage).toHaveLength(4);
  expect(Object.keys(easy.seats[1]!.bosses).map(Number)).toEqual([10, 20, 30, 40, 50, 60]);
});

test.each([[{ rounds: 55 }], [{ rounds: 80 }], [{ hpScale: 0 }], [{ hpScale: 3 }]])('invalid difficulty rule %j', rule => {
  const d = loadGameData('stage3');
  Object.assign(d.balance.difficulties!.easy, rule);
  expect(validateData(d).errors.join(' ')).toContain('difficulties.easy');
});
