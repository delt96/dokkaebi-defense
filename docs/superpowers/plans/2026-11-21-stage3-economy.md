# 3단계 경제 구현 계획 (장터·의뢰·길들이기·배달·60라운드 역신)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어려움 60라운드판에 뽑기 장터(보따리·묵장수 단지·전투 드롭), 설화 의뢰, 일반 퀘스트 네 가지, 길들이기와 히든 다섯 기, 지게 도깨비 배달, 60라운드 역신 일정을 넣고, 봇이 이것들을 쓰게 한 뒤 6인 매치에서 첫 일반 6등급 완성을 장터·퀘스트 켬/끔으로 다시 잰다.

**Architecture:** 경제 수치는 모두 `packages/logic/data/stage3/economy.json`(와 역신 일정은 `stage3/coop.json`)에 두고 `loadGameData('stage3')`만 `data.economy`를 싣는다. 고개 단위 상태는 선택 필드 `GameState.econ`, 매치 단위 상태는 `MatchState.econ`에 두며 `data.economy`가 있을 때만 만든다. 그래서 1·2단계 상태와 해시는 그대로다. 고개 단위 규칙(장터, 드롭, 설화, 개인 미션, 수집, 그늘손, 길들이기)은 `packages/logic/src/econ/`의 명령 처리기와 네 개의 고리(라운드 시작·매 틱·라운드 마감·처치)로 돌아서 1인 `step`과 `stepMatch` 양쪽에서 같다. 두 고개 이상이 얽히는 규칙(팀 의뢰, 씨름 추첨, 배달, 역신 네 관문)은 `packages/logic/src/match/econ.ts`에 둔다. 장터·드롭·지게·씨름 추첨은 각자 따로 파생한 난수열을 써서 소환·전투 난수와 다른 고개를 건드리지 않는다.

**Tech Stack:** Windows 11, Node 22.17, npm workspaces, TypeScript 5.8 strict(`noUncheckedIndexedAccess`), Vitest 3.2, tsx 4

**Spec:** `docs/design/stage3-economy-draft.md` (이하 "초안", 구속력 있음). 함께 읽을 것: `docs/design/content-draft-116-v5.md` 7장(설화 퀘스트 데이터와 시뮬레이터 합격 기준), `docs/balance/stage3-first-pass.md`(1차 측정과 후속 작업), `docs/superpowers/plans/2026-11-21-stage3-content.md`(이미 있는 3단계 데이터·규칙·측정 도구).

**실행자에게:** 각 Task는 서로 다른 구현자가 그 Task 본문만 보고 진행한다. Task 본문과 함께 아래 Global Constraints, "결정 사항", "공통 타입"을 같이 넘긴다. "읽을 것"의 파일은 실제 코드이므로 먼저 연다.

## 결정 사항 (이 계획에서 정함, 구속력 있음)

초안 8장의 열린 결정은 굵은 첫 안으로 하고, 모두 데이터 한 곳에서 바꿀 수 있게 한다.

1. **묵장수 단지는 열 고개마다 한 단지**: `economy.market.jar.periodRounds = 10`, `perPeriod = 1`. 스무 고개마다 두 단지로 바꾸려면 이 두 값만 `20`, `2`로 고친다.
2. **배달 뒤 쉬는 라운드는 5**: `economy.transfer.cooldownRounds = 5`.
3. **후반 역신은 35·55R 두 번**: `stage3/coop.json`의 `yeoksin` 배열이 네 관문을 갖는다. 55R 한 번으로 바꾸려면 셋째 항목을 지우고 넷째의 `stage`를 3으로 고친다.

초안이 비워 두었거나 두 갈래로 읽히는 부분은 아래처럼 정한다.

4. **60라운드 역신 체력은 초안 7장 표 그대로** 기본 8,000 / 30,000 / 90,000 / 210,000, 출발 순번 0·1·2·3(`startIndex`). 2단계 20라운드판의 조정값(10,700 / 33,000)은 바꾸지 않는다.
5. **설화 한도의 N은 지급 직후 값**이다. 낸 두 재료의 원가를 뺀 보유 비퀘스트 원가로 `3 × (Q + S) ≤ N`을 본다. 기존 Q 4, S 16일 때 N 60은 통과, 59는 "유닛 값 1 더 필요".
6. **유닛 원가 `Unit.cost`** 는 경제가 있을 때만 붙는다. 일반 불 소환은 등급 값(1·2·4), 보정 1등급은 1, 장터·드롭은 등급 값, 조합 결과는 쓴 재료 원가의 합, 퀘스트 불로 한 소환과 그 소환이 일으킨 보정·설화 완성품·히든은 0, 배달은 원가를 그대로 옮긴다. N은 지금 칸에 있는 유닛 `cost`의 합이다.
7. **퀘스트 불(팀 의뢰 보상)은 소환·환전·그늘손 길들이기에서 일반 불보다 먼저 쓴다.** 받을 때 Q에 4를 예약하고 되돌리지 않는다.
8. **이벤트 적**(쇠밥짐승 `ev_soebap`, 씨름 도깨비 `ev_ssireum`, 그늘손 `ev_shadow`)은 `EnemyDef.event = true`. 일반 잡귀 수·한도·라운드 통계에 넣지 않고, 유닛은 고개 보스처럼 먼저 노린다(`pickTarget` 순위 0). 보스 제어 상한은 받지 않는다. 처치 보상은 경제 규칙이 따로 준다(기본 처치 엽전 없음).
9. **길들이기의 15% 조건은 다섯 대상 모두**에 적용한다. 판정은 `0 < hp ≤ floor(maxHp × 0.15)`. 길들인 적은 그 틱 명령 단계에서 `hp = 0`이 되고, 같은 틱 `resolveKills`가 처치 이벤트와 원래 보상을 한 번만 낸다. 그래서 개인 보스 시계·개인 미션·전투 드롭이 일반 처치와 똑같이 움직인다.
10. **지게 도깨비는 보따리를 산 고개에만 온다.** 보낼 때만 필요하고 받는 쪽은 없어도 된다. 한 번 오면 판 끝까지 남고 그 뒤로는 8% 판정을 하지 않는다.
11. **배달 받은 유닛은 받는 고개의 새 id로 새로 놓는다**(`addUnit`, 타이머 새로 시작), `cost`를 옮기고 `delivered: true`를 붙여 다시 보낼 수 없게 한다.
12. **설화·미션 정산은 마감 틱의 생존 판정 뒤, 라운드 마감 10냥 전**이다. 1인 `step`에서는 마감 틱(`roundEndTick - 1`)의 `checkEnd` 뒤, 매치에서는 `judgeSeats` 뒤 마감 엽전 앞이다.
13. **씨름·팀 의뢰·배달·역신 네 관문은 매치에서만** 돈다. 1인 `step`은 고개 단위 규칙만 돈다.
14. **경제 켬/끔은 데이터로 한다.** `economyVariant(data, switches)`가 `data.economy`의 해당 절을 지운 복제를 돌려준다. 절이 없으면 그 규칙은 꺼진다. 시뮬레이터 비교와 시험이 모두 이것을 쓴다.
15. **화면 연결은 이번 범위 밖이다.** `packages/client`와 `match/view.ts`(ClientView·GateView)는 건드리지 않는다. 화면이 쓸 순수 함수 `marketView`, `storyView`만 logic에 둔다. 서버는 `parseClientCommand`(logic)를 그대로 쓰므로 바꾸지 않는다.
16. **목표 봇의 보스 대비 전력**: 트리 밖 유닛 중 공격력(`unitAttack`) 상위 4기는 팔지 않는다.

## Global Constraints

- 작업은 `C:\workspace\web-game-qa`(브랜치 `stage3-econ`)에서만 한다. 다른 워크트리는 건드리지 않는다. 병합·푸시하지 않는다.
- `packages/client`는 수정하지 않는다(다른 브랜치 `stage3-play`가 60라운드 화면을 붙이는 중). `packages/server`도 수정하지 않는다(새 명령은 logic의 `parseClientCommand`가 받는다).
- 1단계 진입점 `loadGameData()`·`createGame`·`step`과 2단계 `loadGameData('stage2')`·`createMatch`·`stepMatch`의 반환 필드, 이벤트, 거절 사유, 난수 소비 순서를 바꾸지 않는다. `npx vitest run packages/sim/test/golden.test.ts`가 모든 Task 뒤에 통과해야 한다.
- `packages/logic/data/*.json`과 `packages/logic/data/stage2/*.json`은 수정하지 않는다. 각 Task 끝에서 `git diff --stat main -- packages/logic/data/*.json packages/logic/data/stage2` 출력이 비어 있어야 한다.
- 새 상태 필드(`Unit.cost`·`locked`·`delivered`, `GameState.econ`, `MatchState.econ`, `MatchOptions.noGate`)는 모두 선택 필드이고 `data.economy`가 있을 때만 값을 넣는다. 2단계 매치의 `seats[n].bosses`는 키 `10`·`20`, `yeoksinDamage`는 `[0, 0]` 그대로여야 한다.
- `packages/logic`은 `Math.random`, `Date`, `performance`, DOM을 쓰지 않는다. 경제 난수는 `deriveSeed(seed, 'bundle' | 'jar' | 'jige' | 'drop')`(고개)와 `deriveSeed(matchSeed, 'econ')`(매치)로만 만든다. 장터 구매는 `rng.summon`·`rng.combat`과 다른 고개의 상태를 바꾸지 않는다.
- 규칙 수치는 `packages/logic/data/stage3/economy.json`·`coop.json`·`enemies.json`에 둔다. 코드에 숫자를 박지 않는다(시뮬레이터 봇 정책 상수는 예외).
- 모든 Task 끝에서 `npx vitest run`(전체)과 `npm run typecheck`가 통과해야 한다. 기존 시험의 기대값은 고치지 않는다. 경제가 켜져서 기존 3단계 시험 결과가 달라지면, 그 시험의 데이터를 `stripEconomy(loadGameData('stage3'))`로 바꾸는 것만 허용한다.
- 백분율은 소수(`0.08` = 8%). 1틱 = 50ms, 초→틱은 `toTicks(seconds)`.
- 줄바꿈은 LF(새 파일 포함). 화면·문서 문구는 자연스러운 한국어, 코드·주석은 영어.
- 커밋은 Task마다 한 번 이상, 작게. 메시지 끝 줄은 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `sim-out/`은 커밋하지 않는다.
- `stage3-play` 브랜치가 `match/seats.ts`·`match/step.ts`를 먼저 바꿔 main에 들어오면 Task 6 전에 main을 병합하고 그 위에서 진행한다(푸시는 하지 않는다).

