import {
  toTicks, type ClientView, type EconMine, type EconNote, type GameData, type GameState, type RejectReason, type TransferEndView,
} from '@dorandi/logic';
import { esc } from './dom';
import { withJosa } from './josa';

// Stage 3 economy on screen: the market panel (B), the delivery and tame prompts over the top of the lane and the
// quest tracker under it. Prices, odds and limits always come from the data and the server's economy view.

const pct = (x: number) => `${Math.round(x * 100)}%`;
/** Keeps a name and its mark (or a label and its number) on one line in the narrow panel. */
const NBSP = ' ';
const nameOf = (data: GameData, id: string): string => data.units.find(u => u.id === id)?.name ?? data.enemies.find(e => e.id === id)?.name ?? id;
const gradeOf = (data: GameData, id: string): number => data.units.find(u => u.id === id)?.grade ?? 0;
const secondsOf = (data: GameData, ticks: number): number => Math.max(0, Math.ceil((ticks * data.balance.tickMs) / 1000));
const freeSlots = (state: GameState): number[] => state.slots.flatMap((u, i) => (!u && state.open[i] ? [i] : []));

// ---------- market ----------

/** Short reason on a disabled buy button, said before any coin is paid. */
const BUY_BLOCK: Partial<Record<RejectReason, string>> = {
  noCoins: '엽전 부족', noSlot: '빈칸 없음', soldOut: '이번 장날 다 삼', marketClosed: '1라운드부터',
};

export interface ShopModel { item: 'bundle' | 'jar'; name: string; price: number; left: string; lines: string[]; blocked: string | null; short: string | null }
export interface MarketModel { head: string; shops: ShopModel[] }

export function marketModel(econ: EconMine, state: GameState): MarketModel | null {
  const m = econ.market;
  const def = state.data.economy?.market;
  if (!m || !def) return null;
  const head = m.day > 0 ? `${m.day}장날 · ${m.day * def.dayRounds}라운드까지` : `장날은 1라운드부터`;
  const total = m.deck.reduce((a, d) => a + d.left, 0);
  const cards = m.deck.filter(d => d.left > 0);
  const odds = cards.length === 1 ? `다음은 ${cards[0]!.grade}등급 확정` : cards.map(d => `${d.grade}등급 ${d.left}/${total}`).join(' · ');
  const short = (n: number | undefined) => (n ? `조합비까지 ${n}냥 부족` : null);
  const jarPeriod = Math.max(1, Math.ceil(Math.max(1, state.round) / def.jar.periodRounds));
  const nextJar = `다음 단지 ${jarPeriod * def.jar.periodRounds + 1}라운드부터`;
  const jarLines = m.jar.left === 0
    ? [`단지는 ${def.jar.periodRounds}라운드마다 ${def.jar.perPeriod}번`]
    : m.jar.missed
      ? ['이번엔 묵 확정']
      : [`묵 ${pct(m.jar.chance)} · 재료 ${pct(1 - m.jar.chance)}`, '이번에 재료가 나오면 다음 묵 확정'];
  return {
    head,
    shops: [
      {
        item: 'bundle', name: '헌 살림 보따리', price: m.bundle.price, left: `남은 ${m.bundle.left}/${def.bundle.perDay}번`,
        lines: m.bundle.left === 0 ? [`다음 장날 ${Math.max(1, m.day) * def.dayRounds + 1}라운드부터`] : [odds],
        blocked: m.why.bundle ? BUY_BLOCK[m.why.bundle] ?? '살 수 없음' : null, short: short(m.shortAfter?.bundle),
      },
      {
        item: 'jar', name: '묵장수 단지', price: m.jar.price, left: `남은 ${m.jar.left}/${def.jar.perPeriod}번`,
        // the jar has its own period, so its sold-out text names the next jar rather than the next market day
        lines: jarLines, blocked: m.why.jar === 'soldOut' ? nextJar : m.why.jar ? BUY_BLOCK[m.why.jar] ?? '살 수 없음' : null,
        short: short(m.shortAfter?.jar),
      },
    ],
  };
}

// ---------- delivery (online) ----------

export interface ShipTarget { seat: number; label: string; disabled: boolean }
export interface ShipModel { lines: string[]; targets: ShipTarget[]; cancel: boolean; reward: string | null; unit: { slot: number; unitId: number } | null }

