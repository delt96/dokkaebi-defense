import {
  jigeCandidates, toTicks, type ClientView, type DamageType, type JigeSource, type QuestId, type QuestRecord, type UnitDef, type EconMine, type EconNote, type GameData, type GameState, type RejectReason,
} from '@dorandi/logic';
import { esc } from './dom';
import { unitSkillText } from './models';
import { withJosa } from './josa';

// Stage 3 economy on screen: the market panel (B), the T button under a target's health bar and the
// quest tracker under it. Prices, odds and limits always come from the data and the server's economy view.

const pct = (x: number) => `${Math.round(x * 100)}%`;
/** Keeps a name and its mark (or a label and its number) on one line in the narrow panel. */
const NBSP = ' ';
const nameOf = (data: GameData, id: string): string => data.units.find(u => u.id === id)?.name ?? data.enemies.find(e => e.id === id)?.name ?? id;
const gradeOf = (data: GameData, id: string): number => data.units.find(u => u.id === id)?.grade ?? 0;
const secondsOf = (data: GameData, ticks: number): number => Math.max(0, Math.ceil((ticks * data.balance.tickMs) / 1000));
const freeSlots = (state: GameState): number[] => state.slots.flatMap((u, i) => (!u && state.open[i] ? [i] : []));

// ---------- market ----------

/** Short reason on a disabled draw button, said before any 묵 is paid. */
const BUY_BLOCK: Partial<Record<RejectReason, string>> = {
  noSlot: '진영 한 칸 비우기', soldOut: '이번 장날 3회를 다 씀', marketClosed: '1라운드부터',
};

export type DrawReceipt = Extract<EconNote, { type: 'buy' }>;
export interface MarketModel {
  until: string; title: string; odds: string; left: string; jigeLine: string; held: string;
  blocked: string | null; hint: string | null; receipt: string[] | null;
}

const typeText = (data: GameData, id: string) => (data.units.find(u => u.id === id)?.damageType === 'magical' ? '마딜' : '물딜');

