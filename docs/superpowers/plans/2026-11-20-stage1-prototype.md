# 1단계 1인 프로토타입 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브라우저에서 혼자 20라운드를 처음부터 끝까지 할 수 있는 「도깨비 랜덤 디펜스」(도랜디) 1인 프로토타입과, 같은 게임 로직을 화면 없이 돌리는 밸런스 시뮬레이터를 만든다.

**Architecture:** npm workspaces 모노레포다. `packages/logic`은 DOM과 Phaser를 모르는 순수 TypeScript 게임 로직이고, 50ms 고정 틱으로 상태를 바꾼다. `packages/sim`은 logic을 화면 없이 돌리는 봇과 CSV 출력이다. `packages/client`는 Vite + Phaser 화면이다. 고개는 Phaser 캔버스로, 패널은 DOM으로 그린다. 2단계 서버는 logic을 그대로 가져다 쓴다.

**Tech Stack:** Node 22, TypeScript 5.8 (strict, ESM), Vitest 3.2, Vite 6.3, Phaser 3.90.0, tsx 4 (sim 실행)

**Spec:** `docs/design/2026-11-20-stage1-spec.md` (이하 "명세"). 상위 문서는 `docs/design/2026-11-20-6p-random-defense-design.md`. 실행자는 명세를 함께 읽는다. 수치는 명세에서 그대로 옮긴다.

## Global Constraints

- `packages/logic`은 `phaser`, DOM, `Math.random`, `Date`, `performance`를 쓰지 않는다. 랜덤은 `rng.ts`의 시드 흐름으로만 굴린다.
- 시간은 모두 틱 단위다. 1틱 = 50ms. 초를 틱으로 바꿀 때는 `Math.round(seconds * 20)`.
- 피해와 체력은 정수다. 피해는 계산 끝에 `Math.max(1, Math.round(x))`.
- 같은 시드와 같은 명령열이면 `GameState`가 바이트 단위로 같아야 한다(`data` 필드 제외).
- 유닛·레시피·적·웨이브·밸런스·강화 수치는 `packages/logic/data/*.json`에만 둔다. 코드에 숫자를 박지 않는다.
- 화면 문구는 한국어다. 원작(원피스) 이름·그림, 워크래프트 3 에셋을 쓰지 않는다.
- 게임 로직은 고개 수를 하드코딩하지 않는다. 1단계는 고개 하나만 만들지만, 고개 하나의 상태를 `GameState` 안에 모아 둔다.
- 기준 해상도는 640×360이고, 정수 배로 확대한다.

## Review Focus

1. 화면에서 두 번 누른 명령처럼, 이미 없는 유닛이나 칸을 가리키는 명령이 들어와도 게임이 멈추지 않고 그 명령만 거절된다. 테스트는 Task 5와 6에 있다.
2. 칸이 꽉 찬 상태에서 소환 보정 유닛이 나오면 사라지지 않고 보관되었다가, 칸이 생기면 놓인다. 테스트는 Task 5에 있다.
3. 자원이 모자란 명령(도깨비불 0개로 뚝딱, 엽전 부족으로 강화, 최대 단계 강화)은 자원을 건드리지 않고 이유와 함께 거절된다. 테스트는 Task 5와 7에 있다.
4. 탭을 오래 백그라운드에 뒀다 돌아와도 한 프레임에 수천 틱을 몰아 돌리지 않는다. 한 프레임에 최대 40틱만 돌리고 나머지는 버린다. 테스트는 Task 10에 있다.
5. 판이 끝난 뒤 들어온 명령은 거절되고, 틱도 더 진행되지 않는다. 테스트는 Task 4에 있다.

---

## 파일 구조

```
package.json                     workspaces, 공용 스크립트
tsconfig.base.json
vitest.config.ts
.gitignore
packages/logic/
  package.json                   name @dorandi/logic, exports ./src/index.ts
  data/units.json recipes.json enemies.json waves.json balance.json upgrades.json
  src/rng.ts                     시드 난수
  src/types.ts                   데이터·상태·명령·이벤트 타입
  src/data.ts                    JSON 로더와 파생 수치
  src/validate.ts                데이터 검증
  src/lane.ts                    고개 기하
  src/game.ts                    createGame, step (틱 처리 순서)
  src/flow.ts                    라운드·등장·이동·한도·보스 제한 시간
  src/units.ts                   소환, 배치, 이동, 판매, 바꾸기
  src/combine.ts                 레시피 조회와 조합
  src/combat.ts                  피해 계산, 공격 간격, 대상 선택, 공격
  src/effects.ts                 상태 이상, 스킬, 오라, 바닥 불길
  src/upgrades.ts                강화
  src/stats.ts                   라운드 통계, boardDps
  src/testing.ts                 테스트 도우미 (forceRound 등)
  src/index.ts
  scripts/validate.ts            npm run validate
  test/*.test.ts
packages/sim/
  package.json                   name @dorandi/sim
  src/bots.ts  src/runner.ts  src/csv.ts  src/cli.ts  src/econ.ts
  test/*.test.ts
packages/client/
  package.json                   name @dorandi/client
  index.html  vite.config.ts
  public/sprites/                sotlid.png bitjaru.png japgwi.png
  src/main.ts  src/driver.ts  src/layout.ts  src/LaneScene.ts
  src/ui/hud.ts  src/ui/panels.ts  src/ui/helper.ts  src/ui/dex.ts  src/ui/result.ts  src/ui/models.ts  src/ui/style.css
  src/sfx.ts
  test/*.test.ts
docs/balance/stage1-tuning.md
```

## 공용 타입 (Task 2가 `src/types.ts`에 만든다. 다른 Task는 이 이름 그대로 쓴다)

```ts
export type DamageType = 'physical' | 'magical';
export type Trigger =
  | { kind: 'chance'; p: number } | { kind: 'nth'; n: number }
  | { kind: 'always' } | { kind: 'periodic'; seconds: number } | { kind: 'aura' };
export type Effect =
  | { kind: 'extraAttack' }
  | { kind: 'crit'; mult: number }
  | { kind: 'execute'; hpBelow: number; mult: number }
  | { kind: 'splash'; radius: number; mult: number }
  | { kind: 'pierce'; length: number; mult: number }
  | { kind: 'allInRange'; mult: number }
  | { kind: 'stun'; seconds: number }
  | { kind: 'slow'; pct: number; seconds: number; radius?: number }
  | { kind: 'knockback'; distance: number }
  | { kind: 'vuln'; pct: number; seconds: number; damageType: DamageType | 'all'; maxStacks?: number }
  | { kind: 'dot'; mult: number; seconds: number }
  | { kind: 'groundFire'; length: number; seconds: number; pulseMult: number }
  | { kind: 'onKillExplode'; radius: number; mult: number }
  | { kind: 'auraAttackSpeed'; pct: number }
  | { kind: 'auraAttackPower'; pct: number; damageType: DamageType | 'all' }
  | { kind: 'auraEnemyVuln'; pct: number };
export interface SkillDef { trigger: Trigger; effects: Effect[] }
export interface UnitDef { id: string; name: string; grade: number; damageType: DamageType; range: number; interval: number; factor: number; skills: SkillDef[] }
export interface RecipeDef { result: string; materials: string[] }
export interface EnemyDef { id: string; name: string; boss: boolean; hpMult: number; hp?: number; speed: number; resist: { physical: number; magical: number } }
export type WaveDef = { round: number; type: 'normal'; pattern: string[] } | { round: number; type: 'boss'; boss: string };
export interface BalanceDef {
  tickMs: number; prepSeconds: number; roundSeconds: number; bossRoundSeconds: number;
  spawnCount: number; spawnIntervalSeconds: number; rounds: number;
  hp: { base: number; coef: number; exp: number };
  gradeDps: { base: number; mult: number };
  tokens: { start: number; perRound: number; toCoins: number };
  coins: { perKill: number; roundEnd: number; boss: number };
  bossBuckwheat: number; sellPrice: number[]; limit: number; limitSeconds: number;
  summonOdds: number[]; pityEvery: number; grid: { cols: number; rows: number; initialOpenRows: number };
  bossCcFactor: number; vulnCap: number; auraRadius: number; pulseSeconds: number;
}
export type UpgradeId = 'physical' | 'magical' | 'polish' | 'slots';
export interface UpgradeDef { id: UpgradeId; label: string; max: number; costPerLevel: number; pct?: number; openCount?: number }
export interface GameData { units: UnitDef[]; recipes: RecipeDef[]; enemies: EnemyDef[]; waves: WaveDef[]; balance: BalanceDef; upgrades: UpgradeDef[] }

export interface RngState { s: number }
export interface Unit { id: number; defId: string; cooldown: number; attackCount: number; periodic: number[] }
export interface Vuln { pct: number; damageType: DamageType | 'all'; ticks: number; stacks: number }
export interface Dot { perPulse: number; pulsesLeft: number; nextPulse: number }
export interface Enemy {
  id: number; defId: string; hp: number; maxHp: number; d: number; boss: boolean; round: number;
  stunTicks: number; slow: { pct: number; ticks: number } | null;
  vulns: Record<string, Vuln>; dots: Record<string, Dot>;
}
export interface GroundFire { source: string; from: number; to: number; basePerPulse: number; nextPulse: number; endTick: number }
export interface RoundStats { round: number; hpSpawned: number; damageDealt: number; maxEnemies: number; endEnemies: number; bossKillSeconds: number | null }
export interface GameResult { outcome: 'clear' | 'defeat'; reason: 'limit' | 'boss' | null; round: number }
export interface GameState {
  data: GameData; tick: number; phase: 'prep' | 'round' | 'ended';
  round: number; roundStartTick: number; roundEndTick: number; spawned: number;
  result: GameResult | null;
  tokens: number; coins: number; buckwheat: number;
  slots: (Unit | null)[]; open: boolean[];
  pendingPity: string[]; summonCounts: Record<string, number>; grade1Summons: number;
  enemies: Enemy[]; fires: GroundFire[];
  upgrades: Record<UpgradeId, number>;
  overLimitTicks: number; helperOpens: number;
  stats: RoundStats[];
  rng: { summon: RngState; combat: RngState };
  nextId: number;
}
export type Command =
  | { type: 'summon' } | { type: 'combine'; result: string } | { type: 'sell'; slot: number }
  | { type: 'move'; from: number; to: number } | { type: 'convertToken' }
  | { type: 'upgrade'; id: UpgradeId } | { type: 'helperOpened' };
export type RejectReason = 'ended' | 'noToken' | 'noSlot' | 'noUnit' | 'closedSlot' | 'missingMaterials' | 'noCoins' | 'maxed' | 'unknown';
export type GameEvent =
  | { type: 'roundStart'; round: number } | { type: 'spawn'; enemyId: number }
  | { type: 'summon'; unitId: number; defId: string; grade: number; slot: number }
  | { type: 'combine'; unitId: number; defId: string; slot: number }
  | { type: 'attack'; unitId: number; enemyId: number }
  | { type: 'damage'; enemyId: number; amount: number; source: string }
  | { type: 'kill'; enemyId: number } | { type: 'speedChange'; enemyId: number; d: number; speed: number }
  | { type: 'ended'; result: GameResult };
export interface StepResult { events: GameEvent[]; rejected: { command: Command; reason: RejectReason }[] }
```

---

### Task 1: 저장소와 작업 공간, 시드 난수

