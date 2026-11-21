# 3단계 콘텐츠 데이터 구현 계획 (첫 묶음)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5차 초안의 116종·108개 조합·히든 5종을 `loadGameData('stage3')`로 읽히는 데이터로 넣고, 그 유닛들이 쓰는 새 스킬 종류를 로직에 구현하고, 검증기 규칙과 세 가지 시뮬레이터 측정(조합 이득, 고개 보스 정지율, 첫 6등급 완성 라운드)을 만들어 첫 측정 결과를 문서로 남긴다.

**Architecture:** 3단계 데이터는 `packages/logic/data/stage3/`에 두고, 로더가 1·2단계 40종·32개 조합 위에 3단계 추가분을 합친다(1·2단계 파일은 건드리지 않는다). 새 규칙은 모두 3단계 `balance` 값이나 3단계 유닛의 효과가 있을 때만 움직이고, 그 밖에는 새 상태 필드를 만들지 않는다. 그래서 1단계 골든 해시와 2단계 동작이 그대로 남는다. 측정은 `packages/sim/src/stage3/`에 두고 `npm run sim -- --stage 3 --check ...`로 돌린다.

**Tech Stack:** Windows 11, Node 22.17, npm workspaces, TypeScript 5.8 strict(`noUncheckedIndexedAccess`), Vitest 3.2, tsx 4

**Spec:** `docs/design/content-draft-116-v5.md` (이하 "v5"). 함께 읽을 것: `docs/design/content-review-04.md`(v5가 답한 검토), `docs/design/2026-11-20-stage1-spec.md` 4장(전투 규칙)·6장(조합)·11장(수입 대 비용), `docs/design/2026-11-21-stage2-spec.md` 1~3장. 앞 계획 형식은 `docs/superpowers/plans/2026-11-21-stage2-multiplayer.md`.

**실행자에게:** 각 Task는 서로 다른 구현자가 그 Task 본문만 보고 진행한다. 실행을 맡기는 쪽은 Task 본문과 함께 아래 Global Constraints와 "디자이너 결정"을 같이 넘긴다. Task의 "읽을 것"에 적힌 파일은 앞 Task가 만든 실제 코드이므로 먼저 열어 본다.

## 디자이너 결정 (구속력 있음)

1. **조합은 저항 없는 웨이브에서 언제나 이득이다.** 같은 시드·같은 배치에서 재료를 모두 둔 판(A)보다 조합하고 빈칸을 그대로 둔 판(B)의 라운드 끝 잔존 수가 하나라도 많으면 그 조합은 탈락이다(v5 2장 "합격 기준", 7장 시뮬레이터 표 첫 줄). 이번 묶음은 **측정만** 하고 수치를 고치지 않는다. 탈락은 문서에 후속 작업으로 남긴다.
2. **막힌 마지막 재료는 설화 퀘스트로 산다.** 보유한 두 재료와 비용을 내고 목표 6등급 완성품을 고개당 한 판에 한 기 받는다(v5 7장). 이번 묶음 범위 밖이다(후속 작업).
3. **역신은 스턴·둔화·밀어내기에 완전 면역을 유지한다.** 상한 규칙은 역신에게 적용하지 않는다.
4. **고개 보스(`boss: true`)는 명시적 스턴·밀어내기 상한을 갖는다.** 직전 200틱에 실제 스턴 60틱, 실제 밀어내기 3칸, 누적 정지 틱 ≤ ⌊0.30 × 생존 틱⌋(v5 6장 "역신과 고개 보스" 아래 문단). 목표는 정지 시간 최대 30%다.

## Global Constraints

- 작업은 `C:\workspace\web-game-s3`(브랜치 `stage3-s3`)에서만 한다. `C:\workspace\web-game`과 다른 워크트리는 건드리지 않는다. 병합·푸시하지 않는다.
- Windows 11에서 Bash 도구(POSIX 문법)를 쓴다. 기존 파일의 줄바꿈(LF)을 그대로 둔다. 새 파일도 LF.
- 1단계 진입점 `loadGameData()`, `createGame`, `step`과 2단계 `loadGameData('stage2')`·`createMatch`·`stepMatch`의 반환 필드, 이벤트, 거절 사유, 난수 소비 순서를 바꾸지 않는다. `npx vitest run packages/sim/test/golden.test.ts`가 모든 Task 뒤에 통과해야 한다.
- `packages/logic/data/*.json`과 `packages/logic/data/stage2/*.json`은 수정하지 않는다. 각 Task 끝에서 `git diff --stat main -- packages/logic/data/*.json packages/logic/data/stage2` 출력이 비어 있어야 한다(`main` 대신 브랜치 시작 커밋 `a12491d`를 써도 된다).
- 새 상태 필드(`Unit`, `Enemy`, `GameState`)는 모두 선택 필드이고, 3단계 유닛의 효과나 3단계 `balance` 플래그가 실제로 쓸 때만 값을 넣는다. `stateHash`는 `undefined` 키를 빼므로 이렇게 해야 1단계 해시가 같다. 새 트리거·효과는 전투 난수를 새로 뽑지 않는다(`chance` 트리거만 뽑는다).
- 모든 Task 끝에서 `npx vitest run`(전체)과 `npm run typecheck`가 통과해야 한다. 기존 시험의 기대값은 고치지 않는다.
- `packages/logic`은 `Math.random`, `Date`, `performance`, DOM을 쓰지 않는다. 1틱 = 50ms, 초→틱은 `toTicks(seconds)`.
- 규칙 수치는 `packages/logic/data/stage3/*.json`에 둔다. 예외는 검증기의 레시피 모양·비용 표(Task 3)와 시뮬레이터 시나리오 상수(Task 9·10)다.
- 백분율 필드는 기존처럼 소수다(`0.05` = 5%). v5 변경표의 `onBasicHit.targetPct`·`splashPct`도 소수로 넣는다.
- 3단계 유닛의 `name`은 v5 표의 표시명 그대로다(예: `bihyeongrang`의 이름은 "귀교 목수", `bulgasari`는 "쇠밥짐승").
- 화면·문서 문구는 자연스러운 한국어, 코드와 주석은 영어.
- 커밋은 Task마다 한 번. 메시지 끝 줄은 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `sim-out/`은 커밋하지 않는다.
- 이번 묶음에서 빼는 것: 설화 퀘스트와 그 화면, 길들이기, 뽑기 장터, 클라이언트 3단계 화면(도감·조합 카드), 3단계 6인 협동 실행, 60라운드판 역신 일정, 난이도 선택, v5 수치 조정. 모두 Task 10 문서의 후속 작업 절에 적는다.

## Review Focus

1. **1·2단계 상태에 새 키가 생기는 경우.** 스턴이 끝나거나 밀려난 1단계 적에 `stunEndTick`·`knockedRound`·`ctl`이 붙으면 골든 해시는 깨지지 않더라도 2단계 화면 상태가 달라진다. 1단계 데이터로 스턴·밀기를 겪은 적에 새 키가 없어야 한다. 시험은 Task 6(`stunEndTick`)과 Task 8(`ctl`)에 있다.
2. **비용이 모자란 조합.** 재료는 다 있는데 메밀묵이나 엽전이 모자라면 거절되고 재료·메밀묵·엽전이 하나도 줄지 않아야 한다. 시험은 Task 4에 있다.
3. **주기 공격이 기다리던 중 첫 적이 들어올 때.** 배치 직후 준비 상태인 주기 스킬은 적이 없으면 기다렸다가 첫 대상이 사거리에 든 틱에 바로 한 번 발동한다(v5 6장 "시계와 이동"). 시험은 Task 6에 있다.
4. **충전 중인 유닛을 옮기거나 팔 때.** 이동은 충전·횟수를 유지하고, 판매·조합으로 생긴 새 유닛은 처음부터 센다. 시험은 Task 6에 있다.
5. **등장 직후 스턴된 고개 보스.** 생존 틱이 짧아 30% 예산이 0이면 스턴은 그 틱에 끝나고 보스는 움직인다. 영원히 멈춰 있거나 예산이 음수로 가지 않는다. 입구 근처에서 밀린 거리도 0 아래로 내려가지 않는다. 시험은 Task 8에 있다.

---

## 파일 구조

```
packages/logic/
  data/stage3/units.json        새 일반 76종 + 히든 5종 (Task 1: 2~4등급 20종, Task 2: 5·6등급 56종 + 히든)
  data/stage3/recipes.json      새 조합 76개, 5·6등급은 cost 포함 (Task 1·2)
  data/stage3/onBasicHit.json   v5 추가 피해 변경표 31종 (Task 1: 9종, Task 2: 22종)
  data/stage3/enemies.json      30·40·50·60라운드 임시 고개 보스 4종 (Task 1)
  data/stage3/waves.json        60라운드 웨이브 (Task 1)
  data/stage3/balance.json      3단계 규칙 플래그와 수치 (Task 1)
  src/types.ts                  새 트리거·효과·필드 타입 전부 (Task 1)
  src/data.ts                   loadGameData('stage3'), 계열 목록(lineage) 계산 (Task 1)
  src/validate.ts               3단계 검증 규칙 (Task 3)
  scripts/validate.ts           stage3 포함 (Task 3)
  src/combine.ts                조합 비용 (Task 4)
  src/combat.ts                 강화 계승, 오라 상한, 처치 시 두두리 폭발 (Task 4·7)
  src/units.ts                  주기 즉시 준비, 충전 초기화 (Task 4·6)
  src/effects.ts                확장 필드, 타격 묶음, 새 메커니즘 (Task 5·6·7)
  src/income.ts                 엽전 지급 효과 (Task 7)
  src/bosscontrol.ts            고개 보스 제어 상한 (Task 8)
  src/flow.ts game.ts           moveEnemies(state, events) (Task 8)
  src/testing.ts                makeData(…, 'stage3') (Task 1)
  test/v5-table.ts              v5 표 파서 (시험 도우미, Task 1)
  test/data-stage3.test.ts      (Task 1·2)
  test/validate-stage3.test.ts  (Task 3)
  test/stage3-rules.test.ts     (Task 4)
  test/stage3-effects.test.ts   (Task 5)
  test/stage3-mechanics.test.ts (Task 6·7)
  test/boss-control.test.ts     (Task 8)
packages/client/src/ui/models.ts  거절 문구 한 줄 (Task 4)
packages/sim/
  src/stage3/probe.ts           무저항 시험 잡귀 데이터 (Task 9)
  src/stage3/combineGain.ts     조합 이득 측정 (Task 9)
  src/stage3/control.ts         고개 보스 정지율 측정 (Task 9)
  src/stage3/report.ts          마크다운 요약 (Task 9·10)
  src/stage3/cli.ts             --stage 3 --check (Task 9·10)
  src/stage3/targetBot.ts       목표 6등급을 쫓는 봇 (Task 10)
  src/stage3/grade6.ts          첫 6등급 완성 라운드 측정 (Task 10)
  src/cli.ts bots.ts            --stage 3 분기, 도우미 export (Task 9·10)
  test/stage3-sim.test.ts       (Task 9·10)
docs/balance/stage3-first-pass.md  (Task 10)
```

## 새 스킬 종류 목록

기존 종류(`chance`·`nth`·`always`·`periodic`·`aura` 트리거, `extraAttack`·`crit`·`execute`·`splash`·`pierce`·`allInRange`·`stun`·`slow`·`knockback`·`vuln`·`dot`·`groundFire`·`onKillExplode`·`auraAttackSpeed`·`auraAttackPower`·`auraEnemyVuln` 효과)는 그대로 쓴다. v5 유닛 때문에 새로 생기는 것은 아래가 전부다.

