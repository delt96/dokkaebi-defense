import {
  createMatch, economyVariant, laneSeed, missingMaterials, roundStartTick, stepMatch, unitDefFast, waveOf,
  type EconSection, type GameData, type GameState, type GeneralQuestId, type MatchCommand, type MatchState,
} from '@dorandi/logic';
import { EconDriver } from './econDriver';
import { switchBot, synergyBot, type EconPolicy } from './econBot';
import { clumsyBot, normalBot, type Bot } from '../bots';
import { targetBot } from './targetBot';
import { jigeIncidence, quantile, seatSpread, timeoutMedian } from './report';

export type EconBotKind = 'clumsy' | 'normal' | 'target' | 'switch' | 'synergy';
export const ECON_BOTS: EconBotKind[] = ['clumsy', 'normal', 'target', 'switch', 'synergy'];

export interface EconConfig {
  name: string; bot: EconBotKind; noDefeat: boolean;
  market: boolean; quests: 0 | 2 | 4; tame: boolean;
  /** Whether the bots spend 지게 (the grants come either way). */
  useJige: boolean;
  /** 격파 targets in the rules and summoned by the bots (missing: on). */
  hunts?: boolean;
  gamble?: boolean;
}
export interface EconRow {
  seed: number; config: string; bot: string; seat: number; finished: boolean; teamOutcome: string; endRound: number;
  grade6AtFinal: number; grade6AtEnd: number; hidden: number; coinsAtFinal: number; buckwheatAtFinal: number;
  firstGrade6Round: number | null; firstSource: 'combine' | 'gamble' | null;
  buckwheat9Round: number | null; buckwheat12Round: number | null; coins180Round: number | null; coins240Round: number | null;
  draws: number; questWins: string; tames: number;
  /** 지게 received, spent and still held at the end; paid tame attempts (successes included). */
  jigeGrants: number; jigeUses: number; jigeHeld: number; tameTries: number;
  /** 묵 after each ten-round settlement (null: the seat was out before it); 묵 just before R60 combat. */
  muk10: number | null; muk20: number | null; muk30: number | null; muk40: number | null; muk50: number | null; muk60: number | null;
  /** Ever had every material and the coins for a final grade 6 combine but not the 묵. */
  mukBlocked: boolean;
  /** 격파: kills, time-outs, the highest level killed and the 묵 they paid. */
  huntKills: number; huntFled: number; huntBest: number; huntMuk: number;
  /** Each kill as enemy:level, joined with '+'. */
  huntWins?: string;
  coinBet?: number; coinPayout?: number; unitMuk?: number; unitConsolation?: number;
  /** Archived CSV columns for the old coin-priced unit tables. */
  unitBet?: number; unitRefund?: number;
  gambleMiss?: number; gamble3?: number; gamble4?: number; gamble5?: number; gamble6?: number; gambleHidden?: number;
  smallPlays?: number; bigPlays?: number;
  sold: number; missingAtEnd: string; yeoksinKills: number;
  boss10: number | null; boss20: number | null; boss30: number | null; boss40: number | null; boss50: number | null; boss60: number | null;
}

const BOSS_ROUNDS = [10, 20, 30, 40, 50, 60] as const;
type BossCol = `boss${(typeof BOSS_ROUNDS)[number]}`;
type MukCol = `muk${(typeof BOSS_ROUNDS)[number]}`;

type RunBot = Bot & { currentTarget?(): string | null };

function makeBot(kind: EconBotKind, seed: number, policy: EconPolicy): RunBot {
  switch (kind) {
    case 'clumsy': return clumsyBot(seed);
    case 'normal': return normalBot();
    case 'switch': return switchBot(seed, policy);
    case 'synergy': return synergyBot(seed, policy);
    default: return targetBot(seed, { policy });
  }
}

const QUESTS: GeneralQuestId[] = ['collection', 'team', 'ssireum'];
const PAIRS: GeneralQuestId[][] = [];
for (let i = 0; i < QUESTS.length; i++) for (let j = i + 1; j < QUESTS.length; j++) PAIRS.push([QUESTS[i]!, QUESTS[j]!]);

/** For "quests 2": the three pairs of the three general quests, cycled by seed. */
export function questPair(seed: number): GeneralQuestId[] {
  return [...PAIRS[(((seed - 1) % PAIRS.length) + PAIRS.length) % PAIRS.length]!];
}

