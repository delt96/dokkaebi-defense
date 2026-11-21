import type { GameState } from '@dorandi/logic';
import { GRADE_COLOR } from '../layout';
import { combineNoteLines, combineOptions, rightModel, summonOddsText, unitCard, upgradeRows, type CombineOption } from './models';
import { el, esc, setHtml } from './dom';
import { STORE_ALL_KEY } from './storage';

/** `market`: stage 3 shows a 장터 (B) button; true while the panel is open. `badge`: a story request not yet looked at. */
export interface RightOpts { online?: boolean; notices?: string[]; market?: boolean; badge?: boolean }

export function renderRight(state: GameState, opts: RightOpts = {}): void {
  const m = rightModel(state);
  const needSlot = opts.online === true && !state.slots.some((u, i) => !u && state.open[i]);
  setHtml(el('right'), `
    <div class="res"><b>도깨비불 (뽑기)</b><span>${state.tokens}</span></div>
    <div class="res"><b>엽전</b><span>${state.coins}</span></div>
    <div class="res"><b>메밀묵</b><span>${state.buckwheat}</span></div>
    <button class="big" data-action="summon" title="${esc(summonOddsText(state.data, state.round))}" ${m.canSummon ? '' : 'disabled'}>뚝딱! (${state.tokens}번)</button>
    ${needSlot ? '<div class="need-slot">빈칸 필요</div>' : ''}
    ${m.pending ? `<div class="res pending"><b>보관 중</b><span>${m.pending}</span></div>` : ''}
    <button data-action="convert" ${m.canConvert ? '' : 'disabled'}>불 바꾸기 (+${state.data.balance.tokens.toCoins}냥)</button>
    <button data-action="openUpgrades">강화 (E)</button>
    ${opts.market === undefined ? '' : `<button data-action="toggleMarket" class="market-btn" aria-pressed="${opts.market}">장터 (B)${opts.badge ? '<span class="badge">의뢰</span>' : ''}</button>`}
    ${opts.notices?.length ? `<div class="notices">${opts.notices.map(n => `<div>${esc(n)}</div>`).join('')}</div>` : ''}`);
}

function recipeHtml(option: CombineOption, unitId: number | null): string {
  if (option.missing.length) {
    const cost = option.cost ? ` · 비용 ${esc(option.cost)}` : '';
    return `<span class="combine-missing">${esc(option.name)} (모자람: ${option.missing.map(esc).join(', ')}${cost})</span>`;
  }
  // every material is there but not the cost: the button stays, disabled, and says what is missing
  if (option.short) {
    return `<button data-action="combine" data-arg="${esc(option.result)}@${unitId}" class="combine-blocked" disabled title="${esc(option.short)}">${esc(option.name)} · <span class="combine-short">${esc(option.short)}</span></button>`;
  }
  const cost = option.cost ? ` · <span class="combine-cost">${esc(option.cost)}</span>` : '';
  return `<button data-action="combine" data-arg="${esc(option.result)}@${unitId}"${option.cost ? ` title="비용 ${esc(option.cost)}"` : ''}>${option.key ? `[${option.key}] ` : ''}${esc(option.name)}${cost}</button>`;
}

const notesHtml = (lines: string[]): string => (lines.length ? `<ul class="card-notes">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '');

export function unitDetailsHtml(state: GameState, selected: number): string {
  const card = unitCard(state, selected)!;
  const unitId = state.slots[selected]!.id;
  const options = combineOptions(state, selected).map(option => {
    const notes = combineNoteLines(state.data, option.result);
    return notes.length ? `<div class="recipe">${recipeHtml(option, unitId)}${notesHtml(notes)}</div>` : recipeHtml(option, unitId);
  });
  return `<div class="modal"><div class="modal-head">${esc(card.name)} · 상세 <button data-action="closeModal">닫기</button></div>
    <p>${esc(card.skillText)}</p>${notesHtml(card.notes)}<div class="recipe-list">${options.join('') || '최종 조합입니다.'}</div></div>`;
}

/** `hotkeys`: extra keys for the help line (stage 3 adds the market); stage 1-2 pass nothing and keep the old line. */
export function renderBottom(state: GameState, selected: number | null, online = false, hotkeys?: string) {
  const card = selected === null ? null : unitCard(state, selected);
  const unitId = selected === null ? null : state.slots[selected]?.id ?? null;
  const recipes = selected === null ? [] : combineOptions(state, selected);
  // online, and solo on the 60-round data (its card has 상세), the card lists only what can be pressed now or is short of its cost
  const quick = online || state.data.balance.extendedCombat ? recipes.filter(option => option.key !== null || option.short) : recipes;
  const options = quick.map(option => recipeHtml(option, unitId)).join('');
  setHtml(el('bottom'), card
    ? `<div class="card"><span class="unit-info" title="${esc(card.skillText)}"><span><span class="dot" style="background:${GRADE_COLOR[card.grade]}"></span>
        <b>${esc(card.name)}</b> · ${card.grade}등급 · ${card.typeText}</span>
        <span>공격 ${card.attack} · ${card.interval}초마다 · 사거리 ${card.range}칸</span></span>
        ${online ? '' : `<span class="skill" title="${esc(card.skillText)}">${esc(card.skillText)}</span>`}
        ${options ? `<div class="combine-options">${options}</div>` : ''}
        ${online || state.data.balance.extendedCombat ? '<button data-action="unitDetails">상세</button>' : ''}
        <button data-action="sell" data-arg="${unitId}">판매(S) +${card.sellPrice}냥</button></div>`
    : `<div class="card hint">유닛을 눌러 선택하고 끌어서 옮기세요. · Tab/W 다음 유닛 · Space 소환 · E 강화 · ${STORE_ALL_KEY} 1·2등급 보관 · Esc 선택 해제${hotkeys ? ` · ${esc(hotkeys)}` : ''}</div>`);
  return { unitId, recipes };
}

export function upgradesHtml(state: GameState): string {
  const rows = upgradeRows(state).map((r, i) => `
    <tr><td class="upgrade-key">${i + 1}</td><td>${esc(r.label)}</td><td>${r.level} / ${r.max}</td><td>${esc(r.effectText)}</td>
    <td><button data-action="upgrade" data-arg="${r.id}" ${r.affordable ? '' : 'disabled'}>${r.cost === null ? '최대' : `${r.cost}냥`}</button></td></tr>`).join('');
  return `<div class="modal"><div class="modal-head">강화 · 엽전 ${state.coins}냥 <button data-action="closeModal">E·Esc 닫기</button></div>
    <table class="upgrades"><tbody>${rows}</tbody></table></div>`;
}
