---
title: 처음 온 사람 (B4) 구현 계획
project: dokkaebi-defense
type: task
priority: high
status: in-progress
startDate: 2026-11-25
progress: 100%
---

# 처음 온 사람 (B4) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 처음 온 사람이 첫 화면에서 무슨 게임인지 알고, 판에서 지금 할 일을 한 마디로 보고, 솔로·대기실 어디서든 나갈 길이 있게 한다. 대기실 버튼 색이 '지금 누를 다음 단계'를 가리키고, 휴대폰 세로에서는 돌려 달라고 말한다.

**Architecture:** 데이터에서 읽는 문구와 판정은 순수 함수로 먼저 만든다. 판 길이·'처음이라면' 문구·첫 판 한 마디는 새 `ui/first-visit.ts`, 보스 체력 줄이기는 `ui/models.ts` `hudModel`, 솔로 멈춤 이유와 세로 안내 판정은 `ui/windows.ts`, 대기실 판정은 `online/lobby.ts` `lobbyModel`에 둔다. 화면은 `online/entry.ts`·`online/lobby.ts`·`online/app.ts`(바깥 화면), `ui/panels.ts`(하단 줄), `ui/hud.ts`(상단 줄), 새 `ui/solo-menu.ts`와 `ui/mount.ts`(메뉴·확인 창·세로 안내)가 그린다. 서버는 `RoomCore.onStart`에서 방장 준비를 보지 않는 한 줄만 바꾼다.

**Tech Stack:** TypeScript, Phaser 3.90, Vitest 3(happy-dom), Vite 6, Colyseus 서버(`packages/server`).

**Spec:** `docs/superpowers/specs/2026-11-25-first-visit-design.md` · 목업 `docs/design/mockups/2026-11-25-first-visit.html`(화면 1~6, 번호 주석 ①…). 함께 볼 표: B1 `2026-11-25-next-combine-design.md` '교차 검토에서 맞춘 것'(⑫ 하단 줄, Q 키), B2 `2026-11-25-window-layout-design.md` ⑮(`--outer-zoom`)·⑰(층 1~8, 잠금, Esc), B3 `2026-11-25-status-signals-design.md` ①②⑦⑧(잡귀 숫자·꼬리 글·멈춤 알약·덮개). 사용자가 2026-11-25에 '사용자에게 물을 것' 1~7을 모두 권장안 (가)로 확정했다.

## Global Constraints

- 작업 위치: worktree `C:/Users/USER/Desktop/이범수/도랜디/dokkaebi-ui-fixes`, 브랜치 `ui-review-fixes`. 모든 명령은 이 폴더에서. 원래 저장소 `C:/Users/USER/Desktop/이범수/도랜디/dokkaebi-defense`와 사용자의 5173 개발 서버는 건드리지 않는다. 5174·2567도 남의 것이다. push·main 머지 금지.
- 기준 640×360, 정수 배율. 판 안 글자는 배율과 상관없이 640 기준이다. 바깥 화면 배율(`--outer-zoom`, B2 ⑮)과 `style.css` 끝의 배율 규칙(`#screen > * { zoom: … }`)은 건드리지 않고 쓰기만 한다.
- 분위기는 담백하게. 새 장식·테마 그림·이모지·글리프 아이콘 없음. 펼침 표시는 CSS 삼각형.
- 초점: DOM 단추·창은 금색 `--accent` 2px(`outline: 2px solid var(--accent)`), 크림 `--ink`는 판 위 표시에만. 첫 화면 단추·'처음이라면' 머리·난이도 단추는 `outline-offset: 2px`.
- 층(아래→위, B2 ⑰): 1 판 · 2 판 안 기둥 창 · 3 판 밖 창(`#win-left`/`#win-right`) · 4 멈춤 덮개(`#pause-cover` z 3) · 5 잠그는 창(`#modal` z 4: 메뉴·확인 창·설정·포기·도감·솔로 결과) · 6 실패·클리어 장면(`#end-scene` z 5) · 7 바깥 화면(`#screen` z 10, `#conn-band` z 20) · 8 세로 안내(새 `#portrait-guide`, `#conn-band`보다 위). 새 층 번호를 만들지 않는다.
- Esc: 실패 장면 건너뛰기 → 잠그는 창 → 마지막에 연 창 → 선택 풀기(`escStep`). 확인 창의 Esc는 '취소'(메뉴 창으로 돌아감). P 멈춤은 Esc로 풀지 않는다.
- 판 덮개 '멈춤 · P로 계속'과 거절 'P로 계속'은 P로 멈췄을 때만(B3). 메뉴·세로 안내로 멈추면 덮개 없음.
- 숫자는 데이터에서 읽는다: 한도 `balance.limit`(60), `balance.limitSeconds`(5), 첫 보스 = `waves` 중 `type: 'boss'`의 가장 작은 `round`(10), 판 길이 = `prepSeconds` + 라운드마다 (보스 `bossRoundSeconds` 75 / 그 밖 `roundSeconds` 34)의 합을 5분 단위로 반올림. 소환 비용은 데이터에 필드가 없고 `logic/src/econ/ledger.ts` `takeToken`이 늘 1개를 쓰므로 `SUMMON_TOKENS = 1` 상수 하나로 둔다.
- 화면 글은 한국어, 이 계획과 설계에 적은 문구 그대로. 코드 주석은 영어, 역추론 못 하는 이유만.
- 이미 끝난 것을 되돌리지 않는다: A줄(`2026-11-25-ui-review-fixes.md` '진행', 특히 A1.1 확인 창 초점 '취소'·A1.6 닉네임), B1 하단 줄(⑫)·Q 키, B2 `sidesLocked`·`escStep`·`coveredIds`·`refocusIn`·`--outer-zoom`, B3 `limitLevel`·`limitTail`·`crackShown`(⑥ '장승' 글자 숨김은 B3에서 이미 들어감)·`#pause-cover`·`#end-scene`·"the dex pause draws no cover and no pill" 시험.
- 새 시험에서 `mountUi`에 넘기는 가짜 장면은 `test/refusal-ui.test.ts`의 `FakeScene`(`showBirth`·`hideBirth`·`setNoticeSpan`·`showGambleResult` 포함)을 본뜬다. B3 이후 `mount.ts`가 `scene.hideBirth()`를 부른다.
- 커밋: 바꾼 파일만 경로로 `git add`(`-A`·`.` 금지). 메시지는 영어 한 줄(동사로 시작) + 빈 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `core.autocrlf=true`라 파일을 스크립트로 고쳤으면 커밋 전에 LF인지 본다.
- 각 작업 끝: 그 작업 시험 + `npm test` + `npm run typecheck` 통과 뒤 커밋. 옛 동작을 기대하던 기존 시험은 이 계획 규칙으로 고쳐 같은 커밋에 넣는다. `sim.test.ts`·stage3-econ 측정이 병렬 부하로 시간을 넘겨 실패하면 그 파일만 단독으로 다시 돌려 확인한다.
- 띄운 프로세스(vite, 서버, 헤드리스 크롬, 정적 서버)는 끝날 때 프로세스 트리째 끄고(`taskkill //PID <pid> //T //F`, 감시 모드면 부모까지) `netstat -ano | grep LISTENING`으로 포트가 비었는지 본다. 브라우저는 claude-in-chrome 새 탭만 쓰고 끝나면 닫는다.

## 이 계획에서 정한 것 (설계가 열어 둔 곳)

- **상단 '멈춤' 알약:** 설계 5-2 ⑤는 "이유와 상관없이 보인다"고 했지만 B3가 도감 멈춤에는 알약을 그리지 않기로 시험으로 못 박았다. 그래서 알약은 P·메뉴(확인 창 포함)·세로 안내로 멈췄을 때 보이고, 도감은 지금처럼 알약 없이 멈춘다(`soloPause`, 작업 4).
- **③ 한도 단계의 '1~5라운드':** 준비 시간(`phase: 'prep'`, `round: 0`)은 넣지 않는다. 준비 중에는 ①②②′ 중 하나가 거의 늘 맞는다.
- **④ '첫 보스를 잡음':** 그 라운드 `stats`의 `bossKillSeconds`가 null이 아니거나, 첫 보스 라운드 진행 중 보스가 이미 나왔는데(`state.spawned > 0`) 살아 있는 그 라운드 보스가 없을 때(길들인 경우). 작업 2에서 길들임 경로를 시험으로 확인한다.
- **대기실 나가기 뒤 주소:** `/room/<id>`를 `/`로 바꾸고(`history.replaceState`) 그 방의 저장 키를 지운다(`clearSession`). 첫 화면은 초대 화면이 아니라 '방 만들기' 화면으로 그린다.
- **세로 안내가 뜰 때 초점:** '이대로 보기'로 옮기고, 안내가 사라질 때 초점이 안에 있으면 푼다. 떠 있는 동안 게임 키는 무시한다(단추의 기본 Enter/Space는 그대로).

## Review Focus

시험이 직접 겨누지 않는데 사람이 쓰다 부딪히기 쉬운 것. 줄마다 시험을 그 코드를 맡은 작업에 넣었다.

1. **다시 온 사람(닉네임 기억)이 Enter 한 번으로 방을 만듦:** '처음이라면'은 접혀 있고, 난이도 단추가 단추 순서상 먼저 와도 Enter가 '방 만들기' 제출로 간다. → 작업 5 시험 '이름이 있으면 접힌 채 Enter로 바로 방을 만든다'.
2. **나가기 뒤 옛 연결의 'left'(4000)가 늦게 옴, 같은 초대 링크로 다시 들어옴:** 첫 화면에 '서버에 연결하지 못했습니다'가 뜨면 안 되고, 다시 들어올 때 '자리를 되찾지 못했습니다'가 아니라 닉네임 칸이 나와야 한다. → 작업 6 시험 '나간 뒤 늦은 left는 첫 화면을 건드리지 않고 저장 키가 지워진다'.
3. **P로 멈춘 채 메뉴 → 확인 창 → 취소 → 닫기:** 닫은 뒤에도 P 멈춤과 덮개가 그대로여야 한다. → 작업 7 시험 'P 멈춤에서 확인 창까지 갔다 돌아와도 P 멈춤이 남는다'.
4. **첫 보스를 길들임으로 처리:** 10라운드 안에 보스가 사라졌는데 '10라운드 보스는 …' 한 마디가 남으면 안 된다. → 작업 2 시험 '길들여 사라진 첫 보스는 ④를 끝낸다'.
5. **처음부터 세로로 연 솔로:** 첫 그리기부터 안내가 뜨고 준비 15초가 흐르지 않아야 한다. → 작업 9 시험 '세로로 열면 첫 그리기부터 멈춘다'.

---

## 설계 번호와 작업 대응