/**
 * Economy sections a config switches off. Boss drops ride with the market (both are "extra material"), the shadow with
 * taming (it is a tame target), so `base` carries no economy income at all.
 */
export function configData(data: GameData, c: EconConfig, seed: number): GameData {
  const quests = c.quests === 4 ? QUESTS : c.quests === 2 ? questPair(seed) : [];
  const on: Partial<Record<EconSection, boolean>> = {
    market: c.market, drops: c.market, tame: c.tame, shadow: c.tame, hunts: c.hunts !== false,
  };
  for (const q of QUESTS) on[q] = quests.includes(q);
  const d = economyVariant(data, on);
  if (c.noDefeat) d.balance.limit = 1e9;
  return d;
}

const SEATS = [1, 2, 3, 4, 5, 6];
const MAX_TICKS = 400_000;

const isNormal6 = (state: GameState, defId: string) => {
  const def = unitDefFast(state.data, defId);
  return def.grade === 6 && !def.hidden;
};
const count6 = (lane: GameState) => lane.slots.filter(u => u && isNormal6(lane, u.defId)).length;
const countHidden = (lane: GameState) => lane.slots.filter(u => u && unitDefFast(lane.data, u.defId).hidden).length;

/** Lane bosses still alive when their round runs out leave without reward (no-defeat runs only). */
function dropTimedOutBosses(match: MatchState): void {
  if (match.phase !== 'round' || match.tick !== match.roundEndTick) return;
  for (const s of match.ring) {
    const lane = match.lanes[s]!;
    if (!match.seats[s]!.alive || waveOf(lane, match.round).type !== 'boss') continue;
    if (!lane.enemies.some(e => e.boss && e.hp > 0)) continue;
    lane.enemies = lane.enemies.filter(e => !(e.boss && e.hp > 0));
    const clock = match.seats[s]!.bosses[match.round];
    if (clock && clock.status === 'fighting') clock.status = 'failed';
  }
}

