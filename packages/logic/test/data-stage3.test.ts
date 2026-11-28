import { describe, expect, test } from 'vitest';
import { buildGameData, dataSources, enemyDef, enemyHp, loadGameData, recipeDemand, unitDef } from '../src/index';
import { readDraft } from './v6-table';

const d3 = loadGameData('stage3');
const v7 = readDraft('content-draft-120-v7.md');
const normal = (g: number) => d3.units.filter(u => u.grade === g && !u.hidden);
const sorted = (xs: string[]) => [...xs].sort();

describe('stage 3 data, grades 1-4', () => {
  test('grades 1-4: 8/12/18/22 units with v7 physical splits 4/7/10/14', () => {
    expect([1, 2, 3, 4].map(g => normal(g).length)).toEqual([8, 12, 18, 22]);
    expect([1, 2, 3, 4].map(g => normal(g).filter(u => u.damageType === 'physical').length)).toEqual([4, 7, 10, 14]);
    expect(d3.recipes.filter(r => unitDef(d3, r.result).grade <= 4).length).toBe(52);
  });

  test('every v7 row of grade <= 4 matches stats, name and recipe', () => {
    for (const v of v7.units.filter(u => u.grade <= 4)) {
      expect(unitDef(d3, v.id)).toMatchObject({ name: v.name, grade: v.grade, damageType: v.damageType, range: v.range, interval: v.interval, factor: v.factor });
      if (v.grade === 1 || v.hidden) continue;
      const recipe = d3.recipes.find(r => r.result === v.id);
      const want = v7.recipes.find(r => r.result === v.id)!;
      expect([v.id, sorted(recipe?.materials ?? [])]).toEqual([v.id, sorted(want.materials)]);
      expect(recipe!.cost).toBeUndefined();
    }
  });

  test('stage 3 swaps every 5th grade-1 summon for the least-summoned grade 1; stages 1 and 2 keep 7', () => {
    expect(d3.balance.pityEvery).toBe(5);
    expect(loadGameData().balance.pityEvery).toBe(7);
    expect(loadGameData('stage2').balance.pityEvery).toBe(7);
  });

  test('stage 1 and stage 2 untouched', () => {
    expect(loadGameData().units.length).toBe(22);
    expect(loadGameData('stage2').units.length).toBe(40);
    expect(loadGameData('stage2').units.every(u => u.onBasicHit === undefined)).toBe(true);
    expect(loadGameData('stage2').balance.bossControl).toBeUndefined();
  });

  test('balance, waves, provisional bosses', () => {
    expect(d3.balance).toMatchObject({
      rounds: 70, prepSeconds: 15, onBasicHitRadius: 3, periodicReady: true,
      bossControl: { windowTicks: 200, stunTicks: 60, pushDistance: 3, maxStoppedShare: 0.3 },
    });
    expect(d3.waves.length).toBe(70);
    expect(d3.waves.filter(w => w.type === 'boss').map(w => (w as { boss: string }).boss))
      .toEqual(['jinegaksi', 'gangcheori', 'jinegaksi3', 'gangcheori4', 'jinegaksi5', 'gangcheori6', 'jinegaksi7']);
    expect(d3.waves[44]).toEqual({ ...loadGameData().waves[4], round: 45 });
    expect(enemyDef(d3, 'gangcheori6')).toMatchObject({ boss: true, hp: 107000, resist: { magical: 0.3 } });
    for (let i = 0; i < 9; i++) expect(d3.waves[60 + i]).toEqual({ ...d3.waves[50 + i], round: 61 + i });
  });

  test('onBasicHit entries', () => {
    expect(unitDef(d3, 'hwaetbul').onBasicHit).toEqual({ targetPct: 0.05, splashPct: 0 });
    expect(unitDef(d3, 'pulmu').onBasicHit).toEqual({ targetPct: 0, splashPct: 0.15 });
  });

  test('skill spot values', () => {
    expect(unitDef(d3, 'jaetmulsiru').skills).toEqual([{
      trigger: { kind: 'always' },
      effects: [{ kind: 'groundFire', length: 1.5, seconds: 2.5, pulseMult: 0.28, align: 'behind' }],
    }]);
    expect(unitDef(d3, 'indupan').skills[0]!.effects[1]).toEqual({ kind: 'stun', seconds: 0.9, radius: 1 });
    expect(unitDef(d3, 'mulle').skills[1]).toEqual({ trigger: { kind: 'aura' }, effects: [{ kind: 'auraAttackSpeed', pct: 0.12, damageType: 'physical' }] });
  });
});

