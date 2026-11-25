import { difficultySuffix } from '../ui/difficulty';
import { limitLevel, limitTail, resistText, type LimitLevel } from '../ui/models';
import type { ClientView, EliminationCause, GameData, RowView } from '@dorandi/logic';
import type { NetEvent } from '../net/NetClient';

/**
 * `chip`: 'current' on the row the 역신 is in now, 'next' on the row it goes to after (never both).
 * `offline` marks a disconnected lane even when the status text says 위험 or 초과.
 */
export interface RowModel {
  seat: number; empty: boolean; title: string; count: string; level: LimitLevel | null; status: string;
  chip: 'next' | 'current' | null; progress: number | null; me: boolean; spirit: boolean; offline: boolean;
}
/** `mine`: the part of line1 with my count; `mineLevel`/`mineTail` grade it like the solo HUD. */
export interface TopModel { line1: string; line2: string; gateUrgent: boolean; mine: string | null; mineLevel: LimitLevel | null; mineTail: string | null }
export interface GateCountdown { seconds: number; hp: number; maxHp: number; where: string; say: string | null }
export interface Arrival { text: string; seconds: number; urgent: boolean }

const TICKS_PER_SECOND = 20;
export const CAUSE_TEXT: Record<EliminationCause, string> = { limit: '잡귀 한도', boss: '고개 보스', forfeit: '포기', disconnect: '단절' };
/** The elimination cause stays on the row for 3 seconds before it says plain "탈락·넋". */
const CAUSE_TICKS = 60;
const NOTICE_MS = 3000;
const SEATS = 6;
const COUNTDOWN_TICKS = 10 * TICKS_PER_SECOND;
const SPOKEN_SECONDS = [10, 5];
const URGENT_SECONDS = 5;

export const STAGE_NAME: readonly string[] = ['', '첫째', '둘째', '셋째', '넷째', '다섯째'];

const secondsOf = (ticks: number): number => Math.ceil(ticks / TICKS_PER_SECOND);
const num = (n: number): string => n.toLocaleString('ko-KR');