/** Plays one six-seat stage 3 match with every seat on the same bot kind and reports a row per seat. */
export function econMatchRun(data: GameData, seed: number, c: EconConfig): { rows: EconRow[]; yeoksinSeconds: (number | null)[] } {
  const d = configData(data, c, seed);
  const match = createMatch(d, seed, SEATS, { noElimination: c.noDefeat, noGate: c.noDefeat });
  const policy: EconPolicy = { market: c.market, quests: c.quests > 0, tame: c.tame, jige: c.useJige, hunts: c.hunts !== false };
  const bots: RunBot[] = SEATS.map(s => makeBot(c.bot, laneSeed(seed, s), policy));
  const driver = new EconDriver(match, bots, c.gamble);
  const finalTick = roundStartTick(d, d.balance.rounds);
  const rows = new Map<number, EconRow>();
  const prev = new Map<number, { coins: number; buckwheat: number }>();
  const earned = new Map<number, { coins: number; buckwheat: number }>();
  for (const s of SEATS) {
    rows.set(s, {
      seed, config: c.name, bot: c.bot, seat: s, finished: false, teamOutcome: '', endRound: 0,
      grade6AtFinal: 0, grade6AtEnd: 0, hidden: 0, coinsAtFinal: 0, buckwheatAtFinal: 0, firstGrade6Round: null, firstSource: null,
      buckwheat9Round: null, buckwheat12Round: null, coins180Round: null, coins240Round: null,
      draws: 0, questWins: '', tames: 0, jigeGrants: 0, jigeUses: 0, jigeHeld: 0, tameTries: 0,
      muk10: null, muk20: null, muk30: null, muk40: null, muk50: null, muk60: null, mukBlocked: false,
      huntKills: 0, huntFled: 0, huntBest: 0, huntMuk: 0, huntWins: '', sold: 0, missingAtEnd: '', yeoksinKills: 0,
      ...(c.gamble && { coinBet: 0, coinPayout: 0, unitMuk: 0, unitConsolation: 0,
        gambleMiss: 0, gamble3: 0, gamble4: 0, gamble5: 0, gamble6: 0, gambleHidden: 0, smallPlays: 0, bigPlays: 0 }),
      boss10: null, boss20: null, boss30: null, boss40: null, boss50: null, boss60: null,
    });
    prev.set(s, { coins: 0, buckwheat: 0 });
    earned.set(s, { coins: 0, buckwheat: 0 });
  }
  const wins = new Map<number, Set<string>>(SEATS.map(s => [s, new Set<string>()]));
  const yeoksinSpawn = new Map<number, number>();
  const yeoksinSeconds: (number | null)[] = (d.coop?.yeoksin ?? []).map(() => null);

  const checkpoints = new Map(BOSS_ROUNDS.slice(0, -1).map(r => [roundStartTick(d, r + 1), r]));
  const finals = d.recipes.filter(x => unitDefFast(d, x.result).grade === 6);
  while (match.result === null && match.tick < MAX_TICKS) {
    if (c.noDefeat) dropTimedOutBosses(match);
    const settled = checkpoints.get(match.tick);
    if (settled !== undefined) {
      for (const s of SEATS) if (match.seats[s]!.alive) rows.get(s)![`muk${settled}` as MukCol] = match.lanes[s]!.buckwheat;
    }
    if (match.tick % 10 === 0) {
      for (const s of SEATS) {
        const row = rows.get(s)!;
        const lane = match.lanes[s]!;
        if (row.mukBlocked || !match.seats[s]!.alive || lane.buckwheat >= 1) continue;
        row.mukBlocked = finals.some(x => lane.coins >= (x.cost?.coins ?? 0) && missingMaterials(lane, x.result).length === 0);
      }
    }
    if (match.tick === finalTick) {
      for (const s of SEATS) {
        const row = rows.get(s)!;
        const lane = match.lanes[s]!;
        row.grade6AtFinal = count6(lane);
        row.coinsAtFinal = lane.coins;
        row.buckwheatAtFinal = lane.buckwheat;
      }
    }
    const inputs = driver.inputs();
    const cmdBySeq = new Map<string, MatchCommand>(inputs.map(i => [`${i.seat}:${i.seq}`, i.cmd]));
    const r = stepMatch(match, inputs);
    for (const a of r.acks) if (a.ok && cmdBySeq.get(`${a.seat}:${a.seq}`)?.type === 'sell') rows.get(a.seat)!.sold++;
    for (const e of r.events) {
      if (e.type === 'yeoksinSpawn') yeoksinSpawn.set(e.stage, r.tick);
      else if (e.type === 'yeoksinKilled') yeoksinSeconds[e.stage - 1] = (r.tick - (yeoksinSpawn.get(e.stage) ?? r.tick)) / 20;
    }
    for (const [key, step] of Object.entries(r.lanes)) {
      const s = Number(key);
      const row = rows.get(s)!;
      const lane = match.lanes[s]!;
      for (const e of step.events) {
        if (e.type === 'buy') { row.draws++; if (e.jige) row.jigeGrants++; }
        else if (e.type === 'gambleCoins') {
          row.coinBet = (row.coinBet ?? 0) + e.stake;
          row.coinPayout = (row.coinPayout ?? 0) + e.payout;
        } else if (e.type === 'gambleUnit') {
          row.unitMuk = (row.unitMuk ?? 0) + e.buckwheatCost;
          row.unitConsolation = (row.unitConsolation ?? 0) + e.consolation;
          const plays = e.table === 'small' ? 'smallPlays' : 'bigPlays';
          row[plays] = (row[plays] ?? 0) + 1;
          const hit = e.result === 0 ? 'gambleMiss' : e.result === 'hidden' ? 'gambleHidden' : `gamble${e.result}` as const;
          row[hit] = (row[hit] ?? 0) + 1;
          if (e.result === 6 && row.firstGrade6Round === null) {
            row.firstGrade6Round = match.round;
            row.firstSource = 'gamble';
          }
        }
        else if (e.type === 'jigeSwap') row.jigeUses++;
        else if (e.type === 'tameTry') row.tameTries++;
        else if (e.type === 'tame') row.tames++;
        else if (e.type === 'questReward') wins.get(s)!.add(e.quest);
        else if (e.type === 'hunt' && e.outcome === 'won') {
          row.huntKills++;
          row.huntMuk += e.buckwheat;
          row.huntBest = Math.max(row.huntBest, e.level);
          const win = `${e.enemy}:${e.level}`;
          row.huntWins = row.huntWins ? `${row.huntWins}+${win}` : win;
        }
        else if (e.type === 'hunt') row.huntFled++;
        else if ((e.type === 'combine' || e.type === 'summon') && row.firstGrade6Round === null && isNormal6(lane, e.defId)) {
          row.firstGrade6Round = match.round;
          row.firstSource = 'combine';
        }
      }
    }
    for (const s of SEATS) {
      const lane = match.lanes[s]!;
      if (!match.seats[s]!.alive) continue;
      const p = prev.get(s)!;
      const acc = earned.get(s)!;
      const row = rows.get(s)!;
      acc.coins += Math.max(0, lane.coins - p.coins);
      acc.buckwheat += Math.max(0, lane.buckwheat - p.buckwheat);
      prev.set(s, { coins: lane.coins, buckwheat: lane.buckwheat });
      if (acc.buckwheat >= 9) row.buckwheat9Round ??= match.round;
      if (acc.buckwheat >= 12) row.buckwheat12Round ??= match.round;
      if (acc.coins >= 180) row.coins180Round ??= match.round;
      if (acc.coins >= 240) row.coins240Round ??= match.round;
    }
  }

  const result = match.result;
  SEATS.forEach((s, i) => {
    const row = rows.get(s)!;
    const lane = match.lanes[s]!;
    const st = match.seats[s]!;
    const seatResult = result?.seats.find(x => x.seat === s);
    row.finished = c.noDefeat ? st.alive : seatResult?.outcome === 'finished';
    row.teamOutcome = result?.outcome ?? 'timeout';
    row.endRound = seatResult?.round ?? match.round;
    row.grade6AtEnd = count6(lane);
    row.jigeHeld = lane.econ?.jige ?? 0;
    if (st.alive) row.muk60 = lane.buckwheat;
    row.hidden = countHidden(lane);
    row.questWins = [...wins.get(s)!].sort().join('+');
    row.yeoksinKills = match.yeoksinKills;
    for (const r of BOSS_ROUNDS) row[`boss${r}` as BossCol] = lane.stats.find(x => x.round === r)?.bossKillSeconds ?? null;
    const target = bots[i]!.currentTarget?.() ?? null;
    if (target && st.alive) {
      const recipe = d.recipes.find(x => x.result === target);
      const held = new Map<string, number>();
      for (const u of lane.slots) if (u) held.set(u.defId, (held.get(u.defId) ?? 0) + 1);
      row.missingAtEnd = (recipe?.materials ?? []).filter(m => {
        const n = held.get(m) ?? 0;
        if (n > 0) { held.set(m, n - 1); return false; }
        return true;
      }).join('+');
    }
  });
  return { rows: SEATS.map(s => rows.get(s)!), yeoksinSeconds };
}

