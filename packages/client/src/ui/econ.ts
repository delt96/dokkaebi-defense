import {
  jigeCandidates, toTicks, type ClientView, type DamageType, type JigeSource, type UnitDef, type EconMine, type EconNote, type GameData, type GameState, type RejectReason,
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

export interface Chip { title: string; text: string; tone?: 'hot' | 'done'; action?: { name: string; arg: string; label: string; disabled?: boolean } }

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
        title: '쇠밥 한 끼', text: `입장 ${m.fee}냥 · ${secondsOf(data, entryEnd - state.tick)}초 안에`, tone: 'hot',
        action: { name: 'missionEnter', arg: '', label: state.coins >= m.fee ? '입장' : '엽전 부족', disabled: state.coins < m.fee },
      });
    } else if (mission.phase === 'active') {
      const beast = mission.beastDown ? '짐승 ✓' : `짐승 남음${hpText(mission.beastId ?? -1)}`;
      out.push({ title: '쇠밥 한 끼', text: `잡귀 ${Math.min(econ.roundKills, m.kills)}/${m.kills} · ${beast}` });
    } else if (mission.phase === 'won') {
      out.push({ title: '쇠밥 한 끼', text: `성공 · +${m.reward.coins}냥 · 묵 ${m.reward.buckwheat}`, tone: 'done' });
    }
  }

  const c = eco.collection;
  if (c && econ.collection && !econ.collection.paid && round >= c.fromRound && round <= c.toRound) {
    out.push({ title: '살림 한 벌', text: c.items.map(id => `${nameOf(data, id)} ${econ.collection!.done.includes(id) ? '✓' : '□'}`).join(' ') });
  }

  const team = eco.team;
  if (team && econ.team && view && !econ.team.paid && round >= team.fromRound && round <= team.toRound) {
    const alive = view.rows.filter(r => r.status === 'alive');
    const sum = alive.reduce((a, r) => a + r.count, 0);
    out.push({ title: '서낭당 정성', text: `살아 있는 고개 잡귀 ${sum}/${alive.length * team.perSurvivor} · ${econ.team.streak}/${team.nights}밤` });
  }

  for (const rec of econ.events) {
    if (!enemy(rec.id)) continue;
    if (rec.kind === 'ssireum' && eco.ssireum) {
      const left = rec.spawnTick + toTicks(eco.ssireum.seconds) - state.tick;
      out.push({ title: '도깨비 씨름', text: `샅바가 풀리기까지 ${secondsOf(data, left)}초${hpText(rec.id)}`, tone: 'hot' });
    } else if (rec.kind === 'shadow' && eco.shadow) {
      const text = rec.grown
        ? `커졌음 · 라운드 끝에 도주${hpText(rec.id)}`
        : `${secondsOf(data, rec.spawnTick + toTicks(eco.shadow.growSeconds) - state.tick)}초 뒤 커짐${hpText(rec.id)}`;
      out.push({ title: '그늘손', text, tone: 'hot' });
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
  return chips.map(c => `<div class="q${c.tone ? ` ${c.tone}` : ''}"><b>${esc(c.title)}</b><span>${esc(c.text)}</span>${c.action ? button(c.action.name, c.action.arg, c.action.label, c.action.disabled) : ''}</div>`).join('');
}
