import { STORAGE_MAX_GRADE, jigeCandidates, unitDefFast, type GameState } from '@dorandi/logic';
import { GRADE_COLOR, type WinPlace } from '../layout';
import { ATTACK_RANGE_HINT, attackRangeText, baseSpec, combineNoteLines, combineOptions, rightModel, summonOddsText, unitCard, upgradeInfoText, upgradeRows, type CombineOption, type NextList, type UnitCard } from './models';
import { el, esc, setHtml } from './dom';
import { typeBadgeHtml } from './badge';
import { STORE_ALL_KEY, STORE_KEY, unitFaceHtml } from './storage';
import { nextListHtml, recipeRowHtml } from './next-list';
import { roleText } from './dex-roles';
import { pinButton } from './target';
import { rightBarHtml, winHeadHtml } from './windows';

/** `market`: stage 3 shows a 장터 (B) button; true while the panel is open. `quests`: the 60-round quest box, laid at the
 * bottom above the dex button; the settings gear sits under both. */
export interface RightOpts { online?: boolean; notices?: string[]; market?: boolean; quests?: string; heldCoins?: number }

export function renderRight(state: GameState, opts: RightOpts = {}): void {
  const m = rightModel(state);
  const needSlot = opts.online === true && !state.slots.some((u, i) => !u && state.open[i]);
  setHtml(el('right'), `
    <div class="res"><b>도깨비불 (뽑기)</b><span>${state.tokens}</span></div>
    <div class="res"><b>엽전</b><span>${state.coins - (opts.heldCoins ?? 0)}</span></div>
    <div class="res"><b>메밀묵</b><span>${state.buckwheat}</span></div>
    <button class="big" data-action="summon" title="${esc(summonOddsText(state.data, state.round))}" ${m.canSummon ? '' : 'disabled'}>뚝딱! (${state.tokens}번)</button>
    ${needSlot ? '<div class="need-slot">빈칸 필요</div>' : ''}
    <button data-action="convert" ${m.canConvert ? '' : 'disabled'}>불 1개 → ${state.data.balance.tokens.toCoins}냥</button>
    <button data-action="openUpgrades">강화 (E)</button>
    ${opts.market === undefined ? '' : `<button data-action="toggleMarket" class="market-btn" aria-pressed="${opts.market}">장터 (B)</button>`}
    ${opts.notices?.length ? `<div class="notices">${opts.notices.map(n => `<div>${esc(n)}</div>`).join('')}</div>` : ''}
    <div class="right-foot">${opts.quests ?? ''}<button class="dex-open" data-action="openDex">도감 (D)</button>
    </div>`);
}

