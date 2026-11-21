import { pathToFileURL } from 'node:url';
import { gradeValue, loadGameData, summonOddsForRound, type GameData } from '@dorandi/logic';

const SUMMON_SHARE = 0.8;
const KEEP_SHARE = 0.85;

export function econTable(data: GameData): string {
  const b = data.balance;
  const tokenValue = (round: number) => summonOddsForRound(b, round).reduce((sum, p, i) => sum + p * gradeValue(i + 1), 0);
  const lines = [
    '도깨비불 하나의 기대값 (1등급 기준, 받은 라운드에 소환)',
    ...(b.summonOddsByRound ?? [{ fromRound: 1 }]).map(({ fromRound }) =>
      `${fromRound}라운드부터 ${tokenValue(fromRound).toFixed(2)}`),
    '',
    '| 구간 | 도깨비불 | 소환에서 오는 값 | 버림 뺀 값 |',
    '| --- | --- | --- | --- |',
  ];
  for (const rounds of [20, 40, 60]) {
    const tokens = b.tokens.start + b.tokens.perRound * rounds;
    let value = b.tokens.start * tokenValue(1);
    for (let round = 1; round <= rounds; round++) value += b.tokens.perRound * tokenValue(round);
    const fromSummon = value * SUMMON_SHARE;
    lines.push(`| ${rounds}R | ${tokens} | ${Math.round(fromSummon)} | ${Math.round(fromSummon * KEEP_SHARE)} |`);
  }
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(econTable(loadGameData()));
}
