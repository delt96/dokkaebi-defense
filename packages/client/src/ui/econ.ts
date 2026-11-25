import {
  jigeCandidates, shopItem, toTicks, type ClientView, type ItemEffect, type DamageType, type EconHuntView, type JigeSource, type QuestId, type QuestRecord, type UnitDef, type EconMine, type EconNote, type GameData, type GameState, type RejectReason,
} from '@dorandi/logic';
import { esc } from './dom';
import { unitSkillText } from './models';
import { withJosa } from './josa';
import { blockedText, gambleHtml, gambleModel, type GambleJige, type GambleModel, type RevealDisplay } from './gamble';

// Stage 3 economy on screen: the market panel (B), the T button under a target's health bar and the
// quest tracker under it. Prices, odds and limits always come from the data and the server's economy view.

const pct = (x: number) => `${Math.round(x * 100)}%`;
/** Keeps a name and its mark (or a label and its number) on one line in the narrow panel. */
const NBSP = ' ';
const nameOf = (data: GameData, id: string): string => data.units.find(u => u.id === id)?.name ?? data.enemies.find(e => e.id === id)?.name ?? id;
const itemName = (data: GameData, id: string): string => shopItem(data, id)?.name ?? id;
const secondsOf = (data: GameData, ticks: number): number => Math.max(0, Math.ceil((ticks * data.balance.tickMs) / 1000));

// ---------- market ----------

export interface MarketModel {
  jige: GambleJige; gamble?: GambleModel; shop?: ShopRow[];
}
export type MarketTab = 'market' | 'items';

export function marketModel(econ: EconMine, state: GameState): MarketModel | null {
  const m = econ.market;
  if (!m) return null;
  const shop = shopModel(econ, state.coins, state.buckwheat);
  return {
    ...(m.gamble && { gamble: gambleModel(m.gamble, state.coins, state.buckwheat) }),
    jige: { chance: m.jigeChance, held: econ.jige, maxGrade: state.data.economy?.market?.maxSwapGrade ?? 4 },
    ...(shop && { shop }),
  };
}

// ---------- item shop ----------

export interface ShopRow { id: string; name: string; effectText: string; price: string; held: number; blocked: string | null; done: boolean }

export function itemEffectText(effect: ItemEffect, perGame: number | null): string {
  const once = perGame === null ? '' : ` · 한 판 ${perGame}번`;
  switch (effect.kind) {
    case 'range': return `유닛 하나 사거리 +${effect.amount}${once}`;
    case 'attack': return `유닛 하나 공격력 +${pct(effect.pct)}${once}`;
    case 'speed': return `유닛 하나 공격 속도 +${pct(effect.pct)}${once}`;
    case 'vuln': return `때린 적이 받는 같은 종류 피해 +${pct(effect.pct)} · ${effect.seconds}초${once}`;
    case 'evolve': return '무언가를 진화시키는 부적이다.';
  }
}

/** `coins` / `buckwheat`: solo the lane's state, online the seat's from its MineView. */
export function shopModel(econ: EconMine, coins: number, buckwheat: number): ShopRow[] | null {
  if (!econ.shop) return null;
  return econ.shop.items.map(i => ({
    id: i.id, name: i.name, effectText: itemEffectText(i.effect, i.perGame), price: `${i.buckwheat ? `묵 ${i.buckwheat} · ` : ''}${i.coins}냥`, held: i.held,
    blocked: i.why === 'itemLimit' ? null
      : i.why === 'noBuckwheat' ? blockedText(i.why, i.buckwheat ?? 0, buckwheat)
      : blockedText(i.why, i.coins, coins, i.fromRound),
    done: i.why === 'itemLimit',
  }));
}

