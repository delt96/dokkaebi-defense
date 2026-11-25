---
title: 창 배치와 큰 화면 (B2) 구현 계획
project: dokkaebi-defense
type: task
priority: high
status: in-progress
startDate: 2026-11-25
progress: 100%
---

# 창 배치와 큰 화면 (B2) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 싸우는 도중 여는 창(상세·지게·온라인 도우미·장터·퀘스트·강화)을 큰 화면에서는 판 밖 여백에, 여백이 모자라면 판 안 양옆 기둥에 띄우고, 판을 잠그지 않게 한다. 판 밖 DOM과 바깥 화면의 배율을 판 배율에 맞춘다.

**Architecture:** `layout.ts`에 순수 함수 `screenLayout`(판 배율·위치, 창 자리 '밖'/'안', 창 배율, 두 창 상자의 좌표·폭·높이, 바깥 화면 배율)을 두고 `solo.ts`·`online/battle.ts`의 `fit`이 새 `src/fit.ts`의 `applyLayout`으로 그 값을 DOM에 쓴다. 창 상태(왼쪽 하나, 오른쪽 하나, 마지막에 연 쪽), Esc 순서, 잠금 규칙, 기둥이 덮는 요소는 새 `ui/windows.ts`의 순수 함수로 두고, `mount.ts`는 판을 잠그는 창(`modal`: 메뉴·설정·포기·도감)과 판 옆 창(`sides`)을 따로 들어 `#win-left`·`#win-right`에 그린다. 창 상자는 `#stage` 밖 `position: fixed`이고, 판을 잠그는 것이 뜨면 `inert` + `.locked`로 판 밑에 내린다.

**Tech Stack:** TypeScript, Phaser 3.90, Vitest 3(happy-dom), Vite 6.

**Spec:** `docs/superpowers/specs/2026-11-25-window-layout-design.md` · 목업 `docs/design/mockups/2026-11-25-window-layout.html`(A~J 장면). 함께 볼 표: B1 `2026-11-25-next-combine-design.md` '교차 검토에서 맞춘 것', B3 `2026-11-25-status-signals-design.md` '교차 검토 반영'·'층과 Esc', B4 `2026-11-25-first-visit-design.md` '다른 설계와 맞춘 것'. 사용자가 2026-11-25에 '사용자에게 물을 것' 1~8을 모두 권장안 (가)로 확정했다.

## Global Constraints

- 작업 위치: worktree `C:/Users/USER/Desktop/이범수/도랜디/dokkaebi-ui-fixes`, 브랜치 `ui-review-fixes`. 원래 저장소와 사용자의 5173 개발 서버는 건드리지 않는다. **5174는 다른 프로젝트(translate)의 Vite가 쓴다(B1 기록). 열지도 끄지도 않는다.** push·main 머지 금지.
- 기준 화면 640×360. 판 배율은 지금 규칙 그대로(2 이상은 정수, 1과 2 사이는 1.5, 그 아래 1).
- 창 안 글자는 배율 1에서 10px 이상, 가격·개수 같은 핵심 숫자 12px, 누르는 단추 높이 24px 이상, 나란한 단추 사이 8px. 예외는 설계가 적은 것만: 지게 후보 줄 사이 4px(B1 ⑬).
- 판 안 기둥: 왼쪽 x 0~196, 오른쪽 x 458~640, y 24~332(온라인 24~316). **가운데 x 196~458은 비운다.**
- 초점: DOM 단추·창의 초점은 `:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px }`. 크림 `--ink`는 판 위 표시(▲·짝 꺾쇠·키 꼬리표·놓을 칸)에만.
- 분위기는 담백하게. 새 장식·그림·움직임(열고 닫는 애니메이션) 없음. 창 테두리는 지금 창과 같은 금색 `--accent`(장터만 `#82663f`), 바탕 `--panel #17121f`, 단추 바탕 `#2a2236`.
- 화면 글은 한국어, 이 계획과 설계에 적은 문구 그대로. 창 안 정보 문구(강화 효과 글, 장터 확률 등)는 지금 코드 문구를 쓴다(A3 몫). 코드 주석은 영어이고 전역 주석 규칙(역추론 못 하는 이유만)을 따른다.
- 하지 않는 것: 도감(D)·메뉴·설정·포기·솔로 결과의 자리(지금 그대로 판 위, 판 잠금), 솔로 조합 목록을 창으로 빼기(왼쪽 패널 그대로), 상단 HUD 줄과 하단 카드 높이, 판 전체 배율 1 글자, A줄로 넘긴 설정·도감 단추 크기, 알림 자리 안의 순서·모양(B3), 멈춤 덮개·실패 장면 그리기(B3), 세로 안내(B4).
- A줄 수정(`docs/superpowers/plans/2026-11-25-ui-review-fixes.md` '진행')과 B1(`docs/superpowers/plans/2026-11-25-next-combine.md` '진행')을 되돌리지 않는다. 특히 B1의 합친 왼쪽 패널, 솔로 Q = 범위 바꾸기, 온라인 Q = 도우미·Shift+Q 범위, 지게 후보 두 줄 모양(높이 28·사이 4), `#left` 초점 되살리기(`refocusIn`), 보유 지게가 1개 이상일 때만 그리는 솔로 지게 줄.
- 커밋: 바꾼 파일만 경로로 `git add`(`-A`·`.` 금지). 메시지는 영어 한 줄(동사로 시작) + 빈 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 각 작업 끝: 그 작업 시험 + `npm test` + `npm run typecheck`가 통과해야 커밋한다. 옛 자리·옛 동작(창이 `#modal`에 뜸, 창이 판을 잠금, 장터를 열면 목표 트리가 옮겨 감 등)을 기대하던 기존 시험은 이 계획의 규칙으로 고치고 그 커밋에 넣는다. `sim.test.ts`·stage3-econ 측정이 병렬 부하로 시간을 넘겨 종료 코드 1이 나는 것은 이번 변경과 무관(B1 기록)이니 그 파일만 단독으로 다시 돌려 확인한다.
- 띄운 프로세스(vite, 서버, 헤드리스 크롬, 정적 서버)는 끝날 때 프로세스 트리째 끄고(`taskkill //PID <pid> //T //F`, 감시 모드면 부모까지) `netstat -ano | grep LISTENING`으로 포트가 비었는지 본다. 브라우저는 claude-in-chrome 새 탭만 쓰고 끝나면 닫는다.

## Review Focus

시험이 직접 겨누지 않는데 사람이 쓰다 부딪히기 쉬운 것. 줄마다 시험을 그 코드를 맡은 작업에 넣었다.

1. **창을 연 채 창 크기가 바뀜**(1920×953 최대화 ↔ F11 전체 화면 1920×1080): 창이 여백 ↔ 기둥으로 옮겨 가고, 덮인 패널의 `inert`가 그에 맞게 걸리고 풀려야 한다. 닫혔다 다시 열려서는 안 된다. → 작업 4 mount 시험 '자리가 바뀌면 덮인 패널 inert도 따라간다'.
2. **초점이 덮인 패널 안에 남음**: 왼쪽 패널 범위 단추에 초점이 있는 채 Tab으로 상세를 기둥에 열면 초점이 가려진 `#left`에 남아 Space가 그 단추를 누른다. → 작업 7 mount 시험 '기둥이 덮으면 그 안의 초점을 푼다'.
3. **지게 이름 칸에 글자를 침**: 창이 판을 잠그지 않게 되면서 이름 칸에 친 'e'·'b'·Space가 단축키로 새면 강화·장터가 열리거나 소환된다. → 작업 7 mount 시험 '지게 이름 칸에 친 글자는 단축키가 아니다'.
4. **P로 멈춘 채 강화 숫자 키**: 창 단추는 inert로 막혀도 숫자 키 1~3이 살아 있으면 멈춘 판에서 산다(실패로 보는 것). → 작업 4 mount 시험 'P 멈춤 중 숫자 키·창 단추는 명령을 보내지 않는다'.
5. **창 닫기 단추로 닫은 뒤 초점**: 초점이 있던 창이 통째로 없어지면 초점이 `body`로 떨어져 다음 Tab이 문서 처음부터 돈다. 닫기 단추로 닫으면 그 창을 여는 패널 단추(장터 (B)·강화 (E)·퀘스트 상자 머리, 상세는 왼쪽 패널 '상세')로, 그 단추가 가려졌거나 없으면 그대로 둔다. → 작업 4 mount 시험 '닫기 단추로 닫으면 여는 단추로 초점이 간다'.

---

## 설계 번호와 작업 대응

