import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameData, validateData, type GameData } from '@dorandi/logic';
import { grade5Candidates, grade6Candidates, withNewUnits, type NewUnitOverlay, type RecipeCandidate } from '../src/stage3/newUnits';
import { grade1Balance, leafCounts, leftoverShare, targetMisses, topGrade1 } from '../src/stage3/spread';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const out = arg('out', 'sim-out/v7-new');
const keepSixes = Number(arg('keep-sixes', '20'));
const setCount = Number(arg('sets', '3'));
const base = loadGameData('stage3');
const NEW = { g5p: 'v7g5p', g5m: 'v7g5m', g6p: 'v7g6p', g6m: 'v7g6m' } as const;
const newIds = Object.values(NEW);
const g5opts = { minShare: 0.6, maxTop: 4 };
const g6opts = { minShare: 0.6, maxTop: 7 };

function overlayOf(p5: string[], m5: string[], p6?: string[], m6?: string[]): NewUnitOverlay {
  const units: NewUnitOverlay['units'] = [
    { id: NEW.g5p, name: '임시5물', grade: 5, damageType: 'physical' },
    { id: NEW.g5m, name: '임시5마', grade: 5, damageType: 'magical' },
  ];
  const recipes: NewUnitOverlay['recipes'] = [
    { result: NEW.g5p, materials: p5, cost: { buckwheat: 1 } },
    { result: NEW.g5m, materials: m5, cost: { buckwheat: 1 } },
  ];
  if (p6 && m6) {
    units.push({ id: NEW.g6p, name: '임시6물', grade: 6, damageType: 'physical' }, { id: NEW.g6m, name: '임시6마', grade: 6, damageType: 'magical' });
    recipes.push({ result: NEW.g6p, materials: p6, cost: { buckwheat: 1, coins: 60 } }, { result: NEW.g6m, materials: m6, cost: { buckwheat: 1, coins: 60 } });
  }
  return { units, recipes };
}

// Until a second grade 6 takes it, a new grade 5 used by one new grade 6 sits at demand 1; the later search may fix that.
const expectedMiss = (m: string) => /^v7g5[pm] \(grade 5\) demand 1 /.test(m);

interface SetResult {
  overlay: NewUnitOverlay;
  otherMisses: string[];
  expectedMisses: string[];
  topSum: number;
  shareSum: number;
  data: GameData;
}

function evaluate(overlay: NewUnitOverlay): SetResult | null {
  const data = withNewUnits(base, overlay);
  if (validateData(data).errors.length) return null;
  const misses = targetMisses(data);
  return {
    overlay, data,
    otherMisses: misses.filter(m => !expectedMiss(m)),
    expectedMisses: misses.filter(expectedMiss),
    topSum: newIds.reduce((s, id) => s + topGrade1(data, id).n, 0),
    shareSum: newIds.reduce((s, id) => s + leftoverShare(data, id), 0),
  };
}

const better = (a: SetResult, b: SetResult) =>
  a.otherMisses.length - b.otherMisses.length || a.topSum - b.topSum || b.shareSum - a.shareSum;

const rankSix = (xs: RecipeCandidate<[string, string, string]>[]) => [...xs].sort((a, b) =>
  a.misses.filter(m => !expectedMiss(m)).length - b.misses.filter(m => !expectedMiss(m)).length || a.top - b.top || b.share - a.share);

const name = (d: GameData, id: string) => d.units.find(u => u.id === id)!.name;
const fives = grade5Candidates(base, g5opts);
const results: SetResult[] = [];
const noSet: string[] = [];
let pairs = 0;
for (let i = 0; i < fives.length; i++) {
  for (let j = i + 1; j < fives.length; j++) {
    pairs++;
    const p5 = fives[i]!.materials;
    const m5 = fives[j]!.materials;
    const withFives = withNewUnits(base, overlayOf(p5, m5));
    const sixesP = rankSix(grade6Candidates(withFives, [NEW.g5p], g6opts).filter(c => !c.materials.includes(NEW.g5m))).slice(0, keepSixes);
    const sixesM = rankSix(grade6Candidates(withFives, [NEW.g5m], g6opts).filter(c => !c.materials.includes(NEW.g5p))).slice(0, keepSixes);
    let best: SetResult | null = null;
    for (const p6 of sixesP) for (const m6 of sixesM) {
      const r = evaluate(overlayOf(p5, m5, p6.materials, m6.materials));
      if (r && (!best || better(r, best) < 0)) best = r;
    }
    if (best) results.push(best);
    else noSet.push([p5, m5].map(ms => ms.map(m => name(base, m)).join('+')).join(' / '));
  }
}
results.sort(better);

