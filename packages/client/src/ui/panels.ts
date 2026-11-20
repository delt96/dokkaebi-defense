import type { GameState } from '@dorandi/logic';
import { GRADE_COLOR } from '../layout';
import { combineOptions, rightModel, unitCard, upgradeRows } from './models';
import { el, esc, setHtml } from './dom';

export function renderRight(state: GameState): void {
  const m = rightModel(state);
  setHtml(el('right'), `
    <div class="res"><b>도깨비불 (뽑기)</b><span>${state.tokens}</span></div>
    <div class="res"><b>엽전</b><span>${state.coins}</span></div>
    <div class="res"><b>메밀묵</b><span>${state.buckwheat}</span></div>
    <button class="big" data-action="summon" ${m.canSummon ? '' : 'disabled'}>뚝딱! (${state.tokens}번)</button>
    <div>보너스까지 1등급 ${m.bonusIn}번</div>
    ${m.pending ? `<div class="res pending"><b>보관 중</b><span>${m.pending}</span></div>` : ''}
    <button data-action="convert" ${m.canConvert ? '' : 'disabled'}>불 바꾸기 (+${state.data.balance.tokens.toCoins}냥)</button>
    <button data-action="openUpgrades">강화</button>`);
}

export function renderBottom(state: GameState, selected: number | null): void {
  const card = selected === null ? null : unitCard(state, selected);
  const options = selected === null ? '' : combineOptions(state, selected).map(option =>
    option.missing.length
      ? `<span class="combine-missing">${esc(option.name)} (모자람: ${option.missing.map(esc).join(', ')})</span>`
      : `<button data-action="combine" data-arg="${esc(option.result)}@${selected}">${option.key ? `[${option.key}] ` : ''}${esc(option.name)}</button>`
  ).join('');
  setHtml(el('bottom'), card
    ? `<div class="card"><span class="unit-info" title="${esc(card.skillText)}"><span><span class="dot" style="background:${GRADE_COLOR[card.grade]}"></span>
        <b>${esc(card.name)}</b> · ${card.grade}등급 · ${card.typeText}</span>
        <span>공격 ${card.attack} · ${card.interval}초마다 · 사거리 ${card.range}칸</span></span>
        <span class="skill" title="${esc(card.skillText)}">${esc(card.skillText)}</span>
        ${options ? `<div class="combine-options">${options}</div>` : ''}
        <button data-action="sell" data-arg="${selected}">판매(S) +${card.sellPrice}냥</button></div>`
    : '<div class="card hint">유닛을 눌러 선택하고 끌어서 옮기세요. · Tab/W 다음 유닛 · Space 소환 · Esc 선택 해제</div>');
}

export function upgradesHtml(state: GameState): string {
  const rows = upgradeRows(state).map((r, i) => `
    <tr><td>${i + 1}</td><td>${esc(r.label)}</td><td>${r.level} / ${r.max}</td><td>${esc(r.effectText)}</td>
    <td><button data-action="upgrade" data-arg="${r.id}" ${r.affordable ? '' : 'disabled'}>${r.cost === null ? '최대' : `${r.cost}냥`}</button></td></tr>`).join('');
  return `<div class="modal"><div class="modal-head">강화 · 엽전 ${state.coins}냥 <button data-action="closeModal">닫기</button></div>
    <table class="upgrades"><tbody>${rows}</tbody></table></div>`;
}
