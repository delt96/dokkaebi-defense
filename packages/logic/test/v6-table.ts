import { readFileSync } from 'node:fs';
import type { DamageType } from '../src/types';

export interface V5Unit { id: string; name: string; grade: number; hidden: boolean; damageType: DamageType; range: number; interval: number; factor: number }
export interface V5Recipe { result: string; materials: string[]; buckwheat: number; coins: number }

const cells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

let cache: { units: V5Unit[]; recipes: V5Recipe[] } | null = null;

export function readV6(): { units: V5Unit[]; recipes: V5Recipe[] } {
  if (cache) return cache;
  const text = readFileSync(new URL('../../../docs/design/content-draft-116-v6.md', import.meta.url), 'utf8');
  const lines = text.split(/\r?\n/);
  const rows: { cols: string[]; grade: number; hidden: boolean }[] = [];
  let grade = 0;
  let hidden = false;
  for (const line of lines) {
    const g = /^### ([1-6])등급\s*$/.exec(line);
    if (g) { grade = Number(g[1]); hidden = false; continue; }
    // the tamed recruits are grade 4 hidden units
    if (/^## 5\. 히든 유닛/.test(line)) { grade = 4; hidden = true; continue; }
    // the exclusive recipe results: grade 6 hidden units with a recipe
    if (/^### 상위 히든/.test(line)) { grade = 6; hidden = true; continue; }
    if (/^#{2,3} /.test(line)) { grade = 0; hidden = false; continue; }
    if (!grade || !line.startsWith('|')) continue;
    const cols = cells(line);
    if (cols[0] === 'id' || /^-+$/.test(cols[0] ?? '')) continue;
    if (!/^[a-z0-9]+$/.test(cols[0] ?? '')) continue;
    rows.push({ cols, grade, hidden });
  }
  const units: V5Unit[] = rows.map(({ cols, grade: gr, hidden: h }) => {
    const type = cols[2];
    if (type !== '물' && type !== '마') throw new Error(`bad damage type ${type} for ${cols[0]}`);
    return {
      id: cols[0]!, name: cols[1]!, grade: gr, hidden: h,
      damageType: type === '물' ? 'physical' : 'magical',
      range: Number(cols[3]), interval: Number(cols[4]), factor: Number(cols[5]),
    };
  });
  const byName = new Map(units.map(u => [u.name, u.id]));
  const recipes: V5Recipe[] = [];
  for (const { cols, hidden: h } of rows) {
    const mat = cols[7]!;
    if (h && !mat.includes(' + ')) continue;
    if (mat === '소환 전용') continue;
    const r: V5Recipe = { result: cols[0]!, materials: [], buckwheat: 0, coins: 0 };
    for (const raw of mat.split(' + ')) {
      const part = raw.trim();
      const bw = /^메밀묵 (\d+)개$/.exec(part);
      if (bw) { r.buckwheat += Number(bw[1]); continue; }
      const coin = /^엽전 (\d+)냥$/.exec(part);
      if (coin) { r.coins += Number(coin[1]); continue; }
      const twice = /^(.+?) ×2$/.exec(part);
      const name = twice ? twice[1]! : part;
      const id = byName.get(name);
      if (!id) throw new Error(`unknown material ${name} in ${r.result}`);
      r.materials.push(id);
      if (twice) r.materials.push(id);
    }
    recipes.push(r);
  }
  cache = { units, recipes };
  return cache;
}
