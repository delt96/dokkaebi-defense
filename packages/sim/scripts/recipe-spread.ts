import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataSources, loadGameData, type GameData } from '@dorandi/logic';
import { combineGainAll } from '../src/stage3/combineGain';
import {
  applySwaps, changedRecipes, editableRecipes, leafCounts, searchSpread, spreadDemand, spreadLowerBound, swapProblems, targetMisses,
  type Swap,
} from '../src/stage3/spread';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

function seedList(text: string): number[] {
  return text.split(',').flatMap(part => {
    const [a, b] = part.split('-').map(Number);
    return b === undefined ? [a!] : Array.from({ length: b - a! + 1 }, (_, i) => a! + i);
  });
}

const data = loadGameData('stage3');
const editable = editableRecipes(dataSources());
const name = (id: string) => data.units.find(u => u.id === id)!.name;
const ban = arg('ban', '').split(',').filter(Boolean).map(s => { const [result, material] = s.split(':'); return { result: result!, material: material! }; });
const keep = new Set(arg('keep', '').split(',').filter(Boolean));
const combine = arg('combine', 'on') !== 'off';
const iterations = Number(arg('iterations', '200000'));
const allowFile = arg('allow', '');
const allow = allowFile ? JSON.parse(readFileSync(allowFile, 'utf8')) as Record<string, Record<string, string[]>> : undefined;

function distribution(d: GameData): string {
  const demand = spreadDemand(d);
  const rows = ['| 재료 등급 | 유닛 수 | 평균 수요 | 분포 (수요: 유닛 수) | 1곳뿐 | 5곳 이상 |', '|---|---:|---:|---|---|---|'];
  for (let g = 1; g <= 5; g++) {
    const us = d.units.filter(u => u.grade === g && !u.hidden);
    const ns = us.map(u => demand.get(u.id)!);
    const counts = new Map<number, number>();
    for (const n of ns) counts.set(n, (counts.get(n) ?? 0) + 1);
    const dist = [...counts].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n}:${c}`).join(' ');
    const singles = us.filter(u => demand.get(u.id) === 1).map(u => u.name).join(' ') || '없음';
    const many = us.filter(u => demand.get(u.id)! >= 5).map(u => `${u.name} ${demand.get(u.id)}`).join(', ') || '없음';
    rows.push(`| ${g} | ${us.length} | ${(ns.reduce((a, b) => a + b, 0) / us.length).toFixed(1)} | ${dist} | ${singles} | ${many} |`);
  }
  return rows.join('\n');
}

function solution(seed: number): string {
  const swaps = searchSpread(data, editable, { seed, iterations, ban, keep, allow });
  const after = applySwaps(data, swaps);
  const before = spreadDemand(data);
  const now = spreadDemand(after);
  const results = changedRecipes(swaps);
  const lines = [`## 해 seed ${seed}`, '', `바뀐 조합 ${results.length}개, 바뀐 재료 칸 ${swaps.length}개 (칸 하한 ${spreadLowerBound(data)})`, ''];
  const problems = [...swapProblems(data, editable, swaps), ...targetMisses(after)];
  if (problems.length) lines.push('**문제:**', ...problems.map(p => `- ${p}`), '');

  lines.push('| 결과 | 바꾸기 전 | 바꾼 뒤 | 수요 변화 |', '|---|---|---|---|');
  for (const result of results) {
    const was = data.recipes.find(r => r.result === result && r.kind !== 'tame')!.materials;
    const is = after.recipes.find(r => r.result === result && r.kind !== 'tame')!.materials;
    const moves = swaps.filter((s: Swap) => s.result === result)
      .map(s => `${name(s.from)} ${before.get(s.from)}→${now.get(s.from)}, ${name(s.to)} ${before.get(s.to)}→${now.get(s.to)}`).join(' / ');
    lines.push(`| ${name(result)} | ${was.map(name).join(' + ')} | ${is.map(name).join(' + ')} | ${moves} |`);
  }

  lines.push('', '### 수요 분포 (전 → 후)', '', '전:', '', distribution(data), '', '후:', '', distribution(after), '');

  lines.push('### 6등급 가장 많이 기다리던 1등급 재료 (전 → 후)', '', '| 6등급 | 전 | 후 | 표시 |', '|---|---|---|---|');
  for (const u of data.units.filter(x => x.grade === 6 && !x.hidden)) {
    const top = (d: GameData) => [...leafCounts(d, u.id)].sort((a, b) => b[1] - a[1])[0]!;
    const [bId, bN] = top(data);
    const [aId, aN] = top(after);
    if (bId === aId && bN === aN && JSON.stringify([...leafCounts(data, u.id)].sort()) === JSON.stringify([...leafCounts(after, u.id)].sort())) continue;
    lines.push(`| ${u.name} | ${name(bId)} ${bN} | ${name(aId)} ${aN} | ${aN - bN > 3 ? '3 넘게 늘어남' : ''} |`);
  }

  if (combine) {
    const seeds = Number(arg('combine-seeds', '3'));
    const base = combineGainAll(data, { seeds, results });
    const rows = combineGainAll(after, { seeds, results });
    lines.push('', `### 조합 손익 (바뀐 조합, ${seeds}시드, 남은 적 수 A 재료 유지 / B 조합 뒤)`, '');
    lines.push('| 결과 | 시나리오 | 기준 A / B | 후보 A / B | 판정 |', '|---|---|---|---|---|');
    rows.forEach((r, i) => {
      const b = base[i]!;
      if (b.pass && r.pass) return;
      const verdict = r.pass ? '좋아짐' : b.pass ? '새 실패' : '둘 다 실패';
      lines.push(`| ${name(r.result)} | ${r.scenario} | ${b.aMean.toFixed(2)} / ${b.bMean.toFixed(2)} | ${r.aMean.toFixed(2)} / ${r.bMean.toFixed(2)} | ${verdict} |`);
    });
    const count = (xs: { pass: boolean }[]) => xs.filter(x => !x.pass).length;
    lines.push('', `실패 행: 기준 ${count(base)} → 후보 ${count(rows)} (전체 ${rows.length}행)`);
  }
  return lines.join('\n') + '\n';
}

const out = arg('out', 'sim-out/spread');
mkdirSync(out, { recursive: true });
const doc = ['# 조합 재료 교체 후보', '', `ban: ${arg('ban', '') || '없음'} / keep: ${[...keep].join(',') || '없음'} / allow: ${allowFile || '없음'}`, '', ...seedList(arg('seeds', '1')).map(solution)].join('\n');
writeFileSync(join(out, 'candidates.md'), doc);
console.log(doc);