/** The day's unit draw: terms from the server view, the live reason it is blocked, and the last confirmed draw. */
export function marketModel(econ: EconMine, state: GameState, receipt: DrawReceipt | null = null): MarketModel | null {
  const m = econ.market;
  const def = state.data.economy?.market;
  if (!m || !def) return null;
  const data = state.data;
  const total = m.draw.weights.reduce((sum, w) => sum + w, 0);
  const odds = m.draw.weights.map((w, i) => `${3 - i}등급 ${w}/${total}`).join(' · ');
  const why = m.why.draw;
  const blocked = why === 'noBuckwheat' ? `메밀묵 ${m.draw.buckwheatCost - state.buckwheat}개 부족` : why ? BUY_BLOCK[why] ?? '뽑을 수 없음' : null;
  const unit = receipt ? data.units.find(u => u.id === receipt.defId) : undefined;
  return {
    until: m.day > 0 ? `${m.endRound}라운드까지` : '장날은 1라운드부터',
    title: `헌 살림 보따리 · 메밀묵 ${m.draw.buckwheatCost}`,
    odds, left: `${m.draw.left}회 남음`,
    jigeLine: `유닛을 뽑으면 ${pct(m.jigeChance)} 확률로 지게도 얻습니다.`,
    held: `보유 지게 ${econ.jige}개`,
    blocked,
    hint: why === 'noSlot' ? '1·2등급은 G로 보관해 자리를 비울 수 있습니다' : null,
    receipt: unit && receipt ? [
      `${unit.name} · ${unit.grade}등급 · ${typeText(data, unit.id)}`,
      ...(unitSkillText(data, unit) ? [unitSkillText(data, unit).split(' / ')[0]!] : []),
      ...(receipt.jige ? ['지게도 얻었습니다'] : []),
    ] : null,
  };
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
    return { enemyId: t.enemyId, hp, ready: true, label: ['T 우리 편으로', ...price, `성공 ${pct(t.chance)}`].join(' · ') };
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

const QUEST_ORDER: QuestId[] = ['mission', 'collection', 'team', 'ssireum', 'shadow'];
const QUEST_TITLE: Record<QuestId, string> = { mission: '쇠밥 한 끼', collection: '살림 한 벌', team: '서낭당 정성', ssireum: '도깨비 씨름', shadow: '그늘손 (돌발)' };
const QUEST_SHORT: Record<QuestId, string> = { mission: '쇠밥', collection: '살림', team: '서낭당', ssireum: '씨름', shadow: '그늘손' };
const COOP_ONLY: ReadonlySet<QuestId> = new Set(['team', 'ssireum']);

function questWindow(state: GameState, id: QuestId): [number, number] | null {
  const e = state.data.economy;
  const r = id === 'mission' ? e?.mission?.round : id === 'ssireum' ? e?.ssireum?.round : id === 'shadow' ? e?.shadow?.round : undefined;
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
    case 'active': return id === 'mission' ? '입장함' : '';
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
    const coopOnly = COOP_ONLY.has(id) && !online;
    const base = { id, title: QUEST_TITLE[id], when, reward: rewardText(id, rec) };
    const live = liveProgress(id, econ, state);
    if (rec && rec.outcome !== 'active') {
      rows.push({ ...base, group: '끝남', progress: settledProgress(id, rec, data), short: '', outcome: outcomeText(id, rec, data) });
    } else if (round < from) {
      rows.push({ ...base, group: '곧 열림', progress: plan(id, state), short: '', outcome: coopOnly ? '협동 전용' : '' });
    } else if (coopOnly) {
      rows.push({ ...base, group: '끝남', progress: plan(id, state), short: '', outcome: '협동 전용' });
    } else if (round > to) {
      const missed = id === 'mission' ? '미입장' : id === 'ssireum' ? '참여 못 함' : id === 'shadow' ? '도주' : '시간 종료';
      rows.push({ ...base, group: '끝남', progress: live.text, short: '', outcome: missed, reward: '보상 없음' });
    } else if (id === 'mission' && econ.mission?.phase === 'idle' && state.tick >= state.roundStartTick + toTicks(eco.mission!.entrySeconds)) {
      rows.push({ ...base, group: '끝남', progress: plan(id, state), short: '', outcome: '미입장', reward: '보상 없음' });
    } else {
      rows.push({ ...base, group: '진행 중', progress: live.text, short: live.short, outcome: rec ? outcomeText(id, rec, data) : '' });
    }
  }
  return rows;
}

function plan(id: QuestId, state: GameState): string {
  const e = state.data.economy!;
  switch (id) {
    case 'mission': return `첫 ${e.mission!.entrySeconds}초 안에 ${e.mission!.fee}냥으로 입장 · 잡귀 ${e.mission!.kills}마리와 짐승 격파`;
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
    case 'mission': {
      const m = e.mission!;
      if (econ.mission?.phase !== 'active') {
        const left = secondsOf(data, state.roundStartTick + toTicks(m.entrySeconds) - state.tick);
        return { text: `입장 ${m.fee}냥 · ${left}초 안에`, short: `입장 ${left}초` };
      }
      const kills = Math.min(econ.roundKills, m.kills);
      return { text: `잡귀 ${kills}/${m.kills} · 짐승 ${econ.mission.beastDown ? '격파' : '남음'}`, short: `${kills}/${m.kills}` };
    }
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
    case 'mission': return p.kills === undefined ? '' : `잡귀 ${p.kills}/${e.mission!.kills} · 짐승 ${p.beastDown ? '격파' : '남음'}`;
    case 'collection': return e.collection!.items.map(i => `${nameOf(data, i)} ${(p.done ?? []).includes(i) ? '✓' : '□'}`).join(' ');
    case 'team': return p.remaining === undefined ? '' : `마지막 밤 잡귀 ${p.remaining}/${(p.survivors ?? 0) * e.team!.perSurvivor} · ${p.streak ?? 0}/${e.team!.nights}밤`;
    case 'ssireum': return p.winnerSeat === undefined ? '' : `${p.winnerSeat}번 고개 당첨`;
    case 'shadow': return p.grown ? '커진 뒤' : '';
  }
}