function shopHtml(rows: ShopRow[], readOnly: boolean): string {
  const list = rows.map(r => {
    const why = readOnly ? '관전 중에는 살 수 없어요' : r.blocked;
    const label = r.done ? '삼' : '사기';
    const reasonId = why && !r.done ? `shop-why-${esc(r.id)}` : null;
    return `<div class="shop-row"><span class="shop-name"><b>${esc(r.name)}</b><small>${esc(r.effectText)}</small></span>
      <span class="shop-price">${esc(r.price)}</span><button type="button" class="shop-buy" data-action="buyItem" data-arg="${esc(r.id)}" data-market-focus="item-${esc(r.id)}"
      aria-label="${esc(`${r.name} · ${r.price} · ${label}`)}"${reasonId ? ` aria-describedby="${reasonId}"` : ''}${r.done || why ? ' disabled' : ''}>${label}</button>
      ${reasonId ? `<span class="gamble-why" id="${reasonId}">${esc(why!)}</span>` : ''}</div>`;
  }).join('');
  const held = rows.map(r => `${esc(r.name)}${NBSP}${r.held}`).join(' · ');
  return `<div class="shop-rows">${list}</div><div class="shop-held">들고 있는 아이템: ${held}</div>`;
}

// ---------- jige swap (R) ----------

/** Same-grade normal units a 지게 can turn `defId` into, narrowed by a name part and a damage type. */
export function swapRows(data: GameData, defId: string, name: string, type: DamageType | null): UnitDef[] {
  const q = name.trim();
  return jigeCandidates(data, defId).filter(u => (!q || u.name.includes(q)) && (!type || u.damageType === type));
}

/**
 * An open R list: the exact unit it was opened on (zone, index and id), the lane snapshot it belongs to, and the
 * filters. A pick is sent only while all of these still hold.
 */
export interface JigeList {
  source: JigeSource; defId: string; cost: number | null;
  seat: number | undefined; epoch: number | undefined;
  name: string; type: DamageType | null;
}

export function jigeRowsHtml(data: GameData, list: JigeList): string {
  const rows = swapRows(data, list.defId, list.name, list.type);
  if (rows.length === 0) return '<p class="jige-empty">맞는 유닛이 없습니다</p>';
  return rows.map(u => {
    const skill = unitSkillText(data, u).split(' / ')[0] ?? '';
    return `<button data-action="jigeSwap" data-arg="${esc(u.id)}"><b>${esc(u.name)}</b> · ${u.damageType === 'magical' ? '마딜' : '물딜'}${skill ? `<span>${esc(skill)}</span>` : ''}</button>`;
  }).join('');
}

/** The R window: what is given, the 지게 held, the filters and every same-grade normal unit. */
export function jigeListHtml(data: GameData, list: JigeList, held: number): string {
  const def = data.units.find(u => u.id === list.defId);
  const where = list.source.zone === 'board' ? `진영 ${list.source.index + 1}번 칸` : '보관함';
  const cost = list.cost === null ? '' : ` · 원가 ${list.cost}`;
  const chip = (arg: string, label: string, on: boolean) =>
    `<button data-action="jigeType" data-arg="${arg}" aria-pressed="${on}"${on ? ' class="on"' : ''}>${label}</button>`;
  return `<div class="modal jige-modal"><div class="modal-head">지게 바꾸기 · 보유 지게 ${held}개 <button data-action="closeModal">Esc 닫기</button></div>
    <div class="jige-from">${esc(def?.name ?? '')} (${def?.grade ?? 0}등급) · ${where}${cost} → 같은 등급 일반 유닛</div>
    <div class="jige-filters"><label class="jige-search"><input type="search" placeholder="이름" value="${esc(list.name)}" aria-label="이름으로 찾기"></label>
      ${chip('all', '전체', list.type === null)}${chip('physical', '물딜', list.type === 'physical')}${chip('magical', '마딜', list.type === 'magical')}</div>
    <div class="jige-rows">${jigeRowsHtml(data, list)}</div></div>`;
}

// ---------- taming ----------

/**
 * The T button under a target's health bar. Ready: price and odds at the current HP. Not ready: what is missing, in
 * the order the server checks it (extra condition, wait after a failure, a free cell, then every short currency).
 */
const TAME_READY = 'T 우리 편으로';

export interface TameModel { enemyId: number; hp: string; label: string; ready: boolean }

