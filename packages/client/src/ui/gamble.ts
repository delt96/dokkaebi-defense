import {
  gamblePool, gambleTier, type GambleEvent, type GambleTable, type GambleView, type GameData, type RejectReason, type UnitDef,
} from '@dorandi/logic';
import { esc } from './dom';
import { unitFaceHtml } from './storage';

type Tier = ReturnType<typeof gambleTier>;
export type Reveal =
  | { phase: 'start'; at: number }
  | { phase: 'rolling' | 'result'; at: number; event: GambleEvent; tier: Tier };

export function startReveal(now: number): Reveal {
  return { phase: 'start', at: now };
}

export function advanceReveal(reveal: Reveal | null, now: number, data: GameData, confirmed?: GambleEvent): Reveal | null {
  if (confirmed) return { phase: 'rolling', at: now, event: confirmed, tier: gambleTier(data, confirmed) };
  if (reveal?.phase === 'start' && now - reveal.at >= 2500) return null;
  if (reveal?.phase === 'rolling' && now - reveal.at >= (reveal.tier === 'lose' ? 700 : 850)) {
    return { ...reveal, phase: 'result', at: now };
  }
  return reveal;
}

/** Coins the lane already holds from a draw still rolling; the 엽전 count leaves them out until the result shows. */
export function heldCoins(reveal: Reveal | null): number {
  if (reveal?.phase !== 'rolling') return 0;
  return reveal.event.type === 'gambleCoins' ? reveal.event.payout : reveal.event.consolation;
}

interface ButtonModel {
  action: 'gambleCoins' | 'gambleUnit'; arg: string; label: string;
  blocked: string | null; odds: string;
}
interface GroupModel { count: string; buttons: ButtonModel[] }
export interface GambleModel { coins: GroupModel; units: GroupModel; cheap?: GroupModel }
const TABLE_LABEL: Record<GambleTable, string> = { small: '보따리', big: '큰 보따리', coin: '엽전 보따리' };
const gradeText = (result: number | 'hidden') => result === 0 ? '꽝' : result === 'hidden' ? '숨은 유닛' : `${result}등급`;
const percent = (chance: number) => `${+(chance * 100).toFixed(4)}%`;

function blockedText(why: RejectReason | null, price: number, balance: number, fromRound?: number): string | null {
  switch (why) {
    case null: return null;
    case 'marketLocked': return '10라운드 보스를 잡으면 열림';
    case 'marketClosed': return '1라운드부터';
    case 'gambleRound': return `${fromRound}라운드부터`;
    case 'gambleLimit': return '이번 라운드 몫을 다 씀';
    case 'noSlot': return '진영 한 칸 비우기';
    case 'noCoins': return `엽전 ${Math.max(0, price - balance)}냥 부족`;
    case 'noBuckwheat': return `메밀묵 ${Math.max(0, price - balance)}개 부족`;
    default: return '지금은 할 수 없음';
  }
}

export function gambleModel(view: GambleView, coins: number, buckwheat: number): GambleModel {
  const odds = view.coins.outcomes.map(o => `×${o.result} ${percent(o.chance)}`).join(' · ');
  const cheap = view.units.tables.coin;
  return {
    ...(cheap && {
      cheap: {
        count: `${TABLE_LABEL.coin} ${cheap.left ?? 0}/${cheap.perRound ?? 0}`,
        buttons: [{
          action: 'gambleUnit', arg: 'coin', label: `${TABLE_LABEL.coin} · ${cheap.coinCost ?? 0}냥`,
          blocked: blockedText(cheap.why, cheap.coinCost ?? 0, coins, cheap.fromRound),
          odds: cheap.outcomes.map(o => `${gradeText(o.result)} ${percent(o.chance)}`).join(' · '),
        }],
      },
    }),
    coins: {
      count: `돈 도박 ${view.coins.left}/${view.coins.limit}`,
      buttons: view.coins.stakes.map(({ price, why }) => ({
        action: 'gambleCoins', arg: String(price), label: `${price}냥`, blocked: blockedText(why, price, coins), odds,
      })),
    },
    units: {
      count: `보따리 남은 횟수 ${view.units.left}/${view.units.limit}`,
      buttons: (['small', 'big'] as const).map(id => {
        const table = view.units.tables[id];
        const odds = table.outcomes.map(o => `${gradeText(o.result)} ${percent(o.chance)}`).join(' · ');
        return {
          action: 'gambleUnit', arg: id, label: `${TABLE_LABEL[id]} · 묵 ${table.buckwheatCost}`,
          blocked: blockedText(table.why, table.buckwheatCost, buckwheat, table.fromRound),
          odds: `${odds} · 꽝이면 ${table.consolation}냥 위로금`,
        };
      }),
    },
  };
}

export interface RevealDisplay {
  phase: Reveal['phase']; label: string; detail?: string; unit?: UnitDef;
  tier?: Tier; coin?: boolean; motion?: boolean; announcement: string;
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
    const detail = event.payout ? `+${event.payout}냥` : undefined;
    return { phase, tier, motion, label, detail, coin: tier !== 'lose', announcement: `대박! ${label} · ${detail}` };
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

export function gambleHtml(model: GambleModel, reveal: RevealDisplay | null): string {
  const busy = !!reveal && reveal.phase !== 'result';
  const buttons = [...model.coins.buttons, ...model.units.buttons, ...(model.cheap?.buttons ?? [])];
  const allBlocked = buttons.every(b => b.blocked);
  const shared = allBlocked && buttons.every(b => b.blocked === buttons[0]?.blocked) ? buttons[0]?.blocked : null;
  const group = ({ count, buttons }: GroupModel) => {
    const reasons = shared ? [] : [...new Set(buttons.flatMap(b => b.blocked ? [b.blocked] : []))];
    return `<div class="gamble-group"><b class="gamble-count">${esc(count)}</b>
      <div class="gamble-buttons">${buttons.map(b => {
        const title = esc(b.blocked ? `${b.blocked} · ${b.odds}` : b.odds);
        return `<span title="${title}"><button data-action="${b.action}" data-arg="${esc(b.arg)}" title="${title}"${busy || b.blocked ? ' disabled' : ''}>${esc(b.label)}</button></span>`;
      }).join('')}</div>${reasons.map(r => `<span class="gamble-why">${esc(r)}</span>`).join('')}</div>`;
  };
  const face = reveal?.unit ? unitFaceHtml(reveal.unit.id, reveal.unit.name, reveal.unit.grade)
    : reveal?.coin ? '<span class="coin" aria-hidden="true">◇</span>' : '';
  const effect = reveal?.motion ? (reveal.tier === 'big' ? ' flash pop' : reveal.tier === 'small' ? ' pop' : '') : '';
  const result = allBlocked && !reveal ? '' : `<div class="gamble-reveal ${reveal?.phase ?? ''} ${reveal?.tier ?? ''}${effect}"${reveal?.phase === 'result' ? ' role="status"' : ''}>
      ${reveal ? `${face}<div><b>${esc(reveal.label)}</b>${reveal.detail ? `<small>${esc(reveal.detail)}</small>` : ''}</div>` : ''}
    </div>`;
  return `<section class="shop gamble-shop">${group(model.units)}${model.cheap ? group(model.cheap) : ''}${group(model.coins)}
    ${shared ? `<span class="gamble-why">${esc(shared)}</span>` : ''}${result}</section>`;
}
