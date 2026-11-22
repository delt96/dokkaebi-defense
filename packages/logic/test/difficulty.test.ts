import { expect, test } from 'vitest';
import { createGame, createMatch, loadGameData, matchHash, replayMatch, startRound, validateData } from '../src/index';

test.each([['easy', 4], ['normal', 3], ['hard', 2]] as const)('%s grants only the chosen round income', (difficulty, grant) => {
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
