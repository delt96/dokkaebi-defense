import {
  gamblePool, gambleTier, type GameState, type GambleEvent, type GambleTable, type GambleView, type GameData, type RejectReason, type UnitDef,
} from '@dorandi/logic';
import { GRADE_COLOR } from '../layout';
import { esc } from './dom';
import { unitFaceHtml } from './storage';

type Tier = ReturnType<typeof gambleTier>;
export type Reveal =
  | { phase: 'start'; at: number }
  | { phase: 'rolling' | 'result'; at: number; event: GambleEvent; tier: Tier };

export function startReveal(now: number): Reveal {
  return { phase: 'start', at: now };
}

export function revealResultAt(reveal: Extract<Reveal, { event: GambleEvent }>): number {
  return reveal.at + (reveal.tier === 'lose' ? 700 : 850);
}

export function advanceReveal(reveal: Reveal | null, now: number, data: GameData, confirmed?: GambleEvent): Reveal | null {
  if (confirmed) return { phase: 'rolling', at: now, event: confirmed, tier: gambleTier(data, confirmed) };
  if (reveal?.phase === 'start' && now - reveal.at >= 2500) return null;
  if (reveal?.phase === 'rolling' && now >= revealResultAt(reveal)) {
    return { ...reveal, phase: 'result', at: now };
  }
  return reveal;
}

/** Coins the lane already holds from a draw still rolling; the 엽전 count leaves them out until the result shows. */
export function heldCoins(reveal: Reveal | null): number {
  if (reveal?.phase !== 'rolling') return 0;
  return reveal.event.type === 'gambleCoins' ? reveal.event.payout : reveal.event.consolation;
}

interface Odds { label: string; chance: number; color: string }
interface ButtonModel {
  action: 'gambleCoins' | 'gambleUnit'; arg: string; name: string; price: string;
  blocked: string | null; odds: Odds[]; consolation?: number; stake?: number;
}
interface GroupModel { name: string; summary: string; count: string; buttons: ButtonModel[] }
export interface GambleModel { coins: GroupModel; units: GroupModel; cheap?: GroupModel }
export interface GambleJige { chance: number; held: number; maxGrade: number }

const TABLE_LABEL: Record<GambleTable, string> = { small: '보따리', big: '큰 보따리', coin: '엽전 보따리' };
const PAYOUT_COLORS: Record<number, string> = { 0: '#82748e', 0.5: '#c78c95', 1.5: '#b9a8e7', 2: '#dbb16e', 5: '#ffe08a', 10: '#fff0e0' };
const gradeText = (result: number | 'hidden') => result === 0 ? '꽝' : result === 'hidden' ? '숨은 유닛' : `${result}등급`;
const percent = (chance: number) => `${+(chance * 100).toFixed(4)}%`;
const remaining = (left: number, limit: number) => `남은 횟수 ${left}/${limit}`;

export function blockedText(why: RejectReason | null, price: number, balance: number, fromRound?: number): string | null {
  switch (why) {
    case null: return null;
    case 'marketLocked': return '10라운드 보스 격파 후';
    case 'marketClosed': return '1라운드부터';
    case 'gambleRound': case 'itemTooEarly': return `${fromRound}라운드부터`;
    case 'gambleLimit': return '이번 라운드 몫을 다 씀';
    case 'noSlot': return '진영 한 칸 비우기';
    case 'noCoins': return `엽전 ${Math.max(0, price - balance)}냥 부족`;
    case 'noBuckwheat': return `메밀묵 ${Math.max(0, price - balance)}개 부족`;
    default: return '지금은 할 수 없음';
  }
}

export function gambleModel(view: GambleView, coins: number, buckwheat: number): GambleModel {
  const odds = view.coins.outcomes.map(({ result, chance }) => ({
    label: `×${result}`, chance, color: PAYOUT_COLORS[result] ?? '#ffe08a',
  }));
  const cheap = view.units.tables.coin;
  function bundle(id: GambleTable, table: NonNullable<typeof cheap>): ButtonModel {
    const isCoin = id === 'coin';
    const price = isCoin ? table.coinCost ?? 0 : table.buckwheatCost;
    return {
      action: 'gambleUnit', arg: id, name: TABLE_LABEL[id], price: isCoin ? `${price}냥` : `묵 ${price}개`,
      blocked: blockedText(table.why, price, isCoin ? coins : buckwheat, table.fromRound),
      odds: table.outcomes.map(({ result, chance }) => ({
        label: gradeText(result), chance,
        color: result === 'hidden' ? '#fff0e0' : GRADE_COLOR[result] ?? '#82748e',
      })),
      ...(!isCoin && { consolation: table.consolation }),
    };
  }
  return {
    ...(cheap && {
      cheap: {
        name: TABLE_LABEL.coin, summary: '유닛 한 기', count: remaining(cheap.left ?? 0, cheap.perRound ?? 0),
        buttons: [bundle('coin', cheap)],
      },
    }),
    coins: {
      name: '돈 도박', summary: '판돈 × 나온 배수', count: remaining(view.coins.left, view.coins.limit),
      buttons: view.coins.stakes.map(({ price, why }) => ({
        action: 'gambleCoins', arg: String(price), name: `돈 도박 · ${price}냥`, price: `${price}냥 걸기`,
        blocked: blockedText(why, price, coins), odds, stake: price,
      })),
    },
    units: {
      name: '묵 보따리', summary: '유닛 또는 위로금', count: remaining(view.units.left, view.units.limit),
      buttons: [bundle('small', view.units.tables.small), bundle('big', view.units.tables.big)],
    },
  };
}

