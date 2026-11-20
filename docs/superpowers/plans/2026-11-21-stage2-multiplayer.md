# 2단계 첫 6인 플레이판 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 친구가 보낸 링크로 들어와 1~6명이 한 방에서 각자 고개 하나를 맡아 20라운드를 치르는 「도깨비 랜덤 디펜스」 협동판과, 같은 규칙을 화면 없이 돌리는 6인 시뮬레이터를 만든다. 기존 1단계 1인판은 `/solo`에서 그대로 돈다.

**Architecture:** 판 규칙은 `packages/logic/src/match/`에 순수 함수로 둔다(`createMatch`, `stepMatch`). 고개 하나는 기존 `GameState`이고, 1단계 `step`의 조각(명령 처리, 등장, 전투, 처치)을 나눠 `stepMatch`가 고개마다 부른다. 서버(`packages/server`)는 Colyseus 방 하나가 판 하나를 맡고, 방 규칙은 전송과 무관한 `RoomCore` 클래스에 둔 뒤 얇은 Colyseus 어댑터로 감싼다. 전송은 Schema 없이 메시지 여섯 가지(+방 알림 하나)이고, 메시지를 만드는 함수와 적용하는 함수를 모두 logic에 두어 서버·브라우저·시험이 같은 코드를 쓴다. 브라우저는 온라인에서 전투를 돌리지 않고 서버 표시 상태를 `GameState` 모양으로 바꿔 기존 `LaneScene`과 패널에 넘긴다.

**Tech Stack:** Windows 11, Node 22.17, npm workspaces, TypeScript 5.8 strict, Vitest 3.2, Vite 6.3, Phaser 3.90.0, tsx 4, colyseus 0.18.12(서버), @colyseus/sdk 0.18.10(브라우저), @colyseus/testing 0.18.6(시험), express 5

**Spec:** `docs/design/2026-11-21-stage2-spec.md` (이하 "명세"). 11장 끝의 "결정" 절은 같은 내용의 앞 장보다 우선한다. 명세를 만든 검토는 `docs/design/stage2-spec-review-01.md`. 1단계 형식 기준은 `docs/superpowers/plans/2026-11-20-stage1-prototype.md`.

**실행자에게:** 각 Task는 서로 다른 구현자가 그 Task 본문만 보고 진행한다. 실행을 맡기는 쪽은 Task 본문과 함께 아래 Global Constraints를 반드시 같이 넘긴다. Task 안의 "읽을 것"에 적힌 파일은 앞 Task가 만든 실제 코드이므로 먼저 열어 본다.

## Global Constraints

- 1단계 진입점 `loadGameData()`, `createGame(data, seed)`, `step(state, commands)`의 반환 필드, 이벤트·거절 사유, 난수 소비 순서를 바꾸지 않는다. Task 1의 골든 시험 `npx vitest run packages/sim/test/golden.test.ts`가 모든 Task 뒤에 통과해야 한다.
- 모든 Task 끝에서 `npx vitest run`(전체)과 `npm run typecheck`가 통과해야 한다. 기존 시험의 기대값은 고치지 않는다. 예외는 Task 21이 데이터 값을 바꿀 때뿐이다.
- `packages/logic`은 `phaser`, DOM, `Math.random`, `Date`, `performance`, `crypto`를 쓰지 않는다. 난수는 `rng.ts` 흐름으로만 굴린다. 서버와 브라우저는 써도 된다.
- 1틱 = 50ms. 초→틱은 `toTicks(seconds)` = `Math.round(seconds * 20)`.
- 수치는 `packages/logic/data/*.json`(1단계)과 `packages/logic/data/stage2/*.json`(2단계 추가분)에만 둔다. 코드에 규칙 숫자를 박지 않는다.
- 패키지 버전 고정(캐럿 없이): `colyseus` `0.18.12`, `@colyseus/sdk` `0.18.10`, `@colyseus/testing` `0.18.6`. Node `>= 22`. `colyseus.js`는 쓰지 않는다.
- Colyseus Schema 상태를 쓰지 않는다. 모든 전송은 `client.send` / `room.send` 메시지다. `room.lock()`을 부르지 않는다. `maxClients = 12`. 판이 시작되면 `autoDispose = false`.
- 브라우저는 온라인에서 `GameDriver.update`나 `step`/`stepMatch`로 전투를 돌리지 않는다. 피해·소환·승패 계산은 서버의 `stepMatch` 한 곳에만 있다.
- 화면 문구는 자연스러운 한국어, 코드와 주석은 영어. 결정 11: 지금 문구 ‘뚝딱! (N번)’, ‘보너스까지 1등급 N번’을 유지한다.
- 이번 판에서 빼는 것(결정 7·8·9): 고개 보스 제어 효과 합산 상한, 소리와 첫 안내(`playSfx` 자리는 유지), 800×370 배치. 지게 양도·퀘스트·장터·길들이기·5·6등급·난이도·계정·랭킹·영구 저장도 넣지 않는다.
- 결정 4·5·6·10·12를 따른다: 생존자 전원 완주 즉시 `clear`, 보스당 멈춘 틱 합 3,600까지, 단절 중에도 보스는 예정대로 등장하고 남은 틱만 멈춤, 닉네임 비교는 영문 대소문자 무시(표시는 입력 그대로), 벼루는 실제 값 표기.
- 닉네임: 앞뒤 공백 제거 → NFC → `^[가-힣A-Za-z0-9]{1,8}$`.
- 커밋은 Task마다 한 번. `sim-out/`, `dist/`는 커밋하지 않는다.

## Review Focus

1. 백그라운드에 오래 둔 탭이 돌아오면 쌓인 `lane` 묶음 수백 개가 한꺼번에 도착한다. 화면은 상태를 모두 적용하되 공격 연출을 수백 개 재생하지 않고, 적 위치도 최신 틱에서 2틱 이전으로 바로 맞춘다. 시험은 Task 16에 있다.
2. 서버 이벤트 루프가 2초 멈췄다 풀리면 밀린 40틱을 한 번에 모두 돌리고(건너뛰지 않음), 갱신 번호를 20개 차례로 보낸다. 시험은 Task 12에 있다.
3. 조합·판매 키를 응답 전에 두 번 누르면 두 번째는 보내지 않는다(재료 칸이 흐려진 동안 같은 칸 명령 차단). 서버에 가도 비용이 두 번 빠지지 않는다. 시험은 Task 14와 Task 12에 있다.
4. 깨진 메시지(`null`, 문자열, `seq: 1.5`, `type: '__proto__'`, 문자열 칸 번호)가 와도 방이 멈추지 않고, seq가 올바르면 `badArgs`로만 거절된다. 시험은 Task 12에 있다.
5. 닉네임 입력창에서 한글 조합 중 Enter를 두 번 누르거나 버튼을 연타해도 입장 요청은 한 번만 나간다. 시험은 Task 15에 있다.

---

## 파일 구조

```
packages/logic/
  data/stage2/units.json recipes.json enemies.json balance.json coop.json   2단계 추가분 (Task 3)
  src/hash.ts                 정규 JSON과 해시 (Task 1)
  src/flow.ts combat.ts effects.ts stats.ts game.ts    1단계 조각 분리, shared 적 (Task 2)
  src/data.ts validate.ts types.ts                     stage2 로더·검증·타입 (Task 3)
  src/match/types.ts          판 상태·입력·이벤트 타입 (Task 5)
  src/match/schedule.ts       라운드 시작 틱 표 (Task 5)
  src/match/create.ts         createMatch, laneSeed, matchHash (Task 5)
  src/match/step.ts           stepMatch 틱 순서 (Task 5)
  src/match/seats.ts          탈락·단절·보스 시간·넋 지원·팀 결과 (Task 5 뼈대, Task 6 구현)
  src/match/yeoksin.ts        역신과 관문 (Task 5 뼈대, Task 7 구현)
  src/match/replay.ts         입력 기록 재생 (Task 8)
  src/match/wire.ts           전송 메시지 타입, 입장 오류 코드 (Task 9)
  src/match/parse.ts          클라이언트 명령 검사·변환 (Task 9)
  src/match/view.ts           full/tick/lane/mine 만들기와 적용 (Task 9)
  src/match/nickname.ts       닉네임 정규화 (Task 11)
  src/testing.ts              makeData(stage), jumpToTick, stepMatchUntil 추가
packages/sim/
  src/golden.ts scripts/write-golden.ts test/golden-stage1.json   (Task 1)
  src/coop.ts                 협동 실행·봇 입력·CSV (Task 8)
  src/bots.ts cli.ts          역신 추적, --stage 2 (Task 8)
packages/server/              새 패키지 (Task 10~13, 20)
  src/core/RoomCore.ts        방 규칙 (전송 무관)
  src/MatchRoom.ts            Colyseus 어댑터
  src/server.ts main.ts       서버 생성, 정적 파일, 실행
  scripts/load.ts             부하 측정
  test/helpers.ts colyseus-probe.test.ts lobby.test.ts server.test.ts match-room.test.ts rejoin.test.ts
packages/client/
  src/main.ts                 경로 분기 (Task 15)
  src/solo.ts                 기존 1인판 시작 코드 이동 (Task 15)
  src/driver.ts               Driver 인터페이스 추출 (Task 16)
  src/net/session.ts room.ts NetClient.ts predict.ts       (Task 14)
  src/net/NetDriver.ts viewState.ts                        (Task 16)
  src/online/app.ts entry.ts lobby.ts text.ts              (Task 15)
  src/online/battle.ts                                     (Task 16)
  src/online/models.ts panels.ts                           (Task 17)
  src/online/spirit.ts                                     (Task 18)
  src/online/result.ts                                     (Task 19)
docs/balance/stage2-tuning.md                              (Task 21)
```

---

## 체크포인트 1: 회귀 기준과 2단계 데이터 (Task 1~4)

### Task 1: 1단계 골든 해시

**Implementer:** sol

**Files:**
- Create: `packages/logic/src/hash.ts`
- Modify: `packages/logic/src/index.ts` (hash 다시 내보내기)
- Create: `packages/sim/src/golden.ts`, `packages/sim/scripts/write-golden.ts`, `packages/sim/test/golden-stage1.json`(스크립트가 생성)
- Modify: `packages/sim/package.json` (script `"golden": "tsx scripts/write-golden.ts"`), `packages/sim/tsconfig.json` (`include`에 `"scripts"` 추가)
- Test: `packages/sim/test/golden.test.ts`, `packages/logic/test/hash.test.ts`

**읽을 것:** 명세 1장 "회귀 기준", `packages/sim/src/runner.ts`(`runGame`의 10틱 결정 주기), `packages/sim/src/bots.ts`.

**Interfaces:**
- Consumes: logic `createGame`, `step`, `loadGameData`, `GameState`; sim `normalBot()`, `clumsyBot(seed)`
- Produces:
  - `canonicalJson(value: unknown, skip: ReadonlySet<string> = new Set(['data'])): string` — 객체 키를 정렬해 직렬화한다. `skip`에 든 키는 어느 깊이에서든 뺀다. `undefined` 값의 키는 뺀다(JSON과 같음)
  - `fnv1a(text: string): string` — FNV-1a 32비트, 소문자 16진 8자리
  - `stateHash(state: unknown): string` = `fnv1a(canonicalJson(state))`
  - `chainHash(prev: string, value: unknown): string` = `fnv1a(prev + canonicalJson(value))`
  - `goldenRun(data: GameData, seed: number, bot: 'normal' | 'clumsy'): { checkpoints: [number, string][]; events: string; final: string; ticks: number }`
    - `runGame`과 같은 주기로 돈다: `state.tick % 10 === 0`이면 `bot.decide(state)`, 아니면 `[]`. 봇은 `normal`이면 `normalBot()`, `clumsy`면 `clumsyBot(seed)`
    - `step` 결과마다 `events = chainHash(events, [r.events, r.rejected])` (처음 `''`)
    - `step` 뒤 `state.tick % 100 === 0`이면 `[state.tick, stateHash(state)]`를 쌓는다
    - `phase === 'ended'` 또는 200,000틱에서 멈추고 `final = stateHash(state)`, `ticks = state.tick`

- [ ] **Step 0: 작업 트리에 로직 변경이 없는지 확인한다**

Run: `git status --short packages/logic packages/sim`
Expected: 아무것도 출력되지 않는다. 출력이 있으면 멈추고 보고한다(명세 1장: 골든은 로직 변경을 모두 커밋한 상태에서 만든다).

- [ ] **Step 1: 실패하는 시험을 쓴다**

`packages/logic/test/hash.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { canonicalJson, chainHash, fnv1a, stateHash } from '../src/hash';

describe('hash', () => {
  test('canonical json sorts keys, drops skipped keys at any depth and undefined values', () => {
    expect(canonicalJson({ b: 1, a: { data: 5, c: [2, { z: 1, y: undefined }] }, data: 9 })).toBe('{"a":{"c":[2,{"z":1}]},"b":1}');
  });
  test('fnv1a is 8 hex chars and stable', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
  });
  test('stateHash ignores key order; chainHash depends on history', () => {
    expect(stateHash({ x: 1, y: 2 })).toBe(stateHash({ y: 2, x: 1 }));
    expect(chainHash(chainHash('', 1), 2)).not.toBe(chainHash(chainHash('', 2), 1));
  });
});
```

`packages/sim/test/golden.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { loadGameData } from '@dorandi/logic';
import { goldenRun } from '../src/golden';
import golden from './golden-stage1.json';

const data = loadGameData();

describe('stage 1 golden', () => {
  test('file covers normal and clumsy seeds 1-5', () => {
    expect(Object.keys(golden).sort()).toEqual(['clumsy:1', 'clumsy:2', 'clumsy:3', 'clumsy:4', 'clumsy:5', 'normal:1', 'normal:2', 'normal:3', 'normal:4', 'normal:5']);
  });
  for (const [key, expected] of Object.entries(golden)) {
    test(`${key} matches every 100-tick state hash and the full event hash`, () => {
      const [bot, seed] = key.split(':') as ['normal' | 'clumsy', string];
      expect(goldenRun(data, Number(seed), bot)).toEqual(expected);
    }, 60_000);
  }
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/logic/test/hash.test.ts packages/sim/test/golden.test.ts`
Expected: FAIL, `../src/hash`와 `./golden-stage1.json`을 찾지 못함

- [ ] **Step 3: `hash.ts`, `golden.ts`, `write-golden.ts`를 구현한다**

`write-golden.ts`는 normal·clumsy × 시드 1~5를 `goldenRun`으로 돌려 키 `"<bot>:<seed>"`의 객체를 `packages/sim/test/golden-stage1.json`에 2칸 들여쓰기로 쓴다.

- [ ] **Step 4: 골든 파일을 만든다**

Run: `npm run golden -w @dorandi/sim`
Expected: `packages/sim/test/golden-stage1.json`이 생기고 키 10개가 있다

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run && npm run typecheck`
Expected: 전체 PASS

- [ ] **Step 6: 커밋한다**

```bash
git add packages/logic/src/hash.ts packages/logic/src/index.ts packages/logic/test/hash.test.ts packages/sim
git commit -m "test: stage 1 golden hashes before stage 2 refactor"
```

---

### Task 2: 1단계 흐름 분해와 공용 적(shared)

**Implementer:** astra

**Files:**
- Modify: `packages/logic/src/types.ts` (`EnemyDef.shared?: boolean`)
- Modify: `packages/logic/src/flow.ts`, `packages/logic/src/stats.ts`, `packages/logic/src/combat.ts`, `packages/logic/src/effects.ts`, `packages/logic/src/game.ts`, `packages/logic/src/index.ts`
- Test: `packages/logic/test/shared-enemy.test.ts`

**읽을 것:** 명세 1장 "로직 경계", 3장 3번, `packages/logic/src/game.ts`·`flow.ts`·`combat.ts`·`effects.ts` 전체.

**Interfaces:**
- Consumes: Task 1 골든 시험
- Produces (`index.ts`에서 내보낸다):
  - `flow.ts`: `spawnDue(state, events): void`(지금 `spawnTick` 끝의 등장 부분), `payRoundEnd(state): void`(`endEnemies` 기록 + `coins += roundEnd`), `trackLimit(state): boolean`(`maxEnemies` 갱신, `overLimitTicks` 증감, `overLimitTicks >= toTicks(limitSeconds)`이면 true. phase 검사 없음). 기존 `startRound`, `spawnEnemy`, `moveEnemies`, `finishGame`, `enemySpeed`, `waveOf`, `toTicks`, `TICKS_PER_SECOND`, `enemyDefFast`도 내보낸다
  - `spawnTick`과 `checkEnd`는 위 조각을 지금과 같은 순서로 부르도록 다시 쓴다. `checkEnd`는 `phase !== 'round'`면 돌아가고, `trackLimit`이 true면 `finishGame(limit)`
  - `stats.ts`: `isShared(data: GameData, e: Enemy): boolean` — `GameData`별 `WeakMap<GameData, Set<string>>` 캐시로 `shared: true`인 적 id를 본다
  - `combat.ts`: `resolveKills(state, events, opts: { finalClear?: boolean } = {})` — `finalClear` 기본 true. shared 적이 죽으면 `kill` 이벤트만 내고 보상이 없다. `finalClear === false`면 20라운드 보스를 잡아도 `finishGame`을 부르지 않는다
  - `game.ts`: `applyCommand(state, cmd: Command, events): RejectReason | null`(지금 `step` 안의 핸들러 조회와 `'unknown'` 처리), `runAfterCommandHooks(state, events): void`, `runCombat(state, events, opts: { finalClear: boolean; afterMove?: () => void }): void` = `moveEnemies` → `afterMove?.()` → `tickStatuses` → `unitAttacks` → `resolveKills(state, events, { finalClear })`. `step`은 이 세 함수와 `spawnTick`, `checkEnd`로 다시 쓴다(순서 동일)
- shared 규칙(명세 3장 3번). 1단계 데이터에는 shared 적이 없으므로 1단계 동작은 바뀌지 않는다:
  - `countNormalEnemies`: `!e.boss && e.hp > 0 && !isShared(...)`
  - `spawnEnemy`: shared면 `hpSpawned`에 더하지 않는다
  - `dealDamage`: shared면 라운드 통계(`damageDealt`, `damageInRound`)에 더하지 않는다
  - `pickTarget`: 순위 = 보스 0, shared 1, 나머지 2. 같은 순위면 id가 작은 쪽
  - `applyStatus`: shared 대상에는 `stun`, `slow`, `knockback`을 걸지 않고 `speedChange` 이벤트도 내지 않는다. `vuln`, `dot`, 피해, 바닥 불길은 그대로
  - `moveEnemies`: shared 적은 움직이지 않는다

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
import { describe, expect, test } from 'vitest';
import { countNormalEnemies, createGame, loadGameData, pickTarget, step, type GameEvent } from '../src/index';
import { resolveKills, unitAttacks } from '../src/combat';
import { moveEnemies } from '../src/flow';
import { forceRound, makeData, placeUnitForTest, spawnEnemyForTest } from '../src/testing';

const shared = { id: 'testShared', name: '공용', boss: false, shared: true, hpMult: 1, speed: 2, resist: { physical: 0, magical: 0 } };
const data = makeData(d => { d.enemies.push(shared); });
const forced = makeData(d => {
  d.enemies.push(shared);
  for (const u of d.units) for (const s of u.skills) if (s.trigger.kind === 'chance') s.trigger.p = 1;
});
const quiet = (d = data) => { const s = createGame(d, 1); forceRound(s, 1); s.spawned = 30; s.roundEndTick = 1e9; s.enemies = []; return s; };

describe('shared enemy', () => {
  test('not counted, no reward, not in round stats', () => {
    const s = quiet(); placeUnitForTest(s, 'horong', 2);
    const e = spawnEnemyForTest(s, 'testShared', 3, 1);
    expect(countNormalEnemies(s)).toBe(0);
    const r = step(s, []);
    expect(r.events).toContainEqual({ type: 'kill', enemyId: e.id });
    expect(s).toMatchObject({ coins: 0, buckwheat: 0 });
    expect(s.stats.at(-1)).toMatchObject({ hpSpawned: 0, damageDealt: 0, damageInRound: 0 });
  });
  test('target priority: boss, then shared, then normal', () => {
    const s = quiet(); placeUnitForTest(s, 'horong', 2);
    spawnEnemyForTest(s, 'japgwi', 3, 1e9);
    const sh = spawnEnemyForTest(s, 'testShared', 3, 1e9);
    expect(pickTarget(s, 2)!.id).toBe(sh.id);
    const b = spawnEnemyForTest(s, 'jinegaksi', 3, 1e9);
    expect(pickTarget(s, 2)!.id).toBe(b.id);
  });
  test('ignores stun, slow and knockback; takes vuln and dot', () => {
    const s = quiet(forced);
    const e = spawnEnemyForTest(s, 'testShared', 3, 1e9);
    const events: GameEvent[] = [];
    for (const id of ['sotlid', 'meongseok', 'buchae', 'dadeumi', 'horong']) {
      placeUnitForTest(s, id, 2);
      unitAttacks(s, events);
    }
    expect(e).toMatchObject({ stunTicks: 0, slow: null, d: 3 });
    expect(Object.keys(e.vulns)).toEqual(['dadeumi']);
    expect(Object.keys(e.dots)).toEqual(['horong']);
    expect(events.some(x => x.type === 'speedChange' && x.enemyId === e.id)).toBe(false);
  });
  test('moveEnemies leaves shared enemies where they are', () => {
    const s = quiet(); const e = spawnEnemyForTest(s, 'testShared', 5, 1e9);
    moveEnemies(s); expect(e.d).toBe(5);
  });
  test('resolveKills with finalClear false does not end the game on the round-20 boss', () => {
    const s = createGame(loadGameData(), 1); forceRound(s, 20); step(s, []);
    const boss = s.enemies.find(x => x.boss)!; boss.hp = 0;
    const events: GameEvent[] = [];
    resolveKills(s, events, { finalClear: false });
    expect(s.result).toBeNull();
    expect(events).toContainEqual({ type: 'kill', enemyId: boss.id });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/logic/test/shared-enemy.test.ts`
Expected: FAIL (shared 적이 세어지고 보상이 나감, `resolveKills` 옵션 없음)

- [ ] **Step 3: 위 Interfaces대로 분해하고 shared 규칙을 넣는다**

객체 리터럴의 키 순서와 이벤트 내용, `nextFloat` 호출 순서를 그대로 둔다. `resolveKills`는 등록 단계 이름(`'resolveKills'`) 대신 `runCombat`에서 직접 부른다.

- [ ] **Step 4: 통과와 회귀를 확인한다**

Run: `npx vitest run && npm run typecheck`
Expected: 전체 PASS. 특히 `packages/sim/test/golden.test.ts` 10개가 그대로 통과한다. 골든이 깨지면 분해 순서를 되돌려 맞춘다(골든 파일을 다시 만들지 않는다)

- [ ] **Step 5: 커밋한다**

```bash
git add packages/logic
git commit -m "refactor(logic): split step into reusable pieces; shared enemies"
```

---

### Task 3: 2단계 데이터 40종, coop.json, 로더, 검증기

**Implementer:** sol

**Files:**
- Create: `packages/logic/data/stage2/units.json`, `recipes.json`, `enemies.json`, `balance.json`, `coop.json`
- Modify: `packages/logic/src/types.ts`, `packages/logic/src/data.ts`, `packages/logic/src/validate.ts`, `packages/logic/src/testing.ts`, `packages/logic/scripts/validate.ts`
- Test: `packages/logic/test/data-stage2.test.ts`

**읽을 것:** 명세 1장(데이터), 3장, 9장 전체, `packages/logic/data/units.json`(효과 표기 예), `packages/logic/src/types.ts`의 `Effect`.

**Interfaces:**
- Produces:
  - 타입(`types.ts`):
    ```ts
    export interface YeoksinStageDef { stage: 1 | 2; enemy: string; startRound: number; deadlineRound: number; baseHp: number; startIndex: number }
    export interface CoopDef {
      yeoksin: YeoksinStageDef[]; hpPerExtraPlayer: number; staySeconds: number;
      killReward: { coins: number; buckwheat: number }; topDamageBonus: number;
      support: { perRound: number; max: number; coins: number };
      disconnectSeconds: number; bossPauseCapSeconds: number; danger: number;
      maxCommandsPerTick: number; resultSeconds: number;
    }
    ```
    `GameData`에 `coop?: CoopDef`를 더한다(1단계 데이터에는 키가 없다).
  - `loadGameData(stage: 'stage1' | 'stage2' = 'stage1'): GameData` — `'stage2'`는 1단계 JSON에 `data/stage2/`를 더한다: `units`·`recipes`는 이어 붙인 뒤 등급(레시피는 결과 등급) 기준 안정 정렬(=명세 9장 표 순서), `enemies`는 이어 붙임, `balance`는 얕게 덮어쓰기, `coop` 추가. 매번 `structuredClone`
  - `recipeDemand(data: GameData, unitId: string): number` — 그 유닛을 재료로 쓰는 레시피 수(같은 레시피에 두 장이어도 1)
  - `makeData(patch, stage: 'stage1' | 'stage2' = 'stage1')` (`testing.ts`)
  - 검증기 오류 추가: 같은 유닛 id 중복, 1~3등급 수요 0(기존), 수요 7 초과. 경고 규칙은 그대로
  - `scripts/validate.ts`는 stage1과 stage2를 차례로 검사해 각각 `stage1 errors: N`, `stage2 errors: N`과 경고를 출력한다

**데이터 값**

`balance.json`: `{ "prepSeconds": 30 }`

`enemies.json`:
```json
[
  {"id": "yeoksin1", "name": "역신 첫째 탈", "boss": false, "shared": true, "hpMult": 1, "speed": 2, "resist": {"physical": 0, "magical": 0}},
  {"id": "yeoksin2", "name": "역신 둘째 탈", "boss": false, "shared": true, "hpMult": 1, "speed": 2, "resist": {"physical": 0, "magical": 0}}
]
```

`coop.json`:
```json
{
  "yeoksin": [
    {"stage": 1, "enemy": "yeoksin1", "startRound": 6, "deadlineRound": 9, "baseHp": 8000, "startIndex": 0},
    {"stage": 2, "enemy": "yeoksin2", "startRound": 15, "deadlineRound": 19, "baseHp": 30000, "startIndex": 1}
  ],
  "hpPerExtraPlayer": 0.1, "staySeconds": 12,
  "killReward": {"coins": 15, "buckwheat": 1}, "topDamageBonus": 10,
  "support": {"perRound": 1, "max": 1, "coins": 5},
  "disconnectSeconds": 180, "bossPauseCapSeconds": 180, "danger": 48,
  "maxCommandsPerTick": 20, "resultSeconds": 120
}
```

`units.json`·`recipes.json` (명세 9장 추가 18종, id는 콘텐츠 초안 v3). 표기는 1단계 `units.json`과 같다(`r`=radius, `L`=length, 배수 `×`=mult):