| 설계 | 내용 | 작업 |
|---|---|---|
| 배치 계산 | 순수 함수 하나(창 크기·띠 높이 → 판·창 자리·창 배율·상자 좌표·바깥 배율), `fit` 두 곳이 같이 씀 | 1, 3 |
| 판 밖 창 배율 (나) | `#stage` 밖 `#win-left`·`#win-right`, 창 배율은 판 배율부터 1씩 낮추되 2 아래로 안 내림, 여백 ÷ 창 배율 ≥ 154, 폭 `min(196, 여백 ÷ 창 배율 − 4)`, 높이 HUD 아래~판 아래 | 1, 3 |
| 배율 정책 | 정수 유지(1.5 단계 남김), `computeZoom` 설명을 "2 이상은 정수, 1과 2 사이는 1.5"로 | 1 |
| 바깥 화면 배율 | 판 배율 × 0.75, 0.25 단위 내림, 최소 1 | 1 |
| ① 왼쪽 여백 창 | 상세·지게, 온라인은 도우미도. DOM 순서 `#win-left` → `#stage` → `#win-right`, `role="dialog"`·`aria-labelledby`, aria-modal 없음 | 3(상자), 4(틀), 7, 8 |
| ② 오른쪽 여백 창 | 장터·퀘스트·강화, 창 머리(제목·닫기 24px), 장터 156폭 한 줄씩·모두 펼침 | 3, 4, 5, 6 |
| 창 좌우 배정 · 한쪽 하나 | 왼쪽 하나 + 오른쪽 하나 동시, 같은 쪽은 바뀜 | 2, 4 |
| 상세가 선택을 따라감 | 다른 유닛 → 바뀜, 선택 풀림 → 닫힘 | 7 |
| ③ 창이 열린 동안 조작 | 판을 잠그지 않음, 열 때 초점 안 옮김, 창 단추 초점에서 Space·Tab은 기본 동작, 상세가 열려도 단추 초점이면 Tab이 초점 이동, Tab·R·B·J·E 여닫기, 강화 1~3, 솔로 Q 범위/온라인 Q 도우미, 솔로에서 시간 안 멈춤 | 4(틀·E·숫자), 5(J), 6(B), 7(Tab·R), 8(Q) |
| ③ 초점 표시 | `--accent` 2px, 1px 띄움, 창 안 B1 요소도 같음 | 4 |
| ③ 지게 닫힘 안내 | "유닛이 바뀌어 지게 목록을 닫았습니다" | 7 |
| ④ 목표 트리 안 움직임 | `#stage.market-open #target-overlay { left: 356px }` 없앰 | 6 |
| ⑤ 왼쪽 기둥 | x 0~196, `#left`·`#storage` inert, 그 안 초점 풀기, 보관함 끌어 넣기 막기(G·보관 키는 됨), 판 칸 꺾쇠·Z/X/C만 보임 | 2(덮는 목록), 4(inert 틀), 7(초점·끌기) |
| ⑥ 오른쪽 기둥 | x 458~640, `#right`·`#target-overlay` inert | 2, 4 |
| ⑦ 오른쪽 기둥 머리 줄 | 머리 밑 '뚝딱 (Space)' 단추(왼쪽, 24px) + '불 · 엽전 · 묵' 글(오른쪽, 숫자 12px, 접힘), 판 안 기둥에서만 | 2(HTML), 4(강화), 5(퀘스트), 6(장터) |
| ⑧ 격파 칩 줄 | 판 안 기둥 배치면 창이 닫혀 있어도 `#econ-bottom` x 200~454 | 9 |
| ⑨ 기둥 창 글자·단추 | 10px·12px·24px·8px, 판 안 장터는 확률 하나·최근 결과 '최근 결과 ▸ 5개' 접기, 상세 능력치 2×2, 창 몸통 스크롤 | 4(강화), 5, 6(장터), 7(상세·지게) |
| ⑩ 온라인 도우미 큰 화면 | 왼쪽 여백 창, 판 안은 `helper-pop` 그대로, 열 때 범위·Shift+Q(B1 그대로) | 8 |
| ⑪ 퀘스트 오른쪽 여백 | 격파 '소환'을 창에서 바로, 판 안 잠금 | 5 |
| ⑫ 온라인 어둡게 덮는 막 | 판 옆 창에는 쓰지 않음, 잠그는 창에는 그대로 | 4 |
| ⑬ 오른쪽 퀘스트 상자 | '퀘스트 (J) · N개' + 격파 하나(없으면 '재소환 대기 …') + '+N개 더 · J에서', 온라인 접힌 상자도 같은 모양, 10px | 5 |
| ⑭ 온라인 하단 카드 이름 단추 | 이름·공격 묶음을 단추로, 끝에 '▸', 누르면 상세(왼쪽 창). 솔로 카드는 안 바꿈 | 8 |
| ⑮ 바깥 화면 배율 | `#screen > * { zoom: var(--outer-zoom, 1) }`, 연결 띠도 | 3 |
| ⑯ 알림 자리 좁히기 | 기둥 창이 하나라도 열리면 x 200~454: 라운드 배너·탄생 띠·토스트·카운트다운·`#econ-top`·`#tame-anchor` 기본 자리 | 9 |
| 장터가 칸을 안 가림 | 장터는 x 458 오른쪽이나 판 밖에만 → B3 ㉒ 규칙 필요 없음 | 6(자리로 해결) |
| ⑰ 층 순서와 잠금 | 1 판 · 2 판 안 기둥 창 · 3 판 밖 창 · 4 멈춤 덮개 · 5 판을 잠그는 창 · 6 실패·클리어 장면 · 7 바깥 화면 · 8 세로 안내. 4~6·8층이면 2·3층 `inert` + 판 밑으로(밖은 불투명도 0.4), 창은 닫지 않음. P 멈춘 채 메뉴는 메뉴가 위, 닫으면 P 멈춤 남음. 판이 끝나면 열린 잠그는 창을 닫음. Esc 순서 | 2(규칙), 3(z-index), 4(연결) |
| 창별 정리 | 도감·메뉴·설정·포기·솔로 결과는 지금 자리·잠금 | 4(잠그는 창으로 남김) |
| ⑱ 지게 새 자리 | 폭 156·196, 머리 '지게 (R) · 보유 N', 밑 줄 '갓 (5등급) · 진영 1행 1열 → 같은 등급', 거르기 196 한 줄·156 두 줄, 후보 줄 B1 ⑬ 그대로, 196 기둥 7줄 | 7 |
| ⑲ 강화 새 자리 | 세 줄 묶음 '1 물딜 강화 3 / 10' · 효과 글 · 가격 단추(24px), 안내 두 줄, 기둥에선 ⑦ 머리 줄 | 4 |
| 다른 설계와 맞춘 것 | B3 거절 알림·엽전 효과가 기댈 ⑦ 머리 줄, B3 ⑰ 알림 폭, B3·B4 층 번호, B4 `--outer-zoom` | 2·4·9(자리만 만듦, B3·B4가 얹음) |
| 확인 방법(브라우저) | 7개 창 크기, 창 각각·좌우 함께, 볼 것 목록, 온라인 두 탭, 바깥 화면 튐 | 10 |
| 만드는 사람에게 맡기는 것 | 간격 세부값, '최근 결과' 접기 문구. 움직임은 넣지 않음 | 6, 10 |

## 파일 구조

| 파일 | 맡는 일 | 작업 |
|---|---|---|
| `packages/client/src/layout.ts` | `screenLayout`, `outerZoom` 추가(순수) | 1 |
| `packages/client/src/ui/windows.ts` (새) | 판 옆 창 상태·Esc 순서·잠금 규칙·기둥이 덮는 요소(순수), 창 머리·오른쪽 머리 줄 HTML | 2 |
| `packages/client/src/fit.ts` (새) | `screenLayout` 결과를 DOM에 쓰기(판 transform, 창 상자, `data-wins`, `--outer-zoom`) | 3 |
| `packages/client/index.html`, `test/fixtures/net.ts` | `#win-left`·`#win-right` 상자 | 3 |
| `packages/client/src/solo.ts`, `src/online/battle.ts`, `src/main.ts` | `fit`이 `applyLayout`을 씀, 바깥 배율 | 3 |
| `packages/client/src/ui/mount.ts` | `modal`(잠그는 창)과 `sides`(판 옆 창) 나눔, 그리기·키·Esc·잠금 | 4~9 |
| `packages/client/src/ui/panels.ts` | `upgradesHtml`·`unitDetailsHtml`을 창 모양으로, `renderBottom` 이름 단추 | 4, 7, 8 |
| `packages/client/src/ui/econ.ts` | `questListHtml`·`questBoxHtml`·`questBoxModel`·`huntRows`·`econPanelHtml`·`jigeListHtml` | 5, 6, 7 |
| `packages/client/src/ui/gamble.ts` | `gambleHistoryHtml` 접기 | 6 |
| `packages/client/src/ui/helper.ts` | 여백 창 틀로도 그리기 | 8 |
| `packages/client/src/LaneScene.ts`, `src/fx/FxLayer.ts` | 보관함이 덮였을 때 끌어 넣기 막기, 알림 폭 | 7, 9 |
| `packages/client/src/ui/style.css` | 창 상자·창 틀·잠금·초점, 창별 모양, 알림 폭, 바깥 배율 | 3~9 |

---

### Task 1: `screenLayout` — 판·창 자리·창 배율·바깥 배율 (순수)

설계: '배치 계산', '판 밖 창의 배율 기준', '배율 정책', '바깥 화면 배율'.

**Files:**
- Modify: `packages/client/src/layout.ts`
- Test: `packages/client/test/screen-layout.test.ts` (새)

**Interfaces:**
- Produces:
  ```ts
  export interface WinBox { x: number; y: number; w: number; h: number } // x, y: 화면 px(창 상자 왼쪽 위). w, h: 창 px(창 배율을 곱하기 전)
  export type WinPlace = 'outside' | 'inside';
  export interface ScreenLayout { zoom: number; left: number; top: number; wins: WinPlace; winZoom: number; winLeft: WinBox; winRight: WinBox; outerZoom: number }
  export function screenLayout(w: number, h: number, opts?: { band?: number; online?: boolean }): ScreenLayout
  export function outerZoom(boardZoom: number): number
  export const WIN_MIN = 150, WIN_GAP = 4, WIN_MAX = 196;
  export const PILLAR_LEFT = { x: 0, w: 196 }, PILLAR_RIGHT = { x: 458, w: 182 };
  ```

- [ ] **Step 1: 실패하는 시험 쓰기** — `screen-layout.test.ts`:

```ts
test.each([
  // w, h, 판 배율, 자리, 창 배율, 폭
  [1920, 953, 2, 'outside', 2, 156],
  [2560, 1305, 3, 'outside', 2, 156],
  [3440, 1305, 3, 'outside', 3, 196],
  [1920, 1080, 3, 'inside', 3, 196],
  [1536, 730, 2, 'inside', 2, 196],
  [1366, 650, 1.5, 'inside', 1.5, 196],
  [1280, 720, 2, 'inside', 2, 196],
  [960, 540, 1.5, 'inside', 1.5, 196],
  [800, 370, 1, 'inside', 1, 196],
])('%ix%i: board %s, windows %s at %s, width %s', (w, h, zoom, wins, winZoom, width) => {
  const l = screenLayout(w, h);
  expect([l.zoom, l.wins, l.winZoom, l.winLeft.w]).toEqual([zoom, wins, winZoom, width]);
});
test('outside boxes sit 4 window px off the board, from under the HUD to the board bottom', () => {
  expect(screenLayout(1920, 953)).toMatchObject({ left: 320, top: 116,
    winLeft: { x: 0, y: 164, w: 156, h: 336 }, winRight: { x: 1608, y: 164, w: 156, h: 336 } });
  expect(screenLayout(2560, 1305).winLeft).toEqual({ x: 0, y: 184, w: 156, h: 504 });
  expect(screenLayout(3440, 1305)).toMatchObject({ winLeft: { x: 160, w: 196 }, winRight: { x: 2692, w: 196 } });
});
test('inside boxes are the pillars at board zoom (online pillars end at 316)', () => {
  expect(screenLayout(1920, 1080)).toMatchObject({ winLeft: { x: 0, y: 72, w: 196, h: 308 }, winRight: { x: 1374, y: 72, w: 182, h: 308 } });
  expect(screenLayout(800, 370)).toMatchObject({ left: 80, top: 5, winLeft: { x: 80, y: 29, w: 196, h: 308 }, winRight: { x: 538, w: 182 } });
  expect(screenLayout(1920, 1080, { online: true }).winLeft.h).toBe(292);
});
test('a connection band shrinks the board below an integer and the windows follow it', () => {
  const l = screenLayout(1920, 1080, { band: 28, online: true });
  expect(l.zoom).toBeCloseTo(1052 / 360);
  expect([l.top, l.left, l.wins, l.winZoom]).toEqual([0, 24, 'inside', l.zoom]);
});
test('outer screens: board zoom x 0.75, down to a 0.25 step, at least 1', () => {
  expect([1, 1.5, 2, 3, 4].map(outerZoom)).toEqual([1, 1, 1.5, 2.25, 3]);
  expect([[800, 370], [960, 540], [1280, 720], [1920, 953], [1920, 1080], [2560, 1305], [2560, 1440]]
    .map(([w, h]) => screenLayout(w!, h!).outerZoom)).toEqual([1, 1, 1.5, 1.5, 2.25, 2.25, 3]);
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/screen-layout.test.ts` → FAIL(`screenLayout` 없음).
- [ ] **Step 3: 구현** — `layout.ts`에 위 Interfaces.
  - 판: `stagePlacement(w, h)`로 배율을 구한 뒤, `band > 0`이면 `zoom = min(zoom, (h − band) / 360)`, `left = max(0, floor((w − 640·zoom)/2))`, `top = floor(max(0, h − band − 360·zoom)/2)`(지금 `online/battle.ts` `fit`과 같은 값).
  - 창 배율 후보: `[zoom, ceil(zoom)−1, ceil(zoom)−2, …]` 중 2 이상인 정수(첫 후보 `zoom`은 2 미만이어도 넣는다). 여백 `m = left`(화면 px). 첫 후보 중 `m / z ≥ WIN_MIN + WIN_GAP`이면 `outside`, 폭 `min(WIN_MAX, m / z − WIN_GAP)`, 없으면 `inside`.
  - outside 상자: `y = top + 24·zoom`, `h = 336·zoom / winZoom`, 왼쪽 `x = left − (w + WIN_GAP)·winZoom`, 오른쪽 `x = left + 640·zoom + WIN_GAP·winZoom`.
  - inside 상자: `winZoom = zoom`, `y = top + 24·zoom`, `h = online ? 292 : 308`, 왼쪽 `x = left + 0`, `w = 196`, 오른쪽 `x = left + 458·zoom`, `w = 182`.
  - `outerZoom(z) = max(1, floor(z·0.75 / 0.25)·0.25)`. `screenLayout`의 `outerZoom`은 띠를 뺀 판 배율로 계산한다.
  - `computeZoom`에 한 줄 주석: "Integer from 2x up; the 1.5 step keeps 960-1279px windows off 1x."(설계 '배율 정책'의 설명 고치기).
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `client.test.ts`의 `computeZoom`·`stagePlacement` 시험도 그대로 PASS.
- [ ] **Step 5: 커밋** — `git add packages/client/src/layout.ts packages/client/test/screen-layout.test.ts` · `Work out the board, side-window and outer-screen placement in one layout function`

