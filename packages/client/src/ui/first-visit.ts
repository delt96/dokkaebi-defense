import { countNormalEnemies, loadGameData, statsForRound, unitDefFast, type GameData, type GameState, type Unit } from '@dorandi/logic';

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

export type TipStep = 'summon' | 'combine' | 'short' | 'limit' | 'boss';
export type TipKey = 'W' | 'Space' | 'G';
/** `drop`: help-line keys the text already names, left out of the line after it. */
export interface FirstTip { step: TipStep; text: string; drop: TipKey[] }

const FIRST_ROUNDS = 5;
const BOSS_LEAD_ROUNDS = 2;

/** Tamed bosses leave the lane with no kill time, so an empty lane after the boss spawned also counts as caught. */
function firstBossCaught(state: GameState, round: number): boolean {
  if (statsForRound(state, round)?.bossKillSeconds != null) return true;
  return state.round === round && state.spawned > 0 && !state.enemies.some(e => e.boss && e.round === round && e.hp > 0);
}

/** The one line of what to do now at the front of the help line, from the board alone (nothing is stored). */
export function firstTip(state: GameState, canCombine: boolean): FirstTip | null {
  const units = [...state.slots, ...(state.storage ?? [])].filter((u): u is Unit => !!u);
  if (!units.length) return { step: 'summon', text: `Space나 뚝딱!으로 유닛을 뽑으세요 (도깨비불 ${state.tokens}개)`, drop: ['W', 'Space', 'G'] };
  if (!units.some(u => unitDefFast(state.data, u.defId).grade >= 2)) {
    return canCombine
      ? { step: 'combine', text: 'W로 재료 유닛을 고르고 Z로 조합합니다 · 왼쪽 목록 맨 위부터', drop: ['W'] }
      : { step: 'short', text: `조합할 재료가 아직 모자랍니다 · Space로 더 뽑으세요 (도깨비불 ${state.tokens}개)`, drop: ['Space'] };
  }
  if (state.phase !== 'round') return null;
  const { limit, limitSeconds } = state.data.balance;
  if (state.round >= 1 && state.round <= FIRST_ROUNDS) {
    return { step: 'limit', text: `잡귀가 ${limit}마리를 넘긴 채 ${limitSeconds}초가 지나면 집니다 · 지금 ${countNormalEnemies(state)}마리`, drop: [] };
  }
  const boss = firstBossRound(state.data);
  if (boss !== null && state.round >= boss - BOSS_LEAD_ROUNDS && state.round <= boss && !firstBossCaught(state, boss)) {
    return { step: 'boss', text: `${boss}라운드 보스는 그 라운드 안에 잡아야 합니다`, drop: [] };
  }
  return null;
}