| 설계 | 내용 | 작업 |
|---|---|---|
| 1-1 제목 | 그대로 | - |
| 1-2 한 줄 소개 | "최대 6명이 함께 잡귀를 막는 협동 랜덤 디펜스", 14px `--ink-dim` | 5 |
| 1-3 '처음이라면' | `<details>`, 머리 28px·13px 굵은 크림, CSS 삼각형, 이름 없으면 펼침(첫 그리기 전에), 다섯 줄 13px·1.5, 숫자는 데이터에서 | 1(문구), 5(화면) |
| 1-4 닉네임 칸 | 그대로 | - |
| 1-5 난이도 줄 | 닉네임 아래·두 버튼 위로, 설명에 '약 N분', `.difficulty-note` 12px, 단추 28px·사이 4px | 1(분), 5(자리·크기) |
| 1-6 두 버튼 | [방 만들기] 금색 주, [혼자 하기] 같은 44px·같은 폭 어두운 보조 `<a>`, 사이 8px | 5 |
| 1-7 음악 출처 | 그대로 | - |
| 1 초점 표시 | 두 버튼·'처음이라면' 머리·난이도 단추 금색 2px·띄움 2px | 5 |
| 1 높이 표 | 640×360 접힘 310px 들어감, 펼침은 스크롤 허용, 1280×720·1920×953·1920×1080 | 10(측정) |
| 2 초대 화면 | 소개·'처음이라면' 같은 자리, [입장하기], 난이도 줄 → "초대받은 방에 들어갑니다 · 난이도는 방장이 정합니다", '혼자 하기' → '처음 화면으로' 13px 밑줄 24px+ | 5 |
| 3-1 제목 | 그대로 | - |
| 3-2 나가기 | '링크 복사' 옆 8px, `net.leave()` → 첫 화면, 확인 창 없음 | 6 |
| 3-3 나온 뒤 알림 | "방을 나왔습니다" fixed 한 줄 4초 | 6 |
| 3-4 난이도 줄 | '약 N분'·12px(1과 같은 함수·클래스) | 1, 5 |
| 3-5 자리 목록 | 방장 줄에 '준비/대기' 없음 | 3(모델), 6(화면) |
| 3-6 버튼 | 방장 [시작] 하나 금색(손님 모두 준비면 켜짐, 혼자면 바로), 꺼지면 흐림+not-allowed. 손님 [준비] 금색 → [준비 취소] 보조. 회색 규칙 `.screen-actions > .big:last-child:not(:only-child)` 지우고 결과 화면 둘째 단추는 `.secondary` | 3(서버·모델), 6(화면·CSS) |
| 3-7 안내 줄 | 한 줄만, 자리 18px 늘 비워 둠, "… · 2/3명 준비", "N명으로 시작합니다 · …", "혼자 시작합니다 · …", 6명 다 차면 빈칸, 손님 "난이도는 방장이 정합니다" 그대로 | 3(문구), 6(자리) |
| 4 첫 판 안내 줄 | ①②②′③④ 조건·문구·뒤에서 빼는 키, 금색 11px 굵게, 고르면 숨김, 도움말 끄면 같이 사라짐, aria-live 아님, 온라인 카드도 | 2 |
| 5-1 순서 | 라운드 · 시간+알약 · 보스 · (밀기) 잡귀+꼬리 · 게이지 · 장승 · 톱니 · 메뉴 | 7(메뉴 자리), 8 |
| 5-1 ① 메뉴 버튼 | 톱니 오른쪽 8px, 11px·높이 22px·폭 약 36px | 7 |
| 5-1 ⑤ 보스 체력 줄임 | 저항 줄이 보이거나 위험 단계면 '보스 N', 전체는 `title` | 4(모델), 8(화면) |
| 5-1 ⑥ '장승' 글자 숨김 | 위험 단계에서 숨김, 초과에서 '장승 무너짐' (B3에서 들어감, 화면 시험만 더함) | 8 |
| 5-1 측정 | 가장 긴 상태 약 607px / 638px | 10 |
| 5-2-1 메뉴 창 | '메뉴'(12px)+[닫기], [다시 시작][처음 화면으로] 24px·사이 8px·11px, 안내 한 줄, 열린 동안 멈춤(P와 따로) | 4(멈춤), 7 |
| 5-2-2 확인 창 | 문구 둘, 초점 '취소', 위험 왼쪽·취소 오른쪽, `.danger` | 7 |
| 5-2-3 층·잠금 | 5층, 2·3층 inert, P 멈춤 위 메뉴, 실패 장면이 잠그는 창을 닫고 그 안 초점을 푼다(온라인 메뉴) | 7 |
| 5-2-4 Esc | 확인 창 Esc = 취소 → 메뉴, 메뉴 Esc = 닫기 | 7 |
| 5-2-5 멈춤 표시 | 메뉴로만 멈추면 덮개 없음·알약 있음 | 4(모델), 7, 8 |
| 5-2-6 동작 | `restart`·`home` 액션 그대로, 판 도중 다시 시작은 기록 안 보냄 | 7 |
| 5-2-7 난이도 | 메뉴에 난이도 고르기 없음 | 7(만들지 않음) |
| 6 세로 안내 | 세로이고 폭 < 640일 때 전체 덮음, 22px 금색·15px·44px 단추, 솔로 멈춤(덮개 없음)·온라인 계속, 8층, 판·2·3층 inert, '이대로 보기'는 그 페이지에서 다시 안 띄움, `#screen`이 보이면 안 띄움 | 4(판정), 9 |
| 확인 방법(브라우저) | 창 크기별 첫 화면, 대기실 1·2명, 안내 줄 1~10라운드, 상단 줄 가장 긴 상태, 메뉴, 세로 흉내, 온라인 메뉴 중 관문 실패 | 10 |

---

## 파일 지도

- Create `packages/client/src/ui/first-visit.ts` — `SUMMON_TOKENS`, `firstBossRound`, `playMinutes`, `firstVisitRules`, `firstTip`, 세로 안내 문구.
- Create `packages/client/src/ui/solo-menu.ts` — `soloMenuHtml` (메뉴 창·확인 창 둘).
- Modify `packages/client/src/ui/difficulty.ts` — `difficultyRuleText`에 '약 N분'.
- Modify `packages/client/src/ui/panels.ts` — `HelpContext.tip`, `helpLineHtml`, `renderBottom`.
- Modify `packages/client/src/ui/models.ts` — `HudModel.bossText`·`bossTitle`.
- Modify `packages/client/src/ui/windows.ts` — `soloPause`, `portraitGuide`.
- Modify `packages/client/src/ui/hud.ts` — 보스 글, 알약 인자, 메뉴 단추.
- Modify `packages/client/src/ui/mount.ts` — 솔로 메뉴·확인 창, 멈춤 이유, 실패 장면 초점, 세로 안내.
- Modify `packages/client/src/ui/result.ts`, `packages/client/src/online/result.ts` — 둘째 단추 `.secondary`.
- Modify `packages/client/src/online/entry.ts`, `online/text.ts`, `online/lobby.ts`, `online/app.ts` — 첫 화면·초대 화면·대기실·나가기.
- Modify `packages/client/src/ui/style.css` — 각 작업의 규칙(배율 규칙 두 줄은 그대로).
- Modify `packages/server/src/core/RoomCore.ts` `onStart`, `packages/server/test/lobby.test.ts`, `packages/server/test/stage-choice.test.ts`.
- Tests (client): 새 `test/first-visit.test.ts`, `test/first-tip.test.ts`, `test/solo-menu-ui.test.ts`, `test/portrait-ui.test.ts`; 고침 `test/next-keys.test.ts`, `test/copy-terms.test.ts`, `test/online-entry.test.ts`, `test/stage-choice.test.ts`, `test/online-app.test.ts`, `test/hud-levels.test.ts`, `test/windows.test.ts`.

---

### Task 1: 판 길이와 '처음이라면' 문구 (순수 함수)

설계: 1-3(문구), 1-5·3-4(판 길이).

**Files:**
- Create: `packages/client/src/ui/first-visit.ts`
- Modify: `packages/client/src/ui/difficulty.ts` (`difficultyRuleText`)
- Test: `packages/client/test/first-visit.test.ts`

**Interfaces:**
- Produces:
  - `export const SUMMON_TOKENS = 1;`
  - `export function firstBossRound(data: GameData): number | null` — `waves` 중 `type === 'boss'`인 가장 작은 `round`, 없으면 null.
  - `export function playMinutes(data: GameData, rounds: number): number` — `prepSeconds` + 1..rounds 라운드 초 합(그 라운드 wave가 boss면 `bossRoundSeconds`, 아니면 `roundSeconds`)을 분으로 바꿔 5분 단위 반올림.
  - `export function firstVisitRules(data: GameData = loadGameData('stage3'), seats = 6): string[]` — 다섯 줄.
  - `difficultyRuleText(difficulty, data?)` → `"${rounds}라운드 · 약 ${playMinutes(data, rounds)}분 · 적 체력 ${pct}%"` (시그니처 그대로).

- [ ] **Step 1: 실패하는 시험 쓰기** — `test/first-visit.test.ts`

```ts
test('the difficulty note gives the game length in five-minute steps', () => {
  expect(difficultyRuleText('easy')).toBe('60라운드 · 약 40분 · 적 체력 80%');
  expect(difficultyRuleText('normal')).toBe('70라운드 · 약 45분 · 적 체력 90%');
  expect(difficultyRuleText('hard')).toBe('70라운드 · 약 45분 · 적 체력 100%');
  const data = loadGameData('stage3');
  expect(playMinutes(data, 60)).toBe(40);   // 15 + 6×75 + 54×34 = 2301 s
  expect(playMinutes(data, 70)).toBe(45);   // 15 + 7×75 + 63×34 = 2682 s
});

test('the first-visit lines read their numbers from the data', () => {
  expect(firstVisitRules()).toEqual([
    'Space(뚝딱!)를 누르면 도깨비불 1개로 유닛 하나를 뽑습니다.',
    '재료가 모인 유닛을 고르고 Z로 조합하면 등급이 오릅니다.',
    '길 위 잡귀가 60마리를 넘긴 채 5초가 지나면 집니다.',
    '10라운드마다 나오는 보스는 그 라운드 안에 잡아야 합니다.',
    '방을 만들어 링크를 보내면 최대 6명이 함께 합니다.',
  ]);
  const changed = makeData(d => { d.balance.limit = 50; d.balance.limitSeconds = 7; }, 'stage3');
  expect(firstVisitRules(changed)[2]).toBe('길 위 잡귀가 50마리를 넘긴 채 7초가 지나면 집니다.');
  expect(firstBossRound(loadGameData('stage3'))).toBe(10);
  expect(firstBossRound(makeData(d => { d.waves = d.waves.filter(w => w.type !== 'boss'); }, 'stage3'))).toBeNull();
});
```

(`makeData`는 `@dorandi/logic/testing`에 있다.) 보스가 없는 데이터에서 넷째 줄은 빼고 네 줄을 돌려준다 — 시험에 `toHaveLength(4)`도 넣는다.

- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/first-visit.test.ts` → FAIL (모듈 없음, 판 길이 없는 문구).
- [ ] **Step 3: 구현** — 위 Interfaces대로. `difficultyRuleText`는 `rule?.rounds ?? data.balance.rounds`를 `playMinutes`에 넘긴다. `firstVisitRules`의 '10라운드마다'는 `firstBossRound`, 60·5는 `balance.limit`·`limitSeconds`, 1개는 `SUMMON_TOKENS`, 6은 `seats`.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm test`, `npm run typecheck`. `difficultyRuleText` 문구를 기대하던 다른 시험이 있으면 새 문구로 고친다(`grep -rn "라운드 · 적 체력" packages/client/test`).
- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/ui/first-visit.ts packages/client/src/ui/difficulty.ts packages/client/test/first-visit.test.ts
git commit -m "Say how long each difficulty takes and word the first-visit rules from the data"
```

끝난 기준: 세 난이도 설명이 '약 40분'·'약 45분'을 내고, 다섯 줄의 숫자가 데이터를 바꾸면 따라 바뀐다.

---

### Task 2: 첫 판 안내 한 마디 (모델 + 하단 줄)

설계: 4번 전부(단계 표, 빼는 키, 숨김 조건, 숫자 출처, 옛 솔로).

**Files:**
- Modify: `packages/client/src/ui/first-visit.ts` (`firstTip`)
- Modify: `packages/client/src/ui/panels.ts` (`HelpContext`, `helpLineHtml`, `renderBottom`)
- Modify: `packages/client/src/ui/style.css` (`#bottom .hint .tip`)
- Test: `packages/client/test/first-tip.test.ts`; 고침 `test/next-keys.test.ts`('an empty board still opens with how to summon'), `test/copy-terms.test.ts:228`

