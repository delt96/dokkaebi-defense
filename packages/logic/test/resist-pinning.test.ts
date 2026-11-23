import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { buildGameData, canonicalJson, createMatch, dataSources, fnv1a, loadGameData, type GameData } from '../src/index';

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
