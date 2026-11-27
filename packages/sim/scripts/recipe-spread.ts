import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataSources, loadGameData, type GameData, type RecipeDef } from '@dorandi/logic';
import { combineGainAll } from '../src/stage3/combineGain';
import { goal6, recipesFile, v7Goals, withNewUnits, type NewUnitOverlay, type V7Goals } from '../src/stage3/newUnits';
import {
  applySwaps, changedRecipes, editableRecipes, grade1Totals, leafCounts, searchSpread, spreadDemand, spreadLowerBound, swapProblems,
  targetMisses, type SpreadSearchOptions, type SpreadRules, type Swap,
} from '../src/stage3/spread';
import { summonReport } from '../src/stage3/summonSim';

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

const overlayFile = arg('new-units', '');
const overlay: NewUnitOverlay = overlayFile ? JSON.parse(readFileSync(overlayFile, 'utf8')) : { units: [], recipes: [] };
const newIds = overlay.units.map(u => u.id);
const data = withNewUnits(loadGameData('stage3'), overlay);
const editable = new Set([...editableRecipes(dataSources()), ...overlay.recipes.map(r => r.result)]);
const name = (id: string) => data.units.find(u => u.id === id)!.name;
const ban = arg('ban', '').split(',').filter(Boolean).map(s => { const [result, material] = s.split(':'); return { result: result!, material: material! }; });
const keep = new Set(arg('keep', '').split(',').filter(Boolean));
const combine = arg('combine', 'on') !== 'off';
const iterations = Number(arg('iterations', '200000'));
const allowFile = arg('allow', '');
const allow = allowFile ? JSON.parse(readFileSync(allowFile, 'utf8')) as Record<string, Record<string, string[]>> : undefined;
const rules: SpreadRules = { crossFamily: arg('cross-family', 'off') === 'on', unlockGrade1: arg('unlock-grade1', 'off') === 'on' };
const weight = (flag: string) => Number(arg(flag, '0'));
const capOf = (id: string) => (data.units.find(u => u.id === id)!.grade === 5 ? 4 : 7);
const searchOpts: Omit<SpreadSearchOptions, 'seed'> = {
  iterations, ban, keep, allow, rules,
  balance: weight('balance-weight') > 0 ? { weight: weight('balance-weight'), max: 1.1, min: 0.9 } : undefined,
  topCap: weight('cap-weight') > 0
    ? { weight: weight('cap-weight'), cap: Number(arg('cap', '10')), perUnit: Object.fromEntries(newIds.map(id => [id, capOf(id)])) }
    : undefined,
  leftover: weight('leftover-weight') > 0 && newIds.length ? { weight: weight('leftover-weight'), units: newIds, min: 0.6 } : undefined,
};
const writeRecipes = arg('write-recipes', 'off') === 'on';
const summonRuns = Number(arg('summon-runs', '200'));
const out = arg('out', 'sim-out/spread');

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

function grade1Table(before: GameData, after: GameData): string {
  const b = grade1Totals(before);
  const a = grade1Totals(after);
  const mean = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0) / m.size;
  const mb = mean(b);
  const ma = mean(a);
  const rows = ['| 1등급 | 계열 | 전 | 후 | 평균 대비 (전 → 후) |', '|---|---|---:|---:|---|'];
  for (const u of before.units.filter(x => x.grade === 1)) {
    rows.push(`| ${u.name} | ${u.damageType === 'physical' ? '물' : '마'} | ${b.get(u.id)} | ${a.get(u.id)} | ${(b.get(u.id)! / mb).toFixed(2)} → ${(a.get(u.id)! / ma).toFixed(2)} |`);
  }
  rows.push('', `평균 ${mb.toFixed(1)} → ${ma.toFixed(1)}`);
  return rows.join('\n');
}

const mark = (pass: boolean) => (pass ? '통과' : '미달');
const names = (ids: string[]) => ids.map(name).join(' ') || '없음';

