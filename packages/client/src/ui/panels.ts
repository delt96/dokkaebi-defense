import type { GameState } from '@dorandi/logic';
import { GRADE_COLOR } from '../layout';
import { rightModel, unitCard, upgradeRows } from './models';
import { el, esc, setHtml } from './dom';

export function renderRight(state: GameState): void {
  const m = rightModel(state);
  setHtml(el('right'), `
    <div class="res"><b>도깨비불</b><span>${state.tokens}</span></div>
    <div class="res"><b>엽전</b><span>${state.coins}</span></div>
    <div class="res"><b>메밀묵</b><span>${state.buckwheat}</span></div>
    <button class="big" data-action="summon" ${m.canSummon ? '' : 'disabled'}>뚝딱!</button>
    ${m.pending ? `<div class="res pending"><b>보관 중</b><span>${m.pending}</span></div>` : ''}
    <button data-action="convert" ${m.canConvert ? '' : 'disabled'}>불 바꾸기 (+${state.data.balance.tokens.toCoins}냥)</button>
    <button data-action="openUpgrades">강화</button>`);
}

export function renderBottom(state: GameState, selected: number | null): void {
  const card = selected === null ? null : unitCard(state, selected);
  setHtml(el('bottom'), card
    ? `<div class="card"><span class="dot" style="background:${GRADE_COLOR[card.grade]}"></span>
        <b>${esc(card.name)}</b> · ${card.grade}등급 · ${card.typeText} · ${esc(card.skillText)}
        ${card.usedIn.length ? ` · 쓰이는 곳: ${card.usedIn.map(esc).join(', ')}` : ''}
        <button data-action="sell" data-arg="${selected}">판매 +${card.sellPrice}냥</button></div>`
    : '<div class="card hint">유닛을 누르면 정보가 보입니다. 끌어서 다른 칸으로 옮길 수 있습니다.</div>');
}

export function upgradesHtml(state: GameState): string {
  const rows = upgradeRows(state).map((r, i) => `
    <tr><td>${i + 1}</td><td>${esc(r.label)}</td><td>${r.level} / ${r.max}</td><td>${esc(r.effectText)}</td>
    <td><button data-action="upgrade" data-arg="${r.id}" ${r.affordable ? '' : 'disabled'}>${r.cost === null ? '최대' : `${r.cost}냥`}</button></td></tr>`).join('');
  return `<div class="modal"><div class="modal-head">강화 · 엽전 ${state.coins}냥 <button data-action="closeModal">닫기</button></div>
    <table class="upgrades"><tbody>${rows}</tbody></table></div>`;
}