**Files:**
- Create: `.gitignore`, `package.json`, `tsconfig.base.json`, `vitest.config.ts`
- Create: `packages/logic/package.json`, `packages/logic/tsconfig.json`, `packages/logic/src/rng.ts`
- Test: `packages/logic/test/rng.test.ts`

**Interfaces:**
- Produces: `createRng(seed: number): RngState`, `nextFloat(r: RngState): number` (0 이상 1 미만, r를 바꿈), `nextInt(r: RngState, n: number): number` (0..n-1), `deriveSeed(seed: number, label: string): number`. `RngState`는 `{ s: number }`의 평범한 객체라 JSON으로 복사할 수 있다.

- [ ] **Step 1: 저장소를 만든다**

```bash
cd C:/workspace/web-game
git init -b main
```

`.gitignore`: `node_modules/`, `dist/`, `sim-out/`, `*.w3x`, `.superpowers/`, `*.log`

루트 `package.json`: `"private": true`, `"type": "module"`, `"workspaces": ["packages/*"]`, scripts `"test": "vitest run"`, `"validate": "npm run validate -w @dorandi/logic"`, `"sim": "npm run sim -w @dorandi/sim --"`, `"econ": "npm run econ -w @dorandi/sim"`, `"dev": "npm run dev -w @dorandi/client"`. devDependencies: `typescript@^5.8.0`, `vitest@^3.2.0`, `tsx@^4.19.0`.

`tsconfig.base.json`: `strict`, `target ES2022`, `module ESNext`, `moduleResolution Bundler`, `resolveJsonModule`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax false`, `skipLibCheck`.

`vitest.config.ts`: `test.include = ['packages/*/test/**/*.test.ts']`.

`packages/logic/package.json`: name `@dorandi/logic`, `"type": "module"`, `"exports": { ".": "./src/index.ts", "./testing": "./src/testing.ts" }`, script `"validate": "tsx scripts/validate.ts"`.

Run: `npm install`
Expected: 오류 없이 끝남

- [ ] **Step 2: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, test } from 'vitest';
import { createRng, nextFloat, nextInt, deriveSeed } from '../src/rng';

describe('rng', () => {
  test('same seed gives same sequence in [0,1)', () => {
    const a = createRng(42), b = createRng(42);
    const xs = Array.from({ length: 5 }, () => nextFloat(a));
    const ys = Array.from({ length: 5 }, () => nextFloat(b));
    expect(xs).toEqual(ys);
    for (const x of xs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });
  test('different seeds differ', () => {
    expect(nextFloat(createRng(1))).not.toBe(nextFloat(createRng(2)));
  });
  test('nextInt covers 0..n-1', () => {
    const r = createRng(7); const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) { const v = nextInt(r, 6); expect(Number.isInteger(v)).toBe(true); seen.add(v); }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });
  test('deriveSeed is stable and separates labels', () => {
    expect(deriveSeed(7, 'summon')).toBe(deriveSeed(7, 'summon'));
    expect(deriveSeed(7, 'summon')).not.toBe(deriveSeed(7, 'combat'));
  });
  test('state survives JSON copy', () => {
    const r = createRng(3); nextFloat(r);
    const copy = JSON.parse(JSON.stringify(r));
    expect(nextFloat(copy)).toBe(nextFloat(r));
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run packages/logic/test/rng.test.ts`
Expected: FAIL, `../src/rng`를 찾지 못함

- [ ] **Step 4: `packages/logic/src/rng.ts`를 구현한다**

mulberry32를 `r.s`(uint32) 위에서 돌린다. `deriveSeed`는 label의 FNV-1a 32비트 해시와 seed를 XOR한 뒤 mulberry32 한 번으로 섞은 uint32다. `nextInt`는 `Math.floor(nextFloat(r) * n)`.

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run packages/logic/test/rng.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: 커밋한다**

```bash
git add .gitignore package.json package-lock.json tsconfig.base.json vitest.config.ts packages/logic docs art .mcp.json
git commit -m "chore: set up workspace and seeded rng"
```

---

### Task 2: 데이터 타입, 22종 JSON, 로더, 검증

**Files:**
- Create: `packages/logic/src/types.ts` (위 "공용 타입" 그대로)
- Create: `packages/logic/data/units.json`, `recipes.json`, `enemies.json`, `waves.json`, `balance.json`, `upgrades.json`
- Create: `packages/logic/src/data.ts`, `packages/logic/src/validate.ts`, `packages/logic/scripts/validate.ts`
- Test: `packages/logic/test/data.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `loadGameData(): GameData`
  - `unitDef(data, id): UnitDef`, `enemyDef(data, id): EnemyDef`
  - `gradeDps(b: BalanceDef, grade: number): number` = `b.gradeDps.base * b.gradeDps.mult ** (grade - 1)`
  - `unitAttack(def: UnitDef, b: BalanceDef): number` = `gradeDps × interval × factor` (반올림하지 않음)
  - `enemyHp(def: EnemyDef, round: number, b: BalanceDef): number` = 보스는 `def.hp`, 아니면 `Math.round((b.hp.base + b.hp.coef * round ** b.hp.exp) * def.hpMult)`
  - `gradeValue(grade: number): number` = 1등급 1, 2등급 2, 3등급 4, 4등급 8
  - `recipeValue(data, recipe): number` = 재료 `gradeValue` 합
  - `validateData(data: GameData): { errors: string[]; warnings: string[] }`

**데이터 값**

- `balance.json`: 명세 2·3·5·7·9장 값. `tickMs 50`, `prepSeconds 20`, `roundSeconds 40`, `bossRoundSeconds 75`, `spawnCount 30`, `spawnIntervalSeconds 0.8`, `rounds 20`, `hp {base 40, coef 12, exp 1.5}`, `gradeDps {base 10, mult 2.6}`, `tokens {start 4, perRound 2, toCoins 25}`, `coins {perKill 1, roundEnd 10, boss 60}`, `bossBuckwheat 2`, `sellPrice [5,10,20,40]`, `limit 60`, `limitSeconds 5`, `summonOdds [0.7,0.25,0.05]`, `pityEvery 7`, `grid {cols 6, rows 4, initialOpenRows 3}`, `bossCcFactor 0.5`, `vulnCap 0.5`, `auraRadius 1.5`, `pulseSeconds 0.5`
- `upgrades.json` (명세 8장): `physical` 물딜 강화 max 10, cost 25, pct 0.10 / `magical` 마딜 강화 max 10, cost 25, pct 0.10 / `polish` 등급 손질 max 10, cost 25, pct 0.06 / `slots` 칸 늘리기 max 3, cost 50, openCount 2
- `enemies.json` (명세 3장): `japgwi` 잡귀 hpMult 1, speed 1.6, resist 0/0 / `geuseundae` 그슨대 1, 2.2, physical 0.5 / `dueoksini` 두억시니 1.5, 1.1, magical 0.5 / `jinegaksi` 지네각시 boss, hp 3000, speed 0.9, 0/0 / `gangcheori` 강철이 boss, hp 8000, 0.9, magical 0.3
- `waves.json` (명세 3.2): 일반 라운드는 `pattern`을 30마리 동안 순환한다. 잡귀 라운드 `["japgwi"]`, 섞임 `["japgwi","geuseundae","dueoksini"]`. 10라운드 `jinegaksi`, 20라운드 `gangcheori`
- `units.json`과 `recipes.json`: 명세 10장 표 그대로. 배열 순서는 표 순서이고, 이 순서가 "목록 순서"(소환 보정 동률)다. id와 스킬 인코딩:

| id | 이름 | skills |
| --- | --- | --- |
| bitjaru | 빗자루 | chance .2 → splash r1.5 ×0.6 |
| jipsin | 짚신 | chance .2 → extraAttack |
| sotlid | 솥뚜껑 | chance .2 → stun 0.5 |
| dadeumi | 다듬이방망이 | chance .2 → vuln .15 3s physical |
| horong | 호롱 | chance .2 → dot ×1.0 3s |
| bujigaengi | 부지깽이 | always → execute hpBelow .3 ×2 |
| buchae | 부채 | chance .2 → knockback 1 |
| ki | 키 | chance .2 → splash r1.5 ×0.7 |
| gamasot | 가마솥 | chance .2 → stun 1 |
| meongseok | 멍석 | chance .2 → slow .3 2s radius 1.5 |
| jeolgu | 절구 | chance .2 → crit ×2, splash r1.5 ×0.5 |
| hwaro | 화로 | always → groundFire length 1, 2s, pulse ×0.15 |
| cheongsachorong | 청사초롱 | aura → auraAttackSpeed .10 |
| hwaetbul | 횃불 | chance .2 → pierce length 2 ×0.8 |
| didilbangga | 디딜방아 | nth 5 → crit ×2.5, stun 1 |
| jangdok | 장독 | aura → auraEnemyVuln .10 |
| pulmu | 풀무 | aura → auraAttackPower .15 magical |
| jwibul | 쥐불 | always → groundFire length 2, 3s, pulse ×0.2 |
| yeonjabangga | 연자방아 | periodic 2 → allInRange ×1.0 |
| moru | 모루 | always → vuln .04 4s physical maxStacks 5 |
| onggigama | 옹기가마 | always → splash r1.5 ×1.0 / always → onKillExplode r1.5 ×0.5 |
| daljip | 달집 | aura → auraAttackSpeed .20 / periodic 8 → allInRange ×3.0 |

**검증 규칙** (명세 14장)
- errors:
  - 레시피가 없는 유닛 id를 가리킴
  - 2등급 이상인데 레시피가 없음
  - 1~3등급인데 어느 레시피의 재료도 아님
  - `recipeValue`가 결과 등급의 `gradeValue`와 다름
  - 웨이브나 적 id가 없는 것을 가리킴
- warnings:
  - 1등급이 물딜 결과 레시피와 마딜 결과 레시피 중 한쪽에만 쓰임. 2·3등급 레시피에 직접 들어간 경우만 센다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, test } from 'vitest';
import { loadGameData, unitDef, enemyDef, gradeDps, unitAttack, enemyHp } from '../src/data';
import { validateData as v } from '../src/validate';

const data = loadGameData();

describe('data', () => {
  test('22 units by grade and type', () => {
    const byGrade = [1, 2, 3, 4].map(g => data.units.filter(u => u.grade === g).length);
    expect(byGrade).toEqual([8, 6, 4, 4]);
    expect(data.units.filter(u => u.damageType === 'physical').length).toBe(11);
    expect(data.recipes.length).toBe(14);
  });
  test('jangdok recipe', () => {
    expect([...data.recipes.find(r => r.result === 'jangdok')!.materials].sort()).toEqual(['gamasot', 'ki', 'sotlid']);
  });
  test('derived numbers', () => {
    expect(unitAttack(unitDef(data, 'sotlid'), data.balance)).toBeCloseTo(13.2);
    expect(gradeDps(data.balance, 4)).toBeCloseTo(175.76);
    expect(enemyHp(enemyDef(data, 'japgwi'), 1, data.balance)).toBe(52);
    expect(enemyHp(enemyDef(data, 'japgwi'), 10, data.balance)).toBe(419);
    expect(enemyHp(enemyDef(data, 'japgwi'), 19, data.balance)).toBe(1034);
    expect(enemyHp(enemyDef(data, 'dueoksini'), 10, data.balance)).toBe(629);
    expect(enemyHp(enemyDef(data, 'jinegaksi'), 10, data.balance)).toBe(3000);
  });
  test('shipped data validates with 4 one-sided warnings', () => {
    const r = v(data);
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBe(4);
    for (const id of ['sotlid', 'dadeumi', 'horong', 'buchae']) expect(r.warnings.some(w => w.includes(id))).toBe(true);
  });
  test('validator catches broken data', () => {
    const bad = structuredClone(data);
    bad.recipes.push({ result: 'gamasot', materials: ['nope', 'ki'] });
    bad.recipes.find(r => r.result === 'jangdok')!.materials = ['sotlid', 'sotlid', 'ki', 'ki'];
    bad.recipes = bad.recipes.filter(r => r.result !== 'moru');
    const r = v(bad);
    expect(r.errors.some(e => e.includes('nope'))).toBe(true);
    expect(r.errors.some(e => e.includes('jangdok'))).toBe(true);
    expect(r.errors.some(e => e.includes('moru'))).toBe(true);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/logic/test/data.test.ts`
