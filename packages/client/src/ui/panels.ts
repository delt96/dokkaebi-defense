import { jigeCandidates, type GameState } from '@dorandi/logic';
import { GRADE_COLOR } from '../layout';
import { ATTACK_RANGE_HINT, attackRangeText, combineNoteLines, combineOptions, rightModel, summonOddsText, unitCard, upgradeRows, type CombineOption } from './models';
import { el, esc, setHtml } from './dom';
import { typeBadgeHtml } from './badge';
import { STORE_ALL_KEY, unitFaceHtml } from './storage';
import { roleText } from './dex-roles';
import { pinButton } from './target';

/** `market`: stage 3 shows a 장터 (B) button; true while the panel is open. `quests`: the 60-round quest box, laid at the
 * bottom above the dex button; the settings gear sits under both. */
export interface RightOpts { online?: boolean; notices?: string[]; market?: boolean; quests?: string }

export function renderRight(state: GameState, opts: RightOpts = {}): void {
  const m = rightModel(state);
  const needSlot = opts.online === true && !state.slots.some((u, i) => !u && state.open[i]);
  setHtml(el('right'), `
    <div class="res"><b>도깨비불 (뽑기)</b><span>${state.tokens}</span></div>
    <div class="res"><b>엽전</b><span>${state.coins}</span></div>
    <div class="res"><b>메밀묵</b><span>${state.buckwheat}</span></div>
    <button class="big" data-action="summon" title="${esc(summonOddsText(state.data, state.round))}" ${m.canSummon ? '' : 'disabled'}>뚝딱! (${state.tokens}번)</button>
    ${needSlot ? '<div class="need-slot">빈칸 필요</div>' : ''}
    <button data-action="convert" ${m.canConvert ? '' : 'disabled'}>불 바꾸기 (+${state.data.balance.tokens.toCoins}냥)</button>
    <button data-action="openUpgrades">강화 (E)</button>
    ${opts.market === undefined ? '' : `<button data-action="toggleMarket" class="market-btn" aria-pressed="${opts.market}">장터 (B)</button>`}
    ${opts.notices?.length ? `<div class="notices">${opts.notices.map(n => `<div>${esc(n)}</div>`).join('')}</div>` : ''}
    <div class="right-foot">${opts.quests ?? ''}<button class="dex-open" data-action="openDex">도감 (D)</button>
    </div>`);
}

function recipeHtml(state: GameState, option: CombineOption, unitId: number | null, short: boolean): string {
  const badge = typeBadgeHtml(state.data, option.result, short);
  if (option.missing.length) {
    const currency = option.short ?? (option.cost ? `비용 ${option.cost}` : '');
    const missing = `${option.missing.join(', ')} 부족${currency ? ` · ${currency}` : ''}`;
    return `<span class="combine-missing" title="${esc(`${option.name} · ${missing}`)}">${esc(option.name)} ${badge} · ${esc(missing)}</span>`;
  }
  // every material is there but not the cost: the button stays, disabled, and says what is missing
  if (option.short) {
    return `<button data-action="combine" data-arg="${esc(option.result)}@${unitId}" class="combine-blocked" disabled title="${esc(option.short)}">${esc(option.name)} ${badge} · <span class="combine-short">${esc(option.short)}</span></button>`;
  }
  const cost = option.cost ? ` · <span class="combine-cost">${esc(option.cost)}</span>` : '';
  return `<button data-action="combine" data-arg="${esc(option.result)}@${unitId}"${option.cost ? ` title="비용 ${esc(option.cost)}"` : ''}>${option.key ? `[${option.key}] ` : ''}${esc(option.name)} ${badge}${cost}</button>`;
}