**끝 기준:** 설계 표의 9개 창 크기 모두 판 배율·자리·창 배율·폭이 설계 값과 같고, 띠가 있을 때 정수가 아닌 판 배율로 계산된다.

---

### Task 2: `ui/windows.ts` — 판 옆 창 상태, Esc 순서, 잠금, 기둥이 덮는 것 (순수)

설계: '창을 어느 쪽에 두나', ③ Esc, ⑤⑥, ⑦, ⑰, '창별 정리'.

**Files:**
- Create: `packages/client/src/ui/windows.ts`
- Test: `packages/client/test/windows.test.ts` (새)

**Interfaces:**
- Consumes: `WinPlace`(Task 1), `rightModel(state).canSummon`(`ui/models.ts`), `esc`(`ui/dom.ts`).
- Produces:
  ```ts
  export type LeftWin = 'details' | 'jige' | 'helper';
  export type RightWin = 'market' | 'quests' | 'upgrades';
  export type SideWin = LeftWin | RightWin;
  export type Side = 'left' | 'right';
  export interface Sides { left: LeftWin | null; right: RightWin | null; last: Side | null }
  export const NO_SIDES: Sides;
  export function sideOf(win: SideWin): Side;
  export function openSide(s: Sides, win: SideWin): Sides;     // 같은 쪽은 바꿈, last = 그 쪽
  export function toggleSide(s: Sides, win: SideWin): Sides;   // 같은 창이 열려 있으면 closeSide
  export function closeSide(s: Sides, side: Side): Sides;      // last = 다른 쪽이 열려 있으면 그쪽, 아니면 null
  export interface LockInput { locking: boolean; paused: boolean; scene: boolean; portrait: boolean; failed: boolean }
  export function sidesLocked(i: LockInput): boolean;          // 4층 paused, 5층 locking, 6층 scene, 8층 portrait, 오류 failed
  export type EscStep = 'scene' | 'locking' | Side | 'selection';
  export function escStep(i: { scene: boolean; locking: boolean; sidesLocked: boolean; sides: Sides }): EscStep;
  export function coveredIds(wins: WinPlace, sides: Sides): string[];
  export function winHeadHtml(o: { side: Side; titleHtml: string; extraHtml?: string; closeLabel: string }): string;
  export function rightBarHtml(state: GameState, heldCoins: number): string;
  ```
  `scene`(실패·클리어 장면)은 B3가, `portrait`(세로 안내)는 B4가 채운다. B2는 `scene: state.phase === 'ended'`, `portrait: false`로 부른다(Task 4).

- [ ] **Step 1: 실패하는 시험 쓰기** — `windows.test.ts`:

```ts
test('one window a side; a second left window replaces the first, left and right stay together', () => {
  let s = openSide(NO_SIDES, 'details');
  s = openSide(s, 'market');
  expect(s).toEqual({ left: 'details', right: 'market', last: 'right' });
  s = openSide(s, 'jige');
  expect(s).toEqual({ left: 'jige', right: 'market', last: 'left' });
  expect(toggleSide(s, 'jige')).toEqual({ left: null, right: 'market', last: 'right' });
  expect(closeSide(closeSide(s, 'left'), 'right')).toEqual(NO_SIDES);
});
test('Esc: scene, then a locking window, then the last side window, then the selection', () => {
  const both: Sides = { left: 'details', right: 'upgrades', last: 'right' };
  expect(escStep({ scene: true, locking: true, sidesLocked: true, sides: both })).toBe('scene');
  expect(escStep({ scene: false, locking: true, sidesLocked: true, sides: both })).toBe('locking');
  expect(escStep({ scene: false, locking: false, sidesLocked: false, sides: both })).toBe('right');
  expect(escStep({ scene: false, locking: false, sidesLocked: false, sides: closeSide(both, 'right') })).toBe('left');
  expect(escStep({ scene: false, locking: false, sidesLocked: false, sides: NO_SIDES })).toBe('selection');
  // P pause locks the side windows but Esc never lifts it: Esc goes on to the selection
  expect(escStep({ scene: false, locking: false, sidesLocked: true, sides: both })).toBe('selection');
});
test('layers 4-6 and 8 lock the side windows', () => {
  const none = { locking: false, paused: false, scene: false, portrait: false, failed: false };
  expect(sidesLocked(none)).toBe(false);
  for (const k of ['locking', 'paused', 'scene', 'portrait', 'failed'] as const) expect(sidesLocked({ ...none, [k]: true })).toBe(true);
});
test('pillars cover the panels under them; outside windows and the online helper-pop cover nothing', () => {
  expect(coveredIds('inside', { left: 'jige', right: 'quests', last: 'left' })).toEqual(['left', 'storage', 'right', 'target-overlay']);
  expect(coveredIds('inside', { left: 'helper', right: null, last: 'left' })).toEqual([]);
  expect(coveredIds('outside', { left: 'details', right: 'market', last: 'right' })).toEqual([]);
});
test('window head and the pillar bar', () => {
  const head = winHeadHtml({ side: 'right', titleHtml: '장터 (B)', closeLabel: '장터 닫기 (B)' });
  expect(head).toContain('id="win-right-title"');
  expect(head).toContain('data-action="closeWin" data-arg="right"');
  const s = createGame(loadGameData('stage3'), 1); s.tokens = 68; s.coins = 3000; s.buckwheat = 20;
  const bar = document.createElement('div'); bar.innerHTML = rightBarHtml(s, 0);
  expect(bar.querySelector('[data-action="summon"]')!.textContent).toBe('뚝딱 (Space)');
  expect(bar.textContent!.replace(/\s+/g, ' ').trim()).toBe('뚝딱 (Space) 불 68 · 엽전 3000 · 묵 20');
  bar.innerHTML = rightBarHtml(s, 500);
  expect(bar.textContent).toContain('엽전 2500');
});
```
(`windows.test.ts` 첫 줄에 `// @vitest-environment happy-dom`.)

- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/windows.test.ts` → FAIL.
- [ ] **Step 3: 구현** — `ui/windows.ts`.
  - `coveredIds`: `inside`일 때만. 왼쪽이 `details`·`jige`면 `['left', 'storage']`, 오른쪽이 무엇이든 열려 있으면 `['right', 'target-overlay']`, 순서는 왼쪽 먼저. 온라인 도우미는 판 안에서 `#left` 안의 `helper-pop`이라 덮지 않는다.
  - `winHeadHtml`: `<div class="win-head"><span class="win-title" id="win-${side}-title">${titleHtml}</span>${extraHtml ?? ''}<button class="win-close" data-action="closeWin" data-arg="${side}" aria-label="${closeLabel}">닫기</button></div>`.
  - `rightBarHtml`(설계 ⑦, 목업 `rightHead`): `<div class="win-bar"><button class="win-summon" data-action="summon"${canSummon ? '' : ' disabled'}>뚝딱 (Space)</button><span class="win-money"><span class="nw">불 <b>${tokens}</b> ·</span> <span class="nw">엽전 <b>${coins − heldCoins}</b></span> <span class="nw">· 묵 <b>${buckwheat}</b></span></span></div>`. `.nw`는 줄바꿈 없는 덩어리라 182폭에서 '불 68 · 엽전 3000' / '· 묵 20' 두 줄로 접힌다(CSS는 Task 4).
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS.
- [ ] **Step 5: 커밋** — `git add packages/client/src/ui/windows.ts packages/client/test/windows.test.ts` · `Model the side windows, the Esc order and the layer lock as pure functions`

**끝 기준:** 한쪽 하나 규칙, Esc 네 단계와 P 멈춤 예외, 잠금 다섯 입력, 기둥이 덮는 요소, 머리 줄 글이 시험으로 고정됐다.

---

### Task 3: 창 상자와 `fit`, 바깥 화면 배율

설계: '배치 계산', ①②(상자), ⑮, ⑰(z-index).

**Files:**
- Create: `packages/client/src/fit.ts`
- Modify: `packages/client/index.html`, `packages/client/test/fixtures/net.ts`(`STAGE_HTML`), `packages/client/src/solo.ts`, `packages/client/src/online/battle.ts`, `packages/client/src/main.ts`, `packages/client/src/ui/style.css`
- Test: `packages/client/test/fit.test.ts` (새)

**Interfaces:**
- Consumes: `screenLayout`, `ScreenLayout`, `WinPlace`(Task 1).
- Produces:
  ```ts
  export function applyLayout(l: ScreenLayout, stage: HTMLElement): void
  export function currentWins(): WinPlace            // document.documentElement.dataset.wins, 없으면 'inside'
  export function applyOuterZoom(w: number, h: number): void  // --outer-zoom = screenLayout(w, h).outerZoom
  ```
  DOM: `<div id="win-left" class="win-box"></div>`가 `#stage` 바로 앞, `<div id="win-right" class="win-box"></div>`가 `#stage` 바로 뒤(`#screen` 앞). `document.documentElement.dataset.wins`가 `'inside' | 'outside'`.

- [ ] **Step 1: 실패하는 시험 쓰기** — `fit.test.ts`(happy-dom):
  - `'index.html puts #win-left, #stage, #win-right in that order'`: `readFileSync(new URL('../index.html', import.meta.url), 'utf8')`에서 세 id의 `indexOf`가 오름차순. `STAGE_HTML`도 같은 순서.
  - `'applyLayout places the board and both boxes and marks the place'`: `document.body.innerHTML = STAGE_HTML; applyLayout(screenLayout(1920, 953), el('stage'))` 뒤 `#stage.style.transform === 'scale(2)'`, `left '320px'`, `top '116px'`; `#win-left.style` `left '0px'`, `top '164px'`, `width '156px'`, `height '336px'`, `transform 'scale(2)'`; `#win-right.style.left === '1608px'`; `documentElement.dataset.wins === 'outside'`; `#win-left.classList.contains('outside')`. 이어서 `screenLayout(1920, 1080)`이면 `'inside'`, `#win-right.style.left === '1374px'`, `transform 'scale(3)'`.
  - `'applyOuterZoom writes --outer-zoom'`: `applyOuterZoom(1920, 1080)` 뒤 `documentElement.style.getPropertyValue('--outer-zoom') === '2.25'`.
  - `'style.css scales outer screens and the band by --outer-zoom, not by window-size steps'`: style.css 글에 `#screen > * { zoom: var(--outer-zoom, 1); }`와 `#conn-band`의 `zoom: var(--outer-zoom, 1)`이 있고 `@media (min-width: 1280px) and (min-height: 720px)`가 없다.
- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/fit.test.ts` → FAIL.
- [ ] **Step 3: 구현**
  - `fit.ts` `applyLayout`: 판 `transform: scale(zoom)`·`left`·`top`(지금 두 `fit`이 쓰던 것). 두 상자에 `left`/`top`(화면 px), `width`/`height`(창 px), `transform: scale(winZoom)`, 클래스 `outside`/`inside` 토글, `dataset.wins`. 창 상자 배율은 CSS `zoom`이 아니라 판과 같은 `transform`으로 준다: Chromium·Firefox의 `zoom`은 그 요소의 `left`/`top`도 배율만큼 곱해 화면 px 좌표가 틀어진다(코드에 이 이유를 한 줄 영어 주석으로).
  - `solo.ts` `fit`: `applyLayout(screenLayout(innerWidth, innerHeight), stage); game.scale.refresh()`. `online/battle.ts` `fit`: `screenLayout(width, height, { band: band?.offsetHeight ?? 0, online: true })`. 지금의 판 위치 계산 두 벌을 없앤다.
  - `main.ts`: 시작할 때와 `resize`마다 `applyOuterZoom(innerWidth, innerHeight)`.
  - `style.css`: 끝의 두 media query를 `#screen > * { zoom: var(--outer-zoom, 1); }`로, `#conn-band`에 `zoom: var(--outer-zoom, 1)`. 창 상자 공통: `.win-box { position: fixed; z-index: 5; transform-origin: top left; }`, `.win-box:empty { display: none; }`, `.win-box.locked { z-index: -1; }`, `.win-box.locked.outside { opacity: .4; }`. z-index 5는 `#stage`(z 없음)보다 위, `#screen`(10)·`#conn-band`(20)보다 아래라 ⑰ 2·3층 < 7층이다. `@media (max-height: 400px)` 촘촘한 배치는 그대로.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm test`(기존 시험이 새 `STAGE_HTML`로도 PASS).