| id | 이름 | 등급 | 계열 | 사거리 | 간격 | 계수 | skills | 재료 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sseurebatgi | 쓰레받기 | 2 | physical | 2.0 | 0.9 | 0.94 | chance .25 → slow .25 1.5s r1.0 | bitjaru, ki |
| sut | 숯 | 2 | magical | 2.5 | 1.25 | 0.93 | chance .3 → dot ×1.4 2s | bujigaengi, buchae |
| dadeumitdol | 다듬잇돌 | 2 | physical | 2.0 | 1.25 | 1.02 | nth 3 → splash r0.8 ×0.75 | dadeumi, dadeumi |
| mumyeong | 무명 | 2 | magical | 3.0 | 1.15 | 0.82 | nth 4 → extraAttack | dadeumi, horong |
| hanji | 한지 | 2 | physical | 2.0 | 0.7 | 0.93 | chance .25 → knockback 0.75 | buchae, dadeumi |
| baneul | 바늘 | 3 | magical | 3.0 | 1.1 | 0.85 | nth 5 → pierce L3 ×1.25 | mumyeong, jipsin, horong |
| but | 붓 | 3 | magical | 3.0 | 1.2 | 0.78 | nth 4 → splash r1.5 ×1.15 | hanji, buchae, horong |
| gireumbyeong | 기름병 | 3 | physical | 1.5 | 0.85 | 0.97 | chance .3 → vuln .18 2.5s physical | gamasot, horong, sotlid |
| hamjibak | 함지박 | 3 | physical | 1.5 | 1.25 | 1.05 | nth 4 → crit ×2.1, stun 0.75 | jeolgu, sotlid, ki |
| bagaji | 바가지 | 3 | physical | 2.0 | 1.0 | 0.92 | nth 4 → pierce L1.5 ×0.75, knockback 1 | meongseok, sotlid, ki |
| golmu | 골무 | 4 | physical | 2.0 | 1.25 | 0.96 | nth 3 → splash r1.3 ×0.85, knockback 1.5 | baneul, mumyeong, dadeumitdol |
| tteongme | 떡메 | 4 | physical | 1.5 | 1.35 | 1.1 | nth 3 → crit ×2.35, splash r0.9 ×0.65 | hamjibak, gamasot, jeolgu |
| gawi | 가위 | 4 | physical | 2.0 | 1.15 | 1.02 | chance .25 → stun 1.1, vuln .14 3s physical | baneul, mumyeong, hwaro |
| sokuri | 소쿠리 | 4 | physical | 2.0 | 0.85 | 0.94 | chance .25 → splash r1.2 ×1.0, slow .26 2.5s r1.2 | hamjibak, jeolgu, meongseok |
| byeoru | 벼루 | 4 | magical | 2.5 | 1.15 | 0.88 | always → dot ×1.05 3s / nth 4 → knockback 1 | but, hanji, sut |
| ja | 자 | 4 | magical | 3.0 | 1.2 | 0.81 | nth 4 → pierce L2.5 ×1.3, dot ×0.7 2s | baneul, hanji, mumyeong |
| chaeban | 채반 | 4 | magical | 2.5 | 1.3 | 0.85 | nth 3 → crit ×1.85, slow .42 3s (radius 없음) | bagaji, gamasot, sseurebatgi |
| jumadeung | 주마등 | 4 | magical | 3.0 | 0.95 | 0.82 | nth 4 → extraAttack, vuln .18 3s magical | gireumbyeong, cheongsachorong, hanji |

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, recipeDemand, step, validateData } from '../src/index';
import { placeUnitForTest } from '../src/testing';

const d2 = loadGameData('stage2');
const G2 = ['gamasot', 'meongseok', 'jeolgu', 'hwaro', 'cheongsachorong', 'hwaetbul', 'sseurebatgi', 'sut', 'dadeumitdol', 'mumyeong', 'hanji'];