describe('stage 3 data, grades 5-6 and hidden', () => {
  test('full v7 counts: 120 normal + 5 recruits, 112 ordinary recipes, physical 67', () => {
    expect([5, 6].map(g => normal(g).length)).toEqual([28, 32]);
    expect(d3.units.filter(u => !u.hidden).length).toBe(120);
    expect(d3.units.filter(u => u.hidden && u.grade === 4).map(u => u.id).sort()).toEqual(['bulgasari', 'eoduksini', 'gangcheori', 'jinegaksi', 'ssireumdokkaebi']);
    expect(d3.units.filter(u => !u.hidden && u.damageType === 'physical').length).toBe(67);
    expect([5, 6].map(g => normal(g).filter(u => u.damageType === 'physical').length)).toEqual([16, 16]);
    expect(d3.recipes.filter(r => r.kind !== 'tame').length).toBe(112);
  });

  test('every v7 row matches stats, name, recipe and cost', () => {
    expect(v7.units.length).toBe(130);
    for (const v of v7.units) {
      expect(unitDef(d3, v.id)).toMatchObject({ name: v.name, grade: v.grade, damageType: v.damageType, range: v.range, interval: v.interval, factor: v.factor });
      expect([v.id, unitDef(d3, v.id).hidden === true]).toEqual([v.id, v.hidden]);
      const recipe = d3.recipes.find(r => r.result === v.id);
      if ((v.hidden && v.grade === 4) || v.grade === 1) { expect(recipe).toBeUndefined(); continue; }
      const want = v7.recipes.find(r => r.result === v.id)!;
      expect([v.id, sorted(recipe!.materials)]).toEqual([v.id, sorted(want.materials)]);
      const cost = v.grade === 5 ? { buckwheat: 1 } : v.grade === 6 ? { buckwheat: 1, coins: 60 } : undefined;
      expect([v.id, recipe!.cost]).toEqual([v.id, cost]);
      expect([want.buckwheat, want.coins]).toEqual([cost?.buckwheat ?? 0, cost?.coins ?? 0]);
    }
  });

  test('demand table from v7 section 8', () => {
    const T: Record<string, number> = { bitjaru: 7, jipsin: 7, sotlid: 7, dadeumi: 7, horong: 7, bujigaengi: 7, buchae: 7, ki: 7,
      gamasot: 6, meongseok: 6, jeolgu: 6, hwaro: 4, cheongsachorong: 5, hwaetbul: 4, sseurebatgi: 5, dunggumi: 5, sut: 6, dadeumitdol: 4, mumyeong: 5, hanji: 6,
      didilbangga: 2, jangdok: 3, pulmu: 1, jwibul: 1, samtaegi: 2, mogitbul: 2, saekkijul: 2, sutdarimi: 2, hamjibak: 3, hongdukkae: 2, baneul: 3,
      gireumbyeong: 3, bujipge: 3, jaetmulsiru: 2, bagaji: 3, but: 3, jipsingol: 1, che: 1,
      yeonjabangga: 2, moru: 4, onggigama: 4, daljip: 2, dwiju: 4, meok: 4, geumulbaneul: 4, indupan: 2, tteongme: 2, gawi: 4, indu: 4, byeoru: 3,
      soemangchi: 4, chaeban: 4, mulle: 4, ja: 4, sokuri: 3, yagyeon: 2, golmu: 2, jumadeung: 4, maetdol: 2, jige: 3,
      // the exclusive recipes add one use each to top, banjitgori, ssatba, jejuheobeok and jojokdeung
      top: 3, kkeul: 3, banjitgori: 3, dongwe: 2, gat: 2, manggeon: 2, eomang: 2, geumulchu: 2, beoseon: 2, ssatba: 3, jejuheobeok: 3, jipbae: 3,
      janggu: 2, kkwaenggwari: 2, buk: 2, hahoetal: 2, yeopjeonkkureomi: 3, dokki: 3, jojokdeung: 3, tewak: 3, maksabal: 3, yaktanggi: 2,
      tteoksiru: 2, yeotpan: 2, gireumteul: 3, sil: 2, dasikpan: 3, seongjudanji: 2 };
    for (const [id, n] of Object.entries(T)) expect([id, recipeDemand(d3, id)]).toEqual([id, n]);
  });

  test('onBasicHit covers exactly the 32 units of the v7 change table', () => {
    expect(d3.units.filter(u => u.onBasicHit).length).toBe(32);
    expect(unitDef(d3, 'seongjudanji').onBasicHit).toEqual({ targetPct: 0, splashPct: 0.05 });
    expect(unitDef(d3, 'jipbae').onBasicHit).toEqual({ targetPct: 0.15, splashPct: 0.2 });
  });

  test('grade 6 spot values', () => {
    expect(unitDef(d3, 'cheonnyeonsangmo').skills).toContainEqual({ trigger: { kind: 'aura' },
      effects: [{ kind: 'auraAttackPower', pct: 0.13, damageType: 'magical', source: 'gat' }] });
    expect(unitDef(d3, 'gamtudokkaebi').skills[0]!.trigger).toEqual({ kind: 'charge', seconds: 4 });
    expect(unitDef(d3, 'cheonnyeondadeumitdol').skills[0]!.trigger).toEqual({ kind: 'nth', n: 2, phase: 1 });
  });
});