**Interfaces:**
- Consumes: Task 1 `SUMMON_TOKENS`(쓰지 않아도 됨), `firstBossRound(data)`; `nextCombines(state).counts.all`(B1 '지금 가능' 수); `countNormalEnemies(state)`; `unitDefFast(data, defId).grade`.
- Produces:
  - `export type TipStep = 'summon' | 'combine' | 'short' | 'limit' | 'boss';`
  - `export type TipKey = 'W' | 'Space' | 'G';`
  - `export interface FirstTip { step: TipStep; text: string; drop: TipKey[] }`
  - `export function firstTip(state: GameState, canCombine: boolean): FirstTip | null`
  - `HelpContext`: `empty?: boolean`를 지우고 `tip?: FirstTip | null`을 넣는다. 고른 유닛이 있거나 옮기는 중이면 `tip`은 무시한다.

단계(위에서부터 처음 맞는 하나, 문구 그대로):

| step | 조건 | text | drop |
|---|---|---|---|
| summon | `slots`와 `storage`에 유닛이 하나도 없음 | `Space나 뚝딱!으로 유닛을 뽑으세요 (도깨비불 ${tokens}개)` | W, Space, G |
| combine | 판·보관함에 2등급 이상 없음, `canCombine` | `W로 재료 유닛을 고르고 Z로 조합합니다 · 왼쪽 목록 맨 위부터` | W |
| short | 2등급 이상 없음, `!canCombine` | `조합할 재료가 아직 모자랍니다 · Space로 더 뽑으세요 (도깨비불 ${tokens}개)` | Space |
| limit | `phase === 'round'`, `1 ≤ round ≤ 5` | `잡귀가 ${limit}마리를 넘긴 채 ${limitSeconds}초가 지나면 집니다 · 지금 ${n}마리` | - |
| boss | 첫 보스 라운드 fb가 있고 `fb − 2 ≤ round ≤ fb`, `phase === 'round'`, 첫 보스를 아직 안 잡음('이 계획에서 정한 것') | `${fb}라운드 보스는 그 라운드 안에 잡아야 합니다` | - |

- [ ] **Step 1: 실패하는 시험 쓰기** — `test/first-tip.test.ts`. 상태는 `createGame(withoutMarketLock(loadGameData('stage3')), 1)`, 유닛은 `placeUnitForTest`, 라운드는 `forceRound`, 적은 `spawnEnemyForTest`(모두 `@dorandi/logic/testing`). 1등급 id 둘·2등급 id 하나는 `data.units`에서 grade로 고른다.

```ts
test('an empty board and storage: summon, with the tokens in hand', () => {
  const s = game(); s.tokens = 4;
  expect(firstTip(s, false)).toEqual({ step: 'summon', text: 'Space나 뚝딱!으로 유닛을 뽑으세요 (도깨비불 4개)', drop: ['W', 'Space', 'G'] });
});
test('a grade 1 unit only in storage is not an empty board', () => { /* storage = [unit] → step 'short' */ });
test('grade 1 only: combine when a recipe is ready, short when none', () => {
  // placeUnitForTest(s, g1, 0)
  expect(firstTip(s, true)).toEqual({ step: 'combine', text: 'W로 재료 유닛을 고르고 Z로 조합합니다 · 왼쪽 목록 맨 위부터', drop: ['W'] });
  s.tokens = 2;
  expect(firstTip(s, false)).toEqual({ step: 'short', text: '조합할 재료가 아직 모자랍니다 · Space로 더 뽑으세요 (도깨비불 2개)', drop: ['Space'] });
});
test('with a grade 2 unit: the limit line in rounds 1-5, nothing in 6-7, the boss line in 8-10 until it is caught', () => {
  // grade 2 at slot 0; forceRound(s, 5); two enemies spawned
  expect(firstTip(s, false)).toEqual({ step: 'limit', text: '잡귀가 60마리를 넘긴 채 5초가 지나면 집니다 · 지금 2마리', drop: [] });
  forceRound(s, 6); expect(firstTip(s, false)).toBeNull();
  forceRound(s, 7); expect(firstTip(s, false)).toBeNull();
  forceRound(s, 8); expect(firstTip(s, false)?.text).toBe('10라운드 보스는 그 라운드 안에 잡아야 합니다');
  forceRound(s, 10); expect(firstTip(s, false)?.step).toBe('boss');
  s.stats.find(r => r.round === 10)!.bossKillSeconds = 30;
  expect(firstTip(s, false)).toBeNull();
  forceRound(s, 11); expect(firstTip(s, false)).toBeNull();
});
test('a first boss tamed away ends the boss line (review focus 4)', () => {
  // round 10, s.spawned > 0, no boss enemy of round 10 left, bossKillSeconds still null → null
});
test('the old 20-round data and data without bosses', () => {
  // loadGameData() (stage1): limit/limitSeconds from its balance in the limit line
  // makeData(d => { d.waves = d.waves.filter(w => w.type !== 'boss') }, 'stage3'), round 8 → null
});
test('the help line puts the tip first and drops the keys it names', () => {
  const tip = firstTip(emptyGame(4), false);
  expect(text(helpLineHtml('B 장터', { quests: true, pause: true, tip }))).toBe(
    'Space나 뚝딱!으로 유닛을 뽑으세요 (도깨비불 4개) · E 강화 · D 도감 · Q 이 유닛/전체 · B 장터 · J 퀘스트 · P 멈춤');
  const combine = { step: 'combine', text: 'W로 재료 유닛을 고르고 Z로 조합합니다 · 왼쪽 목록 맨 위부터', drop: ['W'] } as const;
  expect(text(helpLineHtml('B 장터', { quests: true, pause: true, tip: combine }))).toBe(
    'W로 재료 유닛을 고르고 Z로 조합합니다 · 왼쪽 목록 맨 위부터 · Space 소환 · E 강화 · D 도감 · Q 이 유닛/전체 · G 1·2등급 보관 · B 장터 · J 퀘스트 · P 멈춤');
  expect(text(helpLineHtml('B 장터', { online: true, quests: true, tip: combine }))).toBe(
    'W로 재료 유닛을 고르고 Z로 조합합니다 · 왼쪽 목록 맨 위부터 · Space 소환 · E 강화 · D 도감 · Q 도우미 · G 1·2등급 보관 · B 장터 · J 퀘스트');
  expect(helpLineHtml(undefined, { tip: combine })).toContain('<b class="tip">');
  expect(helpLineHtml(undefined, { tip: combine })).not.toContain('aria-live');
  expect(text(helpLineHtml(undefined, { selected: true, tip: combine }))).toBe(
    'Z/X/C 조합(판에 짝 표시) · S 판매 · Tab 상세 · M 옮기기 · W 다음 조합 · Esc 해제');
});
test('renderBottom: the tip follows the board, hides on a selection and with the help line off', () => {
  // document.body.innerHTML = STAGE_HTML; renderBottom(emptyState, null) → #bottom starts with 'Space나 뚝딱!'
  // renderBottom(state, 0) (a unit selected) → no .tip
  // renderBottom(emptyState, null, false, null) → #bottom is empty
});
```

`test/next-keys.test.ts`의 'an empty board still opens with how to summon'은 `tip` 기준으로 바꾸고(위 첫 기대값), `copy-terms.test.ts:228`은 `firstTip` 문구로 바꾼다. 기존 줄 시험(`{ pause: true }` 등, tip 없음)은 그대로 통과해야 한다.

- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/first-tip.test.ts packages/client/test/next-keys.test.ts` → FAIL.
- [ ] **Step 3: 구현**
  - `firstTip`은 `first-visit.ts`에. drop 키 이름은 `helpLineHtml`의 줄 글과 맞춘다: W → `'W 다음 조합 고르기'`, Space → `'Space 소환'`, G → `` `${STORE_ALL_KEY} 1·2등급 보관` ``.
  - `helpLineHtml`: 아무것도 고르지 않았을 때만 `tip.drop`에 든 키를 빼고, 맨 앞에 `<b class="tip">${esc(tip.text)}</b>`를 둔 뒤 ` · `로 잇는다.
  - `renderBottom`: `selected === null && !moving`일 때 `firstTip(state, nextCombines(state).counts.all > 0)`을 `tip`으로 넘긴다. `empty:`를 넘기던 곳은 지운다. 도움말이 꺼져 있으면(`hotkeys === null`) 지금처럼 빈 줄.
  - CSS: `#bottom .hint .tip { color: var(--accent); font-size: 11px; font-weight: bold; }`. 줄 높이 28px(솔로)·44px 카드(온라인)는 그대로.