export function tameModel(econ: EconMine, state: GameState): TameModel | null {
  const list = econ.tame.filter(t => t.why !== 'noTarget');
  const t = list.find(x => x.why === null) ?? list[0];
  if (!t) return null;
  const enemy = state.enemies.find(e => e.id === t.enemyId);
  if (!enemy || enemy.hp <= 0) return null;
  const data = state.data;
  const hp = `체력 ${Math.max(1, Math.ceil((enemy.hp / enemy.maxHp) * 100))}%`;
  const c = t.cost;
  if (t.why === null) {
    const price = [c.buckwheat ? `묵 ${c.buckwheat}` : '', c.coins ? `${c.coins}냥` : '', c.tokens ? `불 ${c.tokens}` : ''].filter(Boolean);
    return { enemyId: t.enemyId, hp, ready: true, label: [TAME_READY, ...price, `성공 ${pct(t.chance)}`].join(' · ') };
  }
  let label: string;
  if (t.why === 'tameCondition') {
    label = t.needs === 'slowed' ? '둔화 필요' : t.needs ? `${nameOf(data, t.needs.vulnSource)} 약화 ${t.needs.stacks}중첩 필요` : '조건 필요';
  } else if (t.why === 'cooldown') {
    label = `다시 시도 ${secondsOf(data, t.readyTick - state.tick)}초`;
  } else if (t.why === 'noSlot') {
    label = '진영 한 칸 비우기';
  } else {
    const short = [
      (c.buckwheat ?? 0) > state.buckwheat ? `묵 ${(c.buckwheat ?? 0) - state.buckwheat}개 부족` : '',
      (c.coins ?? 0) > state.coins ? `${(c.coins ?? 0) - state.coins}냥 부족` : '',
      (c.tokens ?? 0) > state.tokens ? `불 ${(c.tokens ?? 0) - state.tokens}개 부족` : '',
    ].filter(Boolean);
    label = short.join(' · ') || '길들일 수 없음';
  }
  return { enemyId: t.enemyId, hp, ready: false, label };
}

/** The message for a refused tame: the condition that fell away is named (초안 4장 "둔화가 풀렸습니다"). */
export function tameRejectText(econ: EconMine | null, enemyId: number, reason: string, data: GameData): string | null {
  if (reason !== 'tameCondition') return null;
  const needs = econ?.tame.find(t => t.enemyId === enemyId)?.needs;
  if (needs === 'slowed') return '둔화가 풀렸습니다';
  if (needs) return `${nameOf(data, needs.vulnSource)} 약화가 ${needs.stacks}중첩이 아닙니다`;
  return '길들이기 조건이 풀렸습니다';
}

// ---------- quest tracker ----------

// ---------- quests (J) ----------

export type QuestGroup = '진행 중' | '곧 열림' | '끝남';
/** One line of the J list: group by what is left for this seat, then what happened and what it paid. */
export interface QuestRow { id: QuestId; group: QuestGroup; title: string; when: string; progress: string; short: string; outcome: string; reward: string }

const QUEST_ORDER: QuestId[] = ['collection', 'team', 'ssireum', 'shadow'];
const QUEST_TITLE: Record<QuestId, string> = { collection: '살림 한 벌', team: '서낭당 정성', ssireum: '도깨비 씨름', shadow: '그늘손 (돌발)' };
const QUEST_SHORT: Record<QuestId, string> = { collection: '살림', team: '서낭당', ssireum: '씨름', shadow: '그늘손' };
const COOP_ONLY: ReadonlySet<QuestId> = new Set(['team', 'ssireum']);

function questWindow(state: GameState, id: QuestId): [number, number] | null {
  const e = state.data.economy;
  const r = id === 'ssireum' ? e?.ssireum?.round : id === 'shadow' ? e?.shadow?.round : undefined;
  if (r !== undefined) return [r, r];
  const span = id === 'collection' ? e?.collection : id === 'team' ? e?.team : undefined;
  return span ? [span.fromRound, span.toRound] : null;
}

function outcomeText(id: QuestId, rec: QuestRecord, data: GameData): string {
  switch (rec.outcome) {
    case 'won': return '성공';
    case 'missedEntry': return '미입장';
    case 'timedOut': return '시간 종료';
    case 'otherSeat': return `${rec.progress.winnerSeat ?? '?'}번 고개 당첨`;
    case 'fled': return '도주';
    case 'capped': return '지급 한도';
    case 'eliminated': return '고개 뚫림';
    case 'tamed': return `${nameOf(data, rec.progress.tamedDefId ?? '')} 획득`;
    case 'active': return '';
  }
}

