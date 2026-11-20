import { pathToFileURL } from 'node:url';
import { gradeValue, loadGameData, type GameData } from '@dorandi/logic';

const SUMMON_SHARE = 0.8;
const KEEP_SHARE = 0.85;

export function econTable(data: GameData): string {
  const b = data.balance;
  const tokenValue = b.summonOdds.reduce((sum, p, i) => sum + p * gradeValue(i + 1), 0);
  const lines = [
    `도깨비불 하나 = 1등급 값 ${tokenValue.toFixed(2)}`,
    '',
    '| 구간 | 도깨비불 | 소환에서 오는 값 | 버림 뺀 값 |',
    '| --- | --- | --- | --- |',
  ];
  for (const rounds of [20, 40, 60]) {
    const tokens = b.tokens.start + b.tokens.perRound * rounds;
    const fromSummon = tokens * SUMMON_SHARE * tokenValue;
    lines.push(`| ${rounds}R | ${tokens} | ${Math.round(fromSummon)} | ${Math.round(fromSummon * KEEP_SHARE)} |`);
  }
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(econTable(loadGameData()));
}
