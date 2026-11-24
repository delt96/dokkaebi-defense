# 6등급·히든 탄생 알림 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 누가 6등급이나 히든 유닛을 새로 얻으면, 방의 모두에게 고개 화면 위쪽의 탄생 띠와 고개 현황 줄 반짝임을 보여 준다.

**Architecture:** logic에 "이 이벤트가 탄생인가"를 판단하는 순수 함수(`birthOf`)를 두고 서버와 솔로가 같이 쓴다. 서버는 기존 `gamble` 알림을 보내는 자리(`RoomCore.runTick`)에서 `birth` 알림을 모두에게 보내고, 팀 첫 6등급은 방이 센다. 클라이언트는 솔로에서는 내 이벤트, 온라인에서는 `birth` 알림으로 같은 띠 모델을 만들어 `FxLayer`에 그린다. 내 도박 당첨은 굴림 연출이 끝나 결과가 보일 때 띄운다.

**Tech Stack:** TypeScript, vitest(+happy-dom), Phaser 3.90, Colyseus 0.18 (npm workspaces `@dorandi/logic|server|client`)

**Spec:** `docs/superpowers/specs/2026-11-24-birth-alert-design.md` · 목업 `docs/design/mockups/2026-11-24-birth-alert.html`

## Global Constraints

- 게임 규칙, 판 결과, 리플레이, 판 해시(`matchHash`)는 바뀌지 않는다. 탄생 알림은 `GameEvent`·상태에 아무것도 더하지 않는다.
- 탄생 = 6등급 또는 히든(`UnitDef.hidden`) 유닛을 새로 얻음: `combine`(길들이기 전용 조합 포함), `tame`, `gambleUnit`(결과 6등급 또는 `'hidden'`). `jigeSwap`, 보관함 꺼내기, 스냅숏(`full`)은 탄생이 아니다.
- 띠 표시 시간 2500ms. 6등급은 금빛(`0xffe35a`), 히든은 보랏빛(`0xc48cff`).
- 문구(그대로 씀):
  - 다른 사람: `"{seat} {name} 님이 만들었습니다"` / `"… 님이 길들였습니다"` / `"… 님이 도박에서 뽑았습니다"`
  - 나: `"조합"` / `"길들이기 성공"` / `"도박 당첨"`
  - 아랫줄: `"{N}등급 · 물딜|마딜"`, 히든이면 앞에 `"히든 "`. 첫 6등급이면 뒤에 `" · 이번 판 팀 첫 6등급"`(온라인) 또는 `" · 이번 판 첫 6등급"`(솔로)
- 엽전 ×5·×10, 5등급 당첨의 `gamble` 알림은 그대로. 6등급·히든 당첨이면 `gamble` 알림 대신 `birth` 알림만 보낸다.
- 4·5등급의 "★ 이름" 토스트는 그대로. 6등급·히든이면 토스트를 띄우지 않는다(`big` 시트와 테두리 빛은 그대로).
- '효과 줄이기'(`reduceFx`/`flags.shake === false`)에서는 화면 흔들림 없이 띠만.
- 효과음: 띠가 뜰 때 `sparkle`, 다른 사람의 탄생이면 `combineBig`도.
- 코드 주석은 영어, 기본 없음(반직관적 이유·함정만).

## Review Focus

1. **온라인 내 도박 당첨의 순서**: `birth` 알림이 굴림 결과보다 먼저 오든 늦게 오든 띠는 결과가 보일 때 한 번만 뜬다. → Task 3 `BirthHold` 테스트.
2. **온라인 내 조합의 중복**: 내 레인 이벤트(`combine`)와 `birth` 알림이 둘 다 오지만 띠는 한 번. 온라인에서는 이벤트 경로로 띄우지 않는다. → Task 4 Step 6에서 `birthSource` 테스트.
3. **같은 틱에 여러 탄생**(두 사람이 동시에, 또는 한 사람이 조합 연속): 차례로 모두 보이고, 대기열이 넘치면 오래된 것부터 버린다(최대 대기 4). → Task 3 `BirthQueue` 테스트.
4. **솔로 다시 하기**: 첫 6등급 표시가 새 판에서 다시 나온다. → Task 3 `FirstSix.reset` 테스트.
5. **6등급이 아닌 히든(4등급)**: 보랏빛 띠는 뜨지만 "첫 6등급"은 붙지 않고 팀 첫 6등급 카운트도 쓰지 않는다. → Task 2 서버 테스트와 Task 3 모델 테스트.