describe('stage 3 balance stands on its own', () => {
  test('pins every resolved balance and coop value', () => {
    expect(d3.balance).toEqual({
      tickMs: 50, prepSeconds: 15, roundSeconds: 34, bossRoundSeconds: 75,
      spawnCount: 30, spawnIntervalSeconds: 0.8, rounds: 70,
      hp: { base: 63.75, coef: 13.6, exp: 1.5, late: { fromRound: 65, perRound: 0.4 } },
      gradeDps: { base: 10, mult: 2.6 },
      defaultDifficulty: 'normal',
      difficulties: { easy: { tokensPerRound: 3, rounds: 60, hpScale: 0.8 }, normal: { tokensPerRound: 3, rounds: 60, hpScale: 0.9 }, hard: { tokensPerRound: 3 }, hell: { tokensPerRound: 2 } },
      tokens: { start: 4, perRound: 3, toCoins: 25 },
      coins: { perKill: 1, roundEnd: 10, boss: 60 },
      bossBuckwheat: 2,
      sellPrice: [5, 10, 20, 40, 80, 180],
      limit: 60, limitSeconds: 5, limitInstantFromRound: 65,
      summonOddsByRound: [{ fromRound: 1, odds: [1, 0, 0] }],
      summonOdds: [1, 0, 0], pityEvery: 5,
      grid: { cols: 6, rows: 4, initialOpenRows: 4 },
      bossCcFactor: 0.5, vulnCap: 0.5, auraRadius: 1.5, pulseSeconds: 0.5,
      onBasicHitRadius: 3,
      auraCaps: { attackSpeed: 0.5, attackPower: 0.4 },
      periodicReady: true, extendedCombat: true,
      bossControl: { windowTicks: 200, stunTicks: 60, pushDistance: 3, maxStoppedShare: 0.3 },
      vulnCutsResist: true,
      resistByRound: { fromRound: 20, toRound: 70, top: 0.55, cap: 0.8 },
      zoneSlow: { pctFactor: 1 },
      finalCleanup: true,
    });
    expect(d3.coop).toEqual({
      yeoksin: [
        { stage: 1, enemy: 'yeoksin1', startRound: 6, deadlineRound: 9, baseHp: 6800, startIndex: 0 },
        { stage: 2, enemy: 'yeoksin2', startRound: 15, deadlineRound: 19, baseHp: 25500, startIndex: 1 },
        { stage: 3, enemy: 'yeoksin3', startRound: 35, deadlineRound: 39, baseHp: 92650, startIndex: 2 },
        { stage: 4, enemy: 'yeoksin4', startRound: 55, deadlineRound: 59, baseHp: 178500, startIndex: 3 },
        { stage: 5, enemy: 'yeoksin5', startRound: 65, deadlineRound: 69, baseHp: 185000, startIndex: 4 },
      ],
      hpPerExtraPlayer: 0.1, staySeconds: 12,
      killReward: { coins: 15, buckwheat: 1 }, topDamageBonus: 10,
      support: { perRound: 1, max: 1, coins: 5 },
      disconnectSeconds: 180, bossPauseCapSeconds: 180, danger: 48,
      maxCommandsPerTick: 20, resultSeconds: 120,
    });
    expect([1, 10, 30, 60].map(r => enemyHp(enemyDef(d3, 'japgwi'), r, d3.balance))).toEqual([77, 494, 2298, 6384]);
  });

  test('retuning stage 1 or stage 2 balance and coop leaves stage 3 unchanged', () => {
    const src = dataSources();
    expect(buildGameData('stage3', src)).toEqual(d3);
    src.stage1.balance.hp.coef = 99;
    src.stage1.balance.tokens.perRound = 9;
    src.stage1.balance.summonOdds = [0.1, 0.1, 0.8];
    src.stage2.balance.hp = { base: 500, coef: 50, exp: 2 };
    src.stage2.balance.prepSeconds = 99;
    src.stage2.coop.hpPerExtraPlayer = 0.9;
    src.stage2.coop.killReward.coins = 999;
    const s2 = buildGameData('stage2', src);
    expect(s2.balance.hp).toEqual({ base: 500, coef: 50, exp: 2 });
    expect(s2.coop!.hpPerExtraPlayer).toBe(0.9);
    const s3 = buildGameData('stage3', src);
    expect(s3.balance).toEqual(d3.balance);
    expect(s3.coop).toEqual(d3.coop);
  });
});

