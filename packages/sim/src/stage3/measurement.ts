import type { GameData } from '@dorandi/logic';
import type { EconRow } from './econRun';
import { median } from './report';

export interface TameSample {
  seed: number; seat: number; round: number; enemyId: number; base: string;
  kind: 'spawn' | 'attempt' | 'complete'; chance: number; coins: number; muk: number; success: number; grown: number;
}

const seatKey = (r: { seed: number; seat: number }) => `${r.seed}/${r.seat}`;
const encounter = (r: TameSample) => `${seatKey(r)}/${r.enemyId}`;
const mean = (xs: number[]) => xs.length ? xs.reduce((a,b) => a+b, 0) / xs.length : null;

export function tameSummary(data: GameData, events: TameSample[], starts: number) {
  const eco = data.economy!;
  return eco.tame!.targets.map(({ unit, enemy }) => {
    const rows = events.filter(r => r.base === unit);
    const rolls = rows.filter(r => r.kind === 'attempt');
    const seen = new Set<string>();
    const wins = rolls.filter(r => r.success);
    const retries = rolls.filter(r => {
      const key = encounter(r);
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });
    const first = new Map<string, number>();
    for (const r of rows.filter(r => r.kind === 'complete')) first.set(seatKey(r), Math.min(first.get(seatKey(r)) ?? Infinity, r.round));
    const boss = data.enemies.find(e => e.id === enemy)!.boss;
    let lostCoins = 0, lostMuk = 0, lostDrops = 0;
    for (const r of wins) {
      if (boss) {
        lostCoins += data.balance.coins.boss;
        lostMuk += data.balance.bossBuckwheat;
        lostDrops += Number(eco.drops?.some(d => d.round === r.round) ?? false);
      } else if (enemy === eco.ssireum?.enemy) lostMuk += eco.ssireum.buckwheat;
      else if (enemy === eco.shadow?.enemy) lostCoins += r.grown ? eco.shadow.grownCoins : eco.shadow.coins;
    }
    const recipe = data.recipes.find(r => r.kind === 'tame' && r.materials.includes(unit))!;
    return { unit, result: recipe.result, starts, appearances: rows.filter(r => r.kind === 'spawn').length,
      attempted: seen.size, recruited: new Set(wins.map(seatKey)).size, completed: first.size, firstRound: median([...first.values()]),
      retries: retries.length, retryCoins: retries.reduce((a,r) => a+r.coins, 0), retryMuk: retries.reduce((a,r) => a+r.muk, 0),
      lostCoins, lostMuk, lostDrops,
      bands: eco.tame!.hpBands.map(b => {
        const band = rolls.filter(r => r.chance === b.chance);
        return { attempts: band.length, successes: band.filter(r => r.success).length };
      }) };
  });
}

type DrawSeat = Pick<EconRow,'seed'|'seat'|'draws'|'jigeGrants'|'jigeHeld'|'jigeUses'|'finished'|'grade6AtFinal'|'firstGrade6Round'>;

export function jigePairs(on: DrawSeat[], off: DrawSeat[]) {
  const full = on.filter(r => r.draws === 18);
  const control = new Map(off.map(r => [seatKey(r), r]));
  const counts: number[] = [], rounds: number[] = [];
  for (const r of on) {
    const c = control.get(seatKey(r));
    if (!c) continue;
    if (r.finished && c.finished) counts.push(r.grade6AtFinal - c.grade6AtFinal);
    if (r.firstGrade6Round !== null && c.firstGrade6Round !== null) rounds.push(r.firstGrade6Round - c.firstGrade6Round);
  }
  const inventory = new Map<string, number>();
  for (const r of full) {
    const key = `${r.jigeHeld}/${r.jigeUses}`;
    inventory.set(key, (inventory.get(key) ?? 0) + 1);
  }
  return { full: full.length, received: full.filter(r => r.jigeGrants > 0).length, inventory,
    pairs: counts.length, countDelta: mean(counts), firstPairs: rounds.length, firstDelta: mean(rounds) };
}

export function debuffSummary(rows: { control: number | null; treatment: number | null }[], limit: number) {
  return { n: rows.length, controlKills: rows.filter(r => r.control !== null).length, treatmentKills: rows.filter(r => r.treatment !== null).length,
    control: median(rows.map(r => r.control ?? limit)), treatment: median(rows.map(r => r.treatment ?? limit)),
    delta: median(rows.map(r => (r.treatment ?? limit) - (r.control ?? limit))) };
}
