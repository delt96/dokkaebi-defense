import { describe, expect, test } from 'vitest';
import { cellDistance, createGame, laneOf, loadGameData, unitAttack, type GameState, type UnitDef } from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { auraPlacement, mainType, supportFor, synergyScore, synergyUpgrade } from '../src/stage3/synergy';
import { STANDARD_CONFIGS } from '../src/stage3/econRun';

const d3 = loadGameData('stage3');
const normal = d3.units.filter(u => !u.hidden);
const find = (pred: (u: UnitDef) => boolean) => normal.find(pred)!;
const hasEffect = (u: UnitDef, kind: string, type?: string) =>
  u.skills.some(s => s.effects.some(e => e.kind === kind && (type === undefined || ('damageType' in e && e.damageType === type))));

function lane(): GameState {
  const s = createGame(d3, 1);
  forceRound(s, 1);
  return s;
}

describe('synergy helpers', () => {
  test('supportFor counts debuffs and auras of the matching damage type only', () => {
    const phys = find(u => hasEffect(u, 'vuln', 'physical') && !hasEffect(u, 'vuln', 'magical') && !u.skills.some(s => s.trigger.kind === 'aura'));
    expect(supportFor(phys, 'physical')).toBeGreaterThan(0);
    expect(supportFor(phys, 'magical')).toBe(0);
    const plain = find(u => !u.skills.some(sk => sk.effects.some(e => ['vuln', 'auraEnemyVuln', 'auraAttackSpeed', 'auraAttackPower'].includes(e.kind))));
    expect(supportFor(plain, 'physical')).toBe(0);
  });

  test('mainType follows the larger attack sum, counting the target as held', () => {
    const s = lane();
    const mag = find(u => u.grade === 3 && u.damageType === 'magical');
    const phys6 = find(u => u.grade === 6 && u.damageType === 'physical');
    placeUnitForTest(s, mag.id, 0);
    placeUnitForTest(s, mag.id, 1);
    expect(mainType(s, null)).toBe('magical');
    expect(mainType(s, phys6.id)).toBe('physical');
  });

  test('mainType weighs each type by the upgrade it already has, since a unit reads only its own type', () => {
    const s = lane();
    const mag = find(u => u.grade === 3 && u.damageType === 'magical');
    const close = (u: UnitDef) => Math.abs(unitAttack(u, d3.balance) / unitAttack(mag, d3.balance) - 1) < 0.08;
    const phys = find(u => u.grade === 3 && u.damageType === 'physical' && close(u));
    placeUnitForTest(s, mag.id, 0);
    placeUnitForTest(s, phys.id, 1);
    s.upgrades.physical = 0; s.upgrades.magical = 0;
    const plain = mainType(s, null);
    s.upgrades[plain === 'physical' ? 'magical' : 'physical'] = 10;
    expect(mainType(s, null)).not.toBe(plain);
  });

  test('synergyScore subtracts the type and support bonuses from the missing value', () => {
    const plainPhys = find(u => u.grade === 6 && u.damageType === 'physical' && supportFor(u, 'physical') === 0);
    expect(synergyScore(plainPhys, 30, 'physical')).toBeLessThan(synergyScore(plainPhys, 30, 'magical'));
    const supporter = find(u => u.grade === 6 && supportFor(u, u.damageType) > 0);
    const other = supporter.damageType === 'physical' ? 'magical' : 'physical';
    expect(synergyScore(supporter, 30, supporter.damageType)).toBeLessThan(synergyScore(supporter, 30, other));
  });

  test('synergyUpgrade buys the main line or polish first and the other line only once those are maxed', () => {
    const s = lane();
    s.coins = 1000;
    expect(['physical', 'polish']).toContain(synergyUpgrade(s, 'physical', s.coins));
    s.upgrades.physical = 10;
    s.upgrades.polish = 10;
    expect(synergyUpgrade(s, 'physical', s.coins)).toBe('magical');
    s.upgrades.physical = 0;
    expect(synergyUpgrade(s, 'physical', 0)).toBeNull();
  });

  test('auraPlacement moves an ally aura next to the units it boosts', () => {
    const s = lane();
    const geo = laneOf(s);
    const r = d3.balance.auraRadius;
    const aura = find(u => u.skills.some(sk => sk.trigger.kind === 'aura' && sk.effects.some(e => e.kind === 'auraAttackPower' && e.damageType === 'magical')));
    const dps = find(u => u.grade === 5 && u.damageType === 'magical' && !u.skills.some(sk => sk.trigger.kind === 'aura'));
    const open = geo.cells.filter(c => s.open[c.index]);
    let placed = false;
    for (const a of open) {
      for (const b of open) {
        if (b.index === a.index || b.isEdge !== a.isEdge || cellDistance(geo, a.index, b.index) <= 2 * r + 1e-9) continue;
        const near = open.filter(c => c.index !== b.index && c.index !== a.index && cellDistance(geo, c.index, b.index) <= r + 1e-9 && cellDistance(geo, c.index, a.index) > r + 1e-9);
        if (near.length < 2) continue;
        placeUnitForTest(s, aura.id, a.index);
        for (const c of near.slice(0, 2)) placeUnitForTest(s, dps.id, c.index);
        const cmd = auraPlacement(s);
        expect(cmd).toMatchObject({ type: 'move', from: a.index });
        const to = (cmd as { to: number }).to;
        expect(geo.cells[to]!.isEdge).toBe(a.isEdge);
        expect(near.slice(0, 2).every(c => cellDistance(geo, to, c.index) <= r + 1e-9)).toBe(true);
        placed = true;
        break;
      }
      if (placed) break;
    }
    expect(placed).toBe(true);
  });

  test('every bot kind has the five standard economy configs', () => {
    for (const bot of ['clumsy', 'normal', 'target', 'switch', 'synergy']) {
      expect(STANDARD_CONFIGS.filter(c => c.bot === bot).map(c => c.name.slice(bot.length + 1)))
        .toEqual(['base', 'market', 'quests4', 'full', 'full-q2']);
    }
  });
});
