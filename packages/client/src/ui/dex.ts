import type { GameData } from '@dorandi/logic';
import { GRADE_COLOR } from '../layout';
import { dexEntries } from './models';
import { esc } from './dom';

export function dexHtml(data: GameData): string {
  const rows = dexEntries(data).map(d => `
    <tr><td><span class="dot" style="background:${GRADE_COLOR[d.grade]}"></span>${d.grade}</td>
    <td>${esc(d.name)}</td><td>${d.recipe.length ? d.recipe.map(esc).join(' + ') : '소환'}</td></tr>`).join('');
  return `<div class="modal"><div class="modal-head">도감 <button data-action="closeModal">닫기</button></div>
    <table class="dex"><thead><tr><th>등급</th><th>이름</th><th>재료</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