| 구분 | 이름 | 쓰는 유닛 | Task |
| --- | --- | --- | --- |
| 새 트리거 | `charge {seconds}` | 감투 도깨비, 천년 무쇠솥 | 6 |
| 새 트리거 | `streak {n}` | 외다리 도깨비 | 6 |
| 새 트리거 | `targetHpBelow {pct}` | 천년 문빗장 | 6 |
| 새 트리거 | `targetSlowed` | 천년 떡판 | 6 |
| 새 트리거 | `neighborHits {count, lockoutSeconds}` | 귀교 목수 | 7 |
| 새 효과 | `strike {mult}` (주 대상 추가 피해) | 새끼줄, 6등급 다수 | 6 |
| 새 효과 | `chain {range, mult, maxBounces}` | 빚 갚는 도깨비 | 6 |
| 새 효과 | `rampCrit {step, max}` | 천년 연적 | 6 |
| 새 효과 | `onVulnKillExplode {radius, mult, cooldownSeconds}` | 두두리 | 7 |
| 새 효과 | `coinOnFirstHit {coins}` | 방망이 도깨비 | 7 |
| 새 효과 | `coinTimer {everySeconds, coins, maxPerRound}` | 빚 갚는 도깨비 | 7 |
| 기존 확장 | `nth.phase` (홀짝) | 천년 다듬잇돌, 천년 노 | 5 |
| 기존 확장 | `periodic`에 상태 이상(전체) | 먹, 맷돌, 천년 징, 강철이(히든) | 5 |
| 기존 확장 | `periodic` 타격 묶음(`allInRange` 없는 주기 스킬) | 방망이·길달·제주 영감·빚 갚는·닻돌·돌물확·관솔횃대·곰방대·요강 | 6 |
| 기존 확장 | 상태 이상 `radius`·`area: 'hit' \| 'others'` | 인두판, 그물바늘, 끌, 제주 허벅 등 | 5 |
| 기존 확장 | `groundFire.align: 'center' \| 'ahead' \| 'behind'` | 잿물시루, 짚배, 제주 영감 | 5 |
| 기존 확장 | `auraAttackSpeed.damageType` | 인두, 물레, 천년 병풍 | 5 |
| 기존 확장 | `auraEnemyVuln.damageType`, `source` | 북, 제주 영감 | 5 |
| 기존 확장 | `vuln.source`, `auraAttackPower.source` (같은 출처 중복 금지) | 맷방석, 무쇠솥, 징, 요강, 상모 | 5 |
| 기존 확장 | `splash.radiusCycle` | 천년 상모 | 6 |
| 기존 확장 | `splash.stunnedBonus` | 천년 요강 | 6 |
| 기존 확장 | `pierce.both`, `pierce.knockedBonus` | 길달, 천년 돛 | 6 |
| 기존 확장 | `onKillExplode.requireExecute` | 천년 떡살 | 6 |
| 유닛 필드 | `onBasicHit {targetPct, splashPct}` | v5 변경표 31종 | 5 |
| 판 규칙 | 조합 비용, 강화 계승, 오라 상한, 주기 즉시 준비 | 3단계 전체 | 4 |
| 판 규칙 | 고개 보스 제어 상한 | 고개 보스 | 8 |

---

### Task 1: 3단계 타입·로더와 2~4등급 데이터

**Implementer:** astra

**Files:**
- Modify: `packages/logic/src/types.ts`, `packages/logic/src/data.ts`, `packages/logic/src/testing.ts`, `packages/client/src/ui/models.ts`(도감 문구 switch에 새 종류 추가, 아래 참고)
- Create: `packages/logic/data/stage3/units.json`, `recipes.json`, `onBasicHit.json`, `enemies.json`, `waves.json`, `balance.json`
- Create: `packages/logic/test/v5-table.ts`
- Test: `packages/logic/test/data-stage3.test.ts`

**읽을 것:** v5 2장(1~4등급 표, 3단계 추가 피해 변경표), `packages/logic/src/data.ts`의 stage2 분기, `packages/logic/test/data-stage2.test.ts`.

**Interfaces:**
- Produces (types.ts, 기존 멤버는 그대로 두고 아래를 더한다):

```ts
export type StatusArea = { radius?: number; area?: 'hit' | 'others' };
export type Trigger =
  | { kind: 'chance'; p: number } | { kind: 'nth'; n: number; phase?: number }
  | { kind: 'always' } | { kind: 'periodic'; seconds: number } | { kind: 'aura' }
  | { kind: 'charge'; seconds: number } | { kind: 'streak'; n: number }
  | { kind: 'targetHpBelow'; pct: number } | { kind: 'targetSlowed' }
  | { kind: 'neighborHits'; count: number; lockoutSeconds: number };
export type Effect =
  | { kind: 'extraAttack' }
  | { kind: 'crit'; mult: number }
  | { kind: 'execute'; hpBelow: number; mult: number }
  | { kind: 'splash'; radius: number; mult: number; radiusCycle?: number[]; stunnedBonus?: { mult: number; graceSeconds: number } }
  | { kind: 'pierce'; length: number; mult: number; both?: boolean; knockedBonus?: number }
  | { kind: 'allInRange'; mult: number }
  | { kind: 'strike'; mult: number }
  | { kind: 'chain'; range: number; mult: number; maxBounces: number }
  | { kind: 'rampCrit'; step: number; max: number }
  | ({ kind: 'stun'; seconds: number } & StatusArea)
  | ({ kind: 'slow'; pct: number; seconds: number } & StatusArea)
  | ({ kind: 'knockback'; distance: number } & StatusArea)
  | ({ kind: 'vuln'; pct: number; seconds: number; damageType: DamageType | 'all'; maxStacks?: number; source?: string } & StatusArea)
  | ({ kind: 'dot'; mult: number; seconds: number } & StatusArea)
  | { kind: 'groundFire'; length: number; seconds: number; pulseMult: number; align?: 'center' | 'ahead' | 'behind' }
  | { kind: 'onKillExplode'; radius: number; mult: number; requireExecute?: boolean }
  | { kind: 'onVulnKillExplode'; radius: number; mult: number; cooldownSeconds: number }
  | { kind: 'auraAttackSpeed'; pct: number; damageType?: DamageType }
  | { kind: 'auraAttackPower'; pct: number; damageType: DamageType | 'all'; source?: string }
  | { kind: 'auraEnemyVuln'; pct: number; damageType?: DamageType; source?: string }
  | { kind: 'coinOnFirstHit'; coins: number }
  | { kind: 'coinTimer'; everySeconds: number; coins: number; maxPerRound: number };
export interface UnitDef { /* existing fields */ hidden?: boolean; onBasicHit?: { targetPct: number; splashPct: number }; lineage?: DamageType[] }
export interface RecipeDef { result: string; materials: string[]; cost?: { buckwheat?: number; coins?: number } }
export interface BossControlDef { windowTicks: number; stunTicks: number; pushDistance: number; maxStoppedShare: number }
export interface BossControlLog {
  alive: number; stopped: number; stunLog: number[]; pushLog: [number, number][];
  stunClipped: number; pushClipped: number; entranceClipped: number; pushApplied: number; maxWindowStopped: number;
}
// BalanceDef gains (all optional):
//   onBasicHitRadius?: number; auraCaps?: { attackSpeed: number; attackPower: number };
//   inheritUpgrades?: boolean; periodicReady?: boolean; extendedCombat?: boolean; bossControl?: BossControlDef
// Unit gains (all optional): chargeTicks?: number; charged?: boolean; streak?: { enemyId: number; count: number };
//   neighborHits?: number; neighborLockUntil?: number; explodeReadyTick?: number
// Enemy gains (all optional): stunEndTick?: number; knockedRound?: number;
//   vulnCaster?: { unitId: number; attack: number; key: string }; ctl?: BossControlLog
// GameState gains (optional): income?: { round: number; firstHit: Record<string, true>; timerTicks: Record<string, number>; timerPaid: Record<string, number> }
// RejectReason gains: 'noBuckwheat'
```

  기존 `slow`의 `radius?`는 `StatusArea`로 옮겨 같은 뜻을 유지한다.
- Produces (client `models.ts`): `effectText`는 `default` 없이 모든 `Effect`를 다루는 switch라서 새 종류를 넣지 않으면 `npm run typecheck`가 깨진다. 아래 문구를 더한다(3단계 화면은 범위 밖이고, 타입을 맞추는 최소 변경이다).
  - `strike`: `` `대상에게 공격력 ${pct(e.mult)} 추가 피해` ``, `chain`: `` `${e.range}칸 안의 다음 적에게 차례로 ${pct(e.mult)} (최대 ${e.maxBounces}번)` ``, `rampCrit`: `` `같은 적을 연달아 치면 피해가 ${e.step}배씩 올라 최대 ${e.max}배` ``, `onVulnKillExplode`: `` `약화된 적이 쓰러지면 주변 ${e.radius}칸 폭발 ${pct(e.mult)}` ``, `coinOnFirstHit`: `` `라운드 첫 명중에 엽전 ${e.coins}냥` ``, `coinTimer`: `` `전투 ${e.everySeconds}초마다 엽전 ${e.coins}냥 (라운드당 최대 ${e.maxPerRound}냥)` ``
  - `triggerText`: `charge` `` `${t.seconds}초마다 충전한 다음 공격에 ` ``, `streak` `` `같은 적을 ${t.n}번 연달아 치면 ` ``, `targetHpBelow` `` `체력 ${pct(t.pct)} 이하 대상에게 ` ``, `targetSlowed` `'둔화된 대상에게 '`, `neighborHits` `` `이웃의 기본 공격 ${t.count}번마다 ` ``. 기존 문구는 바꾸지 않는다.
- Produces (data.ts): `loadGameData(stage: 'stage1' | 'stage2' | 'stage3' = 'stage1'): GameData`
  - stage3 = stage1 + stage2 + stage3 유닛, 조합(등급 순 정렬, 같은 등급 안에서는 1단계·2단계·3단계 순, stage2와 같은 방식), 적 = stage1 + stage2 + stage3, 웨이브 = `stage3/waves.json`, balance = `{ ...balance, ...balance2, ...balance3 }`, upgrades = 1단계, coop = 2단계 coop.
  - `onBasicHit.json`(`Record<string, { targetPct: number; splashPct: number }>`)의 각 항목을 같은 ID 유닛의 `onBasicHit`에 넣는다. 없는 ID면 `throw new Error('onBasicHit for unknown unit <id>')`.
  - stage3에서만 모든 유닛에 `lineage`를 넣는다: 1등급은 `[자기 계열]`, 윗등급은 재료들의 `lineage`와 자기 계열의 합집합. 배열은 `['magical', 'physical']` 순서로 정렬한 중복 없는 목록.
- Produces (testing.ts): `makeData(patch, stage: 'stage1' | 'stage2' | 'stage3' = 'stage1')`
- Produces (test/v5-table.ts): `readV5(): { units: V5Unit[]; recipes: V5Recipe[] }`
  - `V5Unit = { id: string; name: string; grade: number; hidden: boolean; damageType: DamageType; range: number; interval: number; factor: number }`
  - `V5Recipe = { result: string; materials: string[]; buckwheat: number; coins: number }`
  - v5 파일을 `new URL('../../../docs/design/content-draft-116-v5.md', import.meta.url)`로 읽는다. `### N등급` 아래 표의 행(`| id | 이름 | 계열 | 사거리 | 간격 | 계수 | 스킬 | 재료 | …`)을 유닛으로, `## 5. 히든 유닛` 아래 표의 행을 `hidden: true`, `grade: 6` 유닛으로 읽는다. 계열 `물`→`physical`, `마`→`magical`. 재료 칸은 ` + `로 나누고 `메밀묵 1개`는 `buckwheat: 1`, `엽전 60냥`은 `coins: 60`, `X ×2`는 X 두 번, 나머지는 같은 표의 표시명으로 ID를 찾는다. `소환 전용`(1등급)과 히든 행은 조합을 만들지 않는다.