- [ ] **Step 5: 커밋** — `git add packages/client/src/fit.ts packages/client/index.html packages/client/test/fixtures/net.ts packages/client/src/solo.ts packages/client/src/online/battle.ts packages/client/src/main.ts packages/client/src/ui/style.css packages/client/test/fit.test.ts` · `Place the side-window boxes beside or over the board and scale outer screens with the board`

**끝 기준:** 솔로·온라인 판 위치가 지금과 같은 값으로 나오고(`client.test.ts` 그대로 통과), 두 상자가 화면 크기에 따라 자리·배율을 바꾸며, 바깥 화면 배율이 media query 대신 `--outer-zoom`을 따른다.

---

### Task 4: 판 옆 창 틀 — 잠그지 않음, 잠금 규칙, Esc, 강화(E) 창

설계: ③(판 안 잠금·초점·E·숫자 키), ⑤⑥(inert 틀), ⑦(강화), ⑨(강화), ⑫, ⑰, ⑲, '창별 정리'.

**Files:**
- Modify: `packages/client/src/ui/mount.ts`, `packages/client/src/ui/panels.ts`(`upgradesHtml`), `packages/client/src/ui/style.css`
- Test: `packages/client/test/side-windows.test.ts` (새), 옛 자리를 기대하던 시험(`grep -l "upgrades\|#modal" packages/client/test`로 찾음)

**Interfaces:**
- Consumes: Task 2 전부, `currentWins()`(Task 3).
- Produces (mount 안, 다음 작업이 같은 이름을 쓴다):
  - `let modal: 'dex' | 'menu' | 'forfeit' | 'settings' | null` — 판을 잠그는 창만 남는다.
  - `let sides: Sides` — 판 옆 창. 액션 `closeWin`(arg `'left' | 'right'`), `openUpgrades`는 `toggleSide(sides, 'upgrades')`.
  - `const locked = () => sidesLocked({ locking: modal !== null || soloResult, paused: !online && userPaused, scene: s.phase === 'ended', portrait: false, failed: driver.failed })`.
  - `function renderSides(s, wins, selected): void` — `#win-left`·`#win-right`에 그 쪽 창 HTML을 `setHtml`, 각 상자의 첫 요소가 `<section class="win …" role="dialog" aria-labelledby="win-${side}-title">`. 다음 작업은 이 함수에 창 종류만 더한다.
  - `upgradesHtml(state: GameState, wins: WinPlace, heldCoins: number): string`.
  - mount는 `#win-left`·`#win-right`가 없으면 만든다(왼쪽은 `#stage` 앞, 오른쪽은 뒤에 `insertAdjacentElement`). 옛 픽스처를 쓰는 시험이 깨지지 않게 하려는 것.

- [ ] **Step 1: 실패하는 시험 쓰기** — `side-windows.test.ts`(happy-dom, 3단계 데이터, `forceRound(s, 3)`, 테스트 파일 하나에 mount 한 번 규칙은 `tab-details.test.ts`처럼 `beforeEach`로 새 DOM·새 mount). `vi.spyOn(driver, 'queue')`로 명령을 본다. 판 끝은 `driver.state.phase = 'ended'` 뒤 `performance.now`를 100ms 넘게 밀고 `scene.onFrame()`.
  - `'E opens 강화 in #win-right and the board keeps taking keys'`: `key('KeyE')` → `#win-right .win.upgrades` 있음, `#modal` 비어 있음, `#lane.inert`·`#bottom.inert` false, `document.activeElement`가 `#win-right` 밖. `key('Space')` → `queue`가 `{ type: 'summon' }`로 불림. `key('Digit1')` → `{ type: 'upgrade', id: 'physical' }`. `key('KeyE')` → 닫힘. 닫힌 뒤 `Digit1`은 명령 없음.
  - `'the window is laid out as three stacked items with the pillar bar'`: 판 안 배치(기본) — `.up-item` 셋, 첫 항목 글에 `1`·`물딜 강화`·`/`, `.up-item button[data-action="upgrade"]` 셋, `.win-bar [data-action="summon"]` 있음, 머리 제목 '강화 (E)'. `document.documentElement.dataset.wins = 'outside'`로 다시 그리면 `.win-bar` 없고 머리에 '엽전 N'.
  - `'pillars make the covered panels inert, outside windows do not; a resize moves the inert with them'`(Review Focus 1): 판 안에서 E → `#right.inert`·`#target-overlay.inert` true, `#left.inert` false. 창을 연 채 `dataset.wins = 'outside'` 뒤 다시 그리기 → `#right.inert` false, 창은 그대로 열려 있음. 다시 `'inside'` → true.
  - `'the dex, the settings, P and the end of the game lock the side windows without closing them'`: E 연 채 `key('KeyD')` → `#win-right.inert` true, `classList` `locked`, `#win-right` 안 `[data-action="upgrade"]`를 `press` → `queue`에 upgrade 없음. `key('KeyD')`로 도감 닫기 → `inert` false, 창 그대로. `key('KeyP')` → 잠김, 다시 P → 풀림.
  - `'P pause: digit keys and window buttons send nothing'`(Review Focus 4): E 연 채 P → `Digit1`·창 단추 press 모두 `queue` 안 불림.
  - `'P then the settings: closing the settings keeps the pause'`: P → 설정(⚙ `openSettings` 단추 press) → `key('Escape')` → `#modal` 비어 있음, `driver.paused` true.
  - `'the game ending closes a locking window and locks the side windows'`: E 연 채 설정 열기 → 판 끝 → 설정 닫힘, `#modal .result`(솔로 결과) 있음, `#win-right .win.upgrades` 그대로이고 `inert`.
  - `'Esc closes the dex, then the side window, then the selection'`: 유닛 하나 고르고 E, D → Esc → 도감 닫힘·강화 남음 → Esc → 강화 닫힘·선택 남음 → Esc → 선택 풀림.
  - `'closing with the close button gives the focus to the 강화 (E) button'`(Review Focus 5): E → `.win-close` focus 후 press → `document.activeElement`가 `#right [data-action="openUpgrades"]`.
  - `'online: a side window does not darken the board'`(⑫): `online-mount.test.ts` 방식으로 온라인 mount 뒤 E → `#modal .modal` 없음(어둡게 덮는 규칙 `body.online #modal:has(.modal)`이 걸리지 않음). 메뉴(`openMenu`)를 열면 `#modal .modal` 있음.
- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/side-windows.test.ts` → FAIL.
- [ ] **Step 3: 구현 — mount**
  - `modal`에서 `'upgrades'`를 빼고 `sides`로. `render()`: `lockOpen = modal !== null || soloResult`. 판 안 요소 `inert` 목록(지금 `dialogOpen`으로 거는 것)은 `lockOpen`일 때만. 그다음 `coveredIds(currentWins(), sides)`에 든 요소에 `inert`를 더한다(`#right`는 지금의 장터 서랍 조건을 이 규칙으로 바꾼다). `#win-left`·`#win-right`는 `locked()`이면 `inert` + `.locked`, 아니면 둘 다 뺀다.
  - 판이 끝나면(`s.phase === 'ended'`) `modal`이 있으면 `null`로(⑰ '실패·클리어 장면이 시작될 때'. 장면 연출은 B3가 이 자리에 얹는다).
  - `onAction(el('win-left'|'win-right'), (a, g) => { if (!locked()) act(a, g); })`. 둘 다 `act`의 `GAME_ACTIONS`·`readOnly` 규칙도 그대로 탄다.
  - 키(`keydown`) 순서: (1) 지금의 설정·도감 검색 Esc 특례 → (2) 입력 칸·failed·조합 중 등 지금 가드 → (3) Escape: `escStep({ scene: false, locking: modal !== null, sidesLocked: locked(), sides })`가 `'locking'`이면 `closeModal`, `'left'`/`'right'`면 `closeWin`, `'selection'`이면 지금의 옮기기 취소·선택 풀기 → (4) `modal`이 있으면 지금처럼 도감 D·온라인 설정 Q만 받고 끝 → (5) 판이 끝났으면 끝 → (6) 판 옆 창 키: `locked()`이면 E·숫자 키(그리고 다음 작업들의 J·B·R·Tab·온라인 Q)는 아무것도 안 하고 끝. 아니면 `KeyE` → `openUpgrades`(여닫기), `sides.right === 'upgrades'`일 때 `UPGRADE_KEYS` 숫자 → `upgrade`(그리고 끝) → (7) Space·Tab이 단추·`.gamble-option[tabindex]`에서 눌렸으면 브라우저 기본 → (8) 나머지 판 키는 지금 그대로. 강화 창이 열려 있어도 (8)까지 간다(지금은 `modal === 'upgrades'`에서 모든 키를 먹었다).
  - `act`의 '새 창이 열리면 첫 단추에 초점' 줄은 `modal`(잠그는 창)에만 남는다. 판 옆 창은 열 때 초점을 옮기지 않는다(③: Space가 창 단추를 누르지 않게).
  - `closeWin`: 초점이 그 창 안에 있었으면 닫은 뒤 그 창을 여는 패널 단추로(`upgrades` → `#right [data-action="openUpgrades"]`). 그 단추가 `inert`이거나 없으면 옮기지 않는다. Esc·단축키로 닫을 때도 같은 규칙.
  - `resetUi`에서 `sides = NO_SIDES`.
- [ ] **Step 4: 구현 — 강화 창과 CSS**
  - `upgradesHtml(state, wins, heldCoins)`: `winHeadHtml({ side: 'right', titleHtml: '강화 (E)', extraHtml: wins === 'outside' ? '<span class="win-wallet">엽전 <b>N</b></span>' : '', closeLabel: '강화 닫기 (E)' })`, `inside`면 `rightBarHtml(state, heldCoins)`, 그 밑 `.win-body`에 `<p class="upgrade-info">`(지금 `upgradeInfoText`, 줄바꿈 허용) + 강화마다 `<div class="up-item"><div class="up-line"><span class="upgrade-key">${i+1}</span> ${label} <b>${level} / ${max}</b></div><div class="up-effect">${effectText}</div><button data-action="upgrade" …>${가격 또는 '최대'}</button></div>`. 표(`table.upgrades`)는 없앤다.
  - `style.css`: `.win { height: 100%; display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--accent); font-size: 10px; }`, `.win-head`(높이 28 안팎, 제목 굵게, `.win-close`는 `margin-left: auto; min-height: 24px`), `.win-body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; }`(넘치면 창 안에서 스크롤, 글자는 자르지 않음), `.win-bar`(뚝딱 단추 왼쪽 `min-height: 24px`, `.win-money` 오른쪽 맞춤·`flex: 1`·줄바꿈 허용, `.win-money b`·`.win-wallet b`는 12px, `.nw { white-space: nowrap }`), `.win :is(button, [tabindex]):focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }`, `.up-item` 단추 `min-height: 24px`, 핵심 숫자 12px.
  - 옛 강화 창 CSS(`#modal` 아래 `.upgrades` 표)를 지운다.
- [ ] **Step 5: 통과 확인** — 같은 시험 PASS, `npm test`, `npm run typecheck`. 깨진 기존 시험은 '강화가 `#win-right`에 뜬다·판을 잠그지 않는다'로 고친다.
- [ ] **Step 6: 커밋** — `git add packages/client/src/ui/mount.ts packages/client/src/ui/panels.ts packages/client/src/ui/style.css packages/client/test/side-windows.test.ts` + 고친 시험 파일 · `Open side windows without locking the board, lock them under locking layers and move the upgrade window to the right`

