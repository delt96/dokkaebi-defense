import type { ClientView, EliminationCause, GameData, RowView } from '@dorandi/logic';

export interface RowModel {
  seat: number; empty: boolean; title: string; count: string; danger: boolean; status: string;
  mark: 'current' | null; progress: number | null; me: boolean;
}
export interface TopModel { line1: string; line2: string; myTurn: string | null }

const TICKS_PER_SECOND = 20;
const CAUSE_TEXT: Record<EliminationCause, string> = { limit: '잡귀 한도', boss: '고개 보스', forfeit: '포기', disconnect: '단절' };
/** The elimination cause stays on the row for 3 seconds before it says plain "탈락·넋". */
const CAUSE_TICKS = 60;
const NOTICE_MS = 3000;
const SEATS = 6;

const secondsOf = (ticks: number): number => Math.ceil(ticks / TICKS_PER_SECOND);

function limitTicks(data: GameData): number {
  return Math.round(data.balance.limitSeconds * 1000 / data.balance.tickMs);
}

function statusOf(view: ClientView, data: GameData, r: RowView): string {
  const limit = data.balance.limit;
  if (r.status === 'spirit') {
    const recent = r.cause !== null && r.eliminatedTick !== null && view.clock.tick - r.eliminatedTick < CAUSE_TICKS;
    return recent ? `탈락·${CAUSE_TEXT[r.cause!]}` : '탈락·넋';
  }
  if (r.count > limit) return `초과 ${secondsOf(limitTicks(data) - r.overLimitTicks)}초`;
  if (!r.connected && r.reconnectTicksLeft !== null) return `재접속 ${secondsOf(r.reconnectTicksLeft)}초`;
  if (r.count >= data.coop!.danger) return '위험';
  if (view.yeoksin?.nextSeat === r.seat) return '다음';
  return '생존';
}

/** The six left-panel rows, in seat order (never re-ranked). */
export function rowsModel(view: ClientView, data: GameData): RowModel[] {
  const coop = data.coop!;
  const stayTicks = coop.staySeconds * TICKS_PER_SECOND;
  const out: RowModel[] = [];
  for (let seat = 1; seat <= SEATS; seat++) {
    const r = view.rows.find(x => x.seat === seat);
    if (!r || r.status === 'empty') {
      out.push({ seat, empty: true, title: '빈 고개', count: '', danger: false, status: '', mark: null, progress: null, me: false });
      continue;
    }
    const me = seat === view.me.seat;
    const spirit = r.status === 'spirit';
    const current = view.yeoksin !== null && view.yeoksin.seat === seat;
    out.push({
      seat, empty: false,
      title: `${seat} ${r.name}${me ? ' · 나' : ''}`,
      count: spirit ? '–' : String(r.count),
      danger: !spirit && r.count >= coop.danger,
      status: statusOf(view, data, r),
      mark: current ? 'current' : null,
      progress: current ? Math.min(1, Math.max(0, (view.clock.tick - view.yeoksin!.enterTick + 1) / stayTicks)) : null,
      me,
    });
  }
  return out;
}

const STAGE_NAME = ['', '첫째', '둘째'];

export function topModel(view: ClientView, data: GameData): TopModel {
  const coop = data.coop!;
  const clock = view.clock;
  const left = secondsOf(clock.roundEndTick - clock.tick);
  const mine = view.rows.find(r => r.seat === view.me.seat);
  let line1: string;
  if (clock.phase === 'prep') line1 = `준비 · 남은 ${left}초`;
  else {
    line1 = `${clock.round} / ${data.balance.rounds} 라운드 · 남은 ${left}초`;
    if (mine?.status === 'spirit') line1 += ' · 관전 중';
    else {
      line1 += ` · 내 잡귀 ${mine?.count ?? 0} / ${data.balance.limit}`;
      if (mine && mine.count > data.balance.limit) line1 += ` · 초과 ${secondsOf(limitTicks(data) - mine.overLimitTicks)}초`;
    }
  }

  const stages = coop.yeoksin.length;
  const gate = view.gate.stage;
  const def = coop.yeoksin.find(s => s.stage === gate);
  let line2: string;
  if (!def) line2 = '관문 통과';
  else if (view.yeoksin) {
    line2 = `관문 ${gate}/${stages} · ${def.deadlineRound}라운드 끝까지 · 역신 ${STAGE_NAME[view.yeoksin.stage] ?? ''} 탈 ${view.yeoksin.hp.toLocaleString('ko-KR')} / ${view.yeoksin.maxHp.toLocaleString('ko-KR')}`;
  } else line2 = `관문 ${gate}/${stages} · ${def.startRound}라운드에 역신 등장`;

  let myTurn: string | null = null;
  const y = view.yeoksin;
  if (y) {
    const cur = y.seat === view.me.seat;
    const next = y.nextSeat === view.me.seat;
    if (cur && next) myTurn = '내 고개 순환';
    else if (next) myTurn = `다음은 내 고개 · ${secondsOf(y.enterTick + coop.staySeconds * TICKS_PER_SECOND - clock.tick)}초`;
  }
  return { line1, line2, myTurn };
}

interface Notice { text: string; at: number }
let active: Notice[] = [];
const seen = new WeakSet<object>();

/**
 * "N번 넋이 엽전 +5" for 3 seconds after a support arrives. `mine` messages replace supportIn on
 * the next change, so arrivals are remembered here instead of read from the view each time.
 */
export function rightNotices(view: ClientView, now: number): string[] {
  const incoming = view.mine.supportIn;
  if (incoming.length > 0 && !seen.has(incoming)) {
    seen.add(incoming);
    for (const s of incoming) active.push({ text: `${s.from}번 넋이 엽전 +${s.coins}`, at: now });
  }
  active = active.filter(n => now - n.at <= NOTICE_MS);
  return active.map(n => n.text);
}