function rewardText(id: QuestId, rec: QuestRecord | undefined): string {
  if (!rec || rec.outcome === 'active') return '';
  const r = rec.reward;
  const parts = [r.coins ? `+${r.coins}냥` : '', r.buckwheat ? `묵 ${r.buckwheat}` : '', r.tokens ? `불 ${r.tokens}` : ''].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return id === 'shadow' && rec.outcome === 'tamed' ? '처치 보상 0냥' : '보상 없음';
}

/** Every quest of the 60-round rules for this seat, in catalogue order. */
export function questRows(econ: EconMine, state: GameState, online: boolean): QuestRow[] {
  const data = state.data;
  const eco = data.economy;
  if (!eco) return [];
  const rows: QuestRow[] = [];
  const round = state.phase === 'prep' ? 0 : state.round;
  for (const id of QUEST_ORDER) {
    const span = questWindow(state, id);
    if (!span) continue;
    const [from, to] = span;
    const when = from === to ? `${from}라운드` : `${from}~${to}라운드`;
    const rec = econ.questResults[id];
    // solo cannot take part in the cooperative quests, so the list leaves them out
    if (COOP_ONLY.has(id) && !online) continue;
    const base = { id, title: QUEST_TITLE[id], when, reward: rewardText(id, rec) };
    const live = liveProgress(id, econ, state);
    if (rec && rec.outcome !== 'active') {
      rows.push({ ...base, group: '끝남', progress: settledProgress(id, rec, data), short: '', outcome: outcomeText(id, rec, data) });
    } else if (round < from) {
      rows.push({ ...base, group: '곧 열림', progress: plan(id, state), short: '', outcome: '' });
    } else if (round > to) {
      const missed = id === 'ssireum' ? '참여 못 함' : id === 'shadow' ? '도주' : '시간 종료';
      rows.push({ ...base, group: '끝남', progress: live.text, short: '', outcome: missed, reward: '보상 없음' });
    } else {
      rows.push({ ...base, group: '진행 중', progress: live.text, short: live.short, outcome: rec ? outcomeText(id, rec, data) : '' });
    }
  }
  return rows;
}

function plan(id: QuestId, state: GameState): string {
  const e = state.data.economy!;
  switch (id) {
    case 'collection': return `${e.collection!.items.map(i => nameOf(state.data, i)).join('·')}를 직접 조합`;
    case 'team': return `세 밤 연속 남은 잡귀 생존 고개 × ${e.team!.perSurvivor} 이하`;
    case 'ssireum': return `접속 중인 고개 한 곳 추첨 · ${e.ssireum!.seconds}초 안에 격파`;
    case 'shadow': return `${e.shadow!.growSeconds}초 뒤 커지고 라운드 끝에 도주`;
  }
}

function liveProgress(id: QuestId, econ: EconMine, state: GameState): { text: string; short: string } {
  const e = state.data.economy!;
  const data = state.data;
  switch (id) {
    case 'collection': {
      const done = econ.collection?.done ?? [];
      const items = e.collection!.items;
      return {
        text: items.map(i => `${nameOf(data, i)} ${done.includes(i) ? '✓' : '□'}`).join(' '),
        short: `${items.filter(i => done.includes(i)).length}/${items.length}`,
      };
    }
    case 'team': {
      const p = econ.questResults.team?.progress;
      const streak = econ.team?.streak ?? p?.streak ?? 0;
      const last = p?.remaining !== undefined ? ` · 지난 밤 ${p.remaining}/${(p.survivors ?? 0) * e.team!.perSurvivor}` : '';
      return { text: `${streak}/${e.team!.nights}밤${last}`, short: `${streak}/${e.team!.nights}` };
    }
    case 'ssireum': {
      const rec = econ.events.find(r => r.kind === 'ssireum');
      const left = rec ? secondsOf(data, rec.spawnTick + toTicks(e.ssireum!.seconds) - state.tick) : null;
      return left === null ? { text: '추첨 결과를 기다리는 중', short: '' } : { text: `샅바가 풀리기까지 ${left}초`, short: `${left}초` };
    }
    case 'shadow': {
      const rec = econ.events.find(r => r.kind === 'shadow');
      if (!rec) return { text: '', short: '' };
      const left = secondsOf(data, rec.spawnTick + toTicks(e.shadow!.growSeconds) - state.tick);
      return rec.grown ? { text: '커졌음 · 라운드 끝에 도주', short: '커짐' } : { text: `${left}초 뒤 커짐`, short: `${left}초` };
    }
  }
}