**끝 기준:** 강화 창이 판 옆에 뜨고 판·단축키가 그대로 살아 있다. 도감·설정·P·판 끝이면 창이 닫히지 않고 잠긴다. Esc가 잠그는 창 → 판 옆 창 → 선택 순이다. 기둥 배치에서만 덮인 패널이 inert다.

---

### Task 5: 퀘스트(J) 창과 오른쪽 퀘스트 상자

설계: ②, ③(J), ⑦(퀘스트), ⑨, ⑪, ⑬.

**Files:**
- Modify: `packages/client/src/ui/econ.ts`(`questListHtml`, `questBoxModel`, `questBoxHtml`, `huntRows`), `packages/client/src/ui/mount.ts`, `packages/client/src/ui/style.css`
- Test: `packages/client/test/quest-ui.test.ts`(고침·더함), `packages/client/test/side-windows.test.ts`(더함)

**Interfaces:**
- Consumes: Task 2·4(`sides`, `renderSides`, `winHeadHtml`, `rightBarHtml`).
- Produces:
  - `HuntRow`에 `readyIn: number` 추가(다시 부를 수 있을 때까지 남은 초. `cooldown`이면 `readyTick`까지, `huntOut`이면 `deadlineTick`까지, 그 밖은 0).
  - `QuestBoxModel = { count: number; hunt: HuntRow | null; more: number; next: string | null }` — `count` = 진행 중 퀘스트 수 + 열린 격파 수, `hunt` = 열린 격파 중 `ready`인 첫 것, 없으면 `readyIn`이 가장 작은 것, `more` = 열린 격파 수 − (hunt ? 1 : 0).
  - `questBoxHtml(box: QuestBoxModel): string`(`folded` 인자 없앰 — 온라인 접힌 상자도 같은 모양).
  - `questListHtml(rows, focus, hunts, opts: { wins: WinPlace; bar: string })` — 창 틀로 그린다.

- [ ] **Step 1: 실패하는 시험 쓰기**
  - `quest-ui.test.ts` `'the box keeps a head with the count, one hunt and +N more'`: 격파 셋이 열리고 진행 중 퀘스트 하나인 판(기존 시험의 `lane(…)`·`econOf`로) → `questBoxModel(...)`이 `{ count: 4, more: 2 }`, HTML 글에 '퀘스트 (J) · 4개', `.hunt-line` 하나, '+2개 더 · J에서', '제한'(실패 안내) 없음, `.quest-line` 없음.
  - `'with none callable the box shows the soonest wait'`: 모두 재소환 대기, 남은 시간이 다른 판 → `hunt`가 `readyIn`이 가장 작은 것, HTML에 `재소환 대기 3분`(180초 남은 경우)·버튼 `disabled`. 남은 시간 표기: 60초 미만 `N초`, 이상 `ceil(N/60)분`.
  - `'without open hunts the box keeps the next quest line'`: 격파가 안 열린 판 → '다음 30라운드 …' 또는 '남은 퀘스트 없음'(지금 문구).
  - 기존 접힌 상자 시험은 같은 모양을 기대하게 고친다.
  - `side-windows.test.ts` `'J opens 퀘스트 in #win-right; its 소환 sends hunt while the board keeps running'`: J → `#win-right .win.quest-modal` 머리 '퀘스트 (J)', `#modal` 비어 있음. `.hunt-row [data-action="hunt"]` press → `queue`가 `{ type: 'hunt', … }`. J로 닫힘. 강화가 열려 있을 때 J → 오른쪽이 퀘스트로 바뀜. 칩·상자 줄(`openQuests` arg)로 열면 그 줄로 스크롤(지금 `questFocus` 동작이 `#win-right`에서).
- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/quest-ui.test.ts packages/client/test/side-windows.test.ts` → FAIL.
- [ ] **Step 3: 구현**
  - `modal`의 `'quests'` → `sides.right = 'quests'`. `openQuests`는 이미 열려 있으면 그대로 두고 `questFocus`만 바꾼다(줄을 눌러 여는 동작), J 키는 `toggleSide`. J 키의 '`modal === null || 'quests'`' 조건은 Task 4 키 순서 (6)으로 옮긴다(판 끝이면 안 됨, 경제가 있을 때만).
  - `questListHtml`: `winHeadHtml({ side: 'right', titleHtml: '퀘스트 (J)', closeLabel: '퀘스트 닫기 (J)' })` + `inside`면 `bar` + `.win-body.quest-scroll`에 지금 내용(격파 섹션·세 묶음). 창 폭 182·156에서 격파 줄은 글 위·단추 아래로 쌓여도 된다(`.hunt-row` `flex-wrap`), 단추 `min-height: 24px`.
  - `questBoxHtml`: `<div class="quest-box"><button class="panel-title" data-action="openQuests" data-arg="">퀘스트 (J) · ${count}개</button>` + hunt가 있으면 `.hunt-line`(이름·단계·묵·`huntButton(h, h.short)`) + `cooldown`이면 `<div class="hunt-wait">재소환 대기 …</div>` + `more > 0`이면 `<button class="quest-more" data-action="openQuests" data-arg="hunts">+${more}개 더 · J에서</button>` + hunt가 없으면 `next`/'남은 퀘스트 없음'. 글자 10px.
  - `style.css`: `#right:has(.hunt-wait)`로 오른쪽 패널을 촘촘하게 하던 규칙들은 상자가 짧아진 만큼 지우거나 줄인다. 308px 안에 들어가는지는 Task 10에서 잰다.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm test`, `npm run typecheck`.
- [ ] **Step 5: 커밋** — `git add packages/client/src/ui/econ.ts packages/client/src/ui/mount.ts packages/client/src/ui/style.css packages/client/test/quest-ui.test.ts packages/client/test/side-windows.test.ts` · `Move the quest list to the right window and cut the quest box to one hunt and a count`

**끝 기준:** J 창이 판 옆에 뜨고 그 안 '소환'이 판을 잠그지 않은 채 명령을 보낸다. 오른쪽 상자는 머리 줄·격파 하나·'+N개 더 · J에서'(솔로·온라인 같은 모양)다.

---

### Task 6: 장터(B) 창

설계: ②(장터 156폭), ③(B·초점), ④, ⑦(장터), ⑨(장터 글자·단추·접기), '장터가 칸을 안 가림'.

**Files:**
- Modify: `packages/client/src/ui/mount.ts`, `packages/client/src/ui/econ.ts`(`econPanelHtml`), `packages/client/src/ui/gamble.ts`(`gambleHistoryHtml`), `packages/client/src/ui/style.css`
- Test: `packages/client/test/market-target.test.ts`(다시 씀), `packages/client/test/econ-ui.test.ts`·`gamble-ui.test.ts`(`#econ-panel`을 기대하던 곳), `packages/client/test/side-windows.test.ts`(더함)

**Interfaces:**
- Consumes: Task 2·4.
- Produces:
  - `econPanelHtml(market, reveal, readOnly, opts: { wins: WinPlace; bar: string; historyOpen: boolean; historyCount: number })` — 맨 바깥이 `<section class="win market econ-panel" role="dialog" aria-labelledby="win-right-title">`.
  - mount 상태 `historyOpen: boolean`(판 안 기둥에서 '최근 결과' 펼침), 액션 `marketHistory`(여닫기).
  - `econTab`을 없애고 `sides.right === 'market'`으로. `#econ-panel` 상자와 그것을 만드는 줄, `#stage.market-open` 클래스를 없앤다.

- [ ] **Step 1: 실패하는 시험 쓰기**
  - `market-target.test.ts`를 `'opening the market leaves the pinned recipe where it is'`로 다시 쓴다: 목표 고정 → B → `#win-right .econ-panel` 있음, `#stage`에 `market-open` 없음, `#target-overlay` 내용 그대로. 판 안(기본)이면 `#target-overlay.inert` true, B로 닫으면 false. `style.css`에 `market-open` 글자가 없다.
  - `side-windows.test.ts` `'the market sits on the right with the bar inside and the wallet outside'`: 판 안 → `.win-bar` 있음, 머리 '장터 (B)'. `dataset.wins = 'outside'` → `.win-bar` 없음, 머리에 '엽전 N · 묵 M'. B를 눌러 열어도 `document.activeElement`가 창 밖(③).
  - `'inside, 최근 결과 folds to one line and opens on press; outside it stays open'`: 뽑기 기록 둘을 만든 뒤(기존 `gamble-ui.test.ts`의 방법) 판 안 → `.gamble-history` 글이 `최근 결과 ▸ 2개`이고 `li` 없음, `[data-action="marketHistory"]` press → `li` 둘·`aria-expanded="true"`. `outside` → 처음부터 `li` 둘.
  - `'B replaces another right window'`: E → B → 오른쪽이 장터, 강화 닫힘. (상세와 장터를 같이 여는 시험은 Task 7.)
  - `'a purchase while the market is open goes through and the board stays live'`: B → 묵 보따리 `.gamble-buy` press → `queue`가 `gambleUnit`, 이어서 `key('Space')` → `summon`.
- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/market-target.test.ts packages/client/test/side-windows.test.ts packages/client/test/econ-ui.test.ts packages/client/test/gamble-ui.test.ts` → FAIL.
- [ ] **Step 3: 구현 — mount**
  - `toggleMarket`/`econTab`/`econClose` → `toggleSide(sides, 'market')`/`openSide`/`closeWin('right')`. 지금 '장터를 열면 온라인 도우미를 닫는' 줄(`helperOpen = false`)은 없앤다: 도우미는 왼쪽, 장터는 오른쪽이라 같이 열 수 있다(설계 '한쪽에는 창 하나').
  - 장터 리스너(`pointerover`·`pointerdown`·`focusin`·`click`으로 상품 고르기)는 `#win-right`에 달고 `closest('.econ-panel')` 안에서만 처리한다. `renderMarketInfo`·지갑·결과·기록 부분 갱신과 `data-market-focus` 초점 되살리기는 `#win-right` 안을 찾는다.
  - `act` 뒤 `toggleMarket`이면 장터 닫기 단추로 초점을 주던 줄을 없앤다(③ 열 때 초점 안 옮김). 닫을 때는 Task 4 `closeWin` 규칙(여는 단추 `#right [data-action="toggleMarket"]`로)을 쓴다.
  - `gamble()`의 `if (!econTab …)` → `sides.right !== 'market'`. B 키는 Task 4 키 순서 (6)으로.
- [ ] **Step 4: 구현 — 모양**
  - `econPanelHtml`: `winHeadHtml({ side: 'right', titleHtml: '장터 (B)', extraHtml: outside ? '<span class="gamble-wallet win-wallet"></span>' : '', closeLabel: '장터 닫기 (B)' })`, `inside`면 `bar`, 그 밑 `.win-body.econ-body`에 상품(지금 `gambleHtml`)·`#gamble-info`·`.gamble-result`·`.gamble-history`. '라운드마다 충전'은 몸통 첫 줄로 내린다. 지갑 글은 `엽전 N · 묵 M`(지금 `balance` 줄을 `엽전 ${coins}냥 · 묵 ${buckwheat}개`에서 머리 폭에 맞게 `엽전 ${coins} · 묵 ${buckwheat}`로. 숫자는 `<b>` 12px).
  - `gambleHistoryHtml(history, state, opts?: { folded: boolean })`: `folded`면 `<button class="gamble-history-toggle" data-action="marketHistory" aria-expanded="false">최근 결과 ▸ <span>${n}개</span></button>`만, 펼치면 같은 단추(`aria-expanded="true"`, '최근 결과 ▾')와 목록. `outside`는 늘 펼친 목록(단추 없음, 지금 모양). 확률 안내(`#gamble-info`)는 지금처럼 고른 상품 하나만.
  - `style.css`(⑨): `.econ-panel` 아래 글자 8~9px → 10px, 가격·남은 횟수 같은 숫자 12px, `.gamble-buy`·닫기·기록 단추 `min-height: 24px`, 나란한 구매 단추 사이 8px, 상품 묶음은 한 줄에 하나씩 쌓기(`.gamble-options`를 한 열로 두지 말고 묵 보따리 단추 둘·돈 도박 둘은 한 줄에 둘 + 사이 8px, 엽전 보따리는 하나). `.econ-panel :is(button, .gamble-option):focus-visible`의 1px 규칙을 Task 4의 2px 규칙으로 바꾼다. `#econ-panel` 자리 규칙, `body.online #econ-panel`, `#stage.market-open #target-overlay`를 지운다. 테두리는 `.win.market { border-color: #82663f }`.
