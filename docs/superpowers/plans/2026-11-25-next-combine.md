---
title: 다음 조합 한 곳으로 (B1) 구현 계획
project: dokkaebi-defense
type: task
priority: high
status: in-progress
startDate: 2026-11-25
progress: 0%
---

# 다음 조합 한 곳으로 (B1) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 조합 도우미·왼쪽 패널·Z/X/C·W·보드 표시가 '다음 할 일' 목록 하나를 같은 순서로 나눠 쓰게 한다.

**Architecture:** 로직에서 조합 명령이 쓰는 칸 고르기를 `combinePlan`으로 꺼낸다. 클라이언트 `ui/models.ts`에 순수 함수 `nextCombines`(묶음·순서·키·나눔)와 그것을 읽는 `boardMarks`·`nextPick`·`moveStep`을 둔다. 화면(솔로 왼쪽 패널, 온라인 도우미, 하단 카드, 지게 줄, LaneScene)은 이 결과만 그린다. mount는 화면 상태(범위, W로 고른 조합, 마우스 올린 줄, 옮기기 상태)만 들고, 판에는 `scene.boardMarks`·`scene.moving` 속성으로 넘긴다(시험용 가짜 scene이 메서드 없이도 깨지지 않게 메서드가 아니라 속성으로 둔다).

**Tech Stack:** TypeScript, Phaser 3.90, Vitest 3(happy-dom), Vite 6.

**Spec:** `docs/superpowers/specs/2026-11-25-next-combine-design.md` · 목업 `docs/design/mockups/2026-11-25-next-combine.html`. 함께 볼 표: B2 `2026-11-25-window-layout-design.md` '다른 설계와 맞춘 것', B3 `2026-11-25-status-signals-design.md` '교차 검토 반영', B4 `2026-11-25-first-visit-design.md` '다른 설계와 맞춘 것'. 사용자가 2026-11-25에 '사용자에게 물을 것'을 모두 권장안 (가)로 확정했다.

## Global Constraints

- 작업 위치: worktree `C:/Users/USER/Desktop/이범수/도랜디/dokkaebi-ui-fixes`, 브랜치 `ui-review-fixes`. 원래 저장소와 사용자의 5173 개발 서버는 건드리지 않는다. push·main 머지 금지.
- 기준 화면 640×360(배율 1). 새로 넣는 글자는 10px 이상, 새로 넣는 누르는 것은 24×24px 이상(설계가 적은 예외: 능력 줄 120×16, 조합 줄 사이 4px, 지게 후보 사이 4px).
- 게임 규칙·데이터는 바꾸지 않는다. 조합 명령이 어느 유닛을 쓰는지도 그대로다(`combinePlan`은 꺼내기만 한다).
- 새 장식·테마 그림 없음. 색은 `style.css` `:root`에 있는 것만: `--ink #e8e0d0`, `--ink-dim #9a90a8`, `--accent #ffe08a`, `--danger #ff3b2f`, 바탕 `--panel #17121f`, 단추 바탕 `#2a2236`.
- 초점: 새 DOM 단추(범위 단추, 조합 줄, '+N개 더', 능력 줄, 지게 후보 줄, 온라인 도우미 줄·범위 단추)는 `:focus-visible`에서 `outline: 2px solid var(--accent)`. 크림 `--ink`는 판 위 표시(▲·꺾쇠·키 꼬리표·놓을 칸·옮길 칸 점선)에만 쓴다.
- 기호(⇄·▲·▸·등급 모양 ●■◆)는 글꼴 글자로 쓰지 않는다. DOM은 인라인 SVG·CSS 도형, 판은 Phaser 도형. ✓·✗는 지금 글자 그대로.
- 화면 글은 한국어, 이 계획에 적은 문구 그대로. 코드 주석은 영어이고 전역 주석 규칙(역추론 못 하는 이유만)을 따른다.
- A줄 수정(`docs/superpowers/plans/2026-11-25-ui-review-fixes.md` '진행', 커밋 `51ca65e`~`d7ebdb9`)을 되돌리지 않는다. 특히 `jigeCandidates`의 자기 제외, 3등급 이상 두 번 눌러 판매(`PressConfirm`), '한 번 더 누르면 판매 +N냥', 유닛이 없을 때 첫 문장 'Space나 뚝딱!으로 유닛을 뽑으세요.'.
- B2·B3·B4가 할 일(`#win-left/#win-right`, 판 잠금, 바깥 화면 배율, inert, 반복 움직임 순위 연결, 오라·폭발 효과)은 하지 않는다.
- 커밋: 바꾼 파일만 경로로 `git add`(`-A`·`.` 금지). 메시지는 영어 한 줄(동사로 시작) + 빈 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 각 작업 끝: 그 작업 시험 + `npm test` + `npm run typecheck`가 통과해야 커밋한다. 바꾼 문구·순서를 기대하던 기존 시험은 이 계획의 값으로 고치고, 고친 시험 파일도 그 커밋에 넣는다. `sim.test.ts` 두 개가 병렬 부하로 5초를 넘는 것은 이번 변경과 무관(A줄 기록)이니 단독으로 다시 돌려 확인한다.
- 띄운 프로세스(vite, 서버, 헤드리스 크롬, 정적 서버)는 끝날 때 프로세스 트리째 끄고(`taskkill //PID <pid> //T //F`) `netstat -ano | grep LISTENING`으로 포트가 비었는지 본다. 브라우저는 claude-in-chrome 새 탭만 쓰고 끝나면 닫는다.

## 시험 판 (목업 예시 판)

여러 작업이 같은 판을 쓴다. 작업 2에서 `packages/client/test/fixtures/next-board.ts`로 만든다.

- 데이터 `loadGameData('stage3')`, `createGame(data, 1)`, 칸 0~15에 차례로 `jipsin, bitjaru, horong, jangdok, jipsin, buchae, jeolgu, dadeumi, mumyeong, hwaro, ki, gamasot, moru, top, gimseobang, hanji` (`placeUnitForTest`). 목표는 `yeonjabangga`(연자방아).
- 이 판에서 로직으로 센 값(계획을 쓰며 확인함): 지금 가능 11개 `meongseok, jeolgu, cheongsachorong, sseurebatgi, mumyeong, hanji, dunggumi, didilbangga, pulmu, baneul, but`, 짚신이 들어가는 지금 가능 4개 `meongseok, dunggumi, didilbangga, baneul`. 목표 트리에서 아직 없는 노드: 연자방아(2개 부족이라 목록에 안 나옴), 디딜방아·멍석(깊이 1), 절구(깊이 2, 위쪽 절구는 판에 있음).
- 설계 '확인 방법'의 "1등급 12개(짚신 2) + 절구·무명·화로"와 판이 조금 다르다. 범위 숫자 `이 유닛 4 / 전체 11`이 이 판에서 나오므로 시험과 브라우저 확인 모두 이 판을 쓴다.

## Review Focus

시험이 직접 겨누지 않는데 사람이 쓰다 부딪히기 쉬운 것. 줄마다 시험을 그 코드를 맡은 작업에 넣었다.

1. **옮기기 상태에서 고른 유닛이 사라짐**(팔기·조합·지게·잡귀에 칸이 바뀜): 옮기기 상태가 바로 끝나고 다음 누르기가 엉뚱한 `move`를 보내지 않아야 한다. → 작업 10 `moveStep`의 `selected === null` 시험, mount 시험 '판매 뒤 옮기기 상태가 풀린다'.
2. **관전(driver.readOnly)·판이 끝난 뒤**: 남의 고개나 끝난 판에 ▲·꺾쇠·키 꼬리표가 뜨면 누를 수 없는 것을 권하는 셈이다. → 작업 9 mount 시험 '관전·끝난 판에는 판 표시가 없다'.
3. **재료가 모두 보관함에 있는 조합**: 결과가 놓일 판 칸이 없어서 W가 고를 유닛이 없고 ▲도 붙을 칸이 없다. 이런 조합은 건너뛰어야 한다. → 작업 3 `nextPick`·`boardMarks` 시험 '보관함만으로 되는 조합은 건너뛴다'.
4. **고른 유닛이 조합돼 새 유닛으로 바뀜**: 선택은 새 유닛으로 따라가고(지금 동작) 범위는 '이 유닛'에 머물며 W로 고른 조합 테두리는 지워져야 한다. → 작업 7 mount 시험 'Z 뒤 선택이 결과를 따라가고 W 표시가 지워진다'.
5. **마우스를 올린 채 판이 바뀜**: 목록은 매 프레임 다시 그려지므로 강조를 DOM 조작으로 붙이면 사라지거나, 없어진 줄의 강조가 남는다. 마우스 올린 줄은 mount 상태로 들고 HTML에 그려야 하고, 그 조합이 목록에서 빠지면 강조도 꺼져야 한다. → 작업 9 mount 시험 '다시 그려도 강조가 남고, 줄이 없어지면 꺼진다'.

---

## 설계 번호와 작업 대응