function settledProgress(id: QuestId, rec: QuestRecord, data: GameData): string {
  const p = rec.progress;
  const e = data.economy!;
  switch (id) {
    case 'collection': return e.collection!.items.map(i => `${nameOf(data, i)} ${(p.done ?? []).includes(i) ? '✓' : '□'}`).join(' ');
    case 'team': return p.remaining === undefined ? '' : `마지막 밤 잡귀 ${p.remaining}/${(p.survivors ?? 0) * e.team!.perSurvivor} · ${p.streak ?? 0}/${e.team!.nights}밤`;
    case 'ssireum': return p.winnerSeat === undefined ? '' : `${p.winnerSeat}번 고개 당첨`;
    case 'shadow': return p.grown ? '커진 뒤' : '';
  }
}

// ---------- 격파 (repeatable summons) ----------

/**
 * One 격파 target for this seat as the quest box and the J list show it: the next level and its pay, and the summon
 * button, disabled with the reason the server would give (opening round, a target already out, the cooldown, coins).
 * `short` is the button text in the narrow box, `label` the full one in the J list.
 */
export interface HuntRow {
  enemy: string; name: string; level: number; best: number; reward: string; muk: string; hp: string; open: boolean; seconds: number;
  out: boolean; ready: boolean; poor: boolean; short: string; label: string; wait: string;
}

const won = (n: number) => n.toLocaleString('ko-KR');
const huntFailure = (seconds: number) => `제한 ${seconds}초. 놓치면 소환비만 잃고 단계는 그대로.`;
/** The wait after a hunt ends, caught or not (whole minutes read as 분). */
const huntWait = (seconds: number) => `재소환 대기 ${seconds % 60 ? `${seconds}초` : `${seconds / 60}분`}`;

export function huntRows(econ: EconMine, state: GameState): HuntRow[] {
  const data = state.data;
  const rules = data.economy?.hunts;
  if (!rules) return [];
  return (econ.hunts ?? []).map((h: EconHuntView) => {
    const reward = [h.reward.buckwheat ? `묵 ${h.reward.buckwheat}` : '', h.reward.coins ? `${h.reward.coins}냥` : ''].filter(Boolean).join(' · ');
    const fee = h.fee ? ` · ${h.fee}냥` : '';
    let short: string;
    let label: string;
    switch (h.why) {
      case null: short = '소환'; label = `소환${fee}`; break;
      case 'huntClosed': short = `${h.fromRound}R`; label = `${h.fromRound}라운드부터`; break;
      case 'huntOut': {
        const left = secondsOf(data, h.deadlineTick - state.tick);
        short = `${left}초`; label = `이미 나와 있음 · ${left}초 남음`; break;
      }
      case 'cooldown': {
        const left = secondsOf(data, h.readyTick - state.tick);
        const wait = left < 60 ? `${left}초` : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        short = `${wait} 뒤`; label = `${short} 다시 소환`; break;
      }
      // the narrow box shows the price in red; the J list and the tooltip say how much is missing
      case 'noCoins': short = `${h.fee}냥`; label = `엽전 ${h.fee - state.coins}냥 부족`; break;
      default: short = '소환 불가'; label = '소환할 수 없음';
    }
    return {
      enemy: h.enemy, name: nameOf(data, h.enemy), level: h.level, best: h.best, reward, muk: h.reward.buckwheat ? `묵${h.reward.buckwheat}` : '', hp: `체력 ${won(h.hp)}`,
      seconds: rules.seconds, wait: huntWait(rules.targets.find(t => t.enemy === h.enemy)?.cooldownSeconds ?? rules.cooldownSeconds),
      open: state.phase === 'round' && state.round >= h.fromRound, out: h.why === 'huntOut', ready: h.why === null, poor: h.why === 'noCoins', short, label,
    };
  });
}

const huntButton = (r: HuntRow, text: string) =>
  `<button class="hunt-go${r.poor ? ' poor' : ''}" data-action="hunt" data-arg="${esc(r.enemy)}"${r.ready ? '' : ' disabled'} title="${esc(`${r.label} · 보상 ${r.reward} · ${huntFailure(r.seconds)} ${r.wait}`)}">${esc(text)}</button>`;

