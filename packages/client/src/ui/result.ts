import type { GameState } from '@dorandi/logic';
import { GRADE_COLOR } from '../layout';
import { resultModel } from './models';
import { esc } from './dom';

const W = 300;
const H = 90;

function graph(series: number[], limit: number): string {
  if (!series.length) return '';
  const max = Math.max(limit, ...series);
  const x = (i: number) => (series.length === 1 ? W / 2 : (i / (series.length - 1)) * W);
  const y = (v: number) => H - (v / max) * H;
  const pts = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg class="graph" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <line x1="0" x2="${W}" y1="${y(limit)}" y2="${y(limit)}" stroke="#ff3b2f" stroke-dasharray="3 3" stroke-width="1"/>
    <polyline points="${pts}" fill="none" stroke="#ffe08a" stroke-width="1.5"/>
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