Expected: FAIL, 모듈 없음

- [ ] **Step 3: `types.ts`, JSON 6개, `data.ts`, `validate.ts`를 구현한다**

`loadGameData`는 JSON을 정적 import해 `GameData`로 묶는다. `scripts/validate.ts`는 결과를 출력한다. 오류가 있으면 `process.exitCode = 1`, 경고는 출력만 한다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run packages/logic/test/data.test.ts && npm run validate`
Expected: PASS. validate는 `errors: 0`과 경고 4줄을 출력한다

- [ ] **Step 5: 커밋한다**

```bash
git add packages/logic
git commit -m "feat(logic): add stage 1 data, loader and validator"
```

---

### Task 3: 고개 기하

**Files:**
- Create: `packages/logic/src/lane.ts`
- Test: `packages/logic/test/lane.test.ts`

**Interfaces:**
- Produces:
  - `interface Vec2 { x: number; y: number }`
  - `interface Cell { index: number; col: number; row: number; x: number; y: number; isEdge: boolean }`
  - `interface Lane { cols: number; rows: number; cells: Cell[]; perimeter: number; pointAt(d: number): Vec2; coverage(cellIndex: number, range: number): [number, number][]; coverageLength(cellIndex: number, range: number): number }`
  - `createLane(cols: number, rows: number): Lane`
  - `dist(a: Vec2, b: Vec2): number`
  - `loopPos(d: number, perimeter: number): number` = d를 [0, perimeter)로 접은 값

**기하 규칙** (명세 1장)
- 격자는 [0, cols] × [0, rows]에 놓인다. 칸 중심은 (col+0.5, row+0.5)이고, 칸 번호는 `row*cols+col`이다.
- 경로 중심선은 (−0.5, −0.5)에서 시작해 시계 방향으로 도는 직사각형이다. 꼭짓점은 (cols+0.5, −0.5), (cols+0.5, rows+0.5), (−0.5, rows+0.5)이고, 둘레는 2(cols+1+rows+1)다.
- `isEdge`는 첫 줄, 마지막 줄, 첫 열, 마지막 열이다.
- `coverage`는 경로 위에서 칸 중심까지 직선 거리가 range 이하인 구간들이다. 경로 거리 [0, perimeter) 기준이고, 이어진 구간은 합친다. 각 변과 원의 교차를 해석적으로 구한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, test } from 'vitest';
import { createLane, loopPos } from '../src/lane';

const lane = createLane(6, 4);

describe('lane', () => {
  test('path points', () => {
    expect(lane.perimeter).toBe(24);
    expect(lane.pointAt(0)).toEqual({ x: -0.5, y: -0.5 });
    expect(lane.pointAt(3.5)).toEqual({ x: 3, y: -0.5 });
    expect(lane.pointAt(7)).toEqual({ x: 6.5, y: -0.5 });
    expect(lane.pointAt(12)).toEqual({ x: 6.5, y: 4.5 });
    expect(lane.pointAt(19)).toEqual({ x: -0.5, y: 4.5 });
    expect(lane.pointAt(24)).toEqual(lane.pointAt(0));
    expect(lane.pointAt(30)).toEqual(lane.pointAt(6));
    expect(loopPos(-1, 24)).toBe(23);
  });
  test('cells', () => {
    expect(lane.cells.length).toBe(24);
    expect(lane.cells[0]).toMatchObject({ x: 0.5, y: 0.5, isEdge: true });
    expect(lane.cells.filter(c => !c.isEdge).map(c => c.index)).toEqual([7, 8, 9, 10, 13, 14, 15, 16]);
  });
  test('coverage matches spec table', () => {
    expect(lane.coverageLength(2, 1.5)).toBeCloseTo(2.236, 2);
    expect(lane.coverageLength(2, 2.0)).toBeCloseTo(3.464, 2);
    expect(lane.coverageLength(2, 3.0)).toBeCloseTo(5.657, 2);
    expect(lane.coverageLength(8, 2.0)).toBeCloseTo(0, 5);
    expect(lane.coverageLength(8, 2.5)).toBeCloseTo(3.0, 2);
    expect(lane.coverageLength(8, 3.0)).toBeCloseTo(4.472, 2);
  });
  test('coverage interval position', () => {
    const [iv] = lane.coverage(2, 1.5);
    expect(iv![0]).toBeCloseTo(3 - 1.118, 2);
    expect(iv![1]).toBeCloseTo(3 + 1.118, 2);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/logic/test/lane.test.ts`
Expected: FAIL

- [ ] **Step 3: `lane.ts`를 구현한다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run packages/logic/test/lane.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add packages/logic
git commit -m "feat(logic): lane geometry and range coverage"
```

---

### Task 4: 게임 생성과 라운드 진행

**Files:**
- Create: `packages/logic/src/game.ts`, `packages/logic/src/flow.ts`, `packages/logic/src/stats.ts`, `packages/logic/src/testing.ts`, `packages/logic/src/index.ts`
- Test: `packages/logic/test/flow.test.ts`

**Interfaces:**
- Consumes: Task 1 `createRng`, `deriveSeed`. Task 2 `loadGameData`, `enemyHp`, `enemyDef`. Task 3 `createLane`
- Produces:
  - `createGame(data: GameData, seed: number): GameState`
    - `rng.summon = createRng(deriveSeed(seed,'summon'))`, `rng.combat = createRng(deriveSeed(seed,'combat'))`
    - 위 세 줄(18칸)은 열림, `tokens = balance.tokens.start`, `phase 'prep'`
  - `step(state: GameState, commands: Command[]): StepResult`: 지금 `state.tick` 하나를 명세 4.5 순서로 처리한 뒤 `tick += 1`
  - `laneOf(state: GameState): Lane`: data.grid로 만든 Lane을 data 객체마다 한 번만 만들어 캐시
  - `countNormalEnemies(state): number` (`stats.ts`)
  - `testing.ts`:
    - `forceRound(state, round: number): void`: 남은 적을 지우고 지금 틱에 그 라운드를 시작한다. 일반 라운드 시작과 똑같이 `tokens += perRound`, `stats`에 새 줄, `spawned = 0`
    - `spawnEnemyForTest(state, defId: string, d: number, hp?: number): Enemy`
    - `placeUnitForTest(state, defId: string, slot: number): Unit`
    - `makeData(patch: (d: GameData) => void): GameData`: loadGameData 복사본을 고쳐 돌려준다
  - Task 5~8은 `step` 안의 자리에 자기 처리를 끼운다. `game.ts`는 아래 순서로 함수를 부르는 얇은 조정자로 둔다.
    1. `applyCommands` (Task 5~7이 채움)
    2. `spawnTick` (flow)
    3. `moveEnemies` (flow)
    4. `tickStatuses` (Task 8, 이 Task에서는 빈 함수)
    5. `unitAttacks` (Task 7)
    6. `resolveKills` (Task 7, 이 Task에서는 hp ≤ 0 제거만)
    7. `checkEnd` (flow)

**흐름 규칙** (명세 2·9장)
- 0~399틱은 준비 시간이다. 400틱에 1라운드가 시작된다. 라운드가 시작되면 `tokens += perRound`, `roundStart` 이벤트가 나가고, `stats`에 새 줄이 생긴다.
- 일반 라운드:
  - `roundStartTick + 16k`(k = 0..29) 틱에 pattern을 순환하며 하나씩 등장한다.
  - `roundStartTick + 800` 틱에 끝난다. 이때 `coins += roundEnd`, `endEnemies`를 기록하고, 같은 틱에 다음 라운드를 시작한다.
- 보스 라운드:
  - 시작 틱에 보스가 등장한다.
  - `roundStartTick + 1500` 틱에 보스가 살아 있으면 `defeat/boss`. 죽었으면 라운드를 마치고 다음으로 간다.
- 등장 위치는 d = 0이다.
- 이동: 스턴이 아니면 `d += speed × (1 − slowPct) / 20`.
- 한도: 보스가 아닌 적 수가 `limit`을 넘으면 `overLimitTicks += 1`, 아니면 0으로 되돌린다. `overLimitTicks ≥ 100`이면 `defeat/limit`.
- 끝나면 `phase 'ended'`, `ended` 이벤트가 나간다. 이후 `step`은 틱을 늘리지 않고, 모든 명령을 `ended`로 거절한다.
- 통계: `hpSpawned`는 그 라운드 일반 적 maxHp 합이다. `maxEnemies`는 그 라운드 동안 `countNormalEnemies`의 최댓값이다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, test } from 'vitest';
import { createGame, step, loadGameData, countNormalEnemies } from '../src/index';
import { forceRound, spawnEnemyForTest } from '../src/testing';

const data = loadGameData();
const run = (s: ReturnType<typeof createGame>, n: number) => { for (let i = 0; i < n; i++) step(s, []); };

describe('flow', () => {
  test('initial state', () => {
    const s = createGame(data, 1);
    expect(s).toMatchObject({ tick: 0, phase: 'prep', tokens: 4, coins: 0, round: 0 });
    expect(s.open.filter(Boolean).length).toBe(18);
    expect(s.open.slice(18).some(Boolean)).toBe(false);
  });
  test('round 1 starts at tick 400 and spawns every 16 ticks', () => {
    const s = createGame(data, 1);
    run(s, 400); expect(s.phase).toBe('prep');
    run(s, 1); expect(s).toMatchObject({ phase: 'round', round: 1, tokens: 6 });
    expect(s.enemies.length).toBe(1); expect(s.enemies[0]!.hp).toBe(52);
    run(s, 16 * 29); expect(s.enemies.length).toBe(30);
    run(s, 16); expect(s.enemies.length).toBe(30);
  });
  test('enemy moves 1.6 cells per second', () => {
    const s = createGame(data, 1);
    run(s, 401 + 20);
    expect(s.enemies[0]!.d).toBeCloseTo(1.6 * 21 / 20, 5);
  });
  test('round end pays coins and starts next round on the same tick', () => {
    const s = createGame(data, 1);
    run(s, 1201);
    expect(s).toMatchObject({ round: 2, coins: 10, tokens: 8 });
  });
  test('limit defeat after 5 seconds over 60, timer resets', () => {
    const s = createGame(data, 1); forceRound(s, 1);
    s.enemies = [];
    for (let i = 0; i < 61; i++) spawnEnemyForTest(s, 'japgwi', 0, 10 ** 9);
    s.roundEndTick = 10 ** 9; s.spawned = 30;
    run(s, 50); s.enemies.pop(); run(s, 1); expect(s.overLimitTicks).toBe(0);
    spawnEnemyForTest(s, 'japgwi', 0, 10 ** 9);
    run(s, 99); expect(s.phase).not.toBe('ended');
    run(s, 1); expect(s.result).toEqual({ outcome: 'defeat', reason: 'limit', round: 1 });
  });
  test('boss round: spawn, tokens, fail after 75s', () => {
    const s = createGame(data, 1); forceRound(s, 10);
    const tokens = s.tokens;
    run(s, 1);
    expect(s.enemies.find(e => e.boss)!.hp).toBe(3000);
    run(s, 1499); expect(s.phase).not.toBe('ended');
    run(s, 1); expect(s.result).toEqual({ outcome: 'defeat', reason: 'boss', round: 10 });
    expect(tokens).toBeGreaterThan(0);
  });
  test('after end, commands are rejected and time stops', () => {
    const s = createGame(data, 1); forceRound(s, 10); run(s, 1501);
    const t = s.tick;
    const r = step(s, [{ type: 'summon' }]);
    expect(r.rejected[0]!.reason).toBe('ended'); expect(s.tick).toBe(t);
  });
  test('stats track spawned hp and max enemies', () => {
    const s = createGame(data, 1); run(s, 1201);
    expect(s.stats[0]).toMatchObject({ round: 1, hpSpawned: 52 * 30, maxEnemies: 30, endEnemies: 30 });
    expect(countNormalEnemies(s)).toBeGreaterThanOrEqual(30);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/logic/test/flow.test.ts`
