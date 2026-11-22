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

const rate = (n: number, total: number) => `${n}/${total} (${total ? (100*n/total).toFixed(1)+'%' : '—'})`;
const table = (head: string[], rows: (string | number)[][]) =>
  [head, head.map(() => '---'), ...rows].map(row => '| '+row.join(' | ')+' |').join('\n');

export function tameMarkdown(data: GameData, events: TameSample[], starts: number) {
  const s = tameSummary(data,events,starts);
  const bands = data.economy!.tame!.hpBands;
  return table(['대상','시도한 등장','재시도','재지출 냥/묵','포기 냥/묵/드롭', ...bands.map(b => `체력 ≤${b.upTo*100}% 성공/시도`)],
    s.map(r => [unitName(data,r.unit),rate(r.attempted,r.appearances),r.retries,`${r.retryCoins}/${r.retryMuk}`,
      `${r.lostCoins}/${r.lostMuk}/${r.lostDrops}`,...r.bands.map(b => rate(b.successes,b.attempts))]))+'\n\n'+
    table(['전용 조합','전체 완성','영입 후 완성','첫 완성 R 중앙값'],s.map(r => [unitName(data,r.result),rate(r.completed,starts),rate(r.completed,r.recruited),r.firstRound ?? '—']));
}

const unitName = (data: GameData, id: string) => data.units.find(u => u.id === id)!.name;

export function drawMarkdown(on: DrawSeat[], off: DrawSeat[]) {
  const s = jigePairs(on,off);
  const arms = ([['켬',on],['끔',off]] as const).map(([name,seats]) => {
    const arm = jigePairs(seats,[]);
    return [name, seats.length,arm.full,rate(arm.received,arm.full),[...arm.inventory].sort().map(([k,n]) => `${k}=${n}`).join(' · ')];
  });
  return table(['지게 사용','시작','18회','18회 중 지게 획득','18회 보유/사용=자리'],arms)+'\n\n'+
    table(['완주 짝','R60 일반 6등급 차이(켬−끔 평균)','양쪽 첫 완성 짝','첫 완성 R 차이(평균)'],
      [[s.pairs,s.countDelta?.toFixed(3) ?? '—',s.firstPairs,s.firstDelta?.toFixed(2) ?? '—']]);
}

export function debuffMarkdown(rows: import('./synergy').DebuffPair[], limit: number) {
  return table(['계열','지표','짝','대조','약화','짝차 중앙값','양쪽 처치(대조/약화)'],
    ['physical','magical'].flatMap(f => ['visit','r20','r60'].map(t => {
      const s = debuffSummary(rows.filter(r => r.family === f && r.trial === t),limit);
      return [f,t,s.n,s.control?.toFixed(2) ?? '—',s.treatment?.toFixed(2) ?? '—',s.delta?.toFixed(2) ?? '—', t === 'visit' ? '—' : `${s.controlKills}/${s.treatmentKills}`];
    })));
}

/** Flat sidecar CSVs contain only IDs, labels and numbers. */
export function readSamples(text: string): TameSample[] {
  const [, ...lines] = text.trim().split(/\r?\n/);
  return lines.map(line => {
    const [seed,seat,round,enemyId,base,kind,chance,coins,muk,success,grown] = line.split(',');
    return { seed: Number(seed), seat: Number(seat), round: Number(round), enemyId: Number(enemyId), base: base!,
      kind: kind as TameSample['kind'], chance: Number(chance), coins: Number(coins), muk: Number(muk), success: Number(success), grown: Number(grown) };
  });
}
