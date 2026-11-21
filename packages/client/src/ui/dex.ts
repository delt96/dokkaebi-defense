import type { GameData } from '@dorandi/logic';
import { GRADE_COLOR } from '../layout';
import { dexEntries, summonOddsText } from './models';
import { esc } from './dom';

/** `story`: stage 3 lets a normal grade-6 row be picked as the story request's target. */
export function dexHtml(data: GameData, story?: { target: string | null; canSet: boolean }, filter = 'all', query = '', round = 1): string {
  const entries = dexEntries(data);
  const browsable = !!data.balance.extendedCombat;
  const needle = query.replace(/\s+/g, '');
  const visible = entries.filter(d => {
    if (!browsable) return true;
    if (filter === 'hidden' && !d.hidden) return false;
    if (filter !== 'all' && filter !== 'hidden' && String(d.grade) !== filter) return false;
    return !needle || [d.name, ...d.recipe].some(name => name.replace(/\s+/g, '').includes(needle));
  });
  const rows = visible.map(d => {
    const recipe = d.recipe.length ? d.recipe.map(esc).join(' + ') : d.hidden ? '길들이기' : '소환';
    const notes = d.notes.length ? `<ul class="card-notes">${d.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
    // one row per unit: the skill line sits under the recipe
    return `
    <tr><td><span class="dot" style="background:${GRADE_COLOR[d.grade]}"></span>${d.grade}</td>
    <td>${esc(d.name)}${story && d.grade === 6 && !d.hidden && d.recipe.length ? targetButton(d.id, story) : ''}</td><td>${recipe}${d.cost ? ` <span class="combine-cost">+ ${esc(d.cost)}</span>` : ''}
    <div class="dex-skill">${d.typeText} · 사거리 ${d.range}칸${d.skillText ? ` · ${esc(d.skillText)}` : ''}</div>${notes}</td></tr>`;
  }).join('');
  const grades = [...new Set(entries.map(d => d.grade))].sort((a, b) => a - b);
  const filters = ['all', ...grades.map(String), 'hidden'].map(key => {
    const label = key === 'all' ? '전체' : key === 'hidden' ? '숨은 유닛' : `${key}등급`;
    return `<button data-action="dexFilter" data-arg="${key}" aria-pressed="${key === filter}">${label}</button>`;
  }).join('');
  return `<div class="modal${browsable ? ' dex-browser' : ''}"><div class="modal-head">도감${browsable ? ` · ${visible.length}종` : ''} <button data-action="closeModal">닫기</button></div>
    <div>${esc(summonOddsText(data, round))}</div>
    ${browsable ? `<form class="dex-search"><input type="search" name="query" aria-label="이름·재료 검색" placeholder="이름·재료 검색" value="${esc(query)}"><button>검색</button></form><div class="dex-filters" role="group" aria-label="도감 분류">${filters}</div><div class="dex-scroll">` : ''}<table class="dex"><thead><tr><th>등급</th><th>이름</th><th>재료</th></tr></thead><tbody>${rows || '<tr><td colspan="3">찾는 유닛이 없습니다.</td></tr>'}</tbody></table>${browsable ? '</div>' : ''}</div>`;
}

function targetButton(id: string, story: { target: string | null; canSet: boolean }): string {
  const on = story.target === id;
  // pressing the current target again clears it
  return `<button class="dex-target${on ? ' on' : ''}" data-action="storyTarget" data-arg="${on ? '' : esc(id)}"${story.canSet ? '' : ' disabled'} title="설화 의뢰 목표">${on ? '목표 ✓' : '목표'}</button>`;
}