## Review Focus

1. **경제가 없는 데이터에 새 키가 생기는 경우.** 2단계 매치의 고개 상태에 `econ`, 유닛에 `cost`, 시트에 `30`번 보스 시계가 생기면 해시와 화면 상태가 바뀐다. 시험: Task 1(`createGame(stage2)`에 `econ`·`cost` 없음), Task 6(`createMatch(stage2)`의 키 비교).
2. **같은 틱에 같은 상품 명령을 두 번 보낼 때.** 70냥으로 단지를 같은 틱에 두 번 사면 첫 판정이 빗나갔을 때만 둘째가 묵 확정으로 통과하고, 첫 판정이 묵이면 둘째는 `soldOut`이며 잔액 35가 남아야 한다. 시험: Task 2.
3. **라운드가 바뀌는데 이벤트 적이 남은 경우.** 쇠밥짐승·그늘손은 그 라운드 마감에, 씨름은 20초 뒤에 도주해야 하고 다음 라운드 잡귀 수·한도·통계에 섞이면 안 된다. 시험: Task 3.
4. **배달로 잠긴 유닛이 다른 소비처에 쓰이는 경우.** 잠긴 유닛은 조합 재료, 설화 지불, 판매, 이동 어디에도 쓰이지 않아야 한다. 시험: Task 7.
5. **빈칸 대기열이 있는데 길들이기·장터를 누를 때.** 보정 1등급이나 전투 드롭이 대기 중이어도 빈칸 검사는 지금 비어 있는 열린 칸으로 하고, 거절되면 비용·대기열·난수가 그대로여야 한다. 시험: Task 2(드롭 대기 + 보따리), Task 5(길들이기).

---

## 공통 타입

Task 1이 `packages/logic/src/types.ts`에 아래를 더한다(기존 멤버는 그대로). 뒤 Task는 이 이름을 그대로 쓴다.

```ts
export type EconItem = 'bundle' | 'jar';
export type GeneralQuestId = 'mission' | 'collection' | 'team' | 'ssireum';
export type EconSection = 'market' | 'drops' | 'story' | GeneralQuestId | 'shadow' | 'tame' | 'transfer';
export interface TameTargetDef {
  enemy: string; unit: string; cost: { buckwheat?: number; coins?: number; tokens?: number };
  needs?: 'slowed' | { vulnSource: string; stacks: number };
}
export interface EconomyDef {
  ledger: { tokenValue: number; storyCap: number; totalCap: number; ratio: number };
  market?: {
    dayRounds: number; jigeChance: number;
    bundle: { price: number; perDay: number; deck: number[] };
    jar: { price: number; firstChance: number; periodRounds: number; perPeriod: number };
  };
  drops?: { round: number; grade: number }[];
  story?: { checks: { round: number; recordRounds: number[] }[]; kills: number; fee: { coins: number; buckwheat: number }; maxAwards: number };
  mission?: { round: number; entrySeconds: number; fee: number; enemy: string; kills: number; reward: { coins: number; buckwheat: number } };
  collection?: { fromRound: number; toRound: number; items: string[]; coins: number };
  team?: { fromRound: number; toRound: number; perSurvivor: number; nights: number; tokens: number };
  ssireum?: { round: number; enemy: string; seconds: number; buckwheat: number };
  shadow?: { round: number; enemy: string; growSeconds: number; grownHp: number; coins: number; grownCoins: number };
  tame?: { hpPct: number; targets: TameTargetDef[] };
  transfer?: { offerSeconds: number; cooldownRounds: number; maxGrade: number; reward: number; rewardCap: number };
}
export type StoryEndReason = 'award' | 'declined' | 'targetChanged' | 'lostMaterial' | 'gotMaterial' | 'kills' | 'funds' | 'cap';
export interface StoryState {
  target: string | null; pinned: number[];
  log: { round: number; target: string; missing: number | null }[];
  offers: number; awarded: boolean;
  active: { target: string; missing: number; round: number } | null;
}
export interface EconState {
  rng: { bundle: RngState; jar: RngState; jige: RngState; drop: RngState };
  roundKills: number; questTokens: number;
  ledger: { story: number; tokens: number };
  pityQuest: boolean[]; pendingDrops: string[];
  bundle: { day: number; bought: number; left: number[] };
  jar: { period: number; done: number; missed: boolean };
  jige: boolean;
  story: StoryState;
  mission: { phase: 'idle' | 'active' | 'won' | 'lost'; beastId: number | null; beastDown: boolean };
  collection: { done: string[]; paid: boolean };
  events: { id: number; kind: 'beast' | 'ssireum' | 'shadow'; spawnTick: number; grown: boolean }[];
  tamed: string[];
}
```

기존 타입에 더하는 것:

- `GameData.economy?: EconomyDef`, `EnemyDef.event?: true`, `GameState.econ?: EconState`
- `Unit`: `cost?: number; locked?: true; delivered?: true`
- `YeoksinStageDef.stage: number` (`1 | 2`에서 넓힘)
- `Command`에 `{ type: 'buy'; item: EconItem }`, `{ type: 'storyTarget'; id: string | null; unitIds?: number[] }`, `{ type: 'storyDecline' }`, `{ type: 'missionEnter' }`, `{ type: 'tame'; enemyId: number }`
- `RejectReason`에 `'marketClosed' | 'soldOut' | 'badTarget' | 'notOffered' | 'missionClosed' | 'noTarget' | 'tameHp' | 'tameCondition' | 'locked' | 'busy' | 'cooldown' | 'noJige' | 'noOffer'`
- `GameEvent`에 `{ type: 'buy'; item: EconItem; defId: string | null; buckwheat: number; jige: boolean }`, `{ type: 'storyOffer'; target: string; missing: string; round: number }`, `{ type: 'storyEnd'; target: string; reason: StoryEndReason }`, `{ type: 'questReward'; quest: GeneralQuestId | 'story' | 'transfer'; coins: number; buckwheat: number; tokens: number }`, `{ type: 'tame'; enemyId: number; defId: string; unitId: number; slot: number }`, `{ type: 'grow'; enemyId: number; hp: number }`, `{ type: 'flee'; enemyId: number }`

새로 놓이는 유닛(장터·드롭·설화·길들이기·배달)은 기존 `summon` 이벤트도 함께 낸다. 그래야 매치 스트리머가 칸 변화를 그대로 보낸다.

## 파일 구조

```
packages/logic/
  data/stage3/economy.json       경제 수치 전부 (Task 1에서 전 절을 채운다)
  data/stage3/coop.json          60라운드 역신 네 관문 (Task 6)
  data/stage3/enemies.json       ev_soebap·ev_ssireum·ev_shadow (Task 1), yeoksin3·yeoksin4 (Task 6)
  src/types.ts                   공통 타입 (Task 1)
  src/data.ts                    economy·coop3 적재, enemyHp의 event 고정 체력 (Task 1·6)
  src/stats.ts                   isEvent, 일반 잡귀 수에서 제외 (Task 1)
  src/econ/ledger.ts             원가·N·Q·한도·퀘스트 불, economyVariant, stripEconomy, createEcon (Task 1)
  src/econ/hooks.ts              econRoundStart·econTick·econRoundEnd·econEventKill·econBossKill (Task 1 뼈대, 2~5에서 채움)
  src/econ/market.ts             buy 명령, 보따리 패, 단지, 지게, 전투 드롭, marketView (Task 2)
  src/econ/events.ts             이벤트 적 생성·성장·도주·처치 보상 (Task 3)
  src/econ/quests.ts             개인 미션, 수집 도전 (Task 3)
  src/econ/story.ts              설화 의뢰, storyView (Task 4)
  src/econ/tame.ts               tame 명령 (Task 5)
  src/units.ts combine.ts combat.ts flow.ts game.ts   원가 부여, 잠금 검사, 고리 호출 (Task 1·7)
  src/match/types.ts create.ts seats.ts step.ts yeoksin.ts   모든 보스 라운드 시계, 네 관문, noGate (Task 6)
  src/match/econ.ts              매치 경제 상태, 팀 의뢰, 씨름 추첨, 배달 (Task 6·7)
  src/match/parse.ts             새 명령의 파서와 toWire (Task 7)
  src/index.ts                   새 export (각 Task)
  test/econ-ledger.test.ts       (Task 1)   test/econ-market.test.ts (Task 2)
  test/econ-quests.test.ts       (Task 3)   test/econ-story.test.ts  (Task 4)
  test/econ-tame.test.ts         (Task 5)   test/match-stage3.test.ts (Task 6)
  test/match-transfer.test.ts    (Task 7)   test/parse.test.ts (Task 7, 시험 추가)
packages/sim/
  src/stage3/econBot.ts          장터·퀘스트·길들이기 정책, 목표 전환 봇 (Task 8)
  src/stage3/targetBot.ts        보스 대비 전력 유지, 정책 연결 (Task 8)
  src/stage3/econDriver.ts       6인 매치 구동, 배달 정책 (Task 8)
  src/stage3/econRun.ts          매치 기반 첫 6등급 측정, 요약 (Task 9)
  src/stage3/cli.ts              --check grade6 옵션 (Task 9)
  test/stage3-econ.test.ts       (Task 8·9)
docs/balance/stage3-economy-pass.md   (Task 10)
```