Expected: FAIL

- [ ] **Step 3: `game.ts`, `flow.ts`, `stats.ts`, `testing.ts`, `index.ts`를 구현한다**

`index.ts`는 rng, types, data, validate, lane, game, combine, upgrades, stats를 다시 내보낸다. `testing.ts`는 `@dorandi/logic/testing`으로만 연다. 아직 없는 모듈은 해당 Task에서 index에 추가한다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run packages/logic/test/flow.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add packages/logic
git commit -m "feat(logic): game creation, tick order and round flow"
```

---

### Task 5: 소환, 배치, 이동, 판매, 바꾸기

**Files:**
- Create: `packages/logic/src/units.ts`
- Modify: `packages/logic/src/game.ts` (`applyCommands`에 summon, move, sell, convertToken, helperOpened 연결, 명령 처리 뒤 `placePendingPity`)
- Test: `packages/logic/test/units.test.ts`

**Interfaces:**
- Consumes: Task 4 `createGame`, `step`, `laneOf`, `testing.ts`
- Produces:
  - `rollSummon(state): string`: 소환 흐름을 쓴다. 등급을 `summonOdds`로 고르고, 그 등급 유닛 중 목록 순서 균등으로 고른다
  - `chooseSlot(state, def: UnitDef): number | null`: 명세 5장 규칙. 사거리 2.0 이하는 열린 빈 가장자리 칸, 아니면 열린 빈 안쪽 칸. 맞는 칸이 없으면 다른 쪽, 같은 조건이면 작은 번호
  - `pityPick(state): string`: 1등급 중 `summonCounts`가 가장 작은 것, 같으면 목록 순서
  - `addUnit(state, defId: string, slot: number, events): Unit`: id는 `state.nextId++`, `cooldown 0`, `attackCount 0`, `periodic`은 periodic 스킬마다 그 초를 틱으로 바꾼 값
  - 명령 처리기: `(state, cmd, events) => RejectReason | null`
    - summon: `noToken`, `noSlot`. 성공하면 `tokens -= 1`, `summonCounts`, `grade1Summons` 갱신. 1등급이고 `grade1Summons % pityEvery === 0`이면 보정 유닛을 놓거나 `pendingPity`에 넣는다. `summon` 이벤트
    - move: `noUnit`(from이 비었거나 범위 밖), `closedSlot`(to가 닫힘). 빈 칸이면 옮기고, 차 있으면 맞바꾼다. 쿨다운과 카운터는 유지한다
    - sell: `noUnit`. `coins += sellPrice[grade-1]`
    - convertToken: `noToken`. `tokens -= 1`, `coins += toCoins`
    - helperOpened: `helperOpens += 1`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, test } from 'vitest';
import { createGame, step, loadGameData } from '../src/index';
import { rollSummon, chooseSlot, pityPick } from '../src/units';
import { placeUnitForTest } from '../src/testing';
import { unitDef } from '../src/data';

const data = loadGameData();

describe('units', () => {
  test('summon spends a token and places a unit', () => {
    const s = createGame(data, 5);
    const r = step(s, [{ type: 'summon' }]);
    expect(r.rejected).toEqual([]); expect(s.tokens).toBe(3);
    expect(s.slots.filter(Boolean).length).toBe(1);
    expect(r.events.some(e => e.type === 'summon')).toBe(true);
  });
  test('odds over 10000 rolls', () => {
    const s = createGame(data, 9); const g = [0, 0, 0];
    for (let i = 0; i < 10000; i++) g[unitDef(data, rollSummon(s)).grade - 1]!++;
    expect(g[0]! / 10000).toBeCloseTo(0.70, 1); expect(g[1]! / 10000).toBeCloseTo(0.25, 1); expect(g[2]! / 10000).toBeCloseTo(0.05, 1);
  });
  test('placement: melee to edge, ranged to inner', () => {
    const s = createGame(data, 1);
    expect(chooseSlot(s, unitDef(data, 'sotlid'))).toBe(0);
    expect(chooseSlot(s, unitDef(data, 'horong'))).toBe(7);
    for (const i of [7, 8, 9, 10, 13, 14, 15, 16]) placeUnitForTest(s, 'horong', i);
    expect(chooseSlot(s, unitDef(data, 'horong'))).toBe(0);
  });
  test('pity picks least summoned with list order on ties', () => {
    const s = createGame(data, 1);
    s.summonCounts = { bitjaru: 2, jipsin: 1, sotlid: 1, dadeumi: 2, horong: 2, bujigaengi: 2, buchae: 2, ki: 2 };
    expect(pityPick(s)).toBe('jipsin');
  });
  test('every 7th grade-1 summon gives an extra unit', () => {
    const s = createGame(data, 3); s.tokens = 100;
    let summons = 0;
    while (s.grade1Summons < 7) { step(s, [{ type: 'summon' }]); summons++; }
    expect(s.slots.filter(Boolean).length + s.pendingPity.length).toBe(summons + 1);
  });
  test('full board: summon rejected, pity queued then placed after a sale', () => {
    const s = createGame(data, 1);
    for (let i = 0; i < 18; i++) placeUnitForTest(s, 'sotlid', i);
    s.tokens = 2;
    expect(step(s, [{ type: 'summon' }]).rejected[0]!.reason).toBe('noSlot'); expect(s.tokens).toBe(2);
    s.pendingPity.push('jipsin');
    step(s, [{ type: 'sell', slot: 3 }]);
    expect(s.pendingPity).toEqual([]); expect(s.slots[3]!.defId).toBe('jipsin');
  });
  test('move and swap, rejections', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 0); placeUnitForTest(s, 'horong', 7);
    step(s, [{ type: 'move', from: 0, to: 1 }]); expect(s.slots[1]!.defId).toBe('sotlid'); expect(s.slots[0]).toBeNull();
    step(s, [{ type: 'move', from: 1, to: 7 }]); expect(s.slots[7]!.defId).toBe('sotlid'); expect(s.slots[1]!.defId).toBe('horong');
    const r = step(s, [{ type: 'move', from: 7, to: 20 }, { type: 'move', from: 0, to: 2 }, { type: 'move', from: 99, to: 2 }]);
    expect(r.rejected.map(x => x.reason)).toEqual(['closedSlot', 'noUnit', 'noUnit']);
  });
  test('sell, convert, double sell', () => {
    const s = createGame(data, 1); placeUnitForTest(s, 'gamasot', 0);
    const r = step(s, [{ type: 'sell', slot: 0 }, { type: 'sell', slot: 0 }, { type: 'convertToken' }]);
    expect(s.coins).toBe(10 + 25); expect(s.tokens).toBe(3);
    expect(r.rejected.map(x => x.reason)).toEqual(['noUnit']);
    s.tokens = 0; expect(step(s, [{ type: 'convertToken' }]).rejected[0]!.reason).toBe('noToken');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/logic/test/units.test.ts`
Expected: FAIL

- [ ] **Step 3: `units.ts`를 구현하고 `game.ts`에 연결한다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run packages/logic/test`
Expected: PASS (앞 Task 테스트 포함)

- [ ] **Step 5: 커밋한다**

```bash
git add packages/logic
git commit -m "feat(logic): summon, placement, pity, move, sell, convert"
```

---

### Task 6: 조합

**Files:**
- Create: `packages/logic/src/combine.ts`
- Modify: `packages/logic/src/game.ts` (combine 명령 연결)
- Test: `packages/logic/test/combine.test.ts`

**Interfaces:**
- Consumes: Task 5 `addUnit`
- Produces:
  - `availableRecipes(state): string[]`: 지금 재료가 다 있는 레시피 결과 id. recipes.json 순서
  - `missingMaterials(state, result: string): string[]`: 모자란 재료 id. 중복을 허용한다. 도감과 도우미가 쓴다
  - 명령 처리기 `combine`: `missingMaterials`가 비어 있지 않으면 거절하고, `unknown`은 레시피가 없을 때다
    - 결과 칸: 재료 개체 중 등급이 가장 높고, 같으면 칸 번호가 가장 작은 것
    - 나머지 재료: id마다 결과 칸 개체를 빼고, 칸 번호가 큰 것부터 쓴다
    - 결과는 새 유닛이다(`addUnit`). `combine` 이벤트

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, test } from 'vitest';
import { createGame, step, loadGameData } from '../src/index';
import { availableRecipes, missingMaterials } from '../src/combine';
import { placeUnitForTest } from '../src/testing';

const data = loadGameData();

describe('combine', () => {
  test('available recipes', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 4); placeUnitForTest(s, 'bujigaengi', 2);
    expect(availableRecipes(s)).toEqual(['gamasot']);
    expect(missingMaterials(s, 'hwaro')).toEqual(['horong']);
  });
  test('2nd grade result goes to the lower slot', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 4); placeUnitForTest(s, 'bujigaengi', 2);
    step(s, [{ type: 'combine', result: 'gamasot' }]);
    expect(s.slots[2]!.defId).toBe('gamasot'); expect(s.slots[4]).toBeNull();
  });
  test('3rd grade goes to the highest-grade material slot and uses highest duplicate slot', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 3); placeUnitForTest(s, 'sotlid', 9);
    placeUnitForTest(s, 'ki', 1); placeUnitForTest(s, 'gamasot', 11);
    step(s, [{ type: 'combine', result: 'jangdok' }]);
    expect(s.slots[11]!.defId).toBe('jangdok');
    expect(s.slots[3]!.defId).toBe('sotlid'); expect(s.slots[9]).toBeNull(); expect(s.slots[1]).toBeNull();
  });
  test('rejections, including materials sold earlier in the same tick', () => {
    const s = createGame(data, 1);
    placeUnitForTest(s, 'sotlid', 0); placeUnitForTest(s, 'bujigaengi', 1);
    const r = step(s, [{ type: 'sell', slot: 0 }, { type: 'combine', result: 'gamasot' }, { type: 'combine', result: 'nope' }]);
    expect(r.rejected.map(x => x.reason)).toEqual(['missingMaterials', 'unknown']);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/logic/test/combine.test.ts`