| 설계 | 내용 | 작업 |
|---|---|---|
| 로직에 더하는 것 | `combinePlan` 꺼내기, 명령과 화면이 같이 씀 | 1 |
| 공통 · 묶음·순서 | 목표로 / 지금 가능(비용·잠김은 끝에 흐리게) / 1개 부족, 등급 높은 순, 목표는 깊이 얕은 순 | 2 |
| 공통 · 키 | 고른 유닛의 지금 가능(비용까지) 줄에 목록 순서대로 Z·X·C | 2, 7 |
| 공통 · 범위 | '이 유닛 / 전체', 숫자는 그 범위 지금 가능 수, 2개 이상 부족은 한 줄로 접음 | 2(모델), 6(솔로), 8(온라인) |
| 공통 · 재료 나눔 ⇄ | 위 줄이 먼저 가져가면 모자라는 칩만, title·aria-label | 3(모델), 5(표시) |
| 공통 · ▲ 만들 수 있음 | 1개 부족 칩의 모자란 재료가 지금 되는 조합의 결과 | 3, 5 |
| 공통 · 기호 그리는 법 | SVG·CSS 도형·Phaser 도형, aria-label 글 | 5, 9 |
| 공통 · 빈 목록 | 문구 둘, 목표 없음·1개 부족 0개면 제목 없음 | 5 |
| ① 유닛 머리 | 54px 고정, 능력 한 줄 + ▸ 펼침, 고르지 않으면 세 줄 | 6 |
| ② 범위 단추 | 24px, 사이 8px, 'Q' 글자, 고르면 '이 유닛'·풀면 '전체' | 6 |
| ③ 묶음 제목 | 10px, 목표만 `--accent`, 범례 | 5 |
| ④ 조합 줄 | 두 줄 모양, 결과 그림에 등급 모양, 남은 높이 전부·따로 스크롤, 줄 사이 4px | 5, 6 |
| ⑤ 나눔 표시 | ⇄ 칩과 범례 | 3, 5 |
| ⑥ 1개 부족 묶음 | ✗/▲ 칩, 누르면 도감, '+N개 더' 24px | 2, 3, 5, 6 |
| ⑦ 행동 줄 | 바닥 고정 24px, '상세 · 보관 · 판매 +5냥', 지게 한 줄 | 6 |
| 없어지는 것 a·b·d | 솔로 도우미 목록·머리 단추, compact 62%, 빈 패널 문구, 92px 칸과 '+2개 더' | 6 |
| 없어지는 것 c | 'W 다음 유닛', 솔로 'Q 도우미', '유닛을 눌러 선택하고 끌어서 옮기세요.' | 7 |
| 없어지는 것 e | 온라인 도우미 줄마다의 '조합' 단추 | 8 |
| 없어지는 것 f | 판 가운데 지게 창 | B2 (B1은 줄 모양만, 작업 4) |
| 설정 '조합 도우미' | 솔로는 "고르지 않았을 때 전체 목록"(기본 켬), 설정 창 Q는 솔로에서 없앰 | 6 |
| ⑧ 등급 모양 | ●■◆, 반지름 2.5, 검은 테두리, DOM 결과 그림에도 | 5(DOM), 9(판) |
| ⑨ ▲ | 크림 삼각형, 고르지 않았을 때 전체 맨 위 세 조합의 결과 칸, 1순위만 1초 숨쉬기, 효과 줄이기에서 멈춤, B3 순위 맨 아래 | 3, 9 |
| ⑩ 짝 칸 Z/X/C | 크림 꺾쇠 + 12×12 꼬리표, 앞 글자 하나, 보관함 묶음 표시, `combinePlan`과 같은 칸 | 3, 9 |
| ⑪ 줄에 마우스 | 그 조합 꺾쇠만 밝게·나머지 0.3, ⇄ 가져가는 위 줄 점선 | 5(DOM 클래스), 9(연결·판) |
| ⑫ Z/X/C·W·Shift+W·도움말 | 키 규칙, W 다음 조합 유닛, Shift+W 칸 순서, W 고른 줄 테두리, 안내 줄 네 줄 | 7 |
| ⑫ Q | 솔로 범위 바꾸기 / 온라인 도우미 열고 닫기 + Shift+Q | 6(솔로), 8(온라인) |
| ⑫ M | 옮기기 | 10 |
| ⑬ 지게 줄 | 두 줄, 높이 28·사이 4, 근거 꼬리표 '목표 재료'·'조합 → 멍석 외 n', 정렬 | 4 |
| ⑭ 끌 때 놓을 칸 | 크림 2px / 닫힌 칸 `--danger` 점선, 바뀔 유닛 0.5 + ⇄ | 10 |
| ⑮ 온라인 도우미·하단 카드 | 묶음 셋, 줄이 단추, 범위 단추 + Shift+Q, 하단 카드 키 있는 줄만 | 8 |
| ⑯ 누르고 옮기기 | 다시 누르기·M → 칸 누르기, 크림 점선, 안내 줄, 취소 넷, Esc 순서 | 10 |
| 7절 큰 화면 | 자리는 B2. B1은 배율 2·3에서 잘리지 않는지만 | 11 |
| 확인 방법 | 시험·typecheck·브라우저 세 장면·배율 셋·색약 흉내·온라인 두 탭 | 각 작업 + 11 |
| 넘긴 것 | 오라 고리·폭발 효과 | B3 (이 계획에 없음) |

## 파일 구조

| 파일 | 맡는 것 | 작업 |
|---|---|---|
| `packages/logic/src/combine.ts` | `combinePlan` 추가, 명령이 그것을 씀 | 1 |
| `packages/logic/src/index.ts` | `combinePlan`·`CombinePlan` 내보내기(이미 `export *`면 손대지 않음) | 1 |
| `packages/client/src/ui/models.ts` | `nextCombines`, 나눔·▲ 표시, `boardMarks`, `rowCells`, `nextPick`, `moveStep`. `helperModel`·`combineOptions`는 얇게 | 2, 3, 10 |
| `packages/client/src/ui/next-list.ts` (새) | 조합 줄 한 개(`recipeRowHtml`)와 묶음 목록(`nextListHtml`). 솔로 패널·온라인 도우미·상세 창·하단 카드가 씀 | 5 |
| `packages/client/src/ui/chips.ts` | 칩 ⇄·▲ 표시, title·aria-label·`data-taken` | 5 |
| `packages/client/src/ui/storage.ts` | `unitFaceHtml` 등급 모양, 보관함 짝 표시 | 5, 9 |
| `packages/client/src/layout.ts` | `gradeShape` | 5 |
| `packages/client/src/ui/panels.ts` | `soloPanelHtml`(옛 `unitPanelHtml` 자리), `helpLineHtml` 새 줄, `cardRecipes`·`renderBottom` 키 규칙 | 6, 7, 8 |
| `packages/client/src/ui/helper.ts` | 온라인 `helperPopHtml`만 남김(`renderHelper` 삭제) | 6, 8 |
| `packages/client/src/ui/econ.ts` | `jigeReasons`, 지게 두 줄 줄 | 4 |
| `packages/client/src/ui/settings.ts` | 솔로 설정 줄 이름 | 6 |
| `packages/client/src/ui/mount.ts` | 범위·W·키·Q/Shift+Q·M·Esc·마우스 올림·판 표시 넘기기 | 6~10 |
| `packages/client/src/LaneScene.ts` | 등급 모양, ▲, 꺾쇠·꼬리표, 놓을 칸, 옮길 칸 | 9, 10 |
| `packages/client/src/ui/style.css` | 새 클래스, 초점, 옛 `.unit-panel.compact`·`.helper` 솔로 규칙 정리 | 4~10 |

---

### Task 1: `combinePlan` — 조합 명령이 쓰는 칸을 꺼낸다

설계: '로직에 더하는 것'. 이후 ⑨·⑩·W가 이 칸을 쓴다.

**Files:**
- Modify: `packages/logic/src/combine.ts` (명령 안의 결과 칸·재료 고르기 반복문)
- Modify: `packages/logic/src/index.ts` (내보내기가 없을 때만)
- Test: `packages/logic/test/combine-plan.test.ts` (새)

**Interfaces:**
- Produces:
  ```ts
  /** board: slot indexes the combine takes (resultSlot among them when it is a material); stored: storage indexes. */
  export interface CombinePlan { resultSlot: number | null; board: number[]; stored: number[] }
  export function combinePlan(state: GameState, result: string, slot?: number): CombinePlan | null
  ```
  레시피가 없거나 재료가 모자라거나 `slot`이 비었거나 `slot` 유닛이 재료가 아니면 `null`. 비용·잠김 라운드는 보지 않는다(명령이 따로 본다). `resultSlot`은 `slot`이 있으면 그것, 없으면 판 재료 칸 중 `pickResultSlot`, 판 재료가 없으면 `null`(명령은 그때 `chooseSlot`).

- [ ] **Step 1: 시험 쓰기** — `combine-plan.test.ts`
  - `'names the board slots the command empties'`: stage1 데이터, `sotlid` 3·9, `ki` 1, `gamasot` 11. `combinePlan(s,'jangdok')` → `resultSlot 11`, `[...board].sort()` `[1, 9, 11]`, `stored []`. `step(s,[{type:'combine',result:'jangdok'}])` 뒤 1·9가 비고 3은 `sotlid`.
  - `'a given slot is the result slot'`: 같은 판, `combinePlan(s,'jangdok',3)` → `resultSlot 3`, board에 3·1·11이 있고 9는 없다.
  - `'storage materials come after the board'`: stage3, `sotlid` 4, `bujigaengi`를 칸 2에 놓고 `store` 명령으로 보관. `combinePlan(s,'gamasot')` → `{ resultSlot: 4, board: [4], stored: [0] }`.
  - `'null when a material is missing or the slot is not a material'`: `combinePlan(s,'hwaro')` null, `combinePlan(s,'jangdok',0)`(빈 칸) null.
  - `'agrees with the command on every recipe of the mockup board'`: 시험 판(위 '시험 판' 목록을 이 시험 안에 직접 적는다. 클라이언트 fixture는 로직 시험에서 쓰지 않는다)의 `availableRecipes` 각각에 대해 새 판을 만들고 plan을 구한 뒤 명령을 보낸다. 비워진 칸 집합 = `plan.board`에서 `resultSlot`을 뺀 것, `s.slots[plan.resultSlot].defId === result`, 보관함 줄어든 수 = `plan.stored.length`.
- [ ] **Step 2: 실패 확인** — `npx vitest run packages/logic/test/combine-plan.test.ts` → `combinePlan` 없음으로 실패.
- [ ] **Step 3: 구현** — 명령의 `resultSlot` 계산과 `used`/`stored` 반복문을 그대로 `combinePlan`으로 옮기고, 명령은 검사 뒤 `const plan = combinePlan(state, cmd.result, cmd.slot)!`의 `board`·`stored`·`resultSlot`을 쓴다. 반복 순서(같은 재료는 뒤 칸부터, 판 먼저)는 바꾸지 않는다.
- [ ] **Step 4: 통과 확인** — 위 시험 + `npx vitest run packages/logic` + `npm run typecheck`.
- [ ] **Step 5: 커밋** — `git add packages/logic/src/combine.ts packages/logic/test/combine-plan.test.ts` (+ index.ts를 고쳤으면) · `Extract combinePlan so the combine command and the board marks pick the same slots`

**끝 기준:** 로직 시험 전부 통과, 명령 동작 그대로(기존 `combine.test.ts` 손대지 않음).

---

### Task 2: `nextCombines` — 묶음·순서·키·범위

설계: 공통 '묶음', '순서', '키', '범위'. ⑥의 묶음 나누기.