- [ ] **Step 5: 통과 확인** — 같은 명령 PASS, `npm test`, `npm run typecheck`. `grep -rn "econ-panel\|market-open\|econTab" packages/client/src packages/client/test`로 남은 참조가 새 규칙과 맞는지 본다.
- [ ] **Step 6: 커밋** — `git add packages/client/src/ui/mount.ts packages/client/src/ui/econ.ts packages/client/src/ui/gamble.ts packages/client/src/ui/style.css packages/client/test/market-target.test.ts packages/client/test/side-windows.test.ts` + 고친 시험 파일 · `Move the market into the right window, keep the pinned recipe in place and fold the history in the pillar`

**끝 기준:** 장터가 x 458 오른쪽(기둥)이나 판 밖에만 뜨고, 목표 트리는 움직이지 않으며, 장터를 연 채 소환·조합이 된다. 기둥에서 '최근 결과'는 한 번 눌러 펼친다. 장터 안 글자 10px·숫자 12px·단추 24px.

---

### Task 7: 상세(Tab)·지게(R) 왼쪽 창, 덮인 패널의 초점과 보관함

설계: ①, ③(Tab·R·지게 닫힘 안내), ⑤, ⑨(상세 2×2·지게), ⑱, '상세가 선택을 따라감'.

**Files:**
- Modify: `packages/client/src/ui/mount.ts`, `packages/client/src/ui/panels.ts`(`unitDetailsHtml`), `packages/client/src/ui/econ.ts`(`jigeListHtml`), `packages/client/src/LaneScene.ts`, `packages/client/src/ui/style.css`
- Test: `packages/client/test/tab-details.test.ts`·`unit-details.test.ts`·`jige-ui.test.ts`(고침), `packages/client/test/side-windows.test.ts`(더함)

**Interfaces:**
- Consumes: Task 2·4.
- Produces:
  - `unitDetailsHtml(state, selected, target)` — 맨 바깥 `<section class="win unit-details" role="dialog" aria-labelledby="win-left-title">`, 머리는 `winHeadHtml({ side: 'left', titleHtml: <그림·이름·등급·종류 표>, closeLabel: '상세 닫기 (Tab)' })`, 능력치 `dl.ud-stats` 2×2.
  - `jigeListHtml(data, list, held)` — 머리 `지게 (R) · 보유 ${held}`, `closeLabel: '지게 닫기 (R)'`.
  - `LaneScene.storageCovered: boolean`(기본 false). `storageOpen()`이 `!this.storageCovered && …`.
  - 액션 `unitDetails` → `openSide(sides, 'details')`, `jigeOpen` → `openSide(sides, 'jige')`, `jigeSwap`·닫기 → `closeSide(sides, 'left')`. `jigeList`는 왼쪽이 `jige`가 아니게 되면 `null`.

- [ ] **Step 1: 실패하는 시험 쓰기**
  - `tab-details.test.ts`를 `#win-left .unit-details` 기준으로 고친다. 더할 것:
    - `'상세 follows the selection and closes when it goes'`: 유닛 a 고르고 Tab → a의 이름, `scene.select(1)` → b의 이름(창은 그대로), `scene.select(null)` → 닫힘.
    - `'with the focus on a window button Tab moves the focus, otherwise it closes 상세'`: Tab으로 연 뒤 `.win-close`에 focus 두고 `key('Tab', { target })` 대신 `.win-close`에서 `dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true, cancelable: true }))` → 창 그대로, `defaultPrevented` false. 초점 없이 Tab → 닫힘.
    - `'a combine from 상세 keeps it open on the result'`: 조합 가능한 판에서 Tab → 창의 조합 단추 press → `queue`가 `combine`, 창 그대로(지금은 닫힘 — 판을 잠그지 않으니 닫을 까닭이 없다).
  - `unit-details.test.ts`: `.ud-stats`가 2×2(`.ud-stat` 넷, CSS `grid-template-columns: 1fr 1fr` 글이 style.css에 있음).
  - `jige-ui.test.ts`: `#win-left .jige-modal`, 머리 글 `지게 (R) · 보유 2`, 밑 줄 `갓 (5등급) · 진영 1행 1열 → 같은 등급`(원가 글은 그 줄의 `title`로 옮겨 보이는 정보는 같게 둔다), R로 닫힘. 더할 것:
    - `'when the unit changes the list closes with a notice'`: R로 연 뒤 그 유닛을 팔기(`queue` 후 `driver` 한 틱) → 창 닫힘, 솔로 HUD 알림 글이 '유닛이 바뀌어 지게 목록을 닫았습니다'. 후보를 눌러 바꾼 경우(`jigeSwap`)에는 이 안내가 없다.
    - `'typing in the name box is not a hotkey'`(Review Focus 3): R로 연 뒤 이름 칸 input에 focus, 그 input에서 `KeyE`·`KeyB`·`Space` keydown → 강화·장터가 안 열리고 `summon` 없음. input 이벤트로 후보가 걸러진다(지금 `#modal` 리스너를 `#win-left`로).
  - `side-windows.test.ts`:
    - `'a left pillar covers the left panel and storage, frees the focus there and refuses storage drops'`(Review Focus 2): 판 안, 유닛 고름, `#left`의 범위 단추에 focus → Tab은 단추 초점이라 기본 동작이므로 `act` 대신 `상세` 단추(`#left [data-action="unitDetails"]`) press → `#left.inert`·`#storage.inert` true, `document.activeElement`가 `#left` 밖, `scene.storageCovered` true. 닫으면 false. `outside`면 열어도 셋 다 false.
    - `'상세 and the market together'`: Tab → B → `#win-left .unit-details`와 `#win-right .econ-panel`이 같이 있음, Esc → 장터 닫힘(마지막에 연 쪽), Esc → 상세 닫힘.
- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/tab-details.test.ts packages/client/test/unit-details.test.ts packages/client/test/jige-ui.test.ts packages/client/test/side-windows.test.ts` → FAIL.
- [ ] **Step 3: 구현 — mount**
  - `modal`의 `'unitDetails'`·`'jige'` → `sides.left`. 선택이 없거나 넋 카드면 상세를 닫는 지금 규칙(`modal === 'unitDetails' && (selected === null || spiritCard)`)을 `sides.left === 'details'`로. `combine` 액션의 '상세 닫기' 줄을 없앤다.
  - 지게가 낡으면(`jigeStale`) 닫고 `say('유닛이 바뀌어 지게 목록을 닫았습니다', NOTE_MS)`(소리 없음. `jigeSwap`의 거절 문구 '유닛이 바뀌어 지게 바꾸기를 취소했습니다'는 그대로).
  - 키: Tab은 Task 4 순서 (6)에서 — 초점이 단추·`.gamble-option[tabindex]`에 있으면 브라우저 기본, 아니면 `preventDefault` 후 `sides.left === 'details'`면 닫기, 아니면 카드 유닛이 있을 때 열기. R은 `sides.left === 'jige'`면 닫기, 아니면 지금처럼 열기.
  - 덮인 패널: `render()`에서 `coveredIds`에 `left`가 들면, 초점이 `#left`·`#storage` 안이면 `(document.activeElement as HTMLElement).blur()`, `refocusIn(el('left'), …)`는 건너뛴다. `scene.storageCovered = coveredIds(...).includes('storage')`. `storageLive()`는 '판을 잠그는 창이 없고(`modal === null`) 왼쪽 기둥이 보관함을 덮지 않을 때'로 바꾼다(G·보관 키 `storeAll`·`store`는 그대로 동작).
  - 지게 이름 칸 `input` 리스너를 `#win-left`로 옮긴다.
- [ ] **Step 4: 구현 — 모양**
  - `unitDetailsHtml`: 머리는 지금 `ud-head` 내용(그림·이름·등급·종류 표)을 `titleHtml`로, 닫기는 공통 `.win-close`. 몸통 `.win-body.ud-body`(`KEEP_SCROLL`의 `.ud-body` 그대로).
  - `jigeListHtml`: 머리·밑 줄 위 문구, 거르기 줄 `.jige-filters { flex-wrap: wrap; gap: 8px }`, 이름 칸은 196폭에서 단추 셋과 한 줄, 156폭(`:root[data-wins="outside"]`)에서는 `flex-basis: 100%`로 한 줄 위에 따로. B1 기록의 '156폭에서 마딜 단추 19px 넘침'이 이 줄로 없어지는지 Task 10에서 잰다. 후보 줄(높이 28·사이 4)은 B1 CSS 그대로.
  - `style.css`: `#modal .unit-details`·`body.online #modal .unit-details`·`.jige-modal` 등 `#modal`에 묶인 규칙을 `.win` 아래로 옮긴다. `.ud-stats { display: grid; grid-template-columns: 1fr 1fr; }`. 창 안 글자 10px 이상.
- [ ] **Step 5: 통과 확인** — 같은 명령 PASS, `npm test`, `npm run typecheck`. `grep -rn "'unitDetails'\|'jige'" packages/client/src/ui/mount.ts`로 `modal` 비교가 남지 않았는지.
- [ ] **Step 6: 커밋** — `git add packages/client/src/ui/mount.ts packages/client/src/ui/panels.ts packages/client/src/ui/econ.ts packages/client/src/LaneScene.ts packages/client/src/ui/style.css packages/client/test/tab-details.test.ts packages/client/test/unit-details.test.ts packages/client/test/jige-ui.test.ts packages/client/test/side-windows.test.ts` · `Move 상세 and the 지게 list to the left window and free the panels a pillar covers`

**끝 기준:** 상세·지게가 왼쪽 창에 뜨고 상세는 선택을 따라간다. 기둥이 덮으면 `#left`·`#storage`가 inert이고 그 안 초점이 풀리며 보관함으로 끌어 넣을 수 없다. 지게가 낡아 닫히면 안내가 뜬다.

---

### Task 8: 온라인 — 도우미 왼쪽 여백 창, 하단 카드 이름 단추

설계: ③(온라인 Q), ⑩, ⑪(온라인 퀘스트 확인), ⑭.

**Files:**
- Modify: `packages/client/src/ui/mount.ts`, `packages/client/src/ui/helper.ts`, `packages/client/src/ui/panels.ts`(`renderBottom`), `packages/client/src/ui/style.css`
- Test: `packages/client/test/online-mount.test.ts`(더함)

**Interfaces:**
- Consumes: Task 2·4·7(`sides.left`, `openSide`, `unitDetails` 액션).
- Produces:
  - `helperOpen`을 `sides.left === 'helper'`로 바꾼다(`setHelper(on)`은 `openSide`/`closeSide`, `helperOpened` 명령·범위 정하기는 그대로).
  - `helperPopHtml(state, list, opts, frame: 'pop' | 'win' = 'pop')` — `'win'`이면 `<section class="win helper-win" role="dialog" aria-labelledby="win-left-title">` + `winHeadHtml({ side: 'left', titleHtml: '조합 도우미 (Q)', closeLabel: '조합 도우미 닫기 (Q)' })` + 범위 단추(`scopeHtml(list, selected, true)`, 지금 그대로) + `.win-body.helper` 목록.