const notesHtml = (lines: string[]): string => (lines.length ? `<ul class="card-notes">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '');

/** A stat cell of the 상세 window; `bonus` is the upgrade/aura part as a fraction, shown only when there is one. */
function statHtml(label: string, value: string, bonus = 0, bonusLabel = '', hint = ''): string {
  const extra = bonus > 0 ? ` <span class="ud-bonus" title="강화·오라 포함">${bonusLabel}+${Math.round(bonus * 100)}%</span>` : '';
  return `<div class="ud-stat"${hint ? ` title="${esc(hint)}"` : ''}><dt>${label}</dt><dd>${value}${extra}</dd></div>`;
}

/** A number of the recipe's result beside the current unit's ("120 → 340"), green when it is better. */
function specCell(label: string, from: number, to: number, unit: string, lowerIsBetter = false, text = (n: number) => `${n}${unit}`): string {
  const better = lowerIsBetter ? to < from : to > from;
  const worse = lowerIsBetter ? to > from : to < from;
  return `<span class="rs-cell"><i>${label}</i> ${text(from)} → <b class="${better ? 'rs-up' : worse ? 'rs-down' : ''}">${text(to)}</b></span>`;
}

/**
 * What the recipe's result is, before upgrades: its attack, interval and range against the selected unit's, its roles,
 * then one line per skill — the higher unit's own spec, so the player can tell what the combine gives.
 */
function resultSpecHtml(state: GameState, fromId: string, resultId: string): string {
  const from = baseSpec(state.data, fromId);
  const to = baseSpec(state.data, resultId);
  const range = (n: number) => attackRangeText(state.data, n);
  const cells = specCell('공격력', from.attack, to.attack, '') + specCell('간격', from.interval, to.interval, '초', true)
    + specCell('사거리', from.range, to.range, '', false, range);
  const roles = to.roles.length ? `<div class="dex-roles">${to.roles.map(t => `<span class="role-tag role-${t.role}">${roleText(t)}</span>`).join('')}</div>` : '';
  const skills = to.skills.length ? `<ul class="rs-skills">${to.skills.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p class="ud-empty">특수 능력 없음</p>';
  return `<div class="result-spec" title="강화·오라 빼고 비교"><div class="rs-stats">${cells}</div>${roles}${skills}</div>`;
}

const sectionHtml = (title: string, body: string): string => `<section class="ud-sec"><h3>${title}</h3>${body}</section>`;

/**
 * The 상세 window: a fixed head (grade dot, name, grade, type badge, close) over a body that scrolls on its own —
 * stats, then 능력 (one line per effect), 메모 (stage 3 notes) and 조합.
 */
export function unitDetailsHtml(state: GameState, selected: number, target: string | null = null): string {
  const card = unitCard(state, selected)!;
  const unit = state.slots[selected]!;
  const options = combineOptions(state, selected, target).map(option => {
    const notes = combineNoteLines(state.data, option.result, true);
    return `<div class="recipe"><div class="recipe-head">${recipeRowHtml(state, option, { unitId: unit.id, fullBadge: true })}${pinButton(option.result, target)}</div>${resultSpecHtml(state, unit.defId, option.result)}${notesHtml(notes)}</div>`;
  });
  const head = winHeadHtml({
    side: 'left',
    titleHtml: `${unitFaceHtml(unit.defId, card.name, card.grade)}<b class="ud-name">${esc(card.name)}</b>`
      + `<span class="ud-grade">${card.grade}등급${card.hidden ? ' · 숨은 유닛' : ''}</span>${typeBadgeHtml(state.data, unit.defId)}`,
    closeLabel: '상세 닫기 (Tab)',
  });
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
  return `<section class="win unit-details" role="dialog" aria-labelledby="win-left-title">${head}<div class="win-body ud-body">${body}</div></section>`;
}

/**
 * What the help line can name: a selected unit (and whether it fits in storage), stage 3's quests (J) and 지게 (R), the solo pause (P).
 * `empty`: no unit on the board yet, so the line opens with how to summon. `online`: Q opens the helper there instead of
 * flipping the scope. `moving`: the selected unit waits for the cell to move to.
 */
export interface HelpContext { selected?: boolean; storable?: boolean; quests?: boolean; jige?: boolean; pause?: boolean; empty?: boolean; online?: boolean; moving?: boolean }

/**
 * The hotkey help line under the board (the 단축키 안내 줄 setting hides it). With a unit selected it lists what that unit takes;
 * otherwise the board-wide keys. `hotkeys`: extra keys (stage 3 adds the market).
 */
export function helpLineHtml(hotkeys?: string, ctx: HelpContext = {}): string {
  const keys = ctx.moving
    ? ['옮길 칸을 누르세요', 'Esc 취소']
    : ctx.selected
    ? ['Z/X/C 조합(판에 짝 표시)', 'S 판매', ...(ctx.storable ? [`${STORE_KEY} 보관`] : []), ...(ctx.jige ? ['R 지게'] : []), 'Tab 상세', 'M 옮기기', 'W 다음 조합', 'Esc 해제']
    : [...(ctx.empty ? ['Space나 뚝딱!으로 유닛을 뽑으세요.'] : []), 'W 다음 조합 고르기', 'Space 소환', 'E 강화', 'D 도감', ctx.online ? 'Q 도우미' : 'Q 이 유닛/전체',
      `${STORE_ALL_KEY} 1·2등급 보관`, ...(hotkeys ? [hotkeys] : []), ...(ctx.quests ? ['J 퀘스트'] : []), ...(ctx.pause ? ['P 멈춤'] : [])];
  return `<div class="card hint">${keys.map(esc).join(' · ')}</div>`;
}

/** The selected unit and the recipes its card offers (Z/X/C press them), in the next-list order for `target`. */
export function cardRecipes(state: GameState, selected: number | null, target: string | null = null): { unitId: number | null; recipes: CombineOption[] } {
  return {
    unitId: selected === null ? null : state.slots[selected]?.id ?? null,
    recipes: selected === null ? [] : combineOptions(state, selected, target),
  };
}

function compactRecipes(state: GameState, recipes: CombineOption[], unitId: number | null, visible: number): string {
  const rows = recipes.map(option => recipeRowHtml(state, option, { unitId, chips: false })).join('');
  const more = recipes.length - visible;
  return `<div class="card-recipes"><div class="combine-options" data-scroll-key="${unitId}" tabindex="0" aria-label="다음 조합">${rows}</div>
    ${more > 0 ? `<button class="recipe-more" data-action="unitDetails">+${more}개 더</button>` : ''}</div>`;
}

/** `armed`: a grade 3+ unit after the first S, waiting for the second. */
function sellButton(unitId: number | null, price: number, armed: boolean): string {
  return `<button data-action="sell" data-arg="${unitId}"${armed ? ' class="armed"' : ''}>${armed ? `한 번 더 누르면 판매 +${price}냥` : `판매(S) +${price}냥`}</button>`;
}

/** Whether the unit in `slot` can go to storage (grades 1-2), as the store command checks. */
function storable(state: GameState, slot: number | null): boolean {
  const unit = slot === null ? null : state.slots[slot];
  return !!unit && unitDefFast(state.data, unit.defId).grade <= STORAGE_MAX_GRADE;
}

/** Puts a grade 1-2 unit in storage, the same as dragging it there; higher grades get no button. */
function storeButton(state: GameState, selected: number, unitId: number | null): string {
  return unitId !== null && storable(state, selected)
    ? `<button data-action="store" data-arg="${unitId}" title="보관함에 넣기 (${STORE_KEY})">보관(${STORE_KEY})</button>` : '';
}

/** `explain` puts what a 지게 does in the button title (the solo panel keeps the row to one line). */
function jigeHtml(state: GameState, selected: number, unitId: number | null, jige: number | undefined, explain = false): string {
  return jige !== undefined && unitId !== null && jigeCandidates(state.data, state.slots[selected]!.defId).length > 0
    ? `<span class="jige-held" title="지게는 장터 묵 보따리에서 3% 확률로 함께 나옵니다">보유 지게 ${jige}개</span><button data-action="jigeOpen" data-arg="board:${unitId}"${explain ? ' title="지게: 같은 등급의 다른 유닛으로 바꿉니다"' : ''}${jige < 1 ? ' disabled' : ''}>R 지게 바꾸기</button>` : '';
}

/**
 * Online: the selected unit's one-line card under the board, or the help line (null hotkeys = 단축키 안내 줄 off).
 * Solo shows the card in the left panel (soloPanelHtml) and only the help line here. `moving`: the line asks for the cell
 * to move to, in place of the online card and even with the help line off (it is the only word on what the press waits for).
 */
export function renderBottom(
  state: GameState, selected: number | null, online = false, hotkeys?: string | null, jige?: number, sellArmed = false, target: string | null = null,
  moving = false,
) {
  const pick = cardRecipes(state, selected, target);
  const card = online && selected !== null && !moving ? unitCard(state, selected) : null;
  const help = hotkeys === null && !moving ? '' : helpLineHtml(hotkeys ?? undefined, {
    selected: selected !== null && !!state.slots[selected], storable: storable(state, selected), quests: !!state.data.economy, jige: !!state.data.economy?.market, pause: !online, online,
    empty: state.slots.every(u => !u), moving,
  });
  if (!card) {
    setHtml(el('bottom'), help);
    return pick;
  }
  const { unitId, recipes } = pick;
  const keyed = recipes.filter(option => option.key);
  const options = keyed.length ? compactRecipes(state, keyed, unitId, 2) : '<span class="card-none">지금 가능 없음 · Q 도우미</span>';
  setHtml(el('bottom'), `<div class="card"><button class="unit-info" data-action="unitDetails" title="${esc(card.skillText)}"><span><span class="dot" style="background:${GRADE_COLOR[card.grade]}"></span>
        <b>${esc(card.name)}</b> · ${card.grade}등급 · ${typeBadgeHtml(state.data, state.slots[selected!]!.defId, true)}</span>
        <span title="${ATTACK_RANGE_HINT}">공격 ${card.attack} · ${card.interval}초마다 · 사거리 ${attackRangeText(state.data, card.range)}</span><span class="ui-open" aria-hidden="true">▸</span></button>
        ${options}
        <button data-action="unitDetails">상세(Tab)</button>
        ${jigeHtml(state, selected!, unitId, jige)}
        ${storeButton(state, selected!, unitId)}
        ${sellButton(unitId, card.sellPrice, sellArmed)}</div>`);
  return pick;
}

const OPEN_SVG = '<svg viewBox="0 0 6 8" width="6" height="8" aria-hidden="true" focusable="false"><polygon points="0,0 6,4 0,8" fill="currentColor"/></svg>';

/**
 * Solo left panel. `list` is the next list in the panel's scope; `idleList` (the settings row) shows it with nothing
 * selected. `skillOpen` unfolds the skill text under the head; `showAllOne` the one-short group of 전체.
 */
export interface SoloPanelOpts {
  selected: number | null; list: NextList; idleList: boolean;
  wPick: string | null; hover: string | null; showAllOne: boolean; skillOpen: boolean;
  jige?: number; sellArmed?: boolean;
}

function soloHeadHtml(state: GameState, slot: number, card: UnitCard, skillOpen: boolean): string {
  const defId = state.slots[slot]!.defId;
  const lines = card.skillText ? card.skillText.split(' / ') : [];
  const skill = lines.length
    ? `<button class="skill-line" data-action="skillOpen" aria-expanded="${skillOpen}" title="${esc(card.skillText)}"><span>${esc(lines[0]!)}</span>${OPEN_SVG}</button>`
    : '<span class="skill-line none">특수 능력 없음</span>';
  const head = `<div class="nc-head"><div class="hrow">${unitFaceHtml(defId, card.name, card.grade, true)}<div class="t">`
    + `<div class="l1"><b>${esc(card.name)}</b>${typeBadgeHtml(state.data, defId, true)}<span class="sub">${card.grade}등급</span></div>`
    + `<div class="dimt">공격 ${card.attack} · ${card.interval}초마다</div></div></div>`
    + `<div class="dimt" title="${ATTACK_RANGE_HINT}">사거리 ${attackRangeText(state.data, card.range)}</div>${skill}</div>`;
  return skillOpen && lines.length ? `${head}<ul class="nc-skill">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : head;
}

const IDLE_HEAD = '<div class="nc-head none"><b>다음 할 일</b><span>W로 맨 위 조합 고르기</span><span>그다음 Z로 조합</span></div>';

/** `online`: Q opens and closes the helper there, so the buttons name Shift+Q and the Q letter is left out. */
export function scopeHtml(list: NextList, selected: boolean, online = false): string {
  const unit = list.scope === 'unit';
  const keyName = online ? 'Shift+Q' : 'Q';
  return `<div class="nc-scope"><button class="scope-btn" data-action="nextScope" data-arg="unit" aria-pressed="${unit}" title="${keyName}"${selected ? '' : ' disabled'}>`
    + `${selected ? `이 유닛 ${list.counts.unit ?? 0}` : '이 유닛'}</button>`
    + `<button class="scope-btn" data-action="nextScope" data-arg="all" aria-pressed="${!unit}" title="${keyName}">전체 ${list.counts.all}</button>${online ? '' : '<span class="scope-q">Q</span>'}</div>`;
}

/** The bottom row: 상세 · 보관 · 판매 with the keys in their titles, or only the second-press sell button of grade 3+. */
function soloActionsHtml(state: GameState, slot: number, unitId: number, price: number, armed: boolean): string {
  if (armed) return `<div class="up-actions"><button data-action="sell" title="S" data-arg="${unitId}" class="armed">한 번 더 누르면 판매 +${price}냥</button></div>`;
  const details = state.data.balance.extendedCombat ? '<button data-action="unitDetails" title="Tab">상세</button>' : '';
  const store = storable(state, slot) ? `<button data-action="store" data-arg="${unitId}" title="${STORE_KEY}">보관</button>` : '';
  return `<div class="up-actions">${details}${store}<button data-action="sell" data-arg="${unitId}" title="S">판매 +${price}냥</button></div>`;
}

export function soloPanelHtml(state: GameState, opts: SoloPanelOpts): string {
  const slot = opts.selected;
  const card = slot === null ? null : unitCard(state, slot);
  const unitId = slot === null ? null : state.slots[slot]?.id ?? null;
  const head = card && slot !== null ? soloHeadHtml(state, slot, card, opts.skillOpen) : IDLE_HEAD;
  if (!card && !opts.idleList) return `<div class="solo-panel">${head}</div>`;
  const listHtml = nextListHtml(state, opts.list, { unitId, wPick: opts.wPick, hover: opts.hover, showAllOne: opts.showAllOne });
  const list = `<div class="nc-list" tabindex="-1" data-scroll-key="${opts.list.scope}:${unitId ?? ''}">${listHtml}</div>`;
  if (!card || slot === null || unitId === null) return `<div class="solo-panel">${head}${scopeHtml(opts.list, false)}${list}</div>`;
  // design ⑦: the row only while a 지게 is held, so the list keeps its three rows at scale 1; R still answers with none
  const jige = (opts.jige ?? 0) >= 1 ? jigeHtml(state, slot, unitId, opts.jige, true) : '';
  return `<div class="solo-panel">${head}${scopeHtml(opts.list, true)}${list}`
    + `${jige ? `<div class="up-jige">${jige}</div>` : ''}${soloActionsHtml(state, slot, unitId, card.sellPrice, opts.sellArmed === true)}</div>`;
}

export function upgradesHtml(state: GameState, wins: WinPlace, heldCoins: number): string {
  const items = upgradeRows(state).map((r, i) => `<div class="up-item">`
    + `<div class="up-line"><span class="upgrade-key">${i + 1}</span> ${esc(r.label)} <b>${r.level} / ${r.max}</b></div>`
    + `<div class="up-effect">${esc(r.effectText)}</div>`
    + `<button data-action="upgrade" data-arg="${r.id}"${r.affordable ? '' : ' disabled'}>${r.cost === null ? '최대' : `${r.cost}냥`}</button></div>`).join('');
  const wallet = wins === 'outside' ? `<span class="win-wallet">엽전 <b>${esc(state.coins - heldCoins)}</b></span>` : '';
  return winHeadHtml({ side: 'right', titleHtml: '강화 (E)', extraHtml: wallet, closeLabel: '강화 닫기 (E)' })
    + (wins === 'inside' ? rightBarHtml(state, heldCoins) : '')
    + `<div class="win-body"><p class="upgrade-info">${esc(upgradeInfoText(state))}</p>${items}</div>`;
}