**Files:**
- Modify: `packages/client/src/ui/models.ts` (`helperModel`, `combineOptions` 근처)
- Create: `packages/client/test/fixtures/next-board.ts`
- Test: `packages/client/test/next-combines.test.ts` (새)
- Modify(기대값만): `packages/client/test/models.test.ts` 등 순서가 표 순서 → 등급 순으로 바뀌어 깨지는 시험

**Interfaces:**
- Consumes: 로직 `missingMaterials`, `availableRecipes`, `combineLockRound`; `pinnedTarget`(models.ts).
- Produces:
  ```ts
  export type NextScope = 'unit' | 'all';
  export type NextGroup = 'target' | 'ready' | 'one' | 'far';
  /** uses: the selected unit is one of the materials. */
  export interface NextRow extends CombineOption { group: NextGroup; uses: boolean }
  export interface NextList {
    scope: NextScope; rows: NextRow[]; far: NextRow[];
    counts: { unit: number | null; all: number };
    target: { id: string; name: string } | null;
  }
  export interface NextOpts { target?: string | null; slot?: number | null; scope?: NextScope }
  export function nextCombines(state: GameState, opts?: NextOpts): NextList
  export function combineOptions(state: GameState, slot: number, target?: string | null): CombineOption[]   // = unit 범위 rows + far
  export function helperModel(state: GameState, target?: string | null): HelperItem[]                     // = all 범위 rows 중 재료가 다 있는 것
  ```
  fixture: `export const MOCK_BOARD: readonly string[]`, `export function mockBoardState(): GameState`, `export const MOCK_TARGET = 'yeonjabangga'`.

규칙(설계 그대로, 구현자가 고를 수 없는 것만):
- 범위 기본값: `slot`이 있으면 `'unit'`, 없으면 `'all'`. `'unit'`은 고른 유닛 defId가 재료인 레시피만.
- **target** 묶음: `pinnedTarget(data, target, slots, storage, state)`에서 `location === 'missing'`이고 자식이 있는 노드의 레시피 중 `missing.length <= 1`. 같은 결과가 여러 깊이에 있으면 얕은 쪽. 순서: 깊이 → 등급 높은 순 → 레시피 표 순서. 이 묶음에 든 레시피는 다른 묶음에 다시 나오지 않는다.
- **ready** 묶음: 재료가 다 있음. 먼저 비용·잠김이 없는 줄(등급 높은 순 → 표 순서), 그 뒤 `short`가 있는 줄(같은 순서).
- **one** 묶음: 재료가 딱 하나 모자람. 먼저 모자란 재료가 `availableRecipes`의 결과인 줄, 그다음 등급 높은 순 → 표 순서.
- **far**(unit 범위만): 2개 이상 모자람, 표 순서. all 범위에서는 `far: []`.
- 키: `slot`이 있으면 범위와 상관없이 `uses && !missing.length && !short`인 줄에 `rows` 순서대로 Z·X·C. 나머지 `key: null`.
- `counts.all` = all 범위 target·ready 줄 중 `!missing.length && !short` 수. `counts.unit` = 같은 기준의 unit 범위 수, `slot`이 없으면 `null`.
- `target`: `opts.target`이 레시피가 있는 유닛이면 `{id, name}`, 아니면 `null`.

- [ ] **Step 1: fixture와 시험 쓰기** — `next-combines.test.ts`
  - `'all scope on the mockup board with 연자방아: target, ready, then one'`: `nextCombines(s,{target:MOCK_TARGET})`. target 묶음 결과 `['didilbangga','meongseok','jeolgu']`, ready 묶음 `['pulmu','baneul','but','cheongsachorong','sseurebatgi','mumyeong','hanji','dunggumi']`, one 묶음 앞 여섯 `['moru','gawi','ja','samtaegi','saekkijul','jipsingol']`, `counts` `{unit:null, all:11}`, `target` `{id:'yeonjabangga', name:'연자방아'}`, 모든 key null.
  - `'unit scope for 짚신 keys the ready rows in list order'`: `nextCombines(s,{target:MOCK_TARGET, slot:0})` → rows `[result,key,group]` = `didilbangga Z target, meongseok X target, baneul C ready, dunggumi null ready, saekkijul null one, jipsingol null one, hwaetbul null one`, `counts {unit:4, all:11}`, `far []`.
  - `'all scope with the unit selected keeps the unit's keys'`: `{target:MOCK_TARGET, slot:0, scope:'all'}` → `didilbangga` Z, `meongseok` X, `baneul` C, `pulmu`(짚신 안 씀) null.
  - `'without a target the ready group leads with the highest grade'`: `nextCombines(s)` 첫 넷 `['didilbangga','pulmu','baneul','but']`, target 묶음 없음, `target null`.
  - `'cost-short rows close the ready group and get no key'`: stage3, `meok` 0, `jige` 1, `sotlid` 2, `bujigaengi` 3, `s.buckwheat = 0`. all 범위 ready 묶음 순서 `['gamasot','top']`(top이 5등급이어도 뒤), `top.short` `'메밀묵 1개 모자람'`. `{slot:0}`(먹)에서 `top.key` null.
  - `'unit scope folds two-or-more missing into far'`: 짚신 하나만 칸 0. `{slot:0}` → `far.map(r=>r.result)` `['didilbangga','baneul','saekkijul','jipsingol']`, `counts.unit 0`.
  - `'a tame recipe before its round is short, not keyed'`(Review Focus 쪽 보강): `dex-links.test.ts:264` 판을 따라 `baekbalbaneulgaksi` 재료를 놓고 라운드 20 전 → ready 묶음 끝, `short '20라운드부터'`, key null.
  - `'combineOptions and helperModel read the same list'`: `combineOptions(s,0,MOCK_TARGET)` = unit 범위 `[...rows, ...far]`(같은 결과·키 순서), `helperModel(s,MOCK_TARGET).map(i=>i.recipe)` = all 범위 target·ready 결과.
- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/next-combines.test.ts`.
- [ ] **Step 3: 구현** — 위 규칙대로 `nextCombines`. 줄 하나는 지금 `optionsFor`가 만드는 `CombineOption`에 `group`·`uses`를 붙인 것. `combineOptions`·`helperModel`은 이 결과를 걸러 돌려준다(`helperModel`의 `stored`는 지금처럼 `storedMaterials`). `nextUnitId`·`storedCombineOptions`는 그대로 둔다.
- [ ] **Step 4: 통과 확인** — 새 시험 + `npm test`. 깨지는 기존 시험은 기대 순서만 새 규칙으로 고친다(무엇을 왜 고쳤는지 커밋 메시지 본문이 아니라 시험 이름으로 드러나게).
- [ ] **Step 5: 커밋** — `Order next combines into target, ready and one-short groups with keys from one list`

**끝 기준:** 위 시험 통과, `npm test`·typecheck 통과. 화면 HTML은 아직 옛 모양이어도 된다(순서만 바뀜).

---

### Task 3: 나눔 ⇄·만들 수 있음 ▲·판 표시·W 순서 (순수 함수)

설계: 공통 '재료 나눔', '▲ 지금 만들 수 있음', ⑨, ⑩, ⑪(어느 칸인지), ⑫ W.

**Files:**
- Modify: `packages/client/src/ui/models.ts`
- Test: `packages/client/test/next-marks.test.ts` (새)

**Interfaces:**
- Consumes: Task 1 `combinePlan`, Task 2 `nextCombines`/`NextList`.
- Produces:
  ```ts
  // Material에 더함: mark 'share' = an upper row takes this copy first; 'make' = a ready recipe makes the missing material
  export interface Material { id: string; name: string; grade: number; have: boolean; mark?: 'share' | 'make'; takenBy?: string[] }
  export type ComboKey = 'Z' | 'X' | 'C';
  export interface BoardMarks {
    triangles: number[];                       // slots, first = the one that breathes
    pairs: { slot: number; key: ComboKey }[];
    stored: { defId: string; key: ComboKey }[];
    focus: number[] | null;                    // hovered row's cells (Task 9 fills it)
  }
  export const NO_MARKS: BoardMarks;
  export function boardMarks(state: GameState, list: NextList, slot: number | null): BoardMarks
  export function rowCells(state: GameState, result: string, slot: number | null): number[]
  export function nextPick(state: GameState, list: NextList, after: string | null): { result: string; slot: number } | null
  ```

규칙:
- ⇄는 `nextCombines`가 채운다. 보이는 범위의 `rows` 순서로, 판+보관함 수에서 `!missing.length && !short`인 줄의 재료를 차례로 덜어 간다. 그 줄의 칩 중 남은 수로 못 채우는 칩에 `mark:'share'`, `takenBy`에 그 재료를 앞서 덜어 간 위 줄들의 결과 id(위에서부터). 맨 위 줄·one 줄·short 줄 칩에는 ⇄가 붙지 않는다(one·short 줄은 덜어 가지도 않는다).
- ▲: one 줄(어느 묶음이든 `missing.length === 1`)의 모자란 칩 id가 `availableRecipes`의 결과면 그 칩에 `mark:'make'`(`have`는 false 그대로).
- `boardMarks`: `slot`이 null이면 `list`의 target·ready 줄 중 키 기준(`!missing && !short`)을 순서대로 보며 `combinePlan(state, result)?.resultSlot`이 null이 아닌 것의 칸을 중복 없이 최대 셋 → `triangles`. `slot`이 있으면 `triangles []`, `list.rows`의 키 있는 줄마다 `combinePlan(state, result, slot)`의 `board`에서 `slot`을 뺀 칸과 `stored`의 defId를, 이미 붙은 칸·defId는 건너뛰며 그 줄의 키로. `focus null`.
- `rowCells(state, result, slot)`: `combinePlan(state, result, slot ?? undefined)?.board`에서 `slot`을 뺀 것, 계획이 없으면 `[]`.
- `nextPick`: `list`(all 범위)의 키 기준 줄 중 `combinePlan(state, result)?.resultSlot !== null`인 것을 순서대로 놓고, `after` 다음 것(끝이면 처음, `after`가 없거나 못 찾으면 처음). 없으면 null.

- [ ] **Step 1: 시험 쓰기** — `next-marks.test.ts` (시험 판 사용)
  - `'share marks only the copies an upper row takes'`: all 범위+목표 → `jeolgu`의 `dadeumi` 칩 `{mark:'share', takenBy:['didilbangga']}`, `ki` 칩 mark 없음; `pulmu`의 `ki` `takenBy ['jeolgu']`; `didilbangga`·`meongseok` 칩에는 share 없음.
  - `'in the 짚신 scope 바늘 and 둥구미 lose 짚신 to the rows above'`: `{target, slot:0}` → `baneul`의 `jipsin` `takenBy ['didilbangga','meongseok']`, `dunggumi`의 두 칩 모두 share.
  - `'make marks a missing material a ready recipe yields'`: `saekkijul`의 `dunggumi` 칩 `mark 'make'`, `moru`의 `pulmu` 칩 `'make'`, `hwaetbul`의 `bujigaengi` 칩은 mark 없음·`have false`. one 줄의 다른 칩에는 share가 없다.
  - `'nothing selected: triangles on the result slots of the top three'`: `boardMarks(s, nextCombines(s,{target}), null)` → `triangles [6, 0, 7]`, pairs·stored 빈 배열.
  - `'짚신 selected: partner cells carry the first key that needs them'`: `{target, slot:0}` → pairs를 칸 순으로 `[{1,'X'},{2,'C'},{6,'Z'},{7,'Z'},{8,'C'}]`, triangles `[]`.
  - `'a stored material marks its stack'`: stage3, `jipsin` 칸 0, `bitjaru`를 칸 1에 놓고 `store` → `boardMarks(s, nextCombines(s,{slot:0}), 0).stored` `[{defId:'bitjaru', key:'Z'}]`, pairs `[]`.
  - `'W walks the ready rows and wraps'`: `nextPick(s, list, null)` `{result:'didilbangga', slot:6}` → after `'didilbangga'` `{meongseok,0}` → after `'meongseok'` `{jeolgu,7}` → after `'dunggumi'`(마지막 ready) → `didilbangga`.
  - `'storage-only recipes are skipped by W and ▲'`(Review Focus 3): stage3, 판에는 `hanji` 칸 0만, `sotlid`·`bujigaengi`를 보관(가마솥은 보관함만으로 됨). `nextPick(s, nextCombines(s), null)`은 `gamasot`을 고르지 않는다(판 재료가 있는 조합이 없으면 null). `boardMarks(...).triangles`에 가마솥 칸이 없다.
  - `'rowCells is the plan without the selected slot'`: `rowCells(s,'meongseok',null)` `[0,1]`(순서 무관 비교), `rowCells(s,'meongseok',0)` `[1]`.
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현** — 위 규칙. 덜어 가는 수는 `ownedCounts`와 같은 기준(판+보관함)으로 models.ts 안에서 센다.
- [ ] **Step 4: 통과 확인** — 새 시험 + `npm test` + typecheck.
- [ ] **Step 5: 커밋** — `Mark shared and makeable materials and work out board marks and the W order from the next list`

**끝 기준:** 순수 함수 시험 통과. 화면 변경 없음.

---

### Task 4: 지게(R) 후보 근거와 두 줄 모양

설계: ⑬. 자리는 지금 가운데 창(약 340px) 그대로, B2가 156·196 폭으로 옮긴다.

**Files:**
- Modify: `packages/client/src/ui/econ.ts` (`JigeList`, `swapRows`, `jigeRowsHtml`)
- Modify: `packages/client/src/ui/mount.ts` (`case 'jigeOpen'`에서 근거 계산)
- Modify: `packages/client/src/ui/style.css` (`.jige-rows` 근처)
- Test: `packages/client/test/jige-ui.test.ts` (더함)

**Interfaces:**
- Consumes: `availableRecipes`, `pinnedTarget`, `unitFaceHtml`.
- Produces:
  ```ts
  /** 'target': the candidate is a missing node of the target tree. 'combine': swapping makes recipes ready that are not now. */
  export interface JigeReason { tag: 'target' | 'combine'; results: string[] }   // results: highest grade first, then table order
  export function jigeReasons(state: GameState, source: JigeSource, target: string | null): Record<string, JigeReason>
  // JigeList에 더함: reasons: Record<string, JigeReason>
  ```
  가상 판: `source.zone`이 board면 `slots[index]`, storage면 `storage[index]`의 defId만 후보로 바꾼 얕은 복사로 `availableRecipes`를 다시 센다. 'target'이 'combine'보다 우선한다. 창을 열 때 한 번만 계산해 `jigeList.reasons`에 둔다(이름 칸 입력 때 다시 세지 않는다).
- 정렬(`swapRows`): `target` → `combine`(results[0]의 등급 높은 순) → 나머지. 같은 칸 안은 지금 순서(유닛 표 순서). 이름·물딜/마딜 거르기는 그 뒤에 그대로.
- 줄 HTML: `<button class="jige-row" data-action="jigeSwap" data-arg="{id}">` 안에 `<span class="jige-l1">{unitFaceHtml 14px}<b>{이름}</b> {물딜|마딜}</span><span class="jige-l2">…</span>`. 둘째 줄: target이면 `<i class="jige-tag target">목표 재료</i>`, combine이면 `<i class="jige-tag" title="{결과 이름 전부 · 로 이음}">조합 → {첫 이름}{ 외 n}</i>`, 없으면 능력 첫 줄(흐리게, 말줄임). 글자 10px.
- CSS: `.jige-row` min-height 28px, `.jige-rows` gap 4px, 얼굴 14px, `.jige-tag.target`은 금색 바탕(`--accent`)에 어두운 글자, `:focus-visible` 금색 2px.

- [ ] **Step 1: 시험 쓰기** (stage3, 시장 있는 판. `jige-ui.test.ts`의 기존 판 만드는 법을 따른다)
  - `'a candidate that makes a recipe ready says which'`: 칸 0 `buchae`, 칸 1 `jipsin`, 칸 2 `ki`. `jigeReasons(s, {zone:'board', index:0, unitId}, null)` → `bitjaru` `{tag:'combine', results:['meongseok','sseurebatgi']}`, `jipsin` `{combine, ['dunggumi']}`, `dadeumi` `{combine, ['jeolgu']}`, `bujigaengi` `{combine, ['hwaetbul']}`, `sotlid`·`horong`·`ki` 없음.
  - `'a missing node of the target tree comes first'`: 같은 판, 목표 `meongseok` → `bitjaru.tag 'target'`.
  - `'rows: target, then combine by grade, then the rest'`: `swapRows`에 reasons를 넘겨(시그니처 끝에 `reasons: Record<string, JigeReason> = {}` 추가) 목표 `meongseok` 때 이름 순서 `빗자루, 짚신, 다듬이방망이, 부지깽이, 솥뚜껑, 호롱, 키`(빗자루 목표 → 짚신 둥구미·다듬이방망이 절구·부지깽이 횃불, 모두 2등급이라 유닛 표 순서 → 나머지 표 순서).
  - `'two-line row: face, name, type, then the tag'`: `jigeRowsHtml` 결과에서 빗자루 줄 `.jige-l1` 글 `빗자루 물딜`, `.jige-l2 .jige-tag.target` 글 `목표 재료`; 목표 없이 열면 빗자루 `.jige-tag` 글 `조합 → 멍석 외 1`, title `멍석 · 쓰레받기`.
  - mount: R로 지게 창을 연 뒤 이름 칸에 글을 쳐도 근거 꼬리표가 남는다(`jigeList.reasons`를 다시 세지 않음).
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현.** mount `jigeOpen`은 `reasons: jigeReasons(driver.state, source, targetId)`를 넣는다.
- [ ] **Step 4: 통과 확인** — `npx vitest run packages/client/test/jige-ui.test.ts` + `npm test` + typecheck.
- [ ] **Step 5: 커밋** — `Sort jige candidates by target and new combines and show the reason on a second line`

**끝 기준:** 시험 통과. 가운데 창에서 줄 높이 28·사이 4(작업 11에서 156·196 폭 확인).

---

### Task 5: 조합 목록 그리기 — 줄, 묶음 제목, ⇄·▲ 칩, 등급 모양

설계: ③ ④ ⑤ ⑥(표시) ⑧(DOM) ⑪(DOM 강조 클래스), 공통 '기호를 그리는 법', '빈 목록'.

**Files:**
- Create: `packages/client/src/ui/next-list.ts`
- Modify: `packages/client/src/ui/panels.ts` (private `recipeHtml`을 `next-list.ts`의 `recipeRowHtml`로 옮기고 상세 창·하단 카드가 그것을 씀)
- Modify: `packages/client/src/ui/chips.ts`, `packages/client/src/ui/storage.ts`(`unitFaceHtml`), `packages/client/src/layout.ts`
- Modify: `packages/client/src/ui/style.css`
- Test: `packages/client/test/next-list-ui.test.ts` (새, `// @vitest-environment happy-dom`)

**Interfaces:**
- Consumes: Task 2·3 `NextList`, `NextRow`, `Material.mark/takenBy`.
- Produces:
  ```ts
  // layout.ts
  export const gradeShape = (grade: number): 'c' | 's' | 'd' => (grade <= 2 ? 'c' : grade <= 4 ? 's' : 'd');
  // storage.ts — shape: adds <i class="gshape {c|s|d}"> at the top-left in the grade colour
  export function unitFaceHtml(defId: string, name: string, grade: number, shape?: boolean): string
  // next-list.ts
  export interface RowOpts { unitId: number | null; chips?: boolean; link?: boolean; wPick?: boolean; hover?: 'hov' | 'peer' | null }
  export function recipeRowHtml(state: GameState, row: CombineOption, opts: RowOpts): string
  export interface ListOpts { unitId: number | null; wPick: string | null; hover: string | null; showAllOne: boolean; online?: boolean }
  export function nextListHtml(state: GameState, list: NextList, opts: ListOpts): string
  ```