- [ ] **Step 1: 실패하는 시험 쓰기** — `online-mount.test.ts`:
  - `'outside, Q opens the helper in the left window and the six rows stay in view'`: `dataset.wins = 'outside'` → Q → `#win-left .helper-win` 머리 '조합 도우미 (Q)', 범위 단추 둘(title 'Shift+Q'), `#left .helper-pop` 없음, `#left .lane-row` 여섯. 유닛을 고른 채 열면 '이 유닛'이 눌린 상태, Shift+Q → '전체'. Q → 닫힘. `helperOpened`는 열 때마다 한 번(지금 시험 규칙 그대로).
  - `'inside, Q keeps the helper over the six rows'`: 기본(inside) → Q → `#left .helper-pop`, `#win-left` 비어 있음, `#left.inert` false.
  - `'the helper and the market are open together; 상세 replaces the helper'`: Q → B → 둘 다 있음. Tab(유닛 고름) → 왼쪽이 상세, 도우미 닫힘.
  - `'the card name opens 상세'`(⑭): 유닛을 고른 온라인 판 → `#bottom button.unit-info[data-action="unitDetails"]` 글이 '▸'로 끝남, press → `#win-left .unit-details`. 이름 단추 `title`은 능력 문장 그대로.
  - `'online J opens the quest window without darkening the board'`: J → `#win-right .quest-modal`, `#modal .modal` 없음.
- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/online-mount.test.ts` → FAIL.
- [ ] **Step 3: 구현**
  - mount `render()`: `currentWins() === 'outside' && sides.left === 'helper'`면 도우미를 `renderSides`의 왼쪽에 `frame 'win'`으로 그리고 `renderRows(view, data, '', …)`. 아니면 지금처럼 `renderRows`에 `helper-pop`. 도우미 줄 마우스 올림(`hoverRow`)을 쓰는 `#left` 리스너를 `#win-left`에도 단다. 온라인 Q·Shift+Q는 Task 4 키 순서 (6)으로 옮긴다(잠겼으면 무시).
  - `renderBottom`: `.unit-info` `<span>`을 `<button class="unit-info" data-action="unitDetails" title="${skillText}">…<span class="ui-open">▸</span></button>`로. 안의 두 줄과 사거리 `title`은 그대로. 오른쪽 조합 두 줄은 B1 규칙 그대로(건드리지 않음). 솔로 하단 카드는 안 바꾼다.
  - `style.css`: `.helper-win .win-body`가 목록 스크롤, `#bottom .unit-info` 단추가 지금 카드 높이(44px)를 넘지 않게(테두리·바탕은 투명, `:focus-visible`은 금색 2px).
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm test`, `npm run typecheck`.
- [ ] **Step 5: 커밋** — `git add packages/client/src/ui/mount.ts packages/client/src/ui/helper.ts packages/client/src/ui/panels.ts packages/client/src/ui/style.css packages/client/test/online-mount.test.ts` · `Show the online helper in the left window on big screens and open 상세 from the card name`

**끝 기준:** 큰 화면 온라인에서 도우미를 열어도 여섯 고개 줄이 보이고, 판 안 배치에서는 지금 자리 그대로다. 하단 카드 이름을 눌러(터치 포함) 상세를 연다.

---

### Task 9: 기둥 창이 열렸을 때 알림 자리, 격파 칩 줄

설계: ⑧, ⑯, '다른 설계와 맞춘 것'(B3 ⑰·⑬ 폭).

**Files:**
- Modify: `packages/client/src/ui/mount.ts`, `packages/client/src/layout.ts`(`NOTICE_SPAN`), `packages/client/src/LaneScene.ts`, `packages/client/src/fx/FxLayer.ts`, `packages/client/src/ui/style.css`
- Test: `packages/client/test/side-windows.test.ts`(더함), `packages/client/test/notice-span.test.ts`(새)

**Interfaces:**
- Consumes: Task 2(`coveredIds`), Task 3(`currentWins`).
- Produces:
  - `#stage.pillar-open` 클래스 — `coveredIds(currentWins(), sides).length > 0`일 때.
  - `export const NOTICE_SPAN = { x: 200, w: 254 } as const`(`layout.ts`, 판 px).
  - `LaneScene.setNoticeSpan(narrow: boolean): void` → `FxLayer.setNoticeSpan(span: { x: number; w: number } | null)`(캔버스 px, 좁힐 때 `{ x: 72, w: 254 }` = 판 px 200 − `CENTER_X` 128).
  - `export function noticeBand(hostWidth: number, span: { x: number; w: number } | null): { cx: number; half: number }`(`FxLayer.ts`, 순수) — 토스트 가운데 x와 탄생 띠의 가운데·반폭.
- [ ] **Step 1: 실패하는 시험 쓰기**
  - `noticeBand`: `noticeBand(400, null)` → `{ cx: 200, half: 200 }`, `noticeBand(400, { x: 72, w: 254 })` → `{ cx: 199, half: 127 }`.
  - `side-windows.test.ts` `'a pillar window narrows the notice zone; outside windows do not'`: 판 안 E → `#stage.pillar-open`, 가짜 scene의 `setNoticeSpan`이 `true`로 불림. 닫으면 클래스 없음·`false`. `outside`면 열어도 없음. 온라인 판 안 도우미(`helper-pop`)는 좁히지 않음.
  - `'style.css narrows the zone under .pillar-open and keeps the chip row narrow in the pillar layout'`: style.css 글에 `#stage.pillar-open #round-banner`, `#stage.pillar-open #econ-top`, `#stage.pillar-open #tame-anchor:not(.floating)`, `#stage.pillar-open .countdown`의 `left: 200px`(카운트다운은 가운데 `327px`)와 `width: 254px`, `:root[data-wins="inside"] #econ-bottom`의 `left: 200px; width: 254px`.
- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/side-windows.test.ts packages/client/test/notice-span.test.ts` → FAIL.
- [ ] **Step 3: 구현**
  - mount `render()`: `el('stage').classList.toggle('pillar-open', narrow)`, `scene.setNoticeSpan?.(narrow)`(가짜 scene에 메서드가 없어도 되게 선택 호출, 바뀔 때만).
  - `FxLayer`: 토스트 글 `x = cx`, 좁힐 때 `wordWrap` 폭 `w`. 탄생 띠는 `w/2` 대신 `noticeBand`의 `cx`·`half`로 그리고, 글·그림 가운데도 `cx`. 띠 안의 순서·모양은 B3 몫이라 건드리지 않는다.
  - `style.css`: 위 규칙들. `#econ-bottom`은 판 안 기둥 배치면 창이 닫혀 있어도 좁다(칩 셋이면 두 줄, 높이 56 안). 판 밖 배치(`outside`)는 지금 자리(x 132~524) 그대로.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm test`, `npm run typecheck`.
- [ ] **Step 5: 커밋** — `git add packages/client/src/ui/mount.ts packages/client/src/LaneScene.ts packages/client/src/fx/FxLayer.ts packages/client/src/layout.ts packages/client/src/ui/style.css packages/client/test/side-windows.test.ts packages/client/test/notice-span.test.ts` · `Narrow the notice zone while a pillar window is open and keep the chip row inside the pillars`

**끝 기준:** 기둥 창이 하나라도 열리면 라운드 배너·토스트·탄생 띠·카운트다운·`#econ-top`·T 단추 기본 자리가 x 200~454 안에 있고, 닫으면 돌아온다. 판 안 기둥 배치의 격파 칩 줄은 늘 x 200~454다.

---

### Task 10: 브라우저로 확인하고 기록하기

설계: '확인 방법', '실패로 보는 것', '만드는 사람에게 맡기는 것'.

**Files:**
- Modify: 이 문서 '진행'과 frontmatter progress, `docs/superpowers/specs/2026-11-25-window-layout-design.md` '진행 기록', `docs/superpowers/plans/2026-11-25-ui-review-fixes.md` '진행'
- 코드 변경은 이 작업에서 찾은 잘림·겹침·넘침 수정만(찾으면 수정과 시험·측정 근거를 따로 커밋)

- [ ] **Step 1: 띄우기** — `packages/client`에서 `npx vite --port 5176 --strictPort`(백그라운드). 온라인은 `PORT=2568 npm run dev:server`와 `VITE_SERVER_URL=http://localhost:2568`로 띄운 두 번째 vite(5177). 5173·5174·2567은 쓰지 않는다. PID를 적어 둔다.
- [ ] **Step 2: 창 크기별** — claude-in-chrome 새 탭 `http://localhost:5176/solo`(3단계 70라운드 판, `window.__driver`로 판을 만든다). 창 크기를 바꾸기 어려우면 B1처럼 같은 페이지에 iframe을 크기별로 띄운다. 크기: 1920×953, 2560×1305, 1920×1080, 1536×730, 1280×720, 960×540, 800×370.
  - 크기마다 상세·장터·퀘스트·강화·지게를 하나씩, 그리고 왼쪽·오른쪽을 같이 연다.
  - 볼 것: 길(x 203~229, 427~453)·칸이 가려지지 않음, 창 글자 잘림 없음, 창을 연 채 소환·조합·끌기, 기둥 창이 열렸을 때 라운드 배너·카운트다운이 x 200~454 안, 배율 1에서 창 단추 24px 이상·글자 10px 이상·핵심 숫자 12px, 오른쪽 기둥 머리 줄 돈 글이 두 줄(넓은 글꼴이면 세 줄)로 접히고 뚝딱 단추가 왼쪽, 지게 196 기둥에 후보 7줄·156 여백에 6줄, 156폭 지게 거르기 줄 넘침 없음(B1 기록의 19px), Tab으로 창 단추·지게 줄에 초점을 옮기면 금색 2px, 오른쪽 패널(퀘스트 상자 포함)이 308px 안.
  - 잠금: 창을 연 채 P·도감·설정 — 기둥 창은 판 밑으로, 여백 창은 흐려지고 눌리지 않음.
- [ ] **Step 3: 온라인 두 탭 2인 방** — 1920×953에서 도우미(Q)·퀘스트(J)를 연 채 여섯 고개 줄이 보임, 800×370에서 `helper-pop` 그대로, 메뉴를 열면 판 옆 창이 잠김, 하단 카드 이름 단추로 상세.
- [ ] **Step 4: 바깥 화면** — 같은 크기들에서 첫 화면 → 대기실 → 판 → 결과로 넘어가며 글자 크기가 튀지 않음(1280×720·1920×953 1.5배, 1920×1080 2.25배), 1280×720 대기실 여섯 줄이 화면 안, 결과 화면은 넘치면 스크롤.
- [ ] **Step 5: 정리** — 띄운 프로세스를 트리째 끄고(`taskkill //PID <pid> //T //F`) `netstat -ano | grep LISTENING`으로 5176·5177·2568이 빈 것 확인(5173·5174는 남의 것이라 그대로), 탭 닫기.
- [ ] **Step 6: 기록과 커밋** — 이 문서 맨 아래 '진행'에 확인한 것·못 한 것(예: Firefox, 터치 기기, 실제 창 크기 대신 iframe)을 나눠 적고 frontmatter `progress: 100%`. 설계 문서 '진행 기록'과 ui-review-fixes '진행'에 B2 끝 한 줄. 그 세 문서만 `git add` · `Record the B2 window layout checks in the browser`

**끝 기준:** 실패로 보는 것 넷(창이 길·칸을 가림, 한 화면에 보이는 장터·상세 정보가 줄어듦 — 배율 1의 접힌 부분은 한 번 눌러 펼침, 단축키가 느려짐, 멈춘 판에서 창으로 살 수 있음) 중 어느 것도 없음을 확인해 적었다. 확인 못 한 항목은 이유와 함께 적었다.

---

## 진행