const notesHtml = (lines: string[]): string => (lines.length ? `<ul class="card-notes">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '');

/** A stat cell of the 상세 window; `bonus` is the upgrade/aura part as a fraction, shown only when there is one. */
function statHtml(label: string, value: string, bonus = 0, bonusLabel = '', hint = ''): string {
  const extra = bonus > 0 ? ` <span class="ud-bonus" title="강화·오라 포함">${bonusLabel}+${Math.round(bonus * 100)}%</span>` : '';
  return `<div class="ud-stat"${hint ? ` title="${esc(hint)}"` : ''}><dt>${label}</dt><dd>${value}${extra}</dd></div>`;
}

const sectionHtml = (title: string, body: string): string => `<section class="ud-sec"><h3>${title}</h3>${body}</section>`;

/**
 * The 상세 window: a fixed head (grade dot, name, grade, type badge, close) over a body that scrolls on its own —
 * stats, then 능력 (one line per effect), 메모 (stage 3 notes) and 조합.
 */
export function unitDetailsHtml(state: GameState, selected: number, target: string | null = null): string {
  const card = unitCard(state, selected)!;
  const unit = state.slots[selected]!;
  const options = combineOptions(state, selected).map(option => {
    const notes = combineNoteLines(state.data, option.result);
    return `<div class="recipe"><div class="recipe-head">${recipeHtml(state, option, unit.id, false)}${pinButton(option.result, target)}</div>${notesHtml(notes)}</div>`;
  });
  const head = `<div class="modal-head ud-head">${unitFaceHtml(unit.defId, card.name, card.grade)}<b class="ud-name">${esc(card.name)}</b>
    <span class="ud-grade">${card.grade}등급${card.hidden ? ' · 숨은 유닛' : ''}</span>${typeBadgeHtml(state.data, unit.defId)}
    <button class="ud-close" data-action="closeModal">Tab·Esc 닫기</button></div>`;
  const stats = `<dl class="ud-stats">${statHtml('공격력', String(card.attack), card.attackBonus)}${statHtml('공격 간격', `${card.interval}초`, card.speedBonus, '속도 ')}${statHtml('사거리', attackRangeText(state.data, card.range), 0, '', ATTACK_RANGE_HINT)}${statHtml('판매가', `${card.sellPrice}냥`)}</dl>`;
  const roles = card.roles.length ? `<div class="dex-roles">${card.roles.map(t => `<span class="role-tag role-${t.role}">${roleText(t)}</span>`).join('')}</div>` : '';
  const lines = card.skillText ? card.skillText.split(' / ') : [];
  const skill = lines.length ? `<ul class="ud-lines">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p class="ud-empty">특수 능력 없음</p>';
  const body = [
    stats,
    sectionHtml('능력', roles + skill),
    card.notes.length ? sectionHtml('메모', notesHtml(card.notes)) : '',
    sectionHtml('조합', `<div class="recipe-list">${options.join('') || '최종 조합입니다.'}</div>`),
  ].join('');
  return `<div class="modal unit-details" role="dialog" aria-label="${esc(card.name)} 상세">${head}<div class="ud-body">${body}</div></div>`;
}

/** `hotkeys`: extra keys for the help line (stage 3 adds the market); stage 1-2 pass nothing and keep the old line. */
/** The hotkey help line under the board (the 도움말 setting hides it). */
export function helpLineHtml(hotkeys?: string): string {
  return `<div class="card hint">유닛을 눌러 선택하고 끌어서 옮기세요. · W 다음 유닛 · Tab 상세 · Space 소환 · E 강화 · D 도감 · ${STORE_ALL_KEY} 1·2등급 보관 · Esc 선택 해제${hotkeys ? ` · ${esc(hotkeys)}` : ''}</div>`;
}

/** The selected unit and the recipes its card offers (Z/X/C press them). */
export function cardRecipes(state: GameState, selected: number | null): { unitId: number | null; recipes: CombineOption[] } {
  return {
    unitId: selected === null ? null : state.slots[selected]?.id ?? null,
    recipes: selected === null ? [] : combineOptions(state, selected),
  };
}

function compactRecipes(state: GameState, recipes: CombineOption[], unitId: number | null, visible: number): string {
  if (!recipes.length) return '';
  const rows = recipes.map(option => recipeHtml(state, option, unitId, true)).join('');
  const more = recipes.length - visible;
  return `<div class="card-recipes"><div class="combine-options" data-scroll-key="${unitId}" tabindex="0" aria-label="다음 조합">${rows}</div>
    ${more > 0 ? `<button class="recipe-more" data-action="unitDetails">+${more}개 더</button>` : ''}</div>`;
}