export interface RevealDisplay {
  phase: Reveal['phase']; label: string; detail?: string; unit?: UnitDef;
  tier?: Tier; coin?: boolean; motion?: boolean; announcement: string;
}

function coinResult(event: Extract<GambleEvent, { type: 'gambleCoins' }>): string {
  const net = event.payout - event.stake;
  return `받음 ${event.payout}냥 · ${net > 0 ? `이득 ${net}냥` : net < 0 ? `손해 ${-net}냥` : '본전'}`;
}

export function revealDisplay(reveal: Reveal | null, now: number, data: GameData, reduced: boolean): RevealDisplay | null {
  if (!reveal) return null;
  const pending = '굴리는 중…';
  if (reveal.phase === 'start') return { phase: 'start', label: pending, announcement: '' };
  const { event, phase } = reveal;
  if (phase === 'rolling') {
    const g = data.economy!.market!.gamble!;
    const frame = Math.floor((now - reveal.at) / 85);
    if (reduced) return { phase, label: pending, announcement: '' };
    if (event.type === 'gambleCoins') {
      const value = g.coins.outcomes[frame % g.coins.outcomes.length]!.result;
      return { phase, label: `×${value}`, coin: true, announcement: '' };
    }
    const outcomes = g.units.tables[event.table]!.outcomes;
    const result = outcomes[frame % outcomes.length]!.result;
    const pool = gamblePool(data, result);
    const unit = pool[Math.floor(frame / outcomes.length) % pool.length];
    return { phase, label: unit?.name ?? gradeText(result), unit, announcement: '' };
  }
  const tier = reveal.tier;
  const motion = !reduced && now - reveal.at < 450;
  if (event.type === 'gambleCoins') {
    const label = event.multiplier === 0 ? '꽝 · ×0' : `×${event.multiplier}`;
    const detail = coinResult(event);
    return { phase, tier, motion, label, detail, coin: tier !== 'lose', announcement: `${label} · ${detail}` };
  }
  const unit = event.defId ? data.units.find(u => u.id === event.defId) : undefined;
  const detail = [
    unit ? gradeText(event.result) : event.consolation ? `위로금 +${event.consolation}냥` : null,
    event.jige ? '지게 획득' : null,
  ].filter(Boolean).join(' · ');
  return {
    phase, tier, motion, unit, label: unit?.name ?? '꽝',
    detail,
    announcement: [unit ? `${gradeText(event.result)} 당첨!` : '꽝', unit ? (event.jige ? '지게 획득' : '') : detail].filter(Boolean).join(' · '),
  };
}

export function gambleInfoHtml(model: GambleModel, item: string | null, jige: GambleJige): string {
  const button = [...model.units.buttons, ...model.coins.buttons, ...(model.cheap?.buttons ?? [])].find(b => b.arg === item);
  const title = button?.name ?? '상품 안내';
  let detail = '<p>상품이나 가격에 마우스를 올려 보세요.</p>';
  if (button) {
    const odds = button.odds.map(o => `<i style="--share:${percent(o.chance)};--swatch:${o.color}"></i>`).join('');
    const labels = button.odds.map(o => `<span><i style="--swatch:${o.color}" aria-hidden="true"></i>${esc(o.label)} ${percent(o.chance)}</span>`).join('');
    const note = button.stake !== undefined
      ? `판돈 × 배수만큼 받아요. ×2면 ${button.stake * 2}냥을 받아 ${button.stake}냥 이득이에요.`
      : button.consolation !== undefined
        ? `꽝 위로금 ${button.consolation}냥 · 지게는 따로 ${percent(jige.chance)}<br>보유 ${jige.held}개 · ${jige.maxGrade}등급 이하를 골라 R · 같은 등급으로 바꿔요`
        : '뽑으면 유닛 한 기를 받아요.';
    detail = `<div class="gamble-odds" aria-hidden="true">${odds}</div><div class="gamble-odds-labels">${labels}</div><p>${note}</p>`;
  }
  return `<div class="gamble-line"><strong>${esc(title)}</strong><span>이름을 눌러 확률 보기</span></div>${detail}`;
}

export interface GambleHistoryEntry { event: GambleEvent; round: number }

export function recordGamble(history: GambleHistoryEntry[], receipt: GambleHistoryEntry): GambleHistoryEntry[] {
  return [receipt, ...history.slice(0, 4)];
}