/** The delivery block under the market; null in solo. `selected` is the board slot picked on the lane. */
export function shipModel(econ: EconMine, state: GameState, view: ClientView | null, selected: number | null): ShipModel | null {
  const t = econ.transfer;
  const def = state.data.economy?.transfer;
  const market = state.data.economy?.market;
  if (!t || !def || !view) return null;
  const empty: ShipModel = { lines: [], targets: [], cancel: false, reward: null, unit: null };
  if (!econ.jige) return { ...empty, lines: [market ? `보따리를 사면 ${pct(market.jigeChance)} 확률로 지게 도깨비가 옵니다` : '지게 도깨비가 없습니다'] };
  const reward = !t.rewarded && t.rewardsLeft > 0 ? `첫 배달 묵 +${def.reward}` : null;
  const seatName = (s: number) => view.rows.find(r => r.seat === s)?.name ?? '';
  const me = view.me.seat;
  if (t.offer) {
    const left = secondsOf(state.data, t.offer.deadlineTick - state.tick);
    if (t.offer.from === me) {
      return { ...empty, reward, cancel: true, lines: [`${nameOf(state.data, t.offer.defId)} → ${t.offer.to} ${seatName(t.offer.to)} · ${left}초`, '받을지 기다리는 중 · 그동안 잠김'] };
    }
    return { ...empty, reward, lines: [`${withJosa(seatName(t.offer.from), '이/가')} 보낸 짐을 받을지 고르세요`] };
  }
  if (t.ready > state.round) return { ...empty, reward, lines: [`다음 배달 ${t.ready}라운드부터 (${t.ready - state.round}라운드 남음)`] };
  const unit = selected === null ? null : state.slots[selected] ?? null;
  if (!unit) return { ...empty, reward, lines: [`보낼 1~${def.maxGrade}등급 유닛을 판에서 고르세요`] };
  const unitDef = state.data.units.find(u => u.id === unit.defId);
  const bad = !unitDef ? '보낼 수 없는 유닛입니다'
    : unitDef.hidden ? '히든은 보낼 수 없습니다'
      : unitDef.grade > def.maxGrade ? `${def.maxGrade}등급까지만 보낼 수 있습니다`
        : t.delivered.includes(unit.id) ? '받은 유닛은 다시 보낼 수 없습니다' : null;
  if (bad) return { ...empty, reward, lines: [`${unitDef?.name ?? ''} · ${bad}`] };
  const targets: ShipTarget[] = view.rows
    .filter(r => r.status === 'alive' && r.seat !== me)
    .map(r => {
      const why = !r.connected ? '단절' : t.busy.includes(r.seat) ? '배달 중' : (t.readyRounds[r.seat] ?? 0) > state.round ? '쉬는 중' : null;
      return { seat: r.seat, label: `${r.seat} ${r.name}${why ? ` · ${why}` : ''}`, disabled: why !== null };
    });
  return {
    ...empty, reward, unit: { slot: selected!, unitId: unit.id }, targets,
    lines: [targets.length ? `${withJosa(`${unitDef!.name}(${unitDef!.grade}등급)`, '을/를')} 누구에게?` : '받을 수 있는 고개가 없습니다'],
  };
}

export interface IncomingModel { text: string; reward: string | null; slot: number | null; secondsLeft: number; frac: number }