export interface QuestBoxModel { active: { id: QuestId; title: string; short: string }[]; next: string | null; count: number }

/** The compact box: each running quest with its count, then the next one this seat can still take part in. */
export function questBoxModel(econ: EconMine, state: GameState, online: boolean): QuestBoxModel {
  const rows = questRows(econ, state, online);
  const active = rows.filter(r => r.group === '진행 중').map(r => ({ id: r.id, title: r.title, short: r.short }));
  const next = rows
    .filter(r => r.group === '곧 열림' && r.outcome !== '협동 전용')
    .map(r => ({ r, from: questWindow(state, r.id)![0] }))
    .sort((a, b) => a.from - b.from)[0];
  return { active, next: next ? `다음 ${next.from}라운드 ${QUEST_SHORT[next.r.id]}` : null, count: active.length };
}

export function questBoxHtml(box: QuestBoxModel, folded: boolean): string {
  if (folded) return `<div class="quest-box folded"><button data-action="openQuests" data-arg="">J 퀘스트 · 진행 ${box.count}개</button></div>`;
  const lines = box.active.map(a => `<button class="quest-line" data-action="openQuests" data-arg="${a.id}"><span>${esc(a.title)}</span><b>${esc(a.short)}</b></button>`).join('');
  return `<div class="quest-box"><button class="panel-title" data-action="openQuests" data-arg="">퀘스트 (J)</button>${lines}
    ${box.next ? `<div class="quest-next">${esc(box.next)}</div>` : ''}${!lines && !box.next ? '<div class="quest-next">남은 퀘스트 없음</div>' : ''}</div>`;
}

/** The J window: fixed title and close, the three groups in a scrolled body. */
export function questListHtml(rows: QuestRow[], focus: QuestId | null): string {
  const groups: QuestGroup[] = ['진행 중', '곧 열림', '끝남'];
  const body = groups.map(g => {
    const list = rows.filter(r => r.group === g);
    if (!list.length) return '';
    return `<section class="quest-group"><h3>${g}</h3>${list.map(r => `<div class="quest-row${r.id === focus ? ' focus' : ''}" data-quest="${r.id}" tabindex="-1">
      <div class="quest-row-head"><b>${esc(r.title)}</b><span>${esc(r.when)}</span>${r.outcome ? `<em>${esc(r.outcome)}</em>` : ''}</div>
      ${r.progress ? `<div class="quest-row-line">${esc(r.progress)}</div>` : ''}${r.reward ? `<div class="quest-row-reward">${esc(r.reward)}</div>` : ''}</div>`).join('')}</section>`;
  }).join('');
  return `<div class="modal quest-modal"><div class="modal-head">퀘스트 <button data-action="closeModal">J·Esc 닫기</button></div>
    <div class="quest-scroll">${body || '<p class="quest-empty">퀘스트가 없습니다</p>'}</div></div>`;
}