정할 것(구현자가 못 정하는 값):
- 줄: 재료가 다 있고 short 없음 → `<button data-action="combine" data-arg="{result}@{unitId}">`(줄이 고른 유닛을 쓸 때만 `@id`, 아니면 `{result}`만). short → 지금처럼 disabled 단추 + 사유. 재료 부족 → `<span class="recipe-row combine-missing">`, `link`가 참이면 `data-action="dexOpen" data-arg="{result}"`. 모든 줄에 `data-recipe="{result}"`. 키는 지금처럼 `[Z] ` 글. 결과 그림 `unitFaceHtml(…, true)`.
- 클래스: W로 고른 줄 `w-pick`(`box-shadow: 0 0 0 1px var(--accent)`), 마우스 올린 줄 `hov`(테두리 `--accent`), 그 줄 칩의 `takenBy`에 든 줄 `peer`(`outline: 1px dashed var(--accent); outline-offset: -1px`). 값은 목업 CSS와 같다.
- 묶음 제목 `<div class="next-group{ target}">`: `목표 · {이름}`(목표만 `--accent`), `지금 가능`, `1개 부족`. 줄이 없는 묶음은 제목도 없다. 범례: 목록에 share가 하나라도 있으면 '지금 가능' 제목 오른쪽에(그 묶음이 비었으면 목표 제목에) `{⇄ SVG} 나눠 씀`(title `위 조합을 먼저 하면 이 재료가 빕니다`), make가 있으면 '1개 부족' 제목에 `{▲ SVG} 만들 수 있음`. 10px.
- 칩: share → `.mat-mark` 안에 ⇄ SVG(목업 `IC.share`), `title="{이름}: {takenBy 이름 · 로 이음}이 먼저 씀"`, `aria-label="{이름}, 위 조합과 나눔"`, `data-taken="{takenBy id 공백으로 이음}"`. make → 클래스 `lack make`, ▲ SVG(목업 `IC.make`), `aria-label="{이름}, 지금 만들 수 있음"`. 나머지 칩은 지금 그대로(✓/✗).
- 1개 부족: all 범위에서 `showAllOne`이 거짓이면 처음 4줄 + `<button class="next-more" data-action="nextMore">+{N}개 더</button>`(높이 24). unit 범위는 전부.
- far(unit 범위, 1개 이상): 맨 아래 `<p class="next-far">재료 2개 이상 모자람 {N}개 · 상세(Tab)</p>`.
- 빈 목록: all 범위 `counts.all === 0`이면 '지금 가능' 자리에 `지금 만들 수 있는 조합이 없습니다 · Space로 뽑아 재료를 모으세요`(1개 부족 묶음은 그대로). unit 범위에 rows·far가 모두 없으면 `이 유닛이 들어가는 조합이 지금은 없습니다 · Q로 전체 보기`, `online`이면 끝을 `Shift+Q로 전체 보기`로.
- 등급 모양 CSS: `.gshape` 5×5, left/top −2px, 검은 1px 테두리, `.c` 둥글게, `.d` 45도 돌림(목업 그대로). 줄 사이 4px. 새 단추 `:focus-visible { outline: 2px solid var(--accent) }`.

- [ ] **Step 1: 시험 쓰기** — `next-list-ui.test.ts` (시험 판, `nextCombines` 결과를 그대로 넘김)
  - 제목 순서 `['목표 · 연자방아','지금 가능','1개 부족']`, 첫 제목에 `target` 클래스, '지금 가능' 제목에 `나눠 씀`, '1개 부족' 제목에 `만들 수 있음`.
  - 짚신 범위(`unitId` 있음): `button[data-recipe="didilbangga"]`의 `data-arg` `didilbangga@{id}`·글이 `[Z]`로 시작; all 범위에서 `pulmu` 줄 `data-arg` `pulmu`.
  - `baneul` 줄 짚신 칩: `aria-label` `짚신, 위 조합과 나눔`, title `짚신: 디딜방아·멍석이 먼저 씀`, `data-taken` `didilbangga meongseok`, `.mat-mark svg` 있음. `saekkijul` 둥구미 칩 `aria-label` `둥구미, 지금 만들 수 있음`.
  - one 줄은 `span.recipe-row.combine-missing[data-action="dexOpen"][data-arg="saekkijul"]`.
  - all 범위 1개 부족: 줄 4개 + `+{전체-4}개 더`; `showAllOne` 참이면 전부, 단추 없음.
  - 짚신 하나만 있는 판의 unit 범위: `.next-far` 글 `재료 2개 이상 모자람 4개 · 상세(Tab)`.
  - 빈 판 all 범위 문구, 빈 unit 범위 문구(솔로 `Q로 전체 보기` / online `Shift+Q로 전체 보기`). 목표 없으면 목표 제목 없음.
  - `wPick:'didilbangga'` → 그 줄 `w-pick`; `hover:'baneul'` → baneul `hov`, didilbangga·meongseok `peer`.
  - 결과 그림: `didilbangga`(3등급) `.gshape.s`, `meongseok` `.gshape.c`. `unitFaceHtml(id,name,5,true)`에 `.gshape.d`. `unitFaceHtml`을 shape 없이 부르면 `gshape` 없음(칩·보관함은 그대로).
  - CSS: `style.css` 글에 `.next-list button:focus-visible` 등 새 선택자와 `outline: 2px solid var(--accent)`가 함께 있다(파일 글을 읽어 확인).
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현.** `panels.ts`의 상세 창·하단 카드는 `recipeRowHtml`로 바꾸되 지금 모양(상세: 칩 있음·링크 없음, 하단: 칩 없음 한 줄)을 그대로 낸다.
- [ ] **Step 4: 통과 확인** — 새 시험 + `npm test`(상세 창·하단 카드 기존 시험이 그대로 통과해야 한다) + typecheck.
- [ ] **Step 5: 커밋** — `Draw the next-combine list with group titles, shared and makeable chips and grade shapes`

**끝 기준:** 목록 HTML이 위 문구·속성 그대로. 아직 어느 화면에도 붙지 않아도 된다.

---

### Task 6: 솔로 왼쪽 패널 한 칸 — 머리·범위·목록·행동 줄, 솔로 Q, 설정 뜻

설계: ① ② ④(높이) ⑦, 없어지는 것 a·b·d, ⑫ 솔로 Q, 설정 '조합 도우미', 4절 솔로.

**Files:**
- Modify: `packages/client/src/ui/panels.ts` (`unitPanelHtml` → `soloPanelHtml`)
- Modify: `packages/client/src/ui/helper.ts` (`renderHelper` 삭제)
- Modify: `packages/client/src/ui/settings.ts`, `packages/client/src/ui/mount.ts`, `packages/client/src/ui/style.css`
- Test: `packages/client/test/solo-panel.test.ts` (새, happy-dom, `settings-ui.test.ts`의 `FakeScene`+`STAGE_HTML` 방식)
- Modify(새 함수로 옮김): `recipe-chips.test.ts`, `store-one.test.ts`, `type-badge.test.ts`, `unit-details.test.ts`, `helper-scroll.test.ts`, `settings-ui.test.ts`, `models.test.ts`('paused helper opens…'는 유닛을 고른 뒤 Q로 바꿈)

**Interfaces:**
- Consumes: Task 2 `nextCombines`, Task 5 `nextListHtml`, `unitFaceHtml(…, true)`.
- Produces:
  ```ts
  export interface SoloPanelOpts {
    selected: number | null; list: NextList; idleList: boolean;
    wPick: string | null; hover: string | null; showAllOne: boolean; skillOpen: boolean;
    jige?: number; sellArmed?: boolean;
  }
  export function soloPanelHtml(state: GameState, opts: SoloPanelOpts): string
  // settings.ts: SettingsOpts에 solo?: boolean — true면 helper 줄 이름이 '고르지 않았을 때 전체 목록'
  ```
- mount 상태(솔로): `scope: NextScope`, `idleList = true`(설정 '켬' 기본, `resetUi`에서도 유지), `skillOpen`, `showAllOne`, `lastSelectedId`. render에서 고른 유닛 id가 바뀌면 `scope = 고름 ? 'unit' : 'all'`, `skillOpen = false`, `showAllOne = false`.
- 새 act: `nextScope`(arg `unit|all`, 고르지 않았으면 'unit' 무시), `nextMore`, `skillOpen`, `dexOpen`(arg id: `openDex`와 같게 열고 `dexGo(data, dex, id, id, state)` 뒤 `back: []`).
- 솔로 Q: 고른 유닛이 있을 때만 범위를 뒤집고, `'all'`로 바뀔 때 `helperOpened`를 보낸다(결과 화면 '도우미 N회'가 "전체 목록을 열어 본 횟수"로 남게. 고르지 않았을 때 Q는 아무것도 안 함). 설정 창이 열린 동안의 Q 동작(`mount.ts` `modal === 'settings' && KeyQ`)은 솔로에서 없앤다(온라인은 그대로). 설정 '켬/끔'은 솔로에서 `idleList`를 바꾼다.

정할 것:
- 머리 `.nc-head` 높이 54px 고정(고름·안 고름 같음), 글자 10px. 고름: `unitFaceHtml(…, true)` 20px · `<b>이름</b>` · 물/마 배지 · `{n}등급` / `공격 {a} · {i}초마다` / `사거리 {r}` / `<button class="skill-line" data-action="skillOpen" aria-expanded="{bool}" title="{능력 전부}">{능력 첫 줄}{▸ SVG}</button>`(120×16, 위아래 다른 단추와 5px 이상 떨어뜨림). `skillOpen`이면 머리 아래에 능력 전부를 펼친다(이때만 아래가 밀린다). 안 고름: `<b>다음 할 일</b>` / `W로 맨 위 조합 고르기` / `그다음 Z로 조합`.
- 범위 줄(`고름 || idleList`일 때): `<button class="scope-btn" data-action="nextScope" data-arg="unit" aria-pressed>이 유닛 {counts.unit}</button><button … data-arg="all">전체 {counts.all}</button><span class="scope-q">Q</span>`. 높이 24, 폭 약 50, 사이 8. 안 고름이면 '이 유닛'은 `disabled`이고 숫자 없이 `이 유닛`, 자리는 그대로.
- 목록 `.next-list`: `nextListHtml`, 패널 남은 높이 전부(`flex: 1; min-height: 0; overflow-y: auto`), 따로 스크롤. 안 고름+`idleList` 거짓이면 머리만.
- 행동 줄 `.up-actions`(고름일 때만, 바닥 고정, 높이 24, 한 줄): `상세`(title `Tab`, `extendedCombat`일 때만), `보관`(title `A`, 1·2등급만), `판매 +{p}냥`(title `S`). 3등급 이상 첫 S 뒤에는 `한 번 더 누르면 판매 +{p}냥` 단추 하나가 줄 전체를 쓴다(A줄 동작 유지). 지게가 있으면 그 위 한 줄 `보유 지게 {n}개` + `R 지게 바꾸기`(설명 '지게: 같은 등급의 다른 유닛으로 바꿉니다'는 단추 title로 옮겨 한 줄을 지킨다).
- 없앰: `.unit-panel.compact`·`.up-skill.compact`·`.card-recipes .combine-options { max-height: 92px }`의 솔로 쓰임, `.unit-panel.empty` 문구, 솔로 `renderHelper`, 솔로 '조합 도우미 (Q)' 머리. 온라인 하단 카드가 쓰는 `#bottom .card-recipes` 규칙은 남긴다. 보관함 정보(`storageInfoHtml`)가 왼쪽 패널을 대신 쓰는 지금 동작은 그대로.

