import { chooseSlot, createGame, unitDefFast, type GameData } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { standOff } from './firepower';
import { quantile } from './report';

/** Where each group is compared: tamed recruits while they are used, the grade 6 results late. */
export const UNIT_POWER_ROUNDS = { early: [21, 31], late: [51, 59] } as const;

/** Targets against the normal medians: a bare recruit vs grade 4, an evolved one vs grade 5, a result vs grade 6. */
export const UNIT_POWER_TARGETS = { bare: 0.7, evolved: 1, result: 0.9 } as const;

const SEEDS = [1, 2, 3];

/**
 * Damage per second one unit deals alone on an empty board (on the cell the game would give it) against `round`'s
 * normal enemies, by the board firepower method (standOff: 30 standing enemies, 30 s, skills and debuffs count, no
 * upgrades), averaged over three seeds for its chance skills. `evolved` puts the shop's evolve item on it.
 */
export function unitPower(data: GameData, defId: string, round: number, evolved = false): number {
  const charm = data.economy?.shop?.items.find(i => i.effect.kind === 'evolve')?.id;
  if (evolved && !charm) throw new Error('no evolve item in the data');
  let sum = 0;
  for (const seed of SEEDS) {
    // hard is the shared full-hp data the tamed and exclusive numbers were tuned on
    const s = createGame(data, seed, 'hard');
    const slot = chooseSlot(s, unitDefFast(data, defId))!;
    const u = placeUnitForTest(s, defId, slot);
    if (evolved) u.item = charm!;
    sum += standOff(s, round).dps;
  }
  return sum / SEEDS.length;
}

export interface UnitPowerRow { round: number; group: string; unit: string; name: string; dps: number; ratio: number | null; target: number | null }

const median = (xs: number[]) => quantile(xs, 0.5) ?? NaN;

/** Normal grade medians and every tamed recruit (bare, evolved) and exclusive result against its target. */
export function unitPowerRows(data: GameData): UnitPowerRow[] {
  const rows: UnitPowerRow[] = [];
  const normal = (g: number) => data.units.filter(u => u.grade === g && !u.hidden).map(u => u.id);
  const tamed = data.economy?.tame?.targets.map(t => t.unit) ?? [];
  const results = data.recipes.filter(r => r.kind === 'tame').map(r => r.result);
  const name = (id: string) => unitDefFast(data, id).name;
  const evolveOn = data.economy?.shop?.items.some(i => i.effect.kind === 'evolve') === true;
  const groupMedian = (round: number, g: number) => {
    const m = median(normal(g).map(id => unitPower(data, id, round)));
    rows.push({ round, group: `normal${g}`, unit: `median of ${normal(g).length}`, name: `일반 ${g}등급 중앙값`, dps: m, ratio: null, target: null });
    return m;
  };
  for (const round of UNIT_POWER_ROUNDS.early) {
    const g4 = groupMedian(round, 4);
    const g5 = groupMedian(round, 5);
    for (const id of tamed) {
      const bare = unitPower(data, id, round);
      rows.push({ round, group: 'bare', unit: id, name: name(id), dps: bare, ratio: bare / g4, target: UNIT_POWER_TARGETS.bare });
      if (evolveOn) {
        const ev = unitPower(data, id, round, true);
        rows.push({ round, group: 'evolved', unit: id, name: name(id), dps: ev, ratio: ev / g5, target: UNIT_POWER_TARGETS.evolved });
      }
    }
  }
  for (const round of UNIT_POWER_ROUNDS.late) {
    const g6 = groupMedian(round, 6);
    for (const id of results) {
      const v = unitPower(data, id, round);
      rows.push({ round, group: 'result', unit: id, name: name(id), dps: v, ratio: v / g6, target: UNIT_POWER_TARGETS.result });
    }
  }
  return rows;
}

const GROUP_TEXT: Record<string, string> = { bare: '길들인 직후 / 일반 4등급', evolved: '진화 / 일반 5등급', result: '전용 조합 결과 / 일반 6등급' };

export function unitPowerMarkdown(rows: UnitPowerRow[]): string {
  const out = ['| 라운드 | 구분 | 유닛 | 초당 피해 | 비율 (목표) |', '| ---: | --- | --- | ---: | ---: |'];
  for (const r of rows) {
    const ratio = r.ratio === null ? '' : `${(r.ratio * 100).toFixed(0)}% (${(r.target! * 100).toFixed(0)}%)`;
    out.push(`| ${r.round} | ${GROUP_TEXT[r.group] ?? '기준'} | ${r.name} | ${Math.round(r.dps)} | ${ratio} |`);
  }
  const summary = ['', '| 유닛 | 구분 | 두 라운드 평균 비율 | 목표 |', '| --- | --- | ---: | ---: |'];
  const keys = [...new Set(rows.filter(r => r.ratio !== null).map(r => `${r.group}|${r.unit}`))];
  for (const k of keys) {
    const rs = rows.filter(r => `${r.group}|${r.unit}` === k);
    const avg = rs.reduce((a, r) => a + r.ratio!, 0) / rs.length;
    summary.push(`| ${rs[0]!.name} | ${GROUP_TEXT[rs[0]!.group]} | ${(avg * 100).toFixed(0)}% | ${(rs[0]!.target! * 100).toFixed(0)}% |`);
  }
  return [...out, ...summary].join('\n');
}