export interface EconSummary {
  finishers: number; dist: number[]; share34: number; neverRate: number;
  median: number | null; p90: number | null; medianCount: number | null; pass: boolean;
}

/** Pass line of draft 8, judged on finishers only. */
export function econSummary(rows: EconRow[]): EconSummary {
  const fin = rows.filter(r => r.finished);
  const dist = [0, 0, 0, 0, 0, 0];
  for (const r of fin) dist[Math.min(5, r.grade6AtFinal)]!++;
  const n = fin.length;
  const share34 = n ? (dist[3]! + dist[4]!) / n : 0;
  const neverRate = n ? fin.filter(r => r.firstGrade6Round === null).length / n : 0;
  const pick = (p: number) => {
    const v = quantile(fin.map(r => r.firstGrade6Round ?? Infinity), p);
    return v === null || !Number.isFinite(v) ? null : v;
  };
  const medianCount = quantile(fin.map(r => r.grade6AtFinal), 0.5);
  const pass = n > 0 && share34 >= 0.7 && neverRate <= 0.05 && medianCount !== null && medianCount >= 3 && medianCount <= 4;
  return { finishers: n, dist, share34, neverRate, median: pick(0.5), p90: pick(0.9), medianCount, pass };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const rnd = (v: number | null) => (v === null ? '없음' : `R${v}`);
const medRound = (xs: (number | null)[]) => {
  const v = quantile(xs.map(x => x ?? Infinity), 0.5);
  return v === null || !Number.isFinite(v) ? '없음' : `R${v}`;
};

export function econMarkdown(rows: EconRow[], yeoksin: (number | null)[][], data?: GameData): string {
  const out = [
    '| 설정 | 봇 | 완주자/참가 | 0 | 1 | 2 | 3 | 4 | 5+ | 3~4기 | 미완성 | 보유 중앙값 | 첫 완성 중앙값 | 늦은 10% | 묵 9 / 12 | 엽전 180 / 240 | 팀 클리어 | 판정 |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | --- |',
  ];
  const configs = [...new Set(rows.map(r => r.config))];
  for (const name of configs) {
    const rs = rows.filter(r => r.config === name);
    const s = econSummary(rs);
    const fin = rs.filter(r => r.finished);
    const seeds = [...new Set(rs.map(r => r.seed))];
    const clears = seeds.filter(seed => rs.find(r => r.seed === seed)!.teamOutcome === 'clear').length;
    out.push(`| ${name} | ${rs[0]!.bot} | ${s.finishers}/${rs.length} | ${s.dist.join(' | ')} | ${pct(s.share34)} | ${pct(s.neverRate)} | ${s.medianCount ?? '-'} | ${rnd(s.median)} | ${rnd(s.p90)} | ${medRound(fin.map(r => r.buckwheat9Round))} / ${medRound(fin.map(r => r.buckwheat12Round))} | ${medRound(fin.map(r => r.coins180Round))} / ${medRound(fin.map(r => r.coins240Round))} | ${clears}/${seeds.length} | ${s.pass ? '합격' : '미달'} |`);
  }
  out.push('', '| 설정 | 판당 보따리 평균 | 0회 자리 | 18회 자리 | 18회 중 지게 받음 | 지게 사용 평균 | 남은 지게 평균 | 유료 길들이기 평균 | 묵 R10 / 20 / 30 / 40 / 50 / 60 중앙값 (표본) | 최종 조합 묵 막힘 | 자리 간 SD |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |');
  for (const name of configs) {
    const rs = rows.filter(r => r.config === name);
    const mean = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '-');
    const inc = jigeIncidence(rs);
    const muk = BOSS_ROUNDS.map(r => {
      const xs = rs.map(x => x[`muk${r}` as MukCol]).filter((v): v is number => v !== null);
      return `${quantile(xs, 0.5) ?? '-'} (${xs.length})`;
    }).join(' / ');
    const sd = seatSpread(rs);
    out.push(`| ${name} | ${mean(rs.map(r => r.draws))} | ${rs.filter(r => r.draws === 0).length} | ${rs.filter(r => r.draws === 18).length} | ${inc.seats ? `${inc.withJige}/${inc.seats} (${pct(inc.withJige / inc.seats)})` : '0명'} | ${mean(rs.map(r => r.jigeUses))} | ${mean(rs.map(r => r.jigeHeld))} | ${mean(rs.map(r => r.tameTries))} | ${muk} | ${pct(rs.filter(r => r.mukBlocked).length / rs.length)} | ${sd === null ? '-' : sd.toFixed(2)} |`);
  }
  if (rows.some(r => (r.huntKills ?? 0) + (r.huntFled ?? 0) > 0)) {
    out.push('', '| 설정 | 격파 처치 평균 (자리당) | 시간 초과 평균 | 최고 단계 중앙값 / 최대 | 격파로 받은 묵 평균 |', '| --- | ---: | ---: | --- | ---: |');
    for (const name of configs) {
      const rs = rows.filter(r => r.config === name);
      const mean = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '-');
      const best = rs.map(r => r.huntBest ?? 0);
      out.push(`| ${name} | ${mean(rs.map(r => r.huntKills ?? 0))} | ${mean(rs.map(r => r.huntFled ?? 0))} | ${quantile(best, 0.5) ?? '-'} / ${Math.max(0, ...best)} | ${mean(rs.map(r => r.huntMuk ?? 0))} |`);
    }
  }
  if (rows.some(r => r.coinBet !== undefined)) {
    out.push('', '| 설정 | 돈 도박 베팅 / 지급 (냥) | 유닛 도박 지출 / 꽝 위로금 | 작은 판 / 큰 판 | 꽝 / 3 / 4 / 5 / 6 / 숨은 유닛 |',
      '| --- | ---: | ---: | ---: | ---: |');
    for (const name of configs) {
      const rs = rows.filter(r => r.config === name);
      const sum = (...keys: (keyof EconRow)[]) => keys.map(k => rs.reduce((n, r) => n + Number(r[k] ?? 0), 0)).join(' / ');
      const unitFlow = rs.some(r => r.unitBet !== undefined)
        ? `${sum('unitBet', 'unitRefund')}냥 (환급)`
        : `${sum('unitMuk')}묵 / ${sum('unitConsolation')}냥`;
      out.push(`| ${name} | ${sum('coinBet', 'coinPayout')} | ${unitFlow} | ${sum('smallPlays', 'bigPlays')} | ${sum('gambleMiss', 'gamble3', 'gamble4', 'gamble5', 'gamble6', 'gambleHidden')} |`);
    }
  }
  if (yeoksin.length && data?.coop) {
    out.push('', '| 역신 관문 | 처치 판 수 | 처치 시간 중앙값(초, 미처치는 제한) | 제한 시간(초) | 제한 대비 |', '| --- | ---: | ---: | ---: | ---: |');
    data.coop.yeoksin.forEach((y, i) => {
      const samples = yeoksin.map(t => t[i] ?? null);
      const killed = samples.filter(x => x !== null).length;
      const limit = (roundStartTick(data, y.deadlineRound + 1) - roundStartTick(data, y.startRound)) / 20;
      const med = timeoutMedian(samples, limit);
      out.push(`| ${y.stage} (${y.startRound}~${y.deadlineRound}R) | ${killed}/${yeoksin.length} | ${med ?? '-'} | ${limit} | ${med === null ? '-' : pct(med / limit)} |`);
    });
  }
  return out.join('\n');
}