**데이터 내용.**

`balance.json` (정확히 이 값):

```json
{
  "prepSeconds": 30, "rounds": 60,
  "sellPrice": [5, 10, 20, 40, 80, 180],
  "onBasicHitRadius": 3,
  "auraCaps": { "attackSpeed": 0.5, "attackPower": 0.4 },
  "inheritUpgrades": true, "periodicReady": true, "extendedCombat": true,
  "bossControl": { "windowTicks": 200, "stunTicks": 60, "pushDistance": 3, "maxStoppedShare": 0.3 }
}
```

`sellPrice`의 5·6등급 값과 아래 보스 체력은 v5에 없는 임시값이다. Task 10 문서에 임시값으로 적는다.

`enemies.json`: `jinegaksi3`(이름 "지네각시", hp 38000), `gangcheori4`("강철이", 58000, 마딜 저항 0.3), `jinegaksi5`("지네각시", 82000), `gangcheori6`("강철이", 107000, 마딜 저항 0.3). 모두 `boss: true`, `hpMult: 1`, `speed: 0.9`, 지네각시 계열 저항은 0/0. 체력은 그 라운드 일반 웨이브 체력 합(30 × (75 + 19 × r^1.5))의 약 40%다.

`waves.json`: 1~60라운드. 10·20·30·40·50·60은 각각 `jinegaksi`, `gangcheori`, `jinegaksi3`, `gangcheori4`, `jinegaksi5`, `gangcheori6` 보스 웨이브. 나머지 라운드 r은 1단계 `waves.json`의 `((r - 1) % 20) + 1` 라운드 패턴을 그대로 쓴다.

`units.json`(이번 Task는 새 2~4등급 20종만)과 `recipes.json`(그 20종의 조합). ID·이름·계열·사거리·간격·계수·재료는 v5 표 그대로다. 스킬은 아래 대응표로 옮긴다.

| v5 문구 | JSON |
| --- | --- |
| N% 확률로 … | 트리거 `{ "kind": "chance", "p": N/100 }` |
| N번째 공격마다 … | `{ "kind": "nth", "n": N }` |
| 공격마다 …, 조건 없는 처형·약화 | `{ "kind": "always" }` |
| N초마다 사거리 안 모든 적에게 X% | `periodic` + `allInRange { mult }` (+ 같은 문장의 상태 이상) |
| N초마다 대상에게 … | `periodic` + `strike` 묶음 (6등급, Task 2) |
| 강타 X배 | `crit { mult: X }` |
| 체력 P% 이하 대상 처형 X배 | `always` + `execute { hpBelow, mult }` |
| (맞은 적) 주변 R칸에 X% 피해 | `splash { radius: R, mult }` |
| 대상 뒤 L칸에 X% 피해 | `pierce { length: L, mult }` |
| 대상에게 (줄로…) X% 추가 피해 | `strike { mult }` |
| 추가 공격 1회 | `extraAttack` |
| 스턴 S초 / S초간 멈춰 세운다 | `stun { seconds }` |
| 둔화 P% S초 / S초간 P% 느리게 | `slow { pct, seconds }` |
| 밀어내기 D칸 | `knockback { distance }` |
| 받는 물딜(마딜) +P% S초 | `vuln { pct, seconds, damageType }` |
| S초간 총 X% 피해 | `dot { mult, seconds }` |
| 불길·자국 L칸 S초, 0.5초마다 X% | `groundFire { length, seconds, pulseMult }` |
| 이웃 8칸 (물딜/마딜) 아군 공속·공격력 | `aura` + `auraAttackSpeed`·`auraAttackPower` (계열 지정) |
| "주변 R칸 … 대상과 주변 적 <상태>" | 상태 이상에 `radius: R` |

새 2~4등급 20종의 스킬 JSON(약식: `트리거: 효과들`):

| id | 스킬 |
| --- | --- |
| dunggumi | nth 4: crit 1.8 |
| samtaegi | chance .25: splash 1/.85, slow .2/1.5 radius 1 |
| mogitbul | nth 3: pierce 2.5/.65, slow .25/2 |
| saekkijul | nth 3: strike .85, slow .4/2.5 |
| sutdarimi | chance .3: dot 1.75/3, vuln magical .12/3 |
| hongdukkae | always: execute .25/2.2 |
| bujipge | chance .25: stun .85, vuln physical .1/2 |
| jaetmulsiru | always: groundFire length 1.5, seconds 2.5, pulseMult .28, align behind |
| jipsingol | chance .2: slow .32/2 radius 1.25 |
| che | chance .25: splash 1.1/.65 |
| dwiju | chance .25: crit 2, knockback .75 |
| meok | periodic 5: allInRange 1.55, slow .2/1.5 |
| geumulbaneul | nth 3: slow .38/2.5 radius 1.25, vuln physical .1/2.5 radius 1.25 |
| indupan | nth 4: crit 2.25, stun .6 radius 1 |
| indu | aura: auraAttackSpeed .15 magical · nth 4: splash 1/.75 |
| soemangchi | nth 5: crit 2, stun .5 |
| mulle | nth 3: extraAttack · aura: auraAttackSpeed .12 physical |
| yagyeon | always: execute .28/2.45 · nth 4: vuln magical .15/3 |
| maetdol | periodic 3: allInRange .9, slow .28/1.5 |
| jige | chance .25: knockback 1.5, crit 1.85 |

`onBasicHit.json`(이번 Task는 이미 있는 유닛 9종): `meongseok`, `sseurebatgi`, `jwibul`, `bujipge`, `jaetmulsiru`, `gawi`, `indu` = `{ targetPct: 0, splashPct: 0.05 }`, `hwaetbul` = `{ 0.05, 0 }`, `pulmu` = `{ 0, 0.15 }`.

- [ ] **Step 1: 실패하는 시험을 쓴다** — `packages/logic/test/data-stage3.test.ts`

```ts
const d3 = loadGameData('stage3');
const v5 = readV5();
const normal = (g: number) => d3.units.filter(u => u.grade === g && !u.hidden);

test('grades 1-4: 8/12/18/22 units with v5 physical splits 4/7/10/14', () => {
  expect([1, 2, 3, 4].map(g => normal(g).length)).toEqual([8, 12, 18, 22]);
  expect([1, 2, 3, 4].map(g => normal(g).filter(u => u.damageType === 'physical').length)).toEqual([4, 7, 10, 14]);
  expect(d3.recipes.filter(r => unitDef(d3, r.result).grade <= 4).length).toBe(52);
});
test('every v5 row of grade <= 4 matches stats, name and recipe', () => { /* for each v5 unit with grade<=4:
  expect(unitDef(d3,id)).toMatchObject({ name, grade, damageType, range, interval, factor });
  recipe materials sorted equal v5 materials sorted; recipe.cost undefined */ });
test('stage 1 and stage 2 untouched', () => {
  expect(loadGameData().units.length).toBe(22); expect(loadGameData('stage2').units.length).toBe(40);
  expect(loadGameData('stage2').units.every(u => u.onBasicHit === undefined && u.lineage === undefined)).toBe(true);
  expect(loadGameData('stage2').balance.bossControl).toBeUndefined();
});
test('balance, waves, provisional bosses', () => {
  expect(d3.balance).toMatchObject({ rounds: 60, prepSeconds: 30, onBasicHitRadius: 3, periodicReady: true,
    bossControl: { windowTicks: 200, stunTicks: 60, pushDistance: 3, maxStoppedShare: 0.3 } });
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
  expect(unitDef(d3, 'jaetmulsiru').skills).toEqual([{ trigger: { kind: 'always' },
    effects: [{ kind: 'groundFire', length: 1.5, seconds: 2.5, pulseMult: 0.28, align: 'behind' }] }]);
  expect(unitDef(d3, 'indupan').skills[0]!.effects[1]).toEqual({ kind: 'stun', seconds: 0.6, radius: 1 });
  expect(unitDef(d3, 'mulle').skills[1]).toEqual({ trigger: { kind: 'aura' }, effects: [{ kind: 'auraAttackSpeed', pct: 0.12, damageType: 'physical' }] });
});
```

- [ ] **Step 2: 실패를 확인한다** — Run: `npx vitest run packages/logic/test/data-stage3.test.ts` / Expected: FAIL (`loadGameData('stage3')` 타입 오류 또는 빈 데이터)
- [ ] **Step 3: 타입, 로더, `makeData`, `v5-table.ts`, 데이터 6개 파일을 만든다** (위 Interfaces와 데이터 내용대로)
- [ ] **Step 4: 통과를 확인한다** — Run: `npx vitest run packages/logic/test/data-stage3.test.ts packages/sim/test/golden.test.ts && npm run typecheck` / Expected: PASS
- [ ] **Step 5: 전체 시험 후 커밋한다** — `npx vitest run` 통과 뒤 `git add packages/logic packages/client/src/ui/models.ts && git commit -m "feat(stage3): dataset loader, schema and grade 2-4 units"` (끝 줄에 Co-Authored-By)

---

### Task 2: 5·6등급과 히든 데이터

**Implementer:** astra

**Files:**
- Modify: `packages/logic/data/stage3/units.json`, `recipes.json`, `onBasicHit.json`
- Test: `packages/logic/test/data-stage3.test.ts` (시험 추가)

**읽을 것:** v5 2장 5·6등급 표, 5장 히든 표, 6장 "새 발동 조건과 대상 선택"·"지원 효과의 출처", Task 1의 대응표.

**Interfaces:**
- Consumes: Task 1의 타입, `readV5()`
- Produces: 5등급 26종, 6등급 30종, 히든 5종(`"hidden": true`, `"grade": 6`, 조합 없음), 5등급 조합 26개(`"cost": { "buckwheat": 1 }`), 6등급 조합 30개(`"cost": { "buckwheat": 1, "coins": 60 }`), `onBasicHit.json` 22종 추가.

**5등급 스킬** (Task 1 대응표 기준, 새 필드가 들어가는 것):

| id | 스킬 |
| --- | --- |
| top | nth 3: crit 2.6, stun 1.25, splash 1/.8 |
| kkeul | nth 4: pierce 2.5/1.2, slow .28/2 area others |
| gat | nth 4: splash 1.6/1.15 · aura: auraAttackPower .13 magical |
| eomang | nth 3: splash 1.5/.75, slow .42/3 radius 1.5 |
| ssatba | chance .3: stun 1.15 · always: execute .25/2.2 |
| jejuheobeok | nth 3: pierce 3/1.15, slow .3/2 area hit |
| jipbae | nth 5: groundFire 2.5/3/.38 align ahead |
| buk | aura: auraEnemyVuln .15 physical · nth 4: stun 1.2 |
| hahoetal | nth 5: splash 1.6/1.25, stun .85 radius 1.6 |
| dokki | nth 4: crit 2, slow .4/2.5 radius 1.3 |
| jojokdeung | chance .3: pierce 3.5/1.15, slow .25/2 area hit |
| tewak | always: groundFire 2/2.5/.3 |
| tteoksiru | nth 4: splash 1.6/1.35, slow .27/2 radius 1.6 |
| yeotpan | always: slow .3/1.5 · nth 4: splash 1.5/1.15 |
| gireumteul | nth 3: crit 2.4, vuln physical .19/3 |

나머지 5등급(banjitgori, dongwe, manggeon, geumulchu, beoseon, janggu, kkwaenggwari, yeopjeonkkureomi, maksabal, yaktanggi, sil)은 대응표만으로 옮긴다.

**6등급과 히든 스킬** (정확히 이 구성):