---

### Task 1: 경제 데이터·타입·원가 장부와 이벤트 적 기반

**Files:**
- Modify: `packages/logic/src/types.ts`, `src/data.ts`, `src/stats.ts`, `src/units.ts`, `src/combine.ts`, `src/combat.ts`, `src/flow.ts`, `src/game.ts`, `src/index.ts`
- Create: `packages/logic/data/stage3/economy.json`, `src/econ/ledger.ts`, `src/econ/hooks.ts`
- Modify: `packages/logic/data/stage3/enemies.json` (이벤트 적 셋 추가)
- Test: `packages/logic/test/econ-ledger.test.ts`

**읽을 것:** 초안 1장 4~5항(장부), 3장 표, 4장 표, 2장 표. `src/units.ts`의 `summon`·`receive`·`placePendingPity`, `src/combine.ts`, `src/combat.ts`의 `resolveKills`·`pickTarget`·`dealDamage`.

**Interfaces:**
- Produces: 공통 타입 전부. `economy.json`(아래 값). `src/econ/ledger.ts`:
  - `createEcon(seed: number): EconState`
  - `unitValue(data: GameData, defId: string): number` — 1~5등급 `2^(g-1)`, 일반 6등급은 재료 값 합(36 또는 40), 히든 0
  - `nonQuestValue(state: GameState): number` — N
  - `questLoad(state: GameState): number` — Q = `ledger.story + ledger.tokens`
  - `fitsCaps(state: GameState, addStory: number, addTokens: number, nAfter: number): boolean` — `story+addStory ≤ storyCap`, `Q' ≤ totalCap`, `ratio × Q' ≤ nAfter`
  - `takeToken(state: GameState): 'quest' | 'normal' | null` — 퀘스트 불을 먼저 쓴다
  - `grantQuestTokens(state: GameState, n: number): boolean` — 한도를 넘으면 false, 아니면 `tokens`·`questTokens` +n, `ledger.tokens += n × tokenValue`
  - `economyVariant(data: GameData, on: Partial<Record<EconSection, boolean>>): GameData`, `stripEconomy(data: GameData): GameData`
- Produces: `src/econ/hooks.ts`의 빈 고리 `econRoundStart(state, events)`, `econTick(state, events)`, `econRoundEnd(state, events)`, `econEventKill(state, enemy, events): boolean`(이벤트 적이면 true), `econBossKill(state, events)`. 호출 위치: `startRound` 끝, `runCombat` 처음(`moveEnemies` 앞), `step`의 `checkEnd` 뒤 마감 틱(결정 12), `resolveKills` 안. 모두 `state.econ`이 있을 때만 부른다.
- Produces: `isEvent(data: GameData, e: Enemy): boolean`(stats.ts, `isShared`와 같은 캐시 방식).

`economy.json` 값 (초안 그대로, 이 Task에서 전 절을 채운다):

```json
{
  "ledger": { "tokenValue": 4, "storyCap": 16, "totalCap": 20, "ratio": 3 },
  "market": { "dayRounds": 10, "jigeChance": 0.08,
    "bundle": { "price": 55, "perDay": 2, "deck": [3, 3, 2] },
    "jar": { "price": 35, "firstChance": 0.5, "periodRounds": 10, "perPeriod": 1 } },
  "drops": [ { "round": 20, "grade": 3 }, { "round": 40, "grade": 3 }, { "round": 50, "grade": 2 } ],
  "story": { "checks": [ { "round": 31, "recordRounds": [28, 29] }, { "round": 46, "recordRounds": [44, 45] } ],
    "kills": 20, "fee": { "coins": 60, "buckwheat": 1 }, "maxAwards": 1 },
  "mission": { "round": 12, "entrySeconds": 5, "fee": 20, "enemy": "ev_soebap", "kills": 20, "reward": { "coins": 30, "buckwheat": 1 } },
  "collection": { "fromRound": 21, "toRound": 29, "items": ["gamasot", "meongseok", "hwaro"], "coins": 20 },
  "team": { "fromRound": 21, "toRound": 29, "perSurvivor": 8, "nights": 3, "tokens": 1 },
  "ssireum": { "round": 32, "enemy": "ev_ssireum", "seconds": 20, "buckwheat": 1 },
  "shadow": { "round": 43, "enemy": "ev_shadow", "growSeconds": 10, "grownHp": 16000, "coins": 5, "grownCoins": 10 },
  "tame": { "hpPct": 0.15, "targets": [
    { "enemy": "jinegaksi", "unit": "jinegaksi", "cost": { "buckwheat": 1 } },
    { "enemy": "gangcheori", "unit": "gangcheori", "cost": { "buckwheat": 1 }, "needs": "slowed" },
    { "enemy": "ev_soebap", "unit": "bulgasari", "cost": { "coins": 60 }, "needs": { "vulnSource": "moru", "stacks": 5 } },
    { "enemy": "ev_ssireum", "unit": "ssireumdokkaebi", "cost": { "buckwheat": 1 } },
    { "enemy": "ev_shadow", "unit": "eoduksini", "cost": { "tokens": 2 } } ] },
  "transfer": { "offerSeconds": 10, "cooldownRounds": 5, "maxGrade": 4, "reward": 1, "rewardCap": 6 }
}
```

이벤트 적(`stage3/enemies.json`에 추가, 속도·저항은 첫 시험값): `ev_soebap` "쇠밥짐승" hp 3000 speed 1.0, `ev_ssireum` "씨름 도깨비" hp 12000 speed 0.9, `ev_shadow` "그늘손" hp 4000 speed 1.6. 셋 다 `boss: false, event: true, hpMult: 1`, 저항 0/0.

- [ ] **Step 1: 실패하는 시험 작성** (`econ-ledger.test.ts`)

```ts
test('stage 1 and 2 data carry no economy and lanes get no econ or cost', () => {
  expect(loadGameData('stage1').economy).toBeUndefined();
  const s2 = createGame(loadGameData('stage2'), 7);
  step(s2, []); jumpLaneToRound(s2, 1); step(s2, [{ type: 'summon' }]);
  expect('econ' in s2).toBe(false);
  expect(s2.slots.filter(Boolean).every(u => !('cost' in u!))).toBe(true);
});
test('stage 3 lane starts with a fresh econ seeded from the lane seed', () => {
  const s = createGame(loadGameData('stage3'), 7);
  expect(s.econ!.rng.bundle.s).toBe(createRng(deriveSeed(7, 'bundle')).s);
  expect(s.econ!.bundle.left).toEqual([3, 3, 2]);
  expect(s.econ!.questTokens).toBe(0);
});
test('unit cost: summon = grade value, combine = sum, pity = 1', () => { /* summon until a grade 2 → cost 2; combine gamasot → cost = materials' sum; grade1Summons=6 then grade-1 summon → pity unit cost 1 */ });
test('a quest token summon and the pity it triggers cost 0 and spend the quest token first', () => {
  // econ.questTokens = 1, tokens = 2, grade1Summons = 6, summon rigged to grade 1
  // → both new units cost 0, questTokens 0, tokens 1
});
test('convertToken spends a quest token first and keeps the Q reservation', () => { /* ledger.tokens stays 4 */ });
test('N sums held costs; Q adds story and token ledgers; fitsCaps checks all three caps', () => {
  // ledger.tokens = 4: fitsCaps(s, 16, 0, 60) true, (s, 16, 0, 59) false, (s, 17, 0, 999) false
});
test('unitValue: grade 5 = 16, cheonnyeonjing = 40, hidden = 0', () => { /* ... */ });
test('economyVariant drops only the switched-off sections; stripEconomy removes economy', () => {
  const d = economyVariant(loadGameData('stage3'), { market: false, team: false });
  expect(d.economy!.market).toBeUndefined(); expect(d.economy!.team).toBeUndefined(); expect(d.economy!.story).toBeDefined();
  expect(stripEconomy(loadGameData('stage3')).economy).toBeUndefined();
});
test('event enemies: fixed hp, not counted as normal, targeted first, no round stats', () => {
  // spawnEnemyForTest(s, 'ev_soebap', 1) → hp 3000; countNormalEnemies 0; with a japgwi in range pickTarget = beast;
  // damage to the beast leaves currentStats(s).damageDealt unchanged
});
```

`jumpLaneToRound`는 이 파일 안 도우미로 `forceRound`(testing.ts)를 쓴다.

