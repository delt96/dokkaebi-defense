import { createGame, enemyDefFast, step, unitDefFast, waveOf, type Command, type GameData } from '@dorandi/logic';
import type { Bot } from '../bots';
import { quantile } from './report';

export interface Grade6Row {
  seed: number; bot: string; noDefeat: boolean;
  firstGrade5Round: number | null; firstGrade6Round: number | null; grade6Count: number; grade6Ids: string[];
  buckwheatEarned: number; bossesKilled: number; bossesEscaped: number; endRound: number; outcome: string;
}

const DECIDE_EVERY = 10;
const MAX_TICKS = 400_000;

/**
 * Plays the 60-round stage 3 game with `bot` deciding every 10 ticks. With `noDefeat` the enemy limit is
 * lifted and a lane boss still alive at its round end is removed without reward, so every run reaches round 60.
 */
export function grade6Run(data: GameData, seed: number, bot: Bot, opts: { noDefeat: boolean }): Grade6Row {
  const d = opts.noDefeat ? structuredClone(data) : data;
  if (opts.noDefeat) d.balance.limit = 1e9;
  const state = createGame(d, seed);
  const row: Grade6Row = {
    seed, bot: bot.name, noDefeat: opts.noDefeat,
    firstGrade5Round: null, firstGrade6Round: null, grade6Count: 0, grade6Ids: [],
    buckwheatEarned: 0, bossesKilled: 0, bossesEscaped: 0, endRound: 0, outcome: '',
  };
  const bossIds = new Set<number>();
  while (state.phase !== 'ended' && state.tick < MAX_TICKS) {
    if (opts.noDefeat && state.phase === 'round' && state.tick >= state.roundEndTick && waveOf(state, state.round).type === 'boss') {
      const before = state.enemies.length;
      state.enemies = state.enemies.filter(e => !(e.boss && e.hp > 0));
      row.bossesEscaped += before - state.enemies.length;
    }
    const cmds: Command[] = state.tick % DECIDE_EVERY === 0 ? bot.decide(state) : [];
    const r = step(state, cmds);
    for (const e of r.events) {
      if (e.type === 'spawn' && enemyDefFast(d, e.defId).boss) bossIds.add(e.enemyId);
      else if (e.type === 'kill' && bossIds.has(e.enemyId)) row.bossesKilled++;
      else if (e.type === 'combine') {
        const g = unitDefFast(d, e.defId).grade;
        if (g === 5) row.firstGrade5Round ??= state.round;
        if (g === 6) {
          row.firstGrade6Round ??= state.round;
          row.grade6Count++;
          row.grade6Ids.push(e.defId);
        }
      }
    }
  }
  row.buckwheatEarned = row.bossesKilled * d.balance.bossBuckwheat;
  row.endRound = state.result?.round ?? state.round;
  row.outcome = state.result?.outcome ?? 'timeout';
  return row;
}

/** Median and late-10% first grade 6 round, counting runs that never made one as later than any round. */
export function grade6Summary(rows: Grade6Row[]): { median: number | null; p90: number | null; neverRate: number } {
  const rounds = rows.map(r => r.firstGrade6Round ?? Infinity);
  const pick = (p: number) => {
    const v = quantile(rounds, p);
    return v === null || !Number.isFinite(v) ? null : v;
  };
  return { median: pick(0.5), p90: pick(0.9), neverRate: rows.length ? rows.filter(r => r.firstGrade6Round === null).length / rows.length : 0 };
}

export function grade6Markdown(rows: Grade6Row[]): string {
  const out = [
    '| 봇 | 패배 | 판 수 | 첫 6등급 중앙값 | 늦은 10% | 미완성 비율 | 6등급 평균 수 | 첫 5등급 중앙값 | 받은 메밀묵 평균 | 보스 처치/놓침 평균 | 끝 라운드 중앙값 | 결과 |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  const keys = [...new Set(rows.map(r => `${r.bot}|${r.noDefeat}`))];
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  for (const k of keys) {
    const rs = rows.filter(r => `${r.bot}|${r.noDefeat}` === k);
    const s = grade6Summary(rs);
    const g5 = quantile(rs.map(r => r.firstGrade5Round ?? Infinity), 0.5);
    const end = quantile(rs.map(r => r.endRound), 0.5);
    const outcomes = new Map<string, number>();
    for (const r of rs) outcomes.set(r.outcome, (outcomes.get(r.outcome) ?? 0) + 1);
    const f = (v: number | null) => (v === null || !Number.isFinite(v) ? '없음' : `R${v}`);
    out.push(`| ${rs[0]!.bot} | ${rs[0]!.noDefeat ? '끔' : '켬'} | ${rs.length} | ${f(s.median)} | ${f(s.p90)} | ${(s.neverRate * 100).toFixed(0)}% | ${mean(rs.map(r => r.grade6Count)).toFixed(2)} | ${f(g5)} | ${mean(rs.map(r => r.buckwheatEarned)).toFixed(1)} | ${mean(rs.map(r => r.bossesKilled)).toFixed(1)}/${mean(rs.map(r => r.bossesEscaped)).toFixed(1)} | ${end ?? '-'} | ${[...outcomes].map(([o, n]) => `${o} ${n}`).join(', ')} |`);
  }
  return out.join('\n');
}