describe('stage 2 data', () => {
  test('40 units 8/11/9/12, 21 physical, 32 recipes, prep 30; stage 1 untouched', () => {
    expect([1, 2, 3, 4].map(g => d2.units.filter(u => u.grade === g).length)).toEqual([8, 11, 9, 12]);
    expect(d2.units.filter(u => u.damageType === 'physical').length).toBe(21);
    expect(d2.recipes.length).toBe(32);
    expect(d2.balance.prepSeconds).toBe(30);
    const d1 = loadGameData();
    expect([d1.units.length, d1.recipes.length, d1.balance.prepSeconds, d1.coop]).toEqual([22, 14, 20, undefined]);
  });
  test('table order: grouped by grade, stage 1 first within a grade', () => {
    expect(d2.units.filter(u => u.grade === 2).map(u => u.id)).toEqual(G2);
    expect(d2.recipes.slice(0, 11).map(r => r.result)).toEqual(G2);
    expect(d2.units.filter(u => u.grade === 4).map(u => u.id).slice(0, 5)).toEqual(['yeonjabangga', 'moru', 'onggigama', 'daljip', 'golmu']);
  });
  test('demand table from spec section 9', () => {
    const g1 = ['bitjaru', 'jipsin', 'sotlid', 'dadeumi', 'horong', 'bujigaengi', 'buchae', 'ki'];
    expect(g1.map(id => recipeDemand(d2, id))).toEqual([3, 4, 5, 5, 7, 4, 5, 6]);
    expect(G2.map(id => recipeDemand(d2, id))).toEqual([5, 3, 5, 4, 2, 3, 1, 1, 1, 4, 4]);
    const g3 = ['didilbangga', 'jangdok', 'pulmu', 'jwibul', 'baneul', 'but', 'gireumbyeong', 'hamjibak', 'bagaji'];
    expect(g3.map(id => recipeDemand(d2, id))).toEqual([1, 1, 1, 1, 3, 1, 1, 2, 1]);
  });
  test('spot values', () => {
    expect(d2.units.find(u => u.id === 'chaeban')).toMatchObject({ grade: 4, damageType: 'magical', range: 2.5, interval: 1.3, factor: 0.85,
      skills: [{ trigger: { kind: 'nth', n: 3 }, effects: [{ kind: 'crit', mult: 1.85 }, { kind: 'slow', pct: 0.42, seconds: 3 }] }] });
    expect(d2.recipes.find(r => r.result === 'dadeumitdol')!.materials).toEqual(['dadeumi', 'dadeumi']);
    expect(d2.enemies.find(e => e.id === 'yeoksin2')).toMatchObject({ shared: true, boss: false, speed: 2 });
    expect(d2.coop).toMatchObject({ hpPerExtraPlayer: 0.1, staySeconds: 12, topDamageBonus: 10, danger: 48,
      yeoksin: [{ stage: 1, startRound: 6, deadlineRound: 9, baseHp: 8000, startIndex: 0 }, { stage: 2, startRound: 15, deadlineRound: 19, baseHp: 30000, startIndex: 1 }] });
  });
  test('validator: stage 2 has no errors and only the sotlid warning; stage 1 still 4 warnings', () => {
    const r = validateData(d2);
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBe(1); expect(r.warnings[0]).toContain('sotlid');
    expect(validateData(loadGameData()).warnings.length).toBe(4);
  });
  test('validator catches duplicate ids and demand above 7', () => {
    const bad = loadGameData('stage2');
    bad.units.push({ ...bad.units[0]! });
    for (let i = 0; i < 2; i++) bad.recipes.push({ result: 'gamasot', materials: ['horong', 'bujigaengi'] });
    const r = validateData(bad);
    expect(r.errors.some(e => e.includes('duplicate') && e.includes('bitjaru'))).toBe(true);
    expect(r.errors.some(e => e.includes('horong') && e.includes('9'))).toBe(true);
  });
  test('dadeumitdol needs two dadeumi; result goes to the chosen slot; pity is placed when the combine frees a cell', () => {
    const s = createGame(d2, 1);
    placeUnitForTest(s, 'dadeumi', 4);
    expect(step(s, [{ type: 'combine', result: 'dadeumitdol', slot: 4 }]).rejected[0]!.reason).toBe('missingMaterials');
    placeUnitForTest(s, 'dadeumi', 9);
    expect(step(s, [{ type: 'combine', result: 'dadeumitdol', slot: 9 }]).rejected).toEqual([]);
    expect(s.slots[9]!.defId).toBe('dadeumitdol'); expect(s.slots[4]).toBeNull();
    const t = createGame(d2, 1);
    placeUnitForTest(t, 'bitjaru', 0);
    for (let i = 1; i < 18; i++) placeUnitForTest(t, 'ki', i);
    t.pendingPity.push('jipsin');
    step(t, [{ type: 'combine', result: 'sseurebatgi', slot: 0 }]);
    expect(t.slots[0]!.defId).toBe('sseurebatgi');
    expect(t.pendingPity).toEqual([]); expect(t.slots[17]!.defId).toBe('jipsin');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/logic/test/data-stage2.test.ts`
Expected: FAIL, `loadGameData('stage2')`가 1단계 데이터를 돌려주거나 `recipeDemand` 없음

- [ ] **Step 3: JSON 다섯 개, 타입, 로더, 검증기, `makeData` 인자를 구현한다**

중복 id 오류 문구에는 `duplicate`와 id를, 수요 초과 오류 문구에는 id와 수요 수를 넣는다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run && npm run typecheck && npm run validate`
Expected: PASS. validate는 `stage1 errors: 0`(경고 4)과 `stage2 errors: 0`(경고 1, sotlid)을 출력한다

- [ ] **Step 5: 커밋한다**

```bash
git add packages/logic
git commit -m "feat(logic): stage 2 data - 40 units, coop values, loader and validator"
```

---

### Task 4: 추가 18종 스킬 동작 시험

**Implementer:** sol

**Files:**
- Test: `packages/logic/test/stage2-units.test.ts`

**읽을 것:** 명세 9장(엔진 효과 열, 주변 피해·관통·반경 둔화·강타 규칙, 벼루), `packages/logic/src/effects.ts`의 `performAttack`.

**Interfaces:**
- Consumes: Task 3 `loadGameData('stage2')`, `makeData(patch, 'stage2')`; `forceRound`, `placeUnitForTest`, `spawnEnemyForTest`; `unitAttacks`(`../src/combat`)
- Produces: 시험만. 전투 엔진은 고치지 않는다(명세 9장). 시험이 실패하면 Task 3의 JSON이 틀린 것이므로 JSON을 고친다

배치: 유닛은 2번 칸(중심 (2.5, 0.5)). 적은 순서대로 `target` d=3 → (2.5,−0.5), `near` d=3.5(대상에서 0.5), `behind` d=2(대상 뒤 경로 1칸, 직선 1.0), `far` d=5(직선 2.0). 모두 체력 1e9. 확률 발동은 데이터에서 p=1로 바꾸고, n번째 발동은 `attackCount = n − 1`로 둔다. `unitAttacks` 한 번 뒤 관찰한다.

- [ ] **Step 1: 시험을 쓴다**

```ts
import { describe, expect, test } from 'vitest';
import { createGame, step, type Enemy, type GameEvent } from '../src/index';
import { unitAttacks } from '../src/combat';
import { forceRound, makeData, placeUnitForTest, spawnEnemyForTest } from '../src/testing';

const data = makeData(d => { for (const u of d.units) for (const s of u.skills) if (s.trigger.kind === 'chance') s.trigger.p = 1; }, 'stage2');

function attackOnce(id: string, nth = 0) {
  const s = createGame(data, 1); forceRound(s, 1); s.spawned = 30; s.enemies = [];
  const unit = placeUnitForTest(s, id, 2);
  if (nth) unit.attackCount = nth - 1;
  const [target, near, behind, far] = [3, 3.5, 2, 5].map(d => spawnEnemyForTest(s, 'japgwi', d, 1e9)) as [Enemy, Enemy, Enemy, Enemy];
  const events: GameEvent[] = [];
  unitAttacks(s, events);
  const dmg = (e: Enemy) => events.flatMap(x => (x.type === 'damage' && x.enemyId === e.id ? [x.amount] : []));
  return { s, target, near, behind, far, events, dmg };
}
const slow = (pct: number, ticks: number) => ({ pct, ticks });

describe('stage 2 units fire their spec effects', () => {
  test('sseurebatgi: 22, slow 25% 1.5s on target and everything within 1.0', () => {
    const r = attackOnce('sseurebatgi');
    expect(r.dmg(r.target)).toEqual([22]);
    for (const e of [r.target, r.near, r.behind]) expect(e.slow).toEqual(slow(0.25, 30));
    expect(r.far.slow).toBeNull();
  });
  test('sut: 30 and a 2s dot worth 140%', () => {
    const r = attackOnce('sut');
    expect(r.dmg(r.target)).toEqual([30]);
    expect(r.target.dots.sut).toEqual({ remaining: 42, pulsesLeft: 4, nextPulse: r.s.tick + 10 });
  });
  test('dadeumitdol 3rd attack: 33, splash 25 within 0.8 only', () => {
    const r = attackOnce('dadeumitdol', 3);
    expect([r.dmg(r.target), r.dmg(r.near), r.dmg(r.behind)]).toEqual([[33], [25], []]);
  });
  test('mumyeong 4th attack: two hits of 25', () => {
    const r = attackOnce('mumyeong', 4);
    expect(r.dmg(r.target)).toEqual([25, 25]);
  });
  test('hanji: 17 and knockback 0.75', () => {
    const r = attackOnce('hanji');
    expect(r.dmg(r.target)).toEqual([17]); expect(r.target.d).toBeCloseTo(2.25, 9);
  });
  test('baneul 5th attack: 63, pierce 79 behind only', () => {
    const r = attackOnce('baneul', 5);
    expect([r.dmg(r.target), r.dmg(r.behind), r.dmg(r.near), r.dmg(r.far)]).toEqual([[63], [79], [], []]);
  });
  test('but 4th attack: 63, splash 73 within 1.5', () => {
    const r = attackOnce('but', 4);
    expect([r.dmg(r.target), r.dmg(r.near), r.dmg(r.behind), r.dmg(r.far)]).toEqual([[63], [73], [73], []]);
  });
  test('gireumbyeong: 56, physical vuln 18% 2.5s', () => {
    const r = attackOnce('gireumbyeong');
    expect(r.dmg(r.target)).toEqual([56]);
    expect(r.target.vulns.gireumbyeong).toEqual({ pct: 0.18, damageType: 'physical', ticks: 50, stacks: 1 });
  });
  test('hamjibak 4th attack: crit 186 and stun 0.75s', () => {
    const r = attackOnce('hamjibak', 4);
    expect(r.events).toContainEqual({ type: 'damage', enemyId: r.target.id, amount: 186, source: 'hamjibak', effect: 'crit' });
    expect(r.target.stunTicks).toBe(15);
  });
  test('bagaji 4th attack: 62, pierce 47 behind, knockback 1', () => {
    const r = attackOnce('bagaji', 4);
    expect([r.dmg(r.target), r.dmg(r.behind)]).toEqual([[62], [47]]); expect(r.target.d).toBeCloseTo(2, 9);
  });
  test('golmu 3rd attack: 211, splash 179 within 1.3, knockback 1.5', () => {
    const r = attackOnce('golmu', 3);
    expect([r.dmg(r.target), r.dmg(r.near), r.dmg(r.behind), r.dmg(r.far)]).toEqual([[211], [179], [179], []]);
    expect(r.target.d).toBeCloseTo(1.5, 9);
  });
  test('tteongme 3rd attack: crit 613, splash 170 within 0.9', () => {
    const r = attackOnce('tteongme', 3);
    expect([r.dmg(r.target), r.dmg(r.near), r.dmg(r.behind)]).toEqual([[613], [170], []]);
  });
  test('gawi: 206, stun 1.1s, physical vuln 14% 3s', () => {
    const r = attackOnce('gawi');
    expect(r.dmg(r.target)).toEqual([206]); expect(r.target.stunTicks).toBe(22);
    expect(r.target.vulns.gawi).toEqual({ pct: 0.14, damageType: 'physical', ticks: 60, stacks: 1 });
  });
  test('sokuri: 140 and splash 140 within 1.2, slow 26% 2.5s within 1.2 including the target', () => {
    const r = attackOnce('sokuri');
    expect([r.dmg(r.target), r.dmg(r.near), r.dmg(r.behind), r.dmg(r.far)]).toEqual([[140], [140], [140], []]);
    for (const e of [r.target, r.near, r.behind]) expect(e.slow).toEqual(slow(0.26, 50));
  });
  test('byeoru 4th attack: 178, 3s dot worth 105%, knockback 1', () => {
    const r = attackOnce('byeoru', 4);
    expect(r.dmg(r.target)).toEqual([178]);
    expect(r.target.dots.byeoru).toEqual({ remaining: 187, pulsesLeft: 6, nextPulse: r.s.tick + 10 });
    expect(r.target.d).toBeCloseTo(2, 9);
  });
  test('ja 4th attack: 171, pierce 222 behind, 2s dot worth 70%', () => {
    const r = attackOnce('ja', 4);
    expect([r.dmg(r.target), r.dmg(r.behind)]).toEqual([[171], [222]]);
    expect(r.target.dots.ja).toEqual({ remaining: 120, pulsesLeft: 4, nextPulse: r.s.tick + 10 });
  });
  test('chaeban 3rd attack: one damage event at 1.85x and slow 42% 3s on the target only', () => {
    const r = attackOnce('chaeban', 3);
    expect(r.events.filter(x => x.type === 'damage')).toEqual([{ type: 'damage', enemyId: r.target.id, amount: 359, source: 'chaeban', effect: 'crit' }]);
    expect(r.target.slow).toEqual(slow(0.42, 60)); expect(r.near.slow).toBeNull();
  });
  test('jumadeung 4th attack: two hits of 137, magical vuln 18% 3s', () => {
    const r = attackOnce('jumadeung', 4);
    expect(r.dmg(r.target)).toEqual([137, 137]);
    expect(r.target.vulns.jumadeung).toEqual({ pct: 0.18, damageType: 'magical', ticks: 60, stacks: 1 });
  });
  test('byeoru dot is replaced on every attack, so 2 of its 6 pulses land per attack', () => {
    const s = createGame(data, 1); forceRound(s, 1); s.spawned = 30; s.roundEndTick = 1e9; s.enemies = [];
    placeUnitForTest(s, 'byeoru', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 1e9); e.stunTicks = 1e6;
    let attacks = 0; let pulses = 0;
    for (let i = 0; i < 115; i++) for (const x of step(s, []).events) {
      if (x.type === 'attack') attacks++;
      if (x.type === 'damage' && x.source === 'byeoru' && x.amount < 100) pulses++;
    }
    expect(attacks).toBe(5); expect(pulses).toBe(10);
  });
});
```

- [ ] **Step 2: 실행한다**

Run: `npx vitest run packages/logic/test/stage2-units.test.ts`
Expected: PASS. 실패하면 해당 유닛의 `data/stage2/units.json` 항목을 명세 9장과 대조해 고친다. 엔진(`effects.ts`, `combat.ts`)은 고치지 않는다

- [ ] **Step 3: 전체 확인**

Run: `npx vitest run && npm run typecheck`
Expected: PASS

- [ ] **Step 4: 커밋한다**

```bash
git add packages/logic
git commit -m "test(logic): behaviour of the 18 stage 2 units"
```

**체크포인트 1 리뷰:** 골든 10개가 Task 2 뒤에도 같은 값인지, 1단계 진입점 시그니처가 그대로인지, stage2 데이터가 명세 9장 표와 수요표에 맞는지 본다.

---

## 체크포인트 2: 협동 판 로직 (Task 5~8)

### Task 5: MatchState, createMatch, stepMatch 기본 흐름

**Implementer:** astra

**Files:**
- Create: `packages/logic/src/match/types.ts`, `schedule.ts`, `create.ts`, `step.ts`, `seats.ts`(뼈대), `yeoksin.ts`(뼈대)
- Modify: `packages/logic/src/types.ts` (`Command`, `RejectReason`), `packages/logic/src/index.ts`, `packages/logic/src/testing.ts`
- Test: `packages/logic/test/match-flow.test.ts`

**읽을 것:** 명세 1장, 2장, 4장(틱 1~5단계), 6장 "명령" 표와 거절 사유. Task 2가 만든 `applyCommand`, `runAfterCommandHooks`, `runCombat`, `spawnDue`, `startRound`, `trackLimit`. Task 1 `canonicalJson`, `fnv1a`.

**Interfaces:**
- Consumes: Task 2 `applyCommand(state, cmd, events)`, `runAfterCommandHooks(state, events)`, `runCombat(state, events, { finalClear, afterMove })`, `startRound(state, round, events)`, `spawnDue(state, events)`, `trackLimit(state): boolean`, `countNormalEnemies`, `currentStats`, `waveOf`, `toTicks`, `isShared`. Task 3 `loadGameData('stage2')`, `GameData.coop`. Task 1 `canonicalJson`, `fnv1a`. `createGame`, `deriveSeed`, `unitDefFast`
- `types.ts` 변경: `Command`의 `move`에 `unitId?: number; toUnitId?: number | null`, `sell`과 `combine`에 `unitId?: number`. `RejectReason`에 `'notAlive' | 'notSpirit' | 'noSupportToken' | 'targetNotAlive' | 'targetAlreadyReceived' | 'staleUnit' | 'badArgs'`를 더한다
- Produces (`match/types.ts`, `index.ts`에서 내보낸다):
  ```ts
  export type EliminationCause = 'limit' | 'boss' | 'forfeit' | 'disconnect';
  export type BossStatus = 'pending' | 'fighting' | 'killed' | 'failed';
  export interface BossClock { status: BossStatus; ticksLeft: number; pausedTicks: number; enemyId: number | null }
  export interface SeatRecord { round: number; cause: EliminationCause | null; tick: number | null; lastEnemies: number; maxEnemies: number; series: number[]; helperOpens: number }
  export interface SeatState {
    seat: number; alive: boolean; connected: boolean; disconnectTick: number | null;
    bosses: { 10: BossClock; 20: BossClock };
    supportTokens: number; receivedThisRound: boolean; supportSent: number; supportReceived: number;
    bestUnit: { defId: string; grade: number } | null; record: SeatRecord | null;
    yeoksinDamage: number[];   // [stage 1, stage 2]
    lastSeq: number;
  }
  export interface YeoksinState { stage: number; enemy: Enemy; seat: number | null; enterTick: number }
  export type TeamOutcome = 'clear' | 'wipe' | 'gate';
  export type SeatOutcome = 'finished' | 'eliminated' | 'unfinished' | 'aliveTeamLoss';
  export interface SeatResult { seat: number; outcome: SeatOutcome; cause: EliminationCause | null; round: number; lastEnemies: number; maxEnemies: number; series: number[]; bestUnit: { defId: string; grade: number } | null; yeoksinDamage: number; helperOpens: number }
  export interface MatchResult { outcome: TeamOutcome; tick: number; round: number; yeoksinKills: number; started: number; alive: number; seats: SeatResult[] }
  export interface MatchOptions { noElimination?: boolean }
  export interface MatchState {
    data: GameData; dataVersion: string; seed: number; ring: number[];
    tick: number; phase: 'prep' | 'round' | 'ended'; round: number; roundStartTick: number; roundEndTick: number;
    lanes: Record<number, GameState>; seats: Record<number, SeatState>;
    yeoksin: YeoksinState | null; yeoksinKills: number; result: MatchResult | null; options: MatchOptions;
  }
  export type MatchCommand = Command | { type: 'support'; target: number } | { type: 'forfeit' } | { type: 'disconnect' } | { type: 'reconnect' } | { type: 'invalid' };
  export interface MatchInput { seat: number; seq: number; cmd: MatchCommand }
  export type Ack = { seat: number; seq: number; tick: number; ok: true } | { seat: number; seq: number; tick: number; ok: false; reason: RejectReason };
  export type MatchEvent =
    | { type: 'roundStart'; round: number }
    | { type: 'eliminated'; seat: number; cause: EliminationCause; round: number }
    | { type: 'disconnected'; seat: number } | { type: 'reconnected'; seat: number; alive: boolean }
    | { type: 'support'; from: number; to: number; coins: number }
    | { type: 'bossSpawn'; seat: number; round: 10 | 20; enemyId: number } | { type: 'bossKilled'; seat: number; round: 10 | 20 }
    | { type: 'yeoksinSpawn'; stage: number; maxHp: number }
    | { type: 'yeoksinEnter'; stage: number; seat: number; from: number | null; enterTick: number; hp: number; maxHp: number }
    | { type: 'yeoksinLeave'; stage: number; seat: number }
    | { type: 'yeoksinKilled'; stage: number; seat: number; topSeat: number | null }
    | { type: 'ended'; result: MatchResult };
  export interface LaneStep { events: GameEvent[]; combatStart: number; newFires: GroundFire[] }
  export interface StepMatchResult { tick: number; acks: Ack[]; lanes: Record<number, LaneStep>; events: MatchEvent[] }
  ```
  - `roundStartTick(data, round: number): number` — 1라운드 = `toTicks(prepSeconds)`, 다음 라운드 = 앞 시작 + `toTicks(boss ? bossRoundSeconds : roundSeconds)`. `round = rounds + 1`이면 판 끝 틱(18,000)
  - `laneSeed(seed: number, seat: number): number` — 자리 1은 `seed`, 나머지는 `deriveSeed(seed, 'pass:' + seat)`
  - `createMatch(data, seed, seats: number[], options: MatchOptions = {}): MatchState` — `data.coop`가 없거나, 자리가 비었거나, 1~6 정수가 아니거나, 중복이면 throw. `ring`은 오름차순. 고개는 `createGame(data, laneSeed(seed, seat))`. 자리 상태 초기값: `alive true, connected true, disconnectTick null`, 두 보스 `{ status: 'pending', ticksLeft: 0, pausedTicks: 0, enemyId: null }`, 토큰 0, `yeoksinDamage [0, 0]`, `lastSeq 0`. `dataVersion = fnv1a(canonicalJson(data, new Set()))`, `tick 0, phase 'prep', round 0, roundStartTick 0, roundEndTick = roundStartTick(data, 1)`
  - `matchHash(match): string` = `fnv1a(canonicalJson(match))` (모든 깊이의 `data` 제외, 두 난수 포함)
  - `stepMatch(match, inputs: MatchInput[]): StepMatchResult`
  - `testing.ts`: `jumpToTick(match, tick: number): void`, `stepMatchUntil(match, tick: number, opts?: { inputs?: (tick: number) => MatchInput[]; clearEnemies?: boolean }): StepMatchResult[]`
- 뼈대 함수(이 Task는 아래 시그니처로 빈 동작만 만든다. Task 6·7이 채운다):
  - `seats.ts`: `expireDisconnects(match, ctx: StepMatchResult): void`, `applySeatCommand(match, input: MatchInput, ctx): RejectReason | null`(지금은 `'unknown'`), `seatsOnRoundStart(match): void`, `onBossSpawned(match, seat: number, round: 10 | 20, enemyId: number, ctx): void`, `seatsAfterLane(match, seat: number, ctx): void`, `judgeSeats(match, overLimit: number[], ctx): void`, `decideResult(match, ctx): void`
  - `yeoksin.ts`: `yeoksinStep2(match, ctx): void`, `yeoksinPosition(match, seat: number): void`, `yeoksinAfterLane(match, seat: number, ctx): void`, `gateFailed(match, tick: number): boolean`(지금은 false)

**`stepMatch` 순서** (t = `match.tick`. 명세 4장):

0. `match.result`가 있으면 seq > 0인 입력마다 `{ok:false, reason:'ended'}` ack만 돌려주고 틱을 올리지 않는다.
1. 생존 고개마다 `tick = t`, `phase/round/roundStartTick/roundEndTick` = 판 값, `result = null`로 덮어쓴다. `expireDisconnects`. 입력을 받은 순서대로:
   - `ring`에 없는 자리는 무시(ack 없음)
   - `seq > 0`이고 `seq <= lastSeq`면 무시(ack 없음, 실행 안 함). `seq > 0`이면 `lastSeq = seq`. `seq === 0`은 서버가 만든 입력이며 ack가 없다
   - `support/forfeit/disconnect/reconnect` → `applySeatCommand`. `invalid` → `'badArgs'`
   - 그 밖(1단계 명령): 탈락 자리면 `'notAlive'`. `move`는 `unitId`가 있고 `from`이 0~23 정수일 때 `slots[from]?.id !== unitId`면 `'staleUnit'`, `toUnitId`가 있고 `to`가 0~23 정수일 때 `(slots[to]?.id ?? null) !== toUnitId`면 `'staleUnit'`. `sell`/`combine`(slot 있음)은 `unitId`가 있고 `slots[slot]?.id !== unitId`면 `'staleUnit'`. 통과하면 `applyCommand(lane, cmd, laneEvents)`
   - seq > 0이면 ack를 쌓는다(`tick: t`)
   - 끝에 생존 고개마다 `runAfterCommandHooks`
2. `match.round < rounds`이고 `t === roundStartTick(data, match.round + 1)`이면 라운드를 연다: 판 `phase 'round'`, `round`, `roundStartTick`, `roundEndTick = roundStartTick(round + 1)`, `seatsOnRoundStart`, 생존 고개마다 `startRound(lane, round, events)`, `roundStart` 판 이벤트. 이어서 `phase === 'round'`면 생존 고개 번호순으로 `spawnDue`. 보스 라운드에서 이 틱에 보스가 나왔으면 `onBossSpawned(match, seat, round, 보스 id, ctx)`. 그다음 `yeoksinStep2`
3. 생존 고개 번호순: `combatStart = events.length`, `runCombat(lane, events, { finalClear: false, afterMove: () => yeoksinPosition(match, seat) })`. 전투 전후 `lane.fires`를 객체 동일성으로 비교해 새 불길을 `newFires`에. 고개 이벤트의 `summon`/`combine` 중 등급이 지금 `bestUnit`보다 높으면 갱신(같으면 먼저 것 유지). `seatsAfterLane`, `yeoksinAfterLane`
4. 생존 고개마다 `trackLimit(lane)`이 true인 자리를 모은다. `phase === 'round'`이고 `t === roundEndTick − 1`이면 `currentStats(lane).endEnemies = countNormalEnemies(lane)`. `judgeSeats(match, 모은 자리, ctx)`
5. `phase === 'round'`이고 `t === roundEndTick − 1`이면 생존 고개마다 `coins += balance.coins.roundEnd`. `decideResult(match, ctx)`. `match.tick += 1`

`ctx.lanes`에는 그 틱에 처리한 고개(1단계 시작 때 생존)만 들어 있다. 판이 끝나면 `phase = 'ended'`(Task 6이 넣는다).

**`jumpToTick(match, tick)`**: `tick >= 600`. `r` = `tick − 1`이 속한 라운드. 판의 `tick = tick`, `phase 'round'`, `round r`, `roundStartTick(r)`, `roundEndTick = roundStartTick(r + 1)`. 생존 고개마다 `enemies = []`, `fires = []`, `overLimitTicks = 0`, 같은 시각 값, `spawned` = 보스 라운드면 1, 아니면 `spawnCount`. 마지막 `stats` 줄의 라운드가 `r`이 아니면 `{ round: r, hpSpawned: 0, damageDealt: 0, damageInRound: 0, maxEnemies: 0, endEnemies: 0, bossKillSeconds: null }`를 넣는다. `match.yeoksinKills`를 마감 틱(`roundStartTick(deadlineRound + 1) − 1`)이 `tick`보다 앞선 관문 수로 둔다. 다음 `stepMatch`가 `tick`을 처리한다(경계면 라운드를 연다).

**`stepMatchUntil(match, tick, opts)`**: `match.tick < tick`이고 `match.result === null`인 동안 `stepMatch(match, opts.inputs?.(match.tick) ?? [])`. `clearEnemies`면 매 스텝 전에 생존 고개의 `enemies`에서 보스도 shared도 아닌 적을 지운다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
import { describe, expect, test } from 'vitest';
import { createGame, createMatch, deriveSeed, laneSeed, loadGameData, matchHash, roundStartTick, stepMatch, type MatchInput } from '../src/index';
import { placeUnitForTest, stepMatchUntil } from '../src/testing';

const data = loadGameData('stage2');
const summon = (seat: number, seq: number): MatchInput => ({ seat, seq, cmd: { type: 'summon' } });

describe('match flow', () => {
  test('schedule', () => {
    expect([1, 2, 6, 10, 11, 15, 20, 21].map(r => roundStartTick(data, r))).toEqual([600, 1400, 4600, 7800, 9300, 12500, 16500, 18000]);
  });
  test('lanes only for given seats; seat 1 keeps the base seed, others pass:<seat>', () => {
    const m = createMatch(data, 77, [3, 1, 5]);
    expect(m.ring).toEqual([1, 3, 5]);
    expect(Object.keys(m.lanes).map(Number)).toEqual([1, 3, 5]);
    expect(m.lanes[1]!.rng).toEqual(createGame(data, 77).rng);
    expect(m.lanes[3]!.rng).toEqual(createGame(data, deriveSeed(77, 'pass:3')).rng);
    expect(laneSeed(77, 1)).toBe(77);
    const n = createMatch(data, 77, [2, 3]);
    expect(Object.values(n.lanes).some(l => JSON.stringify(l.rng) === JSON.stringify(createGame(data, 77).rng))).toBe(false);
  });
  test('rejects bad seat lists and stage 1 data', () => {
    for (const seats of [[], [1, 1], [7], [0], [1.5]]) expect(() => createMatch(data, 1, seats)).toThrow();
    expect(() => createMatch(loadGameData(), 1, [1])).toThrow();
  });
  test.each([[[1]], [[1, 2]], [[1, 2, 3, 4, 5, 6]]])('boundaries, 30 spawns and round-end coins for seats %j', seats => {
    const m = createMatch(data, 5, seats);
    stepMatchUntil(m, 600);
    for (const s of seats) expect(m.lanes[s]).toMatchObject({ phase: 'prep', round: 0, tokens: 4, coins: 0 });
    stepMatch(m, []);
    for (const s of seats) {
      expect(m.lanes[s]).toMatchObject({ tick: 600, phase: 'round', round: 1, roundStartTick: 600, roundEndTick: 1400, tokens: 6, result: null });
      expect(m.lanes[s]!.enemies.map(e => e.id)).toEqual([1]);
    }
    stepMatchUntil(m, 1064);
    for (const s of seats) expect(m.lanes[s]!.enemies.length).toBe(29);
    stepMatch(m, []);
    stepMatchUntil(m, 1399);
    for (const s of seats) { expect(m.lanes[s]!.coins).toBe(0); expect(m.lanes[s]!.enemies.length).toBe(30); }
    stepMatch(m, []);
    for (const s of seats) { expect(m.lanes[s]!.coins).toBe(10); expect(m.lanes[s]!.stats[0]!.endEnemies).toBe(30); }
    stepMatch(m, []);
    for (const s of seats) expect(m.lanes[s]).toMatchObject({ round: 2, tokens: 8, coins: 10 });
  });
  test('lane time fields are overwritten at the start of each tick', () => {
    const m = createMatch(data, 1, [1]);
    m.lanes[1]!.tick = 999; m.lanes[1]!.round = 7;
    stepMatch(m, []);
    expect(m.lanes[1]).toMatchObject({ tick: 0, round: 0, phase: 'prep', result: null });
    expect(m.tick).toBe(1);
  });
  test('a summon in one lane leaves the other lane\'s summon stream alone', () => {
    const a = createMatch(data, 9, [1, 2]); const b = createMatch(data, 9, [1, 2]);
    stepMatch(a, [summon(1, 1), summon(1, 2)]); stepMatch(b, []);
    expect(a.lanes[2]!.rng).toEqual(b.lanes[2]!.rng);
    stepMatch(a, [summon(2, 1)]); stepMatch(b, [summon(2, 1)]);
    expect(a.lanes[2]!.slots.map(u => u?.defId ?? null)).toEqual(b.lanes[2]!.slots.map(u => u?.defId ?? null));
  });
  test('acks, duplicate seq, stale unit ids, invalid input, unknown seat', () => {
    const m = createMatch(data, 3, [1, 2]);
    const u = placeUnitForTest(m.lanes[1]!, 'sotlid', 0);
    let r = stepMatch(m, [
      summon(1, 1), summon(1, 1),
      { seat: 1, seq: 2, cmd: { type: 'sell', slot: 0, unitId: u.id + 100 } },
      { seat: 1, seq: 3, cmd: { type: 'move', from: 0, to: 5, unitId: u.id, toUnitId: 999 } },
      { seat: 2, seq: 1, cmd: { type: 'invalid' } },
      summon(4, 1),
    ]);
    expect(r.acks).toEqual([
      { seat: 1, seq: 1, tick: 0, ok: true },
      { seat: 1, seq: 2, tick: 0, ok: false, reason: 'staleUnit' },
      { seat: 1, seq: 3, tick: 0, ok: false, reason: 'staleUnit' },
      { seat: 2, seq: 1, tick: 0, ok: false, reason: 'badArgs' },
    ]);
    expect(m.lanes[1]!.tokens).toBe(3);
    expect(m.lanes[1]!.slots[0]!.id).toBe(u.id);
    expect(m.seats[1]!.lastSeq).toBe(3);
    expect(r.lanes[1]!.events.some(e => e.type === 'summon')).toBe(true);
    r = stepMatch(m, [summon(1, 2)]);
    expect(r.acks).toEqual([]); expect(m.lanes[1]!.tokens).toBe(3);
  });
  test('replaying the same inputs gives the same hash every 100 ticks', () => {
    const script = (t: number): MatchInput[] => (t % 200 === 0 ? [summon(1, t / 200 + 1), summon(2, t / 200 + 1)] : []);
    const run = () => { const m = createMatch(data, 21, [1, 2]); const hs: string[] = [];
      while (m.tick < 3000) { stepMatch(m, script(m.tick)); if (m.tick % 100 === 0) hs.push(matchHash(m)); } return hs; };
    const a = run();
    expect(a.length).toBe(30); expect(run()).toEqual(a);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/logic/test/match-flow.test.ts`
Expected: FAIL, `createMatch` 없음

- [ ] **Step 3: 타입, 일정, `createMatch`, `stepMatch`, 뼈대, 시험 도우미를 구현한다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run && npm run typecheck`
Expected: 전체 PASS(골든 포함)

- [ ] **Step 5: 커밋한다**

```bash
git add packages/logic
git commit -m "feat(logic): match state, createMatch and stepMatch tick order"
```

---

### Task 6: 개인 탈락, 고개 보스 제한 시간, 단절, 넋 지원, 팀 결과

**Implementer:** astra

**Files:**
- Modify: `packages/logic/src/match/seats.ts`
- Test: `packages/logic/test/match-seats.test.ts`

**읽을 것:** 명세 4장 전체, 6장 "진행 중 이탈", 10장 "로직·데이터"의 탈락·지원 항목과 "경계 상황", 11장 "결정" 4·5·6. `packages/logic/src/match/types.ts`, `step.ts`(호출 위치).

**Interfaces:**
- Consumes: Task 5 `MatchState`, `SeatState`, `BossClock`, `MatchInput`, `StepMatchResult`, `MatchEvent`, `MatchResult`, `SeatResult`, `roundStartTick`; `jumpToTick`, `stepMatchUntil`; Task 5가 정한 뼈대 시그니처; `gateFailed(match, tick)`(`yeoksin.ts`, 지금은 false); `countNormalEnemies`, `currentStats`, `toTicks`; `data.coop`
- Produces (`seats.ts`의 뼈대를 채우고 아래 둘을 더 내보낸다):
  - `eliminate(match, seat: number, cause: EliminationCause, ctx: StepMatchResult): void` — 기록을 먼저 만든다: `round = match.round`, `cause`, `tick = t`, 지금 라운드 `endEnemies`를 현재 수로 적고 `lastEnemies = countNormalEnemies`, `maxEnemies = max(stats.maxEnemies)`, `series = stats.map(s => s.endEnemies)`, `helperOpens`. 그 뒤 고개를 비운다: 모든 칸 null, `enemies [] fires [] pendingPity []`, 강화 넷 0, `tokens coins buckwheat 0`, `overLimitTicks 0`. 자리: `alive false`, `supportTokens 0`, `fighting`인 보스는 `failed`. `eliminated` 이벤트
  - `seatRecord(match, seat): SeatRecord` — 살아 있는 자리의 기록을 같은 방식으로 만든다(`cause null`, `tick null`)
- 규칙:
  - `expireDisconnects`: 살아 있고 `disconnectTick !== null`이며 `t === disconnectTick + toTicks(disconnectSeconds)`(3,600)인 자리를 `eliminate(…, 'disconnect')`
  - `applySeatCommand`:
    - `disconnect`: 이미 끊겼으면 무시(null). 아니면 `connected false`, `disconnectTick t`, `disconnected` 이벤트
    - `reconnect`: `connected true`, `disconnectTick null`, `reconnected {alive}` 이벤트. 기한이 지난 자리는 이미 1단계 시작에서 넋이 됐으므로 `alive false`로 나온다
    - `forfeit`: 살아 있으면 `eliminate(…, 'forfeit')`, 아니면 `'notAlive'`
    - `support {target}`: 보낸 사람이 살아 있으면 `'notSpirit'` → 토큰 0이면 `'noSupportToken'` → 대상이 `ring`에 없거나 탈락했으면 `'targetNotAlive'` → 대상이 이번 라운드에 받았으면 `'targetAlreadyReceived'`. 통과하면 토큰 −1, 대상 고개 `coins += support.coins`(5), 대상 `receivedThisRound true`, `supportSent`/`supportReceived` +1, `support` 이벤트. 접속 대기 중인 생존자도 받는다
  - `seatsOnRoundStart`: 모든 자리 `receivedThisRound = false`. 넋은 `supportTokens = min(support.max, supportTokens + support.perRound)`
  - `onBossSpawned`: 그 라운드 시계를 `{ status: 'fighting', ticksLeft: toTicks(bossRoundSeconds), pausedTicks: 0, enemyId }`, `bossSpawn` 이벤트. 접속 여부와 상관없이 예정대로 나온다(결정 6)
  - `seatsAfterLane`: 고개 이벤트에서 `kill`의 `enemyId`가 `fighting`인 보스 시계의 `enemyId`면 `killed`, `bossKilled` 이벤트
  - `judgeSeats(match, overLimit, ctx)`: 살아 있는 자리마다 `fighting`인 두 시계를: 접속 중이거나 `pausedTicks >= toTicks(bossPauseCapSeconds)`면 `ticksLeft − 1`, 아니면 `pausedTicks + 1`(결정 5). 그 뒤 탈락 후보: `overLimit`에 있으면 `limit`, 아니면 `ticksLeft === 0`인 `fighting` 시계가 있으면 `boss`. `options.noElimination`이면 후보를 버린다(시계는 그대로 움직인다). 후보를 번호순으로 `eliminate`
  - `decideResult`: 순서대로 한 번만 정한다. `gateFailed(match, t)` → `gate`. 생존 0 → `wipe`. 생존자가 1명 이상이고 모두 두 시계가 `killed`(결정 4) → `clear`. `t === roundStartTick(rounds + 1) − 1`(17,999) → 생존 + 두 보스 처치인 자리가 있으면 `clear`, 없으면 `wipe`. 정해지면 `match.result`, `phase 'ended'`, `ended` 이벤트
  - `SeatResult`: 탈락 자리는 `eliminated`(기록의 원인·라운드). 살아 있으면 `seatRecord`로 채우고 `gate`면 `aliveTeamLoss`, 두 보스 처치면 `finished`, 아니면 `unfinished`. `yeoksinDamage` = 두 단계 합. `MatchResult.round = match.round`, `started = ring.length`, `alive` = 생존 수, `seats`는 번호순

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
import { describe, expect, test } from 'vitest';
import { createGame, createMatch, loadGameData, step, stepMatch, type MatchState } from '../src/index';
import { forceRound, jumpToTick, placeUnitForTest, spawnEnemyForTest, stepMatchUntil } from '../src/testing';

const data = loadGameData('stage2');
const fill = (m: MatchState, seat: number, n: number) => { for (let i = 0; i < n; i++) spawnEnemyForTest(m.lanes[seat]!, 'japgwi', 0, 1e9); };
const reasons = (acks: { ok: boolean; reason?: string }[]) => acks.map(a => (a.ok ? 'ok' : a.reason));
const killBoss = (m: MatchState, seat: number) => { m.lanes[seat]!.enemies.find(e => e.boss)!.hp = 0; };

describe('elimination', () => {
  test('limit: 61 for 99 ticks survives, the 100th eliminates; dropping to 60 resets', () => {
    const m = createMatch(data, 1, [1, 2]); jumpToTick(m, 1000);
    fill(m, 1, 61);
    stepMatchUntil(m, 1050); m.lanes[1]!.enemies.pop(); stepMatch(m, []);
    expect(m.lanes[1]!.overLimitTicks).toBe(0);
    fill(m, 1, 1);
    stepMatchUntil(m, m.tick + 99); expect(m.seats[1]!.alive).toBe(true);
    const r = stepMatch(m, []);
    expect(m.seats[1]).toMatchObject({ alive: false, record: { cause: 'limit', round: 1, lastEnemies: 61, series: [61] } });
    expect(r.events).toContainEqual({ type: 'eliminated', seat: 1, cause: 'limit', round: 1 });
    expect(m.lanes[1]).toMatchObject({ enemies: [], fires: [], pendingPity: [], tokens: 0, coins: 0, buckwheat: 0 });
    expect(m.seats[2]!.alive).toBe(true);
  });
  test('boss clock: killing with 1 tick left passes; otherwise eliminated at 9299', () => {
    const a = createMatch(data, 1, [1]); jumpToTick(a, 7800); stepMatch(a, []);
    expect(a.seats[1]!.bosses[10]).toMatchObject({ status: 'fighting', ticksLeft: 1499 });
    stepMatchUntil(a, 9299);
    expect(a.seats[1]!.bosses[10].ticksLeft).toBe(1);
    killBoss(a, 1); stepMatch(a, []);
    expect(a.seats[1]).toMatchObject({ alive: true, bosses: { 10: { status: 'killed', ticksLeft: 1 } } });
    const b = createMatch(data, 1, [1]); jumpToTick(b, 7800);
    stepMatchUntil(b, 9299); expect(b.seats[1]!.alive).toBe(true);
    stepMatch(b, []);
    expect(b.seats[1]).toMatchObject({ alive: false, record: { cause: 'boss', round: 10 }, bosses: { 10: { status: 'failed', ticksLeft: 0 } } });
    expect(b.result).toMatchObject({ outcome: 'wipe', tick: 9299 });
  });
  test('limit beats boss on the same tick', () => {
    const m = createMatch(data, 1, [1, 2]); jumpToTick(m, 7800);
    stepMatchUntil(m, 9200); fill(m, 1, 61);
    stepMatchUntil(m, 9300);
    expect(m.seats[1]!.record!.cause).toBe('limit');
  });
  test('forfeit acts in step 1: no combat in that lane on that tick', () => {
    const m = createMatch(data, 1, [1, 2]); jumpToTick(m, 1000);
    placeUnitForTest(m.lanes[1]!, 'horong', 7); spawnEnemyForTest(m.lanes[1]!, 'japgwi', 3, 1e9);
    const r = stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'forfeit' } }]);
    expect(r.acks[0]).toMatchObject({ ok: true });
    expect(m.seats[1]!.record!.cause).toBe('forfeit');
    expect(r.lanes[1]?.events.some(e => e.type === 'attack') ?? false).toBe(false);
    expect(stepMatch(m, [{ seat: 1, seq: 2, cmd: { type: 'summon' } }]).acks[0]).toMatchObject({ ok: false, reason: 'notAlive' });
  });
  test('an eliminated lane gets no spawns, tokens or coins', () => {
    const m = createMatch(data, 1, [1, 2]); jumpToTick(m, 1000);
    stepMatch(m, [{ seat: 2, seq: 1, cmd: { type: 'forfeit' } }]);
    stepMatchUntil(m, 1500);
    expect(m.lanes[2]).toMatchObject({ enemies: [], tokens: 0, coins: 0 });
  });
});

describe('disconnect', () => {
  test('D+3599 reconnect keeps the seat; D+3600 makes a spirit', () => {
    const a = createMatch(data, 1, [1, 2], { noElimination: true }); jumpToTick(a, 1000);
    stepMatch(a, [{ seat: 1, seq: 0, cmd: { type: 'disconnect' } }]);
    expect(a.seats[1]).toMatchObject({ connected: false, disconnectTick: 1000, alive: true });
    stepMatchUntil(a, 4599);
    stepMatch(a, [{ seat: 1, seq: 0, cmd: { type: 'reconnect' } }]);
    expect(a.seats[1]).toMatchObject({ connected: true, alive: true, disconnectTick: null });
    const b = createMatch(data, 1, [1, 2], { noElimination: true }); jumpToTick(b, 1000);
    stepMatch(b, [{ seat: 1, seq: 0, cmd: { type: 'disconnect' } }]);
    stepMatchUntil(b, 4600);
    const r = stepMatch(b, [{ seat: 1, seq: 0, cmd: { type: 'reconnect' } }]);
    expect(b.seats[1]).toMatchObject({ alive: false, connected: true, record: { cause: 'disconnect' } });
    expect(r.events).toContainEqual({ type: 'reconnected', seat: 1, alive: false });
  });
  test('expiry and the 100th over-limit tick on the same tick: cause disconnect', () => {
    const m = createMatch(data, 1, [1, 2]); jumpToTick(m, 1000);
    stepMatch(m, [{ seat: 1, seq: 0, cmd: { type: 'disconnect' } }]);
    stepMatchUntil(m, 4501, { clearEnemies: true });
    fill(m, 1, 61);
    stepMatchUntil(m, 4600); expect(m.seats[1]!.alive).toBe(true);
    stepMatch(m, []);
    expect(m.seats[1]!.record!.cause).toBe('disconnect');
  });
  test('boss clock pauses while disconnected, resumes on reconnect, and runs again after 3600 paused ticks', () => {
    const m = createMatch(data, 1, [1, 2], { noElimination: true }); jumpToTick(m, 7800); stepMatch(m, []);
    stepMatch(m, [{ seat: 1, seq: 0, cmd: { type: 'disconnect' } }]);
    expect(m.seats[1]!.bosses[10]).toMatchObject({ ticksLeft: 1499, pausedTicks: 1 });
    stepMatchUntil(m, 11400, { clearEnemies: true });
    stepMatch(m, [{ seat: 1, seq: 0, cmd: { type: 'reconnect' } }]);
    expect(m.seats[1]!.bosses[10]).toMatchObject({ ticksLeft: 1498, pausedTicks: 3599 });
    stepMatch(m, [{ seat: 1, seq: 0, cmd: { type: 'disconnect' } }]);
    expect(m.seats[1]!.bosses[10]).toMatchObject({ ticksLeft: 1498, pausedTicks: 3600 });
    stepMatch(m, []);
    expect(m.seats[1]!.bosses[10]).toMatchObject({ ticksLeft: 1497, pausedTicks: 3600 });
  });
});

describe('support', () => {
  const twoSpirits = () => {
    const m = createMatch(data, 1, [1, 2, 3]); jumpToTick(m, 1000);
    stepMatch(m, [{ seat: 2, seq: 1, cmd: { type: 'forfeit' } }, { seat: 3, seq: 1, cmd: { type: 'forfeit' } }]);
    stepMatchUntil(m, 1401);
    return m;
  };
  test('one token per round start, capped at 1, zero right after elimination', () => {
    const m = createMatch(data, 1, [1, 2]); jumpToTick(m, 1000);
    stepMatch(m, [{ seat: 2, seq: 1, cmd: { type: 'forfeit' } }]);
    expect(m.seats[2]!.supportTokens).toBe(0);
    stepMatchUntil(m, 1401); expect(m.seats[2]!.supportTokens).toBe(1);
    stepMatchUntil(m, 2201); expect(m.seats[2]!.supportTokens).toBe(1);
  });
  test('two spirits support the same survivor: the first pays, the survivor gets 5 once', () => {
    const m = twoSpirits(); const coins = m.lanes[1]!.coins;
    const r = stepMatch(m, [{ seat: 2, seq: 2, cmd: { type: 'support', target: 1 } }, { seat: 3, seq: 2, cmd: { type: 'support', target: 1 } }]);
    expect(reasons(r.acks)).toEqual(['ok', 'targetAlreadyReceived']);
    expect(m.lanes[1]!.coins).toBe(coins + 5);
    expect([m.seats[2]!.supportTokens, m.seats[3]!.supportTokens]).toEqual([0, 1]);
    expect(r.events).toContainEqual({ type: 'support', from: 2, to: 1, coins: 5 });
  });
  test('a support on the boundary tick still sees the old round limit', () => {
    const m = twoSpirits();
    stepMatch(m, [{ seat: 2, seq: 2, cmd: { type: 'support', target: 1 } }]);
    stepMatchUntil(m, 2200);
    expect(stepMatch(m, [{ seat: 3, seq: 2, cmd: { type: 'support', target: 1 } }]).acks[0]).toMatchObject({ ok: false, reason: 'targetAlreadyReceived' });
    expect(m.seats[3]!.supportTokens).toBe(1);
    expect(stepMatch(m, [{ seat: 3, seq: 3, cmd: { type: 'support', target: 1 } }]).acks[0]).toMatchObject({ ok: true });
  });
  test('rejections keep the token; a disconnected survivor can receive', () => {
    const m = twoSpirits();
    stepMatch(m, [{ seat: 1, seq: 0, cmd: { type: 'disconnect' } }]);
    const r = stepMatch(m, [
      { seat: 1, seq: 1, cmd: { type: 'support', target: 2 } },
      { seat: 2, seq: 2, cmd: { type: 'support', target: 3 } },
      { seat: 2, seq: 3, cmd: { type: 'support', target: 1 } },
      { seat: 2, seq: 4, cmd: { type: 'support', target: 1 } },
    ]);
    expect(reasons(r.acks)).toEqual(['notSpirit', 'targetNotAlive', 'ok', 'noSupportToken']);
  });
  test('target eliminated earlier in the same tick: rejected, token kept; enemy counts unchanged', () => {
    const m = createMatch(data, 1, [1, 2, 3]); jumpToTick(m, 1000);
    stepMatch(m, [{ seat: 3, seq: 1, cmd: { type: 'forfeit' } }]); stepMatchUntil(m, 1401);
    const before = m.lanes[1]!.enemies.length;
    const r = stepMatch(m, [{ seat: 2, seq: 1, cmd: { type: 'forfeit' } }, { seat: 3, seq: 2, cmd: { type: 'support', target: 2 } }, { seat: 3, seq: 3, cmd: { type: 'support', target: 1 } }]);
    expect(reasons(r.acks)).toEqual(['ok', 'targetNotAlive', 'ok']);
    expect(m.lanes[1]!.enemies.length).toBe(before);
  });
});

describe('team result', () => {
  const atFinal = (seats: number[]) => {
    const m = createMatch(data, 1, seats);
    for (const s of seats) m.seats[s]!.bosses[10].status = 'killed';
    jumpToTick(m, 16500); stepMatch(m, []);
    return m;
  };
  test('every survivor disconnected at 17999 without gangcheori: one wipe, seat unfinished', () => {
    const m = atFinal([1]);
    stepMatch(m, [{ seat: 1, seq: 0, cmd: { type: 'disconnect' } }]);
    const rs = stepMatchUntil(m, 18000);
    expect(m.result).toMatchObject({ outcome: 'wipe', tick: 17999, alive: 1, started: 1, seats: [{ seat: 1, outcome: 'unfinished' }] });
    expect(rs.flatMap(r => r.events).filter(e => e.type === 'ended').length).toBe(1);
  });
  test('gangcheori killed but limit-eliminated on 17999: wipe', () => {
    const m = atFinal([1]); stepMatchUntil(m, 17900); fill(m, 1, 61);
    stepMatchUntil(m, 17999); killBoss(m, 1); stepMatch(m, []);
    expect(m.result).toMatchObject({ outcome: 'wipe', seats: [{ seat: 1, outcome: 'eliminated', cause: 'limit' }] });
  });
  test('two seats out on the same tick: one wipe; later inputs are refused and time stops', () => {
    const m = createMatch(data, 1, [1, 2]); jumpToTick(m, 1000);
    const r = stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'forfeit' } }, { seat: 2, seq: 1, cmd: { type: 'forfeit' } }]);
    expect(m.result).toMatchObject({ outcome: 'wipe', tick: 1000, alive: 0, started: 2 });
    expect(r.events.filter(e => e.type === 'ended').length).toBe(1);
    expect(stepMatch(m, [{ seat: 1, seq: 2, cmd: { type: 'summon' } }]).acks[0]).toMatchObject({ ok: false, reason: 'ended' });
    expect(m.tick).toBe(1001);
  });
  test('early clear once every survivor has both bosses down (decision 4)', () => {
    const m = atFinal([1, 2]);
    killBoss(m, 1); stepMatch(m, []); expect(m.result).toBeNull();
    killBoss(m, 2); stepMatch(m, []);
    expect(m.result).toMatchObject({ outcome: 'clear', tick: 16502, seats: [{ seat: 1, outcome: 'finished' }, { seat: 2, outcome: 'finished' }] });
  });
  test('coop 1-player clears on the round-20 kill; stage 1 still clears on its final kill', () => {
    const m = atFinal([1]); killBoss(m, 1); stepMatch(m, []);
    expect(m.result).toMatchObject({ outcome: 'clear', tick: 16501 });
    const s = createGame(loadGameData(), 1); forceRound(s, 20); step(s, []);
    s.enemies.find(e => e.boss)!.hp = 0; step(s, []);
    expect(s.result).toEqual({ outcome: 'clear', reason: null, round: 20 });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/logic/test/match-seats.test.ts`
Expected: FAIL (뼈대라 탈락·결과가 없음)

- [ ] **Step 3: `seats.ts`를 구현한다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run && npm run typecheck`
Expected: 전체 PASS

- [ ] **Step 5: 커밋한다**

```bash
git add packages/logic
git commit -m "feat(logic): eliminations, boss clocks, disconnects, spirit support and team result"
```

---

### Task 7: 역신과 스토리 관문

**Implementer:** astra

**Files:**
- Modify: `packages/logic/src/match/yeoksin.ts`
- Test: `packages/logic/test/match-yeoksin.test.ts`

**읽을 것:** 명세 3장 전체, 4장 2·3·5단계, 10장의 역신·관문 항목과 경계 상황. `packages/logic/src/match/types.ts`, `step.ts`(호출 위치), `seats.ts`(`decideResult`가 `gateFailed`를 먼저 부름).

**Interfaces:**
- Consumes: Task 5 `MatchState.yeoksin`, `YeoksinState`, `yeoksinKills`, `StepMatchResult`, `MatchEvent`, `roundStartTick`, `jumpToTick`, `stepMatchUntil`; Task 6 `eliminate`(시험에서 forfeit로 간접 사용); `laneOf(lane).perimeter`, `toTicks`, `data.coop`
- Produces (`yeoksin.ts`의 뼈대를 채우고 더 내보낸다):
  - `yeoksinMaxHp(data, starters: number, stage: number): number` = `Math.round(baseHp × (1 + hpPerExtraPlayer × (starters − 1)))`
  - `gateDeadlineTick(data, stage: number): number` = `roundStartTick(data, deadlineRound + 1) − 1` (7,799 / 16,499)
  - `nextAliveSeat(match, from: number): number | null` — `ring`에서 `from` 다음부터 한 바퀴 돌며 첫 생존 자리. `from` 자신만 살아 있으면 `from`. 아무도 없으면 null
- 규칙 (`stayTicks = toTicks(staySeconds)` = 240, 둘레 P = 24):
  - `yeoksinStep2(match, ctx)`:
    1. `t === roundStartTick(startRound)`인 단계가 있으면 등장: `Enemy { id: −stage, defId: enemy, hp: maxHp, maxHp, d: 0, boss: false, round: startRound, stunTicks: 0, slow: null, vulns: {}, dots: {}, fireHit: {} }`, `match.yeoksin = { stage, enemy, seat: null, enterTick: t }`, `yeoksinSpawn` 이벤트. 들어갈 자리 = `ring[startIndex % ring.length]`가 살아 있으면 그 자리, 아니면 `nextAliveSeat(그 자리)`
    2. 이미 있는 역신은 `seat !== null`이고 (`t === enterTick + stayTicks` 또는 주인이 탈락)일 때 `nextAliveSeat(seat)`로 옮긴다
    3. 옮길 때: 옛 고개 `enemies`에 있으면 빼고 `yeoksinLeave`, `vulns dots fireHit`를 비운다(체력 유지, 불길은 옛 고개에 남음). 새 고개 `enemies`에 넣고 `d = 0`, `enterTick = t`, `seat`, `yeoksinEnter { from, enterTick, hp, maxHp }`. 새 자리가 null이면 `seat = null`
  - `yeoksinPosition(match, seat)`: 역신이 이 고개에 있으면 `enemy.d = P × (t − enterTick + 1) / stayTicks`
  - `yeoksinAfterLane(match, seat, ctx)`: 역신이 이 고개에 있었으면, 고개 이벤트의 `damage(enemyId = −stage)`를 차례로 보며 직전 HP(`처리 뒤 hp + 그 피해들의 amount 합`에서 시작)를 상한으로 실제 피해를 `seats[seat].yeoksinDamage[stage − 1]`에 더한다. `enemy.hp <= 0`이면 격파: `yeoksinKills = stage`, 생존 고개마다 `coins += killReward.coins`, `buckwheat += killReward.buckwheat`. `ring.length >= 2`면 생존자 중 이 단계 피해 > 0인 자리에서 최대(동점은 작은 번호)에게 `coins += topDamageBonus`. `yeoksinKilled { topSeat }`, `match.yeoksin = null`
  - `gateFailed(match, tick)`: 어떤 단계의 `gateDeadlineTick === tick`이고 `yeoksinKills < stage`면 true
  - 넋에게는 보상을 주지 않는다. 역신은 잡귀 수·라운드 피해 통계·고개 보스 보상에 들어가지 않는다(Task 2의 shared 규칙)

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
import { describe, expect, test } from 'vitest';
import { createMatch, loadGameData, pickTarget, stepMatch, type MatchState, type StepMatchResult } from '../src/index';
import { jumpToTick, placeUnitForTest, spawnEnemyForTest, stepMatchUntil } from '../src/testing';

const data = loadGameData('stage2');
const Y1 = data.coop!.yeoksin[0]!;
const fill = (m: MatchState, seat: number, n: number) => { for (let i = 0; i < n; i++) spawnEnemyForTest(m.lanes[seat]!, 'japgwi', 0, 1e9); };
const hitsOn = (r: StepMatchResult, id: number) => Object.entries(r.lanes).filter(([, l]) => l.events.some(e => e.type === 'damage' && e.enemyId === id)).map(([s]) => Number(s));
const atStage1 = (seats: number[]) => { const m = createMatch(data, 1, seats); jumpToTick(m, 4600); stepMatch(m, []); return m; };

describe('yeoksin', () => {
  test('max hp grows 10% per extra starter and does not change after eliminations', () => {
    for (const n of [1, 2, 6]) {
      const m = atStage1(Array.from({ length: n }, (_, i) => i + 1));
      const hp = Math.round(Y1.baseHp * (1 + 0.1 * (n - 1)));
      expect(m.yeoksin!.enemy).toMatchObject({ id: -1, hp, maxHp: hp });
      if (n === 6) {
        expect(hp).toBe(Math.round(Y1.baseHp * 1.5));
        stepMatch(m, [{ seat: 2, seq: 1, cmd: { type: 'forfeit' } }, { seat: 3, seq: 1, cmd: { type: 'forfeit' } }]);
        expect(m.yeoksin!.enemy).toMatchObject({ hp, maxHp: hp });
      }
    }
  });
  test('enters the first ring seat at round 6, the second at round 15, the only one for 1 player', () => {
    const m = createMatch(data, 1, [2, 4, 5]); jumpToTick(m, 4600);
    const r = stepMatch(m, []);
    expect(m.yeoksin).toMatchObject({ stage: 1, seat: 2, enterTick: 4600 });
    expect(m.lanes[2]!.enemies.some(e => e.id === -1)).toBe(true);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'yeoksinEnter', stage: 1, seat: 2, from: null, enterTick: 4600 }));
    const n = createMatch(data, 1, [2, 4, 5]); jumpToTick(n, 12500); stepMatch(n, []);
    expect(n.yeoksin).toMatchObject({ stage: 2, seat: 4, enemy: { id: -2 } });
    const one = createMatch(data, 1, [3]); jumpToTick(one, 12500); stepMatch(one, []);
    expect(one.yeoksin).toMatchObject({ stage: 2, seat: 3 });
  });
  test('start seat already eliminated: next alive seat', () => {
    const m = createMatch(data, 1, [1, 2, 3]); jumpToTick(m, 4599);
    stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'forfeit' } }]); stepMatch(m, []);
    expect(m.yeoksin!.seat).toBe(2);
  });
  test('stays 240 ticks: d follows the formula; hit only in lane 1 at T+239 and only in lane 2 at T+240', () => {
    const m = atStage1([1, 2]);
    expect(m.yeoksin!.enemy.d).toBeCloseTo(0.1, 9);
    m.yeoksin!.enemy.hp = m.yeoksin!.enemy.maxHp = 1e9;
    for (const s of [1, 2]) for (const slot of [0, 1]) placeUnitForTest(m.lanes[s]!, 'horong', slot);
    const fire = () => { for (const s of [1, 2]) for (const u of m.lanes[s]!.slots) if (u) u.cooldown = 0; };
    stepMatchUntil(m, 4839);
    fire(); const a = stepMatch(m, []);
    expect(m.yeoksin).toMatchObject({ seat: 1 }); expect(m.yeoksin!.enemy.d).toBeCloseTo(24, 6);
    expect(hitsOn(a, -1)).toEqual([1]);
    fire(); const b = stepMatch(m, []);
    expect(m.yeoksin).toMatchObject({ seat: 2, enterTick: 4840 });
    expect(hitsOn(b, -1)).toEqual([2]);
    expect(m.lanes[1]!.enemies.some(e => e.id === -1)).toBe(false);
  });
  test('wraps from the last seat to the first, skips spirits, a lone survivor loops to itself', () => {
    const m = atStage1([1, 3, 6]); m.yeoksin!.enemy.hp = 1e9;
    stepMatch(m, [{ seat: 3, seq: 1, cmd: { type: 'forfeit' } }]);
    stepMatchUntil(m, 4841); expect(m.yeoksin!.seat).toBe(6);
    stepMatchUntil(m, 5081); expect(m.yeoksin!.seat).toBe(1);
    stepMatch(m, [{ seat: 6, seq: 1, cmd: { type: 'forfeit' } }]);
    stepMatchUntil(m, 5321); expect(m.yeoksin).toMatchObject({ seat: 1, enterTick: 5320 });
  });
  test('owner forfeits: moves the same tick; owner limit-eliminated: moves the next tick', () => {
    const a = atStage1([1, 2]);
    stepMatch(a, [{ seat: 1, seq: 1, cmd: { type: 'forfeit' } }]);
    expect(a.yeoksin).toMatchObject({ seat: 2, enterTick: 4601 });
    const b = atStage1([1, 2]);
    fill(b, 1, 61); stepMatchUntil(b, 4700); stepMatch(b, []);
    expect(b.seats[1]!.alive).toBe(false); expect(b.yeoksin!.seat).toBe(1); expect(b.lanes[1]!.enemies).toEqual([]);
    stepMatch(b, []);
    expect(b.yeoksin).toMatchObject({ seat: 2, enterTick: 4701 });
  });
  test('leaving clears vulns, dots and fireHit, keeps hp; fires stay in the old lane', () => {
    const m = atStage1([1, 2]); const y = m.yeoksin!.enemy; y.hp = 5000;
    y.vulns.x = { pct: 0.1, damageType: 'all', ticks: 999, stacks: 1 };
    y.dots.x = { remaining: 50, pulsesLeft: 5, nextPulse: 1e9 }; y.fireHit.x = 4700;
    m.lanes[1]!.fires.push({ source: 'hwaro', from: 1, to: 2, basePerPulse: 1, nextPulse: 1e9, endTick: 1e9 });
    stepMatchUntil(m, 4841);
    expect(m.yeoksin!.seat).toBe(2);
    expect(y).toMatchObject({ hp: 5000, vulns: {}, dots: {}, fireHit: {} });
    expect(m.lanes[1]!.fires.length).toBe(1);
  });
  test('kill rewards: +15 coins +1 buckwheat to survivors, +10 to the top survivor contributor', () => {
    const m = atStage1([1, 2, 3]);
    m.seats[2]!.yeoksinDamage[0] = 500; m.seats[3]!.yeoksinDamage[0] = 900;
    stepMatch(m, [{ seat: 3, seq: 1, cmd: { type: 'forfeit' } }]);
    const coins = [1, 2].map(s => m.lanes[s]!.coins); const buck = [1, 2].map(s => m.lanes[s]!.buckwheat);
    m.yeoksin!.enemy.hp = 0;
    const r = stepMatch(m, []);
    expect(r.events).toContainEqual({ type: 'yeoksinKilled', stage: 1, seat: 1, topSeat: 2 });
    expect([1, 2].map(s => m.lanes[s]!.coins)).toEqual([coins[0]! + 15, coins[1]! + 25]);
    expect([1, 2].map(s => m.lanes[s]!.buckwheat)).toEqual([buck[0]! + 1, buck[1]! + 1]);
    expect(m.lanes[3]!.coins).toBe(0);
    expect([m.yeoksinKills, m.yeoksin]).toEqual([1, null]);
  });
  test('tie goes to the smaller seat; 1 player gets no bonus', () => {
    const m = atStage1([1, 2]); m.seats[1]!.yeoksinDamage[0] = 300; m.seats[2]!.yeoksinDamage[0] = 300;
    m.yeoksin!.enemy.hp = 0;
    expect(stepMatch(m, []).events).toContainEqual({ type: 'yeoksinKilled', stage: 1, seat: 1, topSeat: 1 });
    const one = atStage1([1]); const c = one.lanes[1]!.coins; one.yeoksin!.enemy.hp = 0;
    expect(stepMatch(one, []).events).toContainEqual({ type: 'yeoksinKilled', stage: 1, seat: 1, topSeat: null });
    expect(one.lanes[1]!.coins).toBe(c + 15);
  });
  test('damage credit is capped at the hp before each hit', () => {
    const m = atStage1([1, 2]);
    placeUnitForTest(m.lanes[1]!, 'horong', 0); m.yeoksin!.enemy.hp = 5;
    stepMatch(m, []);
    expect(m.seats[1]!.yeoksinDamage[0]).toBe(5); expect(m.yeoksinKills).toBe(1);
  });
  test('gate: alive at 7799 means gate; a kill on 7799 passes', () => {
    const a = createMatch(data, 1, [1], { noElimination: true }); jumpToTick(a, 4600);
    stepMatchUntil(a, 7800, { clearEnemies: true });
    expect(a.result).toMatchObject({ outcome: 'gate', tick: 7799, yeoksinKills: 0, seats: [{ seat: 1, outcome: 'aliveTeamLoss' }] });
    const b = createMatch(data, 1, [1], { noElimination: true }); jumpToTick(b, 4600);
    stepMatchUntil(b, 7799, { clearEnemies: true }); b.yeoksin!.enemy.hp = 0; stepMatch(b, []);
    expect(b.result).toBeNull(); expect(b.yeoksinKills).toBe(1);
  });
  test('gate and a limit elimination on the deadline tick: personal cause limit, team outcome gate', () => {
    const m = atStage1([1, 2]);
    stepMatchUntil(m, 7700, { clearEnemies: true }); fill(m, 1, 61);
    stepMatchUntil(m, 7800);
    expect(m.result).toMatchObject({ outcome: 'gate', tick: 7799 });
    expect(m.result!.seats).toEqual([expect.objectContaining({ seat: 1, outcome: 'eliminated', cause: 'limit' }), expect.objectContaining({ seat: 2, outcome: 'aliveTeamLoss' })]);
  });
  test('everyone out on the deadline tick: gate, not wipe', () => {
    const m = atStage1([1, 2]);
    stepMatchUntil(m, 7799, { clearEnemies: true });
    stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'forfeit' } }, { seat: 2, seq: 1, cmd: { type: 'forfeit' } }]);
    expect(m.result).toMatchObject({ outcome: 'gate', alive: 0 });
  });
  test('a held jinegaksi and the second mask in one lane: jinegaksi is targeted first', () => {
    const m = createMatch(data, 1, [1]); jumpToTick(m, 12500); stepMatch(m, []);
    const boss = spawnEnemyForTest(m.lanes[1]!, 'jinegaksi', m.yeoksin!.enemy.d, 1e9);
    placeUnitForTest(m.lanes[1]!, 'horong', 0);
    expect(pickTarget(m.lanes[1]!, 0)!.id).toBe(boss.id);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/logic/test/match-yeoksin.test.ts`
Expected: FAIL (역신이 나타나지 않음)

- [ ] **Step 3: `yeoksin.ts`를 구현한다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run && npm run typecheck`
Expected: 전체 PASS

- [ ] **Step 5: 커밋한다**

```bash
git add packages/logic
git commit -m "feat(logic): yeoksin ring, stay, rewards and story gate"
```

---

### Task 8: 협동 시뮬레이터와 입력 기록 재생

**Implementer:** sol

**Files:**
- Create: `packages/logic/src/match/replay.ts` (`index.ts`에서 내보내기)
- Create: `packages/sim/src/coop.ts`
- Modify: `packages/sim/src/bots.ts` (`followBoss` 내보내기, shared 추적), `packages/sim/src/cli.ts` (`--stage 2`)
- Test: `packages/sim/test/coop.test.ts`

**읽을 것:** 명세 8장 전체. `packages/sim/src/runner.ts`, `bots.ts`, `cli.ts`. `packages/logic/src/match/types.ts`.

**Interfaces:**
- Consumes: Task 5 `createMatch`, `stepMatch`, `matchHash`, `laneSeed`, `MatchState`, `MatchInput`, `MatchCommand`; Task 6 결과 필드; Task 7 `yeoksin`; `isShared`, `countNormalEnemies`, `unitDefFast`; 기존 `normalBot`, `clumsyBot`, `roundRows` 열 정의
- Produces:
  - `replay.ts`: `interface InputLogEntry { tick: number; inputs: MatchInput[] }`, `replayMatch(data, seed, seats: number[], log: InputLogEntry[], every = 100, options?: MatchOptions): [number, string][]` — 새 판에서 매 틱 그 틱의 입력을 넣어 `stepMatch`, `match.tick % every === 0`마다 `[tick, matchHash]`. 결과가 날 때까지 돈다. 반복이 끝난 뒤 끝 틱이 `every`의 배수가 아니면 `[match.tick, matchHash]`를 한 번 더 넣는다(결과가 `MatchState.result`에 있어 해시로 함께 비교된다). `runMatch`의 `hashes`와 Task 12 방 시험의 서버 해시도 같은 규칙으로 쌓는다
  - `bots.ts`: `followBoss(state: GameState): Command[]`를 내보내고, 추적 대상을 "보스 중 첫째, 없으면 shared 적 중 첫째(hp > 0)"로 바꾼다. 1단계에는 shared가 없어 골든이 그대로다
  - `coop.ts`:
    - `type BotKind = 'normal' | 'clumsy'`
    - `class CoopDriver { constructor(match: MatchState, kinds: BotKind[]); queue(seat: number, cmd: MatchCommand): void; inputs(): MatchInput[] }` — `kinds[i]`가 `ring[i]`의 봇. 서툰 봇은 `clumsyBot(laneSeed(match.seed, seat))`. `inputs()`는 지금 `match.tick`에 넣을 입력: `queue`로 넣은 것 먼저, 그다음 `tick % 10 === 0`이면 자리 번호순으로 생존 자리는 `bot.decide(lane)`, 넋은 `spiritSupport`. seq는 자리마다 1부터 증가
    - `spiritSupport(match, seat): MatchCommand | null` — 토큰이 있으면 생존·이번 라운드 미수신 자리 중 일반 적 수가 가장 많은 곳(동점은 작은 번호)
    - `interface CoopRun { match: MatchState; log: InputLogEntry[]; hashes: [number, string][]; firstEnter: Record<number, number | null>; killTick: Record<number, number | null>; hpAtGate: Record<number, number | null> }`
    - `runMatch(data, seed, kinds: BotKind[], options?: MatchOptions): CoopRun` — 자리 `1..kinds.length`, 결과가 날 때까지. 빈 입력 틱은 기록하지 않는다. `hpAtGate[stage]` = 마감 틱 처리 뒤 남은 역신 HP(격파했으면 null)
    - `coopRows(run, seed, config): string[][]` — 자리별 라운드 행. 열 `seed,config,seat,alive,` + 기존 `roundRows` 열에서 `seed`·`bot`을 뺀 것(`round,nominalMultiplier,…`). 고개에 `stats` 줄이 있는 라운드만(탈락 뒤 빈 라운드 없음)
    - `teamRow(run, seed, config): Record<string, string | number>` — 열 `seed,config,players,started,alive,outcome,endTick,endRound,y1Enter,y1Kill,y1HpAtGate,y2Enter,y2Kill,y2HpAtGate,damage,supportSent,supportReceived,causes,leftoverGrade1` (`damage`·`causes`·`leftoverGrade1`은 `seat:값;` 이어 붙임. `leftoverGrade1`은 끝에 남은 1등급 id별 수)
- CLI: `npm run sim -- --stage 2 --players 6 --bots normal,normal,normal,clumsy,clumsy,clumsy --seeds 100 --out sim-out/coop-mixed.csv`
  - `--bots`가 하나면 인원수만큼 반복, 개수가 다르면 오류
  - `<out>`에 자리별 행, `<out에서 .csv를 뺀 것>-team.csv`에 팀 행을 쓴다
  - 요약 출력: 팀 클리어 수, 결과별 수, 관문 실패 라운드 분포, 개인 탈락 원인 수, 단계별 처치 틱 중앙값과 관문 시간 대비 비율(첫째 3,200틱, 둘째 4,000틱 기준, 등장 틱부터), 진입 순서별 역신 피해 0인 자리 비율, "개인 탈락 후 팀 클리어" 판 수, 남은 1등급 id별 합
  - `--stage`가 없으면 지금 1인 CLI 그대로

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
import { describe, expect, test } from 'vitest';
import { createMatch, loadGameData, matchHash, replayMatch, stepMatch } from '@dorandi/logic';
import { jumpToTick, placeUnitForTest } from '@dorandi/logic/testing';
import { followBoss } from '../src/bots';
import { coopRows, runMatch, spiritSupport, teamRow } from '../src/coop';

const data = loadGameData('stage2');

describe('coop sim', () => {
  test('deterministic and replayable from its input log', () => {
    const a = runMatch(data, 4, ['normal', 'clumsy']);
    expect(a.match.result).not.toBeNull();
    expect(matchHash(runMatch(data, 4, ['normal', 'clumsy']).match)).toBe(matchHash(a.match));
    expect(replayMatch(data, 4, [1, 2], a.log)).toEqual(a.hashes);
  }, 120_000);
  test('normal bot follows the yeoksin like a boss', () => {
    const m = createMatch(data, 1, [1]); jumpToTick(m, 4600); stepMatch(m, []);
    const lane = m.lanes[1]!;
    placeUnitForTest(lane, 'sotlid', 17);
    expect(followBoss(lane).length).toBeGreaterThan(0);
  });
  test('spirit supports the survivor with the most enemies, smaller seat on ties', () => {
    const m = createMatch(data, 1, [1, 2, 3]); jumpToTick(m, 1000);
    stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'forfeit' } }]);
    m.seats[1]!.supportTokens = 1;
    expect(spiritSupport(m, 1)).toEqual({ type: 'support', target: 2 });
    m.seats[2]!.receivedThisRound = true;
    expect(spiritSupport(m, 1)).toEqual({ type: 'support', target: 3 });
  });
  test('csv shapes', () => {
    const run = runMatch(data, 2, ['clumsy']);
    expect(coopRows(run, 2, 'clumsy1')[0]!.slice(0, 5)).toEqual(['2', 'clumsy1', '1', expect.stringMatching(/^(true|false)$/), '1']);
    expect(Object.keys(teamRow(run, 2, 'clumsy1'))).toEqual(['seed', 'config', 'players', 'started', 'alive', 'outcome', 'endTick', 'endRound', 'y1Enter', 'y1Kill', 'y1HpAtGate', 'y2Enter', 'y2Kill', 'y2HpAtGate', 'damage', 'supportSent', 'supportReceived', 'causes', 'leftoverGrade1']);
  }, 60_000);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/sim/test/coop.test.ts`
Expected: FAIL, `../src/coop` 없음

- [ ] **Step 3: `replay.ts`, `coop.ts`, 봇 변경, CLI를 구현한다**

- [ ] **Step 4: 통과와 실행을 확인한다**

Run: `npx vitest run && npm run typecheck && npm run sim -- --stage 2 --players 2 --bots normal,clumsy --seeds 3 --out sim-out/coop-smoke.csv`
Expected: 테스트 PASS(골든 포함). CLI가 요약을 출력하고 `sim-out/coop-smoke.csv`, `sim-out/coop-smoke-team.csv`를 쓴다

- [ ] **Step 5: 커밋한다**

```bash
git add packages/logic packages/sim/src packages/sim/test
git commit -m "feat(sim): coop runner, spirit bot, input log replay and stage 2 cli"
```

**체크포인트 2 리뷰:** 명세 4장의 틱 1~5단계 순서가 `step.ts`에 그대로 있는지, 1단계 `step`의 호출 순서가 남아 있는지(골든), 10장 경계 상황이 모두 시험에 있는지, `stepMatch` 밖에서 판 상태를 바꾸는 코드가 없는지 본다.

---

## 체크포인트 3: 전송 형식과 방 (Task 9~12)

### Task 9: 표시 상태 전송 형식 (full/tick/lane/mine 만들기와 적용)

**Implementer:** astra

**Files:**
- Create: `packages/logic/src/match/wire.ts`, `parse.ts`, `view.ts` (`index.ts`에서 내보내기)
- Test: `packages/logic/test/parse.test.ts`, `packages/sim/test/view.test.ts`

**읽을 것:** 명세 6장 "명령"과 표, 7장 전체. `packages/logic/src/match/types.ts`, `step.ts`(`LaneStep.combatStart`, `newFires`). `packages/logic/src/effects.ts`의 `speedChange` 이벤트가 나가는 곳.

**Interfaces:**
- Consumes: Task 5 `MatchState`, `StepMatchResult`, `LaneStep`, `MatchEvent`, `Ack`, `MatchCommand`, `MatchResult`, `EliminationCause`; Task 7 `nextAliveSeat`, `gateDeadlineTick`; Task 8 `CoopDriver`(시험); `enemySpeed`, `enemyHp`, `enemyDefFast`, `countNormalEnemies`, `isShared`, `laneOf`, `toTicks`
- Produces — `wire.ts`(타입과 상수):
  ```ts
  export interface UnitView { id: number; defId: string }
  export interface EnemyView { id: number; defId: string; hp: number; maxHp: number; boss: boolean; shared: boolean; d: number; t: number; speed: number }
  export interface FireView { source: string; from: number; to: number; endTick: number }
  export interface LaneView { seat: number; tick: number; open: boolean[]; units: (UnitView | null)[]; enemies: EnemyView[]; fires: FireView[] }
  export interface RowView { seat: number; name: string; status: 'alive' | 'spirit' | 'empty'; connected: boolean; reconnectTicksLeft: number | null; count: number; overLimitTicks: number; received: boolean; cause: EliminationCause | null; eliminatedTick: number | null }
  export interface YeoksinView { stage: number; hp: number; maxHp: number; seat: number | null; enterTick: number; nextSeat: number | null }
  export interface GateView { stage: number; kills: number; deadlineTick: number | null }   // stage 3 = both cleared
  export interface ClockView { tick: number; phase: 'prep' | 'round' | 'ended'; round: number; roundStartTick: number; roundEndTick: number }
  export interface MineView { tick: number; tokens: number; coins: number; buckwheat: number; upgrades: Record<UpgradeId, number>; pendingPity: string[]; grade1Summons: number; helperOpens: number; supportTokens: number; received: boolean; lastSeq: number; open: boolean[]; units: (UnitView | null)[]; acks: Ack[]; supportIn: { from: number; coins: number }[] }
  export interface ClientView { n: number; dataVersion: string; clock: ClockView; rows: RowView[]; gate: GateView; yeoksin: YeoksinView | null; me: { seat: number; key: string }; mine: MineView; watching: number; lane: LaneView; result: MatchResult | null }
  export type FullMsg = ClientView;
  export interface TickMsg { n: number; clock: ClockView; rows: RowView[]; gate: GateView; yeoksin: YeoksinView | null }
  export type LaneEvent =
    | { t: 'spawn'; id: number; defId: string; hp: number; maxHp: number; boss: boolean; d: number; speed: number }
    | { t: 'enter'; id: number; defId: string; hp: number; maxHp: number; d: number; speed: number }
    | { t: 'leave'; id: number } | { t: 'speed'; id: number; d: number; speed: number }
    | { t: 'damage'; id: number; amount: number; source: string; effect?: HitEffect } | { t: 'attack'; unitId: number; id: number }
    | { t: 'kill'; id: number } | { t: 'fire'; source: string; from: number; to: number; endTick: number }
    | { t: 'board'; open: boolean[]; units: (UnitView | null)[] } | { t: 'clear' }
    | { t: 'summon'; unitId: number; defId: string; grade: number; slot: number } | { t: 'combine'; unitId: number; defId: string; slot: number };
  export interface LaneBatch { tick: number; events: LaneEvent[] }
  export interface LaneMsg { n: number; seat: number; batches: LaneBatch[] }
  export type MineMsg = MineView;
  export interface ResultMsg { result: MatchResult }
  export interface LobbyMsg { roomId: string; you: number; hostSeat: number | null; seats: { seat: number; name: string; ready: boolean }[] }
  export type NoticeMsg = { kind: 'replaced' } | { kind: 'rematch'; roomId: string; hostToken?: string } | { kind: 'roomError'; reason: 'notHost' | 'notReady' | 'notInLobby' };
  export interface WireCommand { seq: number; type: string; args?: Record<string, unknown> }
  export type JoinErrorName = 'badName' | 'dupName' | 'roomFull' | 'alreadyStarted' | 'badKey';
  export const JOIN_ERROR_CODES: Record<JoinErrorName, number> = { badName: 4101, dupName: 4102, roomFull: 4103, alreadyStarted: 4104, badKey: 4105 };
  ```
  서버→브라우저 메시지 이름: `lobby`, `full`, `tick`, `lane`, `mine`, `result`(명세 7장 여섯 가지)와 방 알림 `notice`. 브라우저→서버: `cmd`(WireCommand), `ready {ready}`, `start`, `watch {seat}`, `rematch`, `resync`.
- Produces — `parse.ts`:
  - `parseClientCommand(raw: unknown, slotCount = 24): { seq: number; cmd: MatchCommand } | null` — `raw`가 객체가 아니거나 `seq`가 양의 안전 정수가 아니면 null(버림). 그 밖의 형식 오류는 `{ seq, cmd: { type: 'invalid' } }`. 최상위 키는 `seq`, `type`, `args`만 허용한다(그 밖의 키가 있으면 invalid). 허용 형식: `summon`/`convertToken`/`helperOpened`/`forfeit`은 `args` 없음 또는 `{}`; `upgrade {id: UpgradeId}`; `move {from, to: 0..slotCount−1 정수, unitId: 정수, toUnitId: 정수|null}`(모두 필수); `sell {slot, unitId}`(필수); `combine {result: 1~32자 문자열, slot?, unitId?}`(slot과 unitId는 함께 있거나 함께 없음); `support {target: 1..6 정수}`. 모르는 type이나 남는 필드는 invalid. `type`은 `Object.hasOwn`으로 허용 목록에서만 찾는다
  - `toWire(cmd: Command | { type: 'support'; target: number } | { type: 'forfeit' }, lane?: GameState): Omit<WireCommand, 'seq'>` — `move/sell/combine(slot)`에 `lane`의 칸에서 `unitId`(move는 `toUnitId`도)를 채운다
- Produces — `view.ts`:
  - `buildFull(match, seat, opts: { watching: number; names: Record<number, string>; key: string; n: number }): FullMsg` — `clock.tick = match.tick − 1`(처리한 마지막 틱, 시작 전이면 −1). 줄은 1~6 모두(`ring`에 없으면 `status 'empty'`, 이름 `''`). `count` = 생존 자리의 `countNormalEnemies`, 넋 0. `reconnectTicksLeft` = 끊긴 생존자면 `disconnectTick + 3600 − clock.tick`, 아니면 null. `gate.stage` = `yeoksinKills + 1`(3이면 둘 다 통과), `deadlineTick` = 그 단계 `gateDeadlineTick` 또는 null. `yeoksin.nextSeat` = `nextAliveSeat(seat)`. `mine`은 그 자리 고개·자리 상태(acks·supportIn 빈 배열, `tick = clock.tick`). `lane`은 `watching` 고개: 적마다 `d = e.d`, `t = clock.tick`, `speed = enemySpeed(lane, e)`, `shared = isShared`. 난수 상태와 남의 키는 넣지 않는다
  - `buildTick(match, names, n): TickMsg` — `buildFull`과 같은 규칙의 `clock/rows/gate/yeoksin`
  - `class MatchStreamer { constructor(match: MatchState); afterStep(step: StepMatchResult): { lanes: Record<number, LaneEvent[]>; mine: Record<number, MineView | null> } }` — `ring`의 모든 자리에 대해:
    - 고개 이벤트 변환 순서: `events[0, combatStart)` → 이 틱 판 이벤트의 `yeoksinLeave`(그 자리) → `yeoksinEnter`(그 자리, `d = P / stayTicks`, `speed = P / staySeconds`, 이벤트의 hp·maxHp) → `events[combatStart, …)` → `newFires`마다 `fire` → 이 틱에 그 자리가 탈락했으면 `clear` → 칸 열쇠(`open` + 칸별 id·defId)가 지난번과 다르면 `board`
    - `spawn`: `def = enemyDefFast`, `maxHp = hp = enemyHp(def, match.round, balance)`, `boss = def.boss`, `speed = def.speed`, `d = def.speed / 20`(등장한 틱에 한 번 움직였으므로). `speedChange` → `speed`, `damage/attack/kill/summon/combine`은 그대로, `roundStart`는 버린다
    - `mine[seat]`: 이 틱 그 자리 ack가 있거나, 받은 지원이 있거나, 열쇠(자원·강화·보정·`grade1Summons`·`helperOpens`·지원 토큰·`received`·`lastSeq`·칸 열쇠)가 바뀌었으면 `MineView`(`tick = step.tick`, 그 자리 acks, `supportIn`), 아니면 null
  - `applyFull(msg: FullMsg): ClientView` = 깊은 복사
  - `applyTick(view, msg): 'ok' | 'gap'` — `msg.n !== view.n + 1`이면 `'gap'`(바꾸지 않음), 아니면 `n/clock/rows/gate/yeoksin` 교체
  - `applyLane(view, msg): 'ok' | 'gap' | 'ignored'` — `msg.seat !== view.watching`이면 `'ignored'`, `msg.n !== view.n`이면 `'gap'`. `batch.tick > lane.tick`인 묶음만 차례로 적용하고 `lane.tick = batch.tick`. 묶음 끝에 `fires = fires.filter(f => batch.tick < f.endTick)`. 이벤트: `spawn`/`enter` → 적 추가(`t = batch.tick`, enter는 `shared true`), `leave`/`kill` → 제거, `speed` → `d, t = batch.tick, speed` 교체, `damage` → `hp −= amount`, `fire` → 추가, `board` → 교체, `clear` → 칸 모두 null·적·불길 비움. 모르는 id는 무시
  - `applyMine(view, msg): Ack[]` — `msg.tick <= view.mine.tick`이면 무시하고 `[]`. 아니면 교체하고 `msg.acks` 반환
  - `enemyDistanceAt(e: EnemyView, tick: number): number` = `e.d + e.speed × (tick − e.t) / 20`
  - `diffViews(a: ClientView, b: ClientView): string[]` — 다른 곳의 경로 목록(같으면 `[]`). `mine.tick/acks/supportIn`은 비교하지 않는다. 적은 id순으로 맞추고 위치는 `enemyDistanceAt(e, lane.tick)`을 1e-6 안에서 비교, 나머지 필드는 정확히 비교

- [ ] **Step 1: 실패하는 시험을 쓴다**

`packages/logic/test/parse.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, parseClientCommand, toWire } from '../src/index';
import { placeUnitForTest } from '../src/testing';