- [ ] **Step 1: 시험 쓰기** — `solo-panel.test.ts` (stage3, 시험 판. 목표는 `sessionStorage.setItem('t', 'yeonjabangga')` 뒤 `mountUi(driver, scene, {}, { targetKey: 't' })`로 시작. 뒤 작업의 mount 시험도 같은 방법)
  - 아무것도 안 고름: `#left .nc-head` 글 `다음 할 일W로 맨 위 조합 고르기그다음 Z로 조합`, 범위 단추 `이 유닛`(disabled)·`전체 11`(눌림), 목록 첫 제목 `목표 · 연자방아`. `.unit-panel.empty`·`.helper` 없음.
  - `scene.select(0)`: 범위 `이 유닛 4` 눌림, 첫 줄 `[Z]` 디딜방아, `.skill-line` 있음, 행동 줄 단추 글 `['상세','보관','판매 +{짚신 판매가}냥']`.
  - `key('KeyQ')`: `전체 11` 눌림, `driver.queue`에 `{type:'helperOpened'}` 한 번. 다시 Q → `이 유닛`, 더 안 보냄. Esc로 풀면 `전체`.
  - 아무것도 안 고르고 Q → 바뀌지 않고 `helperOpened` 없음.
  - `.skill-line` 누르기 → `aria-expanded="true"`, 능력 전부가 보임; 다른 유닛을 고르면 다시 접힘.
  - 설정: 솔로 helper 줄 이름 `고르지 않았을 때 전체 목록`, 기본 `켬`. `끔`을 누르면 안 고름 상태 `#left`에 머리만(범위 단추·목록 없음). 설정 창이 열린 채 Q를 눌러도 설정이 안 바뀐다.
  - one 줄(`saekkijul`) 누르기 → 도감이 열리고 그 유닛이 초점(`dex.focus`가 그리는 강조 줄이 `saekkijul`).
  - 3등급 유닛(장독, 칸 3) 고르고 S 한 번 → 행동 줄이 `한 번 더 누르면 판매 +{p}냥` 단추 하나.
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현.** mount 솔로 render는 `setHtml(el('left'), infoHtml || soloPanelHtml(s, {...}))`(끝난 판이면 ''). `list = nextCombines(s, { target: targetId, slot: selected, scope })`. `cardRecipes`는 Task 7에서 목표를 받는다(여기서는 그대로 둬도 된다).
- [ ] **Step 4: 통과 확인** — 새 시험 + 옮긴 기존 시험 + `npm test` + typecheck. `grep -rn "unitPanelHtml\|renderHelper\|compact" packages/client/src packages/client/test`로 남은 참조가 없는지(또는 온라인 전용인지) 확인한다.
- [ ] **Step 5: 커밋** — `Merge the solo helper and unit card into one left panel with a fixed head, scope buttons and a bottom action row`

**끝 기준:** 솔로 왼쪽 패널이 목업 1·2번 '바뀐 뒤' 구성. 배율 1에서 3줄이 보이는지는 작업 11에서 브라우저로 잰다.

---

### Task 7: 키 — Z/X/C가 목록을 따르고, W·Shift+W, 하단 안내 줄

설계: 공통 '키', ⑫(Z/X/C·W·Shift+W·W 고른 줄 테두리·하단 도움말), 없어지는 것 c.

**Files:**
- Modify: `packages/client/src/ui/panels.ts` (`cardRecipes`, `unitDetailsHtml`, `helpLineHtml`, `HelpContext`)
- Modify: `packages/client/src/ui/mount.ts` (keydown, `wPick`)
- Test: `packages/client/test/next-keys.test.ts` (새, happy-dom)
- Modify(문구 기대값): `copy-terms.test.ts:225-226`, `ux-text.test.ts`, 그 밖에 'W 다음 유닛'·'Q 도우미'(솔로)를 기대하는 시험

**Interfaces:**
- Consumes: Task 2 `combineOptions(state, slot, target)`, Task 3 `nextPick`, Task 6 패널.
- Produces:
  ```ts
  export function cardRecipes(state: GameState, selected: number | null, target?: string | null): { unitId: number | null; recipes: CombineOption[] }
  export function unitDetailsHtml(state: GameState, selected: number, target?: string | null): string   // 조합 칸 순서·키도 같은 목록
  export interface HelpContext { selected?: boolean; storable?: boolean; quests?: boolean; jige?: boolean; pause?: boolean; empty?: boolean; online?: boolean; moving?: boolean }
  ```
- mount: `wPick: { result: string; unitId: number } | null`. W: `nextPick(s, nextCombines(s,{target:targetId}), wPick?.result ?? null)`가 있으면 그 칸 유닛을 고르고 `wPick` 저장, 없으면 지금처럼 `nextUnitId`이고 `wPick = null`. Shift+W: `nextUnitId`, `wPick = null`. render에서 `scene.selectedId !== wPick?.unitId`면 `wPick = null`(다른 방법으로 고르거나, 조합돼 선택이 새 유닛으로 옮겨 가면 지워짐). 패널 `wPick` 인자는 `wPick?.result`.
- 안내 줄(설계 ⑫ 그대로, 조건 항목은 그 조건일 때만):
  - 솔로·안 고름: `W 다음 조합 고르기 · Space 소환 · E 강화 · D 도감 · Q 이 유닛/전체 · G 1·2등급 보관 · B 장터 · J 퀘스트 · P 멈춤` (B는 `hotkeys`, J는 `quests`, P는 솔로). 판에 유닛이 없으면 맨 앞에 `Space나 뚝딱!으로 유닛을 뽑으세요.`.
  - 솔로·고름: `Z/X/C 조합(판에 짝 표시) · S 판매 · A 보관 · R 지게 · Tab 상세 · M 옮기기 · W 다음 조합 · Esc 해제` (A는 `storable`, R은 `jige`).
  - 온라인·안 고름: `W 다음 조합 고르기 · Space 소환 · E 강화 · D 도감 · Q 도우미 · G 1·2등급 보관 · B 장터 · J 퀘스트`.
  - `moving`: `옮길 칸을 누르세요 · Esc 취소` (Task 10이 켠다. 여기서는 문구와 분기만).

- [ ] **Step 1: 시험 쓰기**
  - `helpLineHtml` 네 줄 문구(위 그대로)와 조건 항목 빠짐. `'유닛을 눌러 선택하고 끌어서 옮기세요.'`, `'W 다음 유닛'`이 어느 줄에도 없다.
  - mount(시험 판, 목표 연자방아): 아무것도 안 고르고 W → `scene.selectedId`가 칸 6(절구) 유닛, `#left .w-pick[data-recipe="didilbangga"]`. W → 칸 0, `w-pick` 멍석. W → 칸 7, `w-pick` 절구. Shift+W → 칸 순서 다음 유닛, `.w-pick` 없음.
  - 칸 0 고르고 Z → `driver.queue`에 `{type:'combine', result:'didilbangga', slot:0}`; X → meongseok; C → baneul. 목표를 풀면 Z가 didilbangga(3등급, 표 앞) 그대로, X가 baneul(목표 묶음이 사라져 등급 순).
  - 상세 창(Tab)의 조합 칸 첫 줄도 `[Z] 디딜방아`.
  - (Review Focus 4) W로 칸 6을 고른 뒤 Z를 보내고 `driver.update`로 조합 이벤트를 받으면 `scene.selectedId`가 새 디딜방아, 범위는 '이 유닛', `.w-pick` 없음.
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현.** keydown의 W 분기에서 `ev.shiftKey`로 가른다. `renderBottom`이 `cardRecipes(s, selected, targetId)`를 쓰게 인자를 넘긴다.
- [ ] **Step 4: 통과 확인** — 새 시험 + `npm test` + typecheck. `grep -rn "W 다음 유닛\|Q 도우미\|끌어서 옮기세요" packages/client`로 남은 곳 확인(온라인 'Q 도우미'만 남아야 한다).
- [ ] **Step 5: 커밋** — `Key Z/X/C, W and the help line off the shared next list; Shift+W keeps the slot walk`

**끝 기준:** Z 한 번으로 하던 조합은 여전히 Z 한 번(실패로 보는 것), W 세 번이 목록 순서.

---

### Task 8: 온라인 — 도우미 묶음 셋, 범위 단추와 Shift+Q, 하단 카드

설계: 4절 온라인, ⑮, ⑫ 온라인 Q, 없어지는 것 e. B2 ⑭ 이름 단추(▸)는 B2 몫이라 하지 않는다.

**Files:**
- Modify: `packages/client/src/ui/helper.ts` (`helperPopHtml`), `packages/client/src/ui/panels.ts` (`renderBottom` 온라인 카드), `packages/client/src/ui/mount.ts`, `packages/client/src/ui/style.css`
- Test: `packages/client/test/online-mount.test.ts` (더함·고침), `packages/client/test/online-next.test.ts` (새, 필요하면)

**Interfaces:**
- Consumes: Task 5 `nextListHtml(…, { online: true })`, Task 2 `counts`.
- Produces:
  ```ts
  export interface HelperPopOpts { unitId: number | null; scope: NextScope; wPick: string | null; hover: string | null; showAllOne: boolean }
  export function helperPopHtml(state: GameState, list: NextList, opts: HelperPopOpts): string
  ```
  머리: 지금 `조합 도우미 (Q) ▾ <em>{counts.all}</em>` 단추(`toggleHelper`) 그대로. 그 아래 범위 단추 둘(솔로와 같은 `scope-btn`, 높이 24, 각 `title="Shift+Q"`), 그 아래 `nextListHtml`. 줄마다 있던 '조합' 단추 없음(줄이 단추).