export interface Chip { title: string; text: string; tone?: 'hot' | 'done'; quest?: QuestId; action?: { name: string; arg: string; label: string; disabled?: boolean } }

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

  const m = eco.mission;
  if (m && econ.mission && inRound && round === m.round) {
    const entryEnd = state.roundStartTick + toTicks(m.entrySeconds);
    const mission = econ.mission;
    if (mission.phase === 'idle' && state.tick < entryEnd) {
      out.push({
        title: '쇠밥 한 끼', quest: 'mission', text: `입장 ${m.fee}냥 · ${secondsOf(data, entryEnd - state.tick)}초 안에`, tone: 'hot',
        action: { name: 'missionEnter', arg: '', label: state.coins >= m.fee ? '입장' : '엽전 부족', disabled: state.coins < m.fee },
      });
    } else if (mission.phase === 'active') {
      const beast = mission.beastDown ? '짐승 ✓' : `짐승 남음${hpText(mission.beastId ?? -1)}`;
      out.push({ title: '쇠밥 한 끼', quest: 'mission', text: `잡귀 ${Math.min(econ.roundKills, m.kills)}/${m.kills} · ${beast}` });
    } else if (mission.phase === 'won') {
      out.push({ title: '쇠밥 한 끼', quest: 'mission', text: `성공 · +${m.reward.coins}냥 · 묵 ${m.reward.buckwheat}`, tone: 'done' });
    }
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
    case 'buy': {
      const jige = ev.jige ? ' · 지게 도깨비가 왔습니다!' : '';
      return `보따리에서 ${nameOf(data, ev.defId ?? '')} (${gradeOf(data, ev.defId ?? '')}등급)${jige}`;
    }
    case 'questReward': {
      const gain = [ev.coins ? `+${ev.coins}냥` : '', ev.buckwheat ? `묵 +${ev.buckwheat}` : '', ev.tokens ? `불 +${ev.tokens}` : ''].filter(Boolean).join(' · ');
      const title = { mission: '쇠밥 한 끼 성공', collection: '살림 한 벌 완성', team: '서낭당 정성', ssireum: '씨름 승리' }[ev.quest];
      return gain ? `${title} · ${gain}` : title;
    }
    case 'jigeSwap': return `지게로 ${withJosa(nameOf(data, ev.defId), '을/를')} 받았습니다`;
    case 'tameTry':
      if (ev.success) return null;
      return `길들이기 실패 · ${[ev.buckwheat ? `묵 ${ev.buckwheat}` : '', ev.coins ? `${ev.coins}냥` : '', ev.tokens ? `불 ${ev.tokens}` : ''].filter(Boolean).join(' · ')}을 잃었습니다`;
    case 'tame': return `길들이기 성공 · ${withJosa(nameOf(data, ev.defId), '이/가')} 우리 편이 됐습니다`;
  }
}

// ---------- html ----------

const button = (action: string, arg: string, label: string, disabled = false, cls = '') =>
  `<button data-action="${action}" data-arg="${esc(arg)}"${cls ? ` class="${cls}"` : ''}${disabled ? ' disabled' : ''}>${esc(label)}</button>`;

/** The B panel over the left column. */
export function econPanelHtml(market: MarketModel | null): string {
  const head = `<div class="econ-head"><b>장터 (B)</b>${button('toggleMarket', '', 'B 닫기', false, 'econ-close')}</div>`;
  if (!market) return `<div class="econ-panel">${head}<div class="econ-body"></div></div>`;
  const line = (t: string, cls = 'shop-line') => `<div class="${cls}">${esc(t)}</div>`;
  const receipt = market.receipt
    ? `<section class="shop receipt"><div class="shop-title"><b>방금 뽑은 유닛</b></div>${market.receipt.map(t => line(t)).join('')}</section>` : '';
  const body = `<div class="econ-sub">${esc(market.until)}</div>
    <section class="shop"><div class="shop-title"><b>${esc(market.title)}</b></div>
      ${line(market.odds)}${line(market.left)}
      ${button('buy', 'draw', market.blocked ?? '뽑기', market.blocked !== null)}${market.hint ? line(market.hint, 'shop-short') : ''}
      ${line(market.jigeLine)}${line(market.held, 'shop-line shop-held')}</section>${receipt}`;
  return `<div class="econ-panel">${head}<div class="econ-body">${body}</div></div>`;
}

/** The T button under the target's health bar (placed by mount from the scene's bar anchor). */
export function tameButtonHtml(tame: TameModel | null): string {
  if (!tame) return '';
  return `<span class="tame-hp">${esc(tame.hp)}</span>${button('tame', String(tame.enemyId), tame.label, !tame.ready)}`;
}

export function econBottomHtml(chips: Chip[]): string {
  return chips.map(c => `<div class="q${c.tone ? ` ${c.tone}` : ''}">${c.quest ? `<button class="q-title" data-action="openQuests" data-arg="${c.quest}">${esc(c.title)}</button>` : `<b>${esc(c.title)}</b>`}<span>${esc(c.text)}</span>${c.action ? button(c.action.name, c.action.arg, c.action.label, c.action.disabled) : ''}</div>`).join('');
}