- [ ] **Step 2: 실행해서 실패 확인** — `npx vitest run packages/logic/test/econ-ledger.test.ts` → FAIL (`economyVariant` 없음 등)
- [ ] **Step 3: 구현**
  - `data.ts`: stage3일 때 `economy` 적재. `enemyHp`는 `(def.boss || def.event) && def.hp !== undefined`이면 `def.hp`.
  - `createGame`: `data.economy`가 있을 때만 `econ: createEcon(seed)`.
  - `units.ts` `summon`: `takeToken`으로 바꾸고, 경제가 있으면 새 유닛 `cost`를 결정 6대로 넣는다. 보정이 대기열로 가면 `econ.pityQuest`에 같은 순서로 출처를 넣고, `placePendingPity`가 꺼낼 때 함께 꺼낸다. `convertToken`도 `takeToken`.
  - `combine.ts`: 경제가 있으면 결과 `cost` = 쓴 칸들의 `cost` 합(칸을 비우기 전에 더한다).
  - `stats.ts` `countNormalEnemies`와 `combat.ts` `dealDamage` 통계 조건에 `!isEvent`, `pickTarget`은 이벤트 적을 순위 0.
  - `resolveKills`: 죽은 적마다 `kill` 이벤트 뒤 `if (state.econ && econEventKill(...)) continue;`, 보스 분기 끝에 `econBossKill`, 일반 분기에 `econ.roundKills++`.
- [ ] **Step 4: 통과 확인** — 위 파일 PASS, `npx vitest run`, `npm run typecheck`, golden PASS
- [ ] **Step 5: 커밋** — `feat(stage3): economy data, unit cost ledger and event enemy plumbing`

---

### Task 2: 뽑기 장터와 전투 드롭

**Files:**
- Create: `packages/logic/src/econ/market.ts`
- Modify: `src/econ/hooks.ts`(`econBossKill`), `src/game.ts`(`import './econ/market'`), `src/index.ts`
- Test: `packages/logic/test/econ-market.test.ts`

**읽을 것:** 초안 3장 전체, 6장 "재료 예산"의 전투 드롭 문장.

**Interfaces:**
- Consumes: `EconState`, `unitValue`, `chooseSlot`·`addUnit`(units.ts)
- Produces: `registerCommand('buy', ...)`; `marketDay(state: GameState): number`(= `ceil(round / dayRounds)`, 준비 중 0); `marketView(state): { bundle: { price: number; left: number; odds: Record<number, number> }; jar: { price: number; left: number; chance: number }; shortAfter: { bundle: number; jar: number } | null } | null`(`shortAfter`는 설화 목표가 있을 때 결제 뒤 60냥에 모자란 양, 없으면 0); `placePendingDrops(state, events)`(after-command 고리로 등록, `econ`이 있을 때만 일함)

규칙:
- 준비 중·`market` 절 없음 → `marketClosed`. 장날이 바뀌면 `bundle.bought = 0`.
- 보따리: 빈칸 없음 → `noSlot`(결제·패·난수 그대로). 남은 패 `left`에서 `nextInt(rng.bundle, left.length)`번째를 꺼낸 등급의 일반 유닛 중 `nextInt(rng.bundle, pool.length)`. 패가 비면 즉시 `deck`으로 다시 채운다. 그 뒤 `!jige`이면 `nextFloat(rng.jige) < jigeChance`로 지게 판정. `cost` = 등급 값. 보정 카운터(`grade1Summons`·`summonCounts`)는 건드리지 않는다.
- 단지: 기간(`ceil(round / periodRounds)`)이 바뀌면 `done = 0, missed = false`. `done ≥ perPeriod` → `soldOut`. `missed`이면 묵 1 확정(빈칸 불필요), 아니면 빈칸이 있어야 하고 `nextFloat(rng.jar) < firstChance`면 묵, 아니면 1등급 일반 유닛 하나(`rng.jar`)와 `missed = true`. 묵을 얻으면 `done++`, `missed = false`.
- 드롭: `econBossKill`이 `drops`에 그 라운드가 있으면 그 등급 일반 유닛을 `rng.drop`으로 뽑아 빈칸에 놓거나 `pendingDrops`에 넣는다. `cost` = 등급 값.

- [ ] **Step 1: 실패하는 시험 작성**

```ts
test('bundle: closed in prep, 55 coins per pull, two per market day, resets on day 2', () => { /* round 0 → marketClosed; round 1: two buys ok, third soldOut; round 11: ok again */ });
test('bundle deck: every 3 pulls are {3,3,2}, 12 pulls are worth 40, and grade 2 is never followed by grade 2 within a deck', () => {
  for (let seed = 1; seed <= 100; seed++) { /* 12 pulls across days; grades in chunks of 3 sorted = [2,3,3]; sum of values = 40 */ }
});
test('across a deck boundary two grade-2 pulls in a row are followed by a grade 3', () => { /* find seed where pull 3 and 4 are grade 2, assert pull 5 is grade 3 */ });
test('bundle with no empty open slot is refused before payment', () => {
  // fill all open slots; coins 55; snapshot econ.bundle and rng.bundle.s
  // → 'noSlot', coins 55, deck and rng unchanged
});
test('buying never touches the summon or combat streams or the pity counters', () => { /* rng.summon.s, rng.combat.s, grade1Summons, summonCounts equal before/after */ });
test('jar: miss gives a grade-1 unit and then a guaranteed buckwheat; a hit closes the period', () => {
  // seed with first roll miss: buy → grade 1 unit, missed true; buy → buckwheat +1; buy → soldOut; round 11 → first chance again
});
test('two jar buys in one tick with 70 coins', () => {
  // hit seed: second → soldOut, coins 35, buckwheat +1; miss seed: both pass, coins 0, buckwheat +1, one grade-1 unit
});
test('jar first draw needs a free slot but the guaranteed draw does not', () => { /* ... */ });
test('jar period 20 / 2 per period from data allows two full jars in rounds 1-20', () => {
  const d = makeData(x => { x.economy!.market!.jar.periodRounds = 20; x.economy!.market!.jar.perPeriod = 2; }, 'stage3');
});
test('jige arrives at most once and stops rolling after it came', () => { /* find seed where it arrives; later buys leave rng.jige.s unchanged */ });
test('one seat shopping leaves the other seats unchanged in a match', () => {
  // two stage-3 matches, same seed, seats [1,2]; seat 1 buys bundles in match A only; step to round 3
  // → canonicalJson(A.lanes[2]) === canonicalJson(B.lanes[2])
});
test('round 20 boss kill drops one grade-3 unit; round 10 drops nothing; full board queues it', () => {
  // with all slots full the drop goes to pendingDrops and lands after a sell; a bundle while a drop is queued
  // is still judged on current free slots (noSlot when none)
});
test('marketView shows real remaining odds and the 60-coin shortfall for a story target', () => { /* after one grade-2 pull: odds {3: 1, 2: 0}; coins 100 with target → shortAfter.bundle 15 */ });
```

- [ ] **Step 2: 실행해서 실패 확인** — `npx vitest run packages/logic/test/econ-market.test.ts` → FAIL
- [ ] **Step 3: `market.ts` 구현** (위 규칙과 Interfaces 그대로)
- [ ] **Step 4: 통과 확인** — 위 파일, 전체, typecheck, golden
- [ ] **Step 5: 커밋** — `feat(stage3): bundle and buckwheat-jar market, jige roll and boss drops`

---

### Task 3: 이벤트 적과 고개 단위 일반 퀘스트(개인 미션·수집 도전·그늘손·씨름 적)

**Files:**
- Create: `packages/logic/src/econ/events.ts`, `src/econ/quests.ts`
- Modify: `src/econ/hooks.ts`, `src/combine.ts`(수집 등록 호출), `src/game.ts`, `src/index.ts`
- Test: `packages/logic/test/econ-quests.test.ts`

**읽을 것:** 초안 2장 표와 검사, 4장의 그늘손 문단.

**Interfaces:**
- Produces (`events.ts`): `spawnEventEnemy(state: GameState, kind: 'beast' | 'ssireum' | 'shadow', events: GameEvent[]): Enemy` — `economy`의 해당 `enemy` id로 `spawnEnemy`, `econ.events`에 기록. Task 5·6이 쓴다.
- Produces (`quests.ts`): `registerCommand('missionEnter', ...)`; `onCollectionCombine(state, resultId, events)`
- `econTick`: 씨름은 `spawnTick + toTicks(seconds)`에 도주(`flee` 이벤트, 적 제거, 보상 없음). 그늘손은 `spawnTick + toTicks(growSeconds)`에 살아 있으면 `hp = maxHp = grownHp`, `grown = true`, `grow` 이벤트.
- `econRoundStart`: 라운드가 `shadow.round`이면 그늘손 생성. `roundKills = 0`.
- `econRoundEnd`: `mission.round` 마감이면 정산(`active`이고 `roundKills ≥ kills`이고 `beastDown`이면 `won`과 보상, 아니면 `lost`), 쇠밥짐승·그늘손이 살아 있으면 도주.
- `econEventKill`: 쇠밥짐승은 `beastDown = true`(엽전 0), 씨름은 묵 `buckwheat`와 `questReward { quest: 'ssireum' }`, 그늘손은 엽전 `grown ? grownCoins : coins`(퀘스트가 아니므로 `questReward` 없음). 모두 `econ.events`에서 지운다. 개인 미션 성공은 `questReward { quest: 'mission' }`, 수집 완료는 `questReward { quest: 'collection' }`을 낸다.
- 개인 미션 입장: `round === mission.round`이고 `tick < roundStartTick + toTicks(entrySeconds)`이고 `phase === 'idle'`이 아니면 `missionClosed`; 엽전 < `fee` → `noCoins`. 성공 시 `fee` 차감, 짐승 생성, `active`.
- 수집: `combine` 성공 직후, `fromRound ≤ round ≤ toRound`이고 결과가 `items`에 있으면 `done`에 한 번 추가. 셋이 모이면 `coins` 지급, `paid = true`. 설화·배달·장터로 얻은 유닛은 `combine`을 거치지 않으므로 세지 않는다.