| id | 스킬 |
| --- | --- |
| bihyeongrang | always: strike 1.15, pierce 3/.55 · aura: auraAttackPower .1 all · neighborHits {count 8, lockoutSeconds 2}: pierce 3/.8 |
| bangmangidokkaebi | periodic 5: strike 1.7, splash 1.8/1.7 · always: coinOnFirstHit 4 |
| gamtudokkaebi | charge 4: crit 3.2, stun .4, splash 1.5/2.0 |
| gimseobang | always: strike .45, splash 1.75/.48, slow .42/3 radius 1.75 |
| oedaridokkaebi | streak 3: crit 2.2, stun .6 · always: splash .9/.4 |
| jejuyeonggam | periodic 6: strike 1.95, pierce 3/1.35, groundFire 1/1/.25 align ahead · aura: auraEnemyVuln .15 physical source buk |
| gildal | periodic 3: strike 1.55, stun .5, pierce 1.5/1.25 both |
| duduri | always: crit 1.3, splash 1/.45, vuln physical .08/3 · always: onVulnKillExplode radius 1.5, mult .8, cooldownSeconds 1.1 |
| bitdondokkaebi | periodic 5: strike 2.35, chain {range 1, mult 1.8, maxBounces 5} · always: coinTimer {everySeconds 10, coins 2, maxPerRound 6} |
| gaetgilbuldokkaebi | always: strike .4, pierce 4/.6, vuln magical .08/3 |
| cheonnyeondatdol | periodic 5: strike 1.35, pierce 2/1.4, knockback 1.5 |
| cheonnyeonmaetbangseok | nth 4: strike 2.05, splash 2/1.6 · always: vuln physical .19/3 source gireumteul |
| cheonnyeondadeumitdol | nth {n 2, phase 1}: crit 1.8 · nth 2: splash 1/.85 |
| cheonnyeonmunbitjang | always: pierce 1.5/.5 · targetHpBelow .5: crit 2.4, slow .3/1 |
| cheonnyeondoe | nth 7: crit 3.8, splash 1.75/2.6 |
| cheonnyeontteokpan | targetSlowed: crit 1.15 · always: slow .35/3, groundFire 2/1/.15 |
| cheonnyeontteoksal | always: splash 1/.42, execute .5/2.3, onKillExplode radius 1, mult .8, requireExecute true |
| cheonnyeondolmulhwak | periodic 4: strike 1.35, splash 1.5/1.25, knockback .75 radius 1.5 |
| cheonnyeonno | nth {n 2, phase 1}: crit 1.9 · nth 2: pierce 3.5/.95 |
| cheonnyeonmuseosot | charge 4: crit 2.1, splash 2/1.1, stun .5 radius 2 · always: vuln magical .17/4 source yaktanggi |
| cheonnyeonjing | periodic 7: allInRange 3.05, stun .5 · always: vuln physical .04/4 maxStacks 5 source moru |
| cheonnyeoneohwa | periodic 5: dot 1.9/2 radius 2 |
| cheonnyeongombangdae | periodic 5: dot 3.05/4 radius 1.75, vuln magical .08/4 radius 1.75 |
| cheonnyeonjocheongdanji | always: slow .35/2.5 radius 1.25, dot .75/1.5 radius 1.25 |
| cheonnyeonyogang | periodic 5: strike 2.15, splash 1.25/1.85 stunnedBonus {mult 1.5, graceSeconds 1} · always: vuln magical .17/4 source yaktanggi |
| cheonnyeonyeonjeok | always: rampCrit {step .15, max 1.45}, pierce 2/.55 |
| cheonnyeonjokja | aura: auraAttackPower .12 magical · nth 3: strike 1.55, pierce 3/1.45 |
| cheonnyeondot | always: strike .5, pierce 2.5/.6 knockedBonus 1.8 |
| cheonnyeonbyeongpung | aura: auraAttackSpeed .12 physical · chance .25: crit 3, splash 1.5/1.55 |
| cheonnyeonsangmo | always: strike .45, splash radius .5 mult .65 radiusCycle [.5, 1, 1.5, 2], vuln magical .15/3 source manggeon · aura: auraAttackPower .13 magical source gat |
| jinegaksi (히든) | nth 4: pierce 3/1.25, vuln physical .16/3 area hit |
| gangcheori (히든) | periodic 5: allInRange 1.75, dot .85/3 |
| bulgasari (히든) | always: vuln physical .2/3, execute .2/2.5 |
| ssireumdokkaebi (히든) | nth 4: crit 2.3, stun 1.5, knockback 1 |
| eoduksini (히든) | nth 4: splash 1.8/1.3, slow .4/2.5 radius 1.8 |

`onBasicHit.json` 추가 22종: `banjitgori`, `beoseon`, `jejuheobeok`, `buk`, `hahoetal`, `yeotpan`, `oedaridokkaebi`, `bitdondokkaebi`, `cheonnyeonjocheongdanji` = `{0, .05}`; `tewak` = `{0, .15}`; `gat`, `cheonnyeontteoksal`, `cheonnyeonyogang` = `{0, .1}`; `eomang` = `{.1, 0}`; `geumulchu` = `{0, .2}`; `jipbae` = `{.15, .2}`; `jojokdeung` = `{.15, 0}`; `yaktanggi` = `{0, .25}`; `tteoksiru` = `{.2, .2}`; `cheonnyeonmunbitjang` = `{.3, .1}`; `cheonnyeontteokpan` = `{0, .35}`; `cheonnyeonyeonjeok` = `{.25, .15}`.

- [ ] **Step 1: 실패하는 시험을 더한다**

```ts
test('full v5 counts: 116 normal + 5 hidden, 108 recipes, physical 65', () => {
  expect([5, 6].map(g => normal(g).length)).toEqual([26, 30]);
  expect(d3.units.filter(u => !u.hidden).length).toBe(116);
  expect(d3.units.filter(u => u.hidden).map(u => u.id).sort()).toEqual(['bulgasari', 'eoduksini', 'gangcheori', 'jinegaksi', 'ssireumdokkaebi']);
  expect(d3.units.filter(u => !u.hidden && u.damageType === 'physical').length).toBe(65);
  expect([5, 6].map(g => normal(g).filter(u => u.damageType === 'physical').length)).toEqual([15, 15]);
  expect(d3.recipes.length).toBe(108);
});
test('every v5 row matches stats, name, recipe and cost', () => { /* all v5 units; hidden: no recipe;
  grade 5 cost {buckwheat:1}; grade 6 cost {buckwheat:1, coins:60} */ });
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
```

- [ ] **Step 2: 실패를 확인한다** — Run: `npx vitest run packages/logic/test/data-stage3.test.ts` / Expected: 새 시험 FAIL, Task 1 시험 PASS
- [ ] **Step 3: 세 데이터 파일에 5·6등급·히든을 넣는다**
- [ ] **Step 4: 통과를 확인한다** — Run: `npx vitest run packages/logic packages/sim/test/golden.test.ts && npm run typecheck` / Expected: PASS
- [ ] **Step 5: 커밋한다** — `git commit -m "feat(stage3): grade 5-6 and hidden unit data"`

---

### Task 3: 3단계 검증기 규칙

**Implementer:** sol

**Files:**
- Modify: `packages/logic/src/validate.ts`, `packages/logic/scripts/validate.ts`
- Test: `packages/logic/test/validate-stage3.test.ts`

**읽을 것:** `packages/logic/src/validate.ts` 전체, v5 4장(수요 점검), 1단계 명세 6.1.

**Interfaces:**
- Consumes: `loadGameData('stage3')`, `RecipeDef.cost`, `UnitDef.hidden`
- Produces: `validateData(data)`는 시그니처가 같다. 1·2단계 결과(오류·경고 목록)는 지금과 똑같아야 한다.

규칙 (오류 문구는 영어, 아래 형식 그대로):

| 규칙 | 오류 문구 |
| --- | --- |
| 모양: `{2: [[1,1]], 3: [[1,1,2]], 4: [[2,2,3]], 5: [[4,4]], 6: [[3,5,5],[4,5,5]]}` 중 하나 | `recipe <id> shape <a+b+c> != <허용 모양들을 ' or '로>` |
| 값: 결과 등급 ≤ 5면 재료 값 합 = `gradeValue(grade)` (6등급은 모양으로 대신함) | 기존 문구 |
| 비용: 5등급 `{buckwheat: 1}`, 6등급 `{buckwheat: 1, coins: 60}`, 4등급 이하 없음 | `recipe <id> cost <json> != <json>` |
| 등급 순서: 모든 재료 등급 < 결과 등급 | `recipe <id> material <m> grade <g> is not below <G>` |
| 6등급의 두 5등급 재료는 서로 다름 | `recipe <id> uses grade-5 <m> twice` |
| 재료 구성이 똑같은 조합 둘 | `recipes <a> and <b> have the same materials` |
| 도달 가능: 1등급(히든 제외)에서 시작해 조합을 반복 적용한 고정점에 히든 아닌 모든 유닛이 든다 | `unit <id> (grade <g>) is not reachable from summons` |
| 고아 재료: 데이터의 최고 등급보다 낮은 히든 아닌 유닛은 한 조합 이상에 쓰인다 (기존 `grade <= 3` 규칙을 이것으로 바꾼다; 1·2단계는 최고 등급 4라 결과가 같다) | 기존 문구 |
| 히든 유닛은 조합 결과도 재료도 아니다 | `hidden unit <id> is in recipe <r>` |
| 2등급 이상 히든 아닌 유닛은 조합이 있다 (기존 규칙에서 히든 제외) | 기존 문구 |