export interface QuestBoxModel {
  active: { id: QuestId; title: string; short: string }[]; next: string | null; count: number;
  /** Open 격파 targets, each with its summon button. */
  hunts: HuntRow[];
}

/** The compact box: open 격파 targets, each running quest with its count, then the next one this seat can still take part in. */
export function questBoxModel(econ: EconMine, state: GameState, online: boolean): QuestBoxModel {
  const rows = questRows(econ, state, online);
  const active = rows.filter(r => r.group === '진행 중').map(r => ({ id: r.id, title: r.title, short: r.short }));
  const allHunts = huntRows(econ, state);
  const hunts = allHunts.filter(h => h.open);
  const round = state.phase === 'prep' ? 0 : state.round;
  const soon = [
    ...rows.filter(r => r.group === '곧 열림').map(r => ({ from: questWindow(state, r.id)![0], name: QUEST_SHORT[r.id] })),
    ...(econ.hunts ?? []).filter(h => round < h.fromRound).map(h => ({ from: h.fromRound, name: `${nameOf(state.data, h.enemy)} 격파` })),
  ].sort((a, b) => a.from - b.from)[0];
  return { active, next: soon ? `다음 ${soon.from}라운드 ${soon.name}` : null, count: active.length + hunts.filter(h => h.out).length, hunts };
}

function huntBoxLines(hunts: HuntRow[]): string {
  if (!hunts.length) return '';
  return `<div class="hunt-failure">${huntFailure(hunts[0]!.seconds)}</div>${hunts.map(h => `<div class="hunt-line"><span class="hunt-name">${esc(h.name)}</span><i class="hunt-lv" title="${h.level}단계">${h.level}</i><b>${esc(h.muk)}</b>${huntButton(h, h.short)}</div><div class="hunt-wait">${h.wait}</div>`).join('')}`;
}

export function questBoxHtml(box: QuestBoxModel, folded: boolean): string {
  if (folded) return `<div class="quest-box folded"><button data-action="openQuests" data-arg="">J 퀘스트 · 진행 ${box.count}개</button>${huntBoxLines(box.hunts)}</div>`;
  const lines = box.active.map(a => `<button class="quest-line" data-action="openQuests" data-arg="${a.id}"><span>${esc(a.title)}</span><b>${esc(a.short)}</b></button>`).join('');
  const hunts = huntBoxLines(box.hunts);
  return `<div class="quest-box"><button class="panel-title" data-action="openQuests" data-arg="">퀘스트 (J)</button>${hunts}${lines}
    ${box.next ? `<div class="quest-next">${esc(box.next)}</div>` : ''}${!lines && !hunts && !box.next ? '<div class="quest-next">남은 퀘스트 없음</div>' : ''}</div>`;
}

/** The J window: fixed title and close, the 격파 targets, then the three groups in a scrolled body. */
export function questListHtml(rows: QuestRow[], focus: QuestId | 'hunts' | null, hunts: HuntRow[] = []): string {
  const groups: QuestGroup[] = ['진행 중', '곧 열림', '끝남'];
  const huntSection = hunts.length ? `<section class="quest-group"><h3>격파</h3><div class="quest-row${focus === 'hunts' ? ' focus' : ''}" data-quest="hunts" tabindex="-1">
    <div class="quest-row-line">${huntFailure(hunts[0]!.seconds)} 시간 안에 잡으면 보상을 받고 다음 단계가 열립니다.</div>
    ${hunts.map(h => `<div class="hunt-row"><div class="hunt-row-text"><b>${esc(h.name)} ${h.level}단계</b><span>${esc(h.hp)} · ${esc(h.reward)}</span>
      <span>${h.best ? `최고 ${h.best}단계 격파` : '아직 격파 없음'} · ${h.wait}</span></div>${huntButton(h, h.label)}</div>`).join('')}</div></section>` : '';
  const body = groups.map(g => {
    const list = rows.filter(r => r.group === g);
    if (!list.length) return '';
    return `<section class="quest-group"><h3>${g}</h3>${list.map(r => `<div class="quest-row${r.id === focus ? ' focus' : ''}" data-quest="${r.id}" tabindex="-1">
      <div class="quest-row-head"><b>${esc(r.title)}</b><span>${esc(r.when)}</span>${r.outcome ? `<em>${esc(r.outcome)}</em>` : ''}</div>
      ${r.progress ? `<div class="quest-row-line">${esc(r.progress)}</div>` : ''}${r.reward ? `<div class="quest-row-reward">${esc(r.reward)}</div>` : ''}</div>`).join('')}</section>`;
  }).join('');
  return `<div class="modal quest-modal"><div class="modal-head">퀘스트 <button data-action="closeModal">J·Esc 닫기</button></div>
    <div class="quest-scroll">${huntSection}${body || (huntSection ? '' : '<p class="quest-empty">퀘스트가 없습니다</p>')}</div></div>`;
}

