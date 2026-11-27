import { createRng, nextFloat, type GameData } from '@dorandi/logic';
import { leafCounts } from './spread';

export interface SummonReport {
  perUnit: { id: string; mean: number; p10: number; p90: number; failed: number }[];
  byFamily: { physical: number; magical: number };
  pickAt30: { id: string; share: number }[];
  second: { mean: number; p10: number; p90: number; runs: number; failed: number };
}

export function summonStream(data: GameData, seed: number, n: number): string[] {
  const g1 = data.units.filter(u => u.grade === 1).map(u => u.id);
  const rng = createRng(seed);
  const counts = new Map(g1.map(id => [id, 0]));
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    let id = g1[Math.floor(nextFloat(rng) * g1.length)]!;
    if (i % data.balance.pityEvery === 0) {
      id = g1.reduce((a, b) => (counts.get(b)! < counts.get(a)! ? b : a));
    }
    counts.set(id, counts.get(id)! + 1);
    out.push(id);
  }
  return out;
}

export function summonsToBuild(need: Map<string, number>, stream: string[], start?: Map<string, number>): number | null {
  const have = new Map(start);
  const missing = () => [...need].some(([id, n]) => (have.get(id) ?? 0) < n);
  if (!missing()) return 0;
  for (let i = 0; i < stream.length; i++) {
    have.set(stream[i]!, (have.get(stream[i]!) ?? 0) + 1);
    if (!missing()) return i + 1;
  }
  return null;
}

export function progress(have: Map<string, number>, need: Map<string, number>): number {
  let got = 0;
  let total = 0;
  for (const [id, n] of need) { got += Math.min(have.get(id) ?? 0, n); total += n; }
  return total === 0 ? 0 : got / total;
}

function tally(ids: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

function best(order: string[], have: Map<string, number>, needs: Map<string, Map<string, number>>): string {
  let top = order[0]!;
  let topValue = -1;
  for (const id of order) {
    const p = progress(have, needs.get(id)!);
    if (p > topValue) { top = id; topValue = p; }
  }
  return top;
}

function percentile(sorted: number[], q: number): number {
  return sorted.length === 0 ? NaN : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
  return { mean, p10: percentile(sorted, 0.1), p90: percentile(sorted, 0.9) };
}

export function summonReport(data: GameData, opts: { runs: number; length: number; pickAt?: number }): SummonReport {
  const pickAt = opts.pickAt ?? 30;
  const targets = data.units.filter(u => u.grade === 6 && !u.hidden);
  const order = targets.map(u => u.id);
  const needs = new Map(order.map(id => [id, leafCounts(data, id)]));
  const samples = new Map<string, number[]>(order.map(id => [id, []]));
  const failed = new Map<string, number>(order.map(id => [id, 0]));
  const picks = new Map<string, number>();
  const second: number[] = [];

  for (let seed = 1; seed <= opts.runs; seed++) {
    const stream = summonStream(data, seed, opts.length);
    for (const id of order) {
      const t = summonsToBuild(needs.get(id)!, stream);
      if (t === null) failed.set(id, failed.get(id)! + 1);
      else samples.get(id)!.push(t);
    }

    const first = best(order, tally(stream.slice(0, pickAt)), needs);
    picks.set(first, (picks.get(first) ?? 0) + 1);

    const built = summonsToBuild(needs.get(first)!, stream);
    if (built === null) continue;
    const have = tally(stream.slice(0, built));
    for (const [id, n] of needs.get(first)!) have.set(id, have.get(id)! - n);
    const others = order.filter(id => id !== first);
    const next = best(others, have, needs);
    const extra = summonsToBuild(needs.get(next)!, stream.slice(built), have);
    if (extra !== null) second.push(extra);
  }

  const perUnit = order.map(id => ({ id, ...stats(samples.get(id)!), failed: failed.get(id)! }));
  const familyMean = (type: string) => {
    const xs = targets.filter(u => u.damageType === type).map(u => perUnit.find(p => p.id === u.id)!.mean).filter(Number.isFinite);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
  };
  return {
    perUnit,
    byFamily: { physical: familyMean('physical'), magical: familyMean('magical') },
    pickAt30: [...picks].map(([id, n]) => ({ id, share: n / opts.runs }))
      .sort((a, b) => b.share - a.share || order.indexOf(a.id) - order.indexOf(b.id)),
    second: { ...stats(second), runs: second.length, failed: opts.runs - second.length },
  };
}

export function summonMarkdown(r: SummonReport, data: GameData): string {
  const name = (id: string) => data.units.find(u => u.id === id)?.name ?? id;
  const f = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '-');
  const lines = ['# 1등급 소환 시뮬레이션', '', '## 6등급별 만드는 데 드는 소환 수', '',
    '| 6등급 | 평균 | p10 | p90 | 못 만든 판 |', '|---|---:|---:|---:|---:|'];
  for (const u of [...r.perUnit].sort((a, b) => a.mean - b.mean)) {
    lines.push(`| ${name(u.id)} | ${f(u.mean)} | ${f(u.p10)} | ${f(u.p90)} | ${u.failed} |`);
  }
  lines.push('', `계열 평균: 물리 ${f(r.byFamily.physical)} / 마법 ${f(r.byFamily.magical)}`, '',
    '## 30번째 소환 시점에 고르는 6등급', '', '| 6등급 | 비율 |', '|---|---:|');
  for (const p of r.pickAt30) lines.push(`| ${name(p.id)} | ${(p.share * 100).toFixed(1)}% |`);
  lines.push('', `## 두 번째 6등급까지 더 드는 소환 수`, '', `평균 ${f(r.second.mean)} (p10 ${f(r.second.p10)}, p90 ${f(r.second.p90)}), 잰 판 ${r.second.runs}, 못 잰 판 ${r.second.failed}`, '');
  return lines.join('\n');
}