`scripts/validate.ts`는 `['stage1', 'stage2', 'stage3']`를 돈다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
test('stage 3 data has no errors', () => expect(validateData(loadGameData('stage3')).errors).toEqual([]));
test('stage 1 and 2 results unchanged', () => {
  expect(validateData(loadGameData())).toEqual(BASE1); // capture BASE1/BASE2 by running the current validator before editing it
  expect(validateData(loadGameData('stage2'))).toEqual(BASE2);
});
test('broken fixtures are reported', () => {
  const d = makeData(x => {
    x.recipes.find(r => r.result === 'top')!.cost = undefined;
    x.recipes.find(r => r.result === 'gildal')!.materials = ['dokki', 'dokki', 'dwiju'];
    x.recipes.find(r => r.result === 'dunggumi')!.materials = ['dunggumi', 'jipsin'];
    x.recipes = x.recipes.filter(r => r.result !== 'mumyeong');
    x.recipes.push({ result: 'jinegaksi', materials: ['top', 'kkeul', 'ja'], cost: { buckwheat: 1, coins: 60 } });
  }, 'stage3');
  const { errors } = validateData(d);
  expect(errors).toContain('recipe top cost {} != {"buckwheat":1}');
  expect(errors).toContain('recipe gildal uses grade-5 dokki twice');
  expect(errors).toContain('recipe dunggumi material dunggumi grade 2 is not below 2');
  expect(errors).toContain('unit mumyeong (grade 2) has no recipe');
  expect(errors.some(e => e.startsWith('unit baneul (grade 3) is not reachable'))).toBe(true);
  expect(errors).toContain('hidden unit jinegaksi is in recipe jinegaksi');
});
```

`BASE1`·`BASE2`는 Step 1에서 고치기 전 검증기를 돌린 결과를 시험 파일에 상수로 적는다(현재 1·2단계는 `errors: []`, 경고 목록은 실행 결과 그대로). 빈 `cost`는 `{}`로 직렬화한다.

- [ ] **Step 2: 실패를 확인한다** — Run: `npx vitest run packages/logic/test/validate-stage3.test.ts` / Expected: FAIL
- [ ] **Step 3: 규칙을 구현하고 스크립트에 stage3를 넣는다**
- [ ] **Step 4: 통과를 확인한다** — Run: `npx vitest run packages/logic && npm run validate` / Expected: PASS, `stage3 errors: 0`
- [ ] **Step 5: 커밋한다** — `git commit -m "feat(stage3): validator rules for reachability, grade order, shapes and costs"`

---

### Task 4: 조합 비용과 3단계 판 규칙

**Implementer:** sol

**Files:**
- Modify: `packages/logic/src/combine.ts`, `packages/logic/src/combat.ts`, `packages/logic/src/effects.ts`(오라 합산), `packages/logic/src/units.ts`, `packages/client/src/ui/models.ts`
- Test: `packages/logic/test/stage3-rules.test.ts`

**읽을 것:** `combine.ts`, `combat.ts`의 `damageBonus`, `effects.ts`의 `auraSum`·`speedBonus`·`auraAttackPower`, `units.ts`의 `addUnit`, v5 2장 "강화 계승", 6장 "이웃과 오라"·"시계와 이동".

**Interfaces:**
- Consumes: `RecipeDef.cost`, `UnitDef.lineage`, `BalanceDef.inheritUpgrades`·`auraCaps`·`periodicReady`
- Produces:
  - `combine` 명령: 재료 확인 → `cost.buckwheat > state.buckwheat`면 `'noBuckwheat'` → `cost.coins > state.coins`면 `'noCoins'` → 성공 시 재료 제거와 함께 비용을 뺀다. 거절이면 아무것도 바꾸지 않는다.
  - `availableRecipes(state)`: 비용이 있는 조합은 비용도 낼 수 있을 때만 넣는다. `missingMaterials`·`recipesUsing`은 그대로.
  - `damageBonus(state, slot)`: `balance.inheritUpgrades && def.lineage`이면 계열 강화 항을 `max(lineage의 각 계열 upgradePct)`로 쓴다. 손질·오라 항은 그대로.
  - `speedBonus`·`auraAttackPower`: `balance.auraCaps`가 있으면 각각 `min(합, attackSpeed)`, `min(합, attackPower)`.
  - `addUnit`: `balance.periodicReady`이면 `periodic` 초기값을 모두 0으로.
  - 클라이언트 `REJECT_TEXT`에 `noBuckwheat: '메밀묵이 모자랍니다'`.

- [ ] **Step 1: 실패하는 시험을 쓴다** (`d3 = loadGameData('stage3')`, 상태는 `createGame` + `forceRound` + `placeUnitForTest`로 만든다)

```ts
test('grade 5 combine needs one buckwheat; rejection consumes nothing', () => {
  const s = createGame(d3, 1); placeUnitForTest(s, 'meok', 7); placeUnitForTest(s, 'jige', 0);
  expect(availableRecipes(s)).not.toContain('top');
  const r = step(s, [{ type: 'combine', result: 'top' }]);
  expect(r.rejected[0]!.reason).toBe('noBuckwheat');
  expect(s.slots.filter(Boolean).map(u => u!.defId).sort()).toEqual(['jige', 'meok']);
  s.buckwheat = 1; step(s, [{ type: 'combine', result: 'top' }]);
  expect([s.buckwheat, s.slots.filter(Boolean).map(u => u!.defId)]).toEqual([0, ['top']]);
});
test('grade 6 combine needs 60 coins too', () => {
  const s = createGame(d3, 1); for (const [id, i] of [['top', 0], ['kkeul', 1], ['ja', 7]] as const) placeUnitForTest(s, id, i);
  s.buckwheat = 1; s.coins = 59;
  expect(step(s, [{ type: 'combine', result: 'bihyeongrang' }]).rejected[0]!.reason).toBe('noCoins');
  expect(s.buckwheat).toBe(1);
  s.coins = 60; step(s, [{ type: 'combine', result: 'bihyeongrang' }]);
  expect([s.coins, s.buckwheat]).toEqual([0, 0]);
});
test('upgrade inheritance reads the highest line in the lineage', () => {
  for (const [data, want] of [[d3, 0.7], [loadGameData('stage2'), 0.2]] as const) {
    const s = createGame(data, 1); s.upgrades.physical = 2; s.upgrades.magical = 7;
    placeUnitForTest(s, 'jangdok', 7); // physical; lineage magical+physical in stage 3; polish level 0
    expect(damageBonus(s, 7)).toBeCloseTo(want);
  }
});
test('aura caps: attack speed 0.5, attack power 0.4', () => {
  const s = createGame(d3, 1);
  placeUnitForTest(s, 'top', 7); // physical, so the physical-only auras of mulle and byeongpung count too
  for (const [id, i] of [['cheongsachorong', 0], ['daljip', 1], ['mulle', 2], ['cheonnyeonbyeongpung', 6]] as const) placeUnitForTest(s, id, i);
  expect(speedBonus(s, 7)).toBe(0.5); // 0.1 + 0.2 + 0.12 + 0.12 = 0.54 uncapped
  const t = createGame(d3, 1); placeUnitForTest(t, 'meok', 7);
  for (const [id, i] of [['pulmu', 0], ['gat', 1], ['cheonnyeonjokja', 6], ['bihyeongrang', 8]] as const) placeUnitForTest(t, id, i);
  expect(auraAttackPower(t, 7)).toBe(0.4); // 0.15 + 0.13 + 0.12 + 0.1 = 0.5 uncapped
});
test('periodic skills start ready in stage 3 only', () => {
  const s3 = createGame(d3, 1); expect(placeUnitForTest(s3, 'yeonjabangga', 7).periodic).toEqual([0]);
  const s1 = createGame(loadGameData(), 1); expect(placeUnitForTest(s1, 'yeonjabangga', 7).periodic).toEqual([40]);
});
test('sell price of grade 6 comes from stage 3 balance', () => {
  const s = createGame(d3, 1); placeUnitForTest(s, 'gildal', 0); step(s, [{ type: 'sell', slot: 0 }]); expect(s.coins).toBe(180);
});
```

- [ ] **Step 2: 실패를 확인한다** — Run: `npx vitest run packages/logic/test/stage3-rules.test.ts` / Expected: FAIL
- [ ] **Step 3: 위 Interfaces대로 구현한다**
- [ ] **Step 4: 통과를 확인한다** — Run: `npx vitest run packages/logic packages/sim/test/golden.test.ts && npm run typecheck` / Expected: PASS
- [ ] **Step 5: 커밋한다** — `git commit -m "feat(stage3): combine costs, upgrade inheritance, aura caps, ready periodics"`

---

### Task 5: 기존 효과의 확장 필드와 추가 피해

**Implementer:** astra

**Files:**
- Modify: `packages/logic/src/effects.ts`
- Test: `packages/logic/test/stage3-effects.test.ts`

**읽을 것:** `effects.ts` 전체(`auraSum`, `vulnOf`, `applyStatus`, `performAttack`, `runPeriodics`), v5 맨 앞 "3단계 추가 피해 변경표", 6장 "기존 효과의 발동 조건 확장"·"지원 효과의 출처".

**Interfaces:**
- Consumes: Task 1 타입, Task 4의 오라 상한
- Produces (동작):
  - **`onBasicHit`**: 기본 공격(`performAttack`)의 주 대상 타격과 `extraAttack`·`splash`·`pierce` 처리 뒤, 상태 이상 앞에서 주 대상에 `targetPct`, 맞은 자리에서 `balance.onBasicHitRadius` 안의 다른 살아 있는 적 전부에 `splashPct` 배율로 `hitDamage`를 준다. 이 피해는 강타·처형을 곱하지 않고 `onKillExplode` 처치 목록에 넣지 않는다. 값이 0인 쪽은 이벤트를 내지 않는다.
  - **상태 이상 대상**: `stun`·`slow`·`knockback`·`vuln`·`dot`에 `radius`가 있으면 맞은 자리에서 반경 안의 적 전부(주 대상 포함, `state.enemies` 순서), `area: 'hit'`이면 이번 타격에서 피해를 받은 적 전부(주 대상 포함), `area: 'others'`면 그중 주 대상 제외, 둘 다 없으면 주 대상. 기존 `slow.radius` 동작은 그대로다.
  - **`groundFire.align`**: 중심 c = 맞은 자리. `center`(기본) `[c − L/2, c + L/2]`, `ahead` `[c, c + L]`, `behind` `[c − L, c]`. 적은 d가 커지는 쪽으로 걸으므로 앞쪽이 +다.
  - **`nth.phase`**: `attackCount % n === (phase ?? 0)`일 때 발동.
  - **오라 계열·출처**: `auraAttackSpeed.damageType`이 있으면 받는 유닛 계열이 같을 때만 더한다. 오라 중복 판정 키는 `(effect.source ?? 그 유닛 defId) + ':' + effect.kind`다(1·2단계는 지금과 같은 결과). `auraEnemyVuln.damageType`이 있으면 그 계열 피해에만 더하고, 출처 키도 같은 규칙.
  - **`vuln.source`**: 적의 `vulns` 키를 `source ?? def.id`로 쓴다.
  - **주기 전체 공격의 상태 이상**: `allInRange`가 든 주기 스킬은 피해를 준 각 적에게 같은 스킬의 `stun`·`slow`·`dot`·`vuln`을 건다(사거리 안 전부).

- [ ] **Step 1: 실패하는 시험을 쓴다** (`quiet3()` = stage3 상태, `forceRound(s,1)`, `s.spawned = 30`, `s.roundEndTick = 10**9`, `s.enemies = []`. 확률 스킬 시험은 `makeData(… p = 1 …, 'stage3')`, 효과만 보려면 해당 유닛의 트리거를 `always`나 `nth n:1`로 패치한다)

```ts
test('onBasicHit: tteoksiru adds 20% to target and 20% within 3 tiles', () => {
  const s = quiet3(); placeUnitForTest(s, 'tteoksiru', 2);
  const t = spawnEnemyForTest(s, 'japgwi', 3, 1e6); const near = spawnEnemyForTest(s, 'japgwi', 5, 1e6); const far = spawnEnemyForTest(s, 'japgwi', 6.7, 1e6);
  const r = step(s, []);
  expect(dmg(r, t.id)).toEqual([480, 96]); expect(dmg(r, near.id)).toEqual([96]); expect(dmg(r, far.id)).toEqual([]);
});
test('groundFire align ahead and behind', () => { /* patch jipbae trigger to always; one attack on target at d=3:
  fires[0].to - fires[0].from === 2.5 and fires[0].from ≈ target.d; jaetmulsiru: to ≈ target.d, to - from === 1.5 */ });
