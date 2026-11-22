import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import {
  buildGameData, canonicalJson, createMatch, dataSources, fnv1a, laneSeed, loadGameData, replayMatch, roundStartTick, stepMatch,
  type GameData, type InputLogEntry,
} from '../src/index';

// The last build before the resist pass: its rooms and recordings keep its rules.
const BEFORE = '8ce2c20df4696a9996b355c87c3728dc6d753683';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const show = (file: string): unknown =>
  JSON.parse(execFileSync('git', ['show', `${BEFORE}:packages/logic/data/stage3/${file}.json`], { cwd: root, encoding: 'utf8' }));

function dataBefore(): GameData {
  const src = dataSources();
  const s3 = src.stage3 as Record<string, unknown>;
  for (const file of ['units', 'recipes', 'enemies', 'waves', 'balance', 'onBasicHit', 'economy', 'coop']) s3[file] = show(file);
  return buildGameData('stage3', src);
}

const version = (d: GameData) => fnv1a(canonicalJson(d, new Set()));

test('the resist pass is a new stage 3 data version, so older rooms and pages refuse each other', () => {
  const before = dataBefore();
  expect(before.balance.vulnCutsResist).toBeUndefined();
  expect(version(loadGameData('stage3'))).not.toBe(version(before));
  expect(createMatch(loadGameData('stage3'), 1, [1]).dataVersion).not.toBe(createMatch(before, 1, [1]).dataVersion);
});

test('this engine plays the pre-pass data exactly like the archived build', async () => {
  const { replayRecorded } = await import('../../sim/scripts/replay-version');
  const { EconDriver } = await import('../../sim/src/stage3/econDriver');
  const { synergyBot } = await import('../../sim/src/stage3/econBot');
  const before = dataBefore();
  const seats = [1, 2];
  const options = { difficulty: 'normal' as const };
  // two synergy bots to round 30 make slows, stuns and weakening land; their inputs become the recording
  const match = createMatch(before, 5, seats, options);
  const driver = new EconDriver(match, seats.map(s => synergyBot(laneSeed(5, s), { quests: true, tame: true, jige: true, hunts: true })));
  const end = roundStartTick(before, 31);
  const log: InputLogEntry[] = [];
  const seen = { slow: 0, stun: 0, vuln: 0 };
  while (match.tick < end && match.result === null) {
    const inputs = driver.inputs();
    if (inputs.length) log.push({ tick: match.tick, inputs });
    stepMatch(match, inputs);
    for (const seat of seats) {
      const enemies = match.lanes[seat]!.enemies;
      if (enemies.some(e => e.slow)) seen.slow++;
      if (enemies.some(e => e.stunTicks > 0)) seen.stun++;
      if (enemies.some(e => Object.keys(e.vulns).length)) seen.vuln++;
    }
  }
  log.push({ tick: match.tick, inputs: seats.map(seat => ({ seat, seq: 100_000, cmd: { type: 'forfeit' as const } })) });
  expect(Math.min(seen.slow, seen.stun, seen.vuln)).toBeGreaterThan(100);

  const now = replayMatch(before, match.seed, match.ring, log, 100, options);
  const archived = await replayRecorded({
    rulesRevision: BEFORE, dataVersion: match.dataVersion, stage: 'stage3', seed: match.seed, seats: match.ring, options, log,
  });
  expect(now.length).toBeGreaterThan(250);
  expect(now).toEqual(archived);
}, 120_000); // plays two bot seats to round 30, then extracts the archived build and replays it