describe('parseClientCommand', () => {
  test('valid commands', () => {
    expect(parseClientCommand({ seq: 1, type: 'summon' })).toEqual({ seq: 1, cmd: { type: 'summon' } });
    expect(parseClientCommand({ seq: 2, type: 'move', args: { from: 0, to: 5, unitId: 3, toUnitId: null } })).toEqual({ seq: 2, cmd: { type: 'move', from: 0, to: 5, unitId: 3, toUnitId: null } });
    expect(parseClientCommand({ seq: 3, type: 'combine', args: { result: 'gamasot' } })).toEqual({ seq: 3, cmd: { type: 'combine', result: 'gamasot' } });
    expect(parseClientCommand({ seq: 4, type: 'support', args: { target: 2 } })).toEqual({ seq: 4, cmd: { type: 'support', target: 2 } });
  });
  test('unusable seq is dropped', () => {
    for (const raw of [null, 'x', 5, {}, { seq: 0, type: 'summon' }, { seq: 1.5, type: 'summon' }, { seq: -1, type: 'summon' }]) expect(parseClientCommand(raw)).toBeNull();
  });
  test('bad content becomes invalid', () => {
    const bad = [
      { seq: 1, type: '__proto__' }, { seq: 1, type: 'toString' }, { seq: 1, type: 'nope' },
      { seq: 1, type: 'move', args: { from: '3', to: 1, unitId: 1, toUnitId: null } },
      { seq: 1, type: 'move', args: { from: 0, to: 24, unitId: 1, toUnitId: null } },
      { seq: 1, type: 'sell', args: { slot: 0 } }, { seq: 1, type: 'summon', args: { extra: 1 } },
      { seq: 1, type: 'combine', args: { result: 'gamasot', slot: 2 } }, { seq: 1, type: 'support', args: { target: 7 } },
      { seq: 1, type: 'upgrade', args: { id: 'speed' } }, { seq: 1, type: 'summon', seat: 2 },
    ];
    for (const raw of bad) expect(parseClientCommand(raw)).toEqual({ seq: 1, cmd: { type: 'invalid' } });
  });
  test('toWire fills unit ids from the lane', () => {
    const s = createGame(loadGameData('stage2'), 1);
    const u = placeUnitForTest(s, 'sotlid', 0); const v = placeUnitForTest(s, 'ki', 5);
    expect(toWire({ type: 'move', from: 0, to: 5 }, s)).toEqual({ type: 'move', args: { from: 0, to: 5, unitId: u.id, toUnitId: v.id } });
    expect(toWire({ type: 'sell', slot: 5 }, s)).toEqual({ type: 'sell', args: { slot: 5, unitId: v.id } });
    expect(toWire({ type: 'summon' })).toEqual({ type: 'summon' });
  });
});
```

`packages/sim/test/view.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import {
  applyFull, applyLane, applyMine, applyTick, buildFull, buildTick, createMatch, diffViews, loadGameData, MatchStreamer, stepMatch,
  type ClientView, type LaneBatch,
} from '@dorandi/logic';
import { CoopDriver } from '../src/coop';