test('nth phase: odd attacks crit for cheonnyeondadeumitdol', () => {
  const s = quiet3(); placeUnitForTest(s, 'cheonnyeondadeumitdol', 2); const t = spawnEnemyForTest(s, 'japgwi', 3, 1e7);
  const r = step(s, []);
  expect(r.events.filter(e => e.type === 'damage' && e.enemyId === t.id)[0]).toMatchObject({ amount: 1865, effect: 'crit' });
});
test('status radius and area', () => {
  // indupan (nth patched to 1): enemy 0.8 from target stunned 12 ticks, enemy 1.5 away not
  // kkeul (nth 1): target.slow null, follower 1.0 behind slow.pct 0.28
  // jejuheobeok (nth 1): target and follower both slow.pct 0.3
});
test('aura damage type filter and source dedupe', () => {
  // mulle at 1: speedBonus(top at 0) = 0.12, speedBonus(meok at 2) = 0
  // gat at 1 + cheonnyeonsangmo at 2 around meok at 7: auraAttackPower = 0.13
});
test('vuln source key and enemy-vuln damage type', () => {
  // cheonnyeonmaetbangseok hit: Object.keys(target.vulns) = ['gireumteul']; with gireumteul also hitting: still one key, vulnOf physical 0.19
  // buk at 2 + jejuyeonggam at 1, enemy in both ranges: vulnOf(s, e, 'physical') = 0.15, 'magical' = 0
});
test('periodic all-in-range applies its statuses to every target', () => {
  const s = quiet3(); placeUnitForTest(s, 'meok', 2);
  const a = spawnEnemyForTest(s, 'japgwi', 3, 1e6); const b = spawnEnemyForTest(s, 'japgwi', 3.5, 1e6);
  step(s, []); expect([a.slow?.pct, b.slow?.pct]).toEqual([0.2, 0.2]);
});
```

- [ ] **Step 2: 실패를 확인한다** — Run: `npx vitest run packages/logic/test/stage3-effects.test.ts` / Expected: FAIL
- [ ] **Step 3: 구현한다.** 1단계 효과의 피해 이벤트 순서(주 대상 → `extraAttack`/`splash`/`pierce`를 `fired` 순서대로 → 상태 → 폭발)는 바꾸지 않는다.
- [ ] **Step 4: 통과를 확인한다** — Run: `npx vitest run packages/logic packages/sim/test/golden.test.ts && npm run typecheck` / Expected: PASS
- [ ] **Step 5: 커밋한다** — `git commit -m "feat(stage3): extended status targeting, fire alignment, aura sources and on-hit damage"`

---

### Task 6: 타격 묶음과 대상별 메커니즘

**Implementer:** astra

**Files:**
- Modify: `packages/logic/src/effects.ts`, `packages/logic/src/combat.ts`(`unitAttacks`에서 충전 시계), `packages/logic/src/units.ts`(`addUnit` 충전 초기화)
- Test: `packages/logic/test/stage3-mechanics.test.ts`

**읽을 것:** Task 5 뒤의 `effects.ts`, v5 6장 "새 발동 조건과 대상 선택"·"같은 틱의 처리".

**Interfaces:**
- Produces:
  - `applyPackage(state: GameState, slot: number, target: Enemy, fired: Effect[], opts: { basic: boolean; mult: number; effect?: HitEffect }, events: GameEvent[]): void` — `performAttack`에서 피해·상태·폭발 처리 부분을 떼어 낸 함수. `basic`이면 주 대상 기본 타격(`opts.mult`)·`onBasicHit`·이웃 명중(Task 7)·첫 명중 엽전(Task 7)을 포함한다. `basic: false`(주기 묶음)는 기본 타격 없이 `strike`부터 시작한다.
  - `performAttack`은 트리거를 평가해 `fired`와 배율을 만든 뒤 `applyPackage(…, { basic: true, … })`를 부른다.
  - `runPeriodics`: `allInRange`가 없는 주기 스킬은 `pickTarget(state, slot)`이 고른 적에게 `applyPackage(…, { basic: false, mult: 1 })`를 부른다. 대상이 없으면 0으로 두고 기다린다. `attackCount`는 올리지 않는다.
  - **`strike {mult}`**: 주 대상에 `hitDamage(…, mult)`. 강타·처형 배율을 곱하지 않는다. 처치는 `onKillExplode` 목록에 넣는다.
  - **`chain {range, mult, maxBounces}`**: 직전에 맞은 적에서 `range` 안(점 거리)에 있고 이번 사슬에 아직 맞지 않은 살아 있는 적 중 `pickTarget` 순위(보스 → 역신 → 일반, 같은 순위는 id 작은 쪽)로 하나를 골라 `mult` 피해. 최대 `maxBounces`번, 다음 적이 없으면 멈춘다.
  - **`charge {seconds}`**: `addUnit`이 이 트리거를 가진 유닛에 `chargeTicks = toTicks(seconds)`를 넣는다. `unitAttacks`에서 매 틱(쿨다운 확인 앞) `charged`가 아니면 1 줄이고 0이 되면 `charged = true`. 기본 공격 트리거 평가 때 `charged`면 발동하고 `charged = false`, `chargeTicks = toTicks(seconds)`.
  - **`streak` 추적**: 정의에 `streak` 트리거나 `rampCrit` 효과가 있는 유닛만 `unit.streak = { enemyId, count }`를 쓴다. 기본 공격 시작 때 대상이 같으면 `count + 1`, 아니면 `1`. `streak {n}`은 `count % n === 0`일 때 발동. **`rampCrit {step, max}`**는 기본 타격 배율에 `min(max, 1 + step × (count − 1))`을 곱한다(HitEffect 표시는 붙이지 않는다).
  - **`targetHpBelow {pct}`**: 타격 전 `hp / maxHp <= pct`면 발동. **`targetSlowed`**: 타격 전 `target.slow`가 있으면 발동. 둘 다 이번 타격의 상태 이상보다 먼저 평가한다.
  - **`splash.radiusCycle`**: 기본 묶음에서 반경 = `radiusCycle[(attackCount − 1) % 길이]`.
  - **`splash.stunnedBonus {mult, graceSeconds}`**: 주 대상이 `stunTicks > 0`이거나 `state.tick − stunEndTick < toTicks(graceSeconds)`면 그 splash 배율에 `mult`를 곱한다.
  - **`stunEndTick`**: `balance.extendedCombat`일 때만 `tickStatuses`에서 스턴이 0이 되는 틱에 `e.stunEndTick = state.tick`.
  - **`pierce.both`**: 경로 앞뒤 어느 쪽이든 간격이 (0, length]인 적. **`pierce.knockedBonus`**: `o.knockedRound === state.round`인 적에게 배율 곱. **`knockedRound`**: `extendedCombat`일 때만, 실제로 0보다 많이 밀린 적에 `state.round`를 적는다.
  - **`onKillExplode.requireExecute`**: 이번 기본 타격에 처형 배율이 붙었고 그 타격으로 죽은 주 대상에서만 폭발한다.

- [ ] **Step 1: 실패하는 시험을 쓴다** (6등급 공격력: `gradeDps(6) = 1188.1376`). `onBasicHit`이 있는 유닛(연적·빚 갚는·요강·떡살·문빗장·떡판)은 기본 타격마다 작은 추가 피해 이벤트가 더 나온다. 이 시험들은 이벤트 개수가 아니라 `source`와 금액으로 고른다(예: 연적은 공격마다 첫 피해 이벤트, 빚 갚는 도깨비의 사슬은 `round(1188.1376 × 0.89 × 1.8) = 1903`짜리).

```ts
test('strike adds raw extra damage to the target (gaetgilbul 1023 + 409)', () => { /* one enemy; dmg = [1023, 409] */ });
test('periodic strike waits for the first target, then fires on entry (gildal)', () => {
  const s = quiet3(); placeUnitForTest(s, 'gildal', 2);
  for (let i = 0; i < 100; i++) step(s, []);
  const e = spawnEnemyForTest(s, 'japgwi', 3, 1e7); const r = step(s, []);
  expect(r.events.some(x => x.type === 'damage' && x.source === 'gildal' && x.amount === Math.round(1188.1376 * 0.85 * 0.97 * 1.55))).toBe(true);
  // next gildal strike is 60 ticks later
});
test('chain bounces within 1 tile, each enemy once (bitdon)', () => { /* enemies at d 3, 3.8, 4.6, 6.0 → chain hits 3.8 and 4.6 only */ });
test('charge: first charged hit after 80 ticks; move keeps it, sell resets', () => {
  // gamtudokkaebi at 2: hits before tick 80 carry no 'crit'; first hit after charging has effect 'crit' and stuns
  // charged unit moved to another open slot keeps charged === true; re-placed new unit has chargeTicks 80 and no charged
});
test('streak: oedari crits on 3rd and 6th consecutive hit, resets on target change', () => {});
test('rampCrit: yeonjeok basic hits 1428, 1642, 1856, 2070, 2070', () => {});
test('targetHpBelow and targetSlowed', () => {
  // munbitjang: target at 60% hp → no crit; at 50% → crit and slow 0.3
  // tteokpan: 1st hit no crit (applies slow), 2nd hit crit
});
test('radiusCycle: sangmo band reaches an enemy 1.2 away only on attacks 3 and 4', () => {});
test('pierce both and knocked bonus', () => {
  // gildal package hits enemies 1.0 ahead and 1.0 behind, not 2.0 ahead
  // cheonnyeondot: follower with knockedRound === s.round takes 1.8x the pierce damage of an unknocked one
});
test('stunnedBonus window E..E+19 (yogang)', () => {
  // splash damage x1.5 when target stunned; also when stunEndTick = tick - 19; not when tick - 20
});
test('requireExecute: tteoksal explodes only on an execute kill', () => {
  // target hp 1 of maxHp 100 (execute) → neighbor 0.8 tile away takes explosion; target hp 60/100 killed → no explosion
});
test('stage 1 enemies never get stunEndTick or knockedRound', () => {
  const s = quiet(); /* stage1 sotlid (chance patched to 1) and buchae, run 40 ticks */
  expect(s.enemies.every(e => !('stunEndTick' in e) && !('knockedRound' in e))).toBe(true);
});
```

- [ ] **Step 2: 실패를 확인한다** — Run: `npx vitest run packages/logic/test/stage3-mechanics.test.ts` / Expected: FAIL
- [ ] **Step 3: `applyPackage`로 떼어 낸 뒤 골든 시험을 먼저 돌려 통과를 확인하고**(`npx vitest run packages/sim/test/golden.test.ts`), 그다음 새 메커니즘을 더한다.
- [ ] **Step 4: 통과를 확인한다** — Run: `npx vitest run packages/logic packages/sim && npm run typecheck` / Expected: PASS
- [ ] **Step 5: 커밋한다** — `git commit -m "feat(stage3): hit packages, periodic strikes, charge, streak, chain and target-state triggers"`

---

### Task 7: 이웃 명중, 약화 처치 폭발, 엽전 지급

**Implementer:** sol

**Files:**
- Create: `packages/logic/src/income.ts`
- Modify: `packages/logic/src/effects.ts`, `packages/logic/src/combat.ts`(`unitAttacks` 첫머리에서 `runIncome`, `resolveKills`에서 두두리 폭발), `packages/logic/src/game.ts`(`import './income'`이 필요하면)
- Test: `packages/logic/test/stage3-mechanics.test.ts` (시험 추가)

**읽을 것:** Task 6 뒤의 `applyPackage`, `combat.ts`의 `resolveKills`, v5 6장 "새 효과 종류 제안"(엽전 지급), "새 발동 조건과 대상 선택"의 이웃 명중·처치와 약화 줄, "같은 틱의 처리".

**Interfaces:**
- Produces:
  - **`neighborHits {count, lockoutSeconds}`**: 기본 묶음의 주 대상 타격이 들어간 뒤, 공격한 칸에서 `balance.auraRadius` 안의 **다른** 칸에 있는 이 트리거 보유 유닛마다: `state.tick < neighborLockUntil`이면 넘어간다. 아니면 `neighborHits += 1`, `count`에 닿으면 0으로 돌리고 `neighborLockUntil = state.tick + toTicks(lockoutSeconds)`, 그 스킬의 효과를 그 유닛 칸에서 `applyPackage(…, { basic: false, mult: 1 })`로 방금 맞은 적에게 쓴다. 이 묶음은 다시 이웃 명중을 세지 않는다.
  - **`onVulnKillExplode {radius, mult, cooldownSeconds}`**: 이 효과를 가진 정의의 `vuln`을 걸 때 `enemy.vulnCaster = { unitId, attack: unitAttack(def) × (1 + damageBonus(state, slot)), key: vuln 키 }`. `resolveKills`에서 죽은 적에 `vulnCaster`가 있고 `vulns[key]`가 남아 있으며 그 `unitId` 유닛이 아직 칸에 있고 `state.tick >= (unit.explodeReadyTick ?? 0)`이면, 죽은 자리에서 `radius` 안의 살아 있는 적에게 `computeHitDamage({ attack, mult, bonus: 0, resist, vuln })` 피해(source = 그 유닛 defId)를 주고 `explodeReadyTick = tick + toTicks(cooldownSeconds)`. 폭발로 죽은 적은 `vulnCaster`를 지워 다시 터지지 않게 한다.
  - `income.ts`: `runIncome(state: GameState): void` — `phase === 'round'`일 때만. `state.income`이 없거나 `round`가 다르면 `{ round, firstHit: {}, timerTicks: {}, timerPaid: {} }`로 새로 만든다(이런 유닛이 칸에 하나도 없으면 만들지 않는다).
    - **`coinTimer`**: 칸에 그 defId가 하나 이상 있으면 `timerTicks[defId] += 1`, `timerTicks % toTicks(everySeconds) === 0`이고 `timerPaid < maxPerRound`이면 `coins += coins`, `timerPaid += coins`.
    - `payFirstHit(state: GameState, defId: string, coins: number): void` — **`coinOnFirstHit`**: 기본 타격이 들어가면 부른다. 이번 라운드 `firstHit[defId]`가 없을 때만 엽전을 주고 표시한다.

- [ ] **Step 1: 실패하는 시험을 더한다**

```ts
test('neighborHits: 8th neighbor basic hit fires a 935 pierce, then 40-tick lockout', () => {
  // bihyeongrang at 7, dadeumitdol at 1; target at d=3 (1e8 hp), follower 2 tiles behind it
  // after 7 dadeumitdol attacks: unit(7).neighborHits === 7; after the 8th: 0, neighborLockUntil === tick + 40,
  // follower got one damage event from 'bihyeongrang' of round(1188.1376*1.2*0.82*0.8) = 935
});
test('duduri explosion on an ally kill, once per 1.1 s, no chain', () => {});
test('coinOnFirstHit pays 4 once per round per type', () => { /* two bangmangi units: +4 total; next round +4 again */ });
test('coinTimer pays 2 every 10 s up to 6 per round, stops when removed', () => {
  // bitdon at 2, no enemies, roundEndTick far: coins 0 → +2 at 200 ticks → +4 at 400 → +6 at 600 → 6 at 800
});
test('stage 1 state never gets income', () => { /* stage1 run 100 ticks with units: expect('income' in s).toBe(false) */ });
```

- [ ] **Step 2: 실패를 확인한다** — Run: `npx vitest run packages/logic/test/stage3-mechanics.test.ts` / Expected: 새 시험 FAIL
- [ ] **Step 3: 구현한다**
- [ ] **Step 4: 통과를 확인한다** — Run: `npx vitest run packages/logic packages/sim && npm run typecheck` / Expected: PASS
- [ ] **Step 5: 커밋한다** — `git commit -m "feat(stage3): neighbor-hit pierce, weakened-kill explosion and coin effects"`

---

### Task 8: 고개 보스 제어 상한

**Implementer:** astra

**Files:**
- Create: `packages/logic/src/bosscontrol.ts`
- Modify: `packages/logic/src/flow.ts`(`moveEnemies(state, events?)`), `packages/logic/src/game.ts`(`runCombat`이 `moveEnemies(state, events)`), `packages/logic/src/effects.ts`(보스 밀기), `packages/logic/src/index.ts`(export)
- Test: `packages/logic/test/boss-control.test.ts`

**읽을 것:** v5 6장 "역신과 고개 보스" 표와 그 아래 세 문단, `flow.ts`의 `moveEnemies`, `effects.ts`의 `applyStatus`, `match/step.ts`(runCombat 호출부, 바꿀 필요 없는지 확인).

**Interfaces:**
- Consumes: `BalanceDef.bossControl`, `Enemy.ctl`, `BossControlLog`
- Produces:
  - `bossStunGate(state: GameState, e: Enemy, events: GameEvent[]): void` — `moveEnemies`가 `balance.bossControl`이 있을 때 살아 있는 고개 보스(`boss && !shared`)마다 이동 전에 부른다. `ctl`이 없으면 만든다. `ctl.alive += 1`, `stunLog`·`pushLog`에서 `tick − windowTicks` 이하 항목을 버린다. `stunTicks > 0`이면: `stunLog.length < stunTicks 상한`이고 `stopped + 1 <= floor(maxStoppedShare × alive)`일 때 `stopped += 1`, `stunLog.push(tick)`, `maxWindowStopped` 갱신. 아니면 `stunClipped += stunTicks`, `stunTicks = 0`, `extendedCombat`이면 `stunEndTick = tick`, `speedChange` 이벤트.
  - `applyBossKnockback(state: GameState, e: Enemy, distance: number): number` — `distance`는 `bossCcFactor`를 곱한 뒤 값. `ctl`이 없으면 만들고 `pushLog`에서 `state.tick − windowTicks` 이하 항목을 먼저 버린다. `pushDistance`에서 남은 `pushLog` 합을 뺀 예산으로 자르고(`pushClipped`), 입구(d = 0)에서 자른 뒤(`entranceClipped`), 실제 거리를 `pushLog`·`pushApplied`에 더하고 `e.d`를 줄인 다음 그 거리를 돌려준다. `applyStatus`의 `knockback`은 `bossControl`이 있고 대상이 고개 보스일 때 이 함수를 쓴다.
  - 역신(`shared`)은 지금처럼 스턴·둔화·밀기를 모두 무시하고 `ctl`을 만들지 않는다. 둔화는 상한 대상이 아니다.
  - `bossControl`이 없으면(1·2단계) 아무 필드도 만들지 않는다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
test('perma-stunned boss stops at most 60 of any 200 ticks and 30% overall', () => {
  const s = quiet3(); const b = spawnEnemyForTest(s, 'jinegaksi', 5);
  for (let i = 0; i < 1000; i++) { b.stunTicks = 10 ** 6; step(s, []); expect(b.ctl!.stunLog.length).toBeLessThanOrEqual(60); }
  expect(b.ctl!.stopped).toBeLessThanOrEqual(Math.floor(0.3 * b.ctl!.alive));
  expect(b.ctl!.stopped).toBeGreaterThanOrEqual(280);
});
test('a stun right after spawn is dropped and the boss moves', () => {
  const s = quiet3(); const b = spawnEnemyForTest(s, 'jinegaksi', 5); b.stunTicks = 100;
  const d0 = b.d; step(s, []);
  expect([b.stunTicks, b.d > d0, b.ctl!.stunClipped]).toEqual([0, true, 100]);
});
test('knockback budget 3 tiles per 200 ticks and entrance clip', () => {
  const s = quiet3(); const b = spawnEnemyForTest(s, 'gangcheori', 10);
  expect(applyBossKnockback(s, b, 2)).toBe(2); expect(applyBossKnockback(s, b, 2)).toBe(1);
  s.tick += 200; expect(applyBossKnockback(s, b, 2)).toBe(2);
  const c = spawnEnemyForTest(s, 'gangcheori', 0.5); expect(applyBossKnockback(s, c, 2)).toBe(0.5); expect(c.ctl!.entranceClipped).toBe(1.5);
});
test('yeoksin stays fully immune in stage 3', () => {
  // stage3 data with sotlid chance 1 and buchae chance 1 next to a yeoksin1 enemy: stunTicks 0, slow null, d unchanged by knockback, no ctl
});
test('stage 1 bosses get no ctl', () => { /* stage1 sotlid (chance 1) vs jinegaksi 100 ticks: expect('ctl' in boss).toBe(false); stunTicks reached 5 */ });
```