export interface Chip { title: string; text: string; tone?: 'hot' | 'done'; quest?: QuestId | 'hunts'; action?: { name: string; arg: string; label: string; disabled?: boolean } }

/** Compact lines for the tracker under the lane: general quests, event enemies with time left, the open story request. */
export function questChips(econ: EconMine, state: GameState, view: ClientView | null): Chip[] {
  const data = state.data;
  const eco = data.economy;
  if (!eco) return [];
  const out: Chip[] = [];
  const round = state.round;
  const inRound = state.phase === 'round';
  const enemy = (id: number | null) => (id === null ? undefined : state.enemies.find(e => e.id === id && e.hp > 0));
  const hpText = (id: number) => {
    const e = enemy(id);
    return e ? ` · 체력 ${Math.max(1, Math.ceil((e.hp / e.maxHp) * 100))}%` : '';
  };

  for (const h of econ.hunts ?? []) {
    if (h.enemyId === null || !enemy(h.enemyId)) continue;
    out.push({
      title: `${nameOf(data, h.enemy)} ${h.level}단계`, quest: 'hunts',
      text: `${secondsOf(data, h.deadlineTick - state.tick)}초 남음${hpText(h.enemyId)}`, tone: 'hot',
    });
  }

  const c = eco.collection;
  if (c && econ.collection && !econ.collection.paid && round >= c.fromRound && round <= c.toRound) {
    out.push({ title: '살림 한 벌', quest: 'collection', text: c.items.map(id => `${nameOf(data, id)} ${econ.collection!.done.includes(id) ? '✓' : '□'}`).join(' ') });
  }

  const team = eco.team;
  if (team && econ.team && view && !econ.team.paid && round >= team.fromRound && round <= team.toRound) {
    const alive = view.rows.filter(r => r.status === 'alive');
    const sum = alive.reduce((a, r) => a + r.count, 0);
    out.push({ title: '서낭당 정성', quest: 'team', text: `살아 있는 고개 잡귀 ${sum}/${alive.length * team.perSurvivor} · ${econ.team.streak}/${team.nights}밤` });
  }

  for (const rec of econ.events) {
    if (!enemy(rec.id)) continue;
    if (rec.kind === 'ssireum' && eco.ssireum) {
      const left = rec.spawnTick + toTicks(eco.ssireum.seconds) - state.tick;
      out.push({ title: '도깨비 씨름', quest: 'ssireum', text: `샅바가 풀리기까지 ${secondsOf(data, left)}초${hpText(rec.id)}`, tone: 'hot' });
    } else if (rec.kind === 'shadow' && eco.shadow) {
      const text = rec.grown
        ? `커졌음 · 라운드 끝에 도주${hpText(rec.id)}`
        : `${secondsOf(data, rec.spawnTick + toTicks(eco.shadow.growSeconds) - state.tick)}초 뒤 커짐${hpText(rec.id)}`;
      out.push({ title: '그늘손', quest: 'shadow', text, tone: 'hot' });
    }
  }

  return out;
}