describe('exclusive recipes of the recruits', () => {
  const TABLE: [string, string, 'physical' | 'magical', string, string][] = [
    ['baekbalbaneulgaksi', '백발바늘각시', 'physical', 'jinegaksi', 'banjitgori'],
    ['sonakheobeokjigi', '소낙허벅지기', 'magical', 'gangcheori', 'jejuheobeok'],
    ['topnisoemeokbo', '톱니쇠먹보', 'physical', 'bulgasari', 'top'],
    ['satbadolgaejangsa', '샅바돌개장사', 'physical', 'ssireumdokkaebi', 'ssatba'],
    ['geumeumdeungjigi', '그믐등지기', 'magical', 'eoduksini', 'jojokdeung'],
  ];

  test('names, families and exact pairs; 120 normal + 5 recruits + 5 upper hidden, 112 + 5 recipes', () => {
    expect(d3.units.filter(u => !u.hidden).length).toBe(120);
    expect(d3.units.filter(u => u.hidden && u.grade === 4).length).toBe(5);
    expect(d3.units.filter(u => u.hidden && u.grade === 6).map(u => u.id).sort()).toEqual(TABLE.map(t => t[0]).sort());
    expect(d3.recipes.filter(r => r.kind !== 'tame').length).toBe(112);
    expect(d3.recipes.filter(r => r.kind === 'tame').length).toBe(5);
    for (const [id, name, type, recruit, partner] of TABLE) {
      expect(unitDef(d3, id)).toMatchObject({ name, grade: 6, hidden: true, damageType: type });
      const r = d3.recipes.find(x => x.result === id)!;
      expect([id, sorted(r.materials), r.cost, r.kind]).toEqual([id, sorted([recruit, partner]), { buckwheat: 1, coins: 60 }, 'tame']);
      expect(unitDef(d3, partner)).toMatchObject({ grade: 5 });
      expect(unitDef(d3, partner).hidden).toBeFalsy();
    }
  });

  test('each partner is used in one more recipe than the v7 table and at most 7', () => {
    const before: Record<string, number> = { banjitgori: 2, jejuheobeok: 2, top: 2, ssatba: 2, jojokdeung: 2 };
    for (const [p, n] of Object.entries(before)) expect([p, recipeDemand(d3, p)]).toEqual([p, n + 1]);
  });
});

