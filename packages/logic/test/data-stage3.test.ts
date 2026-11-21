import { describe, expect, test } from 'vitest';
import { enemyDef, loadGameData, unitDef } from '../src/index';
import { readV5 } from './v5-table';

const d3 = loadGameData('stage3');
const v5 = readV5();
const normal = (g: number) => d3.units.filter(u => u.grade === g && !u.hidden);
const sorted = (xs: string[]) => [...xs].sort();

describe('stage 3 data, grades 1-4', () => {
  test('grades 1-4: 8/12/18/22 units with v5 physical splits 4/7/10/14', () => {
    expect([1, 2, 3, 4].map(g => normal(g).length)).toEqual([8, 12, 18, 22]);
    expect([1, 2, 3, 4].map(g => normal(g).filter(u => u.damageType === 'physical').length)).toEqual([4, 7, 10, 14]);
    expect(d3.recipes.filter(r => unitDef(d3, r.result).grade <= 4).length).toBe(52);
  });

  test('every v5 row of grade <= 4 matches stats, name and recipe', () => {
    for (const v of v5.units.filter(u => u.grade <= 4)) {
      expect(unitDef(d3, v.id)).toMatchObject({ name: v.name, grade: v.grade, damageType: v.damageType, range: v.range, interval: v.interval, factor: v.factor });
      if (v.grade === 1) continue;
      const recipe = d3.recipes.find(r => r.result === v.id);
      const want = v5.recipes.find(r => r.result === v.id)!;
      expect([v.id, sorted(recipe?.materials ?? [])]).toEqual([v.id, sorted(want.materials)]);
      expect(recipe!.cost).toBeUndefined();
    }
  });

  test('stage 1 and stage 2 untouched', () => {
    expect(loadGameData().units.length).toBe(22);
    expect(loadGameData('stage2').units.length).toBe(40);
    expect(loadGameData('stage2').units.every(u => u.onBasicHit === undefined && u.lineage === undefined)).toBe(true);
    expect(loadGameData('stage2').balance.bossControl).toBeUndefined();
  });

  test('balance, waves, provisional bosses', () => {
    expect(d3.balance).toMatchObject({
      rounds: 60, prepSeconds: 30, onBasicHitRadius: 3, periodicReady: true,
      bossControl: { windowTicks: 200, stunTicks: 60, pushDistance: 3, maxStoppedShare: 0.3 },
    });
    expect(d3.waves.length).toBe(60);
    expect(d3.waves.filter(w => w.type === 'boss').map(w => (w as { boss: string }).boss))
      .toEqual(['jinegaksi', 'gangcheori', 'jinegaksi3', 'gangcheori4', 'jinegaksi5', 'gangcheori6']);
    expect(d3.waves[44]).toEqual({ ...loadGameData().waves[4], round: 45 });
    expect(enemyDef(d3, 'gangcheori6')).toMatchObject({ boss: true, hp: 107000, resist: { magical: 0.3 } });
  });

  test('onBasicHit entries and lineage', () => {
    expect(unitDef(d3, 'hwaetbul').onBasicHit).toEqual({ targetPct: 0.05, splashPct: 0 });
    expect(unitDef(d3, 'pulmu').onBasicHit).toEqual({ targetPct: 0, splashPct: 0.15 });
    expect(unitDef(d3, 'jangdok').lineage).toEqual(['magical', 'physical']);
    expect(unitDef(d3, 'pulmu').lineage).toEqual(['magical']);
  });

  test('skill spot values', () => {
    expect(unitDef(d3, 'jaetmulsiru').skills).toEqual([{
      trigger: { kind: 'always' },
      effects: [{ kind: 'groundFire', length: 1.5, seconds: 2.5, pulseMult: 0.28, align: 'behind' }],
    }]);
    expect(unitDef(d3, 'indupan').skills[0]!.effects[1]).toEqual({ kind: 'stun', seconds: 0.6, radius: 1 });
    expect(unitDef(d3, 'mulle').skills[1]).toEqual({ trigger: { kind: 'aura' }, effects: [{ kind: 'auraAttackSpeed', pct: 0.12, damageType: 'physical' }] });
  });
});