- [ ] **Step 1: 실패하는 시험 작성**

```ts
test('mission entry: 20 coins inside the first 5 s of round 12 brings a 3000-hp beast', () => { /* tick roundStart+99 ok; +100 → missionClosed; second entry → missionClosed; 19 coins → noCoins */ });
test('mission pays 30 coins and 1 buckwheat when 20 normal kills and the beast fall by round end', () => { /* kill beast (0 coins) + 20 japgwi; at last tick of R12 coins +30, buckwheat +1, questReward once */ });
test('19 kills or a living beast at round end pays nothing; the beast flees and is not in round 13', () => {
  // after R12 end: no ev_soebap in enemies, flee event, countNormalEnemies unaffected, phase 'lost'
});
test('event kills and boss kills do not count toward roundKills', () => { /* ... */ });
test('collection pays 20 coins on the third own combine in rounds 21-29 only', () => {
  // gamasot at R20 not counted; gamasot, meongseok at R22, sell gamasot, hwaro at R25 → coins +20 once
});
test('shadow: 4000 hp at round 43, grows to 16000/16000 after 10 s, pays 5 small or 10 grown, flees at round end', () => { /* ... */ });
test('ssireum enemy: 12000 hp, flees after 20 s with no reward, a kill pays 1 buckwheat', () => { /* spawnEventEnemy(s, 'ssireum', ev) */ });
```

- [ ] **Step 2: 실행해서 실패 확인** — `npx vitest run packages/logic/test/econ-quests.test.ts` → FAIL
- [ ] **Step 3: `events.ts`·`quests.ts`와 고리 채우기**
- [ ] **Step 4: 통과 확인** — 위 파일, 전체, typecheck, golden
- [ ] **Step 5: 커밋** — `feat(stage3): event enemies, personal mission, collection challenge and shadow`

---

### Task 4: 설화 의뢰

**Files:**
- Create: `packages/logic/src/econ/story.ts`
- Modify: `src/econ/hooks.ts`, `src/combine.ts`(결과 칸 고르기를 `pickResultSlot(state, slots: number[]): number`로 꺼내 공유), `src/game.ts`, `src/index.ts`
- Test: `packages/logic/test/econ-story.test.ts`

**읽을 것:** 초안 1장 전체와 화면·검사 문단, v5 7장 첫 표.

**Interfaces:**
- Consumes: `unitValue`, `nonQuestValue`, `questLoad`, `fitsCaps`(Task 1)
- Produces: `registerCommand('storyTarget', ...)`, `registerCommand('storyDecline', ...)`; `storySlots(state, target): { have: (number | null)[]; missing: number[] }` — 레시피 재료 순서대로 그 자리를 채울 칸(잠기지 않은 유닛, 핀 우선, 그다음 작은 칸 번호, 한 유닛은 한 자리)과 빈 자리 번호; `storyView(state): { target: string; have: boolean[]; kills: number; need: number; total: number; paid: number; support: number; used: number; cap: number; short: number } | null` (`short` = `max(0, ratio × (Q + S) − N_after)`)

규칙:
- `storyTarget`: `id`가 히든이 아닌 6등급이 아니면 `badTarget`. `null` 허용(목표 해제). 목표가 바뀌면 `log = []`, 진행 중 의뢰는 `targetChanged`로 끝낸다. `unitIds`는 `pinned`에 저장.
- `econRoundEnd`(일반 라운드): 목표가 있으면 `log.push({ round, target, missing })`(`missing`은 빈 자리가 정확히 하나일 때 그 번호, 아니면 `null`). 진행 중 의뢰가 그 라운드 것이면 정산한다.
- `econRoundStart`: `checks`의 라운드면, `awarded`가 아니고(`maxAwards` 1회를 채우면 `awarded = true`) `offers < checks.length`이고 `recordRounds` 기록이 모두 같은 목표·같은 한 자리이며 지금도 빈 자리가 그 하나뿐일 때 `active`를 열고 `offers++`, `storyOffer` 이벤트.
- `econTick`: 진행 중이면 목표 재료 상태를 본다. 빈 자리가 없어지면 `gotMaterial`, 빈 자리가 둘 이상이면 `lostMaterial`로 끝낸다.
- 정산: `roundKills < kills` → `kills`; 엽전·묵 부족 → `funds`; `S = unitValue(target) − 두 재료 unitValue 합`, `nAfter = N − 두 재료 cost 합`, `!fitsCaps(state, S, 0, nAfter)` → `cap`. 모두 통과하면 두 재료를 빼고 `fee`를 내고 `pickResultSlot`(두 재료 칸)에 완성품을 놓는다(`cost` 0). `ledger.story += S`, `awarded = true`, `storyEnd 'award'`, `questReward { quest: 'story' }`, `summon` 이벤트. 실패하면 아무것도 내지 않는다.
- `storyDecline`: 진행 중이 아니면 `notOffered`, 아니면 `declined`.

- [ ] **Step 1: 실패하는 시험 작성** (목표 `cheonnyeonjing = janggu + kkwaenggwari + moru`, 꽹과리가 빈 자리 1)

```ts
test('storyTarget rejects grade 5 and hidden ids', () => { /* 'janggu' → badTarget, 'jinegaksi' → badTarget */ });
test('offer at round 31 needs the same single gap at the ends of 28 and 29', () => { /* both → storyOffer{missing:'kkwaenggwari'}; only 29 → none */ });
test('changing the target at round 30 clears the record and no offer comes at 31', () => { /* ... */ });
test('20 normal kills, 60 coins and 1 buckwheat at the end of 31 award cheonnyeonjing', () => {
  // janggu, moru removed; coins -60; buckwheat -1; cheonnyeonjing at janggu's slot (higher grade); cost 0; ledger.story 16
});
test('19 kills → kills; 59 coins → funds; nothing is paid', () => { /* units, coins, buckwheat unchanged */ });
test('caps: existing Q 4 and N after payment 59 → cap with storyView short 1; N 60 → award', () => { /* ledger.tokens = 4 */ });
test('getting the third material ends the request at once and normal combine works', () => { /* buy/place kkwaenggwari mid-round → storyEnd gotMaterial; combine ok */ });
test('selling moru ends with lostMaterial; decline ends with declined and costs nothing', () => { /* ... */ });
test('a failed 31 can be offered again at 46; after an award no offer comes at 46', () => { /* ... */ });
test('pinned unit ids choose which duplicate material is paid', () => { /* two moru; pin the higher slot one → that one removed */ });
```

- [ ] **Step 2: 실행해서 실패 확인** — `npx vitest run packages/logic/test/econ-story.test.ts` → FAIL
- [ ] **Step 3: `story.ts` 구현과 `pickResultSlot` 추출**(기존 조합 결과 칸 규칙을 그대로 옮긴다: 재료 칸 중 첫째로 등급이 가장 높은 칸)
- [ ] **Step 4: 통과 확인** — 위 파일, 전체(조합 시험 포함), typecheck, golden
- [ ] **Step 5: 커밋** — `feat(stage3): story request for the last grade-6 material with income caps`

---

### Task 5: 길들이기와 히든 다섯 기

**Files:**
- Create: `packages/logic/src/econ/tame.ts`
- Modify: `src/game.ts`, `src/index.ts`
- Test: `packages/logic/test/econ-tame.test.ts`

**읽을 것:** 초안 4장 전체. `src/match/seats.ts`의 `seatsAfterLane`(보스 시계가 `kill` 이벤트로 끝나는 방식).

**Interfaces:**
- Consumes: `takeToken`(Task 1), `econ.events`·`spawnEventEnemy`(Task 3), `chooseSlot`·`addUnit`
- Produces: `registerCommand('tame', ...)`; `tameCheck(state: GameState, enemyId: number): RejectReason | null` (봇과 화면이 버튼 상태를 미리 본다)

규칙: `tame` 절이 없거나 대상 적이 없거나 `targets`에 없는 적(30R 이후 보스, 역신, 일반 잡귀) → `noTarget`. `hp ≤ 0` 또는 `hp > floor(maxHp × hpPct)` → `tameHp`. `needs: 'slowed'`는 `slow && slow.ticks > 0`, `needs.vulnSource`는 `vulns[source].stacks ≥ stacks`, 아니면 `tameCondition`. 지금 비어 있는 열린 칸이 없으면 `noSlot`. 비용 부족은 `noBuckwheat`·`noCoins`·`noToken`. 통과하면 비용을 내고(불은 `takeToken`으로), 히든 유닛을 놓고(`cost` 0, `tamed`에 추가), 적의 `hp = 0`, `tame`·`summon` 이벤트. 처치 이벤트와 원래 보상은 같은 틱 `resolveKills`가 낸다(결정 9).