export function noteText(ev: EconNote, data: GameData): string | null {
  switch (ev.type) {
    case 'gambleCoins': case 'gambleUnit': return null;
    case 'questReward': {
      const gain = [ev.coins ? `+${ev.coins}냥` : '', ev.buckwheat ? `묵 +${ev.buckwheat}` : '', ev.tokens ? `불 +${ev.tokens}` : ''].filter(Boolean).join(' · ');
      const title = { collection: '살림 한 벌 완성', team: '서낭당 정성', ssireum: '씨름 승리' }[ev.quest];
      return gain ? `${title} · ${gain}` : title;
    }
    case 'jigeSwap': return `지게로 ${withJosa(nameOf(data, ev.defId), '을/를')} 받았습니다`;
    case 'tameTry':
      if (ev.success) return null;
      return `길들이기 실패 · ${[ev.buckwheat ? `묵 ${ev.buckwheat}` : '', ev.coins ? `${ev.coins}냥` : '', ev.tokens ? `불 ${ev.tokens}` : ''].filter(Boolean).join(' · ')}을 잃었습니다`;
    case 'tame': return `길들이기 성공 · ${withJosa(nameOf(data, ev.defId), '이/가')} 우리 편이 됐습니다`;
    case 'itemBought': return `${withJosa(itemName(data, ev.item), '을/를')} 샀습니다`;
    case 'itemAttached': {
      const put = `${nameOf(data, ev.defId)}에 ${withJosa(itemName(data, ev.item), '을/를')} 붙였습니다`;
      return ev.replaced ? `${put} · ${withJosa(itemName(data, ev.replaced), '은/는')} 사라졌습니다` : put;
    }
    case 'hunt': {
      const name = `${nameOf(data, ev.enemy)} ${ev.level}단계`;
      if (ev.outcome === 'fled') return `${name}가 달아났습니다`;
      return `${name} 격파 · ${[ev.buckwheat ? `묵 +${ev.buckwheat}` : '', ev.coins ? `+${ev.coins}냥` : ''].filter(Boolean).join(' · ')}`;
    }
  }
}

// ---------- html ----------

const button = (action: string, arg: string, label: string, disabled = false, cls = '') =>
  `<button data-action="${action}" data-arg="${esc(arg)}"${cls ? ` class="${cls}"` : ''}${disabled ? ' disabled' : ''}>${esc(label)}</button>`;

/** The B drawer leaves the board and both unit-card positions visible. */
export function econPanelHtml(market: MarketModel | null, reveal: RevealDisplay | null = null, readOnly = false, tab: MarketTab = 'market'): string {
  const items = tab === 'items' && !!market?.shop;
  const head = `<div class="econ-head"><b>장터</b><span class="gamble-wallet"></span>
    ${market?.gamble && !items ? '<span class="gamble-refill" aria-label="매 라운드 횟수가 다시 차요">라운드마다 충전</span>' : ''}
    <button type="button" data-action="toggleMarket" data-market-focus="close" class="econ-close" aria-label="장터 닫기 (B)">닫기 B</button></div>`;
  const tabButton = (id: MarketTab, label: string) => {
    const on = (id === 'items') === items;
    return `<button type="button" data-action="econTab" data-arg="${id}" data-market-focus="tab-${id}" aria-pressed="${on}"${on ? ' class="on"' : ''}>${label}</button>`;
  };
  const tabs = market?.shop ? `<div class="econ-tabs">${tabButton('market', '뽑기')}${tabButton('items', '아이템')}</div>` : '';
  const body = items ? shopHtml(market!.shop!, readOnly) : market?.gamble ? `<div class="gamble-products">${gambleHtml(market.gamble, reveal, readOnly)}</div>
    <div class="gamble-info" id="gamble-info" aria-live="polite"></div>
    <div class="gamble-result"></div><section class="gamble-history" aria-label="최근 장터 결과"></section>`
    : market ? `<div>보유 지게 ${market.jige.held}개</div>` : '';
  return `<section class="econ-panel" aria-label="장터">${head}${tabs}<div class="econ-body">${body}</div></section>`;
}

/** The T button under the target's health bar (placed by mount from the scene's bar anchor). */
export function tameButtonHtml(tame: TameModel | null, armed = false): string {
  if (!tame) return '';
  const label = armed && tame.ready ? tame.label.replace(TAME_READY, 'T 한 번 더') : tame.label;
  return `<span class="tame-hp">${esc(tame.hp)}</span>${button('tame', String(tame.enemyId), label, !tame.ready)}`;
}

export function econBottomHtml(chips: Chip[]): string {
  return chips.map(c => `<div class="q${c.tone ? ` ${c.tone}` : ''}">${c.quest ? `<button class="q-title" data-action="openQuests" data-arg="${c.quest}">${esc(c.title)}</button>` : `<b>${esc(c.title)}</b>`}<span>${esc(c.text)}</span>${c.action ? button(c.action.name, c.action.arg, c.action.label, c.action.disabled) : ''}</div>`).join('');
}