- mount 온라인: 도우미를 열 때 `scope = 고름 ? 'unit' : 'all'`. 열린 동안 Shift+Q가 범위를 뒤집는다(Q는 지금처럼 열고 닫기, `helperOpened`도 지금처럼 열 때만). 고른 유닛이 있으면 그 유닛 줄에 Z/X/C(전체 범위에서도 — Task 2 규칙이 이미 그렇다).
- 하단 카드(44px): `cardRecipes`의 키 있는 줄만, 칩 없이 한 줄씩(두 줄 보임 = Z·X). 키 있는 줄이 셋이면 지금처럼 `+1개 더`(상세 열기). 없으면 그 자리에 `<span class="card-none">지금 가능 없음 · Q 도우미</span>`. 재료가 모자란 줄('… 부족')은 카드에 넣지 않는다.

- [ ] **Step 1: 시험 쓰기**
  - 기존 `'the menu opens the 40-unit dex; Q shows the helper…'`는 그대로 통과해야 한다(Q 열고 닫기·`helperOpened` 수).
  - 온라인 fixture에서 유닛을 고른 뒤 Q → `#left .helper-pop .scope-btn[data-arg="unit"]` 눌림, `key('KeyQ', {shiftKey:true})` → `전체` 눌림, 범위 단추 title `Shift+Q`. 안 고르고 열면 `전체`. (`fixtures/net.ts`의 `key(code)`에 `init: KeyboardEventInit = {}` 둘째 인자를 더해 수식키를 넘긴다. W·Shift+W 시험도 이것을 쓴다)
  - 도우미 안 `[data-action="combine"]`이 줄 자체(`.recipe-row`)이고 `li button`(옛 '조합' 단추)이 없다. 묶음 제목이 그려진다.
  - 하단 카드: 지금 가능 둘 이상 → 첫 두 줄 글이 `[Z]`·`[X]`로 시작. 하나뿐 → `[Z]` 한 줄. 없음 → `지금 가능 없음 · Q 도우미`. 모자란 조합 글('부족')이 카드에 없다.
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현.** keydown에서 `KeyQ`를 `ev.shiftKey`로 가른다(솔로 Shift+Q는 아무 일 없음).
- [ ] **Step 4: 통과 확인** — `npx vitest run packages/client/test/online-*.test.ts` + `npm test` + typecheck.
- [ ] **Step 5: 커밋** — `Show the online helper as the three-group list with scope buttons and Shift+Q, and key only ready rows on the card`

**끝 기준:** 온라인 왼쪽 여섯 고개와 44px 카드 구성은 그대로, 안의 목록·키만 새 규칙.

---

### Task 9: 판 표시 — 등급 모양, ▲, 짝 칸 꺾쇠·키 꼬리표, 보관함 짝, 마우스 올림

설계: ⑧ ⑨ ⑩ ⑪, 공통 '기호를 그리는 법'(판), 크림 규칙.

**Files:**
- Modify: `packages/client/src/LaneScene.ts` (`drawSelection`, `makeUnitView`, `combineMarker`·`updateCombineMarkers`·`pulseCombineMarkers`·`COMBINE_MARKER_RADIUS` 삭제)
- Modify: `packages/client/src/ui/mount.ts` (판 표시 넘기기, 마우스 올림 상태)
- Modify: `packages/client/src/ui/storage.ts` (`storageHtml`에 짝 표시), `packages/client/src/ui/style.css`
- Test: `packages/client/test/LaneScene.test.ts` (고침·더함), `packages/client/test/board-marks-ui.test.ts` (새, happy-dom)

**Interfaces:**
- Consumes: Task 3 `BoardMarks`, `NO_MARKS`, `boardMarks`, `rowCells`; Task 5 `gradeShape`.
- Produces (LaneScene 공개 속성, 메서드 아님):
  ```ts
  boardMarks: BoardMarks = NO_MARKS;
  /** Set by B3 while a higher-priority loop moves (gate countdown, over-limit jangseung, danger edge): the ▲ stays still and bright. */
  pulseHeld = false;
  // module export for the test
  export function triangleAlpha(now: number, reduced: boolean, held: boolean): number   // 1 when reduced||held, else 0.55 + 0.45 * (0.5 + 0.5 * sin(2π·now/1000))
  // storage.ts
  export function storageHtml(state: GameState, jige?: number, sellArmed?: (defId: string) => boolean, inspected?: string | null, pairs?: ReadonlyMap<string, ComboKey>): string
  ```

정할 것:
- 등급 모양(왼쪽 위, 지금 자리 `view.x − 12·pitch·scaleY`): `gradeShape` 'c' → `fillCircle`+`strokeCircle`, 's' → `fillRect`+`strokeRect`, 'd' → `fillPoints`(마름모 4점, closed)+`strokePoints`. 반지름 2.5(×scaleY), 테두리 `lineStyle(1, 0x000000)`, 색은 `GRADE_COLOR` 그대로.
- ▲: 크림 `0xe8e0d0` `fillTriangle`+검은 1px `strokeTriangle`, 오른쪽 위(지금 동그라미 자리 `+11·pitch, −11·pitch`), 크기 4~5px(맡김). `triangles[0]`은 `triangleAlpha(now, reduceFx, pulseHeld)`, 나머지는 0.7 고정. 고른 유닛이 있으면 그리지 않는다(`boardMarks`가 이미 비움).
- 꺾쇠: 짝 칸마다 네 모서리에 `lineBetween` 두 개씩(크림, 굵기·길이 맡김). 키 꼬리표: 칸 오른쪽 아래 12×12, 크림 바탕에 `#17121f` 10px 굵은 글자. 꼬리표는 `this.add.text`로 만든 Text를 칸 수만큼 미리 만들지 말고 필요할 때 늘리는 풀로 두고, 안 쓰는 것은 `setVisible(false)`. 등급 모양·체력바와 겹치지 않게 놓는다.
- 마우스 올림(`focus`가 null 아님): `focus`에 든 칸의 꺾쇠는 알파 1, 나머지 꺾쇠·꼬리표는 0.3, 움직임 없이 바로. 고른 유닛이 없으면 `focus` 칸에 꼬리표 없는 꺾쇠만 그린다.
- mount: render마다 `scene.boardMarks = driver.readOnly || s.phase === 'ended' ? NO_MARKS : { ...boardMarks(s, allList, selected), focus }`. `allList`는 고른 유닛이 있으면 `nextCombines(s,{target, slot:selected})`, 없으면 all 범위. 보관함 짝은 `storageHtml`에 `Map(stored.map(p => [p.defId, p.key]))`로 넘기고 그 묶음에 크림 모서리 + `<i class="pair-key">{키}</i>`.
- 마우스 올림 상태: `hoverRow: string | null`. `#left`에 `pointerover` 위임(`closest('[data-recipe]')`) → 바뀌면 저장·render, `pointerleave` → null. 터치(`pointerType === 'touch'`)는 무시. `hoverRow`가 지금 목록에 없으면 null로 본다. `focus = hoverRow ? rowCells(s, hoverRow, selected) : null`, 패널·도우미에는 `hover: hoverRow`.

- [ ] **Step 1: 시험 쓰기**
  - `LaneScene.test.ts`: 기존 `'the unit grade dot sits at the top-left…'`을 모양별로 고친다 — `sotlid`(1등급) `fillCircle(68, 78, 2.5)`, 3등급 유닛 `fillRect` 호출, 5등급 유닛 `fillPoints` 호출(목 overlay에 `strokeCircle, fillRect, strokeRect, fillPoints, strokePoints, fillTriangle, strokeTriangle, lineStyle, lineBetween` 추가). `container` 목에 더는 `circle`(조합 동그라미)이 들어가지 않는다.
  - `'▲ goes to the triangle slots only, cream with a black edge'`: `scene.boardMarks = {...NO_MARKS, triangles:[0]}` 뒤 `drawSelection` → `fillTriangle` 한 번, 그 직전 `fillStyle(0xe8e0d0, …)`.
  - `'brackets and a key tag on pair cells'`: `pairs:[{slot:1,key:'Z'}]` → `lineBetween` 8번, 꼬리표 Text `setText('Z')`·`setVisible(true)`. `focus:[2]`이면 그 꺾쇠 `lineStyle(…, 0xe8e0d0, 0.3)`.
  - `triangleAlpha(0,true,false) === 1`, `triangleAlpha(t,false,true) === 1`, `triangleAlpha(250,false,false) === 1`(사인 꼭대기), `triangleAlpha(750,false,false)`는 0.55에 가깝다.
  - `board-marks-ui.test.ts`(FakeScene에 `boardMarks` 속성): 시험 판, 안 고름 → `scene.boardMarks.triangles` `[6,0,7]`; `scene.select(0)` → pairs 칸 `[1,2,6,7,8]`. 보관함 판 → `#storage .stack.pair .pair-key` 글 `Z`.
  - (Review Focus 2) 관전(`driver.readOnly`) 또는 끝난 판 → `scene.boardMarks`가 `NO_MARKS`와 같다.
  - (Review Focus 5) `#left`의 baneul 줄에 `pointerover` → `.hov` 생기고 `scene.boardMarks.focus`가 `rowCells` 값; `driver.update`로 다시 그려도 `.hov` 남음. `jeolgu` 줄에 올린 뒤 다듬이방망이(칸 7)와 키(칸 10)를 팔아 절구가 2개 부족이 되면(all 범위에는 far가 없어 줄이 빠짐) `.hov` 없고 `focus` null.
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현.** `availableRecipes` import가 LaneScene에서 더 안 쓰이면 지운다.
- [ ] **Step 4: 통과 확인** — `npx vitest run packages/client/test/LaneScene.test.ts packages/client/test/board-marks-ui.test.ts` + `npm test` + typecheck. `grep -n "combineMarker\|0xffd65c" packages/client/src`가 비어야 한다.
- [ ] **Step 5: 커밋** — `Draw grade shapes, the top-three triangles and cream pair brackets with key tags on the board`

**끝 기준:** 노란 조합 동그라미가 없어지고, 판의 조합 표시는 크림 ▲·꺾쇠만. 보드 표시가 지금보다 적은 칸을 덮는다(초반 판에서 ▲ 3칸 ≤ 지금 11칸).

---

### Task 10: 옮기기 — 끌 때 놓을 칸, 누르고 옮기기, M, Esc

설계: ⑭ ⑯, '판 안 기둥 창이 열렸을 때'는 B2(하지 않음), Esc 순서 중 B1 몫.

