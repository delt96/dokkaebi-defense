import { loadGameData, type GameData } from '@dorandi/logic';

export const SUMMON_TOKENS = 1;

export function firstBossRound(data: GameData): number | null {
  let first: number | null = null;
  for (const w of data.waves) if (w.type === 'boss' && (first === null || w.round < first)) first = w.round;
  return first;
}

export function playMinutes(data: GameData, rounds: number): number {
  const b = data.balance;
  let seconds = b.prepSeconds;
  for (let round = 1; round <= rounds; round++) {
    const wave = data.waves.find(w => w.round === round);
    seconds += wave?.type === 'boss' ? b.bossRoundSeconds : b.roundSeconds;
  }
  return Math.round(seconds / 60 / 5) * 5;
}

export function firstVisitRules(data: GameData = loadGameData('stage3'), seats = 6): string[] {
  const { limit, limitSeconds } = data.balance;
  const boss = firstBossRound(data);
  return [
    `Space(뚝딱!)를 누르면 도깨비불 ${SUMMON_TOKENS}개로 유닛 하나를 뽑습니다.`,
    '재료가 모인 유닛을 고르고 Z로 조합하면 등급이 오릅니다.',
    `길 위 잡귀가 ${limit}마리를 넘긴 채 ${limitSeconds}초가 지나면 집니다.`,
    ...(boss === null ? [] : [`${boss}라운드마다 나오는 보스는 그 라운드 안에 잡아야 합니다.`]),
    `방을 만들어 링크를 보내면 최대 ${seats}명이 함께 합니다.`,
  ];
}
