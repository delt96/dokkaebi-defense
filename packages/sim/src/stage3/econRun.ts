import {
  createMatch, economyVariant, laneSeed, roundStartTick, stepMatch, unitDefFast, waveOf,
  type EconSection, type GameData, type GameState, type GeneralQuestId, type MatchCommand, type MatchState,
} from '@dorandi/logic';
import { EconDriver } from './econDriver';
import { switchBot, synergyBot, type EconPolicy } from './econBot';
import { clumsyBot, normalBot, type Bot } from '../bots';
import { targetBot } from './targetBot';
import { quantile } from './report';

export type EconBotKind = 'clumsy' | 'normal' | 'target' | 'switch' | 'synergy';
export const ECON_BOTS: EconBotKind[] = ['clumsy', 'normal', 'target', 'switch', 'synergy'];

export interface EconConfig {
  name: string; bot: EconBotKind; noDefeat: boolean;
  market: boolean; quests: 0 | 2 | 4; story: boolean; tame: boolean; transfer: boolean;
}
export interface EconRow {
  seed: number; config: string; bot: string; seat: number; finished: boolean; teamOutcome: string; endRound: number;
  grade6AtFinal: number; grade6AtEnd: number; hidden: number; coinsAtFinal: number; buckwheatAtFinal: number;
  firstGrade6Round: number | null; firstSource: 'combine' | 'story' | null;
  storyOffers: number; storyAward: number;
  buckwheat9Round: number | null; buckwheat12Round: number | null; coins180Round: number | null; coins240Round: number | null;
  bundles: number; jars: number; questWins: string; tames: number; transfersSent: number; transfersReceived: number;
  sold: number; missingAtEnd: string; yeoksinKills: number;
  boss10: number | null; boss20: number | null; boss30: number | null; boss40: number | null; boss50: number | null; boss60: number | null;
}

const BOSS_ROUNDS = [10, 20, 30, 40, 50, 60] as const;
type BossCol = `boss${(typeof BOSS_ROUNDS)[number]}`;

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

const QUESTS: GeneralQuestId[] = ['mission', 'collection', 'team', 'ssireum'];
const PAIRS: GeneralQuestId[][] = [];
for (let i = 0; i < QUESTS.length; i++) for (let j = i + 1; j < QUESTS.length; j++) PAIRS.push([QUESTS[i]!, QUESTS[j]!]);