- [ ] **Step 1: 실패하는 시험 작성**

```ts
test('gangcheori at 3150/21000, slowed: tame places the hidden unit and pays the boss reward once', () => {
  // buckwheat 1 → after step: buckwheat 2 (−1 +2), coins +60, one 'kill' event, enemy gone, gangcheori unit cost 0,
  // round 20 drop added (grade 3)
});
test('3151 hp → tameHp; not slowed → tameCondition; no free slot → noSlot; nothing spent', () => { /* ... */ });
test('a queued pity unit does not count as a free slot', () => { /* pendingPity non-empty, board full → noSlot */ });
test('beast: moru 4 stacks → tameCondition, 5 stacks → 60 coins and the mission counts it as down', () => { /* ... */ });
test('ssireum tame pays its own 1 buckwheat; shadow tame spends quest tokens first', () => { /* ... */ });
test('jinegaksi3 and a yeoksin are not tameable', () => { /* noTarget */ });
test('two tame commands in one tick: one unit, one reward; second → noTarget', () => { /* ... */ });
test('tame and a lethal hit on the same tick give one kill and one reward', () => { /* unit in range able to kill; tame command first */ });
test('in a stage-3 match a tamed round-20 boss marks the seat clock killed', () => {
  // createMatch(stage3, 1, [1]); jumpToTick to round 20; spawn handled by stepMatch; set hp; tame → seats[1].bosses[20].status 'killed'
});
```

- [ ] **Step 2: 실행해서 실패 확인** — `npx vitest run packages/logic/test/econ-tame.test.ts` → FAIL
- [ ] **Step 3: `tame.ts` 구현**
- [ ] **Step 4: 통과 확인** — 위 파일, 전체, typecheck, golden
- [ ] **Step 5: 커밋** — `feat(stage3): taming five hidden units at 15% hp`

---

### Task 6: 60라운드 매치(모든 보스 라운드, 역신 네 관문)와 팀 의뢰·씨름 추첨

**Files:**
- Create: `packages/logic/data/stage3/coop.json`, `src/match/econ.ts`
- Modify: `data/stage3/enemies.json`(`yeoksin3`·`yeoksin4`), `src/data.ts`(stage3 `coop = { ...coop2, ...coop3 }`), `src/match/types.ts`, `create.ts`, `seats.ts`, `step.ts`, `yeoksin.ts`, `src/index.ts`
- Test: `packages/logic/test/match-stage3.test.ts`

**읽을 것:** 초안 7장, 2장의 팀 의뢰·씨름 행. `src/match/seats.ts` 전체, `src/match/step.ts` 전체, `src/match/yeoksin.ts`.

`stage3/coop.json`:

```json
{ "yeoksin": [
  { "stage": 1, "enemy": "yeoksin1", "startRound": 6,  "deadlineRound": 9,  "baseHp": 8000,   "startIndex": 0 },
  { "stage": 2, "enemy": "yeoksin2", "startRound": 15, "deadlineRound": 19, "baseHp": 30000,  "startIndex": 1 },
  { "stage": 3, "enemy": "yeoksin3", "startRound": 35, "deadlineRound": 39, "baseHp": 90000,  "startIndex": 2 },
  { "stage": 4, "enemy": "yeoksin4", "startRound": 55, "deadlineRound": 59, "baseHp": 210000, "startIndex": 3 } ] }
```

`yeoksin3` "역신 셋째 탈", `yeoksin4` "역신 넷째 탈": `yeoksin2`와 같은 모양(`shared: true`, speed 2, 저항 0).

**Interfaces:**
- Produces (types.ts): `SeatState.bosses: Record<number, BossClock>`; `bossSpawn`·`bossKilled` 이벤트의 `round: number`; `MatchOptions.noGate?: boolean`; `MatchState.econ?: MatchEcon`;
  ```ts
  export interface TransferOffer { from: number; to: number; slot: number; unitId: number; tick: number }
  export interface MatchEcon {
    rng: RngState; team: { streak: number; paid: boolean }; ssireumSeat: number | null;
    offers: TransferOffer[]; readyRound: Record<number, number>; rewarded: number[];
  }
  ```
  `MatchEvent`에 `{ type: 'ssireumDraw'; seat: number }` 추가(배달 이벤트는 Task 7).
- Produces (seats.ts): `bossRounds(data: GameData): number[]`(웨이브의 보스 라운드, 2단계는 `[10, 20]`), `allBossesKilled(match, seat)`(기존 `bothBossesKilled` 대체). `freshSeat`은 `bossRounds`로 시계를, `coop.yeoksin.length`로 `yeoksinDamage`를 만든다.
- Produces (match/econ.ts): `createMatchEcon(seed: number): MatchEcon`; `matchEconRoundStart(match, ctx)`(씨름 추첨); `matchEconRoundEnd(match, ctx)`(팀 의뢰); Task 7이 배달을 더한다.
- `stepMatch` 순서: 2단계 라운드 시작 처리 뒤 `matchEconRoundStart`; 4단계 `judgeSeats` 뒤 마감 틱이면 살아 있는 고개마다 `econRoundEnd(lane, events)`(Task 1 고리, 결정 12) 다음 `matchEconRoundEnd`, 그다음 기존 마감 엽전. 모두 `match.econ`/`lane.econ`이 있을 때만.
- `teamOutcome`: `options.noGate`이면 관문 실패를 보지 않는다.

규칙:
- 팀 의뢰: `fromRound ≤ round ≤ toRound`의 일반 라운드 마감에, 생존 고개의 `countNormalEnemies` 합 ≤ 생존 수 × `perSurvivor`이면 `streak++`, 아니면 `streak = 0`. `streak === nights`이고 `!paid`이면 그때 생존자마다 `grantQuestTokens(lane, tokens)`(한도 밖 고개는 받지 못함), `questReward { quest: 'team' }`는 받은 고개 이벤트에, `paid = true`.
- 씨름: `ssireum.round` 시작에 살아 있고 접속한 시트를 `match.ring` 순서로 모아 `nextInt(econ.rng, n)`으로 하나 고르고 `spawnEventEnemy(lane, 'ssireum', events)`, `ssireumDraw`. 후보가 없으면 건너뛰고 난수도 쓰지 않는다.

- [ ] **Step 1: 실패하는 시험 작성**

```ts
test('stage 2 matches keep boss keys 10/20, two yeoksin slots, no econ', () => {
  const m = createMatch(loadGameData('stage2'), 3, [1, 2]);
  expect(Object.keys(m.seats[1]!.bosses)).toEqual(['10', '20']);
  expect(m.seats[1]!.yeoksinDamage).toEqual([0, 0]);
  expect('econ' in m).toBe(false);
});
test('stage 3 matches have six boss clocks, four yeoksin slots and a match econ seeded from the match seed', () => { /* keys 10..60; econ.rng.s */ });
test('a round-30 boss alive at time-out eliminates the seat; finished needs all six bosses', () => { /* ... */ });
test('third yeoksin spawns at round 35 with 135000 hp for six starters at ring index 2; missing it fails the gate at the end of 39', () => { /* ... */ });
test('noGate keeps the match going past a failed gate', () => { /* ... */ });
test('story settlement sees coins before the round-end 10', () => { /* lane with 59 coins at the end of 31 → storyEnd funds */ });
test('team request: three nights at or under survivors × 8 pay each survivor one quest token; 49 of 48 resets', () => {
  // 6 seats, rounds 21-23 with 8 normal enemies each → after R23 end tokens +1, questTokens 1, ledger.tokens 4
  // a seat with Q already 20 gets nothing; three survivors → threshold 24
});
test('ssireum goes to one connected survivor chosen by the match econ stream; none → skipped', () => {
  // same seed twice → same seat; seat 2 disconnected is never chosen over seeds 1..50; lane rng.summon untouched
});
```

- [ ] **Step 2: 실행해서 실패 확인** — `npx vitest run packages/logic/test/match-stage3.test.ts` → FAIL
- [ ] **Step 3: 구현** (위 Interfaces와 규칙)
- [ ] **Step 4: 통과 확인** — 위 파일, `npx vitest run packages/logic/test/match-*.test.ts packages/sim/test/coop.test.ts`(2단계 매치 회귀), 전체, typecheck, golden
- [ ] **Step 5: 커밋** — 두 번에 나눈다: `feat(match): boss clocks for every boss round and four yeoksin gates in stage 3`, `feat(stage3): team request and ssireum draw`

---

### Task 7: 지게 도깨비 배달과 새 명령의 전송 형식

**Files:**
- Modify: `packages/logic/src/match/econ.ts`, `src/match/types.ts`, `src/match/step.ts`(`SEAT_COMMANDS`, 1단계 끝 만료 처리), `src/match/seats.ts`(`eliminate`·`disconnect`에서 제안 정리), `src/units.ts`(`move`·`sell`의 `locked`), `src/combine.ts`(잠긴 유닛 제외), `src/match/parse.ts`, `src/index.ts`
- Test: `packages/logic/test/match-transfer.test.ts`, `packages/logic/test/parse.test.ts`(시험 추가)

**읽을 것:** 초안 5장 전체. `src/match/parse.ts` 전체, `src/match/wire.ts`.