- [ ] **Step 2: 실패를 확인한다** — Run: `npx vitest run packages/logic/test/boss-control.test.ts` / Expected: FAIL
- [ ] **Step 3: 구현한다**
- [ ] **Step 4: 통과를 확인한다** — Run: `npx vitest run && npm run typecheck` / Expected: PASS(전체, 서버 포함)
- [ ] **Step 5: 커밋한다** — `git commit -m "feat(stage3): lane boss stun and knockback caps"`

---

### Task 9: 조합 이득·보스 정지율 측정과 CLI

**Implementer:** sol

**Files:**
- Create: `packages/sim/src/stage3/probe.ts`, `combineGain.ts`, `control.ts`, `report.ts`, `cli.ts`
- Modify: `packages/sim/src/cli.ts`(`--stage 3` 분기)
- Test: `packages/sim/test/stage3-sim.test.ts`

**읽을 것:** v5 2장 "조합 전후 화력"의 합격 기준·표 읽기, 7장 "시뮬레이터 합격 기준" 표의 첫 줄과 "제어" 줄, `packages/sim/src/bots.ts`의 `followBoss`, `packages/logic/src/testing.ts`.

**Interfaces:**
- Consumes: logic `createGame`, `step`, `applyCommand`, `chooseSlot`, `countNormalEnemies`, `unitDefFast`, `loopPos`, `@dorandi/logic/testing`의 `forceRound`·`placeUnitForTest`, sim `followBoss`
- Produces:
  - `probe.ts`: `PROBE_SCENARIOS = { flow176: { speed: 2.2, intervalSeconds: 0.8 }, flow128: { speed: 1.6, intervalSeconds: 0.8 }, flow088: { speed: 1.1, intervalSeconds: 0.8 }, clump015: { speed: 1.5, intervalSeconds: 0.1 } } as const`; `type ProbeScenario = keyof typeof PROBE_SCENARIOS`; `probeData(data: GameData, scenario: ProbeScenario, hp: number): GameData` — 복제본에 적 `{ id: 'probe', name: '시험 잡귀', boss: false, hpMult: 1, speed, resist: { physical: 0, magical: 0 } }`, `waves = [{ round: 1, type: 'normal', pattern: ['probe'] }]`, `balance.hp = { base: hp, coef: 0, exp: 1 }`, `balance.spawnIntervalSeconds = intervalSeconds`, `balance.limit = 1e9`. 간격은 v5 표의 1.76·1.28·0.88·0.15칸이다.
  - `combineGain.ts`:
    - `survivorsAfterRound(data: GameData, units: string[], seed: number, combineInto?: string): number` — 모든 칸을 열고 `units`를 순서대로 `chooseSlot` 자리에 놓는다. `combineInto`가 있으면 엽전 1000·메밀묵 10을 주고 `applyCommand(state, { type: 'combine', result }, [])`(거절이면 throw). `forceRound(state, 1)` 뒤 `state.tick < state.roundEndTick` 동안 `step(state, [])`, 끝에 `countNormalEnemies(state)`.
    - `calibrateHp(data, recipe, scenario, steps = 16): number` — 시드 1에서 A(재료 유지) 잔존 수가 15에 가장 가까운 체력을 [1, 1e7] 로그 이분 탐색으로 찾는다.
    - `combineGainCase(data, recipe: RecipeDef, scenario: ProbeScenario, opts: { seeds: number; steps?: number }): CombineGainRow`
    - `CombineGainRow = { result: string; grade: number; scenario: ProbeScenario; hp: number; seeds: number; aMean: number; bMean: number; worstDelta: number; pass: boolean }` — 시드 1..seeds마다 A·B 잔존 수, `worstDelta = max(B − A)`, `pass = worstDelta <= 0`.
    - `combineGainAll(data, opts: { seeds: number; scenarios?: ProbeScenario[]; results?: string[] }): CombineGainRow[]`
  - `control.ts`:
    - `CONTROL_LINEUPS: Record<string, string[]>` = `fan3: ['buchae','buchae','buchae']`, `fan3+gimseobang`, `fan3+jocheong`(`cheonnyeonjocheongdanji`), `saw2pot: ['top','top','gamasot']`, `saw2pot+gimseobang`, `saw2pot+jocheong`.
    - `CONTROL_CAPS = { none: { windowTicks: 200, stunTicks: 1e9, pushDistance: 1e9, maxStoppedShare: 1 }, cap3: { 200, 60, 3, 0.3 }, cap4: { 200, 80, 4, 0.3 } }` (none도 기록을 남기려고 상한을 크게 둔 설정이다)
    - `controlTrial(data, t: { lineup: string; boss: 'jinegaksi' | 'gangcheori'; cap: keyof typeof CONTROL_CAPS; seed: number }): ControlRow` — 복제본의 `balance.bossControl`을 바꾸고 보스 체력을 1e12로 둔다. 라인업을 `chooseSlot` 자리에 놓고 `forceRound`(지네각시 10, 강철이 20), 40틱마다 `followBoss(state)` 명령을 넣어 보스 라운드 끝 직전까지 돈다.
    - `ControlRow = { lineup; boss; cap; seed; aliveTicks; stoppedTicks; stoppedShare; maxWindowStopped; stunClipped; pushApplied; pushClipped; entranceClipped; netAdvance; maxDwellTicks; pass: boolean | null }` — `netAdvance`는 끝의 `boss.d`, `maxDwellTicks`는 `Math.floor(loopPos(d))` 칸에 연속으로 머문 최대 틱, `pass`는 none이면 `null`, 아니면 `stoppedShare <= 0.3 && maxWindowStopped <= 상한`.
    - `controlAll(data, seeds: number): ControlRow[]` (라인업 6 × 보스 2 × 상한 3 × 시드)
  - `report.ts`: `combineGainMarkdown(rows): string`(등급별 통과 수 표 + 탈락 행 표), `controlMarkdown(rows): string`(라인업·보스·상한별 정지율 중앙값·최대값, 순전진, 잘린 양)
  - `cli.ts`(stage3): `stage3Cli(arg: (name: string, fallback: string) => string): void` — `--check combine|control|grade6|all`(기본 all, grade6은 Task 10에서 채운다), `--seeds`(기본 3), `--out`(기본 `sim-out/stage3`). CSV(`combine.csv`, `control.csv`)를 쓰고 마크다운 요약을 출력한다.
  - `src/cli.ts`: `if (arg('stage', '1') === '3') { stage3Cli(arg); process.exit(0); }`를 stage 2 분기 옆에 둔다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