Expected: FAIL

- [ ] **Step 3: `combine.ts`를 구현하고 연결한다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run packages/logic/test`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add packages/logic
git commit -m "feat(logic): fixed-recipe combine"
```

---

### Task 7: 기본 전투, 보상, 강화

**Files:**
- Create: `packages/logic/src/combat.ts`, `packages/logic/src/upgrades.ts`
- Modify: `packages/logic/src/game.ts` (`unitAttacks`, `resolveKills`, upgrade 명령), `packages/logic/src/stats.ts` (`damageDealt`, `bossKillSeconds`, `boardDps`)
- Test: `packages/logic/test/combat.test.ts`

**Interfaces:**
- Consumes: Task 2 `unitAttack`, Task 3 `dist`, `laneOf(state).pointAt`
- Produces:
  - `computeHitDamage(a: { attack: number; mult: number; bonus: number; resist: number; vuln: number }): number`: 명세 4.3 식, `Math.max(1, Math.round(...))`
  - `damageBonus(state, slot: number): number`: 계열 강화 단계 × pct + 등급 손질 단계 × pct + 오라 공격력. 오라 공격력은 Task 8 전까지 0
  - `speedBonus(state, slot: number): number`: Task 8 전까지 0
  - `attackIntervalTicks(intervalSeconds: number, speedBonus: number): number`: `Math.max(1, Math.round(interval / (1 + bonus) * 20))`
  - `pickTarget(state, slot: number): Enemy | null`: 사거리 안에서 보스를 먼저, 없으면 id가 가장 작은 것. hp > 0만 본다
  - `dealDamage(state, enemy, amount, source: string, events): void`: `hp`를 깎고, `damage` 이벤트를 내고, 그 적의 라운드 `damageDealt`에 실제로 깎은 양(남은 hp까지)을 더한다
  - `upgradeCost(def: UpgradeDef, nextLevel: number): number` = `costPerLevel × nextLevel`
  - 명령 처리기 `upgrade`: `maxed`, `noCoins`. slots 단계 L은 칸 `18 + 2(L−1)`과 그다음 칸을 연다
  - `boardDps(state): number`: Σ `unitAttack × (1 + damageBonus) / (실제 간격 초)`
- 공격 규칙 (명세 4.2):
  - 칸 번호 순서로 처리한다. `cooldown > 0`이면 1 줄이고 넘어간다. `cooldown === 0`이면 대상을 찾는다.
  - 대상이 없으면 0으로 대기한다. 있으면 공격하고, `cooldown = attackIntervalTicks − 1`, `attackCount += 1`, `attack` 이벤트를 낸다.
  - 피해 = `computeHitDamage(attack=unitAttack, mult=1, bonus=damageBonus, resist=적 저항[계열], vuln=vulnOf)`. `vulnOf`는 Task 8 전까지 0.
- 처치 (resolveKills):
  - hp ≤ 0인 적을 제거하고 `kill` 이벤트를 낸다.
  - 일반 적은 `coins += perKill`.
  - 보스는 `coins += boss`, `buckwheat += bossBuckwheat`, `bossKillSeconds`를 기록한다. 마지막 라운드 보스면 그 자리에서 `clear`로 끝낸다. 한도 판정보다 먼저다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, test } from 'vitest';
import { createGame, step, loadGameData } from '../src/index';
import { computeHitDamage, attackIntervalTicks, damageBonus, pickTarget } from '../src/combat';
import { upgradeCost } from '../src/upgrades';
import { forceRound, spawnEnemyForTest, placeUnitForTest } from '../src/testing';

const data = loadGameData();
const quiet = () => { const s = createGame(data, 1); forceRound(s, 1); s.spawned = 30; s.roundEndTick = 10 ** 9; s.enemies = []; return s; };

describe('combat', () => {
  test('damage formula', () => {
    expect(computeHitDamage({ attack: 13.2, mult: 1, bonus: 0, resist: 0, vuln: 0 })).toBe(13);
    expect(computeHitDamage({ attack: 13.2, mult: 1, bonus: 0, resist: 0.5, vuln: 0 })).toBe(7);
    expect(computeHitDamage({ attack: 13.2, mult: 1, bonus: 0.26, resist: 0, vuln: 0.1 })).toBe(18);
    expect(computeHitDamage({ attack: 0.2, mult: 1, bonus: 0, resist: 0.5, vuln: 0 })).toBe(1);
  });
  test('attack interval with speed bonus', () => {
    expect(attackIntervalTicks(1.0, 0)).toBe(20);
    expect(attackIntervalTicks(1.0, 0.3)).toBe(15);
  });
  test('upgrade bonuses add', () => {
    const s = quiet(); placeUnitForTest(s, 'sotlid', 0);
    s.upgrades.physical = 2; s.upgrades.polish = 1;
    expect(damageBonus(s, 0)).toBeCloseTo(0.26);
    s.upgrades.magical = 5; expect(damageBonus(s, 0)).toBeCloseTo(0.26);
  });
  test('targets boss first, else lowest id; waits ready when nothing in range', () => {
    const s = quiet(); placeUnitForTest(s, 'horong', 2);
    expect(pickTarget(s, 2)).toBeNull();
    step(s, []); expect(s.slots[2]!.cooldown).toBe(0);
    const a = spawnEnemyForTest(s, 'japgwi', 3, 1000); const b = spawnEnemyForTest(s, 'japgwi', 3.2, 1000);
    expect(pickTarget(s, 2)!.id).toBe(a.id);
    const boss = spawnEnemyForTest(s, 'jinegaksi', 3.1); boss.boss = true;
    expect(pickTarget(s, 2)!.id).toBe(boss.id);
    const r = step(s, []);
    expect(r.events.some(e => e.type === 'attack')).toBe(true);
    expect(s.slots[2]!.cooldown).toBe(19);
    expect(b.hp).toBe(1000);
  });
  test('kill pays coin; damageDealt counts real hp removed', () => {
    const s = quiet(); placeUnitForTest(s, 'sotlid', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 5);
    const coins = s.coins;
    step(s, []);
    expect(s.enemies.find(x => x.id === e.id)).toBeUndefined();
    expect(s.coins).toBe(coins + 1);
    expect(s.stats.at(-1)!.damageDealt).toBe(5);
  });
  test('last boss kill clears even while over the limit', () => {
    const s = createGame(data, 1); forceRound(s, 20); step(s, []);
    for (let i = 0; i < 70; i++) spawnEnemyForTest(s, 'japgwi', 12, 10 ** 9);
    s.enemies.find(e => e.boss)!.hp = 1; s.enemies.find(e => e.boss)!.d = 3;
    placeUnitForTest(s, 'sotlid', 2);
    step(s, []);
    expect(s.result).toEqual({ outcome: 'clear', reason: null, round: 20 });
    expect(s.buckwheat).toBe(2);
  });
  test('upgrades: cost, coins, max, slots', () => {
    const s = createGame(data, 1);
    expect(upgradeCost(data.upgrades[0]!, 2)).toBe(50);
    expect(step(s, [{ type: 'upgrade', id: 'physical' }]).rejected[0]!.reason).toBe('noCoins');
    s.coins = 1000;
    step(s, [{ type: 'upgrade', id: 'slots' }]);
    expect(s.coins).toBe(950); expect(s.open[18]).toBe(true); expect(s.open[19]).toBe(true); expect(s.open[20]).toBe(false);
    s.upgrades.physical = 10;
    expect(step(s, [{ type: 'upgrade', id: 'physical' }]).rejected[0]!.reason).toBe('maxed');
  });
});
```

(`spawnEnemyForTest`로 보스를 만들면 `boss`가 defs 값대로 `true`여야 한다. 테스트의 `boss.boss = true`는 그 값을 다시 확인하는 줄이다.)

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/logic/test/combat.test.ts`
Expected: FAIL

- [ ] **Step 3: `combat.ts`, `upgrades.ts`를 구현하고 연결한다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run packages/logic/test`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add packages/logic
git commit -m "feat(logic): targeting, damage, kills, rewards, upgrades"
```

---

### Task 8: 상태 이상, 스킬, 오라

**Files:**
- Create: `packages/logic/src/effects.ts`
- Modify: `packages/logic/src/combat.ts` (공격 때 스킬 발동, `damageBonus`와 `speedBonus`에 오라, `vulnOf`), `packages/logic/src/game.ts` (`tickStatuses`, periodic 처리), `packages/logic/src/flow.ts` (이동에 스턴·둔화)
- Test: `packages/logic/test/effects.test.ts`

**Interfaces:**
- Consumes: Task 7 `computeHitDamage`, `dealDamage`, `pickTarget`
- Produces:
  - `vulnOf(state, enemy, damageType: DamageType): number`: 그 계열에 맞는 `vulns`(pct × stacks)와 장독 오라를 더하고 `vulnCap`으로 자른다
    - 장독 오라: 적이 어느 장독의 사거리 안에 있으면 +pct. 장독이 여러 개여도 한 번만 친다
  - `onAttack(state, slot, target, events): void`: 공격 한 번의 주 타격과 스킬을 처리한다. Task 7의 단순 타격을 대체한다
  - `tickStatuses(state, events): void`: 스턴·둔화·vuln 시간 감소, 지속 피해 펄스, 바닥 불길 펄스, 끝난 불길 제거
  - `runPeriodics(state, events): void`: 유닛 공격 단계에서 칸 번호 순서로 부른다
- 스킬 규칙 (명세 4.4~4.6):
  - 발동 확률은 공격마다 전투 흐름에서 `nextFloat < p`로 굴린다. 스킬 하나당 한 번 굴리고, 그 스킬의 effects를 모두 적용한다.
  - 추가 공격, 범위, 관통, 폭발로 들어간 피해는 스킬을 다시 굴리지 않는다.
  - 주 타격 배율: crit은 주 타격에만 곱한다. execute는 맞기 전 `hp/maxHp ≤ hpBelow`면 곱한다. 둘 다면 곱해진다.
  - 피해 모양:
    - splash: 맞은 적 위치에서 반지름 안의 다른 적에게 공격력 × mult
    - pierce: 대상보다 d가 작고 `target.d − length ≤ d`인 다른 적에게 공격력 × mult. 대상과 앞선 적은 맞지 않는다
    - allInRange (periodic): 타이머가 0 이하이고 사거리 안에 적이 있으면 모두에게 공격력 × mult를 주고, 타이머를 초 → 틱으로 되돌린다. 적이 없으면 0에서 기다린다
  - 군중 제어:
    - stun: `stunTicks = max(남은, 새 값)`. 보스는 새 값 × bossCcFactor
    - slow: pct가 더 크거나 같으면 덮어쓴다. 보스는 시간 × bossCcFactor. radius가 있으면 맞은 적 주변 반지름 안 모두에게 건다
    - knockback: `d = max(0, d − distance)`. 보스는 × bossCcFactor. `speedChange` 이벤트를 낸다
    - 스턴이나 둔화가 걸리거나 풀릴 때도 `speedChange` 이벤트를 낸다
  - vuln: 키는 유닛 defId다.
    - maxStacks가 없으면 시간만 새로 고친다.
    - maxStacks가 있으면 `stacks = min(stacks + 1, max)`이고 시간을 새로 고친다.
  - dot: 키는 defId다.
    - 총량 = `computeHitDamage(attack, mult, bonus, resist, vuln)`를 걸 때 계산한다.
    - 펄스 수는 `seconds / pulseSeconds`이고, 펄스당 = 총량 / 펄스 수(반올림, 최소 1).
    - 첫 펄스는 건 틱 + 10이다. 다시 걸면 덮어쓴다.
  - groundFire:
    - 구간은 `[loopPos(target.d) − length/2, loopPos(target.d) + length/2]`이고, 둘레를 넘으면 접는다.
    - `basePerPulse = attack × pulseMult × (1 + bonus)`이고, 펄스 때 대상의 저항과 vuln을 곱해 `computeHitDamage`로 정수로 만든다.
    - 같은 source의 불길이 겹친 곳에서는 적 하나가 펄스 한 번에 한 번만 맞는다.
    - 유닛이 사라져도 `endTick`까지 남는다.
  - onKillExplode: 이 유닛의 주 타격이나 splash로 처치하면, 그 위치 반지름 안 다른 적에게 공격력 × mult. 폭발로 처치되어도 다시 터지지 않는다.
  - 오라 (자기 칸 기준 auraRadius 1.5, 자기 제외):
    - auraAttackSpeed는 서로 다른 defId끼리 더하고, 같은 defId는 한 번만 친다.
    - auraAttackPower는 계열이 맞는 유닛에만 더한다.
  - nth: `attackCount % n === 0`인 공격에 발동한다. 이동해도 카운터는 유지된다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

