import { describe, expect, test } from 'vitest';
import { createMatch, loadGameData, matchHash, replayMatch, stepMatch } from '../src/index';

const data = loadGameData('stage2');

describe('replayMatch', () => {
  test('the last hash is taken on the end tick even when it is not a multiple of every', () => {
    const log = [{ tick: 0, inputs: [{ seat: 1, seq: 1, cmd: { type: 'forfeit' as const } }] }];
    const m = createMatch(data, 3, [1]);
    stepMatch(m, log[0]!.inputs);
    expect(m.result).not.toBeNull();
    expect(replayMatch(data, 3, [1], log)).toEqual([[m.tick, matchHash(m)]]);
  });
});

test('legacy recording settles its story and delivery under the recorded revision', async () => {
  const { replayRecorded } = await import('../../sim/scripts/replay-version');
  const { default: fixture } = await import('./fixtures/stage3-legacy-replay.json');
  expect(await replayRecorded({ ...fixture, stage: 'stage3' })).toEqual(fixture.hashes);
  expect(fixture.checkpoint.mine.story.target).toBe('cheonnyeonjing');
  expect(fixture.checkpoint.mine.transfer.offer.to).toBe(2);
  expect(fixture.buckwheat).toBe(1);
}, 30_000); // extracts the recorded build and replays it; slow when the machine is busy

test('the archived pre-gamble engine treats both gamble inputs as rejected', async () => {
  const { replayRecorded } = await import('../../sim/scripts/replay-version');
  const old = createMatch(loadGameData('stage3'), 3, [1, 2]);
  const record = {
    rulesRevision: '0d98d7a50098d646513c13b4f5576ee62762a2b4',
    dataVersion: 'bda95206', stage: 'stage3' as const, seed: old.seed, seats: old.ring, options: old.options,
    log: [{ tick: 0, inputs: [
      { seat: 1, seq: 1, cmd: { type: 'gambleCoins', stake: 10 } },
      { seat: 2, seq: 1, cmd: { type: 'gambleUnit', table: 'small' } },
    ] }],
  };
  const invalid = record.log.map(({ tick, inputs }) => ({
    tick, inputs: inputs.map(input => ({ ...input, cmd: { type: 'invalid' as const } })),
  }));
  expect(await replayRecorded(record)).toEqual(await replayRecorded({ ...record, log: invalid }));
}, 30_000);

test('the pinned pre-bundle replay accepts both its retired draw and its unit gamble', async () => {
  const { replayRecorded } = await import('../../sim/scripts/replay-version');
  const { default: fixture } = await import('./fixtures/stage3-pre-bundle-replay.json');
  const record = { ...fixture, stage: 'stage3' as const, options: { ...fixture.options, difficulty: 'easy' as const } };
  expect((await replayRecorded(record)).at(-1)).toEqual(fixture.finalHash);
  for (const retired of ['buy', 'gambleUnit']) {
    const log = record.log.map(entry => ({
      ...entry, inputs: entry.inputs.map(input => input.cmd.type === retired ? { ...input, cmd: { type: 'invalid' } } : input),
    }));
    expect((await replayRecorded({ ...record, log })).at(-1)).not.toEqual(fixture.finalHash);
  }
}, 30_000);

test('a pinned hunt replay reopens the target at the archived shared cooldown', async () => {
  const { replayRecorded } = await import('../../sim/scripts/replay-version');
  const { default: fixture } = await import('./fixtures/stage3-shared-hunt-cooldown-replay.json');
  const record = { ...fixture, stage: 'stage3' as const, options: { ...fixture.options, difficulty: 'easy' as const } };
  expect((await replayRecorded(record)).at(-1)).toEqual(fixture.finalHash);

  // The preceding attempt was too early, but the one on the old ready tick changed the match.
  const withoutAttempt = (i: number) => ({ ...record, log: record.log.filter((_, j) => j !== i) });
  expect((await replayRecorded(withoutAttempt(1))).at(-1)).toEqual(fixture.finalHash);
  expect((await replayRecorded(withoutAttempt(2))).at(-1)).not.toEqual(fixture.finalHash);
}, 30_000);