const cfg = (bot: EconBotKind, name: string, x: Omit<EconConfig, 'name' | 'bot' | 'noDefeat'>): EconConfig =>
  ({ name: `${bot}-${name}`, bot, noDefeat: false, ...x });

export const STANDARD_CONFIGS: EconConfig[] = ECON_BOTS.flatMap(bot => [
  cfg(bot, 'base', { market: false, quests: 0, tame: false, useJige: false }),
  cfg(bot, 'market', { market: true, quests: 0, tame: false, useJige: true }),
  cfg(bot, 'quests4', { market: false, quests: 4, tame: false, useJige: false }),
  cfg(bot, 'full', { market: true, quests: 4, tame: true, useJige: true }),
  cfg(bot, 'full-q2', { market: true, quests: 2, tame: true, useJige: true }),
]);

const NUMBER_COLS = new Set([
  'coinBet', 'coinPayout', 'unitMuk', 'unitConsolation', 'unitBet', 'unitRefund',
  'gambleMiss', 'gamble3', 'gamble4', 'gamble5', 'gamble6', 'gambleHidden', 'smallPlays', 'bigPlays',
  'seed', 'seat', 'endRound', 'grade6AtFinal', 'grade6AtEnd', 'hidden', 'coinsAtFinal', 'buckwheatAtFinal', 'firstGrade6Round', 
  'buckwheat9Round', 'buckwheat12Round', 'coins180Round', 'coins240Round', 'draws', 'tames', 'jigeGrants', 'jigeUses', 'jigeHeld', 'tameTries',
  'muk10', 'muk20', 'muk30', 'muk40', 'muk50', 'muk60', 'huntKills', 'huntFled', 'huntBest', 'huntMuk', 'sold', 'yeoksinKills', 'boss10', 'boss20', 'boss30', 'boss40', 'boss50', 'boss60',
]);
const NULLABLE_COLS = new Set([
  'firstGrade6Round', 'firstSource', 'buckwheat9Round', 'buckwheat12Round', 'coins180Round', 'coins240Round',
  'boss10', 'boss20', 'boss30', 'boss40', 'boss50', 'boss60', 'muk10', 'muk20', 'muk30', 'muk40', 'muk50', 'muk60',
]);

/** Reads back rows written by `toCsvRows` (no field contains a comma). */
export function parseEconCsv(text: string): EconRow[] {
  const lines = text.split('\n').filter(l => l.length);
  const cols = lines[0]!.split(',');
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const row: Record<string, unknown> = {};
    cols.forEach((c, i) => {
      const v = cells[i] ?? '';
      if (v === '' && NULLABLE_COLS.has(c)) row[c] = null;
      else if (NUMBER_COLS.has(c)) row[c] = Number(v);
      else if (c === 'finished' || c === 'mukBlocked') row[c] = v === 'true';
      else row[c] = v;
    });
    return row as unknown as EconRow;
  });
}

export function parseYeoksinCsv(text: string): (number | null)[][] {
  const lines = text.split('\n').filter(l => l.length);
  return lines.slice(1).map(l => l.split(',').slice(1).map(v => (v === '' ? null : Number(v))));
}
