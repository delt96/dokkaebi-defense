import {
  toTicks, type ClientView, type EconMine, type EconNote, type GameData, type GameState, type RejectReason,
} from '@dorandi/logic';
import { esc } from './dom';
import { unitSkillText } from './models';
import { withJosa } from './josa';

// Stage 3 economy on screen: the market panel (B), the tame prompt over the top of the lane and the
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

// ---------- taming ----------

export interface TamePart { text: string; ok: boolean }
export interface TameModel { enemyId: number; title: string; parts: TamePart[]; ready: boolean; why: string | null }

const TAME_WHY: Partial<Record<RejectReason, string>> = {
  noSlot: '빈칸이 없습니다', noBuckwheat: '메밀묵이 모자랍니다', noCoins: '엽전이 모자랍니다', noToken: '도깨비불이 모자랍니다',
};

/** The first tame target at or below its tame HP, with every condition and cost ticked off. */
export function tameModel(econ: EconMine, state: GameState): TameModel | null {
  const list = econ.tame.filter(t => t.why !== 'tameHp' && t.why !== 'noTarget');
  const t = list.find(x => x.why === null) ?? list[0];
  if (!t) return null;
  const enemy = state.enemies.find(e => e.id === t.enemyId);
  if (!enemy || enemy.hp <= 0) return null;
  const data = state.data;
  const parts: TamePart[] = [{ text: `체력 ${Math.max(1, Math.floor((enemy.hp / enemy.maxHp) * 100))}% ✓`, ok: true }];
  const condOk = t.why !== 'tameCondition';
  if (t.needs === 'slowed') parts.push({ text: condOk ? '둔화 ✓' : '둔화 필요', ok: condOk });
  else if (t.needs) {
    const src = nameOf(data, t.needs.vulnSource);
    parts.push({ text: condOk ? `${src} 약화 ${t.needs.stacks}중첩 ✓` : `${src} 약화 ${t.needs.stacks}중첩 필요`, ok: condOk });
  }
  const c = t.cost;
  if (c.buckwheat) parts.push({ text: `묵 ${Math.min(state.buckwheat, c.buckwheat)}/${c.buckwheat}`, ok: state.buckwheat >= c.buckwheat });
  if (c.coins) parts.push({ text: `${c.coins}냥`, ok: state.coins >= c.coins });
  if (c.tokens) parts.push({ text: `불 ${Math.min(state.tokens, c.tokens)}/${c.tokens}`, ok: state.tokens >= c.tokens });
  const free = freeSlots(state).length;
  parts.push({ text: free ? `빈칸 ${free}` : '빈칸 없음', ok: free > 0 });
  return {
    enemyId: t.enemyId, title: `${nameOf(data, t.defId)} 길들이기`, parts, ready: t.why === null,
    why: t.why === null ? null : t.why === 'tameCondition' ? null : TAME_WHY[t.why] ?? null,
  };
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

/** The tame chance over the top of the lane. */
export function econTopHtml(tame: TameModel | null): string {
  if (!tame) return '';
  const ticks = tame.parts.map(p => `<span class="${p.ok ? 'ok' : 'no'}">${esc(p.text)}</span>`).join('');
  return `<div class="prompt tame"><div class="prompt-line"><b>${esc(tame.title)}</b>${ticks}${button('tame', String(tame.enemyId), 'T 길들이기', !tame.ready)}</div></div>`;
}

export function econBottomHtml(chips: Chip[]): string {
  return chips.map(c => `<div class="q${c.tone ? ` ${c.tone}` : ''}"><b>${esc(c.title)}</b><span>${esc(c.text)}</span>${c.action ? button(c.action.name, c.action.arg, c.action.label, c.action.disabled) : ''}</div>`).join('');
}