function clockText(ticks: number): string {
  const s = Math.max(0, secondsOf(ticks));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function limitTicks(data: GameData): number {
  return Math.round(data.balance.limitSeconds * 1000 / data.balance.tickMs);
}

const isOffline = (r: RowView): boolean => !r.connected && r.reconnectTicksLeft !== null;

function statusOf(view: ClientView, data: GameData, r: RowView, level: LimitLevel | null, returned: boolean): string {
  if (r.status === 'spirit') {
    const recent = r.cause !== null && r.eliminatedTick !== null && view.clock.tick - r.eliminatedTick < CAUSE_TICKS;
    return recent ? `탈락·${CAUSE_TEXT[r.cause!]}` : '탈락·넋';
  }
  if (level === 'over') return `초과 ${secondsOf(limitTicks(data) - r.overLimitTicks)}초`;
  if (level === 'danger') return '위험';
  if (isOffline(r)) return `끊김 · ${clockText(r.reconnectTicksLeft!)}`;
  if (level === 'warn') return '주의';
  if (returned) return '돌아옴';
  return '생존';
}

/** The six left-panel rows, in seat order (never re-ranked). `returned`: seats to mark 돌아옴 (the caller times it). */
export function rowsModel(view: ClientView, data: GameData, returned: ReadonlySet<number> = new Set()): RowModel[] {
  const coop = data.coop!;
  const stayTicks = coop.staySeconds * TICKS_PER_SECOND;
  const y = view.yeoksin;
  const out: RowModel[] = [];
  for (let seat = 1; seat <= SEATS; seat++) {
    const r = view.rows.find(x => x.seat === seat);
    if (!r || r.status === 'empty') {
      out.push({ seat, empty: true, title: '빈 고개', count: '', level: null, status: '', chip: null, progress: null, me: false, spirit: false, offline: false });
      continue;
    }
    const me = seat === view.me.seat;
    const spirit = r.status === 'spirit';
    const level = spirit ? null : limitLevel(data, r.count, view.clock.round).level;
    const current = y !== null && y.seat === seat;
    const next = y !== null && y.nextSeat === seat && !current;
    out.push({
      seat, empty: false,
      title: `${seat} ${r.name}${me ? ' · 나' : ''}`,
      count: spirit ? '넋' : String(r.count),
      level,
      status: statusOf(view, data, r, level, returned.has(seat)),
      chip: current ? 'current' : next ? 'next' : null,
      progress: current ? Math.min(1, Math.max(0, (view.clock.tick - y.enterTick + 1) / stayTicks)) : null,
      me, spirit, offline: isOffline(r),
    });
  }
  return out;
}

/** Rows that were alive in `prev` and are spirits in `next`: everyone who fell since the last view, in seat order. */
export function fallenSeats(prev: readonly RowView[] | null, next: readonly RowView[]): RowView[] {
  if (!prev) return [];
  return next.filter(n => n.status === 'spirit' && prev.find(p => p.seat === n.seat)?.status === 'alive');
}

/** Seats whose connection came back between `prev` and `next`. */
export function returnedSeats(prev: readonly RowView[] | null, next: readonly RowView[]): number[] {
  if (!prev) return [];
  return next.filter(n => n.connected && prev.find(p => p.seat === n.seat)?.connected === false).map(n => n.seat);
}

/** The deadline round of the gate in play; null once every gate is through. */
export function gateDeadlineRound(view: ClientView, data: GameData): number | null {
  return data.coop!.yeoksin.find(s => s.stage === view.gate.stage)?.deadlineRound ?? null;
}

function ticksToDeadline(view: ClientView): number {
  return (view.gate.deadlineTick ?? view.clock.roundEndTick) - view.clock.tick;
}

const yeoksinName = (stage: number): string => `역신${STAGE_NAME[stage] ? `(${STAGE_NAME[stage]})` : ''}`;

export function topModel(view: ClientView, data: GameData): TopModel {
  const coop = data.coop!;
  const clock = view.clock;
  const left = secondsOf(clock.roundEndTick - clock.tick);
  const mine = view.rows.find(r => r.seat === view.me.seat);
  let line1: string;
  let mineText: string | null = null;
  let mineLevel: LimitLevel | null = null;
  if (clock.phase === 'prep') line1 = `준비 · 남은 ${left}초`;
  else {
    line1 = `${clock.round} / ${data.balance.rounds} 라운드 · 남은 ${left}초`;
    if (mine?.status === 'spirit') line1 += ' · 관전 중';
    else {
      const count = mine?.count ?? 0;
      mineText = `내 잡귀 ${count} / ${data.balance.limit}`;
      mineLevel = limitLevel(data, count, clock.round).level;
      line1 += ` · ${mineText}`;
    }
  }
  const mineTail = mineLevel === null ? null : limitTail(mineLevel, mine?.count ?? 0, data.balance.limit);

  const stages = coop.yeoksin.length;
  const gate = view.gate.stage;
  const def = coop.yeoksin.find(s => s.stage === gate);
  const y = view.yeoksin;
  let line2: string;
  let gateUrgent = false;
  if (!def) line2 = '관문 통과';
  else if (y) {
    const hp = `${yeoksinName(y.stage)} 체력 ${num(y.hp)} / ${num(y.maxHp)}`;
    if (clock.round >= def.deadlineRound) {
      gateUrgent = true;
      line2 = `관문 마감 · 남은 ${Math.max(0, secondsOf(ticksToDeadline(view)))}초 · ${hp}`;
    } else line2 = `관문 ${gate}/${stages} · 마감까지 ${def.deadlineRound - clock.round}라운드 · ${hp}`;
  } else line2 = `관문 ${gate}/${stages} · ${def.startRound}라운드에 역신 등장`;

  const resist = resistText(data, clock.round);
  return { line1: line1 + difficultySuffix(data, view.difficulty) + (resist ? ` · ${resist}` : ''), line2, gateUrgent, mine: mineText, mineLevel, mineTail };
}

/** The last 10 seconds of the deadline round while the 역신 lives. `say` is set only on the seconds read aloud. */
export function gateCountdown(view: ClientView, data: GameData): GateCountdown | null {
  const y = view.yeoksin;
  if (!y || y.hp <= 0 || view.clock.phase !== 'round' || gateDeadlineRound(view, data) === null) return null;
  const ticks = ticksToDeadline(view);
  if (ticks <= 0 || ticks > COUNTDOWN_TICKS) return null;
  const seconds = secondsOf(ticks);
  const row = y.seat === null ? undefined : view.rows.find(r => r.seat === y.seat);
  return {
    seconds, hp: y.hp, maxHp: y.maxHp,
    where: row ? `${row.seat}번 ${row.name} 고개` : '',
    say: SPOKEN_SECONDS.includes(seconds) ? `관문 마감 ${seconds}초 전 · 역신 체력 ${num(y.hp)}` : null,
  };
}

/** The 역신 coming to or staying in my lane, for the fixed line under the notice slot. */
export function arrivalModel(view: ClientView, data: GameData): Arrival | null {
  const y = view.yeoksin;
  const me = view.me.seat;
  if (!y || view.rows.find(r => r.seat === me)?.status !== 'alive') return null;
  const here = y.seat === me;
  if (!here && y.nextSeat !== me) return null;
  const seconds = Math.max(0, secondsOf(y.enterTick + data.coop!.staySeconds * TICKS_PER_SECOND - view.clock.tick));
  return { text: here ? `역신이 내 고개에 · ${seconds}초 뒤 떠남` : `역신이 옵니다 · ${seconds}초`, seconds, urgent: seconds <= URGENT_SECONDS };
}

interface Notice { text: string; at: number }
let active: Notice[] = [];
const seen = new WeakSet<object>();

/** Remembers the supports in one `mine` message ("N번 넋이 보낸 엽전 +5" for 3 seconds). */
export function noteSupport(incoming: ClientView['mine']['supportIn'], now: number): void {
  if (incoming.length === 0 || seen.has(incoming)) return;
  seen.add(incoming);
  for (const s of incoming) active.push({ text: `${s.from}번 넋이 보낸 엽전 +${s.coins}`, at: now });
}

/**
 * Notes every arriving `mine`. The server sends one on each resource change (in combat almost every
 * tick) and the next one replaces supportIn, so reading it at redraw time (100 ms) would miss most.
 */
export function watchSupport(net: { view: ClientView | null; on(cb: (e: NetEvent) => void): void }, now: () => number = () => performance.now()): void {
  let last = net.view?.mine;
  if (last) noteSupport(last.supportIn, now());
  net.on(e => {
    if (e.kind !== 'view' || e.view.mine === last) return;
    last = e.view.mine;
    noteSupport(last.supportIn, now());
  });
}

/** Support notices still on screen. */
export function rightNotices(now: number): string[] {
  active = active.filter(n => now - n.at <= NOTICE_MS);
  return active.map(n => n.text);
}