- [ ] **Step 4: 통과 확인** — 위 명령 PASS, `npm test`, `npm run typecheck`. `grep -rn "empty:" packages/client/src/ui/panels.ts`로 옛 인자가 남지 않았는지.
- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/ui/first-visit.ts packages/client/src/ui/panels.ts packages/client/src/ui/style.css packages/client/test/first-tip.test.ts packages/client/test/next-keys.test.ts packages/client/test/copy-terms.test.ts
git commit -m "Open the help line with what to do now on the first rounds"
```

끝난 기준: 단계 표의 경계(유닛 0개 / 1등급만·조합 가능 / 1등급만·조합 불가 / 5·6·7라운드 / 8·10라운드 / 보스 잡은 뒤 / 길들인 뒤)가 시험으로 고정되고, 솔로 'Q 이 유닛/전체'·온라인 'Q 도우미'가 그대로다.

---

### Task 3: 방장은 준비하지 않는다 (서버 + 대기실 모델)

설계: 3-5, 3-6(서버 안 B·켜지는 조건), 3-7(문구).

**Files:**
- Modify: `packages/server/src/core/RoomCore.ts` (`onStart`, 413~416줄 근처)
- Modify: `packages/server/test/lobby.test.ts` ('start needs host and everyone ready…', 'one player can start alone', 'after start a new name cannot join', 'seed option…'), `packages/server/test/stage-choice.test.ts` ('a legacy ready only consents to a 20-round room')
- Modify: `packages/client/src/online/lobby.ts` (`lobbyModel`, `LobbyRow`, `LobbyModel`, `SEATS` export)
- Modify: `packages/client/src/online/text.ts` (새 문구 함수)
- Test: `packages/client/test/online-entry.test.ts`('lobby model' 옆에 새 시험)

**Interfaces:**
- Produces:
  - 서버: `onStart`는 `s.seat !== this.hostSeat`인 자리만 준비를 본다. 방장이 보낸 준비 메시지는 지금처럼 받는다(옛 클라이언트).
  - `export const SEATS = 6;` (`online/lobby.ts`)
  - `LobbyRow`에 `showState: boolean`(방장 줄 false).
  - `LobbyModel`: `canStart`(방장이고 손님이 모두 준비, 혼자면 true), `hint: string`(''이면 빈 자리), `guests: number`, `readyGuests: number`. `myReady`·`isHost`·`difficulty`·`stage`는 그대로.
  - `text.ts`: `startHintText(ready: number, guests: number): string` → `모두 준비하면 시작할 수 있습니다 · ${ready}/${guests}명 준비`, `startFewText(players: number): string` → 1이면 `혼자 시작합니다 · 시작하면 더 들어올 수 없습니다`, 아니면 `${players}명으로 시작합니다 · 시작하면 더 들어올 수 없습니다`. `TEXT.startHint`는 지운다(참조 grep).

- [ ] **Step 1: 실패하는 시험 쓰기**
  - 서버 `lobby.test.ts`: 이름을 'start needs the host and every guest ready; the host itself never readies; double start makes one match'로. 방장 준비 없이 `start` → b 미준비라 `notReady`, b 준비 → `start` 두 번 → `phase 'playing'`, `full` 한 번, `ring [1, 2]`. 'one player can start alone'은 `ready` 없이 `start` → `ring [1]`. 나머지 시험의 방장 `ready`는 지워도 되고 둬도 된다(둘 다 통과해야 함).
  - 서버 `stage-choice.test.ts` 'a legacy ready only consents to a 20-round room': `lobby(2)`로 바꾸고 손님 b가 stage3 방에서 옛 준비(`{ ready: true }`)를 보냄 → `start` → `phase 'lobby'`; stage2로 바꾸고 b 옛 준비 → `start` → `'playing'`. 방장 a는 준비를 보내지 않는다.
  - 클라이언트:

```ts
test('lobby model: the host never readies, the hint counts the guests', () => {
  const seats = (...r: boolean[]) => r.map((ready, i) => ({ seat: i + 1, name: `p${i + 1}`, ready }));
  const alone = lobbyModel({ roomId: 'r', you: 1, hostSeat: 1, seats: seats(false) });
  expect(alone).toMatchObject({ canStart: true, hint: '혼자 시작합니다 · 시작하면 더 들어올 수 없습니다' });
  expect(alone.rows[0]!.showState).toBe(false);
  const waiting = lobbyModel({ roomId: 'r', you: 1, hostSeat: 1, seats: seats(false, true, false) });
  expect(waiting).toMatchObject({ canStart: false, guests: 2, readyGuests: 1, hint: '모두 준비하면 시작할 수 있습니다 · 1/2명 준비' });
  expect(lobbyModel({ roomId: 'r', you: 1, hostSeat: 1, seats: seats(false, true, true) }))
    .toMatchObject({ canStart: true, hint: '3명으로 시작합니다 · 시작하면 더 들어올 수 없습니다' });
  expect(lobbyModel({ roomId: 'r', you: 1, hostSeat: 1, seats: seats(false, true, true, true, true, true) }))
    .toMatchObject({ canStart: true, hint: '' });
  const guest = lobbyModel({ roomId: 'r', you: 2, hostSeat: 1, seats: seats(false, false) });
  expect(guest).toMatchObject({ isHost: false, canStart: false, hint: '' });
  expect(guest.rows[1]!.showState).toBe(true);
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run packages/server/test/lobby.test.ts packages/server/test/stage-choice.test.ts packages/client/test/online-entry.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 서버 한 줄, `lobbyModel`·문구 함수. `renderLobby`는 이 작업에서 `m.hint`가 빈 문자열이면 줄을 그리지 않는 정도로만 맞춘다(화면은 작업 6).
- [ ] **Step 4: 통과 확인** — 위 명령 PASS, `npm test`, `npm run typecheck`. `grep -rn "startHint" packages/client`로 옛 참조가 없는지.
- [ ] **Step 5: 커밋**

```bash
git add packages/server/src/core/RoomCore.ts packages/server/test/lobby.test.ts packages/server/test/stage-choice.test.ts packages/client/src/online/lobby.ts packages/client/src/online/text.ts packages/client/test/online-entry.test.ts
git commit -m "Let the host start without readying and count the ready guests in the lobby hint"
```

끝난 기준: 서버는 손님만 보고 시작하고, 모델은 다섯 경우(혼자 / 손님 일부 준비 / 2~5명 모두 준비 / 6명 모두 준비 / 손님 화면)의 `canStart`·`hint`를 낸다.

---

### Task 4: 보스 체력 줄이기·멈춤 이유·세로 판정 (순수 함수)

설계: 5-1 ⑤, 5-2-1·5-2-5(멈춤), 6(판정).

**Files:**
- Modify: `packages/client/src/ui/models.ts` (`HudModel`, `hudModel`)
- Modify: `packages/client/src/ui/windows.ts` (`soloPause`, `portraitGuide`)
- Test: `packages/client/test/hud-levels.test.ts`, `packages/client/test/windows.test.ts`

**Interfaces:**
- Produces:
  - `HudModel`에 `bossText: string | null; bossTitle: string | null`. 살아 있는 보스(`state.enemies.find(e => e.boss && e.hp > 0)`)가 없으면 둘 다 null. 줄이는 조건 `resistText !== null || level === 'danger'`이면 `보스 ${hp}`, 아니면 `보스 체력 ${hp} / ${maxHp}`. `bossTitle`은 늘 `보스 체력 ${hp} / ${maxHp}`.
  - `export const MENU_MODALS = ['menu', 'restartAsk', 'homeAsk'] as const;`
  - `export interface PauseInput { userPaused: boolean; modal: string | null; ended: boolean; portrait: boolean }`
  - `export function soloPause(i: PauseInput): { paused: boolean; pill: boolean; cover: boolean }` — `menu = MENU_MODALS.includes(modal)`; `paused = userPaused || (!ended && (modal === 'dex' || menu || portrait))`; `pill = !ended && (userPaused || menu || portrait)`; `cover = userPaused && !ended`.
  - `export function portraitGuide(i: { portrait: boolean; width: number; dismissed: boolean; screenOpen: boolean }): boolean` — `portrait && width < 640 && !dismissed && !screenOpen`.

- [ ] **Step 1: 실패하는 시험 쓰기**

```ts
// hud-levels.test.ts — boss enemy via spawnEnemyForTest with hp 18400 / maxHp 24000
test('the boss reads in full until the resist line or the danger step needs the room', () => {
  expect(pick(round10WithBoss(31))).toEqual({ bossText: '보스 체력 18400 / 24000', bossTitle: '보스 체력 18400 / 24000' });
  expect(pick(round10WithBoss(58)).bossText).toBe('보스 18400');            // danger
  expect(pick(round10WithBoss(63)).bossText).toBe('보스 체력 18400 / 24000'); // over keeps it in full
  expect(pick(round61WithBoss(10)).bossText).toBe('보스 18400');            // resist line shown
  expect(hudModel(noBoss()).bossText).toBeNull();
});
// windows.test.ts
test('soloPause: what stops the solo clock, draws the pill and the cover', () => {
  const p = (o: Partial<PauseInput>) => soloPause({ userPaused: false, modal: null, ended: false, portrait: false, ...o });
  expect(p({})).toEqual({ paused: false, pill: false, cover: false });
  expect(p({ userPaused: true })).toEqual({ paused: true, pill: true, cover: true });
  expect(p({ modal: 'menu' })).toEqual({ paused: true, pill: true, cover: false });
  expect(p({ modal: 'homeAsk' })).toEqual({ paused: true, pill: true, cover: false });
  expect(p({ modal: 'dex' })).toEqual({ paused: true, pill: false, cover: false });
  expect(p({ modal: 'settings' })).toEqual({ paused: false, pill: false, cover: false });
  expect(p({ portrait: true })).toEqual({ paused: true, pill: true, cover: false });
  expect(p({ userPaused: true, modal: 'menu' })).toEqual({ paused: true, pill: true, cover: true });
  expect(p({ ended: true, modal: 'menu', portrait: true })).toEqual({ paused: false, pill: false, cover: false });
});
test('portraitGuide: portrait and narrower than the board, not dismissed, no outer screen', () => {
  const g = (o: object) => portraitGuide({ portrait: true, width: 390, dismissed: false, screenOpen: false, ...o });
  expect(g({})).toBe(true);
  expect(g({ width: 640 })).toBe(false);
  expect(g({ portrait: false, width: 390 })).toBe(false);
  expect(g({ dismissed: true })).toBe(false);
  expect(g({ screenOpen: true })).toBe(false);
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/hud-levels.test.ts packages/client/test/windows.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces대로. `hud.ts`는 아직 바꾸지 않는다(작업 8).
- [ ] **Step 4: 통과 확인** — 위 명령 PASS, `npm test`, `npm run typecheck`.
- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/ui/models.ts packages/client/src/ui/windows.ts packages/client/test/hud-levels.test.ts packages/client/test/windows.test.ts
git commit -m "Model the short boss label, the solo pause reasons and the portrait guide as pure rules"
```

끝난 기준: 위 표의 모든 조합이 시험으로 고정된다. 화면은 아직 그대로다.

---

### Task 5: 첫 화면과 초대 화면

설계: 1-2·1-3·1-5·1-6, 1 초점 표시, 2.

**Files:**
- Modify: `packages/client/src/online/entry.ts` (`renderEntry`)
- Modify: `packages/client/src/online/text.ts` (`tagline`, `firstTime`, `inviteNote`, `home`)
- Modify: `packages/client/src/ui/style.css` (318~355줄 근처 첫 화면 규칙, `.difficulty-note`, `.difficulty-picker`)
- Test: `packages/client/test/online-entry.test.ts`, `packages/client/test/stage-choice.test.ts`('the start screen labels its difficulty row…')

**Interfaces:**
- Consumes: Task 1 `firstVisitRules()`, `difficultyNote`·`difficultyPicker`(그대로).
- Produces (DOM, 위에서 아래로):
  - 만들기 화면: `.screen-box.entry` > `h1.screen-title` · `p.entry-tagline` · `details.entry-first`(`open`은 `!opts.name`일 때, 붙이기 전에 정함) > `summary`('처음이라면') + `ul.entry-rules` > `li`×다섯 · `form.entry-form` > `label.entry-label`(닉네임) · `div.entry-difficulty-block` > (`div.entry-difficulty` > `span.entry-difficulty-label`('난이도') + 단추 묶음) + `.difficulty-note` · `div.screen-actions.entry-actions` > `button.big[type=submit]`('방 만들기') + `a.big.secondary.entry-solo[href="/solo?rounds=70&difficulty=…"]`('혼자 하기') · `div.entry-error` · `footer.entry-credits`.
  - 초대 화면(`opts.roomId`): 위와 같되 난이도 묶음 대신 `p.entry-invite`('초대받은 방에 들어갑니다 · 난이도는 방장이 정합니다'), 단추 줄에 `button.big[type=submit]`('입장하기')만, 폼 뒤 `a.entry-home[href="/"]`('처음 화면으로').
  - `text.ts`: `tagline: '최대 6명이 함께 잡귀를 막는 협동 랜덤 디펜스'`, `firstTime: '처음이라면'`, `inviteNote: '초대받은 방에 들어갑니다 · 난이도는 방장이 정합니다'`, `home: '처음 화면으로'`. 소개의 6은 `SEATS`로 만들어도 된다.

- [ ] **Step 1: 실패하는 시험 쓰기** — `online-entry.test.ts`

```ts
test('a first visit opens 처음이라면 with the five rules; a remembered name keeps it folded', () => {
  const root = document.createElement('div');
  renderEntry(root, { onSubmit: async () => {} });
  const first = root.querySelector<HTMLDetailsElement>('details.entry-first')!;
  expect(first.open).toBe(true);
  expect(first.querySelector('summary')!.textContent).toBe('처음이라면');
  expect([...first.querySelectorAll('li')].map(li => li.textContent)).toEqual(firstVisitRules());
  expect(root.querySelector('.entry-tagline')!.textContent).toBe('최대 6명이 함께 잡귀를 막는 협동 랜덤 디펜스');
  renderEntry(root, { name: '하나', onSubmit: async () => {} });
  expect(root.querySelector<HTMLDetailsElement>('details.entry-first')!.open).toBe(false);
});
test('one difficulty row above both buttons; the solo link follows the pick', () => {
  // the order of children in the form: label, .entry-difficulty-block, .entry-actions
  // exactly one .entry-difficulty; .entry-actions has button[type=submit] '방 만들기' then a.entry-solo '혼자 하기'
  // click [data-difficulty="hard"] → a.entry-solo href ends with '/solo?rounds=70&difficulty=hard'
  // .difficulty-note text is difficultyRuleText('hard')
});
test('the invite screen: no difficulty row, no solo link, a way home', () => {
  // renderEntry(root, { roomId: 'r1', onSubmit }) → no [data-difficulty], no a[href^="/solo"]
  // .entry-invite text '초대받은 방에 들어갑니다 · 난이도는 방장이 정합니다'
  // button[type=submit] '입장하기'; a.entry-home href '/' text '처음 화면으로'; details.entry-first present
});
test('a remembered name makes a room with one Enter (review focus 1)', async () => {
  // renderEntry(root, { name: '하나', onSubmit: spy }); form submit → spy called once with ('하나', 'normal')
});
```

  기존 시험 고침: 'submitting twice …'의 `root.querySelector('button')`은 `button[type="submit"]`으로, 'the normal solo link …'의 `.entry-link`는 `a.entry-solo`로.
- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/online-entry.test.ts packages/client/test/stage-choice.test.ts` → FAIL.
- [ ] **Step 3: 구현**
  - `renderEntry`를 위 DOM 순서로 다시 짠다. 제출·IME·`onSolo` 클릭 처리는 그대로 옮긴다. `drawSolo`는 난이도 묶음만 다시 그리고 `a.entry-solo`의 href를 바꾼다.
  - CSS: `.entry-tagline { margin: -4px 0 0; text-align: center; font-size: 14px; color: var(--ink-dim); }`; `details.entry-first > summary { min-height: 28px; display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: bold; color: var(--ink); cursor: pointer; list-style: none; }`, `::-webkit-details-marker { display: none }`, 삼각형은 `summary::before`의 border(닫힘 오른쪽, `[open]` 아래); `.entry-rules { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.5; }`; `.difficulty-note` 11px → 12px; `.difficulty-picker` gap 3px → 4px(단추 28px 그대로); `.entry-actions { gap: 8px }`, 두 칸 `flex: 1`; `.screen-box a.big { display: flex; align-items: center; justify-content: center; min-height: 44px; text-decoration: none; … }`; `.big.secondary { background: #2a2236; color: var(--ink); border-color: #574a65; }`(작업 6이 결과 화면에 씀); `.entry-invite { margin: 0; text-align: center; font-size: 13px; color: var(--ink-dim); }`; `.entry-home { align-self: center; display: inline-flex; align-items: center; min-height: 24px; font-size: 13px; color: var(--ink-dim); text-decoration: underline; }`; `.screen-box :is(button, a.big, summary):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`(닉네임 칸은 지금처럼 테두리). 안 쓰게 된 `.entry-solo`(div)·`.entry-solo .entry-link` 규칙은 지운다. `.entry-link` 규칙 자체는 남긴다(`online/app.ts:171` 메시지 화면의 새 방 링크, `online/result.ts:161`이 쓴다). 새 `a.entry-solo`는 `<a>`라 클래스 이름만 같고 규칙은 따로다.
  - 640×360 접힘에서 스크롤 없이 단추가 보이게 간격을 잡는다. 실제 높이는 작업 10에서 잰다.
- [ ] **Step 4: 통과 확인** — 위 명령 PASS, `npm test`, `npm run typecheck`. `grep -rn "entry-link\|entry-solo" packages/client/src packages/client/test`.
- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/online/entry.ts packages/client/src/online/text.ts packages/client/src/ui/style.css packages/client/test/online-entry.test.ts packages/client/test/stage-choice.test.ts
git commit -m "Say what the game is on the start screen, fold the first-visit rules and set two equal buttons under one difficulty row"
```

끝난 기준: 처음 온 사람은 펼쳐진 다섯 줄을, 다시 온 사람은 접힌 화면에서 Enter 한 번으로 방을 만든다. 초대 화면에는 난이도 줄과 '혼자 하기'가 없다.

---

### Task 6: 대기실 단추·안내 줄·나가기

설계: 3-2·3-3·3-5·3-6·3-7, 결과 화면 둘째 단추.

**Files:**
- Modify: `packages/client/src/online/lobby.ts` (`renderLobby`, `LobbyActions.leave`)
- Modify: `packages/client/src/online/app.ts` (`showLobby`의 actions, 나가기 흐름, `roomId` 변수, 알림)
- Modify: `packages/client/src/online/text.ts` (`leave: '나가기'`, `left: '방을 나왔습니다'`)
- Modify: `packages/client/src/ui/result.ts:55`, `packages/client/src/online/result.ts:131~135` (둘째 단추 `.secondary`)
- Modify: `packages/client/src/ui/style.css` (320줄 회색 규칙 지움, `.lobby-tools`, `.lobby-start-hint`, `.lobby .big:disabled`, `.screen-toast`)
- Test: `packages/client/test/stage-choice.test.ts` 또는 `online-entry.test.ts`(renderLobby), `packages/client/test/online-app.test.ts`(나가기), 결과 화면 시험(`result-hierarchy.test.ts`·`online-result-screen.test.ts` 중 단추를 보는 곳)

**Interfaces:**
- Consumes: Task 3 `lobbyModel` → `rows[].showState`, `canStart`, `hint`, `isHost`, `myReady`.
- Produces:
  - `LobbyActions`에 `leave(): void`.
  - DOM: 제목 옆 `div.lobby-tools` > [링크 복사] [나가기](사이 8px). 방장: `.screen-actions` > `button.big`('시작', `disabled = !canStart`)만. 손님: `button.big`(`myReady`면 '준비 취소' + `.secondary`, 아니면 '준비'). 단추 줄 바로 아래 `div.lobby-hint.lobby-start-hint`(늘 있음, 글은 `hint`, 18px 자리). 방장 줄(`showState` false)에는 `.lobby-state`를 그리지 않는다. 손님의 '난이도는 방장이 정합니다'는 지금 자리 그대로.
  - app 나가기: `screen = 'entry'`로 먼저 바꾸고 옛 `net`을 떼어 낸 뒤 `clearSession(id)`, `history.replaceState(null, '', '/')`, 지역 `roomId = undefined`(그 뒤 `showEntry`·`submit`이 이 값을 씀), `void old.leave().catch(() => undefined)`, `showEntry()`, `showToast(TEXT.left)`.
  - `showToast(text: string)`: `document.body`에 `div.screen-toast[role=status]`를 붙이고 4000ms 뒤 지운다(이미 있으면 바꿔 끼움). `#screen`을 다시 그려도 남는다.
  - CSS: `.screen-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 11; zoom: var(--outer-zoom, 1); padding: 6px 12px; font-size: 13px; color: var(--ink); background: var(--panel); border: 1px solid var(--panel-edge); }`; `.lobby-start-hint { min-height: 18px; }`; `.lobby .big:disabled { cursor: not-allowed; }`; `.screen-actions > .big:last-child:not(:only-child)` 규칙은 지운다.

- [ ] **Step 1: 실패하는 시험 쓰기**

```ts
test('the host has one gold 시작, lit once every guest is ready', () => {
  // renderLobby(host + unready guest) → .screen-actions has exactly one button '시작', disabled, no .secondary
  // .lobby-start-hint text '모두 준비하면 시작할 수 있습니다 · 0/1명 준비'
  // host row has no .lobby-state; guest row has '대기'
  // host alone → '시작' enabled, hint '혼자 시작합니다 · 시작하면 더 들어올 수 없습니다'
  // six seats all guests ready → hint element exists with ''
});
test('a guest readies with gold 준비 and backs out with a plain 준비 취소', () => {
  // myReady false → '준비' without .secondary; myReady true → '준비 취소' with .secondary; no '시작'
});
test('나가기 sits by 링크 복사 and calls leave', () => {
  // .lobby-tools children texts ['링크 복사', '나가기']; click 나가기 → actions.leave called once
});
// online-app.test.ts
test('leaving the lobby goes back to a new-room start screen with a 4 s note (review focus 2)', async () => {
  // join r1 with a name, emit a lobby message, press 나가기
  // room.leave called; location path is '/'; #screen has '방 만들기' and [data-difficulty]; no '.entry-invite'
  // sessionStorage has no session for r1
  // .screen-toast text '방을 나왔습니다'; room.close(4000) afterwards → still the start screen, no '서버에 연결하지 못했습니다'
  // vi.advanceTimersByTime(4000) → no .screen-toast
});
test('the second result button is the plain secondary one', () => {
  // solo resultHtml: [data-action="home"] has class secondary, [data-action="restart"] does not
  // online result: '나가기' has .secondary, '다시 하기' does not
});
```

- [ ] **Step 2: 실패 확인** — 해당 시험 파일들을 `npx vitest run …`으로 → FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces대로. `showLobby`의 `ready`는 손님 단추만 부른다. 나간 뒤 옛 연결의 `left`는 `screen === 'entry'`라 `onEvent`의 `case 'left'`에서 아무것도 하지 않는지 코드로 확인한다.
- [ ] **Step 4: 통과 확인** — 위 시험 PASS, `npm test`, `npm run typecheck`. 참조 grep: `grep -rn "screen-actions" packages/client/src`(세 곳 모두 둘째 단추가 `.secondary`이거나 단추가 하나인지), `grep -rn "\.ready(" packages/client/src/online`.
- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/online/lobby.ts packages/client/src/online/app.ts packages/client/src/online/text.ts packages/client/src/ui/result.ts packages/client/src/online/result.ts packages/client/src/ui/style.css packages/client/test/online-app.test.ts packages/client/test/stage-choice.test.ts packages/client/test/online-entry.test.ts
git commit -m "Give the host one gold start, add a lobby exit and keep gold for the next step"
```

(결과 화면 시험 파일을 고쳤으면 그 경로도 add.)

끝난 기준: 금색은 언제나 지금 누를 다음 단계이고, 나가기 한 번으로 '방 만들기' 첫 화면과 4초 알림이 나온다.

---

### Task 7: 솔로 메뉴 창과 확인 창

설계: 5-1 ①(단추), 5-2-1~7, 5-2-3의 온라인 메뉴 초점 풀기.

**Files:**
- Create: `packages/client/src/ui/solo-menu.ts`
- Modify: `packages/client/src/ui/hud.ts` (`SETTINGS_BUTTON` 뒤 메뉴 단추)
- Modify: `packages/client/src/ui/mount.ts` (`modal` 형, `act`의 새 액션, `render`의 `#modal` 그리기와 `driver.paused`·덮개, Esc 갈래, `watchEnd`의 초점 풀기)
- Modify: `packages/client/src/ui/style.css` (`.hud .menu-btn`, `#modal .solo-menu`)
- Test: `packages/client/test/solo-menu-ui.test.ts`

**Interfaces:**
- Consumes: Task 4 `soloPause`, `MENU_MODALS`.
- Produces:
  - `export type SoloMenuKind = 'menu' | 'restartAsk' | 'homeAsk';`
  - `export function soloMenuHtml(kind: SoloMenuKind): string` — 문구 그대로:
    - menu: `div.modal.solo-menu[role=dialog]` 머리 '메뉴' + `[data-action=closeModal]`('닫기'), 단추 `[data-action=askRestart]`('다시 시작') `[data-action=askHome]`('처음 화면으로'), 아래 `p.modal-text` "시간이 멈춰 있습니다. 다시 시작하거나 처음 화면으로 가면 지금 판은 기록되지 않고 사라집니다."
    - restartAsk: `role=alertdialog`, 머리 '다시 시작', 글 "지금 판을 버리고 같은 난이도로 다시 시작할까요?", `button.danger[data-action=restart]`('다시 시작') 왼쪽, `[data-action=menuBack][data-autofocus]`('취소') 오른쪽.
    - homeAsk: 머리 '처음 화면으로', 글 "지금 판을 버리고 처음 화면으로 갈까요?", `button.danger[data-action=home]`('처음 화면으로'), `[data-action=menuBack][data-autofocus]`('취소').
  - `mount.ts` `modal`: `'dex' | 'menu' | 'forfeit' | 'settings' | 'restartAsk' | 'homeAsk' | null`. 새 액션 `askRestart`(→ restartAsk), `askHome`(→ homeAsk), `menuBack`(→ menu). `openMenu`는 솔로에서도 'menu'. `#modal`: 온라인 menu/forfeit는 `menuHtml` 그대로, 솔로 menu/restartAsk/homeAsk는 `soloMenuHtml`.
  - 솔로 `driver.paused = soloPause({ userPaused, modal, ended: s.phase === 'ended', portrait: false }).paused`, 덮개는 `.cover`(작업 9가 `portrait`를 채움).
  - Esc 'locking' 갈래: `modal`이 restartAsk/homeAsk면 `act('menuBack', '')`, 아니면 `act('closeModal', '')`.
  - `watchEnd`에서 잠그는 창을 닫을 때 `document.activeElement`가 `#modal` 안이면 `blur()`.
  - 메뉴 단추: `hud.ts`의 `SETTINGS_BUTTON` 바로 뒤 `<button class="menu-btn" data-action="openMenu">메뉴</button>`. CSS `.hud .menu-btn { position: static; height: 22px; min-height: 22px; font-size: 11px; padding: 0 6px; }`(`.hud` gap 8px이 톱니와 사이). `#modal .solo-menu .modal-head { font-size: 12px; }`, `.solo-menu .modal-actions { gap: 8px; }`, `.solo-menu .modal-actions button { min-height: 24px; font-size: 11px; }`, `#modal .solo-menu button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`.
  - `openMenu`·`askRestart`·`askHome`·`menuBack`은 `GAME_ACTIONS`에 넣지 않는다(P 멈춤 중에도 열림).

- [ ] **Step 1: 실패하는 시험 쓰기** — `test/solo-menu-ui.test.ts`(구성은 `refusal-ui.test.ts`의 `mountSolo`·`FakeScene`·`listeners` 정리를 본뜸, `hooks`에 `onRestart`·`onHome` spy)

```ts
test('메뉴 stops the clock without the P cover and locks the side windows', () => {
  press($('#top [data-action="openMenu"]'));
  expect($('#modal .solo-menu')!.textContent).toContain('시간이 멈춰 있습니다.');
  expect(driver.paused).toBe(true);
  expect($('#pause-cover')!.hidden).toBe(true);
  expect($('#win-left')!.inert && $('#win-right')!.inert).toBe(true);
  key('Space'); expect(queue).not.toHaveBeenCalled();
  key('Escape');
  expect($('#modal')!.innerHTML).toBe(''); expect(driver.paused).toBe(false);
});
test('the confirm windows: focus on 취소, Esc goes back to the menu, the danger button acts', () => {
  press($('[data-action="askRestart"]'));
  expect($('#modal')!.textContent).toContain('지금 판을 버리고 같은 난이도로 다시 시작할까요?');
  expect(document.activeElement!.textContent).toBe('취소');
  expect([...$('#modal .modal-actions')!.children].map(b => b.textContent)).toEqual(['다시 시작', '취소']);
  key('Escape'); expect($('#modal .solo-menu [data-action="askRestart"]')).not.toBeNull();
  press($('[data-action="askRestart"]')); press($('#modal .danger'));
  expect(onRestart).toHaveBeenCalledTimes(1);
  // homeAsk: '지금 판을 버리고 처음 화면으로 갈까요?' → .danger → onHome once
});
test('P pause survives the menu and a confirm round trip (review focus 3)', () => {
  key('KeyP'); frame();
  press($('#top [data-action="openMenu"]'));
  expect($('#pause-cover')!.hidden).toBe(false);          // under the menu (z 3 < z 4)
  press($('[data-action="askHome"]')); press($('[data-action="menuBack"]')); key('Escape');
  expect(driver.paused).toBe(true); expect($('#pause-cover')!.hidden).toBe(false);
});
test('online: the end scene closes an open menu and lets go of its focus', () => {
  // online mount (as in end-scene-ui.test.ts), press openMenu, focus its 닫기, set the view result, frame
  // #modal empty, document.activeElement is not inside #modal
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/solo-menu-ui.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces대로. 다시 시작은 `hooks.onRestart`(→ `solo.ts` `restart` → `resetUi`가 `modal = null`), 처음 화면은 `hooks.onHome`(`location.assign('/')`). `sendSoloLog`는 `onFinished`에서만 나가므로 손대지 않는다.
- [ ] **Step 4: 통과 확인** — 위 PASS, `npm test`(특히 `refusal-ui`·`end-scene-ui`·`side-windows`·`online-mount`), `npm run typecheck`. 참조 grep: `grep -n "modal ===\|modal =" packages/client/src/ui/mount.ts`로 새 두 값이 빠진 비교가 없는지(`lockOpen`은 `modal !== null`이라 그대로 맞음).
- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/ui/solo-menu.ts packages/client/src/ui/hud.ts packages/client/src/ui/mount.ts packages/client/src/ui/style.css packages/client/test/solo-menu-ui.test.ts
git commit -m "Add a solo menu that pauses the game and asks once before a restart or the start screen"
```

끝난 기준: 솔로 판 도중 다시 시작·처음 화면으로 갈 수 있고, 둘 다 한 번 더 묻고, P 멈춤과 메뉴 멈춤이 섞이지 않는다.

---

### Task 8: 솔로 상단 줄 정리

설계: 5-1 순서·⑤·⑥, 5-2-5(알약).

**Files:**
- Modify: `packages/client/src/ui/hud.ts` (`renderHud`)
- Modify: `packages/client/src/ui/mount.ts` (`renderHud` 부르는 곳)
- Modify: `packages/client/src/ui/style.css` (`.hud` 규칙, 필요하면 `.hud .boss { white-space: nowrap }`)
- Test: `packages/client/test/hud-levels.test.ts`, `packages/client/test/solo-menu-ui.test.ts`

**Interfaces:**
- Consumes: Task 4 `HudModel.bossText`·`bossTitle`, `soloPause(...).pill`; Task 7 메뉴 단추.
- Produces: `renderHud(state: GameState, pill: boolean, alert?: AlertOpts)` — 둘째 인자 이름만 바뀜(뜻: 알약을 그릴지). 보스는 `<span class="boss" title="${esc(bossTitle)}">${esc(bossText)}</span>`. mount는 `soloPause({...}).pill`을 넘긴다.

- [ ] **Step 1: 실패하는 시험 쓰기**

```ts
// hud-levels.test.ts
test('the top bar shortens the boss and drops the 장승 word only where the design says', () => {
  renderHud(round10WithBoss(31), false);
  expect($('#top .boss')!.textContent).toBe('보스 체력 18400 / 24000');
  renderHud(round10WithBoss(58), false);
  expect($('#top .boss')!.textContent).toBe('보스 18400');
  expect($('#top .boss')!.title).toBe('보스 체력 18400 / 24000');
  expect($('#top .gauge-text')).toBeNull();
  renderHud(round10WithBoss(63), false);
  expect($('#top .gauge-text')!.textContent).toBe('장승 무너짐');
  // order: [...$('#top .hud')!.children].slice(-2) are .settings-open then .menu-btn
});
// solo-menu-ui.test.ts
test('the pill shows for the menu pause, the dex pause stays without it', () => {
  press($('#top [data-action="openMenu"]')); frame();
  expect($('#top .pill')!.textContent).toBe('멈춤');
  key('Escape'); key('KeyD'); frame();
  expect($('#top .pill')).toBeNull();
});
```

('장승 무너짐'은 `crackText`가 61마리 이상에서 내는 글이다. B3에서 정한 글을 바꾸지 않는다.)
- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/hud-levels.test.ts packages/client/test/solo-menu-ui.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 위대로. 'refusal-ui'의 P 알약·도감 알약 없음 시험은 그대로 통과해야 한다.
- [ ] **Step 4: 통과 확인** — 위 PASS, `npm test`, `npm run typecheck`. `grep -rn "renderHud(" packages/client`로 부르는 곳 모두 새 뜻에 맞는지.
- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/ui/hud.ts packages/client/src/ui/mount.ts packages/client/src/ui/style.css packages/client/test/hud-levels.test.ts packages/client/test/solo-menu-ui.test.ts
git commit -m "Shorten the boss label on crowded top bars and show the pause pill for the menu pause"
```

끝난 기준: 5-1의 두 줄이기 규칙과 알약 규칙이 화면 시험으로 고정된다. 640px 폭은 작업 10에서 실제 글꼴로 잰다.

---

### Task 9: 휴대폰 세로 안내

설계: 6.

**Files:**
- Modify: `packages/client/src/ui/first-visit.ts` (`PORTRAIT_TITLE`, `portraitText(online: boolean)`)
- Modify: `packages/client/src/ui/mount.ts` (`#portrait-guide` 만들기, `render`의 판정·inert·멈춤, 키 무시, resize 듣기, `sidesLocked`의 `portrait`)
- Modify: `packages/client/src/ui/style.css` (`#portrait-guide`)
- Test: `packages/client/test/portrait-ui.test.ts`

**Interfaces:**
- Consumes: Task 4 `portraitGuide`, `soloPause({ ..., portrait })`; B2 `sidesLocked({ ..., portrait })`.
- Produces:
  - `PORTRAIT_TITLE = '가로로 돌려 주세요'`; `portraitText(false)` = '세로 화면에서는 판 오른쪽(뚝딱·설정)이 잘립니다. 시간은 멈춰 있고, 돌리면 이어서 합니다.', `portraitText(true)` = '세로 화면에서는 판 오른쪽(뚝딱·설정)이 잘립니다. 함께 하는 판이라 시간은 계속 흐릅니다.'
  - `#portrait-guide`(body의 마지막 자식, `#stage` 밖, `hidden`, `role=dialog`, `aria-modal=true`, `aria-labelledby=pg-title`) > `div.pg-box` > `b#pg-title.pg-title` + `p.pg-text` + `button[data-action=portraitDismiss]`('이대로 보기').
  - 판정: `portraitGuide({ portrait: matchMedia('(orientation: portrait)').matches, width: innerWidth, dismissed, screenOpen: !!document.getElementById('screen')?.firstElementChild })`. `dismissed`는 `resetUi`가 되돌리지 않는다(그 페이지 동안).
  - 떠 있으면: `#stage.inert = true`, `sidesLocked`에 `portrait: true`, 솔로 `soloPause`에 `portrait: true`(덮개 없음), 키 처리기 맨 앞에서 return, 처음 뜰 때 '이대로 보기'에 초점. 사라질 때 초점이 안에 있으면 `blur()`.
  - `window`의 `resize`·`orientationchange`에 `render()`.
  - CSS: `#portrait-guide { position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; padding: 16px; background: var(--bg); }`, `#portrait-guide[hidden] { display: none; }`, `.pg-box { display: flex; flex-direction: column; gap: 12px; max-width: 360px; text-align: center; }`, `.pg-title { font-size: 22px; color: var(--accent); }`, `.pg-text { margin: 0; font-size: 15px; line-height: 1.5; }`, `#portrait-guide button { min-height: 44px; font-size: 15px; }`, `#portrait-guide button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`. 움직임 없음.

- [ ] **Step 1: 실패하는 시험 쓰기** — `test/portrait-ui.test.ts`. `window.matchMedia`를 바꿔 끼운다: `q => ({ matches: q.includes('orientation: portrait') ? portrait : false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })`(움직임 줄이기 질의는 false). `innerWidth`는 `vi.stubGlobal` 또는 `Object.defineProperty`.

```ts
test('a portrait phone gets the guide over everything and the solo clock stops (review focus 5)', () => {
  portrait = true; width = 390; const { driver } = mountSolo();       // first render
  expect($('#portrait-guide')!.hidden).toBe(false);
  expect($('#portrait-guide .pg-text')!.textContent).toBe('세로 화면에서는 판 오른쪽(뚝딱·설정)이 잘립니다. 시간은 멈춰 있고, 돌리면 이어서 합니다.');
  expect(driver.paused).toBe(true);
  expect($('#pause-cover')!.hidden).toBe(true);
  expect($('#stage')!.inert).toBe(true);
  expect($('#win-left')!.inert && $('#win-right')!.inert).toBe(true);
  expect(document.activeElement!.textContent).toBe('이대로 보기');
  key('Space'); expect(queue).not.toHaveBeenCalled();
});
test('이대로 보기 keeps it away for the page, turning landscape hides it by itself', () => {
  // press dismiss → hidden, paused false; resize event → still hidden
  // fresh mount: portrait → shown; portrait = false + resize → hidden without dismissing
});
test('wide portrait windows, an outer screen and online', () => {
  // width 700 portrait → hidden; #screen with a child → hidden
  // online mount → text '…함께 하는 판이라 시간은 계속 흐릅니다.', driver.paused untouched
});
test('the guide covers an open solo menu and gives it back', () => {
  // open 메뉴, then portrait + resize → guide shown, #modal .solo-menu still there
  // landscape + resize → guide hidden, menu shown, driver.paused true (menu)
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/portrait-ui.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 위대로. `#portrait-guide`의 클릭은 `onAction(el('portrait-guide'), act)`로 받고 `act`에 `portraitDismiss` 갈래를 둔다(`GAME_ACTIONS` 아님).
- [ ] **Step 4: 통과 확인** — 위 PASS, `npm test`, `npm run typecheck`. matchMedia를 바꿔 끼운 것이 다른 시험에 새지 않게 `afterEach`에서 되돌린다.
- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/ui/first-visit.ts packages/client/src/ui/mount.ts packages/client/src/ui/style.css packages/client/test/portrait-ui.test.ts
git commit -m "Ask portrait phones to turn sideways and hold the solo clock meanwhile"
```

끝난 기준: 세로 좁은 창에서 판 화면 위 8층에 안내가 뜨고, 솔로는 멈추고, '이대로 보기' 뒤로는 그 페이지에서 다시 뜨지 않는다.

---

### Task 10: 브라우저 확인과 기록

설계: '확인 방법' 브라우저 항목 전체, 1 높이 표, 5-1 측정, 3 큰 화면 높이.

**Files:**
- Modify: 확인하다 나온 고칠 거리(작업마다 따로 커밋), `docs/superpowers/plans/2026-11-25-first-visit.md`('진행'), `docs/superpowers/specs/2026-11-25-first-visit-design.md`(상태 한 줄), `docs/superpowers/plans/2026-11-25-ui-review-fixes.md`('진행'에 B4 한 줄)

- [ ] **Step 1: 띄우기** — `packages/client`에서 `npx vite --port 5176 --strictPort`(백그라운드, 솔로·첫 화면). 온라인은 `PORT=2568 npm run dev:server`와 `VITE_SERVER_URL=http://localhost:2568 npx vite --port 5177 --strictPort`. 5173·5174·2567은 쓰지 않는다. PID를 적어 둔다.
- [ ] **Step 2: 첫 화면·초대 화면** — 창 640×360·800×370·1280×720·1920×953(바깥 1.5)·1920×1080(바깥 2.25)·390×780에서. 640×360 접힘에서 두 단추가 스크롤 없이 보이는지(설계 약 310px), 펼침은 스크롤로 내려가는지, Tab으로 '처음이라면'·난이도·두 단추의 금색 초점, '혼자 하기' 가운데 클릭이 새 탭으로 열리는지. 초대 화면(`/room/<없는 id>`가 아니라 실제 방 링크)에서 안내 한 줄과 '처음 화면으로'.
- [ ] **Step 3: 대기실** — 방장 혼자(바로 켜진 '시작'·'혼자 시작합니다 …'), 두 탭 2인(꺼진 '시작'·'0/1명 준비'·커서 금지 → 손님 준비 → '2명으로 시작합니다 …'), 난이도를 바꾼 직후 바로 '시작'이 거절되지 않는지, 나가기 → 첫 화면 + 4초 알림, 같은 링크로 다시 입장. 1920×1080에서 아래가 잘리지 않는지(설계 약 1041px).
- [ ] **Step 4: 솔로 판** — 첫 판 1~10라운드 하단 한 마디 변화(①→②/②′→③→④, 보스 잡은 뒤 사라짐). 상단 줄 가장 긴 상태: `window.__driver`로 70라운드·어려움·보스 생존·잡귀 58·P 멈춤을 만들고 640×360(배율 1)에서 `#top .hud`의 `scrollWidth`와 '메뉴'·톱니 오른쪽 끝이 638 안인지 실제 글꼴로 잰다(설계 약 607px). 메뉴 다시 시작·처음 화면으로, P 멈춘 채 메뉴, 1920×953에서 여백 창(장터)을 연 채 메뉴를 열어 장터 단추가 눌리지 않는지(잠긴 상자는 inert라 `elementFromPoint`로는 body가 잡힌다. 스크린샷과 클릭 결과로 판단).
- [ ] **Step 5: 세로·온라인** — 창 390×780(DevTools 기기 흉내 또는 창 크기)에서 솔로 안내와 멈춤, 솔로 메뉴를 연 채 세로로 바꿨을 때 안내가 메뉴 위인지. 온라인 2인 방에서 세로 안내 문구, 메뉴를 연 채 관문 실패를 만들면 메뉴가 닫히고 실패 장면이 보이는지.
- [ ] **Step 6: 정리** — 띄운 프로세스를 트리째 끄고(`taskkill //PID <pid> //T //F`, npx·npm 부모까지) `netstat -ano | grep LISTENING`으로 5176·5177·2568이 빈 것 확인(5173·5174는 남의 것이라 그대로), 쓴 탭 닫기.
- [ ] **Step 7: 기록과 커밋** — 이 문서 '진행'에 본 것·못 본 것·잰 값·고친 것을 적고 frontmatter `progress`를 올린다. 설계 문서 상태 줄과 `2026-11-25-ui-review-fixes.md` '진행'에 B4 한 줄.

```bash
git add docs/superpowers/plans/2026-11-25-first-visit.md docs/superpowers/specs/2026-11-25-first-visit-design.md docs/superpowers/plans/2026-11-25-ui-review-fixes.md
git commit -m "Record the B4 first-visit checks in the browser"
```

끝난 기준: '확인 방법'의 항목마다 봤음/못 봄이 적혀 있고, 설계의 '실패로 보는 것' 넷(다시 온 사람 한 번 더 누름, 안내가 판을 가리거나 입력을 막음, 640×360 접힘에서 단추가 밀림, 배율 1 상단 줄이 넘쳐 메뉴·톱니가 잘림)이 없음을 확인했고, 띄운 포트가 모두 비어 있다.

---

## 진행

- 2026-11-25: 계획 작성 `da323c5`.
- 2026-11-25: 작업 1~9 구현. 1 `dc469bf` · 2 `e0ebf08` · 3 `77b670f` · 4 `5308010` · 5 `bcf426b` · 6 `5fcd10b` · 7 `f10a9ce` · 8 `0a92dc7` · 9 `21c95cd`.
- 2026-11-26: 작업 10 브라우저 확인(Chrome). worktree에서 vite 5176(솔로·첫 화면), 서버 `PORT=2568 DORANDI_DEV=1`, vite 5177(온라인, `VITE_SERVER_URL=http://localhost:2568`). 5173·5174·2567은 쓰지 않았다. 끝난 뒤 셋 다 npm·npx·bash 부모부터 트리째 끄고(`taskkill //T //F`) `netstat`으로 5176·5177·2568이 빈 것을 확인했다(5173은 사용자 것이라 그대로). 쓴 탭은 모두 닫았다.
  - **방법:** B2·B3처럼 같은 출처 빈 문서에 크기별 iframe을 띄워 쟀다. 바깥 화면 배율은 iframe 안 `--outer-zoom`으로 확인했다. 솔로 판은 `window.__driver`에 iframe 안에서 불러온 `@dorandi/logic/testing`(`forceRound`·`spawnEnemyForTest`)으로 라운드·보스·잡귀 수를 맞췄다. 첫 판 1~10라운드는 실제 키(Space·W·Z·Esc)로 시작하고 `driver.speed = 10`으로 넘겼으며, 지지 않게 잡귀가 40을 넘으면 20으로 덜어 냈다(6번). 손님은 sessionStorage가 따로인 둘째 탭에서 열었다. 관문 실패는 `?dev=jump5900`(9라운드, 마감 26초 전)으로 만든 2인 방에서 봤다.
  - **첫 화면 높이(이 PC 글꼴 Pretendard):** 접힘 — 640×360 상자 316px(위아래 여백 8 포함), 두 단추 y 257~301, `#screen` 스크롤 없음(설계 약 310px). 800×370 316px, 단추 y 262~306. 1280×720 배율 1.5 538px, 1920×953 배율 1.5 538px, 1920×1080 배율 2.25 812px(설계 약 816px), 390×780 360px. 펼침 — 640×360·800×370 415px로 단추가 아래로 밀려 스크롤(설계 약 410px, 받아들인 동작), 1280×720 688px 들어감(설계 약 704px), 1920×953 688px, 1920×1080 1036px, 390×780 459px 모두 들어감.
  - **첫 화면 초점·새 탭:** 이름이 있으면 접힌 채 '방 만들기'에 초점, 그 상태에서 Enter 한 번으로 방이 만들어졌다(review focus 1). Tab 차례는 '처음이라면' → 닉네임(테두리 색) → 쉬움·보통·어려움 → 방 만들기 → 혼자 하기 → 음악 출처, 단추와 접기 머리는 모두 `outline 2px solid #ffe08a`·띄움 2px. '혼자 하기'를 Ctrl+클릭하니 `/solo?rounds=70&difficulty=normal`이 새 탭으로 열리고 원래 화면은 그대로였다(가운데 클릭은 도구에 없어 Ctrl+클릭으로 대신).
  - **초대 화면(실제 방 링크, 새 탭):** '처음이라면' 펼침, 안내 '초대받은 방에 들어갑니다 · 난이도는 방장이 정합니다', 난이도 줄·'혼자 하기' 없음, [입장하기], '처음 화면으로' 13px 밑줄·높이 24px. 640×360에서 410px로 스크롤.
  - **대기실:** 방장 혼자 — '시작' 켜짐, '혼자 시작합니다 · 시작하면 더 들어올 수 없습니다', 방장 줄에 준비/대기 없음. 2인 — 방장 '시작' 꺼짐(투명도 .4, 커서 not-allowed), '모두 준비하면 시작할 수 있습니다 · 0/1명 준비', 손님 '준비'(금색) → '준비 취소'(`.secondary`) → 방장 '2명으로 시작합니다 · 시작하면 더 들어올 수 없습니다', 안내 줄 높이 18px. 손님 나가기 → 주소 `/`, '방 만들기'·난이도 줄이 있는 첫 화면, '방을 나왔습니다'가 3.5초에는 있고 4.3초에는 없음, 방 저장 키 없음. 같은 링크로 다시 들어가니 닉네임 칸이 있는 초대 화면이 나왔고 다시 입장·준비가 됐다(review focus 2). 높이: 1920×1080(배율 2.25) 상자 y 14~1066으로 안내 줄까지 들어감(2인, 설계 3인 약 1041px), 1920×953·1280×720(배율 1.5) 각각 701·700px, 640×360은 384px로 안내 줄이 스크롤 아래(설계가 적은 지금 동작).
  - **난이도 바꾼 직후 시작:** 방장 혼자 방에서 '쉬움'을 누르고 같은 순간 '시작'을 누르니 거절 없이 쉬움 판이 시작됐다. 2인 방에서는 난이도를 바꾸면 서버가 손님 준비를 모두 푸는 기존 규칙(`onDifficulty`) 때문에 바로 누른 '시작'은 시작되지 않고 '0/1명 준비'와 꺼진 '시작'으로 돌아갔다(오류 문구는 뜨지 않음). 손님이 다시 준비한 뒤 시작됐다.
  - **첫 판 한 마디(640×360, 보통):** ① 'Space나 뚝딱!으로 유닛을 뽑으세요 (도깨비불 4개)'(뒤 줄에서 W·Space·G 빠짐) → Space 1번 ②′ '조합할 재료가 아직 모자랍니다 · Space로 더 뽑으세요 (도깨비불 3개)'(Space 빠짐) → 3번 더 ② 'W로 재료 유닛을 고르고 Z로 조합합니다 · 왼쪽 목록 맨 위부터'(W 빠짐) → W로 고르면 한 마디 숨김 → Z·Esc 뒤 1라운드 ③ '잡귀가 60마리를 넘긴 채 5초가 지나면 집니다 · 지금 3마리' → 6·7라운드 없음 → 8라운드 ④ '10라운드 보스는 그 라운드 안에 잡아야 합니다' → 10라운드 보스를 잡으니(체력을 1로 낮춤, 3.7초) 사라짐. 한 마디는 하단 줄 안에만 있고 키 입력을 막지 않았다.
  - **상단 줄 폭(640×360, 배율 1, P 멈춤):** `#top .hud`를 `max-content`로 펴서 잰 자연 폭. 70라운드·어려움·저항 두 줄·보스·58마리 — Pretendard 539px, 맑은 고딕 579px(설계 약 607px). 메뉴 단추 x 598~631, 톱니 572~590, 줄 안쪽 638. 다른 상태: 70라운드 56마리 559/604, 61마리 565/613, 69라운드 56마리 530/570, 20라운드 보스 56마리 549/598, 10라운드 보스 47마리 572/623(맑은 고딕 기준 이것이 가장 김).
    - **고친 것 `24c933d`:** 10라운드 보스(20라운드부터 나오는 저항 줄이 없어 보스 체력이 전체로 나옴) + 주의(48~56) 또는 초과(61+) + 멈춤 알약에서 맑은 고딕이 654·663px로 넘쳐 라운드·시간·알약·잡귀 글이 두 줄로 접혔다(메뉴·톱니는 631에서 잘리지 않음, Pretendard는 600·605px로 들어감). 앱은 Pretendard를 싣지 않아 Pretendard가 없는 Windows에서는 맑은 고딕으로 그린다. 보스 줄이기 조건을 '위험 단계'에서 '잡귀 꼬리 글이 붙을 때(주의·위험·초과)'로 넓혔다(설계 5-1 ⑤ '잡귀 꼬리 글이 붙는 … 단계'). 계획 작업 4의 '초과는 전체로' 기대와 달라 `hud-levels.test.ts` 두 기대를 바꿨다. 고친 뒤 10라운드 보스 + 48·56·58·63마리 + P 멈춤: Pretendard 533·533·512·541px, 맑은 고딕 581·581·556·589px.
  - **솔로 메뉴:** P 멈춤 위에 메뉴(z 4)가 덮개(z 3, inert) 위로 뜨고 `#win-left`/`#win-right` inert. 메뉴로만 멈추면 덮개 없음·'멈춤' 알약 있음. P 멈춤 → 메뉴 → 다시 시작 확인 → 취소 → 닫기 뒤에도 P 멈춤과 덮개가 남고 틱이 그대로(review focus 3). 확인 창 Esc → 메뉴로, 초점은 물어본 '다시 시작'. 확인 창 단추: 위험 '다시 시작'/'처음 화면으로'(x 159~316, `.danger`) 왼쪽·'취소' 오른쪽. 메뉴 '다시 시작'을 더블클릭해도 확인 창에서 멈췄다(메뉴 단추 y 79~103, 확인 창 위험 단추 y 97~121). 다시 시작 → 같은 난이도(어려움) 준비 15초 새 판, P 멈춤 풀림. 처음 화면으로 → `/` 첫 화면.
  - **1920×953(배율 2) 장터를 연 채 메뉴:** 장터가 판 오른쪽 여백 `#win-right`(x 1608~1920)에 열린 채 메뉴를 여니 장터가 흐려지고 inert, 스크린샷 자리의 '45냥'을 눌러도 엽전 500·유닛 0 그대로였다.
  - **세로(390×780 iframe):** 솔로를 세로로 열면 첫 그리기부터 안내(z 30, 배경 `#0d0a14`), 제목 22px 금색, 설명 15px, '이대로 보기' 44px·15px·초점 금색 2px 띄움 2px, 틱 0에서 1.5초 동안 그대로, 덮개 없음·알약 있음, `#stage`·양옆 창 inert(review focus 5). 가로(780×390)로 돌리면 사라지고 시간이 흐름. 메뉴를 연 채 세로로 돌리면 안내가 메뉴 위를 덮고, 가로로 돌리면 메뉴가 그대로 다시 보이며 메뉴 멈춤 유지. 세로에서 '이대로 보기'를 누르면 메뉴가 보이고, 크기를 바꾸거나 가로·세로를 오가도 다시 뜨지 않았다. 안내가 사라질 때 초점은 body로 풀렸다.
    - **고친 것 `ef4250a`:** 세로 안내 설명이 '시간은 멈 / 춰 있고', 640×360 솔로 메뉴 안내가 '지금 판은 기 / 록되지'처럼 낱말 가운데서 줄이 바뀌었다. 이 프로젝트의 다른 한국어 설명 글(23곳)처럼 `.pg-text`와 `.solo-menu .modal-text`에 `word-break: keep-all`을 더했다. 고친 뒤 '시간은 / 멈춰 있고', '지금 판은 / 기록되지'로 바뀌는 것을 브라우저에서 봤다.
  - **온라인:** 2인 방(어려움)에서 손님 iframe을 390×780으로 바꾸니 '…함께 하는 판이라 시간은 계속 흐릅니다.'가 뜨고 남은 시간이 34초 → 32초로 흘렀다. 가로로 돌리면 사라지고 초점은 body. 관문 실패: 9라운드 남은 24초에 방장이 메뉴를 열어 두니, 마감 순간 메뉴가 닫히고 '관문 실패 · 역신(첫째)을 막지 못했습니다 / 곧 결과 화면 · 누르면 바로'가 보였고 초점은 body, 약 1.5초 뒤 결과 화면. 결과 화면 '다시 하기'는 금색, '나가기'는 보조(`.secondary`).
  - **실패로 보는 것 넷:** 다시 온 사람 한 번 더 누름 — 없음(Enter 한 번). 안내가 판을 가리거나 입력을 막음 — 없음(하단 줄 안, Space·W·Z·Esc 그대로 받음). 640×360 접힘에서 단추가 밀림 — 없음(단추 아래끝 301 / 360). 배율 1 상단 줄이 넘쳐 메뉴·톱니가 잘림 — 메뉴·톱니는 어떤 상태에서도 잘리지 않았고, 맑은 고딕에서 글이 접히던 10라운드 경우는 `24c933d`로 고쳤다.
  - **보고 남긴 것(고치지 않음):**
    1. 마우스로 메뉴·확인 창을 열면 초점이 창 안이 아니라 body에 있다. `onAction`이 pointerdown에서 창을 그리고 '닫기'·'취소'에 초점을 준 뒤, 브라우저 기본 동작이 눌린 단추(이제 inert이거나 지워진 단추) 쪽으로 초점을 옮기며 풀리는 것으로 보인다. 키보드(Enter)나 JS 클릭으로 열면 '닫기'·'취소'에 간다. Esc·Tab은 그대로 듣고 Enter가 위험 단추로 가지 않으니 사고는 아니다. 설정·도감도 같은 길이라 B4만의 일이 아니어서 두었다.
    2. 세로 안내가 사라질 때(가로로 돌림) 초점이 메뉴 안으로 돌아가지 않고 body에 남는다. 계획대로('사라질 때 초점이 안에 있으면 푼다')다.
    3. 손님 탭은 판이 시작되기 전에 나가면 닉네임을 기억하지 않는다(세션 저장은 판 시작 때 `onFull`에서만). 그래서 대기실에서 나간 손님의 첫 화면은 이름 칸이 비고 '처음이라면'이 펼쳐진다. B4 전부터 그랬다.
    4. 개발용 점프(`?dev=jump…`)로 9라운드에 들어가면 상단에 '6라운드에 역신 등장'이 그대로 남는다. 점프가 역신을 만들지 않아서이고 실제 판에서는 나오지 않는다.
  - **못 본 것:** 실제 휴대폰(회전 잠금·주소창 높이 변화, hidden 전에 blur하는 순서), 실제 창 크기 바꾸기(iframe으로 대신), 3인 이상 방과 6명이 다 찬 방(빈 안내), 1920×1080 대기실 3인 모두 준비(2인으로 대신), 가운데 클릭(Ctrl+클릭으로 대신), 맑은 고딕 밖의 글꼴(Apple SD Gothic Neo), 쉬움 판의 판 길이 실제 시간, NVDA. 전체 시험(`npm test`)은 묶음 끝에서 따로 돈다. 이번 수정 뒤에는 `hud-levels`·`portrait-ui`·`solo-menu-ui`·`refusal-ui` 시험 50개와 `npm run typecheck`만 돌렸다.