const data = loadGameData('stage2');
const names = { 1: '가', 2: '나', 3: '다' };

describe('view stream', () => {
  test('initial full + tick/lane/mine stream equals a fresh full every 100 ticks; a spirit switches lanes', () => {
    const m = createMatch(data, 8, [1, 2, 3]);
    const drv = new CoopDriver(m, ['normal', 'normal', 'clumsy']);
    const streamer = new MatchStreamer(m);
    const watching: Record<number, number> = { 1: 1, 2: 2, 3: 3 };
    const views: Record<number, ClientView> = {};
    for (const s of [1, 2, 3]) views[s] = applyFull(buildFull(m, s, { watching: s, names, key: 'k', n: 0 }));
    const pending: Record<number, LaneBatch[]> = { 1: [], 2: [], 3: [] };
    let n = 0;
    while (m.tick < 6000 && !m.result) {
      if (m.tick === 2000) drv.queue(3, { type: 'forfeit' });
      const step = stepMatch(m, drv.inputs());
      const out = streamer.afterStep(step);
      for (const s of [1, 2, 3]) {
        const mine = out.mine[s]; if (mine) applyMine(views[s]!, mine);
        pending[s]!.push({ tick: step.tick, events: out.lanes[s] ?? [] });
      }
      if (step.tick % 2 === 1) {
        n++;
        const tick = buildTick(m, names, n);
        for (const s of [1, 2, 3]) {
          expect(applyTick(views[s]!, tick)).toBe('ok');
          expect(applyLane(views[s]!, { n, seat: watching[s]!, batches: pending[watching[s]!]! })).toBe('ok');
        }
        for (const s of [1, 2, 3]) pending[s] = [];
        if (m.tick === 3000) { watching[3] = 1; views[3] = applyFull(buildFull(m, 3, { watching: 1, names, key: 'k', n })); }
        if (m.tick % 100 === 0) for (const s of [1, 2, 3]) {
          const fresh = applyFull(buildFull(m, s, { watching: watching[s]!, names, key: 'k', n }));
          expect(diffViews(views[s]!, fresh), `seat ${s} tick ${m.tick}`).toEqual([]);
        }
      }
    }
    expect(m.seats[3]!.alive).toBe(false);
  }, 120_000);
  test('a skipped update number is a gap and changes nothing', () => {
    const m = createMatch(data, 1, [1]);
    const v = applyFull(buildFull(m, 1, { watching: 1, names, key: 'k', n: 0 }));
    stepMatch(m, []); stepMatch(m, []);
    expect(applyTick(v, buildTick(m, names, 2))).toBe('gap');
    expect(v.n).toBe(0);
    expect(applyLane(v, { n: 2, seat: 1, batches: [] })).toBe('gap');
    expect(applyLane(v, { n: 0, seat: 2, batches: [] })).toBe('ignored');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/logic/test/parse.test.ts packages/sim/test/view.test.ts`
Expected: FAIL, 내보낸 이름 없음

- [ ] **Step 3: `wire.ts`, `parse.ts`, `view.ts`를 구현한다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run && npm run typecheck`
Expected: 전체 PASS. 첫 시험이 실패하면 메시지의 자리·틱과 `diffViews` 경로로 원인을 찾는다(대개 이벤트 순서나 등장 직후 위치)

- [ ] **Step 5: 커밋한다**

```bash
git add packages/logic packages/sim/test/view.test.ts
git commit -m "feat(logic): wire messages, command parsing and streamed client views"
```

---

### Task 10: 서버 패키지와 Colyseus 방 동작 확인

**Implementer:** astra

**Files:**
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`
- Modify: 루트 `package.json` (scripts), `package-lock.json`
- Test: `packages/server/test/colyseus-probe.test.ts`

**읽을 것:** 명세 6장 "서버 구성". Colyseus 0.18 타입: `node_modules/@colyseus/core/build/Room.d.ts`(`maxClients`, `autoDispose`, `lock`, `onJoin`, `onDrop`, `onLeave`), `node_modules/@colyseus/testing/build/TestServer.d.ts`(`boot`, `sdk`, `createRoom`, `getRoomById`), `node_modules/@colyseus/sdk/build/Client.d.ts`(`create`, `joinById`), `node_modules/@colyseus/shared-types/build/Protocol.d.ts`(`CloseCode.CONSENTED = 4000`).

**Interfaces:**
- Produces:
  - `packages/server/package.json`: name `@dorandi/server`, `"type": "module"`, `"private": true`, `"engines": { "node": ">=22" }`, dependencies `"@dorandi/logic": "*"`, `"colyseus": "0.18.12"`, `"express": "^5.1.0"`, devDependencies `"@colyseus/testing": "0.18.6"`, `"@colyseus/sdk": "0.18.10"`, scripts `"dev": "tsx watch src/main.ts"`, `"start": "tsx src/main.ts"`, `"load": "tsx scripts/load.ts"`
  - `packages/server/tsconfig.json`: logic과 같은 형태(`lib ES2022`, `types ["node"]`, `include ["src", "test", "scripts"]`)
  - 루트 scripts: `"dev:server": "npm run dev -w @dorandi/server"`, `"start": "npm run build -w @dorandi/client && npm run start -w @dorandi/server"`, `typecheck`에 `&& tsc -p packages/server` 추가
- 이 Task의 시험 결과가 Task 11~13의 방 설계 근거다: `maxClients 12`, `lock()` 안 씀, 입장 오류는 `onJoin`에서 throw, 끊김은 `onLeave`의 code로 구분

- [ ] **Step 1: 패키지를 만들고 설치한다**

Run: `npm install`
Expected: 오류 없이 끝나고 `node_modules/colyseus/package.json`의 version이 `0.18.12`, `node_modules/@colyseus/sdk/package.json`이 `0.18.10`

- [ ] **Step 2: 확인 시험을 쓴다**

시험 안에 작은 방 `ProbeRoom extends Room`을 정의한다: `onCreate(o)`에서 `this.maxClients = o.max ?? 12`, `this.autoDispose = o.autoDispose ?? true`; `onJoin(_c, o)`에서 `o.fail`이면 `throw new ServerError(4103, 'roomFull')`; `onLeave(c, code)`에서 code를 방 배열 `leaves`에 넣는다; `onDispose`에서 전역 `disposed`에 roomId를 넣는다. 메시지 `'lock'`을 받으면 `this.lock()`. `boot(defineServer({ rooms: { probe: defineRoom(ProbeRoom) } }), 2601)`.

```ts
describe('colyseus 0.18 room behaviour this design relies on', () => {
  test('joinById into a locked room is refused', async () => {
    const a = await colyseus.sdk.create('probe', {});
    a.send('lock'); await waitFor(() => colyseus.getRoomById(a.roomId).locked);
    await expect(colyseus.sdk.joinById(a.roomId, {})).rejects.toBeTruthy();
  });
  test('joinById into a full room (maxClients reached) is refused', async () => {
    const a = await colyseus.sdk.create('probe', { max: 1 });
    await expect(colyseus.sdk.joinById(a.roomId, {})).rejects.toBeTruthy();
  });
  test('joinById works below maxClients even after other clients joined and left', async () => {
    const a = await colyseus.sdk.create('probe', { max: 2, autoDispose: false });
    const b = await colyseus.sdk.joinById(a.roomId, {}); await b.leave();
    const c = await colyseus.sdk.joinById(a.roomId, {});
    expect(c.roomId).toBe(a.roomId);
  });
  test('autoDispose false keeps an empty room; true disposes it', async () => {
    const keep = await colyseus.sdk.create('probe', { autoDispose: false }); const keepId = keep.roomId; await keep.leave();
    const drop = await colyseus.sdk.create('probe', {}); const dropId = drop.roomId; await drop.leave();
    await waitFor(() => disposed.includes(dropId));
    expect(disposed).not.toContain(keepId);
    expect(colyseus.getRoomById(keepId)).toBeTruthy();
  });
  test('a non-consented drop reaches onLeave with a code other than CONSENTED (4000)', async () => {
    const a = await colyseus.sdk.create('probe', { autoDispose: false }); const room = colyseus.getRoomById(a.roomId) as ProbeRoom;
    a.reconnection.enabled = false;
    await a.leave(false);
    await waitFor(() => room.leaves.length === 1);
    expect(room.leaves[0]).not.toBe(4000);
    const b = await colyseus.sdk.joinById(a.roomId, {}); await b.leave(true);
    await waitFor(() => room.leaves.length === 2);
    expect(room.leaves[1]).toBe(4000);
  });
  test('an error thrown in onJoin reaches the SDK client with its code', async () => {
    const a = await colyseus.sdk.create('probe', {});
    await expect(colyseus.sdk.joinById(a.roomId, { fail: true })).rejects.toMatchObject({ code: 4103 });
  });
});
```

`waitFor(fn, ms = 2000)`은 시험 파일 안의 작은 폴링 도우미(10ms 간격). `beforeAll`에서 boot, `afterEach`에서 `colyseus.cleanup()`, `afterAll`에서 `shutdown()`.

- [ ] **Step 3: 실행한다**

Run: `npx vitest run packages/server/test/colyseus-probe.test.ts`
Expected: PASS 6개. 하나라도 다르면 **멈추고 결과를 보고한다**(명세 6장의 방 설계가 이 가정에 기대고 있다). `leave(false)`나 `reconnection` 이름처럼 API 철자만 다른 경우는 d.ts를 보고 시험을 고쳐도 된다

- [ ] **Step 4: 전체 확인**

Run: `npx vitest run && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add packages/server package.json package-lock.json
git commit -m "chore(server): add server package and verify colyseus 0.18 room behaviour"
```

---

### Task 11: 대기실 RoomCore와 Colyseus 어댑터, 정적 파일

**Implementer:** astra

**Files:**
- Create: `packages/logic/src/match/nickname.ts` (`index.ts`에서 내보내기)
- Create: `packages/server/src/core/RoomCore.ts`, `packages/server/src/MatchRoom.ts`, `packages/server/src/server.ts`, `packages/server/src/main.ts`
- Create: `packages/server/test/helpers.ts`
- Test: `packages/logic/test/nickname.test.ts`, `packages/server/test/lobby.test.ts`, `packages/server/test/server.test.ts`

**읽을 것:** 명세 6장 "서버 구성"·"대기실", 11장 결정 10. Task 10 시험 결과. `packages/logic/src/match/wire.ts`(`LobbyMsg`, `NoticeMsg`, `JOIN_ERROR_CODES`, `FullMsg`), `view.ts`(`buildFull`).

**Interfaces:**
- Consumes: Task 9 `LobbyMsg`, `NoticeMsg`, `JOIN_ERROR_CODES`, `JoinErrorName`, `buildFull`; Task 5 `createMatch`; Task 3 `loadGameData('stage2')`; Task 5 `jumpToTick`(`@dorandi/logic/testing`, 개발 옵션)
- Produces:
  - `normalizeNickname(raw: unknown): string | null` — 문자열이 아니면 null. trim → `normalize('NFC')` → 정규식 불일치면 null
  - `sameNickname(a: string, b: string): boolean` = `a.toLowerCase() === b.toLowerCase()`
  - `RoomCore.ts`:
    ```ts
    export interface ClientLink { id: string; send(type: string, msg: unknown): void; close(code?: number): void }
    export interface RoomDeps { now(): number; random128(): string; randomSeed(): number; createRematchRoom(opts: { hostToken: string }): Promise<string>; setAutoDispose(v: boolean): void; dispose(): void; dev: boolean }
    export interface RoomOptions { seed?: number; hostToken?: string; devJumpTick?: number; devNoElimination?: boolean }
    export interface JoinOptions { name?: unknown; rejoinKey?: unknown; hostToken?: unknown }
    export class JoinError extends Error { constructor(public reason: JoinErrorName) }
    export class RoomCore {
      constructor(roomId: string, deps: RoomDeps, options?: RoomOptions);
      phase: 'lobby' | 'playing' | 'result' | 'closed';
      match: MatchState | null;
      join(link: ClientLink, opts: JoinOptions): void;          // throws JoinError
      leave(linkId: string, consented: boolean): void;
      message(linkId: string, type: string, payload: unknown): void;
      advance(): void;                                          // Task 12
    }
    ```
  - `MatchRoom.ts`: `class MatchRoom extends Room` — `maxClients = 12`. `onCreate(options)`에서 `RoomCore`를 만든다: `now = () => performance.now()`, `random128 = () => randomBytes(16).toString('hex')`, `randomSeed = () => randomBytes(4).readUInt32LE(0)`, `createRematchRoom = async o => (await matchMaker.createRoom('match', o)).roomId`, `setAutoDispose = v => { this.autoDispose = v }`, `dispose = () => this.disconnect()`, `dev = process.env.DORANDI_DEV === '1'`. `this.clock.setInterval(() => core.advance(), 10)`. `onJoin(client, options)` → `core.join(link, options)`, `JoinError`면 `throw new ServerError(JOIN_ERROR_CODES[e.reason], e.reason)`. `onLeave(client, code)` → `core.leave(client.sessionId, code === CloseCode.CONSENTED)`. `onMessage('*', (client, type, msg) => core.message(client.sessionId, String(type), msg))`. `link = { id: client.sessionId, send: (t, m) => client.send(t, m), close: c => client.leave(c) }`
  - `server.ts`: `createGameServer(opts: { clientDist?: string } = {}): Server` — `defineServer({ rooms: { match: defineRoom(MatchRoom) }, express: app => … })`. `clientDist`가 있으면 `express.static(clientDist)` 뒤에, GET이고 경로가 `/matchmake`로 시작하지 않고 확장자가 없으면 `index.html`을 보낸다(express 5 와일드카드 문법 대신 미들웨어 함수로)
  - `main.ts`: `createGameServer({ clientDist: <repo>/packages/client/dist }).listen(Number(process.env.PORT ?? 2567))`
  - `test/helpers.ts`: `class FakeLink implements ClientLink { sent: { type: string; msg: any }[]; closed: number | null; last(type: string): any; all(type: string): any[] }`, `fakeDeps(over?: Partial<RoomDeps>): RoomDeps & { clock: { t: number }; disposed: boolean; autoDispose: boolean }`(now는 `clock.t`, `random128`은 `'key-1'`, `'key-2'`… 차례, `randomSeed` 42, `createRematchRoom`은 호출 수를 세는 `vi.fn(async () => 'room-2')`, `setAutoDispose`는 `autoDispose`(처음 true)에 값을 적고, `dispose`는 `disposed = true`)
- 대기실 규칙(명세 6장):
  - `join`(phase lobby): `normalizeNickname(name)`이 null이면 `badName`, 같은 이름(`sameNickname`) 있으면 `dupName`, 6자리가 차면 `roomFull`. 1~6 중 가장 작은 빈 번호. 첫 입장자 또는 `options.hostToken`과 같은 `hostToken`으로 들어온 사람이 방장(후자는 앞서 들어온 방장보다 우선). 모두에게 `lobby`(자기 `you`가 다르므로 사람마다 따로)
  - `join`(phase playing/result): `rejoinKey`가 없으면 `alreadyStarted`(자리가 가득 찬 대기실은 `roomFull`). 키 경로는 Task 13
  - `leave`(lobby): 자리를 비우고 방장은 남은 최소 번호. 아무도 없으면 `deps.dispose()`
  - `message`: `ready {ready: boolean}`은 대기실 참가자, `start`는 방장이고 참가자 모두(방장 포함) 준비면 시작. 아니면 `notice {kind: 'roomError', reason: 'notHost' | 'notReady'}`. 대기실이 아닐 때 `ready/start`는 `notInLobby`
  - 시작: `phase 'playing'`, `seed` = `deps.dev && options.seed !== undefined ? options.seed : deps.randomSeed()`, `createMatch(loadGameData('stage2'), seed, 자리들, { noElimination: deps.dev && options.devNoElimination })`, 개발 모드에서 `devJumpTick`이 있으면 `jumpToTick`. `deps.setAutoDispose(false)`. 자리마다 `random128()` 키. 각자에게 `buildFull(match, seat, { watching: seat, names, key, n: 0 })`를 `full`로. 두 번째 `start`는 무시

- [ ] **Step 1: 실패하는 시험을 쓴다**

`packages/logic/test/nickname.test.ts`:

```ts
import { expect, test } from 'vitest';
import { normalizeNickname, sameNickname } from '../src/index';

test('nickname rules', () => {
  expect(normalizeNickname('  도깨비1 ')).toBe('도깨비1');
  expect(normalizeNickname('\u1100\u1161')).toBe('가');
  for (const bad of ['', '   ', '가나다라마바사아자', 'ab cd', '😀', 'ㄱ', 5, null]) expect(normalizeNickname(bad)).toBeNull();
  expect(sameNickname('Abc', 'aBC')).toBe(true);
  expect(sameNickname('가', '나')).toBe(false);
});
```

`packages/server/test/lobby.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { RoomCore, JoinError } from '../src/core/RoomCore';
import { FakeLink, fakeDeps } from './helpers';

const room = (over = {}, options = {}) => { const deps = fakeDeps(over); return { deps, core: new RoomCore('room-1', deps, options) }; };
const joinErr = (fn: () => void) => { try { fn(); } catch (e) { return (e as JoinError).reason; } return null; };

describe('lobby', () => {
  test('seats, host, duplicate names (case-insensitive), 7th join', () => {
    const { core } = room();
    const links = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => new FakeLink(id));
    links.forEach((l, i) => core.join(l, { name: `P${i}` }));
    expect(links[0]!.last('lobby')).toMatchObject({ you: 1, hostSeat: 1, seats: [{ seat: 1, name: 'P0', ready: false }, { seat: 2 }, { seat: 3 }, { seat: 4 }, { seat: 5 }, { seat: 6 }] });
    expect(joinErr(() => core.join(new FakeLink('g'), { name: 'Q' }))).toBe('roomFull');
    core.leave('a', true); core.leave('c', true);
    expect(links[1]!.last('lobby')).toMatchObject({ hostSeat: 2 });
    expect(joinErr(() => core.join(new FakeLink('h'), { name: 'p1' }))).toBe('dupName');
    expect(joinErr(() => core.join(new FakeLink('i'), { name: ' ' }))).toBe('badName');
    const n = new FakeLink('j'); core.join(n, { name: '새' });
    expect(n.last('lobby')!.you).toBe(1);
  });
  test('start needs host and everyone ready; double start makes one match', () => {
    const { core, deps } = room();
    const a = new FakeLink('a'), b = new FakeLink('b');
    core.join(a, { name: '가' }); core.join(b, { name: '나' });
    core.message('b', 'start', {});
    expect(b.last('notice')).toEqual({ kind: 'roomError', reason: 'notHost' });
    core.message('a', 'ready', { ready: true }); core.message('a', 'start', {});
    expect(a.last('notice')).toEqual({ kind: 'roomError', reason: 'notReady' });
    core.message('b', 'ready', { ready: true });
    core.message('a', 'start', {}); core.message('a', 'start', {});
    expect(core.phase).toBe('playing');
    expect(a.all('full').length).toBe(1);
    expect(a.last('full')).toMatchObject({ me: { seat: 1 }, watching: 1, clock: { tick: -1 } });
    expect(a.last('full').me.key).not.toBe(b.last('full').me.key);
    expect(core.match!.ring).toEqual([1, 2]);
    expect(deps.autoDispose).toBe(false);
  });
  test('one player can start alone', () => {
    const { core } = room(); const a = new FakeLink('a');
    core.join(a, { name: '혼자' }); core.message('a', 'ready', { ready: true }); core.message('a', 'start', {});
    expect(core.match!.ring).toEqual([1]);
  });
  test('after start a new name cannot join', () => {
    const { core } = room(); const a = new FakeLink('a');
    core.join(a, { name: '가' }); core.message('a', 'ready', { ready: true }); core.message('a', 'start', {});
    expect(joinErr(() => core.join(new FakeLink('b'), { name: '나' }))).toBe('alreadyStarted');
  });
  test('seed option only in dev mode; empty lobby disposes', () => {
    const prod = room({}, { seed: 7 }); const a = new FakeLink('a');
    prod.core.join(a, { name: '가' }); prod.core.message('a', 'ready', { ready: true }); prod.core.message('a', 'start', {});
    expect(prod.core.match!.seed).toBe(42);
    const dev = room({ dev: true }, { seed: 7 }); const b = new FakeLink('b');
    dev.core.join(b, { name: '가' }); dev.core.message('b', 'ready', { ready: true }); dev.core.message('b', 'start', {});
    expect(dev.core.match!.seed).toBe(7);
    const empty = room(); const c = new FakeLink('c');
    empty.core.join(c, { name: '가' }); empty.core.leave('c', false);
    expect(empty.deps.disposed).toBe(true);
  });
  test('rematch host token outranks earlier joiners', () => {
    const { core } = room({}, { hostToken: 'tok' });
    const a = new FakeLink('a'), b = new FakeLink('b');
    core.join(a, { name: '가' }); core.join(b, { name: '나', hostToken: 'tok' });
    expect(a.last('lobby')!.hostSeat).toBe(2);
  });
});
```

`packages/server/test/server.test.ts` (실제 소켓, `boot(createGameServer({ clientDist: tmp }), 2602)`, `tmp`는 `index.html`만 든 임시 폴더):

```ts
test('create, joinById, ready and start through the real server', async () => {
  const a = await colyseus.sdk.create('match', { name: '가' });
  const fullA = new Promise(res => a.onMessage('full', res));
  const b = await colyseus.sdk.joinById(a.roomId, { name: '나' });
  a.send('ready', { ready: true }); b.send('ready', { ready: true }); a.send('start', {});
  expect(await fullA).toMatchObject({ me: { seat: 1 } });
});
test('join errors reach the SDK with their codes', async () => {
  const a = await colyseus.sdk.create('match', { name: 'Abc' });
  await expect(colyseus.sdk.joinById(a.roomId, { name: 'aBC' })).rejects.toMatchObject({ code: 4102 });
  await expect(colyseus.sdk.joinById(a.roomId, { name: '' })).rejects.toMatchObject({ code: 4101 });
});
test('unknown paths serve index.html, matchmaking still works', async () => {
  const res = await fetch('http://localhost:2602/room/abc');
  expect(res.status).toBe(200); expect(await res.text()).toContain('<!doctype html>');
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/logic/test/nickname.test.ts packages/server/test/lobby.test.ts packages/server/test/server.test.ts`
Expected: FAIL, 모듈 없음

- [ ] **Step 3: `nickname.ts`, `RoomCore`(대기실 부분), `MatchRoom`, `server.ts`, `main.ts`, 도우미를 구현한다**

`advance()`는 이 Task에서 빈 함수다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run && npm run typecheck`
Expected: 전체 PASS

- [ ] **Step 5: 서버를 띄워 본다**

Run: `npm run build -w @dorandi/client` 그다음 `npm run start -w @dorandi/server`(백그라운드), `curl -s http://localhost:2567/room/xyz`
Expected: 1단계 `index.html`이 돌아온다. 확인 뒤 서버를 끈다

- [ ] **Step 6: 커밋한다**

```bash
git add packages/logic packages/server
git commit -m "feat(server): lobby room core, colyseus adapter and static client"
```

---

### Task 12: 진행 중 방 — 틱 시계, 입력 큐, 메시지

**Implementer:** astra

**Files:**
- Modify: `packages/server/src/core/RoomCore.ts`, `packages/server/test/helpers.ts`, `packages/server/package.json`
- Test: `packages/server/test/match-room.test.ts`

**읽을 것:** 명세 6장 "명령"(큐·순번·20개 제한·기록), 7장(메시지 표, 갱신 번호, `full` 재전송), 4장 1단계, 10장 "Colyseus 방 통합 시험"의 입력 순서·복구·한 판 전체 줄. `packages/logic/src/match/view.ts`, `parse.ts`, `replay.ts`.

**Interfaces:**
- Consumes: Task 11 `RoomCore`, `ClientLink`, `RoomDeps`, `FakeLink`, `fakeDeps`; Task 9 `parseClientCommand`, `toWire`, `buildFull`, `buildTick`, `MatchStreamer`, `applyFull`, `applyTick`, `applyLane`, `applyMine`, `diffViews`, 메시지 타입; Task 8 `replayMatch`, `InputLogEntry`; 시험의 봇은 `CoopDriver` 대신 sim의 `normalBot`을 방 메시지로 돌린다(`@dorandi/sim/src/bots` 경로로 import, `packages/server/package.json` devDependencies에 `"@dorandi/sim": "*"` 추가); Task 5 `stepMatch`, `matchHash`
- Produces (`RoomCore`에 더한다):
  - 읽기용: `log: InputLogEntry[]`, `n: number`
  - `advance()`: phase가 `playing`이면 `while (deps.now() − lastTickAt >= 50) { lastTickAt += 50; runTick(); }`(밀린 틱을 건너뛰지 않음). `result`이면 결과 120초 뒤 `phase 'closed'`, `deps.dispose()`. 시작 시 `lastTickAt = deps.now()`
  - `runTick()` 순서:
    1. `inputs = queue.splice(0)`, `step = stepMatch(match, inputs)`, 입력이 있으면 `log.push({ tick: step.tick, inputs })`
    2. `out = streamer.afterStep(step)`. 자리마다 `out.mine[seat]`가 있으면 그 자리 연결에 즉시 `mine`
    3. `out.lanes`를 자리별 대기 묶음 `{ tick, events }`에 쌓는다
    4. 넋의 관전 고개가 탈락했거나 자기 고개면 `watching` = 최소 번호 생존 자리로 바꾸고 `full`이 필요하다고 표시(생존자는 항상 자기 고개)
    5. `step.tick % 2 === 1`이면 `n += 1`, 모든 연결에 `tick`(`buildTick`), 각 연결에 그 연결의 관전 고개 묶음으로 `lane {n, seat, batches}`. 대기 묶음을 비운다
    6. `full`이 필요한 연결에 `buildFull(…, { n })`
    7. `match.result`가 처음 생겼으면 `phase 'result'`, 결과 시각 기록, 모두에게 `result`
  - `message(linkId, 'cmd', raw)`: 자리에 묶인 현재 연결이고 `playing`일 때만. `parseClientCommand(raw)`가 null이면 버린다. 그 자리의 이번 큐 입력이 이미 `maxCommandsPerTick`(20)개면 버린다. 아니면 `queue.push({ seat, seq, cmd })`
  - `watch {seat}`: 넋이고 대상이 생존 자리면 `watching = seat`, 즉시 `full`. 그 밖은 무시
  - `resync`: 즉시 `full`
  - 모르는 메시지 이름과 자리 없는 연결의 메시지는 무시한다. 어떤 payload도 throw하지 않는다

- [ ] **Step 1: 실패하는 시험을 쓴다**

시험 도우미(`test/helpers.ts`에 더한다. Task 13도 쓴다): `started(names: string[], depsOver: Partial<RoomDeps> = {}, options: RoomOptions = {}): { core: RoomCore; deps: ReturnType<typeof fakeDeps>; links: FakeLink[] }` — 링크 id를 `'a'`, `'b'`, …로 만들어 입장·준비·시작한다. `tickOnce(core, deps)` — `deps.clock.t += 50; core.advance()`. `ticks(r: { core; deps }, k: number)` — `tickOnce`를 k번. `send(core, id, seq, type, args?)` — `core.message(id, 'cmd', args === undefined ? { seq, type } : { seq, type, args })`.

```ts
describe('match room', () => {
  test('commands go to the next tick and the mine ack arrives right after that tick', () => {
    const { core, deps, links: [a] } = started(['가']);
    send(core, 'a', 1, 'summon');
    expect(a!.all('mine').length).toBe(0);
    tickOnce(core, deps);
    expect(a!.last('mine')).toMatchObject({ tick: 0, acks: [{ seat: 1, seq: 1, tick: 0, ok: true }], tokens: 3 });
    expect(core.log).toEqual([{ tick: 0, inputs: [{ seat: 1, seq: 1, cmd: { type: 'summon' } }] }]);
  });
  test('a command after the tick closes is logged on the next tick', () => {
    const { core, deps } = started(['가']);
    tickOnce(core, deps); send(core, 'a', 1, 'summon'); tickOnce(core, deps);
    expect(core.log[0]!.tick).toBe(1);
  });
  test('same-tick combine/sell conflict applies once; the rejected one costs nothing', () => {
    const { core, deps, links: [a] } = started(['가']);
    const lane = core.match!.lanes[1]!;
    const s = placeUnitForTest(lane, 'sotlid', 0); const b = placeUnitForTest(lane, 'bujigaengi', 1);
    send(core, 'a', 1, 'combine', { result: 'gamasot', slot: 0, unitId: s.id });
    send(core, 'a', 2, 'sell', { slot: 1, unitId: b.id });
    tickOnce(core, deps);
    expect(a!.last('mine').acks.map((x: Ack) => (x.ok ? 'ok' : x.reason))).toEqual(['ok', 'staleUnit']);
    expect(lane.coins).toBe(0); expect(lane.slots[0]!.defId).toBe('gamasot');
  });
  test('duplicate seq is not re-run; seats come from the connection, not the payload', () => {
    const { core, deps, links: [a, b] } = started(['가', '나']);
    send(core, 'a', 1, 'summon'); send(core, 'a', 1, 'summon');
    core.message('b', 'cmd', { seq: 1, type: 'summon', seat: 1 });
    tickOnce(core, deps);
    expect(core.match!.lanes[1]!.tokens).toBe(3);
    expect(b!.last('mine').acks).toEqual([{ seat: 2, seq: 1, tick: 0, ok: false, reason: 'badArgs' }]);
  });
  test('the 21st command in one tick is dropped without an ack', () => {
    const { core, deps, links: [a] } = started(['가']);
    for (let i = 1; i <= 21; i++) send(core, 'a', i, 'helperOpened');
    tickOnce(core, deps);
    expect(a!.last('mine').acks.length).toBe(20);
    expect(core.match!.lanes[1]!.helperOpens).toBe(20);
  });
  test('garbled messages never throw and only well-numbered ones get badArgs (review focus 4)', () => {
    const { core, deps, links: [a] } = started(['가']);
    for (const raw of [null, 'x', { seq: 1.5 }, { seq: 1, type: '__proto__' }, { seq: 2, type: 'move', args: { from: '3', to: 1, unitId: 1, toUnitId: null } }]) core.message('a', 'cmd', raw);
    core.message('a', 'nope', { x: 1 }); core.message('zzz', 'cmd', { seq: 1, type: 'summon' });
    tickOnce(core, deps);
    expect(a!.last('mine').acks.map((x: Ack) => (x.ok ? x.seq : `${x.seq}:${x.reason}`))).toEqual(['1:badArgs', '2:badArgs']);
    tickOnce(core, deps); expect(core.match!.tick).toBe(2);
  });
  test('a 2 s stall runs all 40 ticks and sends 20 numbered updates in order (review focus 2)', () => {
    const { core, deps, links: [a] } = started(['가']);
    deps.clock.t += 2000; core.advance();
    expect(core.match!.tick).toBe(40);
    expect(a!.all('tick').map((m: TickMsg) => m.n)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
  test('initial full + stream equals a new full; a skipped update is answered by resync', () => {
    const { core, deps, links: [a] } = started(['가', '나']);
    let view = applyFull(a!.last('full'));
    let seen = 0;
    const pump = () => { for (const { type, msg } of a!.sent.slice(seen)) {
      if (type === 'tick') applyTick(view, msg); if (type === 'lane') applyLane(view, msg); if (type === 'mine') applyMine(view, msg); }
      seen = a!.sent.length; };
    for (let i = 0; i < 300; i++) { if (i % 37 === 0) send(core, 'a', i / 37 + 1, 'summon'); tickOnce(core, deps); pump(); }
    core.message('a', 'resync', {});
    expect(diffViews(view, applyFull(a!.last('full')))).toEqual([]);
    view = applyFull(a!.last('full')); seen = a!.sent.length;
    tickOnce(core, deps); tickOnce(core, deps); a!.sent.splice(seen);
    tickOnce(core, deps); tickOnce(core, deps);
    expect(applyTick(view, a!.last('tick'))).toBe('gap');
  });
  test('whole game: 6 normal bots through the room; clients match the server full every 100 ticks; replay matches', () => {
    // 6 links, normalBot per seat deciding on the server lane every 10 ticks, commands sent with toWire + seq.
    // Seat 6 forfeits at tick 3000, then sends watch to 2 at 4000 and to 3 at 6000.
    // Each link applies every tick/lane/mine/full it receives into its own ClientView.
    // At every tick % 100 === 0 (after the batch), compare diffViews(linkView, applyFull(buildFull(core.match, seat, {watching, names, key, n: core.n}))) to [].
    // At the end: replayMatch(data, core.match.seed, ring, core.log) equals the hashes recorded by core every 100 ticks;
    // on mismatch, fail with the first differing tick in the message.
  }, 300_000);
});
```

마지막 시험은 위 주석대로 작성한다. 서버 해시는 시험이 `tickOnce`마다 `core.match.tick % 100 === 0`일 때 `matchHash(core.match)`를 모아 둔다, 판이 끝난 틱이 100의 배수가 아니면 끝에 `[core.match.tick, matchHash(core.match)]`를 한 번 더 넣는다(Task 8 `replayMatch`와 같은 규칙). 각 링크의 관전 고개와 키는 마지막으로 받은 `full`에서 읽는다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/server/test/match-room.test.ts`
Expected: FAIL (`advance`가 비어 있음)

- [ ] **Step 3: `advance`, `runTick`, 입력 큐, `watch`, `resync`를 구현한다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run && npm run typecheck`
Expected: 전체 PASS

- [ ] **Step 5: 커밋한다**

```bash
git add packages/server
git commit -m "feat(server): fixed-step match loop, input queue and message fan-out"
```

**체크포인트 3 리뷰:** 브라우저 상태가 서버 `full`과 한 판 내내 같은지(Task 9·12 시험), 깨진 입력이 방을 멈추지 않는지, 밀린 틱을 건너뛰지 않는지, Colyseus 확인 시험 6개가 모두 기대대로였는지 본다.

---

## 체크포인트 4: 복귀·다시 하기와 온라인 화면 (Task 13~16)

### Task 13: 단절·복귀 키·결과 보관·다시 하기

**Implementer:** astra

**Files:**
- Modify: `packages/server/src/core/RoomCore.ts`
- Test: `packages/server/test/rejoin.test.ts`

**읽을 것:** 명세 6장 "진행 중 이탈" 전체, 10장 방 통합 시험의 단절·종료와 다음 판 줄. Task 12의 `runTick`.

**Interfaces:**
- Consumes: Task 11·12 `RoomCore`, `FakeLink`, `fakeDeps`; Task 9 `NoticeMsg`, `buildFull`; Task 6 단절 규칙(로직이 기한을 판정)
- Produces (`RoomCore` 동작):
  - `leave(linkId, consented)`(playing): 그 연결이 자리의 현재 연결이면 묶음을 풀고 `queue.push({ seat, seq: 0, cmd: { type: 'disconnect' } })`. `consented` 여부와 상관없이 단절로 처리한다(명시적 포기는 `forfeit` 명령으로 먼저 온다). result 단계에서는 묶음만 푼다
  - `join(link, { rejoinKey })`(playing/result): 키가 맞는 자리가 없으면 `badKey`. 맞으면 새 키(`random128`)로 바꾸고, 옛 연결이 있으면 옛 연결에 `notice {kind: 'replaced'}`를 보내고 `close(4001)`하며 묶음을 푼다(이후 그 연결의 메시지는 무시). 자리가 끊긴 상태였으면 `reconnect`(seq 0)를 큐에 넣는다. `playing`이면 다음 `runTick` 끝에 `full`(그 틱까지 받은 입력을 먼저 처리한 뒤), `result`면 즉시 `full`(결과 포함). 닉네임만으로는 자리를 되찾을 수 없다
  - 결과 뒤 120초(`coop.resultSeconds`)가 지나면 `closed`, `deps.dispose()`. 이후 키는 쓸 수 없다(방이 사라진다)
  - `rematch`(result 단계 참가자): 처음 누른 사람에게 `hostToken = random128()`로 `deps.createRematchRoom({ hostToken })`을 기다린 뒤 `notice {kind: 'rematch', roomId, hostToken}`. 만드는 동안이나 뒤에 누른 사람은 같은 `roomId`로 `notice {kind: 'rematch', roomId}`(hostToken 없음). 방은 한 번만 만든다

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
describe('rejoin and result', () => {
  test('D+3599 rejoin stays alive; D+3600 returns as a spirit', () => {
    const one = started(['가', '나'], { dev: true }, { devNoElimination: true });
    const key = one.links[0]!.last('full').me.key;
    one.core.leave('a', false); tickOnce(one.core, one.deps);   // D = 0
    ticks(one, 3599 - 1);
    const a2 = new FakeLink('a2'); one.core.join(a2, { rejoinKey: key }); tickOnce(one.core, one.deps);   // tick 3599
    expect(one.core.match!.seats[1]).toMatchObject({ alive: true, connected: true });
    expect(a2.last('full')).toMatchObject({ me: { seat: 1 } }); expect(a2.last('full').me.key).not.toBe(key);
    const two = started(['가', '나'], { dev: true }, { devNoElimination: true });
    const key2 = two.links[0]!.last('full').me.key;
    two.core.leave('a', false); tickOnce(two.core, two.deps); ticks(two, 3600 - 1);
    const a3 = new FakeLink('a3'); two.core.join(a3, { rejoinKey: key2 }); tickOnce(two.core, two.deps);
    expect(two.core.match!.seats[1]).toMatchObject({ alive: false, record: { cause: 'disconnect' } });
  });
  test('while disconnected the lane keeps fighting, earning and can be eliminated', () => {
    // place a horong and an enemy in seat 1's lane, disconnect, run 200 ticks:
    // attack events still appear in step results (check lane enemy hp dropped), coins increased on round end,
    // then fill 61 enemies and run 100 ticks: seat 1 eliminated with cause 'limit'.
  });
  test('second use of a key: new key works, old key refused; old tab told and its inputs ignored', () => {
    const { core, deps, links: [a] } = started(['가']);
    const key = a!.last('full').me.key;
    const b = new FakeLink('b'); core.join(b, { rejoinKey: key });
    expect(a!.last('notice')).toEqual({ kind: 'replaced' }); expect(a!.closed).toBe(4001);
    send(core, 'a', 1, 'summon'); tickOnce(core, deps);
    expect(core.match!.lanes[1]!.tokens).toBe(4);
    expect(() => core.join(new FakeLink('c'), { rejoinKey: key })).toThrow();
    const newKey = b.last('full').me.key;
    expect(() => core.join(new FakeLink('d'), { rejoinKey: newKey })).not.toThrow();
  });
  test('a spirit refresh keeps the same spirit and its support token', () => {
    // seat 2 forfeits, run to the next round start so it holds 1 token, leave + rejoin with its key:
    // full.mine.supportTokens === 1 and match.seats[2].alive === false.
  });
  test('everyone disconnected: the match runs to the end', () => {
    // two players, both leave; advance the clock to the end (devJumpTick 16500 to keep it short);
    // core.phase === 'result' and core.match.result.outcome is 'wipe' with both seats 'unfinished'.
  });
  test('same result for all, one rematch room for simultaneous presses, first presser hosts, room closes after 120 s', async () => {
    // finish a 2-player match quickly (both forfeit), both links receive the same 'result'.
    // core.message('b', 'rematch'); core.message('a', 'rematch'); await deps.createRematchRoom calls settle:
    // createRematchRoom called once; b got { kind: 'rematch', roomId: 'room-2', hostToken: <string> }; a got { kind: 'rematch', roomId: 'room-2' }.
    // advance 119_999 ms: not disposed; advance 1 ms more: deps.disposed true, phase 'closed'.
  });
});
```

`started`, `tickOnce`, `ticks`, `send`는 Task 12가 `test/helpers.ts`에 둔 도우미다. 주석으로 적은 시험도 주석의 조건을 그대로 단언으로 쓴다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/server/test/rejoin.test.ts`
Expected: FAIL (`badKey`만 나거나 단절 입력이 없음)

- [ ] **Step 3: 단절·복귀·교체·보관·다시 하기를 구현한다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run && npm run typecheck`
Expected: 전체 PASS

- [ ] **Step 5: 커밋한다**

```bash
git add packages/server
git commit -m "feat(server): disconnects, rejoin keys, tab replacement, result retention and rematch"
```

---

### Task 14: 브라우저 연결 모듈 NetClient와 먼저 그리기

**Implementer:** astra

**Files:**
- Create: `packages/client/src/net/session.ts`, `room.ts`, `NetClient.ts`, `predict.ts`
- Modify: `packages/client/package.json` (dependency `"@colyseus/sdk": "0.18.10"`), `package-lock.json`
- Test: `packages/client/test/net.test.ts`

**읽을 것:** 명세 6장 "명령"(seq, 재접속 뒤 seq), 7장 "조작 반응". `packages/logic/src/match/wire.ts`, `view.ts`(`applyFull`, `applyTick`, `applyLane`, `applyMine`), `parse.ts`(`toWire`).

**Interfaces:**
- Consumes: Task 9 메시지 타입, `applyFull`, `applyTick`, `applyLane`, `applyMine`, `toWire`, `ClientView`, `UnitView`, `Ack`; Task 3 `loadGameData('stage2')`; Task 5 `MatchState.dataVersion` 계산법(`fnv1a(canonicalJson(data, new Set()))`)
- Produces:
  - `session.ts`: `saveSession(roomId: string, s: { key?: string; name: string }): void`, `loadSession(roomId: string): { key?: string; name: string } | null`, `clearSession(roomId: string): void`, `lastName(): string | null` — `sessionStorage` 키 `dorandi:room:<roomId>`, `dorandi:name`
  - `room.ts`: `interface RoomLike { roomId: string; send(type: string, msg?: unknown): void; onMessage(type: string, cb: (msg: any) => void): void; onLeave(cb: (code: number) => void): void; leave(consented?: boolean): Promise<unknown> }`, `serverUrl(): string`(`import.meta.env.VITE_SERVER_URL ?? (DEV ? 'http://localhost:2567' : location.origin)`), `connectCreate(name: string): Promise<RoomLike>`, `connectJoin(roomId: string, opts: { name?: string; rejoinKey?: string; hostToken?: string }): Promise<RoomLike>` — `@colyseus/sdk`의 `Client`로 `create('match', …)`/`joinById`, 들어오면 `room.reconnection.enabled = false`. 실패는 `{ code: number }`를 가진 오류로 다시 던진다
  - `predict.ts` (순수 함수):
    - `interface PendingCmd { seq: number; type: string; args?: Record<string, unknown> }`
    - `predictUnits(server: (UnitView | null)[], open: boolean[], pending: PendingCmd[]): (UnitView | null)[]` — 서버 칸에 대기 중인 `move`를 차례로 적용(출발 칸이 비었거나 id가 다르거나 목적지가 닫혔으면 그 move는 건너뜀)
    - `summonsLeft(tokens: number, pending: PendingCmd[]): number` = `tokens − 대기 summon 수`(0 이하면 0)
    - `dimmedSlots(pending: PendingCmd[]): Set<number>` — 대기 중인 `combine`의 `slot`과 `sell`의 `slot`
  - `NetClient.ts`:
    ```ts
    export type NetEvent =
      | { kind: 'lobby'; msg: LobbyMsg } | { kind: 'view'; view: ClientView } | { kind: 'lane'; batches: LaneBatch[] }
      | { kind: 'rejected'; cmd: PendingCmd; reason: RejectReason } | { kind: 'notice'; msg: NoticeMsg }
      | { kind: 'result'; msg: ResultMsg } | { kind: 'left'; code: number } | { kind: 'versionMismatch' };
    export class NetClient {
      constructor(room: RoomLike, dataVersion: string);
      readonly roomId: string; lobby: LobbyMsg | null; view: ClientView | null; pending: PendingCmd[];
      on(cb: (e: NetEvent) => void): void;
      send(cmd: Command | { type: 'support'; target: number } | { type: 'forfeit' }): boolean;   // false = not sent
      ready(v: boolean): void; start(): void; watch(seat: number): void; rematch(): void; leave(): Promise<void>;
      units(): (UnitView | null)[];   // predicted own units (watching own seat) or the watched lane's units
    }
    ```
    - 방 메시지는 모두 객체를 싣는다: `ready(v)` → `send('ready', { ready: v })`, `start()` → `send('start', {})`, `watch(seat)` → `send('watch', { seat })`, `rematch()` → `send('rematch', {})`, 재동기화 → `send('resync', {})`
    - `full` → `applyFull`, `dataVersion`이 다르면 `versionMismatch`. `nextSeq = mine.lastSeq + 1`, `pending = []`(확인되지 않은 조작은 버림). 세션 저장소에 새 키 저장
    - `tick`/`lane` → 적용 결과가 `'gap'`이면 `resync` 전송. 적용한 `lane` 묶음은 `{kind:'lane'}`로 넘긴다(연출용)
    - `mine` → `applyMine`의 acks로 `pending`에서 seq를 지우고, 거절은 `{kind:'rejected'}`
    - `send(cmd)`: 넋이면 `support/forfeit` 말고는 false. `summon`은 `summonsLeft(mine.tokens, pending) <= 0`이면 false. `combine(slot)`/`sell`은 그 칸이 `dimmedSlots`에 있으면 false(두 번 누르기 방지). 아니면 `toWire`(유닛 id는 `units()`의 먼저 그린 칸 기준)에 seq를 붙여 `cmd`로 보내고 `pending`에 넣는다

- [ ] **Step 1: 실패하는 시험을 쓴다**

시험은 `FakeRoom implements RoomLike`(보낸 메시지 기록, `emit(type, msg)`로 받은 메시지 흉내)와, logic의 `createMatch` + `buildFull`로 만든 실제 `full`을 쓴다.

```ts
describe('NetClient', () => {
  test('seq continues from full.mine.lastSeq + 1; unacked commands are dropped on a new full', () => {
    const { room, net, full } = connected();   // full.mine.lastSeq = 4
    net.send({ type: 'convertToken' });
    expect(room.sent.at(-1)).toEqual({ type: 'cmd', msg: { seq: 5, type: 'convertToken' } });
    room.emit('full', { ...full, mine: { ...full.mine, lastSeq: 9 } });
    expect(net.pending).toEqual([]);
    net.send({ type: 'convertToken' });
    expect(room.sent.at(-1)!.msg.seq).toBe(10);
  });
  test('a move is drawn at once and rolled back when rejected', () => {
    const { room, net, unitA } = connectedWithUnit();   // unitA at slot 0
    net.send({ type: 'move', from: 0, to: 6 });
    expect(net.units()[6]).toEqual(unitA); expect(net.units()[0]).toBeNull();
    room.emit('mine', mineAck(1, { ok: false, reason: 'staleUnit' }));
    expect(net.units()[0]).toEqual(unitA); expect(net.units()[6]).toBeNull();
  });
  test('rapid summons never exceed the server token count', () => {
    const { room, net } = connected();   // tokens 2
    for (let i = 0; i < 5; i++) net.send({ type: 'summon' });
    expect(room.sent.filter(s => s.type === 'cmd').length).toBe(2);
  });
  test('combine twice before the ack sends once (review focus 3)', () => {
    const { room, net } = connectedWithRecipe();   // sotlid@0 + bujigaengi@1
    expect(net.send({ type: 'combine', result: 'gamasot', slot: 0 })).toBe(true);
    expect(net.send({ type: 'combine', result: 'gamasot', slot: 0 })).toBe(false);
    expect(room.sent.filter(s => s.type === 'cmd').length).toBe(1);
  });
  test('a gap in update numbers asks for resync', () => {
    const { room, full } = connected();
    room.emit('tick', { ...tickOf(full), n: full.n + 2 });
    expect(room.sent.at(-1)).toEqual({ type: 'resync', msg: {} });
  });
  test('the rejoin key is stored per room', () => {
    const { full } = connected();
    expect(loadSession('room-1')).toMatchObject({ key: full.me.key });
  });
});
```

`mineAck(seq, result)`은 `{ ...full.mine, tick: full.clock.tick + 1, lastSeq: seq, acks: [{ seat: 1, seq, tick: full.clock.tick + 1, ...result }] }`를 만드는 도우미다(`result`는 `{ ok: true }` 또는 `{ ok: false, reason }`). `connected()` 등 도우미는 시험 파일 안에서 `FakeRoom`, 2인 `createMatch`, `buildFull(match, 1, { watching: 1, names, key: 'k1', n: 0 })`로 만든다(`mine.lastSeq`·토큰·칸은 시험이 정한 값으로 덮어쓴다). `sessionStorage`는 시험 파일 머리에서 `Map` 기반 가짜를 `globalThis`에 넣는다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npm install && npx vitest run packages/client/test/net.test.ts`
Expected: FAIL, 모듈 없음

- [ ] **Step 3: `session.ts`, `room.ts`, `predict.ts`, `NetClient.ts`를 구현한다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run && npm run typecheck`
Expected: 전체 PASS

- [ ] **Step 5: 커밋한다**

```bash
git add packages/client package-lock.json
git commit -m "feat(client): net client with seq, resync, rejoin storage and optimistic moves"
```

---

### Task 15: 경로 분기, 첫 화면, 대기실

**Implementer:** sol

**Files:**
- Create: `packages/client/src/solo.ts` (지금 `main.ts` 내용 이동, `startSolo(): void`)
- Modify: `packages/client/src/main.ts` (경로 분기), `packages/client/index.html` (`<div id="screen"></div>` 추가), `packages/client/src/ui/style.css`
- Create: `packages/client/src/online/app.ts`, `entry.ts`, `lobby.ts`, `text.ts`
- Test: `packages/client/test/online-entry.test.ts`

**읽을 것:** 명세 6장 "서버 구성"(경로), "대기실", 7장 단축키 줄(닉네임 입력창 초점), 11장 결정 10. Task 14 `NetClient`, `connectCreate`, `connectJoin`, `saveSession`, `loadSession`, `lastName`. Task 11 `normalizeNickname`. Task 9 `LobbyMsg`, `JOIN_ERROR_CODES`.

**Interfaces:**
- Consumes: 위 이름들
- Produces:
  - `main.ts`: `location.pathname`이 `/solo`면 `startSolo()`, `/room/<id>`면 `startOnline({ roomId: id })`, 그 밖은 `startOnline({})`
  - `online/app.ts`: `startOnline(opts: { roomId?: string }): void` — 화면 상태 `entry → connecting → lobby → battle(Task 16)`. `/room/<id>`이고 `loadSession(id)?.key`가 있으면 닉네임을 묻지 않고 키로 `connectJoin` 시도, `badKey`면 이름 칸을 채운 첫 화면으로. 방에 들어가면 `history.replaceState(null, '', '/room/' + roomId)`. `full`을 받으면 Task 16의 `startBattle(net)`을 부른다(이 Task에서는 자리만: `startBattle`이 없으면 "판이 시작되었습니다" 글자만)
  - `online/text.ts`: `joinErrorText(code: number): string`, `TEXT` 상수(아래 문구)
  - `online/entry.ts`: `renderEntry(root: HTMLElement, opts: { roomId?: string; name?: string; error?: string; onSubmit(name: string): Promise<void> }): void` — 제출 중에는 버튼과 Enter를 막아 요청을 한 번만 보낸다(`compositionend` 전의 Enter, 연타 모두). 클라이언트에서도 `normalizeNickname`으로 먼저 검사
  - `online/lobby.ts`: `lobbyModel(msg: LobbyMsg): { rows: { seat: number; text: string; host: boolean; ready: boolean; me: boolean; empty: boolean }[]; canStart: boolean; isHost: boolean; myReady: boolean; hint: string | null }`, `renderLobby(root, msg, actions: { ready(v: boolean): void; start(): void; copy(): void })`
- 문구:
  - 첫 화면: 제목 ‘도깨비 랜덤 디펜스’, 입력 라벨 ‘닉네임’, 자리표시 ‘한글·영문·숫자 1~8자’, 버튼 ‘방 만들기’(`/`) / ‘입장하기’(`/room/…`), 아래 링크 ‘혼자 하기’(→ `/solo`)
  - 오류: badName ‘닉네임은 한글·영문·숫자 1~8자입니다’, dupName ‘방에 같은 닉네임이 있습니다’, roomFull ‘가득 찬 방입니다’, alreadyStarted ‘이미 시작한 방입니다’, badKey ‘자리를 되찾지 못했습니다. 닉네임을 다시 입력해 주세요’, Colyseus 522(없는 방) ‘없거나 끝난 방입니다’ + 버튼 ‘새 방 만들기’(→ `/`), 그 밖 ‘서버에 연결하지 못했습니다’
  - 대기실: 제목 ‘대기실’, 버튼 ‘링크 복사’(누르면 1.5초간 ‘복사했습니다’), 줄 `N번 이름`(+‘방장’, ‘나’ 표시) 상태 ‘준비’/‘대기’, 빈 자리 ‘빈 자리’, 버튼 ‘준비’/‘준비 취소’, 방장에게 ‘시작’(모두 준비 전에는 꺼짐, 힌트 ‘모두 준비하면 시작할 수 있습니다’), 방장 알림 notReady ‘아직 준비하지 않은 사람이 있습니다’

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
describe('entry and lobby', () => {
  test('join error texts', () => {
    expect(joinErrorText(4102)).toBe('방에 같은 닉네임이 있습니다');
    expect(joinErrorText(4103)).toBe('가득 찬 방입니다');
    expect(joinErrorText(522)).toBe('없거나 끝난 방입니다');
    expect(joinErrorText(9999)).toBe('서버에 연결하지 못했습니다');
  });
  test('lobby model', () => {
    const m = lobbyModel({ roomId: 'r', you: 2, hostSeat: 1, seats: [{ seat: 1, name: '가', ready: true }, { seat: 2, name: '나', ready: false }] });
    expect(m.rows.length).toBe(6);
    expect(m.rows[0]).toMatchObject({ text: '1번 가', host: true, ready: true, me: false });
    expect(m.rows[1]).toMatchObject({ text: '2번 나', me: true, ready: false });
    expect(m.rows[2]).toMatchObject({ empty: true, text: '빈 자리' });
    expect(m).toMatchObject({ isHost: false, myReady: false, canStart: false });
  });
  test('submitting twice (Enter during IME, double click) sends one join (review focus 5)', async () => {
    const root = document.createElement('div');
    let calls = 0; let release!: () => void;
    renderEntry(root, { onSubmit: () => { calls++; return new Promise<void>(r => { release = r; }); } });
    const input = root.querySelector('input')!; input.value = '가나';
    const form = root.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    root.querySelector('button')!.click();
    expect(calls).toBe(1); release();
  });
});
```

이 시험 파일은 머리에 `// @vitest-environment happy-dom`을 쓴다. 루트 devDependencies에 `happy-dom@^15`를 더한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npm install && npx vitest run packages/client/test/online-entry.test.ts`
Expected: FAIL

- [ ] **Step 3: 경로 분기, 첫 화면, 대기실을 구현한다**

`#screen`은 `#stage` 위에 겹치는 전체 화면 상자다. 첫 화면과 대기실에서는 Phaser를 만들지 않는다. 닉네임 입력창에 초점이 있으면 게임 단축키를 받지 않는다(이 화면에는 게임 단축키가 아직 없지만, Task 16에서 붙일 때 `ev.target`이 입력창이면 무시하는 검사를 `mount.ts` 첫 줄에 넣을 수 있도록 `isTypingTarget(ev): boolean`을 `online/entry.ts`에서 내보낸다).

- [ ] **Step 4: 통과와 화면을 확인한다**

Run: `npx vitest run && npm run typecheck`
Expected: PASS

그다음 `npm run dev:server`와 `npm run dev`를 백그라운드로 띄우고, 스크린숏 도구로 확인한다. 도구 폴더 `SHOT = C:\Users\delt\AppData\Local\Temp\claude\09265f2abd9d9a36\fe1800dd-c29d-41f1-9467-707b13108d09\scratchpad\shot`. 단계 파일 `SHOT\stage2-lobby.mjs`를 쓴다: `page`에서 이름 ‘가나’를 넣고 ‘방 만들기’를 누른 뒤 주소를 읽고, `const b = await (await page.context().browser().newContext()).newPage()`로 같은 주소에 들어가 ‘다라’로 입장, 두 쪽 모두 ‘준비’를 누르고, `b`의 화면을 `SHOT\stage2-lobby-b.png`로 저장한다.

Run: `node SHOT/shot.mjs SHOT/stage2-entry.png 1280 720` 그리고 `node SHOT/shot.mjs SHOT/stage2-lobby-a.png 1280 720 SHOT/stage2-lobby.mjs`
Expected: 콘솔 오류 없음. 첫 화면에 제목·닉네임 칸·‘방 만들기’·‘혼자 하기’. 대기실 두 장에 1번 가나(방장)·2번 다라가 같은 순서와 준비 상태로 보이고, 방장 쪽 ‘시작’이 켜져 있다. `URL=http://localhost:5173/solo`로 찍으면 기존 1인판이 뜬다

- [ ] **Step 5: 커밋한다**

```bash
git add packages/client package.json package-lock.json
git commit -m "feat(client): routes, nickname entry and lobby screen"
```

---

### Task 16: NetDriver와 온라인 전투 화면 (2인 플레이 가능)

**Implementer:** astra

**Files:**
- Modify: `packages/client/src/driver.ts` (`Driver` 인터페이스), `packages/client/src/LaneScene.ts`, `packages/client/src/layout.ts`, `packages/client/src/ui/mount.ts`, `packages/client/src/ui/style.css`, `packages/client/src/online/app.ts`
- Create: `packages/client/src/net/NetDriver.ts`, `packages/client/src/net/viewState.ts`, `packages/client/src/online/battle.ts`
- Test: `packages/client/test/netdriver.test.ts`

**읽을 것:** 명세 7장 전체(특히 보간 규칙과 조작 반응, 640×360 A안 좌표). `packages/client/src/driver.ts`, `LaneScene.ts`, `ui/mount.ts`. Task 14 `NetClient`, `predict.ts`. Task 9 `ClientView`, `EnemyView`, `enemyDistanceAt`, `LaneBatch`.

**Interfaces:**
- Consumes: 위 이름들; Task 15 `startOnline`, `isTypingTarget`
- Produces:
  - `driver.ts`: `export interface Driver { state: GameState; paused: boolean; readonly online: boolean; readOnly: boolean; dimmed: Set<number>; queue(cmd: Command): void; onEvents(cb: (events: GameEvent[], rejected: StepResult['rejected']) => void): void; update(elapsedMs: number): void; enemyDistance(id: number, d: number): number }`. `GameDriver`가 이를 구현한다(`online false`, `readOnly false`, `dimmed` 빈 집합). 기존 동작 그대로
  - `viewState.ts`: `viewToGameState(view: ClientView, data: GameData, units: (UnitView | null)[], renderTick: number): GameState` — 시각 필드는 `view.clock`(`phase`는 결과가 있으면 `'ended'`), 자원·강화·`pendingPity`·`grade1Summons`·`helperOpens`는 `view.mine`(넋이면 0), `slots`는 `units`를 `{ id, defId, cooldown: 0, attackCount: 0, periodic: [] }`로, `open`은 관전 고개, `enemies`는 `{ id, defId, hp, maxHp, d: enemyDistanceAt(e, renderTick), boss, round: view.clock.round, stunTicks: e.speed === 0 ? 1 : 0, slow: null, vulns: {}, dots: {}, fireHit: {} }`, `fires`는 `{ source, from, to, basePerPulse: 0, nextPulse: 0, endTick }`, `overLimitTicks`는 내 줄, `result null`, `stats []`, `rng`은 `{ summon: { s: 0 }, combat: { s: 0 } }`, `nextId 0`
  - `NetDriver.ts`: `class NetDriver implements Driver` — `constructor(net: NetClient, data: GameData)`. `online true`. `readOnly` = 넋이거나 남의 고개를 보는 중. `dimmed` = `dimmedSlots(net.pending)`. `queue(cmd)` → `net.send(cmd)`(거절되면 아무것도 안 함). `update(elapsedMs)` → `renderTick` 진행 후 `state`를 `viewToGameState`로 다시 만든다. `enemyDistance(id)` → 그 적의 `enemyDistanceAt(e, renderTick)`. `onEvents`로 lane 묶음을 `GameEvent`로 바꿔 넘긴다(`spawn` → `{type:'spawn', enemyId, defId}`, `attack`, `damage`, `kill`, `speed` → `speedChange`, `summon`, `combine`). `rejected`는 NetClient의 거절을 `{ command, reason }`으로
  - `renderTickAt(now: number, latestTick: number, receivedAt: number, prev: number): number` = `max(prev, min(latestTick − 2 + (now − receivedAt) / 50, latestTick))` — 최신 틱보다 2틱 앞을 그리고, 다음 갱신이 늦으면 예정 시각에서 최대 100ms만 더 간다(명세 7장)
  - 연출 상한: 받은 묶음 중 `batch.tick <= latestTick − 10`인 묶음의 이벤트는 상태에만 적용하고 연출 이벤트(`attack`, `damage`, `kill`, `summon`, `combine`)로 넘기지 않는다. 즉 최근 10틱만 연출한다(Review Focus 1). `latestTick`은 마지막으로 받은 `tick` 메시지의 `clock.tick`
  - `layout.ts`: `ONLINE_BOTTOM_H = 44`, `ONLINE_CENTER_H = 292`, `LANE_CANVAS_ONLINE = { width: 400, height: 292 }`. 1인판 값은 그대로
  - `LaneScene`: 생성자 인자를 `Driver`로, 캔버스 높이는 생성 옵션 `{ height }`로 받는다. `driver.readOnly`면 끌기·판매를 막고 선택만 허용. `driver.dimmed` 칸의 유닛은 알파 0.4. shared 적은 보스보다 조금 작은 탈 모양(이름 첫 글자 ‘탈’)과 체력 막대. 실제 입구(d=0 지점) 표시
  - `mount.ts`: `mountUi(driver: Driver, scene, hooks, opts: { online?: boolean } = {})` — 온라인이면 P(멈춤)를 끄고, `phase === 'ended'`여도 1단계 결과 창(`resultHtml`)을 그리지 않는다(팀 결과는 Task 19가 그린다). keydown 처리 첫 줄에서 `isTypingTarget(ev)`면 무시. 소환 버튼과 스페이스는 `net.send`가 false면 눌림 연출만 하고 보내지 않는다(‘뚝딱! (N번)’의 N = `summonsLeft`)
  - `online/battle.ts`: `startBattle(net: NetClient, data: GameData): void` — `body.online` 클래스(아래 줄 44px, 가운데 292px), `NetDriver`, `LaneScene({ height: 292 })`, `mountUi(…, { online: true })`. 개발 모드에서 `window.__net = net`

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
describe('NetDriver', () => {
  test('viewToGameState exposes what LaneScene and the panels read', () => {
    const { view, data } = fixtureView();   // from createMatch + buildFull after 700 ticks, one unit at slot 0
    const s = viewToGameState(view, data, view.mine.units, view.clock.tick);
    expect(s).toMatchObject({ tick: view.clock.tick, round: 1, phase: 'round', tokens: view.mine.tokens, coins: view.mine.coins });
    expect(s.slots[0]).toMatchObject({ id: view.mine.units[0]!.id, defId: view.mine.units[0]!.defId });
    expect(s.enemies.map(e => e.id)).toEqual(view.lane.enemies.map(e => e.id));
    expect(s.enemies[0]!.d).toBeCloseTo(view.lane.enemies[0]!.d, 9);
  });
  test('render tick lags 2 ticks, runs at most 100 ms past schedule, never goes back', () => {
    expect(renderTickAt(1000, 50, 1000, 0)).toBe(48);
    expect(renderTickAt(1050, 50, 1000, 48)).toBe(49);
    expect(renderTickAt(1300, 50, 1000, 49)).toBe(50);
    expect(renderTickAt(1300, 52, 1290, 50)).toBe(50.2);
    expect(renderTickAt(1000, 40, 1000, 50)).toBe(50);
  });
  test('a returning background tab applies 300 batches but animates only the last 10 ticks (review focus 1)', () => {
    const { net, room, data, view } = fixtureNet();
    const drv = new NetDriver(net, data);
    const animated: GameEvent[] = []; drv.onEvents(ev => animated.push(...ev));
    room.emit('tick', { ...tickFrom(view), n: view.n + 1, clock: { ...view.clock, tick: view.clock.tick + 300 } });
    room.emit('lane', { n: view.n + 1, seat: 1, batches: Array.from({ length: 300 }, (_, i) => ({ tick: view.clock.tick + 1 + i, events: [{ t: 'attack', unitId: 1, id: 1 }] })) });
    expect(animated.filter(e => e.type === 'attack').length).toBe(10);
    expect(net.view!.lane.tick).toBe(view.clock.tick + 300);
  });
  test('queue(move) predicts at once and is read-only while watching another lane', () => {
    const { net, data } = fixtureNet();   // unit at slot 0
    const drv = new NetDriver(net, data); drv.update(16);
    const id = drv.state.slots[0]!.id;
    drv.queue({ type: 'move', from: 0, to: 6 }); drv.update(16);
    expect(drv.state.slots[6]!.id).toBe(id);
    net.view!.watching = 2; drv.update(16);
    expect(drv.readOnly).toBe(true);
  });
});
```

`fixtureView`/`fixtureNet`은 시험 파일 안에서 Task 14 시험과 같은 방식(`FakeRoom` + `createMatch` + `buildFull`)으로 만든다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/client/test/netdriver.test.ts`
Expected: FAIL

- [ ] **Step 3: `Driver`, `viewState`, `NetDriver`, `LaneScene`·`mount` 변경, `battle.ts`를 구현한다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run && npm run typecheck`
Expected: 전체 PASS(기존 `LaneScene.test.ts`, `client.test.ts` 포함)

- [ ] **Step 5: 두 사람 판을 화면으로 확인한다**

`npm run dev:server`, `npm run dev`를 띄운 상태에서 단계 파일 `SHOT\stage2-two.mjs`를 쓴다: Task 15의 입장·준비 흐름 뒤 방장이 ‘시작’, 2초 기다림, `page`에서 스페이스 두 번, 1초 기다림. 이어서 `const ta = await page.evaluate(() => window.__net.view.mine.tokens)`, `b`도 같은 값을 읽어 `console.log`하고 `b` 화면을 `SHOT\stage2-two-b.png`로 저장한다.

Run: `node SHOT/shot.mjs SHOT/stage2-two-a.png 1280 720 SHOT/stage2-two.mjs`
Expected: 콘솔 오류 없음. 출력에 A 토큰 2, B 토큰 4(명세 10장 두 브라우저 1번: 한쪽에서 뽑아도 다른 쪽 불은 줄지 않음). A 화면 고개에 유닛 둘, 아래 카드 높이 44px, 잡귀가 고리를 따라 돈다. `URL=http://localhost:5173/solo`로 찍은 1인판이 Task 15 때와 같다

- [ ] **Step 6: 커밋한다**

```bash
git add packages/client
git commit -m "feat(client): net driver, online lane scene and playable two-player battle"
```

**체크포인트 4 리뷰:** 두 브라우저로 실제 2인 판이 돌아가는지(Task 16 스크린숏), 새로고침·탭 교체·다시 하기가 서버 시험대로 동작하는지, 1인판 `/solo`가 그대로인지, 온라인에서 브라우저가 전투를 돌리지 않는지(`NetDriver`가 `step`/`stepMatch`를 import하지 않음) 본다.

---

## 체크포인트 5: 6인 화면 (Task 17~19)

### Task 17: 왼쪽 여섯 줄, 상단 두 줄, 오른쪽 알림

**Implementer:** sol

**Files:**
- Create: `packages/client/src/online/models.ts`, `packages/client/src/online/panels.ts`
- Modify: `packages/client/src/online/battle.ts` (패널 붙이기), `packages/client/src/ui/style.css`, `packages/client/src/net/room.ts`·`packages/client/src/online/app.ts` (개발 모드에서만 `?dev=jump<tick>`을 방 옵션 `devJumpTick`으로 전달)
- Test: `packages/client/test/online-models.test.ts`

**읽을 것:** 명세 2장 끝(위험 48), 7장 "640×360 전투 화면" 표와 그 아래 첫 세 줄, 11장 결정 11. Task 9 `ClientView`, `RowView`, `YeoksinView`, `GateView`. `packages/client/src/ui/hud.ts`, `panels.ts`(기존 문구).

**Interfaces:**
- Consumes: Task 9 타입, Task 3 `data.coop`(`danger`, `yeoksin` 단계 정의, `staySeconds`), `data.balance.limit`(60), `limitSeconds`(5)
- Produces:
  - `rowsModel(view: ClientView, data: GameData): { seat: number; empty: boolean; title: string; count: string; danger: boolean; status: string; mark: 'current' | null; progress: number | null; me: boolean }[]` (6줄, 번호순, 순위로 옮기지 않음)
    - 빈 자리: `title '빈 고개'`, `count ''`, `status ''`
    - `title` = `${seat} ${name}` (+ 내 줄이면 ` · 나`), `count` = 일반 적 수(넋은 `'–'`)
    - `status` 우선순위: 넋이면 `'탈락·넋'`(탈락 틱 뒤 60틱 동안은 `'탈락·' + 원인`: 잡귀 한도/고개 보스/포기/단절) > `count > limit`이면 `'초과 ' + ceil((100 − overLimitTicks) / 20) + '초'` > 끊김이면 `'재접속 ' + ceil(reconnectTicksLeft / 20) + '초'` > `count >= danger`면 `'위험'` > 역신 `nextSeat`면 `'다음'` > `'생존'`
    - `danger` = `count >= 48`(재접속 대기 중에도)
    - 역신이 있는 줄: `mark 'current'`, `progress = (view.clock.tick − enterTick + 1) / 240`(0~1)
  - `topModel(view: ClientView, data: GameData): { line1: string; line2: string; myTurn: string | null }`
    - line1: 준비면 `'준비 · 남은 N초'`, 아니면 `'R / 20 라운드 · 남은 N초 · 내 잡귀 C / 60'`(N은 올림, 초과 중이면 끝에 `' · 초과 K초'`). 넋이면 `'R / 20 라운드 · 남은 N초 · 관전 중'`
    - line2: 역신 등장 전 `'관문 S/2 · R라운드에 역신 등장'`, 있으면 `'관문 S/2 · D라운드 끝까지 · 역신 첫째 탈 7,950 / 8,800'`(D = 마감 라운드, 숫자는 `toLocaleString('ko-KR')`, 단계 이름은 첫째/둘째), 둘 다 통과면 `'관문 통과'`
    - myTurn: 현재와 다음이 모두 나면 `'내 고개 순환'`, 다음만 나면 `'다음은 내 고개 · N초'`(N = `ceil((enterTick + 240 − clock.tick) / 20)`), 아니면 null. line2 뒤에 ` · `로 붙여 그린다
  - `rightNotices(view, now): string[]` — `mine.supportIn`을 받은 시각부터 3초 동안 `'N번 넋이 엽전 +5'`
  - `renderRows(view, data)`, `renderTop(view, data)`: `#left`(제목 28px + 줄 44px × 6), `#top`(12px 두 줄)
  - 오른쪽 패널은 기존 `renderRight`(‘뚝딱! (N번)’, ‘보너스까지 1등급 N번’, 보관 중)를 그대로 쓰고 아래에 알림 칸을 더한다. 빈칸이 없으면 ‘뚝딱!’ 아래 ‘빈칸 필요’

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
const row = (over: Partial<RowView>): RowView => ({ seat: 1, name: '가', status: 'alive', connected: true, reconnectTicksLeft: null, count: 0, overLimitTicks: 0, received: false, cause: null, eliminatedTick: null, ...over });

describe('online rows', () => {
  test('status priority and numbers', () => {
    const o: ViewOpts = { me: 1, tick: 5000, rows: [
      row({ seat: 1, count: 47 }), row({ seat: 2, name: '나', count: 48 }), row({ seat: 3, name: '다', count: 61, overLimitTicks: 30, connected: false, reconnectTicksLeft: 1210 }),
      row({ seat: 4, name: '라', connected: false, reconnectTicksLeft: 1210, count: 50 }), row({ seat: 5, name: '마', status: 'spirit', cause: 'forfeit', eliminatedTick: 4950 }),
      row({ seat: 6, name: '', status: 'empty' }),
    ], yeoksin: { stage: 1, hp: 7950, maxHp: 8800, seat: 2, enterTick: 4881, nextSeat: 1 } };
    const r = rowsModel(viewWith(o), data);
    expect(r.map(x => x.status)).toEqual(['다음', '위험', '초과 4초', '재접속 61초', '탈락·포기', '']);
    expect(r.map(x => x.danger)).toEqual([false, true, true, true, false, false]);
    expect(r[0]!.title).toBe('1 가 · 나'); expect(r[4]!.count).toBe('–'); expect(r[5]!.title).toBe('빈 고개');
    expect(r[1]).toMatchObject({ mark: 'current' }); expect(r[1]!.progress).toBeCloseTo(120 / 240, 9);
    expect(rowsModel(viewWith({ ...o, tick: 5011 }), data)[4]!.status).toBe('탈락·넋');
  });
  test('top lines and my-turn notice', () => {
    const o: ViewOpts = { me: 1, tick: 5000, round: 6, roundEndTick: 5400, rows: [row({ seat: 1, count: 12 }), row({ seat: 2 })],
      gate: { stage: 1, kills: 0, deadlineTick: 7799 }, yeoksin: { stage: 1, hp: 7950, maxHp: 8800, seat: 2, enterTick: 4881, nextSeat: 1 } };
    expect(topModel(viewWith(o), data)).toEqual({ line1: '6 / 20 라운드 · 남은 20초 · 내 잡귀 12 / 60', line2: '관문 1/2 · 9라운드 끝까지 · 역신 첫째 탈 7,950 / 8,800', myTurn: '다음은 내 고개 · 7초' });
    expect(topModel(viewWith({ ...o, yeoksin: { ...o.yeoksin!, seat: 1, nextSeat: 1 } }), data).myTurn).toBe('내 고개 순환');
    expect(topModel(viewWith({ ...o, yeoksin: null, round: 3 }), data).line2).toBe('관문 1/2 · 6라운드에 역신 등장');
    expect(topModel(viewWith({ ...o, yeoksin: null, gate: { stage: 3, kills: 2, deadlineTick: null } }), data).line2).toBe('관문 통과');
    expect(topModel(viewWith({ me: 1, tick: 100, phase: 'prep', roundEndTick: 600, rows: [row({})] }), data).line1).toBe('준비 · 남은 25초');
  });
  test('support arrival notice lasts 3 seconds', () => {
    const v = viewWith({ me: 1, rows: [row({})] }); v.mine.supportIn = [{ from: 3, coins: 5 }];
    expect(rightNotices(v, 1000)).toEqual(['3번 넋이 엽전 +5']);
    expect(rightNotices(v, 4001)).toEqual([]);
  });
});
```

`type ViewOpts = { me: number; watching?: number; tick?: number; phase?: 'prep' | 'round'; round?: number; roundEndTick?: number; rows: RowView[]; gate?: GateView; yeoksin?: YeoksinView | null }`와 `viewWith(o: ViewOpts): ClientView`는 시험 파일 안에서 최소 `ClientView`를 만든다(빠진 값은 `tick 0`, `phase 'round'`, `round 1`, `watching = me`, `gate { stage: 1, kills: 0, deadlineTick: 7799 }`, `yeoksin null`, 비어 있는 `mine`·`lane`). `rightNotices`가 처음 본 `supportIn`의 시각을 기억하도록 내부 상태를 두거나, 시험처럼 첫 호출 시각을 기준으로 삼는다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/client/test/online-models.test.ts`
Expected: FAIL

- [ ] **Step 3: 모델과 패널을 구현하고 `battle.ts`에 붙인다**

- [ ] **Step 4: 통과와 화면을 확인한다**

Run: `npx vitest run && npm run typecheck`
Expected: PASS

서버를 `DORANDI_DEV=1`로 띄우고, 단계 파일 `SHOT\stage2-rows.mjs`가 닉네임 ‘가나다라마바사아’로 방을 만들고 혼자 시작하되 방 옵션 `{ devJumpTick: 4590 }`을 넘기도록 `connectCreate`에 개발용 옵션 경로(`?dev=jump4590` 쿼리를 개발 모드에서만 방 옵션으로 전달)를 만든다. 15초 기다린 뒤 찍는다.

Run: `node SHOT/shot.mjs SHOT/stage2-rows-1x.png 640 360 SHOT/stage2-rows.mjs` 그리고 같은 단계로 `1280 720`
Expected: 1배 화면에서 여덟 글자 닉네임과 숫자가 128px 줄 안에 겹치지 않는다. 내 줄에 탈 표식과 진행 막대, 상단 둘째 줄에 관문과 역신 HP가 보인다

- [ ] **Step 5: 커밋한다**

```bash
git add packages/client
git commit -m "feat(client): six-lane scoreboard, two-line hud and support notices"
```

---

### Task 18: 넋 관전·지원, 포기, 다른 창·끊김 안내

**Implementer:** sol

**Files:**
- Create: `packages/client/src/online/spirit.ts`
- Modify: `packages/client/src/online/battle.ts`, `packages/client/src/online/app.ts`, `packages/client/src/online/panels.ts`, `packages/client/src/ui/models.ts` (거절 문구), `packages/client/src/ui/style.css`
- Test: `packages/client/test/online-spirit.test.ts`

**읽을 것:** 명세 4장 "넋 지원", 6장 "진행 중 이탈"(포기·새로고침·다른 창), 7장 생존자·넋 화면 줄. Task 14 `NetClient`(`watch`, `send`, `on`), Task 16 `NetDriver.readOnly`, Task 17 `renderRows`.

**Interfaces:**
- Consumes: 위 이름들. 관전 대상 자동 전환은 서버가 한다(Task 12: 보던 고개가 탈락하면 최소 번호 생존 자리로 `full`을 다시 보냄)
- Produces:
  - `spiritModel(view: ClientView): { title: string; tokens: number; canSend: boolean; reason: string | null } | null` — 생존자면 null. `title` = `'관전: N번 이름'`, 이유: 토큰 0이면 `'지원 토큰이 없습니다'`, 대상이 이번 라운드에 받았으면 `'이번 라운드에 이미 받았습니다'`, 대상이 넋이면 `'그 고개는 이미 뚫렸습니다'`
  - 아래 카드(넋): `관전: N번 이름 · 지원 토큰 K` + 버튼 ‘엽전 5냥 보내기’(못 보내면 꺼지고 이유 표시). 누르면 `net.send({ type: 'support', target: watching })`
  - 왼쪽 줄 클릭(넋, 생존 자리) → `net.watch(seat)`
  - 메뉴 버튼 ‘포기하고 나가기’ → 확인창 ‘포기하면 넋이 되어 관전과 지원만 할 수 있습니다. 포기할까요?’ [포기] [취소] → `net.send({ type: 'forfeit' })`
  - `notice replaced` → 전체 화면 ‘다른 창에서 접속했습니다’(다시 연결하지 않음)
  - 끊김(`left`, code가 4000·4001이 아님) → 띠 ‘연결이 끊겼습니다 · 다시 연결하는 중’, 2초마다 `connectJoin(roomId, { rejoinKey })` 재시도. `badKey`나 522면 멈추고 ‘없거나 끝난 방입니다’ + ‘새 방 만들기’
  - `versionMismatch` → ‘게임이 업데이트되었습니다. 새로고침해 주세요’
  - `rejectText`에 추가: notAlive ‘넋은 할 수 없습니다’, staleUnit ‘배치가 바뀌었습니다. 다시 시도해 주세요’, noSupportToken ‘지원 토큰이 없습니다’, targetNotAlive ‘그 고개는 이미 뚫렸습니다’, targetAlreadyReceived ‘이번 라운드에 이미 지원을 받았습니다’, badArgs ‘잘못된 입력입니다’
  - 넋 화면에서는 남의 칸을 끌거나 팔 수 없다(`readOnly`)

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
describe('spirit', () => {
  test('survivors get no spirit card', () => {
    expect(spiritModel(viewWith({ me: 1, rows: [row({ seat: 1 })] }))).toBeNull();
  });
  test('card text and reasons', () => {
    const base = viewWith({ me: 2, watching: 1, rows: [row({ seat: 1, name: '가' }), row({ seat: 2, status: 'spirit' })] });
    base.mine.supportTokens = 1;
    expect(spiritModel(base)).toEqual({ title: '관전: 1번 가', tokens: 1, canSend: true, reason: null });
    base.rows[0]!.received = true;
    expect(spiritModel(base)).toMatchObject({ canSend: false, reason: '이번 라운드에 이미 받았습니다' });
    base.rows[0]!.received = false; base.mine.supportTokens = 0;
    expect(spiritModel(base)).toMatchObject({ canSend: false, reason: '지원 토큰이 없습니다' });
  });
  test('new reject texts', () => {
    expect(rejectText('staleUnit')).toBe('배치가 바뀌었습니다. 다시 시도해 주세요');
    expect(rejectText('targetAlreadyReceived')).toBe('이번 라운드에 이미 지원을 받았습니다');
  });
});
```

(`ViewOpts`, `viewWith`, `row`는 Task 17 시험 파일 `packages/client/test/online-models.test.ts`에 있는 것과 같은 모양으로 이 파일 안에 둔다. `watching`을 받는다.)

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/client/test/online-spirit.test.ts`
Expected: FAIL

- [ ] **Step 3: 넋 카드, 관전 클릭, 포기 확인창, 안내 화면, 재연결을 구현한다**

- [ ] **Step 4: 통과와 화면을 확인한다**

Run: `npx vitest run && npm run typecheck`
Expected: PASS

단계 파일 `SHOT\stage2-spirit.mjs`: 두 사람이 시작 → `b`에서 메뉴 ‘포기하고 나가기’ → ‘포기’ → 40초 기다려(다음 라운드 토큰) `b`에서 ‘엽전 5냥 보내기’ → 1초 뒤 `a`의 `window.__net.view.mine.coins`를 보내기 전과 비교해 출력 → `b` 화면 저장. 별도로 `a`의 주소를 새 탭에서 열어(같은 컨텍스트, 세션 저장소 복사 흉내로 `sessionStorage` 값을 넘겨) 옛 탭 화면을 저장한다.

Run: `node SHOT/shot.mjs SHOT/stage2-spirit-a.png 1280 720 SHOT/stage2-spirit.mjs`
Expected: 콘솔 오류 없음. 출력에 A의 엽전 차이 5(정확히 한 번). B 화면 아래 카드에 ‘관전: 1번 …’과 꺼진 ‘엽전 5냥 보내기’(‘이번 라운드에 이미 받았습니다’ 또는 토큰 0). 옛 탭 화면에 ‘다른 창에서 접속했습니다’

- [ ] **Step 5: 커밋한다**

```bash
git add packages/client
git commit -m "feat(client): spirit watch and support, forfeit, replaced-tab and reconnect notices"
```

---

### Task 19: 팀 결과 화면, 다시 하기, 도감 40종과 벼루 문구

**Implementer:** sol

**Files:**
- Create: `packages/client/src/online/result.ts`
- Modify: `packages/client/src/online/battle.ts`, `packages/client/src/online/app.ts`, `packages/client/src/ui/models.ts` (`skillText` 벼루 실제 값), `packages/client/src/ui/style.css`
- Test: `packages/client/test/online-result.test.ts`

**읽을 것:** 명세 7장 마지막 줄(결과 화면), 6장 "결과는 120초간 보관"과 다시 하기, 9장 벼루, 11장 결정 12. Task 6 `MatchResult`, `SeatResult`. Task 13 `notice rematch`. `packages/client/src/ui/result.ts`(1단계 그래프).

**Interfaces:**
- Consumes: Task 9 `ResultMsg`, `NoticeMsg`; Task 14 `connectJoin`, `NetClient.rematch()`, `lastName()`; Task 15 `startOnline`; `combineOptions`, `dexEntries`, `unitCard`(`ui/models.ts`)
- Produces:
  - `teamResultModel(result: MatchResult, names: Record<number, string>, data: GameData): { title: string; subtitle: string; rows: { seat: number; name: string; status: string; last: number; max: number; best: string; damage: number; series: (number | null)[]; helperText: string }[] }`
    - title: clear ‘팀 클리어’, wipe ‘전멸’, gate ‘스토리 관문 실패’
    - subtitle: `'도달 R라운드 · 역신 격파 K/2 · 생존 A/S'`
    - status: finished ‘완주’, eliminated `'R라운드 탈락 · ' + 원인`(잡귀 한도/고개 보스/포기/단절), unfinished ‘고개 보스 미완주’, aliveTeamLoss ‘생존·팀 패배’
    - best: `'이름 (G등급)'` 또는 `'–'`. series는 1~20라운드 칸, 탈락 뒤는 null(빈 점). helperText `'도우미 N회'`
  - 결과 화면: 상단 제목·부제, 여섯 줄(이름·상태·마지막/최대 잡귀·최고 유닛·역신 피해), 줄을 누르면 그 사람의 라운드 끝 잡귀 그래프(1단계 SVG 재사용, 한도 60선)와 도우미 횟수. 하단 ‘다시 하기’(`net.rematch()`), ‘나가기’(→ `/`)
  - `notice rematch` → 지금 방을 떠나고 `connectJoin(roomId, { name: lastName(), hostToken })` → 대기실
  - `skillText`: 트리거가 `always`이고 효과가 `dot`이며 `interval < dot.seconds`인 유닛은 `landed = min(pulses, floor(interval / pulseSeconds))`, `effective = mult × landed / pulses`로 `'… 지속 피해 (다시 걸려 실제 35%)'`처럼 붙인다(벼루: 2/6 × 105% = 35%). `skillText`가 `unit` 정보를 받도록 `skillText(skills, ctx?: { interval: number; pulseSeconds: number })`로 바꾸고 기존 호출부는 인자를 넘긴다(1단계 유닛은 해당 없음)

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
describe('team result', () => {
  test('titles, rows and series with gaps after elimination', () => {
    const result: MatchResult = { outcome: 'gate', tick: 7799, round: 9, yeoksinKills: 0, started: 2, alive: 1, seats: [
      { seat: 1, outcome: 'aliveTeamLoss', cause: null, round: 9, lastEnemies: 20, maxEnemies: 40, series: [1, 2, 3, 4, 5, 6, 7, 8, 20], bestUnit: { defId: 'gamasot', grade: 2 }, yeoksinDamage: 3000, helperOpens: 2 },
      { seat: 2, outcome: 'eliminated', cause: 'limit', round: 4, lastEnemies: 61, maxEnemies: 61, series: [5, 9, 30, 61], bestUnit: null, yeoksinDamage: 0, helperOpens: 0 },
    ] };
    const m = teamResultModel(result, { 1: '가', 2: '나' }, data);
    expect(m.title).toBe('스토리 관문 실패'); expect(m.subtitle).toBe('도달 9라운드 · 역신 격파 0/2 · 생존 1/2');
    expect(m.rows.map(r => r.status)).toEqual(['생존·팀 패배', '4라운드 탈락 · 잡귀 한도']);
    expect(m.rows[0]!.best).toBe('가마솥 (2등급)'); expect(m.rows[1]!.best).toBe('–');
    expect(m.rows[1]!.series.slice(3, 6)).toEqual([61, null, null]); expect(m.rows[1]!.series.length).toBe(20);
    expect(teamResultModel({ ...result, outcome: 'clear' }, {}, data).title).toBe('팀 클리어');
  });
  test('byeoru card shows the damage that really lands', () => {
    const s = createGame(data, 1); placeUnitForTest(s, 'byeoru', 0);
    expect(unitCard(s, 0)!.skillText).toContain('실제 35%');
  });
  test('four ready recipes: Z/X/C on the first three in table order, the fourth still listed', () => {
    const s = createGame(data, 1);
    ['horong', 'bujigaengi', 'buchae', 'dadeumi', 'hwaetbul', 'bitjaru'].forEach((id, i) => placeUnitForTest(s, id, i));
    const opts = combineOptions(s, 0).filter(o => o.missing.length === 0);
    expect(opts.map(o => [o.result, o.key])).toEqual([['hwaro', 'Z'], ['cheongsachorong', 'X'], ['mumyeong', 'C'], ['jwibul', null]]);
  });
  test('dex lists 40 units for stage 2', () => {
    expect(dexEntries(data).length).toBe(40);
  });
});
```

(`data = loadGameData('stage2')`)

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run packages/client/test/online-result.test.ts`
Expected: FAIL

- [ ] **Step 3: 결과 화면, 다시 하기 흐름, 벼루 문구를 구현한다**

- [ ] **Step 4: 통과와 화면을 확인한다**

Run: `npx vitest run && npm run typecheck`
Expected: PASS

단계 파일 `SHOT\stage2-result.mjs`: 두 사람이 시작 → 둘 다 포기(즉시 `wipe`) → 결과 화면에서 `b`의 줄 하나를 눌러 그래프를 연 상태로 저장 → 둘 다 ‘다시 하기’ → 3초 뒤 두 쪽의 `location.pathname`과 대기실 방장 번호를 출력.

Run: `node SHOT/shot.mjs SHOT/stage2-result-a.png 1280 720 SHOT/stage2-result.mjs`
Expected: 콘솔 오류 없음. 결과 화면에 ‘전멸’, 여섯 줄 중 두 줄이 ‘…라운드 탈락 · 포기’, 그래프가 보인다. 출력에서 두 사람의 새 경로가 같은 `/room/<새 id>`이고, 방장은 먼저 누른 사람이다

- [ ] **Step 5: 커밋한다**

```bash
git add packages/client
git commit -m "feat(client): team result, rematch flow, 40-unit dex and real byeoru numbers"
```

**체크포인트 5 리뷰:** 명세 7장 화면 표의 영역별 내용이 모두 있는지, 상태 우선순위와 숫자 올림이 시험과 같은지, 1배 화면에서 여덟 글자 닉네임이 들어가는지, 넋이 남의 칸을 못 움직이는지, 결과·다시 하기가 두 사람에게 같게 보이는지 본다.

---

## 체크포인트 6: 부하·밸런스·마무리 (Task 20~22)

### Task 20: 부하 측정

**Implementer:** sol

**Files:**
- Create: `packages/server/scripts/load.ts`

**읽을 것:** 명세 10장 표의 "부하" 줄과 7장 지연 목표. Task 11·12 `RoomCore`, `test/helpers.ts`의 `FakeLink`, `fakeDeps`.

**Interfaces:**
- Consumes: `RoomCore`(`devNoElimination`은 `deps.dev = true`일 때만), `FakeLink`, `fakeDeps`, `placeUnitForTest`, `spawnEnemyForTest`(`@dorandi/logic/testing`), `loadGameData('stage2')`
- Produces: `npm run load -w @dorandi/server`가 측정값을 출력하고, 목표를 넘으면 `process.exitCode = 1`. 시간 측정이 흔들리는 시험이라 `npm test`에는 넣지 않는다
- 절차:
  1. 6자리 방을 `devNoElimination: true`로 시작하고 판을 1라운드로 `jumpToTick(match, 700)`
  2. 고개마다 강화 `slots = 3`과 24칸을 모두 열고, 4등급 12종을 번갈아 24칸에 놓는다(6 × 24 = 144칸)
  3. 매 틱 전에 고개마다 일반 적이 70마리가 되도록 `spawnEnemyForTest(lane, 'japgwi', 무작위가 아닌 고정 간격 d, 1e9)`로 채운다(총 420)
  4. 1,200틱을 `runTick` 단위로 돌리며 틱마다 `performance.now()`로 잰다. 시계는 가짜(`deps.clock.t += 50`)
  5. 출력: p50, p95, 최대(ms), 처리한 틱 수. 목표: p95 ≤ 10ms, 최대 ≤ 25ms, 틱 1,200개 모두 처리
  6. 표시 지연: 가짜 링크 한쪽에서 600틱 동안 20틱마다 `summon`을 보낸다. 보낸 메시지는 50ms 뒤 서버에 도착, 서버가 보낸 `mine`은 50ms 뒤 도착한 것으로 가짜 시계에서 계산해 "보냄 → 결과 도착" 지연의 p95를 출력한다. 목표 p95 ≤ 170ms(명령 대기 50 + 왕복 100 + 한 프레임 16, 명세 7장)

- [ ] **Step 1: 스크립트를 쓴다**

- [ ] **Step 2: 실행한다**

Run: `npm run load -w @dorandi/server`
Expected: `ticks 1200/1200`, `p95 ≤ 10ms`, `max ≤ 25ms`, `summon→result p95 ≤ 170ms`를 출력하고 종료 코드 0. 넘으면 출력값을 그대로 보고한다(최적화는 이 Task 범위 밖)

- [ ] **Step 3: 전체 확인**

Run: `npx vitest run && npm run typecheck`
Expected: PASS

- [ ] **Step 4: 커밋한다**

```bash
git add packages/server/scripts/load.ts
git commit -m "test(server): six-lane load and display latency measurement"
```

---

### Task 21: 6봇 밸런스 1차

**Implementer:** sol

**Files:**
- Modify: `packages/logic/data/stage2/coop.json` (`yeoksin[].baseHp`), 필요하면 `packages/logic/data/stage2/balance.json`(`hp.coef` 덮어쓰기)
- Create: `docs/balance/stage2-tuning.md`
- Modify (값이 바뀐 경우만): `packages/logic/test/data-stage2.test.ts`의 `baseHp` 기대값

**읽을 것:** 명세 8장 전체, 11장 1·13번. Task 8 CLI 출력 형식. `docs/balance/stage1-tuning.md`(형식 참고).

**Interfaces:**
- Consumes: Task 8 `npm run sim -- --stage 2 …`
- Produces: `docs/balance/stage2-tuning.md`(시작값 결과, 바꾼 값 → 결과 한 줄씩, 최종값, 관찰)

- [ ] **Step 1: 시작값으로 다섯 구성을 돌린다**

Run (각각):
`npm run sim -- --stage 2 --players 1 --bots normal --seeds 100 --out sim-out/s2-n1.csv`
`npm run sim -- --stage 2 --players 2 --bots normal --seeds 100 --out sim-out/s2-n2.csv`
`npm run sim -- --stage 2 --players 6 --bots normal --seeds 100 --out sim-out/s2-n6.csv`
`npm run sim -- --stage 2 --players 6 --bots clumsy --seeds 100 --out sim-out/s2-c6.csv`
`npm run sim -- --stage 2 --players 6 --bots normal,normal,normal,clumsy,clumsy,clumsy --seeds 100 --out sim-out/s2-mix.csv`
Expected: 요약 다섯 개. `stage2-tuning.md`의 "시작값" 절에 붙인다

- [ ] **Step 2: 규칙대로 한 번에 한 값씩 고친다**

- 개인 난이도 먼저: 보통 1인 팀 클리어가 80판 미만이면 `stage2/balance.json`에 `hp.coef`를 19에서 1씩 내려 덮어쓴다(`{"prepSeconds": 30, "hp": {"base": 75, "coef": 18, "exp": 1.5}}`처럼 `hp` 전체를 쓴다)
- 역신: 보통 1·2·6인 각각에서 단계별 처치 틱 중앙값이 관문 시간(첫째 3,200틱, 둘째 4,000틱)의 50~80%가 되도록 그 단계 `baseHp`를 10%씩 조정하고 같은 시드로 다시 돈다
- 1인과 6인이 서로 반대 방향으로 벗어나 기본 체력만으로 맞출 수 없으면 **멈추고** 두 결과를 보고한다(명세 11장 13번: 인원 계수는 사용자가 다시 정한다)
- 바꿀 때마다 `stage2-tuning.md`에 "바꾼 값 → 결과" 한 줄

- [ ] **Step 3: 목표와 관찰값을 기록한다**

목표(명세 8장): 보통 6인 팀 클리어 80판 이상, 혼합 3+3에서 "개인 탈락 후 팀 클리어"가 1판 이상. 별도 집계: 진입 순서별 역신 피해 0인 자리 비율, 관문 패배 라운드, 개인 탈락 원인, 남은 1등급 종류별 수(빗자루), 보스 정지 비율(결정 7의 30% 기준을 볼 수 있게 `stunTicks > 0`인 보스 틱 비율을 요약에 없으면 적지 않는다). 1단계 비교값(보통 93/100, 최대 잡귀 중앙값 16, 강철이 54.9초)은 비교로만 적는다.

- [ ] **Step 4: 검증과 전체 시험**

Run: `npm run validate && npx vitest run && npm run typecheck`
Expected: PASS. `baseHp`를 바꿨다면 `data-stage2.test.ts`의 `baseHp` 기대값만 새 값으로 고친다. 역신 시험(Task 7)은 데이터에서 값을 읽으므로 그대로 통과해야 한다

- [ ] **Step 5: 커밋한다**

```bash
git add packages/logic/data/stage2 packages/logic/test/data-stage2.test.ts docs/balance/stage2-tuning.md
git commit -m "balance: first stage 2 six-bot pass"
```

---

### Task 22: 마무리 확인과 두 브라우저 수동 확인 안내

**Implementer:** sol

**Files:**
- 코드 변경 없음(발견한 문제는 보고만 한다)

**읽을 것:** 명세 10장 "완료 조건"과 "두 브라우저 수동 확인" 1~5.

- [ ] **Step 1: 자동 확인을 모두 돌린다**

Run: `npx vitest run && npm run typecheck && npm run validate && npm run load -w @dorandi/server`
Expected: 전체 PASS, 골든 10개 PASS, validate 오류 0, 부하 목표 충족

- [ ] **Step 2: 배포 경로를 확인한다**

Run: `npm start`(백그라운드) 뒤 `URL=http://localhost:2567/ node SHOT/shot.mjs SHOT/stage2-prod.png 1280 720 SHOT/stage2-two.mjs` (단계 파일 안의 주소가 `5173`으로 고정돼 있으면 `URL` 환경 변수의 출처를 쓰도록 고쳐 둔다)
Expected: 빌드한 클라이언트가 2567 한 출처에서 뜨고, Task 16과 같은 결과(A 토큰 2, B 토큰 4)

- [ ] **Step 3: 사용자에게 넘길 수동 확인 목록을 보고에 적는다**

명세 10장 "두 브라우저 수동 확인" 1~5를 그대로 옮기고, 각 항목에 필요한 준비를 붙인다:
1. 서로 다른 브라우저(예: Chrome과 Edge)에서 `npm start` 주소로 방을 만들고 링크로 입장
2. 메뉴를 닫은 채 ‘뚝딱! (N번)’과 ‘보너스까지 1등급 N번’ 읽기, 선택 → Z/X/C, 보스 따라 옮기기
3. 한쪽에 적 쌓기. 역신 예고 마지막 1초는 `DORANDI_DEV=1 npm run start -w @dorandi/server`와 주소 `?dev=jump4590`으로 바로 확인
4. 새로고침 → 상대 화면의 ‘재접속 N초’, 복귀 뒤 자리·잔액·보스 위치. 한쪽 포기 → 관전·지원 5냥 한 번
5. 관문을 놓치는 판(`?dev=jump7700`)과 한 명만 완주하는 판, 넋의 결과 화면, 두 사람의 다시 하기
그리고 명세의 관찰 항목(여섯 명 한 판 뒤 누가 다시 하기를 누르는지, 넋이 결과까지 남는지, 11장 1~3번 판단 자료)을 기록하도록 안내한다.

- [ ] **Step 4: 보고한다(커밋 없음)**

**체크포인트 6 리뷰:** 부하 수치, 밸런스 기록과 사용자 판단이 필요한 항목(11장 1·2·3·13번), 수동 확인 목록이 명세 10장과 맞는지 본다.

---

## 명세 대응표

| 명세 | Task |
| --- | --- |
| 1장 판 상태·로직 경계·회귀 기준 | 1, 2, 5 |
| 2장 라운드·적·잡귀 집계 | 5, 6 |
| 3장 역신·관문·체력 절충 | 7 |
| 4장 틱 순서·탈락·보스 시간·넋 지원 | 5, 6 |
| 5장 소환·조합·경제 | 기존 핸들러, 3(데이터), 5(고개별 적용) |
| 6장 방·재접속·입력 | 10, 11, 12, 13 |
| 7장 동기화·화면 | 9, 14, 16, 17, 18, 19 |
| 8장 시뮬레이터·밸런스 | 8, 21 |
| 9장 40종 | 3, 4, 19(문구) |
| 10장 시험 | 각 Task 시험, 20(부하), 22(수동) |
| 11장 결정 4~12 | 6(4·5·6), Global Constraints(7·8·9·11), 11(10), 19(12) |
