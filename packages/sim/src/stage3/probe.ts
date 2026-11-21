import type { GameData } from '@dorandi/logic';

/** No-resist probe flows: v5's 1.76 / 1.28 / 0.88 tile gaps at 0.8 s spawns, and a 0.15 tile clump. */
export const PROBE_SCENARIOS = {
  flow176: { speed: 2.2, intervalSeconds: 0.8 },
  flow128: { speed: 1.6, intervalSeconds: 0.8 },
  flow088: { speed: 1.1, intervalSeconds: 0.8 },
  clump015: { speed: 1.5, intervalSeconds: 0.1 },
} as const;
export type ProbeScenario = keyof typeof PROBE_SCENARIOS;

/** A copy of `data` whose round 1 is 30 probe enemies of `hp` with no resists and no defeat limit. */
export function probeData(data: GameData, scenario: ProbeScenario, hp: number): GameData {
  const d = structuredClone(data);
  const { speed, intervalSeconds } = PROBE_SCENARIOS[scenario];
  d.enemies.push({ id: 'probe', name: '시험 잡귀', boss: false, hpMult: 1, speed, resist: { physical: 0, magical: 0 } });
  d.waves = [{ round: 1, type: 'normal', pattern: ['probe'] }];
  d.balance.hp = { base: hp, coef: 0, exp: 1 };
  d.balance.spawnIntervalSeconds = intervalSeconds;
  d.balance.limit = 1e9;
  return d;
}