**Interfaces:**
- Consumes: `MatchEcon`(Task 6), `storySlots`(Task 4, 잠긴 유닛을 이미 건너뜀)
- Produces: `MatchCommand`에 `{ type: 'transferOffer'; target: number; slot: number; unitId: number }`, `{ type: 'transferAccept'; slot: number }`, `{ type: 'transferDecline' }`; `MatchEvent`에 `{ type: 'transferOffer'; from: number; to: number; defId: string; tick: number }`, `{ type: 'transferEnd'; from: number; to: number; outcome: 'accepted' | 'declined' | 'expired' | 'invalid' }`; `transferStep(match, ctx)`(만료·자격 상실 정리, 1단계 명령 처리 직전에 호출)
- Produces (parse.ts): `buy {item}`, `storyTarget {id, unitIds?}`(`id`는 문자열 1~32자 또는 null, `unitIds`는 정수 배열 길이 ≤ 3), `storyDecline {}`, `missionEnter {}`, `tame {enemyId}`, `transferOffer {target, slot, unitId}`, `transferAccept {slot}`, `transferDecline {}` 파서와 `toWire`의 같은 모양.

규칙:
- 제안: 보내는 고개 `econ.jige`가 없으면 `noJige`. 칸의 유닛 id가 `unitId`가 아니면 `staleUnit`. 유닛이 히든이거나 등급 > `maxGrade`거나 `delivered`이면 `badArgs`. 대상이 자기 자신·탈락·미접속이면 `targetNotAlive`. 두 시트 중 하나라도 열린 제안에 관여 중이면 `busy`. `match.round < readyRound[시트]`이면 `cooldown`. 통과하면 유닛 `locked = true`, `offers.push`, `transferOffer` 이벤트.
- 잠금: `move`는 출발·도착 칸 유닛 중 하나라도 잠겼으면 `locked`, `sell`도 `locked`. 조합 재료 계산과 결과 칸 후보, 설화 지불에서 잠긴 유닛을 뺀다. 공격은 그대로 한다.
- 만료: `tick ≥ offer.tick + toTicks(offerSeconds)`이면 `expired`(200틱째부터 만료, 199틱 수락은 유효). 어느 쪽이든 탈락·단절이면 `invalid`. 끝나면 잠금을 푼다.
- 수락(받는 쪽): 열린 제안이 없으면 `noOffer`. 칸이 비어 있지 않거나 닫혔으면 `noSlot`. 보내는 칸에 같은 id 유닛이 그대로인지 다시 본다(아니면 `invalid`로 끝내고 `staleUnit`). 성공하면 보내는 칸을 비우고 받는 칸에 `addUnit`(새 id), `cost`를 옮기고 `delivered = true`, 받는 고개 `summon` 이벤트. 두 시트 `readyRound = round + cooldownRounds`. 각 시트가 이 판에서 처음 성사한 배달이고 `rewarded.length < rewardCap`이면 묵 `reward`, `rewarded.push(seat)`, `questReward { quest: 'transfer' }`.
- 거절: 받는 쪽이나 보내는 쪽 누구든 `transferDecline` → `declined`. 관여 중인 제안이 없으면 `noOffer`.

- [ ] **Step 1: 실패하는 시험 작성**

```ts
test('offer needs a jige, a grade 1-4 normal unit and a connected living target', () => { /* noJige, badArgs (grade 5 / hidden / delivered), targetNotAlive */ });
test('an offered unit attacks but cannot move, be sold, be combined or pay a story request', () => {
  // move → locked; swap onto it → locked; sell → locked; combine using it as the only copy → missingMaterials;
  // storySlots skips it
});
test('accept at tick +199 moves the unit; +200 has already expired', () => { /* ... */ });
test('success moves cost and N, marks delivered, starts a 5-round cooldown on both seats and pays the first-delivery buckwheat', () => {
  // success at round 22 → next offer refused until round 27 (cooldown), allowed at 27
  // second success later pays nothing to either seat; total units and Σcost across lanes unchanged
});
test('five senders to one receiver in one tick open one offer; the rest are busy', () => { /* ... */ });
test('receiver eliminated or disconnected ends the offer as invalid and unlocks the unit', () => { /* ... */ });
test('team reward cap: no more than 6 transfer buckwheat in a match', () => { /* force rewarded length 6 → no pay */ });
// parse.test.ts
test('parses the new economy commands and rejects bad args', () => {
  expect(parseClientCommand({ seq: 1, type: 'buy', args: { item: 'jar' } })!.cmd).toEqual({ type: 'buy', item: 'jar' });
  expect(parseClientCommand({ seq: 2, type: 'buy', args: { item: 'gold' } })!.cmd).toEqual({ type: 'invalid' });
  expect(parseClientCommand({ seq: 3, type: 'storyTarget', args: { id: null } })!.cmd).toEqual({ type: 'storyTarget', id: null });
  expect(parseClientCommand({ seq: 4, type: 'transferOffer', args: { target: 2, slot: 3, unitId: 9 } })!.cmd)
    .toEqual({ type: 'transferOffer', target: 2, slot: 3, unitId: 9 });
  expect(parseClientCommand({ seq: 5, type: 'tame', args: { enemyId: 1.5 } })!.cmd).toEqual({ type: 'invalid' });
});
test('toWire round-trips every new command through parseClientCommand', () => { /* ... */ });
```

- [ ] **Step 2: 실행해서 실패 확인** — `npx vitest run packages/logic/test/match-transfer.test.ts packages/logic/test/parse.test.ts` → FAIL
- [ ] **Step 3: 구현** (위 Interfaces와 규칙)
- [ ] **Step 4: 통과 확인** — 위 두 파일, `npx vitest run packages/server`(서버 시험이 새 파서로도 통과하는지), 전체, typecheck, golden
- [ ] **Step 5: 커밋** — 두 번에 나눈다: `feat(stage3): jige transfer between lanes with locks and cooldown`, `feat(match): wire format for economy commands`

---

### Task 8: 시뮬레이터 봇의 장터·퀘스트·길들이기·배달 정책

**Files:**
- Create: `packages/sim/src/stage3/econBot.ts`, `src/stage3/econDriver.ts`
- Modify: `packages/sim/src/stage3/targetBot.ts`
- Test: `packages/sim/test/stage3-econ.test.ts`

**읽을 것:** 초안 3장 검사 문단의 "기본 비교군", 8장 첫 두 항목. `packages/sim/src/stage3/targetBot.ts`, `packages/sim/src/coop.ts`의 `CoopDriver`·`spiritSupport`.

**Interfaces:**
- Consumes: `marketView`, `tameCheck`, `storySlots`, `remainingNeed`·`expandTree`(targetBot.ts)
- Produces (`econBot.ts`):
  - `reserveCoins(state: GameState, target: string | null): number` — 트리의 5등급을 가졌으면 60, 아니면 0(기존 규칙)
  - `buckwheatNeed(state: GameState, target: string | null): number` — `min(2, 남은 5등급 조합 수) + (목표 미보유 ? 1 : 0)`
  - `marketCommands(state, target): Command[]` — 보따리는 장날 한도까지, `coins − price ≥ reserveCoins`이고 빈칸이 있을 때. 단지는 `buckwheat < buckwheatNeed`일 때만(초안 3장 기본 비교군), 같은 엽전 조건.
  - `questCommands(state, target, prevTarget): Command[]` — 목표가 바뀌면 `storyTarget`; 개인 미션 라운드 입장 창 안이고 `coins − fee ≥ reserveCoins`면 `missionEnter`; 수집 라운드에 아직 없는 수집 물건이 조합 가능하면 그 `combine`.
  - `tameCommands(state, target): Command[]` — 길들인 히든이 2기 미만일 때, `tameCheck`가 null인 적 중 비용이 묵이면 `buckwheat − 1 ≥ buckwheatNeed`, 엽전이면 `coins − 60 ≥ reserveCoins`, 불이면 `tokens ≥ 2`일 때만.
  - `switchBot(seed: number, policy: EconPolicy): Bot` — 라운드가 바뀔 때마다 아직 만들지 않은 일반 6등급마다 `remainingNeed`의 1등급 환산 남은 값을 계산해, 지금 목표보다 4 이상 작은 것이 있으면 그쪽으로 바꾼다(동점은 id 순).
  - `export interface EconPolicy { market: boolean; quests: boolean; tame: boolean }`
- Modify `targetBot(seed, opts: { targets?: string[]; policy?: EconPolicy })`: 정책이 켜진 것만 위 함수 결과를 명령 끝에 붙인다. `policy`가 있을 때만 `sellCandidate`가 트리 밖 유닛 중 `unitAttack` 상위 4기를 후보에서 뺀다(결정 16). `policy`가 없으면 지금 동작 그대로라서 기존 `stage3-sim.test.ts`가 그대로 통과한다. 봇은 `target`을 밖에서 읽을 수 있게 `currentTarget(): string | null`을 더한다.
- Produces (`econDriver.ts`): `class EconDriver { constructor(match: MatchState, bots: Bot[], opts: { transfer: boolean }); inputs(): MatchInput[] }` — 10틱마다 산 시트는 봇 명령, 넋은 `spiritSupport`. 배달이 켜졌으면 지게가 있는 시트가 다른 생존 시트 목표 트리에 모자라고 자기 트리에는 필요 없는 1~4등급 유닛을 가진 경우 그 시트로 `transferOffer`, 열린 제안의 받는 쪽은 빈칸이 있으면 `transferAccept`(가장 작은 빈 열린 칸).

- [ ] **Step 1: 실패하는 시험 작성**