각 테스트는 `makeData`로 발동 확률을 1로 바꾸거나 필요한 유닛만 둔 데이터를 쓴다. `quiet(data)`는 Task 7 테스트와 같은 준비 함수다(잡귀 등장 없음, 라운드가 끝나지 않음). 적 위치 d=3은 칸 2(x 2.5, y 0.5) 바로 위, 경로 (3, −0.5)다.

```ts
import { describe, expect, test } from 'vitest';
import { createGame, step } from '../src/index';
import type { Command } from '../src/types';
import { forceRound, spawnEnemyForTest, placeUnitForTest, makeData } from '../src/testing';
import { vulnOf } from '../src/effects';
import { speedBonus, damageBonus } from '../src/combat';

const always = makeData(d => { for (const u of d.units) for (const s of u.skills) if (s.trigger.kind === 'chance') s.trigger.p = 1; });
const quiet = (data = always) => { const s = createGame(data, 1); forceRound(s, 1); s.spawned = 30; s.roundEndTick = 10 ** 9; s.enemies = []; return s; };
const dmg = (r: ReturnType<typeof step>, id: number) => r.events.filter(e => e.type === 'damage' && e.enemyId === id).map(e => (e as any).amount);

describe('effects', () => {
  test('extraAttack hits twice', () => {
    const s = quiet(); placeUnitForTest(s, 'jipsin', 2); const e = spawnEnemyForTest(s, 'japgwi', 3, 1000);
    expect(dmg(step(s, []), e.id).length).toBe(2);
  });
  test('crit plus splash (jeolgu)', () => {
    const s = quiet(); placeUnitForTest(s, 'jeolgu', 2);
    const a = spawnEnemyForTest(s, 'japgwi', 3, 10000); const b = spawnEnemyForTest(s, 'japgwi', 3.8, 10000);
    const r = step(s, []);
    expect(dmg(r, a.id)[0]).toBe(Math.round(26 * 1.3 * 1.0 * 2));
    expect(dmg(r, b.id)[0]).toBe(Math.round(26 * 1.3 * 1.0 * 0.5));
  });
  test('execute doubles below 30%', () => {
    const s = quiet(); placeUnitForTest(s, 'bujigaengi', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 1000); e.hp = 300;
    expect(dmg(step(s, []), e.id)[0]).toBe(Math.round(10 * 0.9 * 0.9 * 2));
  });
  test('pierce hits followers only', () => {
    const s = quiet(); placeUnitForTest(s, 'hwaetbul', 2);
    const t = spawnEnemyForTest(s, 'japgwi', 3, 10000);
    const behind = spawnEnemyForTest(s, 'japgwi', 1.5, 10000); const ahead = spawnEnemyForTest(s, 'japgwi', 4, 10000);
    t.id = -1;
    const r = step(s, []);
    expect(dmg(r, t.id).length).toBe(1); expect(dmg(r, behind.id).length).toBe(1); expect(dmg(r, ahead.id).length).toBe(0);
  });
  test('stun stops movement, half on boss', () => {
    const s = quiet(); placeUnitForTest(s, 'sotlid', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 10000); step(s, []);
    expect(e.stunTicks).toBe(10);
    const s2 = quiet(); placeUnitForTest(s2, 'sotlid', 2); const boss = spawnEnemyForTest(s2, 'jinegaksi', 3); step(s2, []);
    expect(boss.stunTicks).toBe(5);
  });
  test('knockback moves back, never below 0, emits speedChange', () => {
    const s = quiet(); placeUnitForTest(s, 'buchae', 7);
    const e = spawnEnemyForTest(s, 'japgwi', 2.5, 10000);
    const r = step(s, []);
    expect(e.d).toBeCloseTo(2.5 + 0.08 - 1, 5);
    expect(r.events.some(x => x.type === 'speedChange' && x.enemyId === e.id)).toBe(true);
    e.d = 0.3; s.slots[7]!.cooldown = 0; step(s, []); expect(e.d).toBe(0);
  });
  test('vuln: same source refreshes, moru stacks to 5, cap 0.5', () => {
    const s = quiet(); placeUnitForTest(s, 'moru', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 10 ** 6); e.stunTicks = 10 ** 6;
    for (let i = 0; i < 200; i++) step(s, []);
    expect(e.vulns.moru!.stacks).toBe(5);
    expect(vulnOf(s, e, 'physical')).toBeCloseTo(0.2); expect(vulnOf(s, e, 'magical')).toBeCloseTo(0);
    e.vulns.x = { pct: 0.4, damageType: 'all', ticks: 100, stacks: 1 };
    expect(vulnOf(s, e, 'physical')).toBeCloseTo(0.5);
  });
  test('dot: fixed total over 6 pulses, reapply replaces', () => {
    const s = quiet(); placeUnitForTest(s, 'horong', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 10 ** 6); step(s, []);
    expect(e.dots.horong!.pulsesLeft).toBe(6);
    expect(e.dots.horong!.perPulse).toBe(Math.max(1, Math.round(Math.round(10 * 1.0 * 0.85) / 6)));
  });
  test('ground fire stays after the unit is sold and hits once per pulse', () => {
    const s = quiet(); placeUnitForTest(s, 'hwaro', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 10 ** 6); e.stunTicks = 10 ** 6;
    step(s, []); expect(s.fires.length).toBe(1);
    step(s, [{ type: 'sell', slot: 2 }]);
    const hits: number[] = [];
    for (let i = 0; i < 40; i++) hits.push(...dmg(step(s, []), e.id));
    expect(hits.length).toBe(4); expect(s.fires.length).toBe(0);
  });
  test('splash kill explodes, explosion kill does not chain', () => {
    const s = quiet(); placeUnitForTest(s, 'onggigama', 7);
    spawnEnemyForTest(s, 'japgwi', 2.5, 1); spawnEnemyForTest(s, 'japgwi', 3.5, 1);
    const c = spawnEnemyForTest(s, 'japgwi', 4.8, 1); const far = spawnEnemyForTest(s, 'japgwi', 6.0, 1000);
    const r = step(s, []);
    expect(s.enemies.find(x => x.id === c.id)).toBeUndefined();
    expect(dmg(r, far.id).length).toBe(0);
  });
  test('auras: speed adds by kind, power by damage type, jangdok vuln', () => {
    const s = quiet();
    placeUnitForTest(s, 'horong', 8); placeUnitForTest(s, 'cheongsachorong', 1); placeUnitForTest(s, 'cheongsachorong', 3);
    expect(speedBonus(s, 8)).toBeCloseTo(0.10);
    placeUnitForTest(s, 'daljip', 9); expect(speedBonus(s, 8)).toBeCloseTo(0.30);
    placeUnitForTest(s, 'pulmu', 14); placeUnitForTest(s, 'sotlid', 13);
    expect(damageBonus(s, 8)).toBeCloseTo(0.15); expect(damageBonus(s, 13)).toBeCloseTo(0);
    placeUnitForTest(s, 'jangdok', 2); const e = spawnEnemyForTest(s, 'japgwi', 3, 1000);
    expect(vulnOf(s, e, 'magical')).toBeCloseTo(0.10);
  });
  test('nth: didilbangga 5th attack crits and stuns, counter survives a move', () => {
    const s = quiet(); placeUnitForTest(s, 'didilbangga', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 10 ** 6); e.stunTicks = 0;
    const amounts: number[] = [];
    for (let i = 0; i < 4 * 20 + 1; i++) {
      const cmds: Command[] = i === 30 ? [{ type: 'move', from: 2, to: 3 }, { type: 'move', from: 3, to: 2 }] : [];
      amounts.push(...dmg(step(s, cmds), e.id));
    }
    expect(amounts.length).toBe(5);
    expect(amounts[4]).toBe(Math.round(amounts[0]! * 2.5));
  });
  test('periodic allInRange waits when no target', () => {
    const s = quiet(); placeUnitForTest(s, 'yeonjabangga', 2);
    for (let i = 0; i < 100; i++) step(s, []);
    expect(s.slots[2]!.periodic[0]).toBe(0);
  });
});
```

- 위 테스트의 위치 값은 모두 적이 공격 전에 한 틱(잡귀 0.08칸) 움직인 뒤를 기준으로 한다.
- `pierce` 테스트의 `t.id = -1`은 대상을 가장 먼저 나온 적으로 만드는 줄이다. Task 7의 "id가 가장 작은 것" 규칙에 기댄다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/logic/test/effects.test.ts`
Expected: FAIL

- [ ] **Step 3: `effects.ts`를 구현하고 combat, flow, game에 연결한다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run packages/logic/test`
Expected: PASS (전체)

- [ ] **Step 5: 커밋한다**

```bash
git add packages/logic
git commit -m "feat(logic): status effects, skills and auras"
```

---

### Task 9: 시뮬레이터

**Files:**
- Create: `packages/sim/package.json` (name `@dorandi/sim`, dependency `"@dorandi/logic": "*"`, scripts `"sim": "tsx src/cli.ts"`, `"econ": "tsx src/econ.ts"`)
- Create: `packages/sim/src/bots.ts`, `src/runner.ts`, `src/csv.ts`, `src/cli.ts`, `src/econ.ts`
- Test: `packages/sim/test/sim.test.ts`

**Interfaces:**
- Consumes: logic의 `createGame`, `step`, `availableRecipes`, `laneOf`, `boardDps`, `upgradeCost`, `unitDef`, `createRng`, `nextFloat`, `nextInt`, `deriveSeed`
- Produces:
  - `interface Bot { name: string; decide(state: GameState): Command[] }`
  - `clumsyBot(seed: number): Bot`, `normalBot(): Bot`
  - `runGame(data: GameData, seed: number, bot: Bot): GameState`: 10틱마다 `decide`를 불러 그 명령을 다음 `step`에 넣는다. `phase === 'ended'`까지 돈다
  - `roundRows(state: GameState, seed: number, bot: string): Row[]`, `toCsv(rows: Row[]): string`
    - 열: `seed,bot,round,multiplier,endEnemies,maxEnemies,boardDps,coins,tokens,g1,g2,g3,g4,bossKillSeconds,outcome,endRound`
    - multiplier = `damageDealt / hpSpawned`. 보스 라운드는 빈칸
    - boardDps, coins, tokens, g1~g4는 라운드 끝 시점 값이다. 러너가 `roundStart` 이벤트 때 직전 값을 기록해 둔다
  - `econTable(data: GameData): string`: 명세 11장 표를 데이터로 다시 계산한다
    - 도깨비불 값 = Σ odds × gradeValue
    - 구간 20/40/60라운드, 도깨비불 = start + perRound × rounds
    - × 0.8 × 값, × 0.85