---

### Task 1: logic `birthOf`

**Files:**
- Create: `packages/logic/src/birth.ts`
- Modify: `packages/logic/src/index.ts` (export 한 줄)
- Test: `packages/logic/test/birth.test.ts`

**Interfaces:**
- Produces:
  - `export type BirthVia = 'combine' | 'tame' | 'gamble'`
  - `export interface Birth { via: BirthVia; defId: string; unitId: number; grade: number; hidden: boolean }`
  - `export function birthOf(data: GameData, event: GameEvent): Birth | null`

- [ ] **Step 1: Write the failing test** (`loadGameData('stage3')`의 실제 유닛으로)

```ts
test('a grade 6 combine is a birth', () => {
  expect(birthOf(d3, { type: 'combine', replacedUnitId: 1, unitId: 7, defId: 'bihyeongrang', slot: 0 }))
    .toEqual({ via: 'combine', defId: 'bihyeongrang', unitId: 7, grade: 6, hidden: false });
});
test('a grade 5 combine is not', () => {
  expect(birthOf(d3, { type: 'combine', replacedUnitId: 1, unitId: 7, defId: 'top', slot: 0 })).toBeNull();
});
test('a tamed grade 4 hidden is a birth', () => {
  expect(birthOf(d3, { type: 'tame', enemyId: 3, defId: 'bulgasari', unitId: 9, slot: 2 }))
    .toMatchObject({ via: 'tame', grade: 4, hidden: true });
});
test('the tame recipe result counts as a combine birth', () => {
  expect(birthOf(d3, { type: 'combine', replacedUnitId: 1, unitId: 4, defId: 'topnisoemeokbo', slot: 0 }))
    .toMatchObject({ via: 'combine', grade: 6, hidden: true });
});
test('gamble: grade 6 and hidden results are births, grade 5, misses and coin bets are not', () => {
  const base = { type: 'gambleUnit', table: 'big', buckwheatCost: 3, consolation: 40, jige: false } as const;
  expect(birthOf(d3, { ...base, result: 6, defId: 'bihyeongrang', unitId: 5 })).toMatchObject({ via: 'gamble', grade: 6 });
  expect(birthOf(d3, { ...base, result: 'hidden', defId: 'bulgasari', unitId: 5 })).toMatchObject({ via: 'gamble', hidden: true });
  expect(birthOf(d3, { ...base, result: 5, defId: 'top', unitId: 5 })).toBeNull();
  expect(birthOf(d3, { ...base, result: 0 })).toBeNull();
  expect(birthOf(d3, { type: 'gambleCoins', stake: 100, multiplier: 10, payout: 1000 })).toBeNull();
});
test('a jige swap is never a birth', () => {
  expect(birthOf(d3, { type: 'jigeSwap', source: { zone: 'board', index: 0, unitId: 1 }, unitId: 2, defId: 'bihyeongrang' })).toBeNull();
});
```

- [ ] **Step 2: Run** `npx vitest run packages/logic/test/birth.test.ts` → FAIL (module not found)
- [ ] **Step 3: Implement `birthOf`** in `packages/logic/src/birth.ts`. `unitDefFast(data, defId)`로 등급·`hidden`을 읽고, `grade === 6 || def.hidden`일 때만 `Birth`. `export { birthOf, type Birth, type BirthVia } from './birth';`를 `index.ts`에 추가.
- [ ] **Step 4: Run** 같은 명령 → PASS
- [ ] **Step 5: Commit** `git commit -m "Tell which events give a grade 6 or hidden unit"`

---

### Task 2: 서버 `birth` 알림

**Files:**
- Modify: `packages/logic/src/match/wire.ts` (`NoticeMsg`에 한 가지 추가)
- Modify: `packages/server/src/core/RoomCore.ts` (`runTick`의 gamble 알림 블록, 필드 하나)
- Test: `packages/server/test/econ-room.test.ts`

**Interfaces:**
- Consumes: `birthOf`, `BirthVia` (Task 1)
- Produces: `NoticeMsg`에 `| { kind: 'birth'; seat: number; name: string; defId: string; unitId: number; via: BirthVia; firstSix: boolean }`

