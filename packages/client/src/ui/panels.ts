import { STORAGE_MAX_GRADE, isTamedKind, jigeCandidates, unitDefFast, type EconMine, type GameState } from '@dorandi/logic';
import { GRADE_COLOR } from '../layout';
import {
  ATTACK_RANGE_HINT, EATS_ITEM_TEXT, REPLACE_ITEM_TEXT, attackRangeText, baseSpec, cardRangeText, combineNoteLines, combineOptions, itemShareText, rightModel,
  summonOddsText, unitCard, upgradeRows, type CombineOption, type UnitCard,
} from './models';
import { el, esc, setHtml } from './dom';
import { typeBadgeHtml } from './badge';
import { STORE_ALL_KEY, STORE_KEY, unitFaceHtml } from './storage';
import { materialChipsHtml } from './chips';
import { roleText } from './dex-roles';
import { pinButton } from './target';

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

/**
 * One recipe. With `chips` it takes two lines: the key, result face, name and badge, then the material chips (the grade
 * 5-6 cost at their end). Without (the 44px online card) it stays one line, naming what is missing in words.
 */
function recipeHtml(state: GameState, option: CombineOption, unitId: number | null, short: boolean, chips = true): string {
  const badge = typeBadgeHtml(state.data, option.result, short);
  const face = unitFaceHtml(option.result, option.name, option.grade);
  const key = option.key ? `[${option.key}] ` : '';
  const eats = option.eatsItem ? ` · <span class="combine-eats">${EATS_ITEM_TEXT}</span>` : '';
  const head = (extra: string) => `<span class="recipe-top">${key}${face}<b>${esc(option.name)}</b> ${badge}${extra}${eats}</span>`;
  const mats = chips ? materialChipsHtml(option.materials, option.cost) : '';
  if (option.missing.length) {
    const currency = option.short ?? (option.cost ? `비용 ${option.cost}` : '');
    const missing = `${option.missing.join(', ')} 부족${currency ? ` · ${currency}` : ''}`;
    const extra = chips ? (option.short ? ` · <span class="combine-short">${esc(option.short)}</span>` : '') : ` · ${esc(missing)}`;
    return `<span class="recipe-row combine-missing" title="${esc(`${option.name} · ${missing}`)}">${head(extra)}${mats}</span>`;
  }
  // every material is there but not the cost: the button stays, disabled, and says what is missing
  if (option.short) {
    return `<button data-action="combine" data-arg="${esc(option.result)}@${unitId}" class="recipe-row combine-blocked" disabled title="${esc(option.short)}">${head(` · <span class="combine-short">${esc(option.short)}</span>`)}${mats}</button>`;
  }
  const cost = option.cost && !chips ? ` · <span class="combine-cost">${esc(option.cost)}</span>` : '';
  return `<button data-action="combine" data-arg="${esc(option.result)}@${unitId}" class="recipe-row"${option.cost ? ` title="비용 ${esc(option.cost)}"` : ''}>${head(cost)}${mats}</button>`;
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
  const options = combineOptions(state, selected).map(option => {
    const notes = combineNoteLines(state.data, option.result, true);
    return `<div class="recipe"><div class="recipe-head">${recipeHtml(state, option, unit.id, false)}${pinButton(option.result, target)}</div>${resultSpecHtml(state, unit.defId, option.result)}${notesHtml(notes)}</div>`;
  });
  const head = `<div class="modal-head ud-head">${unitFaceHtml(unit.defId, card.name, card.grade)}<b class="ud-name">${esc(card.name)}</b>
    <span class="ud-grade">${card.grade}등급${card.hidden ? ' · 숨은 유닛' : ''}${card.item?.evolved ? ' · 진화' : ''}</span>${typeBadgeHtml(state.data, unit.defId)}
    <button class="ud-close" data-action="closeModal">Tab·Esc 닫기</button></div>`;
  const stats = `<dl class="ud-stats">${statHtml('공격력', String(card.attack), card.attackBonus)}${statHtml('공격 간격', `${card.interval}초`, card.speedBonus, '속도 ')}${statHtml('사거리', cardRangeText(state.data, card).replace('사거리 ', ''), 0, '', ATTACK_RANGE_HINT)}${statHtml('판매가', `${card.sellPrice}냥`)}</dl>
    ${card.item ? `<p class="ud-item">아이템 ${esc(card.item.name)}${esc(itemShareText(card, 'attack') || itemShareText(card, 'speed'))}</p>` : ''}`;
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

/** What the help line can name: a selected unit (and whether it fits in storage), stage 3's quests (J) and 지게 (R), the solo pause (P). */
export interface HelpContext { selected?: boolean; storable?: boolean; quests?: boolean; jige?: boolean; pause?: boolean }

/**
 * The hotkey help line under the board (the 도움말 setting hides it). With a unit selected it lists what that unit takes;
 * otherwise the board-wide keys. `hotkeys`: extra keys (stage 3 adds the market).
 */
export function helpLineHtml(hotkeys?: string, ctx: HelpContext = {}): string {
  const keys = ctx.selected
    ? ['Z/X/C 조합', 'S 판매', ...(ctx.storable ? [`${STORE_KEY} 보관`] : []), ...(ctx.jige ? ['R 지게'] : []), 'Tab 상세', 'W 다음 유닛', 'Space 소환', 'Esc 선택 해제']
    : ['유닛을 눌러 선택하고 끌어서 옮기세요.', 'W 다음 유닛', 'Space 소환', 'E 강화', 'D 도감', 'Q 도우미', `${STORE_ALL_KEY} 1·2등급 보관`,
      ...(hotkeys ? [hotkeys] : []), ...(ctx.quests ? ['J 퀘스트'] : []), ...(ctx.pause ? ['P 멈춤'] : [])];
  return `<div class="card hint">${keys.map(esc).join(' · ')}</div>`;
}

/** The selected unit and the recipes its card offers (Z/X/C press them). */
export function cardRecipes(state: GameState, selected: number | null): { unitId: number | null; recipes: CombineOption[] } {
  return {
    unitId: selected === null ? null : state.slots[selected]?.id ?? null,
    recipes: selected === null ? [] : combineOptions(state, selected),
  };
}

function compactRecipes(state: GameState, recipes: CombineOption[], unitId: number | null, visible: number, chips: boolean): string {
  if (!recipes.length) return '';
  const rows = recipes.map(option => recipeHtml(state, option, unitId, true, chips)).join('');
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

function jigeHtml(state: GameState, selected: number, unitId: number | null, jige: number | undefined): string {
  return jige !== undefined && unitId !== null && jigeCandidates(state.data, state.slots[selected]!.defId).length > 0
    ? `<span class="jige-held" title="지게는 장터 묵 보따리에서 3% 확률로 함께 나옵니다">보유 지게 ${jige}개</span><button data-action="jigeOpen" data-arg="board:${unitId}"${jige < 1 ? ' disabled' : ''}>R 지게 바꾸기</button>` : '';
}

/** The item shop as the server's (or the solo lane's) economy view has it; null without a shop. */
export type ShopView = NonNullable<EconMine['shop']>;

/** One 붙이기 button per held kind; the unit id rides along so a moved board never gets the item on another unit. */
function attachButtons(shop: ShopView, unitId: number, menu: boolean, tamed: boolean): string {
  return shop.items.filter(i => (menu || i.held > 0) && (tamed || i.effect.kind !== 'evolve')).map(i => i.held > 0
    ? `<button data-action="attachItem" data-arg="${esc(i.id)}@${unitId}">${menu ? `${esc(i.name)} (${i.held}개) 붙이기` : `붙이기: ${esc(i.name)} (${i.held})`}</button>`
    : `<button disabled>${esc(i.name)} (0개)</button>`).join('');
}

/** Something is held, or the market is open to buy (every item is marketLocked until then). */
const shopLive = (shop: ShopView) => shop.items.some(i => i.held > 0 || i.why !== 'marketLocked');

/** Solo left card: the attached item, a 붙이기 per held kind and the replace warning. */
function itemLineHtml(card: UnitCard, unitId: number | null, shop: ShopView | null | undefined, tamed: boolean): string {
  if (!shop || unitId === null || (!card.item && !shopLive(shop))) return '';
  const buttons = attachButtons(shop, unitId, false, tamed);
  const hint = buttons ? (card.item ? `<small class="item-warn">${REPLACE_ITEM_TEXT}</small>` : '') : '<small class="item-hint">장터(B) 아이템 탭에서 삽니다</small>';
  return `<div class="up-item"><span><b>아이템</b> ${card.item ? esc(card.item.name) : '없음'}</span>${buttons}${hint}</div>`;
}

/** Online: the 아이템 ▾ list over the one-line card. */
function itemPopHtml(card: UnitCard, unitId: number, shop: ShopView, tamed: boolean): string {
  return `<div class="item-pop" role="group" aria-label="아이템 붙이기"><b>아이템 붙이기</b>${attachButtons(shop, unitId, true, tamed)}
    ${card.item ? `<small class="item-warn">${esc(card.item.name)} · ${REPLACE_ITEM_TEXT}</small>` : ''}</div>`;
}

/** The shop view and whether the online 아이템 ▾ list is open on this card. */
export interface CardItems { shop: ShopView | null; open: boolean }

/**
 * Online: the selected unit's one-line card under the board, or the help line (null hotkeys = 도움말 off).
 * Solo shows the card in the left panel (unitPanelHtml) and only the help line here.
 */
export function renderBottom(state: GameState, selected: number | null, online = false, hotkeys?: string | null, jige?: number, sellArmed = false, items?: CardItems) {
  const pick = cardRecipes(state, selected);
  const card = online && selected !== null ? unitCard(state, selected) : null;
  const help = hotkeys === null ? '' : helpLineHtml(hotkeys, {
    selected: selected !== null && !!state.slots[selected], storable: storable(state, selected), quests: !!state.data.economy, jige: !!state.data.economy?.market, pause: !online,
  });
  if (!card) {
    setHtml(el('bottom'), help);
    return pick;
  }
  const { unitId, recipes } = pick;
  const options = compactRecipes(state, recipes, unitId, 2, false);
  const shop = items?.shop && unitId !== null && (card.item || shopLive(items.shop)) ? items.shop : null;
  const share = (kind: 'attack' | 'speed') => (itemShareText(card, kind) ? ` (+${Math.round(card.share[kind] * 100)}%)` : '');
  setHtml(el('bottom'), `<div class="card"><span class="unit-info" title="${esc(card.skillText)}"><span><span class="dot" style="background:${GRADE_COLOR[card.grade]}"></span>
        <b>${esc(card.name)}</b> · ${card.grade}등급 · ${typeBadgeHtml(state.data, state.slots[selected!]!.defId, true)}${card.item ? ` <span class="item-tag" title="${esc(card.item.name)}">${esc(card.item.short)}</span>` : ''}</span>
        <span title="${ATTACK_RANGE_HINT}">공격 ${card.attack}${share('attack')} · ${card.interval}초마다${share('speed')} · ${esc(cardRangeText(state.data, card, true))}</span></span>
        ${options}
        <button data-action="unitDetails">상세(Tab)</button>
        ${shop ? `<button data-action="itemMenu" data-arg="${unitId}" aria-expanded="${items!.open}" class="item-menu">아이템 ▾</button>` : ''}
        ${jigeHtml(state, selected!, unitId, jige)}
        ${storeButton(state, selected!, unitId)}
        ${sellButton(unitId, card.sellPrice, sellArmed)}</div>${shop && items!.open ? itemPopHtml(card, unitId!, shop, isTamedKind(state.data, state.slots[selected!]!.defId)) : ''}`);
  return pick;
}

/**
 * Solo: the selected unit's card for the left panel. Alone it shows the whole skill text; `compact` (the helper list
 * sits above it) cuts the skill to two lines. With nothing selected it says how to fill it.
 */
export function unitPanelHtml(state: GameState, selected: number | null, opts: { compact?: boolean; jige?: number; sellArmed?: boolean; shop?: ShopView | null } = {}): string {
  const card = selected === null ? null : unitCard(state, selected);
  if (!card) return '<div class="unit-panel empty">유닛을 누르면 여기에 정보가 나옵니다</div>';
  const { unitId, recipes } = cardRecipes(state, selected);
  const options = compactRecipes(state, recipes, unitId, 2, true);
  const details = state.data.balance.extendedCombat ? '<button data-action="unitDetails">상세(Tab)</button>' : '';
  const jige = jigeHtml(state, selected!, unitId, opts.jige);
  return `<div class="unit-panel${opts.compact ? ' compact' : ''}">
    <div class="up-name">${unitFaceHtml(state.slots[selected!]!.defId, card.name, card.grade)}<b>${esc(card.name)}</b></div>
    <div class="up-sub">${card.grade}등급 · ${typeBadgeHtml(state.data, state.slots[selected!]!.defId, true)}${card.item?.evolved ? ' · 진화' : ''}</div>
    <div class="up-stats"><span>공격 ${card.attack}${esc(itemShareText(card, 'attack'))} · ${card.interval}초마다${esc(itemShareText(card, 'speed'))}</span><span title="${ATTACK_RANGE_HINT}">${esc(cardRangeText(state.data, card))}</span></div>
    <p class="up-skill${opts.compact ? ' compact' : ''}" title="${esc(card.skillText)}">${esc(card.skillText)}</p>
    ${itemLineHtml(card, unitId, opts.shop, isTamedKind(state.data, state.slots[selected!]!.defId))}
    ${options}
    ${jige ? `<div class="up-jige">${jige}<small class="jige-note">지게: 같은 등급의 다른 유닛으로 바꿉니다</small></div>` : ''}
    <div class="up-actions">${details}${storeButton(state, selected!, unitId)}${sellButton(unitId, card.sellPrice, opts.sellArmed === true)}</div></div>`;
}

export function upgradesHtml(state: GameState): string {
  const rows = upgradeRows(state).map((r, i) => `
    <tr><td class="upgrade-key">${i + 1}</td><td>${esc(r.label)}</td><td>${r.level} / ${r.max}</td><td>${esc(r.effectText)}</td>
    <td><button data-action="upgrade" data-arg="${r.id}" ${r.affordable ? '' : 'disabled'}>${r.cost === null ? '최대' : `${r.cost}냥`}</button></td></tr>`).join('');
  return `<div class="modal"><div class="modal-head">강화 · 엽전 ${state.coins}냥 <button data-action="closeModal">E·Esc 닫기</button></div>
    <table class="upgrades"><tbody>${rows}</tbody></table></div>`;
}