- 2026-11-25: 계획 작성. 코드 변경 없음.
- 2026-11-25: 작업 1~9 구현 `9f05bac` `03c0473` `df17c53` `d36f101` `932bbe6` `7ab74d7` `93867d0` `ae20e97` `259f670`.
- 2026-11-25: 작업 10 브라우저 확인(Chrome). worktree에서 vite 5176(솔로)·5177(온라인, `VITE_SERVER_URL=http://localhost:2568`), 서버 `PORT=2568`. 5173·5174·2567은 쓰지 않았다. 끝난 뒤 셋 다 트리째 끄고(`taskkill //T //F`, npx·npm 부모까지) `netstat`으로 5176·5177·2568이 빈 것을 확인했다(5173은 사용자 것이라 그대로). 쓴 탭 둘은 닫았다.
  - **확인 방법:** 이 Chrome 창 안쪽이 1920×1079라 창 크기를 바꾸는 대신 같은 페이지에 크기별 iframe(1920×953 · 2560×1305 · 1920×1080 · 1536×730 · 1280×720 · 960×540 · 800×370)을 띄우고 안에서 쟀다. 판 배율·창 자리·바깥 배율은 설계 표 그대로 나왔다(2·밖 / 3·밖 / 3·안 / 2·안 / 2·안 / 1.5·안 / 1·안, 바깥 1.5 / 2.25 / 2.25 / 1.5 / 1.5 / 1 / 1). 판은 `window.__driver` 3단계 판에 `@dorandi/logic/testing`(`forceRound` 25·30, `placeUnitForTest`로 24칸)을 넣고 엽전 3000·묵 20·불 68·지게 2개, 잡귀가 25마리를 넘으면 줄이는 타이머를 걸었다. 칸은 `emitSelect`로 골랐다(3등급 함지박, 지게 후보 17개).
  - **창 자리:** 판 안 배치(1920×1080 · 1536×730 · 1280×720 · 960×540 · 800×370)에서 상세·지게는 판 x 0~196, 장터·퀘스트·강화는 x 458~640, y 24~332(온라인 24~316). 판 밖(1920×953 · 2560×1305)은 왼쪽 x −160~−4, 오른쪽 x 644~800(판 px, 창 배율 2 · 폭 156), y 24~360. 가운데 x 196~458과 길(203~229 · 427~453)은 어느 크기에서도 창이 덮지 않았고, 800×370 화면에서 오른쪽 길 위의 적과 체력바가 창 왼쪽에 보이는 것을 봤다.
  - **창을 연 채 조작:** 지게(왼쪽)와 장터(오른쪽)를 같이 연 채 실제 Space로 소환, 실제 Z로 조합, 실제 끌기로 칸 0 → 22 옮기기가 됐고 두 창은 열린 채였다. 퀘스트 창의 '소환 · 10냥'·'소환 · 20냥'을 실제로 눌러 격파가 나왔다.
  - **알림 자리(800×370, 기둥 창 열림):** `#stage.pillar-open`, 라운드 배너 상자 x 200~454(글 '25라운드 종료 · +10냥 / 26라운드'는 267~387), 잡귀 한도 카운트다운 285~369, 토스트(긴 글 두 줄) 210~444, 탄생 띠 200~454(글·그림 229~426), '보스 출현' 글 270~386, 격파 칩 줄 200~454. 판 밖 배치에서는 좁히지 않는다(배너 128~528, 칩 줄 132~524).
  - **배율 1 창 안 글자·단추:** 지게·장터·퀘스트·강화 창은 10px 아래 글자 없음, 단추 24px 이상(아래 '남긴 것'의 장터 상품 이름 단추 제외). 오른쪽 기둥 머리 줄은 왼쪽 '뚝딱 (Space)'(24px), 오른쪽 '불 68 · 엽전 3000' / '· 묵 20' 두 줄. 지게 196 기둥은 후보 줄 높이 28·사이 4로 7줄이 온전히 보이고 거르기 줄(이름 칸 + 전체·물딜·마딜) 한 줄에 넘침 없음. 156 여백(1920×953)은 6줄, 거르기 두 줄, 넘침 없음(B1 기록의 마딜 19px 넘침은 없어졌다). 2560×1305는 창이 길어 11줄.
  - **초점:** 실제 Tab으로 장터 닫기 → 다음 단추, 지게 거르기 '마딜' → 첫 후보 줄로 옮기면 `:focus-visible`이고 outline 2px solid rgb(255, 224, 138)(`--accent`), 1px 띄움. 단추에 초점이 있을 때 Tab은 창을 닫지 않고 초점을 옮겼다.
  - **오른쪽 패널:** 일곱 크기 모두 `#right` scrollHeight 306 = clientHeight 306, 마지막 요소 아래 끝 y 325(퀘스트 상자 '퀘스트 (J) · 3개' · 격파 하나 · '+1개 더 · J에서').
  - **잠금:** 상세+장터를 연 채 P · 도감(D) · 설정을 열면 두 상자가 `inert` + `.locked`, 판 안은 z-index −1로 판 밑(장터 단추 자리를 찍으면 캔버스·도감·설정 줄이 잡힘), 판 밖은 불투명도 0.4(찍으면 body). P 멈춘 동안 숫자 키 1과 묵 보따리 클릭은 명령을 보내지 않았다. 닫으면 풀리고 창은 그대로 열려 있다.
  - **온라인 2인 방(두 탭, 70라운드):** 1920×953 탭에서 유닛을 고르고 Q → `#win-left .helper-win` '조합 도우미 (Q)', 범위 단추 '이 유닛 1'(눌림)·'전체 2', title 'Shift+Q', 24px. 여섯 고개 줄은 모두 화면에 보였다(줄 가운데를 `elementFromPoint`로 찍어 확인). J → `#win-right .quest-modal`, 판을 어둡게 덮는 막 없음, 판 inert 아님. 메뉴를 열면 두 상자가 잠기고(불투명도 0.4, 격파 단추를 찍어도 단추가 안 잡힘) Esc로 풀림. 하단 카드 이름 단추('다듬이방망이 · 1등급 · 물 / 공격 9 · … ▸', 높이 30 · 카드 44)를 실제로 눌러 왼쪽에 상세가 열렸다. 800×370 탭은 Q가 `#left .helper-pop`(판 x 0~128), `#win-left` 비어 있음, `#left` inert 아님, 알림 자리 안 좁힘. J는 x 458~640 · y 24~316, 머리 줄 있음, 메뉴에서 잠김.
  - **바깥 화면:** 첫 화면 → 대기실 → 판 → 결과(두 사람 포기로 '전멸') 순서로 1920×953은 1.5 → 1.5 → 판 2 → 1.5, 800×370은 1 → 1 → 1 → 1. 첫 화면은 일곱 크기 모두 `#screen` 높이 안. 1280×720 대기실(1.5배)은 720 안에 들어가고 마지막 자리 줄 아래 끝 546. 800×370 대기실은 촘촘한 배치에서 10px 넘쳐 스크롤된다(지금 규칙 그대로).
  - **실패로 보는 것 넷 — 모두 없음.** (1) 창이 길·칸을 가림: 일곱 크기 모두 창은 x 0~196 · 458~640이나 판 밖. (2) 한 화면의 장터·상세 정보가 줄어듦: 판 밖 장터는 확률·결과·최근 결과를 모두 펼쳐 두고, 판 안 장터는 고른 상품 확률 하나와 '최근 결과 ▸ N개'를 한 번 눌러 펼친다(아래 고친 것 3 뒤 실제 클릭으로 확인). 상세는 능력치 2×2와 능력·메모·조합을 창 안 스크롤로 다 보인다. (3) 단축키가 느려짐: 창을 연 채 Space·Z·끌기가 한 번에 됐다. (4) 멈춘 판에서 창으로 삼: P·도감·설정·메뉴 동안 창 단추가 안 잡히고 숫자 키도 명령을 안 보냈다.
  - **고친 것(따로 커밋):**
    1. 판 밖 장터(156폭) 머리 줄이 '장터 (B)' 37 + '엽전 3000 · 묵 20' 85 + 닫기 31 + 사이 16 + 여백 9 = 178px로 넘쳐 닫기 단추가 창 밖으로 20px 밀렸다(1920×953에서는 화면 오른쪽 끝 밖). 지갑 글을 '엽전 N ·' / '묵 M' 두 조각으로 나눠 두 줄로 접히게 했다. 엽전 12345에서도 닫기 단추가 창 안(머리 높이 35px) `be2527e`.
    2. 판 안 배치의 격파 칩 줄: 칩 하나가 150~166px라 254 폭에 한 줄에 하나뿐이어서 칩 셋(격파 둘 + 살림 한 벌)이면 세 줄 61px가 56px 상자를 넘어 맨 위 칩이 5px 잘렸다. 설계 ⑧의 '칩 셋이면 두 줄'은 칩 폭을 잘못 잡은 것이었다. 칩이 셋 이상이면 한 줄에 둘씩(`max-width: calc(50% - 1px)`) 놓아 넷(70라운드 판의 최대: 격파 셋 + 씨름 또는 그늘손)까지 두 줄 40px에 들어간다. 대신 칩 글의 체력 부분이 말줄임으로 잘린다('43초 남음 · …') `d363931`.
    3. 장터 창이 다시 그려질 때(묵·횟수가 바뀌어 단추 상태가 바뀔 때) `setHtml`이 몸통 스크롤을 되살리는 순간에는 확률 안내·결과가 아직 비어 있어 브라우저가 스크롤을 짧은 높이에 맞춰 깎았다(210 → 85). 배율 1 기둥에서 '최근 결과 ▸'까지 내려 둔 몸통이 위로 튀어 누르기 어려웠다. 그 부분들을 채운 뒤 스크롤을 다시 넣는다 `ed6f678`.
    4. 적 체력바를 따라 떠 다니는 길들이기 상자(T)가 옆 길에 있을 때 상자 폭(172px)의 절반이 기둥 창 밑으로 들어갔다(x 159~285, 왼쪽 창 0~196). 기둥 창이 열린 동안은 상자를 x 200~454 안으로 당긴다. 지네각시를 한 바퀴 돌려 상자가 200~455(반올림)에 머무는 것을 봤다 `da288b2`.
    - 넷 다 관련 시험(side-windows · econ-ui · gamble-ui · market-target · quest-ui · online-mount · notice-span · jige-ui · tab-details, 122개)과 typecheck 통과. 칩 줄은 CSS라 style.css 글 시험과 위 측정이 근거다.
  - **남긴 것(설계 기준에 못 미치지만 이번 작업 범위 밖이라 고치지 않음):**
    - 상세 창 안 공용 조각의 글자: 종류 표(물딜·마딜) 8px, 역할 꼬리표(기절·광역) 9px, 조합 재료 칩 이름 8px. 판 전체가 같이 쓰는 조각이라 창 안에서만 키우면 다른 화면과 어긋나고 조합 줄이 다시 줄바꿈된다. '목표로' 단추(`.pin-btn`)는 높이 15px.
    - 장터 상품 이름 단추(`.gamble-inspect` '보따리'·'큰 보따리' 등, 누르면 그 상품 확률을 보여 줌) 높이 13px. 글 링크 모양이라 24px로 키우면 상품 묶음 배치가 바뀐다.
    - 온라인 `helper-pop` 머리 '조합 도우미 (Q)' 단추 22px(B1 그대로인 지금 자리 도우미).
    - 칩 셋 이상일 때 격파 칩의 체력 %가 말줄임으로 가려진다(남은 초는 보임). J 창에도 체력 %는 없다.
    - 판 안 기둥의 장터 몸통은 배율 1에서 높이 240에 내용 421이라 '최근 결과'까지 스크롤해야 한다(설계 ⑨ 그대로).
  - **못 한 것:** 실제 창을 그 크기로 줄여 본 것(iframe으로 대신, 판 배율·글자 폭은 같게 나온다), Firefox, 터치 기기, 3440×1305 울트라와이드(배율 3 · 창 196), 1366×650(배율 1.5), 온라인 연결 띠가 떠서 판이 줄어드는 장면(서버를 끊어야 해서 안 함, 시험으로만), 솔로 결과 창 배율(판 위 잠그는 창이라 판 배율을 따른다). 전체 시험(`npm test`)은 돌리지 않았다(묶음 끝에서 따로 돈다).
