import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { loadGameData } from '../src/index';

const d3 = loadGameData('stage3');
const eco = d3.economy!;
const b = d3.balance;
const readDocs = (...files: string[]) =>
  files.map(f => [f, readFileSync(new URL(`../../../docs/${f}`, import.meta.url), 'utf8')] as const);
const draft = 'design/stage3-economy-draft.md';
const docs = readDocs(draft);

// the spec's budget path: normal, six seats all alive, 29 kills a normal round, every boss and 역신 down, no taming,
// five 불 changed and four grade-1 units sold every ten rounds, the collection/team won, ssireum at 1/6.
// 격파 pay depends on how far each seat levels its targets, so it sits outside this table (like the shadow's coins).
const KILLS = 29;
const CONVERT = 5;
const SELL = 4;
const SEATS = 6;
const WINDOWS = [1, 11, 21, 31, 41, 51].map(from => [from, from + 9] as const);
const within = (r: number, [from, to]: readonly [number, number]) => r >= from && r <= to;
const bossRounds = d3.waves.filter(w => w.type === 'boss').map(w => w.round);
const yeoksin = d3.coop!.yeoksin;

/** "582.7", "3⅙", "4" as the tables write them. */
function fmt(x: number): string {
  const sixth = Math.round(x * 6);
  if (sixth % 6 !== 0 && Math.abs(x * 6 - sixth) < 1e-9 && sixth % 6 === 1) return `${(sixth - 1) / 6}⅙`;
  const v = Math.round(x * 10) / 10;
  return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function windowRow(w: readonly [number, number], i: number) {
  const bosses = bossRounds.filter(r => within(r, w)).length;
  const gates = yeoksin.filter(y => within(y.startRound, w)).length;
  const normals = d3.waves.filter(x => x.type === 'normal' && within(x.round, w)).length;
  const coins = normals * KILLS * b.coins.perKill + 10 * b.coins.roundEnd + bosses * b.coins.boss
    + gates * (d3.coop!.killReward.coins + d3.coop!.topDamageBonus / SEATS)
    + CONVERT * b.tokens.toCoins + SELL * b.sellPrice[0]!
    + (within(eco.collection!.toRound, w) ? eco.collection!.coins : 0);
  const muk = bosses * b.bossBuckwheat + gates * d3.coop!.killReward.buckwheat
    + (within(eco.ssireum!.round, w) ? eco.ssireum!.buckwheat / SEATS : 0);
  const tokens = (i === 0 ? b.tokens.start : 0) + 10 * b.difficulties!.normal.tokensPerRound + (within(eco.team!.toRound, w) ? eco.team!.tokens : 0);
  return { coins, muk, tokens, start: i === 0 ? eco.startingBuckwheat : 0 };
}

describe('six ten-round windows reconcile with the personal budget', () => {
  const rows = WINDOWS.map(windowRow);

  test('묵 earnings by window are 3, 3, 2, 3⅙, 2, 3', () => {
    expect(rows.map(r => fmt(r.muk))).toEqual(['3', '3', '2', '3⅙', '2', '3']);
    let total = 0;
    const cumulative = rows.map(r => fmt((total += r.start + r.muk)));
    expect(cumulative).toEqual(['4', '7', '9', '12⅙', '14⅙', '17⅙']);
    // the R60 boss pays its 묵 after the last combat starts
    expect(fmt(total - b.bossBuckwheat)).toBe('15⅙');
  });

  test('3,482.7냥 and 185 불 over the game, with the decile flows in both references', () => {
    expect(rows.map(r => fmt(r.coins))).toEqual(['582.7', '582.7', '586', '582.7', '566', '582.7']);
    expect(fmt(rows.reduce((s, r) => s + r.coins, 0))).toBe('3,482.7');
    // 불 3 a round since the economy pass (the spec's table had 2: 24/20/21/20/20/20, 125)
    expect(rows.map(r => r.tokens)).toEqual([34, 30, 31, 30, 30, 30]);
    expect(rows.reduce((s, r) => s + r.tokens, 0)).toBe(185);
    let total = 0;
    for (const [name, text] of docs) {
      total = 0;
      rows.forEach((r, i) => {
        total += r.start + r.muk;
        const [from, to] = WINDOWS[i]!;
        const line = `| ${from}~${to} | ${fmt(r.coins)} | ${r.start} | ${fmt(r.muk)} | ${fmt(total)} | ${r.tokens} |`;
        expect(text, `${name}: ${line}`).toContain(line);
      });
    }
  });

  test('ordinary unit inflow before bundles: 157 units and 140 after sales', () => {
    // every 불 but the team one (reserved) and the 30 changed into coins is a summon
    const summons = rows.reduce((s, r) => s + r.tokens, 0) - eco.team!.tokens - CONVERT * WINDOWS.length;
    const perSummon = [1, 2, 4].reduce((s, v, i) => s + v * b.summonOdds[i]!, 0);
    const drops = eco.drops!.reduce((s, d) => s + 2 ** (d.grade - 1), 0);
    expect(summons + eco.drops!.length).toBe(157);
    expect(Math.round((summons * perSummon + drops - 24) * 10) / 10).toBe(140);
    expect(readDocs(draft)[0]![1]).toContain('| **157** | **140** |');
  });

  test('four grade-6 example: 4/8/4묵, 3,365냥 spent and 117.7냥 left', () => {
    const upgrades = 3125;
    const spend = upgrades + 4 * 60;
    expect(spend).toBe(3365);
    expect(fmt(rows.reduce((s, r) => s + r.coins, 0) - spend)).toBe('117.7');
    expect([4, 4 * 2, 4].reduce((s, x) => s + x, 0)).toBe(16);
    for (const [name, text] of docs) expect(text, name).toContain('3,365');
  });

  test('R10/R20 recruits: 2 paid attempts, 4묵 and 120냥 of kill income forgone, 11묵 before R60 for two draws', () => {
    const t = eco.tame!.targets;
    const cost = (enemy: string) => t.find(x => x.enemy === enemy)!.cost;
    const attempts = [cost('jinegaksi'), cost('gangcheori')];
    expect([attempts.reduce((s, c) => s + (c.buckwheat ?? 0), 0), attempts.reduce((s, c) => s + (c.coins ?? 0), 0)]).toEqual([2, 105]);
    const preR60NonWinner = 17 + 1 / SEATS - b.bossBuckwheat - eco.ssireum!.buckwheat / SEATS;
    const supply = preR60NonWinner - 2 * b.bossBuckwheat;
    expect(supply).toBeCloseTo(11, 9);
    const spend = 2 + 2 * 2 + 3;
    expect(supply - spend).toBeCloseTo(2, 9);
  });

  test('no former request or delivery route is left in the design drafts', () => {
    for (const [name, text] of readDocs(draft, 'design/content-draft-116-v5.md', 'design/content-draft-116-v6.md')) {
      for (const stale of ['설화 의뢰', '의뢰 거절', '묵장수', '배달 버튼', 'storyTarget', 'transferOffer', '쇠밥 한 끼', 'R12 입장', '미션 입장']) {
        expect(text.includes(stale), `${name}: ${stale}`).toBe(false);
      }
    }
  });
});
