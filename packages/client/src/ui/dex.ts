import type { GameData } from '@dorandi/logic';
import { GRADE_COLOR } from '../layout';
import { dexEntries } from './models';
import { esc } from './dom';

export function dexHtml(data: GameData): string {
  const rows = dexEntries(data).map(d => {
    const recipe = d.recipe.length ? d.recipe.map(esc).join(' + ') : '소환';
    const notes = d.notes.length ? `<ul class="card-notes">${d.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
    // one row per unit: the skill line sits under the recipe
    return `
    <tr><td><span class="dot" style="background:${GRADE_COLOR[d.grade]}"></span>${d.grade}</td>
    <td>${esc(d.name)}</td><td>${recipe}${d.cost ? ` <span class="combine-cost">+ ${esc(d.cost)}</span>` : ''}
    <div class="dex-skill">${d.typeText} · 사거리 ${d.range}칸${d.skillText ? ` · ${esc(d.skillText)}` : ''}</div>${notes}</td></tr>`;
  }).join('');
  return `<div class="modal"><div class="modal-head">도감 <button data-action="closeModal">닫기</button></div>
    <table class="dex"><thead><tr><th>등급</th><th>이름</th><th>재료</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
