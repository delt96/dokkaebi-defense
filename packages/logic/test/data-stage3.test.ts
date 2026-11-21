import { describe, expect, test } from 'vitest';
import { enemyDef, loadGameData, recipeDemand, unitDef } from '../src/index';
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

  test('stage 3 adds a pity unit every 5 grade-1 summons; stages 1 and 2 keep 7', () => {
    expect(d3.balance.pityEvery).toBe(5);
    expect(loadGameData().balance.pityEvery).toBe(7);
    expect(loadGameData('stage2').balance.pityEvery).toBe(7);
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

describe('stage 3 data, grades 5-6 and hidden', () => {
  test('full v5 counts: 116 normal + 5 hidden, 108 recipes, physical 65', () => {
    expect([5, 6].map(g => normal(g).length)).toEqual([26, 30]);
    expect(d3.units.filter(u => !u.hidden).length).toBe(116);
    expect(d3.units.filter(u => u.hidden).map(u => u.id).sort()).toEqual(['bulgasari', 'eoduksini', 'gangcheori', 'jinegaksi', 'ssireumdokkaebi']);
    expect(d3.units.filter(u => !u.hidden && u.damageType === 'physical').length).toBe(65);
    expect([5, 6].map(g => normal(g).filter(u => u.damageType === 'physical').length)).toEqual([15, 15]);
    expect(d3.recipes.length).toBe(108);
  });

  test('every v5 row matches stats, name, recipe and cost', () => {
    expect(v5.units.length).toBe(121);
    for (const v of v5.units) {
      expect(unitDef(d3, v.id)).toMatchObject({ name: v.name, grade: v.grade, damageType: v.damageType, range: v.range, interval: v.interval, factor: v.factor });
      expect([v.id, unitDef(d3, v.id).hidden === true]).toEqual([v.id, v.hidden]);
      const recipe = d3.recipes.find(r => r.result === v.id);
      if (v.hidden || v.grade === 1) { expect(recipe).toBeUndefined(); continue; }
      const want = v5.recipes.find(r => r.result === v.id)!;
      expect([v.id, sorted(recipe!.materials)]).toEqual([v.id, sorted(want.materials)]);
      const cost = v.grade === 5 ? { buckwheat: 1 } : v.grade === 6 ? { buckwheat: 1, coins: 60 } : undefined;
      expect([v.id, recipe!.cost]).toEqual([v.id, cost]);
      expect([want.buckwheat, want.coins]).toEqual([cost?.buckwheat ?? 0, cost?.coins ?? 0]);
    }
  });

  test('demand table from v5 section 8', () => {
    const T: Record<string, number> = { bitjaru: 7, jipsin: 7, sotlid: 7, dadeumi: 7, horong: 7, bujigaengi: 7, buchae: 7, ki: 7,
      gamasot: 5, meongseok: 7, jeolgu: 7, hwaro: 6, cheongsachorong: 2, hwaetbul: 4, sseurebatgi: 4, dunggumi: 3, sut: 6, dadeumitdol: 5, mumyeong: 7, hanji: 6,
      didilbangga: 1, jangdok: 1, pulmu: 1, jwibul: 1, samtaegi: 1, mogitbul: 2, saekkijul: 5, sutdarimi: 1, hamjibak: 4, hongdukkae: 2, baneul: 5,
      gireumbyeong: 1, bujipge: 2, jaetmulsiru: 1, bagaji: 3, but: 4, jipsingol: 1, che: 1,
      yeonjabangga: 1, moru: 4, onggigama: 6, daljip: 1, dwiju: 2, meok: 4, geumulbaneul: 5, indupan: 2, tteongme: 2, gawi: 5, indu: 3, byeoru: 1,
      soemangchi: 5, chaeban: 4, mulle: 3, ja: 7, sokuri: 2, yagyeon: 1, golmu: 3, jumadeung: 1, maetdol: 2, jige: 3,
      top: 4, kkeul: 7, banjitgori: 2, dongwe: 2, gat: 1, manggeon: 1, eomang: 1, geumulchu: 2, beoseon: 1, ssatba: 1, jejuheobeok: 3, jipbae: 3,
      janggu: 2, kkwaenggwari: 2, buk: 1, hahoetal: 1, yeopjeonkkureomi: 2, dokki: 3, jojokdeung: 2, tewak: 1, maksabal: 4, yaktanggi: 2,
      tteoksiru: 4, yeotpan: 2, gireumteul: 1, sil: 5 };
    for (const [id, n] of Object.entries(T)) expect([id, recipeDemand(d3, id)]).toEqual([id, n]);
  });

  test('onBasicHit covers exactly the 31 units of the v5 change table', () => {
    expect(d3.units.filter(u => u.onBasicHit).length).toBe(31);
    expect(unitDef(d3, 'jipbae').onBasicHit).toEqual({ targetPct: 0.15, splashPct: 0.2 });
  });

  test('grade 6 spot values', () => {
    expect(unitDef(d3, 'bihyeongrang').lineage).toEqual(['magical', 'physical']);
    expect(unitDef(d3, 'cheonnyeonsangmo').skills).toContainEqual({ trigger: { kind: 'aura' },
      effects: [{ kind: 'auraAttackPower', pct: 0.13, damageType: 'magical', source: 'gat' }] });
    expect(unitDef(d3, 'gamtudokkaebi').skills[0]!.trigger).toEqual({ kind: 'charge', seconds: 4 });
    expect(unitDef(d3, 'cheonnyeondadeumitdol').skills[0]!.trigger).toEqual({ kind: 'nth', n: 2, phase: 1 });
  });
});
