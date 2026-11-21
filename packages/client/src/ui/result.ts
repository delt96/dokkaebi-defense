import type { GameState } from '@dorandi/logic';
import { GRADE_COLOR } from '../layout';
import { resultModel } from './models';
import { esc } from './dom';

const W = 300;
const H = 90;

/**
 * Per-round line graph. The x axis spans every slot of `series`; a null slot (a round after an
 * elimination) breaks the line, and a lone point between gaps is drawn as a dot.
 */
export function graph(series: (number | null)[], limit: number): string {
  const values = series.filter((v): v is number => v !== null);
  if (!values.length) return '';
  const max = Math.max(limit, ...values);
  const x = (i: number) => (series.length === 1 ? W / 2 : (i / (series.length - 1)) * W);
  const y = (v: number) => H - (v / max) * H;
  const runs: [number, number][][] = [];
  let run: [number, number][] = [];
  series.forEach((v, i) => {
    if (v === null) { if (run.length) runs.push(run); run = []; return; }
    run.push([x(i), y(v)]);
  });
  if (run.length) runs.push(run);
  const marks = runs.map(r => r.length === 1
    ? `<circle cx="${r[0]![0].toFixed(1)}" cy="${r[0]![1].toFixed(1)}" r="1.5" fill="#ffe08a"/>`
    : `<polyline points="${r.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')}" fill="none" stroke="#ffe08a" stroke-width="1.5"/>`).join('');
  return `<svg class="graph" preserveAspectRatio="none" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <line x1="0" x2="${W}" y1="${y(limit)}" y2="${y(limit)}" stroke="#ff3b2f" stroke-dasharray="3 3" stroke-width="1"/>
    ${marks}
  </svg>`;
}

export function resultHtml(state: GameState, bestUnitId: string | null): string {
  const m = resultModel(state, bestUnitId);
  const best = m.bestUnit
    ? `<span class="dot" style="background:${GRADE_COLOR[m.bestUnit.grade]}"></span>${esc(m.bestUnit.name)} (${m.bestUnit.grade}등급)`
    : '없음';
  return `<div class="modal result">
    <div class="modal-head">${m.title}${m.reasonText ? ` · ${esc(m.reasonText)}` : ''}</div>
    <p>${m.roundReached}라운드까지 버텼습니다.</p>
    <p>라운드별 우리 고개 잡귀 (빨간 점선: 한도 ${state.data.balance.limit})</p>
    ${graph(m.series, state.data.balance.limit)}
    <p>마지막 ${m.lastEnemies}마리 · 가장 많았을 때 ${m.maxEnemies}마리</p>
    <p>최고 유닛: ${best} · ${esc(m.helperText)}</p>
    <button class="big" data-action="restart">다시 하기</button>
  </div>`;
}