- 봇 규칙 (명세 12장):
  - clumsyBot:
    - 도깨비불이 있고 빈 칸이 있으면 summon
    - `availableRecipes`가 있으면 봇 자체 난수(`createRng(deriveSeed(seed,'bot'))`)로 하나 골라 combine
    - 강화, 이동, 바꾸기는 하지 않는다
  - normalBot:
    - summon을 모두 쓴다.
    - 조합: 결과 등급이 가장 높은 레시피부터 하나씩. 같은 등급이면 목록 순서.
    - 강화: 다음 비용이 가장 싼 강화를 엽전이 될 때만 산다. 같으면 physical, magical, polish, slots 순서. slots는 열린 빈 칸이 없을 때만 산다.
    - 배치: 사거리 2.0 이하 유닛이 안쪽 칸에 있고 열린 빈 가장자리 칸이 있으면 옮긴다. 사거리 2.5 이상이 가장자리에 있고 안쪽 빈 칸이 있으면 옮긴다. 결정마다 하나씩.
    - 보스 따라가기: 보스가 살아 있으면 4번 결정(2초)마다 근거리 유닛을 3개까지 옮긴다.
      - 옮길 유닛은 보스에서 가장 먼 것부터 고른다.
      - 옮길 곳은 보스 위치에 가장 가까운 열린 빈 가장자리 칸이다.
      - 빈 칸이 없으면, 보스에 가장 가까운 가장자리 칸에 있는 원거리 유닛과 맞바꾼다.
- CLI: `npm run sim -- --bot normal --seeds 100 --out sim-out/normal.csv`
  - CSV를 쓴다.
  - 요약을 출력한다: 클리어율, 탈락 라운드 분포, 라운드별 multiplier 중앙값, 보스별 처치 시간 중앙값.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, test } from 'vitest';
import { loadGameData } from '@dorandi/logic';
import { runGame, roundRows, toCsv } from '../src/runner';
import { clumsyBot, normalBot } from '../src/bots';
import { econTable } from '../src/econ';

const data = loadGameData();
const strip = (s: any) => JSON.stringify({ ...s, data: undefined });

