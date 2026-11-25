import { describe, expect, test } from 'vitest';
import { createGame, difficultyData, loadGameData, type GameState } from '@dorandi/logic';
import { forceRound, spawnEnemyForTest } from '@dorandi/logic/testing';
import { hudModel, limitLevel, limitTail } from '../src/ui/models';

const d1 = loadGameData();
const d3 = loadGameData('stage3');

describe('limitLevel', () => {
  test.each([[47, 'ok'], [48, 'warn'], [56, 'warn'], [57, 'danger'], [60, 'danger'], [61, 'over']] as const)('%i enemies: %s', (n, level) => {
    expect(limitLevel(d3, n, 30).level).toBe(level);
  });

  test('the warn line is coop.danger when there is one, else ceil(limit x 0.8)', () => {
    expect(limitLevel({ ...d3, coop: { ...d3.coop!, danger: 45 } }, 45, 1).level).toBe('warn');
    expect(limitLevel({ ...d3, coop: { ...d3.coop!, danger: 45 } }, 44, 1).level).toBe('ok');
    expect(limitLevel({ ...d1, coop: undefined }, 48, 1).level).toBe('warn');
    expect(limitLevel({ ...d1, coop: undefined }, 47, 1).level).toBe('ok');
  });

  test('instant defeat from round 65 on boards that reach it', () => {
    expect(limitLevel(d3, 58, 64).instant).toBe(false);
    expect(limitLevel(d3, 58, 65).instant).toBe(true);
    expect(limitLevel(difficultyData(d3, 'easy'), 58, 60).instant).toBe(false);
    expect(limitLevel(d1, 58, 20).instant).toBe(false);
  });
});

test('tails', () => {
  expect([limitTail('ok', 10, 60), limitTail('warn', 50, 60), limitTail('danger', 58, 60), limitTail('danger', 60, 60), limitTail('over', 63, 60)])
    .toEqual([null, '주의', '2마리 남음', '한계', '초과']);
});

function withEnemies(n: number): GameState {
  const s = createGame(d3, 1);
  forceRound(s, 30);
  for (let i = 0; i < n; i++) spawnEnemyForTest(s, 'japgwi', 0);
  return s;
}

const pick = (m: ReturnType<typeof hudModel>) =>
  ({ count: m.count, limit: m.limit, level: m.level, tail: m.tail, crackShown: m.crackShown, overBy: m.overBy });

test('hudModel carries the level, hides the 장승 word only in danger, and counts how many to cut when over', () => {
  expect(pick(hudModel(withEnemies(58)))).toEqual({ count: 58, limit: 60, level: 'danger', tail: '2마리 남음', crackShown: false, overBy: 0 });
  expect(pick(hudModel(withEnemies(63)))).toMatchObject({ count: 63, level: 'over', tail: '초과', crackShown: true, overBy: 3 });
  expect(hudModel(withEnemies(63)).instant).toBe(false);
  expect(hudModel(withEnemies(63))).toMatchObject({ enemyText: '내 잡귀 63 / 60', crack: '무너짐' });
});