/** For "quests 2": the six pairs of the four general quests, cycled by seed. */
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
    market: c.market, drops: c.market, story: c.story, tame: c.tame, shadow: c.tame, transfer: c.transfer,
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
  const policy: EconPolicy = { market: c.market, quests: c.quests > 0 || c.story, tame: c.tame };
  const bots: RunBot[] = SEATS.map(s => makeBot(c.bot, laneSeed(seed, s), policy));
  const driver = new EconDriver(match, bots, { transfer: c.transfer });
  const finalTick = roundStartTick(d, d.balance.rounds);
  const rows = new Map<number, EconRow>();
  const prev = new Map<number, { coins: number; buckwheat: number }>();
  const earned = new Map<number, { coins: number; buckwheat: number }>();
  for (const s of SEATS) {
    rows.set(s, {
      seed, config: c.name, bot: c.bot, seat: s, finished: false, teamOutcome: '', endRound: 0,
      grade6AtFinal: 0, grade6AtEnd: 0, hidden: 0, coinsAtFinal: 0, buckwheatAtFinal: 0, firstGrade6Round: null, firstSource: null, storyOffers: 0, storyAward: 0,
      buckwheat9Round: null, buckwheat12Round: null, coins180Round: null, coins240Round: null,
      bundles: 0, jars: 0, questWins: '', tames: 0, transfersSent: 0, transfersReceived: 0, sold: 0, missingAtEnd: '', yeoksinKills: 0,
      boss10: null, boss20: null, boss30: null, boss40: null, boss50: null, boss60: null,
    });
    prev.set(s, { coins: 0, buckwheat: 0 });
    earned.set(s, { coins: 0, buckwheat: 0 });
  }
  const wins = new Map<number, Set<string>>(SEATS.map(s => [s, new Set<string>()]));
  const yeoksinSpawn = new Map<number, number>();
  const yeoksinSeconds: (number | null)[] = (d.coop?.yeoksin ?? []).map(() => null);

  while (match.result === null && match.tick < MAX_TICKS) {
    if (c.noDefeat) dropTimedOutBosses(match);
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
      else if (e.type === 'transferEnd' && e.outcome === 'accepted') { rows.get(e.from)!.transfersSent++; rows.get(e.to)!.transfersReceived++; }
    }
    for (const [key, step] of Object.entries(r.lanes)) {
      const s = Number(key);
      const row = rows.get(s)!;
      const lane = match.lanes[s]!;
      const story = step.events.some(e => e.type === 'storyEnd' && e.reason === 'award');
      for (const e of step.events) {
        if (e.type === 'buy') { if (e.item === 'bundle') row.bundles++; else row.jars++; }
        else if (e.type === 'tame') row.tames++;
        else if (e.type === 'questReward') wins.get(s)!.add(e.quest);
        else if ((e.type === 'combine' || e.type === 'summon') && row.firstGrade6Round === null && isNormal6(lane, e.defId)) {
          row.firstGrade6Round = match.round;
          row.firstSource = story && e.type === 'summon' ? 'story' : 'combine';
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
    row.hidden = countHidden(lane);
    row.storyOffers = lane.econ?.story.offers ?? 0;
    row.storyAward = lane.econ?.story.awarded ? 1 : 0;
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
    '| 설정 | 봇 | 완주자/참가 | 0 | 1 | 2 | 3 | 4 | 5+ | 3~4기 | 미완성 | 보유 중앙값 | 첫 완성 중앙값 | 늦은 10% | 설화 수령 | 묵 9 / 12 | 엽전 180 / 240 | 팀 클리어 | 판정 |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | --- |',
  ];
  const configs = [...new Set(rows.map(r => r.config))];
  for (const name of configs) {
    const rs = rows.filter(r => r.config === name);
    const s = econSummary(rs);
    const fin = rs.filter(r => r.finished);
    const seeds = [...new Set(rs.map(r => r.seed))];
    const clears = seeds.filter(seed => rs.find(r => r.seed === seed)!.teamOutcome === 'clear').length;
    const story = fin.length ? fin.filter(r => r.storyAward).length / fin.length : 0;
    out.push(`| ${name} | ${rs[0]!.bot} | ${s.finishers}/${rs.length} | ${s.dist.join(' | ')} | ${pct(s.share34)} | ${pct(s.neverRate)} | ${s.medianCount ?? '-'} | ${rnd(s.median)} | ${rnd(s.p90)} | ${pct(story)} | ${medRound(fin.map(r => r.buckwheat9Round))} / ${medRound(fin.map(r => r.buckwheat12Round))} | ${medRound(fin.map(r => r.coins180Round))} / ${medRound(fin.map(r => r.coins240Round))} | ${clears}/${seeds.length} | ${s.pass ? '합격' : '미달'} |`);
  }
  if (yeoksin.length && data?.coop) {
    out.push('', '| 역신 관문 | 처치 판 수 | 처치 시간 중앙값(초) | 제한 시간(초) | 제한 대비 |', '| --- | ---: | ---: | ---: | ---: |');
    data.coop.yeoksin.forEach((y, i) => {
      const times = yeoksin.map(t => t[i]).filter((x): x is number => x !== null && x !== undefined);
      const limit = (roundStartTick(data, y.deadlineRound + 1) - roundStartTick(data, y.startRound)) / 20;
      const med = quantile(times, 0.5);
      out.push(`| ${y.stage} (${y.startRound}~${y.deadlineRound}R) | ${times.length}/${yeoksin.length} | ${med ?? '-'} | ${limit} | ${med === null ? '-' : pct(med / limit)} |`);
    });
  }
  return out.join('\n');
}

const cfg = (bot: EconBotKind, name: string, x: Omit<EconConfig, 'name' | 'bot' | 'noDefeat'>): EconConfig =>
  ({ name: `${bot}-${name}`, bot, noDefeat: false, ...x });

export const STANDARD_CONFIGS: EconConfig[] = ECON_BOTS.flatMap(bot => [
  cfg(bot, 'base', { market: false, quests: 0, story: false, tame: false, transfer: false }),
  cfg(bot, 'market', { market: true, quests: 0, story: false, tame: false, transfer: false }),
  cfg(bot, 'quests4', { market: false, quests: 4, story: true, tame: false, transfer: false }),
  cfg(bot, 'full', { market: true, quests: 4, story: true, tame: true, transfer: true }),
  cfg(bot, 'full-q2', { market: true, quests: 2, story: true, tame: true, transfer: true }),
]);

const NUMBER_COLS = new Set([
  'seed', 'seat', 'endRound', 'grade6AtFinal', 'grade6AtEnd', 'hidden', 'coinsAtFinal', 'buckwheatAtFinal', 'firstGrade6Round', 'storyOffers', 'storyAward',
  'buckwheat9Round', 'buckwheat12Round', 'coins180Round', 'coins240Round', 'bundles', 'jars', 'tames', 'transfersSent',
  'transfersReceived', 'sold', 'yeoksinKills', 'boss10', 'boss20', 'boss30', 'boss40', 'boss50', 'boss60',
]);
const NULLABLE_COLS = new Set([
  'firstGrade6Round', 'firstSource', 'buckwheat9Round', 'buckwheat12Round', 'coins180Round', 'coins240Round',
  'boss10', 'boss20', 'boss30', 'boss40', 'boss50', 'boss60',
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
      else if (c === 'finished') row[c] = v === 'true';
      else row[c] = v;
    });
    return row as unknown as EconRow;
  });
}

export function parseYeoksinCsv(text: string): (number | null)[][] {
  const lines = text.split('\n').filter(l => l.length);
  return lines.slice(1).map(l => l.split(',').slice(1).map(v => (v === '' ? null : Number(v))));
}