**Files:**
- Modify: `packages/client/src/ui/models.ts` (`moveStep`)
- Modify: `packages/client/src/LaneScene.ts` (drag 처리, `onSelect` 두 번째 인자, `moving`, 놓을 칸·옮길 칸 그리기)
- Modify: `packages/client/src/ui/mount.ts`, `packages/client/src/ui/panels.ts`(`renderBottom`이 `moving`이면 카드 대신 안내 줄)
- Test: `packages/client/test/move-step.test.ts` (새), `packages/client/test/LaneScene.test.ts` (더함), `packages/client/test/move-ui.test.ts` (새, happy-dom)

**Interfaces:**
- Produces:
  ```ts
  // models.ts
  export type MoveInput =
    | { kind: 'press'; slot: number }          // a drag starts on a unit (not while moving)
    | { kind: 'again'; slot: number }          // a short press on the unit that was already selected
    | { kind: 'tap'; slot: number | null }     // a cell, another unit, or outside the grid
    | { kind: 'toggle' }                       // M
    | { kind: 'cancel' };                      // Esc or right click
  export interface MoveStep { moving: boolean; select?: number | null; move?: { from: number; to: number } }
  export function moveStep(state: GameState, selected: number | null, moving: boolean, input: MoveInput): MoveStep
  // LaneScene
  onSelect(cb: (slot: number | null, how?: 'press' | 'again' | 'tap' | 'cancel') => void): void
  moving = false;   // set by mount; while true drags do not start and empty open cells get a cream dashed frame
  ```
- `moveStep` 규칙(`select`가 있으면 선택을 그 칸으로, null이면 풀기):
  - `selected === null` → 언제나 `moving: false`(`tap`이면 지금처럼 `select: slot`, `press`면 `select: slot`).
  - 옮기기 아님: `press` → `{moving:false, select:slot}`; `again` → `{moving:true}`; `tap` → `{moving:false, select:slot}`; `toggle` → `{moving:true}`; `cancel` → `{moving:false, select:null}`.
  - 옮기기 중: `tap` 열린 다른 칸(비었든 유닛이 있든) → `{moving:false, move:{from:selected, to:slot}}`; `tap` 고른 칸 자신·닫힌 칸·null → `{moving:false}`; `toggle`·`cancel` → `{moving:false}`(선택 유지).
- LaneScene: `pointerdown`(유닛) 때 `this.pressSelected = this.selectedId === unitId`. `dragstart`는 `moving`이면 무시하고, 아니면 지금처럼 하되 `emitSelect(from, 'press')`. 유닛 `pointerup`(거리 < 4)은 `moving`이면 `'tap'`, 아니면 `pressSelected ? 'again' : 'tap'`. 오른쪽 클릭은 `emitSelect(null, 'cancel')`, 빈 곳 누르기는 `'tap'`. mount는 `how`가 없으면 `'tap'`으로 본다(가짜 scene 호환).
- ⑭ 끄는 동안: `dropCell`(손가락 아래 칸). 열린 칸이면 크림 2px `strokeRect`, 닫힌 칸이면 `--danger 0xff3b2f` 점선, 원래 칸이면 그리지 않음. 그 칸에 다른 유닛이 있으면 그 유닛 알파 0.5(`placeUnits`의 알파 계산에 넣어 매 프레임 덮어쓰지 않게)와 원래 칸 쪽을 가리키는 작은 ⇄(Phaser 선 두 개+화살촉, 모양 맡김). 끝나면 지움.
- ⑯ 옮기기 중: 빈 열린 칸마다 크림 점선 테두리(유닛 있는 칸은 표시 없음). mount는 `scene.moving`을 넘기고 안내 줄 `HelpContext.moving`을 켠다. 온라인은 하단 카드 대신 같은 안내 줄을 보인다(옮기기 동안만. 설계가 온라인 자리를 따로 정하지 않아서 안내 줄 자리를 그대로 쓴다고 정함).
- mount: `moving` 상태. M(`KeyM`, 고른 유닛이 있을 때) → `toggle`. Esc: 창이 열려 있으면 닫기 → 아니면 옮기기 중이면 `cancel`(옮기기만 취소) → 아니면 선택 풀기. `move`가 나오면 `!driver.paused && !driver.readOnly`일 때만 `driver.queue({type:'move', …})`, 아니면 `moving`을 유지하고 아무것도 안 보낸다. render에서 고른 유닛이 없어지면 `moving = false`.

- [ ] **Step 1: 시험 쓰기**
  - `move-step.test.ts`: 위 규칙 줄마다 하나씩(옮기기 아님 5개, 옮기기 중 tap 빈 칸·유닛 칸·자기 칸·닫힌 칸·null, toggle, cancel, `selected null`). 닫힌 칸은 stage3 `s.open[i] = false`로 만든다.
  - `LaneScene.test.ts`: (a) 끌기 중 칸 1(유닛 b 있음) 위 → `scene['dropCell'] === 1`, `drawSelection`에서 `lineStyle(2, 0xe8e0d0, …)`+`strokeRect`, `placeUnits` 뒤 b 알파 0.5, `dragend` 뒤 1. (b) `scene.moving = true`면 `dragstart`가 `dragging`을 세우지 않는다. (c) 고른 유닛을 눌렀다 떼면 `onSelect`가 `(slot,'press')` 다음 `(slot,'again')`; 고르지 않은 유닛이면 `'press'` 다음 `'tap'`.
  - `move-ui.test.ts`(FakeScene, `select(slot, how)`): 칸 9(화로) 고름 → `select(9,'again')` → `#bottom` 글 `옮길 칸을 누르세요 · Esc 취소`, `scene.moving` 참 → `select(20,'tap')`(빈 열린 칸) → `driver.queue`에 `{type:'move', from:9, to:20}`, `moving` 거짓. M → 옮기기 → `select(3,'tap')`(장독) → move 9→3. M → Esc → `moving` 거짓·선택 유지 → Esc → 선택 풀림. P로 멈춘 채 옮기기 tap → move 안 보냄.
  - (Review Focus 1) 옮기기 중 S로 그 유닛을 팔고 `driver.update` → `scene.moving` 거짓, 다음 `select(20,'tap')`이 move를 보내지 않는다.
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** — 새 시험 + `npm test` + typecheck. 기존 `'drop moves the dragged unit after a pending swap'` 통과 유지.
- [ ] **Step 5: 커밋** — `Show the drop cell and swap partner while dragging and add press-to-move with M and Esc`

**끝 기준:** 끌기 없이 누르기 두 번으로 옮길 수 있고, 끌기 동작은 그대로.

---

### Task 11: 브라우저로 확인하고 기록하기

설계: '확인 방법', 7절, 실패로 보는 것 셋.

**Files:**
- Modify: `docs/superpowers/plans/2026-11-25-next-combine.md`(이 문서 '진행' 절과 frontmatter progress), `docs/superpowers/specs/2026-11-25-next-combine-design.md` '진행 기록', `docs/superpowers/plans/2026-11-25-ui-review-fixes.md` '진행'
- 코드 변경은 이 작업에서 찾은 잘림·겹침 수정만(찾으면 그 수정과 시험을 따로 커밋)

- [ ] **Step 1: 띄우기** — worktree에서 `npx vite --port 5174 --strictPort`(packages/client, 백그라운드). 온라인은 `PORT=2568 npm run dev:server`와 `VITE_SERVER_URL=http://localhost:2568`로 띄운 두 번째 vite(5175). 5173·2567은 쓰지 않는다. 띄운 PID를 적어 둔다.
- [ ] **Step 2: 솔로 세 장면** — claude-in-chrome 새 탭 `http://localhost:5174/solo`, 개발자 콘솔의 `window.__driver`로 판을 만든다(시험 판 + 목표 연자방아).
  - 초반: Z가 디딜방아, 짝 칸이 절구·다듬이방망이(칸 6·7) Z, 짚신 칩 ⇄(바늘·둥구미), 범위 `이 유닛 4 / 전체 11`, 안 고름 W 세 번이 칸 6 → 0 → 7.
  - 후반: 보관함 20종·22기 — '1개 부족' 4줄 + '+N개 더' 펼치기, 보관함 짝 표시, 배율 1에서 줄이 잘리지 않음.
  - 옮기기: 고른 유닛 다시 누르기 → 빈 칸, M → 유닛 칸(자리 바꿈), Esc 취소, 끌기 때 놓을 칸 테두리.
- [ ] **Step 3: 배율** — 창 800×370(배율 1), 1920×953(배율 2), 1920×1080(배율 3)에서 왼쪽 패널 글자·칩 잘림 없음, 고른 유닛 기준 조합 3줄과 묶음 제목 둘이 온전히 보임(배율 1, 실패로 보는 것 1), 하단 안내 줄 '고름' 줄이 624px 안. 지게 창을 열고 개발자 도구로 창 폭을 156·196으로 줄여 두 줄 모양이 잘리지 않음.
- [ ] **Step 4: 색약 흉내** — Rendering → Emulate vision deficiencies → Deuteranopia에서 2·5등급, 4·6등급 모양이 갈리고 ▲·꺾쇠가 6등급 노랑과 갈리는지.
- [ ] **Step 5: 온라인 2인 방(두 탭)** — Q 열고 닫기, 도우미 범위 단추·Shift+Q, 하단 카드 키가 솔로와 같은 규칙, 도우미 줄 누르기로 조합.
- [ ] **Step 6: 정리** — 띄운 프로세스를 트리째 끄고(`taskkill //PID <pid> //T //F`) `netstat -ano | grep LISTENING`으로 5174·5175·2568이 빈 것 확인, 탭 닫기.
- [ ] **Step 7: 기록과 커밋** — 이 문서 맨 아래 '진행'에 확인한 것·못 한 것(예: Firefox, 터치 기기)을 나눠 적고 frontmatter `progress: 100%`. 설계 문서 '진행 기록'과 ui-review-fixes '진행'에 B1 끝 한 줄. `git add`로 그 세 문서만 · `Record the B1 next-combine checks in the browser`

**끝 기준:** 실패로 보는 것 셋(배율 1 조합 수 감소, Z 한 번이 두 번 이상, 판 표시가 더 많은 칸) 중 어느 것도 없음을 확인해 적었다. 확인 못 한 항목은 이유와 함께 적었다.

---

## 진행

- 2026-11-25: 계획 작성. 코드 변경 없음.