describe('area stun and shred', () => {
  const STUN_AREA = ['bujipge', 'soemangchi', 'top', 'dongwe', 'ssatba', 'buk', 'gamtudokkaebi', 'oedaridokkaebi', 'gildal', 'ssireumdokkaebi', 'satbadolgaejangsa'];
  const VULN_AREA: Record<string, [number, number]> = { sutdarimi: [0.12, 3], bujipge: [0.1, 2], yagyeon: [0.15, 3] };
  const EVERY_HIT = ['duduri', 'gaetgilbuldokkaebi', 'cheonnyeonmaetbangseok', 'cheonnyeonmuseosot', 'cheonnyeonjing', 'cheonnyeonyogang', 'cheonnyeonsangmo', 'bulgasari'];
  const effects = (id: string) => unitDef(d3, id).skills.flatMap(s => s.effects.map(e => ({ trigger: s.trigger.kind, e })));
  const areaOf = (e: object) => ('radius' in e ? e.radius : undefined) ?? ('area' in e ? e.area : undefined);

  test('the eleven single stuns reach 1.25 around the hit', () => {
    for (const id of STUN_AREA) {
      const stuns = effects(id).filter(x => x.e.kind === 'stun');
      expect([id, stuns.length > 0, stuns.every(x => areaOf(x.e) === 1.25)]).toEqual([id, true, true]);
    }
  });

  test('the three proc shreds reach 1.5 and keep their numbers', () => {
    for (const [id, [pct, seconds]] of Object.entries(VULN_AREA)) {
      const v = effects(id).filter(x => x.e.kind === 'vuln').map(x => x.e);
      expect([id, v]).toEqual([id, [expect.objectContaining({ pct, seconds, radius: 1.5 })]]);
    }
  });

  test('every-hit shreds stay on the target', () => {
    for (const id of EVERY_HIT) {
      const v = effects(id).filter(x => x.e.kind === 'vuln' && x.trigger === 'always');
      expect([id, v.length > 0, v.some(x => areaOf(x.e) !== undefined)]).toEqual([id, true, false]);
    }
  });

  test('every stage 3 stun is an area stun; stage 1-2 stuns stay single', () => {
    const own = new Set(dataSources().stage3.units.map(u => u.id));
    for (const u of d3.units) for (const s of u.skills) for (const e of s.effects) {
      if (e.kind !== 'stun') continue;
      const everyoneInRange = s.effects.some(x => x.kind === 'allInRange');
      expect([u.id, everyoneInRange || areaOf(e) !== undefined]).toEqual([u.id, own.has(u.id)]);
    }
  });

  // runPeriodics lands an allInRange skill's statuses on everyone it damaged and never reads radius/area.
  test('statuses on an all-in-range skill carry no radius or area', () => {
    for (const u of d3.units) for (const s of u.skills) {
      if (!s.effects.some(x => x.kind === 'allInRange')) continue;
      for (const e of s.effects) if (e.kind !== 'allInRange') expect([u.id, e.kind, areaOf(e)]).toEqual([u.id, e.kind, undefined]);
    }
  });
});