export function gambleHistoryHtml(history: GambleHistoryEntry[], state: GameState): string {
  const cols = state.data.balance.grid.cols;
  const rows = history.map(({ event, round }) => {
    const time = `<span class="gamble-time">${round}R</span>`;
    if (event.type === 'gambleCoins') {
      return `<li>${time}<span>돈 도박 ×${event.multiplier} · ${event.stake}냥</span><span>${coinResult(event)}</span></li>`;
    }
    const unit = event.defId ? state.data.units.find(u => u.id === event.defId) : undefined;
    const shop = TABLE_LABEL[event.table];
    const token = event.jige ? ' · 지게' : '';
    if (!unit) return `<li>${time}<span>꽝 · ${shop}</span><span>위로금 ${event.consolation}냥${token}</span></li>`;
    const slot = state.slots.findIndex(u => u?.id === event.unitId);
    const place = `${Math.floor(slot / cols) + 1}행 ${slot % cols + 1}열`;
    const location = slot < 0 ? '<span>진영에 없음</span>'
      : `<button type="button" data-action="marketCell" data-arg="${event.unitId}" data-market-focus="cell-${event.unitId}" aria-label="${esc(unit.name)}의 ${place} 보기">칸 보기 · ${place}</button>`;
    return `<li>${time}<span class="gamble-prize">${unitFaceHtml(unit.id, unit.name, unit.grade)}<span>${esc(unit.name)} · ${shop}${token}</span></span>${location}</li>`;
  });
  return `<div class="gamble-line"><strong>최근 결과</strong></div><ul>${rows.join('') || '<li>이번 경기에서 아직 뽑지 않았어요</li>'}</ul>`;
}

export function gambleHtml(model: GambleModel, reveal: RevealDisplay | null, readOnly = false): string {
  const busy = !!reveal && reveal.phase !== 'result';
  const reason = (b: ButtonModel) => readOnly ? '관전 중에는 살 수 없어요' : b.blocked;
  const inspect = (item: string, label: string) => `<button type="button" class="gamble-inspect" data-market-focus="info-${esc(item)}" aria-controls="gamble-info">${esc(label)}</button>`;
  const buy = (b: ButtonModel) => {
    const why = reason(b);
    const reasonId = `gamble-why-${esc(b.arg)}`;
    return `<button type="button" class="gamble-buy" data-action="${b.action}" data-arg="${esc(b.arg)}" data-market-focus="buy-${esc(b.arg)}" aria-label="${esc(b.stake === undefined ? b.name + ' · ' + b.price : b.price)}"${why ? ` aria-describedby="${reasonId}"` : ''}${busy || why ? ' disabled' : ''}>${esc(b.price)}</button>${why ? `<span class="gamble-why" id="${reasonId}">${esc(why)}</span>` : ''}`;
  };
  const heading = (group: GroupModel, item?: string) => `<div class="gamble-line">
    <strong>${item ? inspect(item, group.name) : esc(group.name)}</strong><span>${esc(group.summary)}</span><span class="gamble-count">${esc(group.count)}</span>
  </div>`;
  const option = (b: ButtonModel, named = false) => {
    const focus = b.stake !== undefined && (busy || reason(b))
      ? ` tabindex="0" role="group" data-market-focus="buy-${esc(b.arg)}" aria-label="${esc(b.name)}"${reason(b) ? ` aria-describedby="gamble-why-${esc(b.arg)}"` : ''}` : '';
    return `<div class="gamble-option" data-market-item="${esc(b.arg)}"${focus}>${named ? inspect(b.arg, b.name) : ''}${buy(b)}</div>`;
  };
  const cheap = model.cheap;
  const firstStake = model.coins.buttons[0]?.arg;
  return `<section class="gamble-group">${heading(model.units)}
    <div class="gamble-options gamble-bundles">${model.units.buttons.map(b => option(b, true)).join('')}</div></section>
    ${cheap ? `<section class="gamble-group gamble-single" data-market-item="coin">${heading(cheap, 'coin')}${option(cheap.buttons[0]!)}</section>` : ''}
    <section class="gamble-group" data-market-item="${esc(firstStake ?? '')}">${heading(model.coins, firstStake)}
    <div class="gamble-options">${model.coins.buttons.map(b => option(b)).join('')}</div></section>`;
}

export function gambleRevealHtml(reveal: RevealDisplay | null): string {
  const face = reveal?.unit ? unitFaceHtml(reveal.unit.id, reveal.unit.name, reveal.unit.grade)
    : reveal?.coin ? '<span class="coin" aria-hidden="true">◇</span>' : '';
  const effect = reveal?.motion ? (reveal.tier === 'big' ? ' flash pop' : reveal.tier === 'small' ? ' pop' : '') : '';
  return `<div class="gamble-reveal ${reveal?.phase ?? ''} ${reveal?.tier ?? ''}${effect}"${reveal?.phase === 'result' ? ' role="status"' : ''}>
    ${reveal ? `${face}<div><b>${esc(reveal.label)}</b>${reveal.detail ? `<small>${esc(reveal.detail)}</small>` : ''}</div>` : '아직 뽑은 결과가 없어요'}
  </div>`;
}