- [ ] **Step 1: Write the failing tests** (기존 `room60` 도우미 사용)
  - 기존 `test.each([[67, '6등급'], [43, '숨은 유닛']])`를 바꾼다: 두 링크 모두 `last('notice')`가 `{ kind: 'birth', seat: 1, name: '가', via: 'gamble' }`를 포함하고, `defId`는 `lane`의 그 `unitId` 유닛 것과 같으며, `firstSix`는 `unitDefFast(d3, defId).grade === 6`과 같다. 두 링크 모두 `all('notice')`에 `kind: 'gamble'`이 없다.
  - `'a grade 6 combine tells everyone, and only the first is the team first'`: 1번 자리에 `top`, `kkeul`, `jumadeung`을 `placeUnitForTest`로 놓고 `coins = 200`, `buckwheat = 2`; `send(r.core, 'a', 1, 'combine', { result: 'bihyeongrang' })`, `tickOnce` → 두 링크에 `{ kind: 'birth', seat: 1, defId: 'bihyeongrang', via: 'combine', firstSix: true }`. 2번 자리(링크 `b`)에서 같은 재료로 한 번 더 → `firstSix: false`.
  - `'a grade 5 combine sends no birth'`: 4등급 재료 두 개 + 묵으로 5등급 하나(레시피는 `recipes.json`에서 5등급 하나 골라 재료를 놓는다) → 두 링크 모두 `all('notice')`에 `kind: 'birth'` 없음.
  - 기존 `'only peers get the room notice for a big hit'`(×10)는 그대로 통과해야 한다.
- [ ] **Step 2: Run** `npx vitest run packages/server/test/econ-room.test.ts` → 새 테스트 FAIL
- [ ] **Step 3: Implement**
  - `wire.ts`: 위 `NoticeMsg` 가지 추가(`BirthVia`는 `../birth`에서 import).
  - `RoomCore`: `private sawSix = false;`. `runTick`의 레인 이벤트 루프에서 이벤트마다 먼저 `const birth = birthOf(match.data, event)`; 있으면 `firstSix = birth.grade === 6 && !this.sawSix`(그리고 6이면 `sawSix = true`), `this.notice(link, {...})`를 **모든** 링크에 보내고 `continue`(그래서 6등급·히든 도박은 `gamble` 알림을 보내지 않는다). 없으면 기존 gamble 처리 그대로.
- [ ] **Step 4: Run** `npx vitest run packages/server` → PASS
- [ ] **Step 5: Commit** `git commit -m "Tell the whole room when someone gets a grade 6 or hidden unit"`

---

### Task 3: 클라이언트 띠 모델

**Files:**
- Create: `packages/client/src/ui/birth.ts`
- Test: `packages/client/test/birth.test.ts`

**Interfaces:**
- Consumes: `Birth`, `BirthVia`, `unitDefFast`
- Produces:
  - `export interface BirthAlert { seat?: number; name?: string; defId: string; unitId: number; via: BirthVia; firstSix: boolean }`
  - `export interface BirthBanner { who: string; title: string; sub: string; color: number; defId: string; mine: boolean }`
  - `export function birthBanner(data: GameData, alert: BirthAlert, opts: { mine: boolean; team: boolean }): BirthBanner`
  - `export const BIRTH_MS = 2500`
  - `export class BirthQueue { push(b: BirthBanner): void; current(now: number): { banner: BirthBanner; start: number } | null; clear(): void }` — 대기 최대 4, 넘치면 가장 오래된 대기를 버림. `current`는 지금 것이 `BIRTH_MS` 지나면 다음 것을 `start = now`로 꺼낸다.
  - `export class BirthHold { hold(alert: BirthAlert): BirthAlert | null; reveal(unitId: number): BirthAlert | null; clear(): void }` — 같은 `unitId`의 알림과 결과 공개 중 **두 번째로 온 쪽**이 알림을 돌려준다(한 번만).
  - `export class FirstSix { take(grade: number): boolean; reset(): void }` — 솔로용. 판에서 처음 `grade === 6`일 때만 true.

- [ ] **Step 1: Write the failing tests**

