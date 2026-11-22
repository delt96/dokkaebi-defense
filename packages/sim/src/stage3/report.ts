import type { CombineGainRow } from './combineGain';
import type { ControlRow } from './control';

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** The value below which `p` of the sorted values fall (nearest rank). */
export function quantile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]!;
}

/** Share of finishers holding 3-4 normal grade 6; null for an empty cohort. */
export function inBandShare(counts: number[]): number | null {
  if (!counts.length) return null;
  return counts.filter(n => n >= 3 && n <= 4).length / counts.length;
}

/** Median with an unfinished sample (null) counted at the limit. */
export function timeoutMedian(samples: (number | null)[], limit: number): number | null {
  return median(samples.map(x => x ?? limit));
}

/** Mean over seeds of the population SD of finishers' grade 6 holdings within the same match. */
export function seatSpread(rows: { seed: number; finished: boolean; grade6AtFinal: number }[]): number | null {
  const seeds = [...new Set(rows.map(r => r.seed))];
  const sds: number[] = [];
  for (const seed of seeds) {
    const xs = rows.filter(r => r.seed === seed && r.finished).map(r => r.grade6AtFinal);
    if (xs.length < 2) continue;
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    sds.push(Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length));
  }
  return sds.length ? sds.reduce((a, b) => a + b, 0) / sds.length : null;
}

/** Among seats that opened all 18 bags, how many got at least one 지게. */
export function jigeIncidence(rows: { draws: number; jigeGrants: number }[]): { seats: number; withJige: number } {
  const full = rows.filter(r => r.draws === 18);
  return { seats: full.length, withJige: full.filter(r => r.jigeGrants > 0).length };
}

export function toCsvRows(rows: object[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]!);
  const fmt = (v: unknown) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number' && !Number.isInteger(v)) return v.toFixed(3);
    if (Array.isArray(v)) return v.join(' ');
    return String(v);
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => fmt((r as Record<string, unknown>)[c])).join(','))].join('\n') + '\n';
}

const f2 = (v: number | null) => (v === null ? '-' : v.toFixed(2));

export function combineGainMarkdown(rows: CombineGainRow[]): string {
  const out: string[] = [];
  out.push('| 결과 등급 | 조합 수 | 측정 칸 | 통과 | 탈락 | 탈락 조합 수 |', '| ---: | ---: | ---: | ---: | ---: | ---: |');
  const grades = [...new Set(rows.map(r => r.grade))].sort((a, b) => a - b);
  for (const g of grades) {
    const rs = rows.filter(r => r.grade === g);
    const recipes = new Set(rs.map(r => r.result));
    const failedRecipes = new Set(rs.filter(r => !r.pass).map(r => r.result));
    out.push(`| ${g} | ${recipes.size} | ${rs.length} | ${rs.filter(r => r.pass).length} | ${rs.filter(r => !r.pass).length} | ${failedRecipes.size} |`);
  }
  const failed = rows.filter(r => !r.pass);
  if (failed.length) {
    out.push('', '| 결과 | 등급 | 간격 | 체력 | A 평균 | B 평균 | 최악 차이 |', '| --- | ---: | --- | ---: | ---: | ---: | ---: |');
    for (const r of failed) out.push(`| ${r.result} | ${r.grade} | ${r.scenario} | ${r.hp} | ${f2(r.aMean)} | ${f2(r.bMean)} | +${r.worstDelta} |`);
  }
  return out.join('\n');
}

export function controlMarkdown(rows: ControlRow[]): string {
  const out: string[] = [];
  out.push(
    '| 라인업 | 보스 | 상한 | 정지율 중앙값 | 정지율 최대 | 창 최대 정지 틱 | 잘린 스턴 틱 | 실제 밀기 | 잘린 밀기 | 입구에서 버린 밀기 | 순전진 중앙값 | 최장 체류 틱 | 판정 |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  );
  const keys = [...new Set(rows.map(r => `${r.lineup}|${r.boss}|${r.cap}`))];
  for (const k of keys) {
    const rs = rows.filter(r => `${r.lineup}|${r.boss}|${r.cap}` === k);
    const [lineup, boss, cap] = k.split('|');
    const shares = rs.map(r => r.stoppedShare);
    const verdict = rs[0]!.pass === null ? '대조군' : rs.every(r => r.pass) ? '통과' : '초과';
    out.push(`| ${lineup} | ${boss} | ${cap} | ${f2(median(shares))} | ${f2(Math.max(...shares))} | ${Math.max(...rs.map(r => r.maxWindowStopped))} | ${median(rs.map(r => r.stunClipped))} | ${f2(median(rs.map(r => r.pushApplied)))} | ${f2(median(rs.map(r => r.pushClipped)))} | ${f2(median(rs.map(r => r.entranceClipped)))} | ${f2(median(rs.map(r => r.netAdvance)))} | ${Math.max(...rs.map(r => r.maxDwellTicks))} | ${verdict} |`);
  }
  return out.join('\n');
}
