import { expect, test } from 'vitest';
import { loadGameData } from '@dorandi/logic';
import { makeData } from '@dorandi/logic/testing';
import { difficultyRuleText } from '../src/ui/difficulty';
import { firstBossRound, firstVisitRules, playMinutes, SUMMON_TOKENS } from '../src/ui/first-visit';

test('the difficulty note gives the game length in five-minute steps', () => {
  expect(difficultyRuleText('easy')).toBe('60라운드 · 약 40분 · 적 체력 80%');
  expect(difficultyRuleText('normal')).toBe('70라운드 · 약 45분 · 적 체력 90%');
  expect(difficultyRuleText('hard')).toBe('70라운드 · 약 45분 · 적 체력 100%');
  const data = loadGameData('stage3');
  expect(playMinutes(data, 60)).toBe(40);   // 15 + 6×75 + 54×34 = 2301 s
  expect(playMinutes(data, 70)).toBe(45);   // 15 + 7×75 + 63×34 = 2682 s
});

test('the first-visit lines read their numbers from the data', () => {
  expect(SUMMON_TOKENS).toBe(1);
  expect(firstVisitRules()).toEqual([
    'Space(뚝딱!)를 누르면 도깨비불 1개로 유닛 하나를 뽑습니다.',
    '재료가 모인 유닛을 고르고 Z로 조합하면 등급이 오릅니다.',
    '길 위 잡귀가 60마리를 넘긴 채 5초가 지나면 집니다.',
    '10라운드마다 나오는 보스는 그 라운드 안에 잡아야 합니다.',
    '방을 만들어 링크를 보내면 최대 6명이 함께 합니다.',
  ]);
  expect(firstVisitRules(undefined, 4)[4]).toBe('방을 만들어 링크를 보내면 최대 4명이 함께 합니다.');
  const changed = makeData(d => { d.balance.limit = 50; d.balance.limitSeconds = 7; }, 'stage3');
  expect(firstVisitRules(changed)[2]).toBe('길 위 잡귀가 50마리를 넘긴 채 7초가 지나면 집니다.');
  expect(firstBossRound(loadGameData('stage3'))).toBe(10);
  const noBoss = makeData(d => { d.waves = d.waves.filter(w => w.type !== 'boss'); }, 'stage3');
  expect(firstBossRound(noBoss)).toBeNull();
  const rules = firstVisitRules(noBoss);
  expect(rules).toHaveLength(4);
  expect(rules.some(line => line.includes('보스'))).toBe(false);
});