```ts
test('a peer combine reads with the seat and name', () => {
  const b = birthBanner(d3, { seat: 2, name: '범수', defId: 'bihyeongrang', unitId: 1, via: 'combine', firstSix: true }, { mine: false, team: true });
  expect(b).toMatchObject({ who: '2 범수 님이 만들었습니다', title: '귀교 목수', sub: '6등급 · 마딜 · 이번 판 팀 첫 6등급', color: 0xffe35a, mine: false });
});
test('my own reads with the way it came, solo has no 팀', () => {
  expect(birthBanner(d3, { defId: 'bihyeongrang', unitId: 1, via: 'gamble', firstSix: true }, { mine: true, team: false }))
    .toMatchObject({ who: '도박 당첨', sub: '6등급 · 마딜 · 이번 판 첫 6등급' });
});
test('a hidden grade 4 is violet and never the first six', () => {
  expect(birthBanner(d3, { seat: 3, name: '손님', defId: 'bulgasari', unitId: 1, via: 'tame', firstSix: false }, { mine: false, team: true }))
    .toMatchObject({ who: '3 손님 님이 길들였습니다', title: '쇠밥짐승', sub: '히든 4등급 · 물딜', color: 0xc48cff });
});
test('the queue shows each in turn and drops the oldest waiting past four', () => { /* push 6 at t=0: current(0) is #1; current(2500) is #3 (#2 dropped); … */ });
test('hold: notice first then reveal gives it once; reveal first then notice gives it once', () => { /* … */ });
test('FirstSix: only the first grade 6 is first, and again after reset', () => {
  const f = new FirstSix();
  expect([f.take(4), f.take(6), f.take(6)]).toEqual([false, true, false]);
  f.reset();
  expect(f.take(6)).toBe(true);
});
```

큐 테스트 기대값: 0ms에 6개를 넣으면 지금 1번, 대기 2~6 중 넘친 2번이 버려져 대기 3~6. `current(0)` → 1번, `current(2499)` → 1번, `current(2500)` → 3번(`start: 2500`), 그 뒤 4·5·6번 순서, 끝나면 null.

- [ ] **Step 2: Run** `npx vitest run packages/client/test/birth.test.ts` → FAIL
- [ ] **Step 3: Implement** `packages/client/src/ui/birth.ts` (Phaser 없음, 순수).
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `git commit -m "Model the birth banner, its queue and the held gamble reveal"`

---

### Task 4: 화면 연결 (띠·토스트·알림·반짝임)

**Files:**
- Modify: `packages/client/src/fx/plan.ts` (`bigUnit`에 `toast: boolean`)
- Modify: `packages/client/src/fx/FxLayer.ts` (`bigUnit` 토스트 조건, `birth()` + `drawText`에서 띠 그리기, `clear()`에서 큐 비우기)
- Modify: `packages/client/src/LaneScene.ts` (`showBirth(b: BirthBanner)`)
- Modify: `packages/client/src/driver.ts`, `packages/client/src/net/NetDriver.ts` (`onBirthNotice`)
- Modify: `packages/client/src/ui/mount.ts` (연결)
- Modify: `packages/client/src/online/panels.ts` (`renderRows` 4번째 인자), `packages/client/src/ui/style.css`
- Test: `packages/client/test/fx-plan.test.ts`, `packages/client/test/netdriver.test.ts`, `packages/client/test/birth.test.ts`, `packages/client/test/online-models.test.ts`(또는 renderRows를 시험하는 기존 파일)

**Interfaces:**
- Consumes: Task 1~3 전부
- Produces:
  - `FxCmd` `bigUnit`에 `toast: boolean` (`!(def.grade >= 6 || def.hidden)`)
  - `FxLayer.birth(b: BirthBanner, spriteKey: string | null, now: number): void`
  - `LaneScene.showBirth(b: BirthBanner): void` — `spriteKey(b.defId, SPRITE_IDS, this.artAlias)`로 키를 찾아 `fx.birth`에 넘김
  - `Driver.onBirthNotice?(cb: (alert: BirthAlert, mine: boolean) => void): void` — `NetDriver`가 `notice.kind === 'birth'`에서 `mine = alert.seat === view.me.seat`로 부름
  - `export function birthSource(online: boolean): 'events' | 'notice'` (`ui/birth.ts`) — 솔로는 이벤트, 온라인은 알림
  - `renderRows(view, data, overlay = '', flashing: ReadonlySet<number> = new Set())` — 해당 자리 줄에 `birth-flash` 클래스