/** The receiver's prompt: who sends what, the slot it lands in, and the 10-second countdown. */
export function incomingModel(econ: EconMine, state: GameState, view: ClientView | null, chosen: number | null): IncomingModel | null {
  const offer = econ.transfer?.offer;
  const def = state.data.economy?.transfer;
  if (!offer || !def || !view || offer.to !== view.me.seat) return null;
  const from = view.rows.find(r => r.seat === offer.from)?.name || `${offer.from}번`;
  const unit = nameOf(state.data, offer.defId);
  const free = freeSlots(state);
  const slot = chosen !== null && free.includes(chosen) ? chosen : free[0] ?? null;
  const span = toTicks(def.offerSeconds);
  const left = Math.max(0, offer.deadlineTick - state.tick);
  return {
    text: `${withJosa(from, '이/가')} ${withJosa(unit, '을/를')} 보냅니다`,
    reward: econ.transfer && !econ.transfer.rewarded && econ.transfer.rewardsLeft > 0 ? `받으면 묵 +${def.reward}` : null,
    slot, secondsLeft: secondsOf(state.data, left), frac: Math.min(1, left / span),
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

  const story = econ.story;
  const sd = eco.story;
  if (story?.active && sd) {
    out.push({
      title: '설화', text: `${nameOf(data, story.active.target)} · 잡귀 ${Math.min(econ.roundKills, sd.kills)}/${sd.kills}`,
      action: { name: 'econTab', arg: 'story', label: '보기' },
    });
  }
  return out;
}

// ---------- story request ----------

export interface StoryModel {
  title: string; lines: string[]; shortfalls: string[]; offer: boolean; target: string | null; canClear: boolean; done: boolean;
}

export function storyModel(econ: EconMine, state: GameState): StoryModel | null {
  const data = state.data;
  const def = data.economy?.story;
  const s = econ.story;
  if (!def || !s) return null;
  const checks = def.checks.map(c => c.round).join('·');
  const v = s.view;
  const recipe = s.target ? data.recipes.find(r => r.result === s.target) : undefined;
  const matLine = recipe && v ? recipe.materials.map((id, i) => `${nameOf(data, id)}${NBSP}${v.have[i] ? '✓' : '부족'}`).join(' · ') : null;
  const ledger = v ? [`완성${NBSP}${v.total} · 내 재료${NBSP}${v.paid} · 지원${NBSP}+${v.support}`, `이번 판 지원 ${v.cap} 중 ${v.used} 사용`] : [];
  const shortfalls: string[] = [];
  if (v && v.short > 0) shortfalls.push(`유닛 값 ${v.short} 더 필요`);
  if (s.awarded) {
    return { title: '설화 의뢰', lines: ['이번 판 설화 완성품을 받았습니다.'], shortfalls: [], offer: false, target: s.target, canClear: false, done: true };
  }
  if (s.active && recipe && v) {
    const target = nameOf(data, s.active.target);
    const held = recipe.materials.filter((_, i) => v.have[i]).map(id => nameOf(data, id));
    const heldText = held.join('·');
    if (state.coins < def.fee.coins) shortfalls.push(`엽전 ${def.fee.coins - state.coins}냥 부족`);
    if (state.buckwheat < def.fee.buckwheat) shortfalls.push(`메밀묵 ${def.fee.buckwheat - state.buckwheat}개 부족`);
    return {
      title: `설화 의뢰 · ${s.active.round}라운드`, offer: true, target: s.active.target, canClear: false, done: false, shortfalls,
      lines: [
        target, matLine ?? '', `우리 고개 잡귀 ${Math.min(econ.roundKills, def.kills)}/${def.kills}`,
        `${s.active.round}라운드가 끝나면 ${withJosa(heldText, '과/와')} ${def.fee.coins}냥·묵 ${def.fee.buckwheat}개를 내고 ${withJosa(target, '을/를')} 받습니다`,
        ...ledger,
      ],
    };
  }
  const how = `${checks}라운드 시작에 목표 재료가 한 자리만 비어 있으면 의뢰가 옵니다`;
  if (!s.target) return { title: '설화 의뢰', lines: ['목표 6등급이 없습니다', how], shortfalls: [], offer: false, target: null, canClear: false, done: false };
  return {
    title: '설화 의뢰', offer: false, target: s.target, canClear: true, done: false, shortfalls,
    lines: [`목표 ${nameOf(data, s.target)}`, ...(matLine ? [matLine] : []), how, ...ledger],
  };
}

// ---------- notes ----------

const END_TEXT: Record<string, string | null> = {
  award: null, declined: '설화 의뢰를 거절했습니다', targetChanged: '목표를 바꿔 설화 의뢰가 끝났습니다',
  lostMaterial: '재료가 빠져 설화 의뢰가 끝났습니다', gotMaterial: '마지막 재료가 생겨 설화 의뢰가 끝났습니다',
  kills: '잡귀 수를 못 채워 설화 의뢰가 끝났습니다', funds: '엽전이나 묵이 모자라 설화 의뢰가 끝났습니다',
  cap: '지원 한도에 걸려 설화 의뢰가 끝났습니다',
};

/** One line for an economy result on the owner's screen. */
export function noteText(ev: EconNote, data: GameData): string | null {
  switch (ev.type) {
    case 'buy': {
      const jige = ev.jige ? ' · 지게 도깨비가 왔습니다!' : '';
      if (ev.item === 'jar') return ev.buckwheat ? `단지에서 메밀묵 ${ev.buckwheat}개` : `단지에서 ${nameOf(data, ev.defId ?? '')} · 다음 단지는 묵 확정`;
      return `보따리에서 ${nameOf(data, ev.defId ?? '')} (${gradeOf(data, ev.defId ?? '')}등급)${jige}`;
    }
    case 'questReward': {
      const gain = [ev.coins ? `+${ev.coins}냥` : '', ev.buckwheat ? `묵 +${ev.buckwheat}` : '', ev.tokens ? `불 +${ev.tokens}` : ''].filter(Boolean).join(' · ');
      const title = { mission: '쇠밥 한 끼 성공', collection: '살림 한 벌 완성', team: '서낭당 정성', ssireum: '씨름 승리', story: '설화 완성품을 받았습니다', transfer: '첫 배달' }[ev.quest];
      return gain ? `${title} · ${gain}` : title;
    }
    case 'storyOffer': return `설화 의뢰: ${nameOf(data, ev.target)} · ${nameOf(data, ev.missing)} 자리`;
    case 'storyEnd': return END_TEXT[ev.reason] ?? null;
    case 'tame': return `길들이기 성공 · ${withJosa(nameOf(data, ev.defId), '이/가')} 우리 편이 됐습니다`;
  }
}

/**
 * How a delivery ended, from the seat `me`'s side, as the server decided it. Nothing when the match ended with the offer
 * open: the server sends no end then, and the result screen takes over.
 */
export function transferEndText(end: TransferEndView, me: number, data: GameData): string {
  const unit = nameOf(data, end.defId);
  const sender = me === end.from;
  const mine = end.by === me;
  switch (end.outcome) {
    case 'accepted': return sender ? (unit ? `${unit} 배달을 마쳤습니다` : '배달을 마쳤습니다') : unit ? `${withJosa(unit, '을/를')} 받았습니다` : '배달을 받았습니다';
    case 'declined':
      if (mine) return sender ? '보내기를 취소했습니다' : '배달을 사양했습니다';
      return sender ? '상대가 배달을 사양했습니다' : '보내는 쪽이 배달을 취소했습니다';
    case 'expired': return '시간이 지나 배달이 끝났습니다';
    case 'invalid':
      if (end.cause === 'eliminated') return mine ? '고개가 뚫려 배달이 취소됐습니다' : '상대 고개가 뚫려 배달이 취소됐습니다';
      if (end.cause === 'disconnected') return mine ? '연결이 끊겨 배달이 취소됐습니다' : '상대 연결이 끊겨 배달이 취소됐습니다';
      if (end.cause === 'unitGone') return '보낼 유닛이 없어져 배달이 취소됐습니다';
      return '배달이 취소됐습니다';
  }
}

// ---------- html ----------

const button = (action: string, arg: string, label: string, disabled = false, cls = '') =>
  `<button data-action="${action}" data-arg="${esc(arg)}"${cls ? ` class="${cls}"` : ''}${disabled ? ' disabled' : ''}>${esc(label)}</button>`;

export type EconTab = 'market' | 'story';

/** `unread`: a story request came while the market was open; its tab is marked until it is looked at. */
export function econPanelHtml(tab: EconTab, market: MarketModel | null, ship: ShipModel | null, story: StoryModel | null, unread = false): string {
  const storyTab = story ? button('econTab', 'story', story.offer ? '의뢰 !' : '의뢰', false, [tab === 'story' ? 'on' : '', unread ? 'unread' : ''].filter(Boolean).join(' ')) : '';
  const tabs = `<div class="econ-head">${button('econTab', 'market', '장터', false, tab === 'market' ? 'on' : '')}${storyTab}${button('toggleMarket', '', 'B 닫기', false, 'econ-close')}</div>`;
  let body = '';
  if (tab === 'market' && market) {
    const shops = market.shops.map(s => `<section class="shop">
      <div class="shop-title"><b>${esc(s.name)}</b><span>${s.price}냥</span></div>
      <div class="shop-line">${esc(s.left)}</div>${s.lines.map(l => `<div class="shop-line">${esc(l)}</div>`).join('')}
      ${button('buy', s.item, s.blocked ?? '사기', s.blocked !== null)}${s.short ? `<div class="shop-short">${esc(s.short)}</div>` : ''}</section>`).join('');
    const shipHtml = ship ? `<section class="shop ship"><div class="shop-title"><b>지게 배달</b>${ship.reward ? `<span>${esc(ship.reward)}</span>` : ''}</div>
      ${ship.lines.map(l => `<div class="shop-line">${esc(l)}</div>`).join('')}
      ${ship.targets.length ? `<div class="ship-targets">${ship.targets.map(t => button('ship', String(t.seat), t.label, t.disabled)).join('')}</div>` : ''}
      ${ship.cancel ? button('shipCancel', '', '보내기 취소') : ''}</section>` : '';
    body = `<div class="econ-sub">${esc(market.head)}</div>${shops}${shipHtml}`;
  } else if (story) {
    const lines = story.lines.filter(Boolean).map((l, i) => `<div class="${i === 0 && story.offer ? 'story-target' : 'shop-line'}">${esc(l)}</div>`).join('');
    const shorts = story.shortfalls.map(l => `<div class="shop-short">${esc(l)}</div>`).join('');
    const actions = story.offer
      ? `<div class="story-actions">${button('econClose', '', '닫기')}${button('storyDecline', '', '의뢰 거절')}</div>`
      : story.done ? '' : `<div class="story-actions">${button('openDex', '', story.target ? '목표 바꾸기' : '도감에서 목표 고르기')}${story.canClear ? button('storyTarget', '', '목표 해제') : ''}</div>`;
    body = `<div class="econ-sub">${esc(story.title)}</div><section class="shop">${lines}${shorts}${actions}</section>`;
  }
  return `<div class="econ-panel">${tabs}<div class="econ-body">${body}</div></div>`;
}

/** Prompts over the top of the lane, one row each: an incoming delivery or the own offer waiting, and a tame chance. */
export function econTopHtml(incoming: IncomingModel | null, outgoing: string | null, tame: TameModel | null): string {
  const parts: string[] = [];
  if (incoming) {
    const take = incoming.slot === null ? button('receive', '', '빈칸 없음', true) : button('receive', String(incoming.slot), `받기 · ${incoming.slot + 1}번 칸`);
    // one row, so two prompts still end above the top lane; the hint rides on the row's tooltip
    const hint = incoming.slot === null ? '칸을 비우면 받을 수 있습니다' : '빈칸을 누르면 받을 칸이 바뀝니다';
    parts.push(`<div class="prompt incoming" title="${esc(hint)}"><div class="prompt-line"><b>${esc(incoming.text)}</b>${incoming.reward ? `<span class="prompt-gain">${esc(incoming.reward)}</span>` : ''}<span class="prompt-time">${incoming.secondsLeft}초</span>${take}${button('refuse', '', '사양')}</div>
      <i class="prompt-bar"><i style="width:${Math.round(incoming.frac * 100)}%"></i></i></div>`);
  } else if (outgoing) {
    parts.push(`<div class="prompt"><div class="prompt-line"><span>${esc(outgoing)}</span>${button('shipCancel', '', '취소')}</div></div>`);
  }
  if (tame) {
    const ticks = tame.parts.map(p => `<span class="${p.ok ? 'ok' : 'no'}">${esc(p.text)}</span>`).join('');
    parts.push(`<div class="prompt tame"><div class="prompt-line"><b>${esc(tame.title)}</b>${ticks}${button('tame', String(tame.enemyId), 'T 길들이기', !tame.ready)}</div></div>`);
  }
  return parts.join('');
}

export function econBottomHtml(chips: Chip[]): string {
  return chips.map(c => `<div class="q${c.tone ? ` ${c.tone}` : ''}"><b>${esc(c.title)}</b><span>${esc(c.text)}</span>${c.action ? button(c.action.name, c.action.arg, c.action.label, c.action.disabled) : ''}</div>`).join('');
}