function goalTable(before: V7Goals, after: V7Goals): string {
  const ratio = (g: V7Goals) => `최대 ${g.g1.maxRatio.toFixed(2)} / 최소 ${g.g1.minRatio.toFixed(2)}`;
  const rows = ['| 목표 | 기준 | 전 | 후 | 판정 |', '|---|---|---|---|---|',
    `| g1 1등급 총수요 | 최대/평균 ≤ 1.10, 최소/평균 ≥ 0.90 | ${ratio(before)} | ${ratio(after)} | ${mark(after.g1.pass)} |`,
    `| g2 6등급 최다 1등급 | 10개 넘는 6등급 없음 | ${before.g2.over10.length}종 | ${after.g2.over10.length}종 (${names(after.g2.over10)}) | ${mark(after.g2.pass)} |`,
    `| g2 참고 | 9개 넘는 6등급 | ${before.g2.over9.length}종 | ${after.g2.over9.length}종 | |`];
  after.g3.forEach((g, i) => {
    const was = before.g3[i]!;
    rows.push(`| g3 ${name(g.id)} | 남는 종류 ≥ 60%, 최다 ≤ ${capOf(g.id)} | ${(was.share * 100).toFixed(0)}%, 최다 ${was.top} | ${(g.share * 100).toFixed(0)}%, 최다 ${g.top} | ${mark(g.pass)} |`);
  });
  rows.push(`| g4 v6 수요 기준 | 위반 없음 | ${before.g4.misses.length}건 | ${after.g4.misses.length}건 | ${mark(after.g4.pass)} |`);
  return rows.join('\n');
}

const summonBefore = summonRuns > 0 ? goal6(summonReport(data, { runs: summonRuns, length: 400 })) : null;
const goalsBefore = v7Goals(data, newIds);

function recipeLine(r: RecipeDef): string {
  const parts = [`"result": ${JSON.stringify(r.result)}`, `"materials": [${r.materials.map(m => JSON.stringify(m)).join(', ')}]`];
  if (r.cost) parts.push(`"cost": ${JSON.stringify(r.cost).replace(/":/g, '": ').replace(/,"/g, ', "')}`);
  if (r.kind) parts.push(`"kind": ${JSON.stringify(r.kind)}`);
  return `  { ${parts.join(', ')} }`;
}

function solution(seed: number): string {
  const swaps = searchSpread(data, editable, { seed, ...searchOpts });
  const after = applySwaps(data, swaps);
  const before = spreadDemand(data);
  const now = spreadDemand(after);
  const results = changedRecipes(swaps);
  // spreadLowerBound counts per grade and family, so it is no bound once families mix.
  const bound = rules.crossFamily ? '' : ` (칸 하한 ${spreadLowerBound(data)})`;
  const lines = [`## 해 seed ${seed}`, '', `바뀐 조합 ${results.length}개, 바뀐 재료 칸 ${swaps.length}개${bound}`, ''];
  const problems = [...swapProblems(data, editable, swaps, rules), ...targetMisses(after)];
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

  lines.push('', '### 1등급 총수요 (전 → 후)', '', grade1Table(data, after), '');
  lines.push('### 목표 판정', '', goalTable(goalsBefore, v7Goals(after, newIds)), '');

  if (summonBefore) {
    const g = goal6(summonReport(after, { runs: summonRuns, length: 400 }));
    const text = (x: typeof g) => `가장 많이 고른 6등급 ${(x.topShare * 100).toFixed(1)}%, 5% 넘게 고른 6등급 ${x.over5pct}종`;
    lines.push(`### 소환 시뮬레이션 (목표 6, ${summonRuns}판)`, '', `전: ${text(summonBefore)}`, '', `후: ${text(g)}: ${mark(g.pass)}`, '');
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

  if (writeRecipes) {
    const file = join(out, `recipes-seed${seed}.json`);
    writeFileSync(file, `[\n${recipesFile(after, overlay).map(recipeLine).join(',\n')}\n]\n`);
    lines.push('', `조합 파일: ${file}`);
  }
  return lines.join('\n') + '\n';
}

mkdirSync(out, { recursive: true });
const flags = [
  `ban: ${arg('ban', '') || '없음'}`, `keep: ${[...keep].join(',') || '없음'}`, `allow: ${allowFile || '없음'}`,
  `new-units: ${overlayFile || '없음'}`, `계열 섞기: ${rules.crossFamily ? '예' : '아니오'}`, `1등급 잠금 풀기: ${rules.unlockGrade1 ? '예' : '아니오'}`,
  `벌점 비중: 총수요 ${weight('balance-weight')} / 최다 상한 ${weight('cap-weight')} (상한 ${arg('cap', '10')}) / 남는 종류 ${weight('leftover-weight')}`,
];
const doc = ['# 조합 재료 교체 후보', '', flags.join(' / '), '', ...seedList(arg('seeds', '1')).map(solution)].join('\n');
writeFileSync(join(out, 'candidates.md'), doc);
console.log(doc);
