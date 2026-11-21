import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RecordedMatch } from '@dorandi/logic';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const worker = `
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createMatch, loadGameData, buildFull, matchHash, replayMatch, stepMatch } from './packages/logic/src/index.ts';
const r = JSON.parse(readFileSync(0, 'utf8'));
const data = loadGameData(r.stage);
const match = createMatch(data, r.seed, r.seats, r.options);
assert.equal(match.dataVersion, r.dataVersion, '기록과 게임 데이터 버전이 다릅니다.');
if (r.checkpoint) {
  const inputs = new Map(r.log.map(e => [e.tick, e.inputs]));
  while (match.tick < r.checkpoint.tick && !match.result) stepMatch(match, inputs.get(match.tick) ?? []);
  assert.equal(matchHash(match), r.checkpoint.hash);
  assert.deepEqual(buildFull(match, 1, { watching: 1, names: {}, key: 'test', n: 0 }).mine.econ, r.checkpoint.mine);
  stepMatch(match, inputs.get(match.tick));
  assert.deepEqual(match.lanes[2].slots[0], r.delivered);
  assert.equal(match.lanes[2].buckwheat, r.buckwheat);
}
console.log(JSON.stringify(replayMatch(data, r.seed, r.seats, r.log, 100, r.options)));
`;

export async function replayRecorded(record: RecordedMatch): Promise<[number, string][]> {
  const revision = record.rulesRevision;
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error('기록의 빌드 버전을 확인해 주세요.');
  execFileSync('git', ['merge-base', '--is-ancestor', revision, 'HEAD'], { cwd: root });
  const base = join(root, '.superpowers');
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, 'replay-'));
  try {
    const archive = join(dir, 'source.tar');
    execFileSync('git', ['archive', '--output', archive, revision, 'packages/logic', 'package.json', 'package-lock.json'], { cwd: root });
    execFileSync('tar', ['-xf', 'source.tar'], { cwd: dir });
    if (!readFileSync(join(dir, 'package-lock.json')).equals(readFileSync(join(root, 'package-lock.json')))) {
      throw new Error('해당 버전의 의존성을 설치한 작업 폴더에서 실행해 주세요.');
    }
    writeFileSync(join(dir, 'worker.mts'), worker);
    const output = execFileSync(process.execPath, ['--import', 'tsx', 'worker.mts'], {
      cwd: dir, input: JSON.stringify(record), encoding: 'utf8',
    });
    return JSON.parse(output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raw = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
  const record = Array.isArray(raw) ? { ...JSON.parse(readFileSync(process.argv[3]!, 'utf8')), log: raw } : raw;
  console.log(JSON.stringify(await replayRecorded(record)));
}
