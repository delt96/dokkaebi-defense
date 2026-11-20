import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadGameData } from '@dorandi/logic';
import { clumsyBot, normalBot, type Bot } from './bots';
import { roundRows, runGame, toCsv, type Row } from './runner';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const botName = arg('bot', 'normal');
const seeds = Number(arg('seeds', '20'));
const out = arg('out', `sim-out/${botName}.csv`);
const data = loadGameData();
const makeBot = (seed: number): Bot => (botName === 'clumsy' ? clumsyBot(seed) : normalBot());

const rows: Row[] = [];
const endRounds: number[] = [];
let clears = 0;
for (let seed = 1; seed <= seeds; seed++) {
  const state = runGame(data, seed, makeBot(seed));
  rows.push(...roundRows(state, seed, botName));
  if (state.result?.outcome === 'clear') clears++;
  else endRounds.push(state.result?.round ?? state.round);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, toCsv(rows) + '\n');

console.log(`bot ${botName}, seeds ${seeds}, csv ${out}`);
console.log(`clear ${clears}/${seeds}`);
const dist = new Map<number, number>();
for (const r of endRounds) dist.set(r, (dist.get(r) ?? 0) + 1);
console.log(`defeat rounds: ${[...dist.entries()].sort((a, b) => a[0] - b[0]).map(([r, n]) => `R${r}x${n}`).join(' ') || '-'}`);
console.log('round | median nominal | median real | median maxEnemies | median bossKillSeconds (killed/total)');
const maxRound = Math.max(...rows.map(r => r.round));
for (let round = 1; round <= maxRound; round++) {
  const rs = rows.filter(r => r.round === round);
  const nominal = median(rs.map(r => r.nominalMultiplier).filter((v): v is number => v !== null));
  const real = median(rs.map(r => r.realMultiplier).filter((v): v is number => v !== null));
  const maxE = median(rs.map(r => r.maxEnemies));
  const kills = rs.map(r => r.bossKillSeconds).filter((v): v is number => v !== null);
  const boss = median(kills);
  const f = (v: number | null) => (v === null ? '-' : v.toFixed(2));
  console.log(`R${round} | ${f(nominal)} | ${f(real)} | ${maxE ?? '-'} | ${boss === null ? '-' : `${boss.toFixed(1)} (${kills.length}/${rs.length})`}`);
}