- [ ] **Step 1: Write the failing tests**
  - `fx-plan.test.ts`: `bihyeongrang` 조합 → `bigUnit`에 `toast: false`; 기존 연자방아(4등급) 기대에 `toast: true` 추가.
  - `netdriver.test.ts`: 방에서 `notice`로 `{ kind: 'birth', seat: 2, … }`를 흘리면 `onBirthNotice` 콜백이 `(alert, false)`, 내 자리 번호면 `(alert, true)`.
  - `birth.test.ts`: `expect(birthSource(false)).toBe('events'); expect(birthSource(true)).toBe('notice');`
  - renderRows: `flashing = new Set([2])`이면 2번 줄에만 `birth-flash` 클래스.
- [ ] **Step 2: Run** `npx vitest run packages/client` → 새 테스트 FAIL
- [ ] **Step 3: Implement plan/FxLayer**
  - `plan.ts`: `bigUnit` push에 `toast`.
  - `FxLayer`: `bigUnit`에서 `if (cmd.toast) this.toast(...)`. `birth(b, key, now)`는 `BirthQueue`에 넣고, `drawText`에서 `current(now)`를 그린다: 화면 위쪽(`y`는 캔버스 높이의 약 7%~29%, 목업 1번) 전체 폭 띠를 `this.top`에 그리고, 스프라이트 이미지 하나(크기 2.5배, 없으면 생략)와 글자 세 줄(`who` 작게, `title` 크게 `b.color`, `sub` 작게)을 미리 만들어 둔 Text/Image로 보인다. 들어올 때 옆으로 펼쳐지고 끝 20%에서 흐려짐(기존 배너의 `slide`/`alpha` 모양 재사용). 띠 시작 순간 `flags.shake`면 약하게 흔들림(140ms, 0.003). `clear()`에서 큐를 비운다.
- [ ] **Step 4: Implement wiring**
  - `driver.ts`의 `Driver`에 `onBirthNotice?`, `NetDriver`에 구현(`onGambleNotice` 옆).
  - `mount.ts`:
    - `const births = new BirthHold(); const firstSix = new FirstSix();` 띄우는 함수 `showBirth(alert, mine)`: `scene.showBirth(birthBanner(data, alert, { mine, team: online }))`, `gameAudio.play('sparkle')`, `!mine`이면 `gameAudio.play('combineBig')`, 온라인이고 `alert.seat !== undefined`이면 그 자리를 `BIRTH_MS` 동안 반짝임 목록에 넣고 `render()`.
    - 솔로(`birthSource(online) === 'events'`): `driver.onEvents`에서 `birthOf`가 나오면 `firstSix: firstSix.take(b.grade)`로 알림을 만들고, `via === 'gamble'`이면 `births.hold(alert)`(즉시 돌려받으면 띄움), 아니면 바로 띄움.
    - 온라인: `driver.onBirthNotice?.((alert, mine) => …)` — `mine && alert.via === 'gamble'`이면 `births.hold`, 아니면 바로 띄움.
    - 도박 결과가 보이는 곳(`scene.showGambleResult(...)` 바로 뒤, `id`가 있을 때): `births.reveal(id)`가 알림을 주면 `showBirth(alert, true)`.
    - `resetUi()`에서 `births.clear()`, `firstSix.reset()`, 반짝임 목록 비움.
    - `renderRows(view, opts.data, …, flashingSeats(now))` — 만료된 자리는 빼고 넘김.
  - `style.css`: `.lane-row.birth-flash`에 금빛 배경 그라데이션(목업 2번).
- [ ] **Step 5: Run** `npx vitest run` (전체) → PASS, `npm run typecheck` → 오류 없음
- [ ] **Step 6: 화면 확인** (`run` 스킬로 클라이언트를 띄워) 솔로 3단계를 개발 점프로 20라운드 이후에 시작해 6등급 조합을 하나 만들어 띠가 2.5초 뜨고 "이번 판 첫 6등급"이 붙는지, 두 번째에는 안 붙는지, 4·5등급 조합의 "★ 이름" 토스트가 그대로인지, '효과 줄이기'에서 흔들림이 없는지 본다. 온라인은 탭 두 개로 2인 방을 만들어 다른 사람 화면에 띠와 줄 반짝임이 뜨는지, 내 큰 판 도박의 6등급이 굴림이 끝난 뒤 한 번만 뜨는지 본다. 보지 못한 항목은 보고에 그렇다고 적는다.
- [ ] **Step 7: Commit** `git commit -m "Show the birth banner to everyone and flash the maker's row"`