// results holds the best set per grade 5 pair, so the picks already differ in their grade 5 materials.
const picked = results.slice(0, setCount);

const g1 = base.units.filter(u => u.grade === 1);
const pct = (x: number) => `${Math.round(x * 100)}%`;

function missKo(d: GameData, m: string): string {
  const x = /^(\S+) \(grade (\d)\) demand (\d+) not in (\d+)-(\d+)$/.exec(m);
  return x ? `${name(d, x[1]!)}(${x[2]}등급) ${x[3]}곳 (기준 ${x[4]}~${x[5]})` : m;
}

function setTable(r: SetResult): string {
  const d = r.data;
  const rows = ['| 새 유닛 | 재료 | 남는 종류 비율 | 최다 1등급 | 1등급 구성 |', '|---|---|---:|---|---|'];
  for (const id of newIds) {
    const recipe = r.overlay.recipes.find(x => x.result === id)!;
    const leaves = leafCounts(d, id);
    const top = topGrade1(d, id);
    const breakdown = g1.filter(u => leaves.get(u.id)).map(u => `${u.name}${leaves.get(u.id)}`).join(' ');
    rows.push(`| ${name(d, id)} (${id}) | ${recipe.materials.map(m => name(d, m)).join(' + ')} | ${pct(leftoverShare(d, id))} | ${name(d, top.id)} ${top.n} | ${breakdown} |`);
  }
  const b0 = grade1Balance(base);
  const b1 = grade1Balance(d);
  const missText = (ms: string[]) => ms.length ? ms.map(m => missKo(d, m)).join(', ') : '없음';
  rows.push('',
    `- 새로 생기는 수요 기준 위반: ${missText(r.otherMisses)}`,
    `- 예상한 위반(새 5등급이 6등급 한 곳에만 쓰임): ${missText(r.expectedMisses)}`,
    `- 1등급 총수요 최대/평균 ${b0.maxRatio.toFixed(2)} → ${b1.maxRatio.toFixed(2)}, 최소/평균 ${b0.minRatio.toFixed(2)} → ${b1.minRatio.toFixed(2)} (이 세트만 더했을 때)`);
  return rows.join('\n');
}

function grade5Table(): string {
  const rows = ['| 재료 | 남는 종류 비율 | 최다 1등급 | 새로 생기는 위반 |', '|---|---:|---:|---|'];
  for (const f of fives) rows.push(`| ${f.materials.map(m => name(base, m)).join(' + ')} | ${pct(f.share)} | ${f.top} | ${f.misses.map(m => missKo(base, m)).join(', ') || '없음'} |`);
  return rows.join('\n');
}

function rankTable(): string {
  const rows = ['| 순위 | 5물 | 5마 | 6물 | 6마 | 새 위반 | 최다 합 | 비율 합 | 최대/평균 | 최소/평균 |', '|---:|---|---|---|---|---|---:|---:|---:|---:|'];
  results.forEach((r, k) => {
    const mats = (id: string) => r.overlay.recipes.find(x => x.result === id)!.materials.map(m => name(r.data, m)).join('+');
    const b = grade1Balance(r.data);
    rows.push(`| ${k + 1} | ${mats(NEW.g5p)} | ${mats(NEW.g5m)} | ${mats(NEW.g6p)} | ${mats(NEW.g6m)} | ${r.otherMisses.map(m => missKo(r.data, m)).join(', ') || '없음'} | ${r.topSum} | ${r.shareSum.toFixed(2)} | ${b.maxRatio.toFixed(2)} | ${b.minRatio.toFixed(2)} |`);
  });
  return rows.join('\n');
}

mkdirSync(out, { recursive: true });
const md = [
  '# 새 유닛 조합 후보',
  '',
  `5등급 후보(비율 ≥ 60%, 최다 ≤ 4) ${fives.length}개, 쌍 ${pairs}개, 세트 ${results.length}개. 6등급 후보는 새 5등급마다 앞쪽 ${keepSixes}개만 묶어 봤다.`,
  '',
  '## 5등급 후보',
  '',
  grade5Table(),
  '',
  ...picked.flatMap((r, k) => [`## 세트 ${k + 1}`, '', setTable(r), '']),
  '## 쌍마다 가장 나은 세트',
  '',
  rankTable(),
  '',
  `세트를 못 만든 5등급 쌍: ${noSet.join(', ') || '없음'}`,
  '',
].join('\n');
writeFileSync(join(out, 'new-units.md'), md);
writeFileSync(join(out, 'sets.json'), JSON.stringify(picked.map(r => r.overlay), null, 2));
console.log(md);
console.log(`\nwrote ${join(out, 'new-units.md')} and ${join(out, 'sets.json')}`);