function jigeHtml(state: GameState, selected: number, unitId: number | null, jige: number | undefined): string {
  return jige !== undefined && unitId !== null && jigeCandidates(state.data, state.slots[selected]!.defId).length > 0
    ? `<span class="jige-held">보유 지게 ${jige}개</span><button data-action="jigeOpen" data-arg="board:${unitId}"${jige < 1 ? ' disabled' : ''}>R 지게 바꾸기</button>` : '';
}

/**
 * Online: the selected unit's one-line card under the board, or the help line (null hotkeys = 도움말 off).
 * Solo shows the card in the left panel (unitPanelHtml) and only the help line here.
 */
export function renderBottom(state: GameState, selected: number | null, online = false, hotkeys?: string | null, jige?: number) {
  const pick = cardRecipes(state, selected);
  const card = online && selected !== null ? unitCard(state, selected) : null;
  const help = hotkeys === null ? '' : helpLineHtml(hotkeys);
  if (!card) {
    setHtml(el('bottom'), help);
    return pick;
  }
  const { unitId, recipes } = pick;
  const options = compactRecipes(state, recipes, unitId, 2);
  setHtml(el('bottom'), `<div class="card"><span class="unit-info" title="${esc(card.skillText)}"><span><span class="dot" style="background:${GRADE_COLOR[card.grade]}"></span>
        <b>${esc(card.name)}</b> · ${card.grade}등급 · ${typeBadgeHtml(state.data, state.slots[selected!]!.defId)}</span>
        <span title="${ATTACK_RANGE_HINT}">공격 ${card.attack} · ${card.interval}초마다 · 사거리 ${attackRangeText(state.data, card.range)}</span></span>
        ${options}
        <button data-action="unitDetails">상세(Tab)</button>
        ${jigeHtml(state, selected!, unitId, jige)}
        <button data-action="sell" data-arg="${unitId}">판매(S) +${card.sellPrice}냥</button></div>`);
  return pick;
}

/**
 * Solo: the selected unit's card for the left panel. Alone it shows the whole skill text; `compact` (the helper list
 * sits above it) cuts the skill to two lines. With nothing selected it says how to fill it.
 */
export function unitPanelHtml(state: GameState, selected: number | null, opts: { compact?: boolean; jige?: number } = {}): string {
  const card = selected === null ? null : unitCard(state, selected);
  if (!card) return '<div class="unit-panel empty">유닛을 누르면 여기에 정보가 나옵니다</div>';
  const { unitId, recipes } = cardRecipes(state, selected);
  const options = compactRecipes(state, recipes, unitId, 4);
  const details = state.data.balance.extendedCombat ? '<button data-action="unitDetails">상세(Tab)</button>' : '';
  const jige = jigeHtml(state, selected!, unitId, opts.jige);
  return `<div class="unit-panel${opts.compact ? ' compact' : ''}">
    <div class="up-name">${unitFaceHtml(state.slots[selected!]!.defId, card.name, card.grade)}<b>${esc(card.name)}</b></div>
    <div class="up-sub">${card.grade}등급 · ${typeBadgeHtml(state.data, state.slots[selected!]!.defId)}</div>
    <div class="up-stats"><span>공격 ${card.attack} · ${card.interval}초마다</span><span title="${ATTACK_RANGE_HINT}">사거리 ${attackRangeText(state.data, card.range)}</span></div>
    <p class="up-skill${opts.compact ? ' compact' : ''}" title="${esc(card.skillText)}">${esc(card.skillText)}</p>
    ${options}
    ${jige ? `<div class="up-jige">${jige}</div>` : ''}
    <div class="up-actions">${details}<button data-action="sell" data-arg="${unitId}">판매(S) +${card.sellPrice}냥</button></div></div>`;
}

export function upgradesHtml(state: GameState): string {
  const rows = upgradeRows(state).map((r, i) => `
    <tr><td class="upgrade-key">${i + 1}</td><td>${esc(r.label)}</td><td>${r.level} / ${r.max}</td><td>${esc(r.effectText)}</td>
    <td><button data-action="upgrade" data-arg="${r.id}" ${r.affordable ? '' : 'disabled'}>${r.cost === null ? '최대' : `${r.cost}냥`}</button></td></tr>`).join('');
  return `<div class="modal"><div class="modal-head">강화 · 엽전 ${state.coins}냥 <button data-action="closeModal">E·Esc 닫기</button></div>
    <table class="upgrades"><tbody>${rows}</tbody></table></div>`;
}