const d3 = loadGameData('stage3');
test('combine gain case calibrates A to a partial clear and passes for hwaetbul', () => {
  const row = combineGainCase(d3, d3.recipes.find(r => r.result === 'hwaetbul')!, 'flow128', { seeds: 1, steps: 10 });
  expect(row.aMean).toBeGreaterThanOrEqual(5); expect(row.aMean).toBeLessThanOrEqual(25);
  expect(row.pass).toBe(row.worstDelta <= 0);
}, 60_000);
test('a deliberately bad recipe fails', () => {
  const bad = makeData(d => { d.recipes.find(r => r.result === 'hwaetbul')!.materials = ['top', 'top']; }, 'stage3');
  const row = combineGainCase(bad, bad.recipes.find(r => r.result === 'hwaetbul')!, 'flow128', { seeds: 1, steps: 10 });
  expect([row.pass, row.worstDelta > 0]).toEqual([false, true]);
}, 60_000);
test('control trial with cap3 stays under 30% and none stops at least as long', () => {
  const capped = controlTrial(d3, { lineup: 'saw2pot', boss: 'jinegaksi', cap: 'cap3', seed: 1 });
  const free = controlTrial(d3, { lineup: 'saw2pot', boss: 'jinegaksi', cap: 'none', seed: 1 });
  expect(capped.stoppedShare).toBeLessThanOrEqual(0.3); expect(capped.pass).toBe(true);
  expect(free.stoppedTicks).toBeGreaterThanOrEqual(capped.stoppedTicks); expect(free.pass).toBeNull();
}, 60_000);
```

- [ ] **Step 2: 실패를 확인한다** — Run: `npx vitest run packages/sim/test/stage3-sim.test.ts` / Expected: FAIL
- [ ] **Step 3: 구현한다**
- [ ] **Step 4: 통과와 CLI 동작을 확인한다** — Run: `npx vitest run packages/sim && npm run typecheck && npm run sim -- --stage 3 --check control --seeds 1` / Expected: PASS, 정지율 마크다운 표 출력, `sim-out/stage3/control.csv` 생성
- [ ] **Step 5: 커밋한다** — `git commit -m "feat(sim): stage 3 combine-gain and boss stopped-time checks"`

---

### Task 10: 첫 6등급 완성 라운드 측정과 1차 결과 문서

**Implementer:** astra

**Files:**
- Create: `packages/sim/src/stage3/targetBot.ts`, `packages/sim/src/stage3/grade6.ts`, `docs/balance/stage3-first-pass.md`
- Modify: `packages/sim/src/bots.ts`(`emptyOpenSlots`, `summonAll`, `placementFix`, `cheapestUpgrade`를 export만 추가), `packages/sim/src/stage3/cli.ts`, `packages/sim/src/stage3/report.ts`
- Test: `packages/sim/test/stage3-sim.test.ts` (시험 추가)

**읽을 것:** v5 4장 "바닥 재료에서 시작할 때", 7장 "수입과 완성 시점" 줄과 "한도의 근거", 1단계 명세 11·12장, `packages/sim/src/bots.ts`.

**Interfaces:**
- Produces:
  - `expandTree(data: GameData, id: string): Map<string, number>` — `id`부터 재료를 재귀로 펼친 모든 유닛의 필요 개수(자기 포함). 1등급 개수 합은 조합 값과 같다.
  - `targetBot(seed: number, opts?: { targets?: string[] }): Bot` (name `'target'`) — 목표는 `opts.targets`를 차례로, 없으면 `deriveSeed(seed, 'target')` 난수로 아직 안 만든 히든 아닌 6등급 하나. 결정마다: 소환 전부 → 목표 트리에 든 결과 중 가능한 가장 높은 등급 조합 → 칸이 차고 도깨비불이 있으면 6등급이 아니고 트리에 없는 유닛 중 가장 낮은 등급을 팔고 소환(없으면 트리 필요 개수를 넘는 1등급, 그것도 없으면 `convertToken`) → 트리의 5등급을 하나라도 가졌으면 엽전 60을 남기고 가장 싼 강화 → `placementFix` → 4번째 결정마다 `followBoss`. 목표 6등급이 칸에 생기면 다음 목표로 넘어간다. 6등급은 팔지 않는다.
  - `grade6Run(data: GameData, seed: number, bot: Bot, opts: { noDefeat: boolean }): Grade6Row` — 10틱마다 `bot.decide`. `noDefeat`면 복제본의 `balance.limit = 1e9`로 두고, 보스 라운드 끝 틱에 살아 있는 고개 보스를 `state.enemies`에서 빼서(보상 없음, `bossesEscaped += 1`) 패배 없이 60라운드를 끝까지 돈다.
  - `Grade6Row = { seed; bot; noDefeat: boolean; firstGrade5Round: number | null; firstGrade6Round: number | null; grade6Count: number; grade6Ids: string[]; buckwheatEarned: number; bossesKilled: number; bossesEscaped: number; endRound: number; outcome: string }` — 라운드는 `combine` 이벤트의 결과 등급으로 센다.
  - `grade6Summary(rows): { median: number | null; p90: number | null; neverRate: number }`; `grade6Markdown(rows): string`
  - `stage3Cli`: `--check grade6`(목표 봇과 보통 봇, `--defeat on|off` 기본 off, `--seeds` 기본 20), `grade6.csv`.

- [ ] **Step 1: 실패하는 시험을 더한다**

```ts
test('expandTree leaf totals equal recipe value', () => {
  const t = expandTree(d3, 'bihyeongrang');
  const leaves = [...t].filter(([id]) => unitDefFast(d3, id).grade === 1).reduce((a, [, n]) => a + n, 0);
  expect([leaves, t.get('top'), t.get('bihyeongrang')]).toEqual([40, 1, 1]);
  expect([...expandTree(d3, 'top')].filter(([id]) => unitDefFast(d3, id).grade === 1).reduce((a, [, n]) => a + n, 0)).toBe(16);
});
test('target bot sells non-tree units first and never sells grade 6', () => {
  // full board with tokens, target 'cheonnyeonmunbitjang', one 'hwaetbul' (not in tree) and a 'gildal':
  // decide() contains { type: 'sell', slot: <hwaetbul slot> } and no sell of the gildal slot
});
test('grade6Run is deterministic and reports a round or null', () => {
  const a = grade6Run(d3, 1, targetBot(1, { targets: ['cheonnyeonmunbitjang'] }), { noDefeat: true });
  const b = grade6Run(d3, 1, targetBot(1, { targets: ['cheonnyeonmunbitjang'] }), { noDefeat: true });
  expect(a).toEqual(b); expect(a.endRound).toBe(60);
  expect(a.firstGrade6Round === null || (a.firstGrade6Round >= 1 && a.firstGrade6Round <= 60)).toBe(true);
}, 120_000);
```

- [ ] **Step 2: 실패를 확인한다** — Run: `npx vitest run packages/sim/test/stage3-sim.test.ts` / Expected: 새 시험 FAIL
- [ ] **Step 3: 구현한다**
- [ ] **Step 4: 통과를 확인한다** — Run: `npx vitest run && npm run typecheck && npm run validate` / Expected: PASS
- [ ] **Step 5: 측정을 돌린다** (`sim-out/stage3/`에 CSV가 남는다)

```bash
npm run sim -- --stage 3 --check combine --seeds 3
npm run sim -- --stage 3 --check control --seeds 5
npm run sim -- --stage 3 --check grade6 --seeds 20
npm run sim -- --stage 3 --check grade6 --seeds 20 --defeat on
```

조합 이득 전체 실행이 10분을 넘으면 `--seeds 1`로 줄이고 문서에 그 사실을 적는다.

- [ ] **Step 6: `docs/balance/stage3-first-pass.md`를 쓴다.** 사실 위주의 한국어, 숫자는 위 실행 출력에서 그대로 옮긴다. 절 구성:
  1. 무엇을 넣었나 — 3단계 데이터 수(116 + 히든 5, 조합 108), 새 스킬 종류 목록(이 계획의 표), 임시값(30~60라운드 보스 체력, 5·6등급 판매가, 60라운드 웨이브 반복 규칙)
  2. 조합 이득 — 측정 조건(무저항 시험 잡귀 4종 간격, A 잔존 15 근처로 맞춘 체력, 시드 수, 강화 0단, 오라 안팎 미측정), 등급별 통과 수, 탈락 조합 표(결과·간격·A/B 평균·최악 차이). 디자이너 결정 1에 따라 탈락은 모두 수치 조정 대상이라고 적는다.
  3. 고개 보스 정지율 — 라인업 × 보스 × 상한 표(정지율 중앙값·최대, 창 최대 정지 틱, 잘린 스턴·밀기, 순전진, 최장 체류). 상한 3초/3칸에서 30%를 넘는 행이 있으면 따로 적는다.
  4. 첫 6등급 완성 라운드 — 목표 봇·보통 봇 × 패배 끔/켬의 중앙값, 늦은 10%, 미완성 비율, 6등급 수, 받은 메밀묵. 장터·퀘스트 수입이 없는 상태의 값이라는 점과 v5 7장 목표(생존자 개인별 3~4기)와의 차이를 적는다.
  5. 후속 작업 — 설화 퀘스트(완성품 지급, 고개당 한 판 한 기, 31R·46R 검사, 수입 한도 Q ≤ 20·3Q ≤ N)와 그 화면, 길들이기, 뽑기 장터, 클라이언트 도감·조합 카드(사라지는 오라·이어받는 지원 효과 표시), 3단계 6인 협동 실행, 60라운드판 역신 일정, 강화 쏠림(10/0·0/10단)과 오라 안팎·적체 조건의 조합 이득, 6등급 강철이전·역신 방문 측정, 탈락 조합 수치 조정, 임시값 확정.
- [ ] **Step 7: 커밋한다** — `git add packages/sim docs/balance/stage3-first-pass.md && git commit -m "feat(sim): first grade-6 round measurement and stage 3 first-pass numbers"`