```ts
test('market policy buys two bundles a day while coins stay above the reserve', () => { /* 200 coins, no tree 5 → two buy bundle; 100 coins with tree 5 → none */ });
test('jar is bought only when buckwheat is short of the next two grade-5s and the final combine', () => { /* need 3, have 2 → buy jar; have 3 → none */ });
test('quest policy sets the story target once per change and enters the mission when it can pay', () => { /* ... */ });
test('tame policy keeps buckwheat for the target and caps hidden units at two', () => { /* ... */ });
test('switch bot moves to a target at least 4 value cheaper and stays otherwise', () => { /* ... */ });
test('target bot with a policy never sells its four strongest non-tree units', () => { /* full board, all non-tree; sold slot not among top-4 attack */ });
test('driver offers a unit another seat lacks and the receiver accepts', () => { /* two-seat stage-3 match with jige forced on seat 1 */ });
```

- [ ] **Step 2: 실행해서 실패 확인** — `npx vitest run packages/sim/test/stage3-econ.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — 위 파일, `npx vitest run packages/sim`, typecheck, golden
- [ ] **Step 5: 커밋** — `feat(sim): economy policies for the stage 3 bots and a six-seat driver`

---

### Task 9: 매치 기반 첫 6등급 측정과 CLI 옵션

**Files:**
- Create: `packages/sim/src/stage3/econRun.ts`
- Modify: `packages/sim/src/stage3/cli.ts`, `src/stage3/report.ts`(필요한 표 함수)
- Test: `packages/sim/test/stage3-econ.test.ts`(시험 추가)

**읽을 것:** 초안 8장 전체, 6장 "마지막 전투에 쓸 돈". `packages/sim/src/stage3/grade6.ts`, `src/stage3/cli.ts`.

**Interfaces:**
- Produces:
  ```ts
  export interface EconConfig {
    name: string; bot: 'target' | 'switch'; noDefeat: boolean;
    market: boolean; quests: 0 | 2 | 4; story: boolean; tame: boolean; transfer: boolean;
  }
  export interface EconRow {
    seed: number; config: string; bot: string; seat: number; finished: boolean; teamOutcome: string; endRound: number;
    grade6AtFinal: number; grade6AtEnd: number; hidden: number;
    firstGrade6Round: number | null; firstSource: 'combine' | 'story' | null;
    storyOffers: number; storyAward: number;
    buckwheat9Round: number | null; buckwheat12Round: number | null; coins180Round: number | null; coins240Round: number | null;
    bundles: number; jars: number; questWins: string; tames: number; transfersSent: number; transfersReceived: number;
    sold: number; missingAtEnd: string; yeoksinKills: number;
  }
  export function questPair(seed: number): GeneralQuestId[]   // quests 2: six pairs of the four, cycled by (seed - 1) % 6
  export function configData(data: GameData, c: EconConfig, seed: number): GameData   // economyVariant per config
  export function econMatchRun(data: GameData, seed: number, c: EconConfig): { rows: EconRow[]; yeoksinSeconds: (number | null)[] }
  export function econSummary(rows: EconRow[]): { finishers: number; dist: number[]; share34: number; neverRate: number; median: number | null; p90: number | null; medianCount: number | null; pass: boolean }
  export function econMarkdown(rows: EconRow[], yeoksin: (number | null)[][]): string
  export const STANDARD_CONFIGS: EconConfig[]
  ```
- `econMatchRun`: `createMatch(configData(...), seed, [1..6], { noElimination: noDefeat, noGate: noDefeat })`, 모든 시트가 같은 봇 종류, `EconDriver`로 끝까지. `noDefeat`이면 보스 라운드 마감에 살아 있는 고개 보스를 보상 없이 뺀다(기존 grade6.ts와 같은 방식). 6등급은 히든을 빼고 센다. `grade6AtFinal`은 60R 시작 틱의 보유 수. 누적 묵·엽전 도달 라운드는 틱마다 늘어난 양만 더한 근사값(같은 틱 수입과 지출은 상쇄된다는 점을 문서에 적는다). `firstSource`는 그 6등급이 `storyEnd award`로 왔으면 `story`. `yeoksinSeconds[stage-1]`는 출현부터 격파까지 초(못 잡으면 null).
- `econSummary`: 판정 단위는 완주자(`finished`). `dist`는 `grade6AtFinal`의 0/1/2/3/4/5+ 개수. `pass` = `share34 ≥ 0.7 && neverRate ≤ 0.05 && 3 ≤ medianCount ≤ 4`(초안 8장 합격선).
- `STANDARD_CONFIGS`: 두 봇 각각 `base`(장터 끔·퀘스트 0·설화 끔·길들이기 끔·배달 끔), `market`(장터만), `quests4`(퀘스트 4·설화), `full`(장터·퀘스트 4·설화·길들이기·배달), `full-q2`(full에서 퀘스트 2). `noDefeat`은 CLI로 정한다.
- CLI: `npm run sim -- --stage 3 --check grade6 [--matrix on] [--bot target|switch|both] [--market on|off] [--quests 0|2|4] [--story on|off] [--tame on|off] [--transfer on|off] [--defeat on|off] [--seeds 20]`. `--matrix on`이면 `STANDARD_CONFIGS`, 아니면 플래그 하나로 만든 설정. 출력은 `sim-out/stage3/econ-<name>.csv`와 마크다운 표(설정별 완주자 수, 0~5+ 분포, 3~4기 비율, 미완성률, 첫 완성 중앙값·늦은 10%, 설화 수령률, 묵 9/12·엽전 180/240 도달 라운드 중앙값, 팀 클리어율, 판정)와 역신 관문별 처치 시간 중앙값(제한 시간 대비 %). 기존 단일 고개 측정은 `--check grade6-lane`으로 옮기고 `stripEconomy`한 데이터로 돌린다(1차 결과와 비교용).

- [ ] **Step 1: 실패하는 시험 작성**

```ts
test('questPair cycles the six pairs of four quests', () => {
  const pairs = [1, 2, 3, 4, 5, 6].map(s => questPair(s).join('+'));
  expect(new Set(pairs).size).toBe(6); expect(questPair(7)).toEqual(questPair(1));
});
test('configData switches sections off', () => { /* base → no market, no story, no mission..; full-q2 seed 1 → exactly two general quests */ });
test('econMatchRun is deterministic and counts only normal grade 6', () => {
  // full 60R run, seed 1, config full, noDefeat, run twice → identical rows;
  // grade6AtEnd equals the lane's non-hidden grade-6 count (hidden units excluded)
});
test('econSummary applies the pass line on finishers only', () => {
  // synthetic rows: 10 finishers, 7 at 3-4, 0 never, median 3 → pass; 6 at 3-4 → fail; non-finishers ignored
});
```

`econMatchRun` 결정성 시험이 10초를 넘으면 `test(..., 120_000)`으로 시간 제한을 준다.

- [ ] **Step 2: 실행해서 실패 확인** — `npx vitest run packages/sim/test/stage3-econ.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — 위 파일, `npm run sim -- --stage 3 --check grade6 --bot target --seeds 2`가 표를 찍는지, 전체, typecheck, golden
- [ ] **Step 5: 커밋** — `feat(sim): six-seat grade 6 measurement with market and quest switches`

---

### Task 10: 재측정과 결과 문서

**Files:**
- Create: `docs/balance/stage3-economy-pass.md`

**읽을 것:** `docs/balance/stage3-first-pass.md`(형식과 1차 값), 초안 6장 예산표와 8장.

- [ ] **Step 1: 측정 실행**
  - `npm run sim -- --stage 3 --check grade6 --matrix on --defeat off --seeds 20`
  - `npm run sim -- --stage 3 --check grade6 --matrix on --defeat on --seeds 20`
  - `npm run sim -- --stage 3 --check grade6-lane --seeds 20` (1차 측정 재현 확인: 1차 표와 같은 값이어야 한다. 다르면 원인을 문서에 적는다)
  - 한 줄의 실행 시간이 30분을 넘으면 `--matrix`를 `--seeds 10`으로 줄이고 `base`·`full` 두 설정만 20시드로 돌린다. 실제 시드 수를 문서에 적는다.
- [ ] **Step 2: `stage3-economy-pass.md` 작성** — 날짜·브랜치·명령, 넣은 것(경제 규칙과 데이터 위치, 결정 사항 1~3의 현재 값과 바꾸는 곳), 설정별 결과 표(위 마크다운 그대로), 장터 켬/끔·퀘스트 0/2/4 차이, 설화 수령률과 출처, 역신 관문 처치 시간(50~80% 밖이면 기본 HP 10% 조정 제안), 초안 6장 예산과 봇 실제 누적 묵·엽전 비교, 합격선 판정, 무엇이 막았나(부족 재료 ID 상위, 묵·엽전 도달 라운드), 후속 작업(화면 연결: 장터·설화·길들이기·배달 버튼과 `marketView`·`storyView`, `ClientView`의 네 관문 게이트, 쉬움 40R·보통 50R, 조합 이득 탈락 조합 조정, 임시 보스 체력·판매가·60R 웨이브 표, 열린 결정 세 가지의 첫 플레이 판단).
- [ ] **Step 3: 확인** — `npx vitest run`, `npm run typecheck`, golden PASS. 문서의 숫자가 이번 CSV(`sim-out/stage3/econ-*.csv`)와 맞는지 표 두 줄 이상을 직접 대조한다.
- [ ] **Step 4: 커밋** — `docs(balance): stage 3 economy pass with market and quests on and off`