describe('sim', () => {
  test('same seed and bot give identical final state', () => {
    expect(strip(runGame(data, 11, normalBot()))).toBe(strip(runGame(data, 11, normalBot())));
  });
  test('different seeds give different games', () => {
    expect(strip(runGame(data, 11, normalBot()))).not.toBe(strip(runGame(data, 12, normalBot())));
  });
  test('games end and rows are well-formed', () => {
    const s = runGame(data, 3, clumsyBot(3));
    expect(s.phase).toBe('ended');
    const rows = roundRows(s, 3, 'clumsy');
    expect(rows.length).toBe(s.result!.round);
    const csv = toCsv(rows);
    expect(csv.split('\n')[0]).toBe('seed,bot,round,multiplier,endEnemies,maxEnemies,boardDps,coins,tokens,g1,g2,g3,g4,bossKillSeconds,outcome,endRound');
  });
  test('econ table reproduces spec section 11', () => {
    const t = econTable(data);
    expect(t).toContain('44'); expect(t).toContain('124'); expect(t).toMatch(/1\.4/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm install && npx vitest run packages/sim/test/sim.test.ts`
Expected: FAIL

- [ ] **Step 3: bots, runner, csv, cli, econ을 구현한다**

- [ ] **Step 4: 통과와 실행을 확인한다**

Run: `npx vitest run && npm run sim -- --bot normal --seeds 20 --out sim-out/normal.csv && npm run econ`
Expected: 테스트 PASS. sim이 요약 표를 출력하고 CSV를 쓴다. econ이 20/40/60라운드 세 줄을 출력한다. 수치가 목표에 맞는지는 Task 13에서 본다

- [ ] **Step 5: 커밋한다**

```bash
git add packages/sim package.json package-lock.json
git commit -m "feat(sim): bots, runner, csv and economy table"
```

---

### Task 10: 클라이언트 뼈대와 고개 화면

**Files:**
- Create: `packages/client/package.json` (name `@dorandi/client`, deps `phaser@3.90.0`, `@dorandi/logic`, devDeps `vite@^6.3.0`, scripts `dev`, `build`)
- Create: `packages/client/index.html`, `vite.config.ts`, `src/main.ts`, `src/driver.ts`, `src/layout.ts`, `src/LaneScene.ts`, `src/ui/style.css`
- Create: `packages/client/public/sprites/sotlid.png`, `bitjaru.png`, `japgwi.png`
- Test: `packages/client/test/client.test.ts`

**Interfaces:**
- Consumes: logic `createGame`, `step`, `laneOf`, `unitDef`, `Command`, `GameEvent`
- Produces:
  - `layout.ts`:
    - 상수: `STAGE_W = 640`, `STAGE_H = 360`, `TOP_H = 24`, `BOTTOM_H = 28`, `LEFT_W = 128`, `RIGHT_W = 112`, `CELL = 32`, `GRID_LEFT = 232`, `GRID_TOP = 114`
    - `computeZoom(w: number, h: number): number` = `max(1, floor(min(w/640, h/360)))`
    - `laneToStage(p: Vec2): Vec2` = `(GRID_LEFT + x × 32, GRID_TOP + y × 32)`
    - `stageToCell(x: number, y: number): number | null`
    - `GRADE_COLOR: Record<number, string>` = `{1:'#4f9dff', 2:'#4fd27a', 3:'#b07aff', 4:'#ffb347'}`. 불꽃 6색 확정 전 임시값
  - `driver.ts`:
    - `ticksToRun(elapsedMs: number, carryMs: number, tickMs = 50, maxTicks = 40): { ticks: number; carryMs: number }`. 최대치를 넘으면 남은 시간은 버린다(carry 0)
    - `class GameDriver`: `queue(cmd: Command)`, `update(elapsedMs)`, `paused: boolean`, `onEvents(cb)`, `state`. 명령은 다음 틱 하나에 몰아 넣는다
  - `LaneScene`: 경로, 칸(열림·닫힘·안쪽 칸 색), 장승, 유닛, 적, 불길, 효과를 그린다
    - 유닛: 스프라이트 텍스처가 있으면 스프라이트, 없으면 등급 색 원 + 이름 첫 글자
    - 적: `pointAt(d)` 위치. 보스는 크게 그리고 체력 막대를 단다
    - `attack` 이벤트: 0.15초짜리 투사체 트윈. 물딜은 짧은 휘두름, 마딜은 불꽃 점
    - 끌어서 옮기기: 끄는 동안 놓을 칸의 `coverage` 구간을 경로 위에 밝게 칠한다. 놓으면 `move` 명령
    - 선택: 누른 칸 번호를 `onSelect(cb)`로 알린다
    - 유닛 등장은 통통 튀는 트윈, 조합은 squash & stretch(설계 문서 4.3)
- 화면 구조:
  - `#stage`는 640×360 DOM 상자다. `transform: scale(zoom)`, `transform-origin: top left`로 키운다.
  - Phaser 캔버스는 가운데 영역(LEFT_W, TOP_H, 400×308)에 둔다. `pixelArt: true`, CSS `image-rendering: pixelated`.
  - 캔버스 안 좌표는 `layout.ts` 값에서 가운데 영역의 왼쪽 위만큼 뺀다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, test } from 'vitest';
import { computeZoom, laneToStage, stageToCell } from '../src/layout';
import { ticksToRun } from '../src/driver';

describe('client helpers', () => {
  test('integer zoom', () => {
    expect(computeZoom(1280, 720)).toBe(2); expect(computeZoom(1920, 1080)).toBe(3);
    expect(computeZoom(1000, 700)).toBe(1); expect(computeZoom(300, 200)).toBe(1);
  });
  test('lane to stage and back', () => {
    expect(laneToStage({ x: 0.5, y: 0.5 })).toEqual({ x: 248, y: 130 });
    expect(stageToCell(248, 130)).toBe(0);
    expect(stageToCell(232 + 32 * 5 + 1, 114 + 32 * 3 + 1)).toBe(23);
    expect(stageToCell(10, 10)).toBeNull();
  });
  test('fixed step with carry and cap', () => {
    expect(ticksToRun(120, 0)).toEqual({ ticks: 2, carryMs: 20 });
    expect(ticksToRun(40, 20)).toEqual({ ticks: 1, carryMs: 10 });
    expect(ticksToRun(60_000, 0)).toEqual({ ticks: 40, carryMs: 0 });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm install && npx vitest run packages/client/test/client.test.ts`
Expected: FAIL

- [ ] **Step 3: `layout.ts`, `driver.ts`를 구현한다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run packages/client/test/client.test.ts`
Expected: PASS

- [ ] **Step 5: 샘플 스프라이트를 내보낸다**

```bash
"C:/aseprite/build/bin/aseprite.exe" -b art/samples/v2/sotlid_32.aseprite --save-as packages/client/public/sprites/sotlid.png
"C:/aseprite/build/bin/aseprite.exe" -b art/samples/v2/broom_32.aseprite --save-as packages/client/public/sprites/bitjaru.png
"C:/aseprite/build/bin/aseprite.exe" -b art/samples/v2/japgwi_32.aseprite --save-as packages/client/public/sprites/japgwi.png
```

Expected: 32×32 PNG 3개

- [ ] **Step 6: `main.ts`, `LaneScene.ts`, `index.html`, `style.css`를 구현한다**

`main.ts`는 `createGame(loadGameData(), Date.now() >>> 0)`로 판을 만든다. 시드는 클라이언트에서만 정하고, logic에는 숫자로 넘긴다. `requestAnimationFrame` 경과 시간으로 `driver.update`를 부르고, 창 크기가 바뀌면 zoom을 다시 계산한다.

- [ ] **Step 7: 화면을 직접 확인한다**

Run: `npm run dev`. 브라우저에서 `http://localhost:5173`을 연다.
Expected:
- 경로 고리와 칸 24개가 보인다. 아래 줄 6칸은 닫힌 색이다.
- 20초 뒤 잡귀가 왼쪽 위에서 나와 시계 방향으로 돈다.
- 개발자 콘솔에서 `window.__driver.queue({type:'summon'})`를 부르면 유닛이 나타나 잡귀를 친다.
- 유닛을 끌면 사거리 구간이 밝게 보이고, 놓으면 옮겨진다.

`window.__driver`는 개발 모드에서만 노출한다.

- [ ] **Step 8: 커밋한다**

```bash
git add packages/client package.json package-lock.json
git commit -m "feat(client): stage scaling, fixed-step driver and lane scene"
```

---

### Task 11: 패널과 조작

**Files:**
- Create: `packages/client/src/ui/models.ts`, `src/ui/hud.ts`, `src/ui/panels.ts`, `src/ui/helper.ts`, `src/ui/dex.ts`, `src/sfx.ts`
- Modify: `packages/client/src/main.ts` (패널 붙이기, 단축키)
- Test: `packages/client/test/models.test.ts`

**Interfaces:**
- Consumes: logic `availableRecipes`, `missingMaterials`, `upgradeCost`, `unitDef`, `countNormalEnemies`. Task 10 `GameDriver`
- Produces (`models.ts`, DOM을 모르는 순수 함수):
  - `hudModel(state): { roundText: string; secondsLeft: number; enemyText: string; danger: number }`
    - roundText 예: `'12 / 20 라운드'`. 준비 중이면 `'준비'`
    - enemyText 예: `'우리 고개 잡귀 18 / 60'`
    - danger = 잡귀 수 / limit, 0~1로 자름. 장승 금 단계를 고른다
  - `helperModel(state): { recipe: string; name: string; grade: number }[]`: `availableRecipes`를 이름과 등급으로 바꾼다
  - `upgradeRows(state): { id: UpgradeId; label: string; level: number; max: number; cost: number | null; effectText: string; affordable: boolean }[]`. cost는 최대 단계면 null
  - `unitCard(state, slot): { name: string; grade: number; typeText: '물딜' | '마딜'; skillText: string; usedIn: string[]; sellPrice: number } | null`. skillText는 units.json skills를 한국어 한 줄로 바꾼 것이다 (예: `'20% 스턴 0.5초'`)
  - `dexEntries(data): { id: string; name: string; grade: number; recipe: string[] }[]`
- 화면 (명세 13장 그림):
  - 위: 라운드, 남은 초, 잡귀 수, 장승 게이지. 한도를 넘으면 화면 가장자리가 붉어진다
  - 오른쪽: 도깨비불, 엽전, 메밀묵, `[뚝딱!]`, `[불 바꾸기]`, `[강화]`(네 갈래 창)
  - 왼쪽: 조합 도우미. 접혀 있다가 펼치면 `helperOpened` 명령. 목록마다 `[조합]`, 아래에 `[도감]`
  - 아래: 선택한 유닛의 카드와 `[판매]`
  - 버튼은 최소 22 stage px(2배 화면에서 44px)
- 단축키: 스페이스 뚝딱, 1~4 강화, Q 도우미 펼치기, P 일시정지
- `sfx.ts`: `playSfx(name: 'summon1' | 'summon2' | 'summon3' | 'combine' | 'hit' | 'kill' | 'bossKill' | 'defeat' | 'clear'): void`. 1단계에서는 아무것도 하지 않는다. 이벤트마다 부르는 자리만 만든다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, step } from '@dorandi/logic';
import { hudModel, helperModel, upgradeRows, unitCard, dexEntries } from '../src/ui/models';

const data = loadGameData();

describe('ui models', () => {
  test('hud', () => {
    const s = createGame(data, 1);
    expect(hudModel(s).roundText).toBe('준비');
    for (let i = 0; i < 401; i++) step(s, []);
    expect(hudModel(s)).toMatchObject({ roundText: '1 / 20 라운드', enemyText: '우리 고개 잡귀 1 / 60' });
    expect(hudModel(s).secondsLeft).toBe(40);
  });
  test('helper and card', () => {
    const s = createGame(data, 1);
    s.slots[0] = { id: 1, defId: 'sotlid', cooldown: 0, attackCount: 0, periodic: [] };
    s.slots[1] = { id: 2, defId: 'bujigaengi', cooldown: 0, attackCount: 0, periodic: [] };
    expect(helperModel(s)).toEqual([{ recipe: 'gamasot', name: '가마솥', grade: 2 }]);
    expect(unitCard(s, 0)).toMatchObject({ name: '솥뚜껑', grade: 1, typeText: '물딜', skillText: '20% 스턴 0.5초', usedIn: ['가마솥', '장독'], sellPrice: 5 });
    expect(unitCard(s, 5)).toBeNull();
  });
  test('upgrade rows', () => {
    const s = createGame(data, 1); s.coins = 30; s.upgrades.slots = 3;
    const rows = upgradeRows(s);
    expect(rows.map(r => r.label)).toEqual(['물딜 강화', '마딜 강화', '등급 손질', '칸 늘리기']);
    expect(rows[0]).toMatchObject({ level: 0, cost: 25, affordable: true });
    expect(rows[3]).toMatchObject({ cost: null, affordable: false });
  });
  test('dex has 22 entries with recipes for grade 2+', () => {
    const d = dexEntries(data);
    expect(d.length).toBe(22);
    expect(d.find(x => x.id === 'daljip')!.recipe).toEqual(['쥐불', '횃불', '청사초롱']);
    expect(d.find(x => x.id === 'sotlid')!.recipe).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/client/test/models.test.ts`
Expected: FAIL

- [ ] **Step 3: `models.ts`를 구현한다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run packages/client/test/models.test.ts`
Expected: PASS

- [ ] **Step 5: 패널, 도감, 단축키, sfx 자리를 구현한다**

- [ ] **Step 6: 화면을 직접 확인한다**

Run: `npm run dev`
Expected:
- 뚝딱으로 유닛이 나온다.
- 재료가 모이면 도우미 목록에 결과가 뜨고, `[조합]`으로 만들어진다.
- 강화 창에서 네 갈래가 단계와 비용을 보여 준다. 엽전이 모자라면 버튼이 꺼진다.
- 유닛을 누르면 카드가 뜨고, `[판매]`가 된다.
- 스페이스, 1~4, Q, P가 듣는다.
- 1280×720 창에서 2배로 선명하게 보인다.

- [ ] **Step 7: 커밋한다**

```bash
git add packages/client
git commit -m "feat(client): hud, side panels, helper, dex and shortcuts"
```

---

### Task 12: 소환 연출과 결과 화면

**Files:**
- Create: `packages/client/src/ui/result.ts`
- Modify: `packages/client/src/LaneScene.ts` (소환 연출, 화면 흔들림), `packages/client/src/ui/models.ts` (`resultModel`), `packages/client/src/main.ts`
- Test: `packages/client/test/models.test.ts` (테스트 추가)

**Interfaces:**
- Consumes: Task 11 models, logic `GameState.stats`, `result`, `helperOpens`
- Produces:
  - `resultModel(state): { title: '클리어' | '탈락'; reasonText: string; roundReached: number; series: number[]; lastEnemies: number; maxEnemies: number; bestUnit: { name: string; grade: number } | null; helperText: string }`
    - reasonText: limit `'고개가 뚫렸습니다'`, boss `'고개 보스를 놓쳤습니다'`, clear `''`
    - series = `stats.map(s => s.endEnemies)`
    - bestUnit = 판 동안 만든 가장 높은 등급 유닛. 같으면 먼저 만든 것. 클라이언트가 summon·combine 이벤트로 추적해 넘긴다. 그래서 시그니처는 `resultModel(state, bestUnitId: string | null)`
    - helperText = `'도우미 N회'`
- 소환 연출 (명세 5장):
  - `summon` 이벤트가 오면 0.3초 동안 그 칸에 등급 색 불꽃을 먼저 보여 주고, 다음에 유닛을 드러낸다.
  - 3등급이면 0.2초 화면 흔들림.
- 결과 화면:
  - 판이 끝나면 덮개 창을 띄운다.
  - 라운드별 남은 잡귀 꺾은선 그래프(SVG, 한도 60 기준선), 마지막 값과 최댓값, 최고 유닛, 도우미 횟수, `[다시 하기]`를 보여 준다.
  - 다시 하기는 새 시드로 `createGame`.

- [ ] **Step 1: 실패하는 테스트를 추가한다**

```ts
import { resultModel } from '../src/ui/models';
import { forceRound } from '@dorandi/logic/testing';

test('result model', () => {
  const s = createGame(data, 1); forceRound(s, 10);
  for (let i = 0; i < 1501; i++) step(s, []);
  s.helperOpens = 3;
  const m = resultModel(s, 'gamasot');
  expect(m).toMatchObject({ title: '탈락', reasonText: '고개 보스를 놓쳤습니다', roundReached: 10, bestUnit: { name: '가마솥', grade: 2 }, helperText: '도우미 3회' });
  expect(m.series.length).toBe(s.stats.length);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/client/test/models.test.ts`
Expected: FAIL, `resultModel` 없음

- [ ] **Step 3: `resultModel`, `result.ts`, 소환 연출을 구현한다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
Expected: PASS (전체)

- [ ] **Step 5: 화면을 직접 확인한다**

Run: `npm run dev`
Expected:
- 뚝딱에서 불꽃이 먼저 보이고 물건이 나온다. 3등급이면 화면이 흔들린다.
- 일부러 아무것도 안 하면 3라운드쯤 장승이 흔들리고 탈락한다.
- 결과 화면에 그래프와 수치가 나오고, 다시 하기로 새 판이 시작된다.

- [ ] **Step 6: 커밋한다**

```bash
git add packages/client
git commit -m "feat(client): summon reveal and result screen"
```

---

### Task 13: 밸런스 1차 조정과 1단계 마무리

**Files:**
- Modify: `packages/logic/data/balance.json`, `packages/logic/data/enemies.json` (보스 hp), 필요하면 `units.json`의 factor
- Create: `docs/balance/stage1-tuning.md`

**Interfaces:**
- Consumes: Task 9 CLI

- [ ] **Step 1: 지금 값으로 시뮬레이터를 돌린다**

Run: `npm run sim -- --bot clumsy --seeds 100 --out sim-out/clumsy.csv` 그리고 `npm run sim -- --bot normal --seeds 100 --out sim-out/normal.csv`
Expected: 요약 두 개. 결과를 `docs/balance/stage1-tuning.md`의 "시작값" 절에 붙인다

- [ ] **Step 2: 목표에 맞게 수치를 고친다**

명세 12장 목표:
- 서툰 봇: 100판 중 80판 이상이 12~20라운드 사이에 탈락한다
- 보통 봇:
  - 클리어율 80% 이상
  - 일반 라운드 multiplier 중앙값이 대체로 1.2~1.5
  - 라운드 중 최대 잡귀 중앙값 15~40
  - 보스 처치 시간 중앙값 50~65초

고치는 순서:
1. `hp.base`, `hp.coef`로 웨이브 multiplier를 맞춘다
2. 보스 `hp`로 처치 시간을 맞춘다
3. 그래도 안 맞으면 `gradeDps.mult`를 본다

한 번에 한 값만 바꾸고 Step 1을 다시 돌린다. 바꿀 때마다 `stage1-tuning.md`에 "바꾼 값 → 결과" 한 줄을 남긴다.

- [ ] **Step 3: 검증과 전체 테스트를 돌린다**

Run: `npm run validate && npx vitest run`
Expected: 검증 오류 0, 테스트 PASS. 수치를 단언한 테스트(예: `enemyHp`)가 깨지면, 데이터 값이 바뀐 것을 반영해 기대값만 고친다

- [ ] **Step 4: 직접 한 판 해 본다**

Run: `npm run dev`. 처음부터 끝까지 한 판 한다.
Expected: 명세 15장 1~6번을 확인한다. 7번 "한 판 더가 나오는가"는 사용자에게 판단을 맡긴다. 사람이 해 보니 너무 쉽거나 어려웠다는 소감도 `stage1-tuning.md`에 적는다

- [ ] **Step 5: 커밋한다**

```bash
git add packages/logic/data docs/balance
git commit -m "balance: first stage 1 tuning pass"
```
