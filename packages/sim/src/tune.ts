import { loadGameData, type GameData } from '@dorandi/logic';
import { clumsyBot, normalBot } from './bots';
import { roundRows, runGame, type Row } from './runner';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const median = (xs: number[]): number => {
  if (!xs.length) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function applyOverrides(data: GameData, o: Record<string, number>): GameData {
  if (o.hpBase !== undefined) data.balance.hp.base = o.hpBase;
  if (o.hpCoef !== undefined) data.balance.hp.coef = o.hpCoef;
  if (o.hpExp !== undefined) data.balance.hp.exp = o.hpExp;
  if (o.boss10 !== undefined) data.enemies.find(e => e.id === 'jinegaksi')!.hp = o.boss10;
  if (o.boss20 !== undefined) data.enemies.find(e => e.id === 'gangcheori')!.hp = o.boss20;
  if (o.gradeMult !== undefined) data.balance.gradeDps.mult = o.gradeMult;
  return data;
}

const overrides = JSON.parse(arg('set', '{}')) as Record<string, number>;
const seeds = Number(arg('seeds', '40'));
const data = applyOverrides(loadGameData(), overrides);

function summarize(name: string, makeBot: (seed: number) => ReturnType<typeof normalBot>) {
  const rows: Row[] = [];
  const ends: number[] = [];
  let clears = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const st = runGame(data, seed, makeBot(seed));
    rows.push(...roundRows(st, seed, name));
    if (st.result?.outcome === 'clear') clears++;
    else ends.push(st.result?.round ?? st.round);
  }
  const normalRounds = rows.filter(r => r.nominalMultiplier !== null && r.round >= 3);
  const boss = (round: number) => {
    const rs = rows.filter(r => r.round === round);
    const k = rs.map(r => r.bossKillSeconds).filter((v): v is number => v !== null);
    return `${median(k).toFixed(1)}s ${k.length}/${rs.length}`;
  };
  const inBand = ends.filter(r => r >= 12 && r <= 20).length;
  console.log(`${name}: clear ${clears}/${seeds} | defeats R12-20 ${inBand}/${seeds} | median defeat R${median(ends) || '-'}`
    + ` | nominal ${median(normalRounds.map(r => r.nominalMultiplier!)).toFixed(2)}`
    + ` | maxEnemies ${median(normalRounds.map(r => r.maxEnemies))}`
    + ` | boss10 ${boss(10)} | boss20 ${boss(20)}`);
}

console.log(`set ${JSON.stringify(overrides)}`);
summarize('normal', () => normalBot());
summarize('clumsy', seed => clumsyBot(seed));
