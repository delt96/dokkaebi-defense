import { createMatch, laneSeed, roundStartTick, stepMatch, tameCheck, type GameData, type GameState } from '@dorandi/logic';
import type { Bot } from '../bots';
import { synergyBot } from './econBot';
import { EconDriver } from './econDriver';
import { configData, type EconConfig } from './econRun';
import { median } from './report';

const SEATS = [1, 2, 3, 4, 5, 6];
const R10 = 10;
const R20 = 20;
const RESERVE = 30;
/** The probe tries in the best band, as the measurement bots do. */
export const PROBE_HP = 0.15;

/** One seat of a paired R10 run: the treatment tried T on its 지네각시 (and whether it took), both arms' R10-20 combat ticks. */
export interface R10Pair {
  seed: number; seat: number; attempted: boolean; recruited: boolean;
  survivedTreatment: boolean; survivedControl: boolean;
  liveTicksTreatment: number; liveTicksControl: number;
}

/**
 * Wraps a bot so it keeps 30냥 back during round 10 until its decision, and (treatment only) pays one T on its
 * 지네각시 once that is at or under PROBE_HP, with 0묵 allowed. Later T is off in both arms (bot policy).
 */
function r10Bot(inner: Bot, treat: boolean, onTry: () => void): Bot {
  let decided = false;
  return {
    ...inner,
    decide(state: GameState) {
      if (state.round !== R10 || decided) return inner.decide(state);
      state.coins -= RESERVE;
      const cmds = inner.decide(state);
      state.coins += RESERVE;
      const boss = state.enemies.find(e => e.defId === 'jinegaksi' && e.hp > 0);
      if (boss && boss.hp <= boss.maxHp * PROBE_HP) {
        decided = true;
        if (treat && tameCheck(state, boss.id) === null) { onTry(); return [...cmds, { type: 'tame', enemyId: boss.id }]; }
      }
      return cmds;
    },
  };
}

function arm(data: GameData, seed: number, treat: boolean) {
  // taming stays in the rules (the treatment needs its target); the bots' own T policy is off in both arms
  const c: EconConfig = { name: 'r10', bot: 'synergy', noDefeat: false, market: true, quests: 2, tame: true, useJige: true };
  const d = configData(data, c, seed);
  const match = createMatch(d, seed, SEATS);
  const tried = new Set<number>();
  const bots = SEATS.map(s => r10Bot(synergyBot(laneSeed(seed, s), { quests: true, tame: false, jige: true }), treat, () => tried.add(s)));
  const driver = new EconDriver(match, bots);
  const from = roundStartTick(d, R10);
  const to = roundStartTick(d, R20 + 1);
  const live = new Map(SEATS.map(s => [s, 0]));
  const recruited = new Set<number>();
  while (match.result === null && match.tick < to) {
    const r = stepMatch(match, driver.inputs());
    for (const [key, step] of Object.entries(r.lanes)) for (const e of step.events) if (e.type === 'tame') recruited.add(Number(key));
    if (match.tick > from) for (const s of SEATS) if (match.seats[s]!.alive && match.lanes[s]!.enemies.some(e => e.hp > 0)) live.set(s, live.get(s)! + 1);
  }
  return { tried, recruited, live, alive: new Set(SEATS.filter(s => match.seats[s]!.alive)) };
}

export function r10PairRun(data: GameData, seed: number): R10Pair[] {
  const t = arm(data, seed, true);
  const c = arm(data, seed, false);
  return SEATS.map(seat => ({
    seed, seat, attempted: t.tried.has(seat), recruited: t.recruited.has(seat),
    survivedTreatment: t.alive.has(seat), survivedControl: c.alive.has(seat),
    liveTicksTreatment: t.live.get(seat)!, liveTicksControl: c.live.get(seat)!,
  }));
}

export interface R10Summary {
  seats: number; attempted: number; recruited: number; failed: number; unattempted: number; incomplete: number;
  pairs: number; medianCut: number | null; pass: boolean | null;
  survivalTreatment: number; survivalControl: number;
}

/** Paired median of (control − recruit) / control over recruits whose pair finished R20 on both sides; target ≤ 10%. */
export function r10Summary(rows: R10Pair[]): R10Summary {
  const recruits = rows.filter(r => r.recruited);
  const complete = recruits.filter(r => r.survivedTreatment && r.survivedControl && r.liveTicksControl > 0);
  const cut = median(complete.map(r => (r.liveTicksControl - r.liveTicksTreatment) / r.liveTicksControl));
  return {
    seats: rows.length, attempted: rows.filter(r => r.attempted).length, recruited: recruits.length,
    failed: rows.filter(r => r.attempted && !r.recruited).length, unattempted: rows.filter(r => !r.attempted).length,
    incomplete: recruits.length - complete.length, pairs: complete.length, medianCut: cut, pass: cut === null ? null : cut <= 0.1,
    survivalTreatment: rows.filter(r => r.survivedTreatment).length, survivalControl: rows.filter(r => r.survivedControl).length,
  };
}

export function r10Markdown(s: R10Summary): string {
  const pct = (x: number | null) => (x === null ? '-' : `${(x * 100).toFixed(1)}%`);
  return [
    '| 자리 | 시도 | 영입 | 실패 | 미시도 | 짝 불완전 | 비교 짝 | 시간 단축 중앙값 | 판정(≤10%) | R20 생존 (영입 판 / 대조) |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    `| ${s.seats} | ${s.attempted} | ${s.recruited} | ${s.failed} | ${s.unattempted} | ${s.incomplete} | ${s.pairs} | ${pct(s.medianCut)} | ${s.pass === null ? '표본 없음' : s.pass ? '합격' : '미달'} | ${s.survivalTreatment} / ${s.survivalControl} |`,
  ].join('\n');
}
