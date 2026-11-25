---
title: 상태 신호와 연출 (B3) 구현 계획
project: dokkaebi-defense
type: task
priority: high
status: in-progress
startDate: 2026-11-25
progress: 0%
---

# 상태 신호와 연출 (B3) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 위험이 늦기 전에 보이게 한다. 잡귀 한도를 주의·위험·초과 세 단계로 알리고, 관문 마감을 미리 세고, 동료 탈락·끊김을 왼쪽 줄에서 알아보게 하고, 판 위쪽 알림을 한 자리에 순서대로 띄우고, 거절·멈춤·넋 지원·장터 당첨을 그 동작이 일어난 자리에서 보여 준다.

**Architecture:** 판정과 순서는 순수 함수로 먼저 만든다. 잡귀 단계는 `ui/models.ts`의 `limitLevel` 하나만 읽고, 알림 자리 대기열·거절 자리 고르기·반복 움직임 순위·결과 연출 시간은 새 `ui/signals.ts`, 온라인 관문·왼쪽 줄 판정은 `online/models.ts`, 넋 목록은 `online/spirit.ts`에 둔다. 화면은 `mount.ts`가 이 값을 읽어 `#round-banner`(알림 자리 윗칸), 새 `#slot-row`(아래 고정 줄), 새 `#slot-say`(읽어 주는 곳 하나), 새 `#pause-cover`·`#end-scene`, 버튼 위 `.refusal` 상자에 그린다. Phaser 쪽 토스트는 DOM 알림 자리로 넘기고, 내 탄생 띠·장승·당첨 고리·오라 값만 Phaser에 남긴다.

**Tech Stack:** TypeScript, Phaser 3.90, Vitest 3(happy-dom), Vite 6.

**Spec:** `docs/superpowers/specs/2026-11-25-status-signals-design.md` · 목업 `docs/design/mockups/2026-11-25-status-signals.html`(번호 ①~㉒, 화면 1~9). 함께 볼 표: B1 `2026-11-25-next-combine-design.md` '교차 검토에서 맞춘 것', B2 `2026-11-25-window-layout-design.md` ⑦·⑯·⑰과 '다른 설계와 맞춘 것', B4 `2026-11-25-first-visit-design.md` 5-1·'다른 설계와 맞춘 것'. 사용자가 2026-11-25에 '사용자에게 물을 것' 1~8과 교차 검토 질문 3·4·5를 모두 권장안 (가)로 확정했다.

## Global Constraints

- 작업 위치: worktree `C:/Users/USER/Desktop/이범수/도랜디/dokkaebi-ui-fixes`, 브랜치 `ui-review-fixes`. 원래 저장소와 사용자의 5173 개발 서버는 건드리지 않는다. 5174는 다른 프로젝트가 쓴다. 열지도 끄지도 않는다. push·main 머지 금지.
- 기준 640×360, 정수 배율. 판(무대) 좌표는 배율 1 px. 캔버스 좌표 = 무대 좌표 − (`CENTER_X` 128, `CENTER_Y` 24).
- 게임 규칙·수치(한도 60, 5초, 관문 라운드, 넋 5냥)와 서버·통신 형식은 바꾸지 않는다. 필요한 값은 `ClientView`에 다 있다.
- 분위기는 담백하게. 새 장식·테마 그림 없음. 장승 이름표는 '입구' 이름표와 같은 글꼴·색·외곽선, 둘 다 10px.
- 색: 주의 `#ffb396`, 위험·초과 `#ff9482`, 거절 상자 배경 `#3a1a1f`·테두리 `#ff6b5a`·글자 `#ffd9cf`, 흐린 줄 `#9a90a8`, 히든 `#c48cff`, 6등급 `#ffe35a`, 5등급 `#ff4a3a`, 멈춤 덮개 `#0d0a14` 55%.
- 초점: DOM 단추는 금색 `--accent` 2px(`:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px }`, B2에서 이미 있음). 크림 `--ink`는 판 위 표시에만. 새 단추([계속 (P)], 넋 목록 [5냥])도 같다.
- 층(아래→위, B2 ⑰): 1 판(알림 자리·판 안 거절 상자) · 2 판 안 기둥 창 · 3 판 밖 창 · 4 멈춤 덮개 · 5 잠그는 창(메뉴·설정·포기·도감·솔로 결과) · 6 실패·클리어 장면 · 7 바깥 화면 · 8 세로 안내. `#stage` 안 z-index는 `#pause-cover` 3, `#modal` 4, `#end-scene` 5, `#error` 6으로 맞춘다(지금 `#modal` 2, `#error` 3).
- Esc: 실패 장면 건너뛰기 → 잠그는 창 → 마지막에 연 창 → 선택 풀기. P 멈춤은 Esc로 풀지 않는다(P 또는 [계속]).
- 움직임은 모두 `@media (prefers-reduced-motion: no-preference)` 안과 `body:not(.fx-reduced)` 아래에만. Phaser 쪽은 `scene.reduceEffects`. 들어옴 `cubic-bezier(.2,.8,.2,1)`, 나감 `cubic-bezier(.4,0,1,1)`, 진행 막대·초 세기는 linear. 번쩍임은 1초에 3번을 넘지 않는다.
- 하지 않는 것: 솔로 상단 줄 '보스 체력 N / M' → '보스 N' 줄이기와 '메뉴' 단추(B4 5-1 ⑤), 보스 48px이 윗줄에 걸치는 문제, '보스 출현' 띠(FxLayer `banner`)의 모양, 창 자리·층 번호·Esc 규칙 자체(B2), 문구만 고친 것(A3).
- A줄(`docs/superpowers/plans/2026-11-25-ui-review-fixes.md` '진행'), B1(`2026-11-25-next-combine.md`), B2(`2026-11-25-window-layout.md`)를 되돌리지 않는다. 특히 B1 ▲·꺾쇠 크림색, `triangleAlpha(now, reduced, held)`와 `scene.pulseHeld`, B2의 `#stage.pillar-open` 좁힘 규칙, `NOTICE_SPAN`, `sidesLocked`·`escStep`·`coveredIds`, 오른쪽 기둥 머리 줄 `rightBarHtml`(뚝딱 왼쪽, 돈 글 오른쪽), `refocusIn`.
- 화면 글은 한국어, 이 계획과 설계에 적은 문구 그대로. 코드 주석은 영어, 역추론 못 하는 이유만.
- 커밋: 바꾼 파일만 경로로 `git add`(`-A`·`.` 금지). 메시지는 영어 한 줄(동사로 시작) + 빈 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 각 작업 끝: 그 작업 시험 + `npm test` + `npm run typecheck` 통과 뒤 커밋. 옛 동작(상단 `.notice`, 둘째 줄 '다음은 내 고개', `.arrival`, '탈' 글자, 남의 탄생 띠, `mineDanger`, `myTurn` 등)을 기대하던 기존 시험은 이 계획의 규칙으로 고쳐 같은 커밋에 넣는다. `sim.test.ts`·stage3-econ 측정이 병렬 부하로 시간을 넘겨 종료 코드 1이 나면 그 파일만 단독으로 다시 돌려 확인한다(B1·B2 기록).
- 띄운 프로세스(vite, 서버, 헤드리스 크롬, 정적 서버)는 끝날 때 프로세스 트리째 끄고(`taskkill //PID <pid> //T //F`, 감시 모드면 부모까지) `netstat -ano | grep LISTENING`으로 포트가 비었는지 본다. 브라우저는 claude-in-chrome 새 탭만 쓰고 끝나면 닫는다.

## Review Focus

시험이 직접 겨누지 않는데 사람이 쓰다 부딪히기 쉬운 것. 줄마다 시험을 그 코드를 맡은 작업에 넣었다.

1. **결과가 이미 있는 화면으로 다시 붙음**(재접속·새로 고침 스냅샷에 `view.result`가 들어 있음): 실패 장면이 또 돌거나 결과 화면이 1.5초 늦게 뜨면 안 된다. 결과 화면이 바로 떠야 한다. → 작업 8 시험 '붙을 때 이미 끝난 판은 장면 없이 결과'.
2. **창이 다시 그려지는 동안 거절 상자**: `#win-right`·`#right`는 100ms마다 다시 그려질 수 있다(엽전이 바뀌면 innerHTML이 바뀜). 그 안에 붙인 거절 상자나 엽전 효과가 다음 그리기에 사라지면 안 된다. 1.5초(엽전 1초) 동안 남아야 한다. → 작업 6 시험 '창이 다시 그려져도 거절 상자가 남는다', 작업 10 시험 '엽전이 바뀌어도 밝아짐이 남는다'.
3. **카운트다운 중에 역신을 잡음**: 카운트다운 상자가 바로 내려가고, 그동안 기다린 배너·탈락 알림이 이어서 떠야 한다. 기다리던 토스트는 3초가 넘었으면 버린다. → 작업 7 시험 '역신을 잡으면 카운트다운이 내려가고 기다린 알림이 뜬다'.
4. **같은 틱에 둘이 쓰러짐**(포기 둘, 6인 후반 한도 초과 둘): 탈락 알림이 둘 다 차례로 떠야 하고(버리지 않음) 소리는 한 번만 난다. → 작업 9 시험 '한 번에 둘이 쓰러지면 알림 둘, 소리 하나'.
5. **P로 멈춘 채 설정을 열었다 닫음**: 설정 창이 덮개 위에 보이고, 덮개의 [계속] 단추는 설정이 열린 동안 눌리지 않으며, 닫으면 덮개가 다시 보이고 시간은 여전히 멈춰 있어야 한다. → 작업 6 시험 'P 멈춤 위에 설정, 닫으면 덮개가 남는다'.

---

## 설계 번호와 작업 대응

| 설계 | 내용 | 작업 |
|---|---|---|
| 판정 기준: 잡귀 한도 | `limitLevel(data, count, round)` → `ok`(0~47)·`warn`(48~56)·`danger`(57~60)·`over`(61+)와 `instant`(65라운드부터, 한도 안 넘는 판엔 없음). 주의 기준 `coop.danger` 또는 `ceil(limit × 0.8)`, 위험 `ceil(limit × 0.95)` | 1 |
| ① 잡귀 숫자 | 보통 11px 그대로, 주의 12px 굵게 주황 + '· 주의', 위험 13px 굵게 붉은 + '· N마리 남음'(60은 '· 한계'), 초과 13px 붉은 + '· 초과'. 꼬리 글 10px 굵게 같은 색 | 1(글), 4(그리기) |
| ② 게이지·글 | 주의 주황, 위험 붉은 + '장승 …' 글자 숨김, 초과 붉은 + '장승 무너짐' 다시 | 1, 4 |
| ③ 가장자리 | 주의 `inset 0 0 14px rgba(255,59,47,.15)`, 위험 .22↔.32 2초 숨쉬기(효과 줄이기 .32 고정), 초과 지금 `.6` | 4 |
| ④ 장승 | 단계 색(갈색·주황·붉은·붉은+흔들림), 이름표 '장승' 10px, '입구' 9px → 10px | 4 |
| ⑤ 판 위 문구 | 65라운드부터 위험 이상에서 아래 고정 줄 오른쪽 끝 "61마리면 바로 패배"(10px, 계속) | 5 |
| ⑥ 초과 카운트다운 | 지금 상자에 "N마리 줄이면 멈춤"(n − 60) | 1, 4 |
| 온라인 첫 줄 내 잡귀 | 같은 단계 색·꼬리 글, 10px 그대로 | 4 |
| ⑦ 멈춤 | P로 멈췄을 때만 판 덮개(`#0d0a14` 55%) + '멈춤' + [계속 (P)] 64×24, HUD '· 멈춤' → 10px 알약. 메뉴·도감 멈춤엔 덮개 없음. P 멈춘 채 메뉴·설정은 위, 닫으면 덮개 다시 | 6 |
| ⑦ 멈춤 중 게임 키 | "멈춤 중입니다 · P로 계속"(⑧ 자리 규칙으로) | 6 |
| ⑧ 거절 알림 | 버튼 위 작은 상자(1.5초, 처음 좌우 2px 두 번), 자리: 버튼 → 기둥 창 안 같은 단추(`#win-right .win-summon` 등) → 알림 자리 윗칸. 상단 `.notice`·온라인 배너 속 거절 없앰 | 2(자리 고르기), 6 |
| ⑨ 온라인 둘째 줄 | 등장 전 그대로 / '마감까지 N라운드' / 마감 라운드 붉은 '관문 마감 · 남은 N초', '다음은 내 고개' 뺌 | 3, 7 |
| ⑩ 마감 라운드 배너 | 둘째 줄 끝 붉은 '· 관문 마감' | 3, 7 |
| ⑪ 마지막 10초 카운트다운 | 윗칸 붉은 상자 200×40(초 20px, '역신을 쓰러뜨리세요' 11px, 'N번 이름 고개 · hp / max' 10px, 체력 막대), 빼앗기지 않음, 5초부터 1초마다 숫자 1→1.15→1 | 2(순서), 3(값), 7 |
| ⑫ 실패·클리어 장면 | 1.5초 판 회색 + 가운데 상자 + '곧 결과 화면 · 누르면 바로', 판 누르기·Enter·Esc로 건너뜀, 시작 때 잠그는 창 닫음, 그동안 기둥 창 잠금, 결과 240ms에 덮음. 문구 다섯 | 2(문구·시간), 8 |
| ⑬ '역신이 옵니다' | 아래 고정 줄 x 232부터, '역신이 옵니다 · 8초' / '역신이 내 고개에 · 7초 뒤 떠남', 5초 이하 숫자 붉게. 둘째 줄 끝 글과 `.arrival` 없앰 | 3, 7 |
| ⑭ '다음' 표식 | 상태 글은 초과·위험·주의·끊김·생존, '다음' 칩(10px 금 테두리), 역신 있는 줄은 '역신' 칩(금 채움) + 진행 막대, '탈' 없앰 | 3, 9 |
| ⑮ 동료 탈락 | 줄 1초 붉은 번쩍임 → 흐린 줄(글자 `#9a90a8`, 숫자 자리 '넋', 왼쪽 테두리 없음), 윗칸 '3 범수 님이 쓰러졌습니다 · 잡귀 한도' 3초, 징 낮게(질문 2 가), 효과 줄이기는 붉은 배경 1초 고정 | 3(감지), 9 |
| ⑯ 재접속 대기 | 점선 왼쪽 테두리 `#9a90a8`, 투명도 .75, '끊김 · 2:45', 위험·초과가 겹치면 그 글 + 점선, 돌아오면 '돌아옴' 2초 | 3, 9 |
| 내 고개 줄 단계 | 주의 이상 숫자 굵은 주황, 위험 이상 줄 배경 옅은 붉은, '위험'(48~) → '주의' 48~56·'위험' 57~ | 3, 9 |
| ⑰ 알림 자리 하나 | 무대 x 128~528, 윗칸 y 26~68(한 번에 하나, 순서 1 카운트다운 · 2 내 탄생 띠 · 3 라운드 배너 · 4 동료 탈락 · 5 버튼 없는 거절·토스트), 3초 넘게 기다린 토스트·거절은 버림, 밀린 배너는 1.2초, 두 줄 넘으면 말줄임, 아래 고정 줄 y 68~82. 기둥 창 열리면 x 200~454. 크기 고정 겹침 층. 읽어 주는 곳 하나(`role="status"`) | 2(대기열), 5 |
| ⑰ 따라 들어오는 것 | 배너·띠·토스트·카운트다운·⑬·`#econ-top`·`#tame-anchor` 기본 자리 | 5(배너·띠·토스트·아래 줄), 7(카운트다운), B2 끝(econ-top·tame-anchor, 확인만 12) |
| ⑱ 내 탄생 띠 | 윗칸 높이 42 안, 그림 40px, 첫 줄 10px '조합 · 6등급 · 마딜 · 이번 판 첫 6등급', 둘째 줄 이름 16px 굵게 | 5 |
| ⑲ 남의 탄생 | 띠 없음, 그 사람 줄 금빛(지금) + 둘째 줄 '★ 이름' 2.5초(히든 보라), 초과·위험이면 글은 그대로, 소리 `sparkle`만 | 5(띠·소리), 9(줄 글) |
| ⑳ 넋 생존자 목록 | 오른쪽 '고개 관전'·안내 두 줄 자리에, 토큰 줄, 고개마다 32px 줄 + [5냥] 38×24(받은 고개는 '받음'), 줄 누르면 관전, 단추는 그 고개로 보냄(질문 6 가), 자리 순서, 보낸 뒤 '2번 범수에게 5냥을 보냈습니다' 3초(28px 미리 비움) | 10 |
| 넋 카드 횟수 | '이번 판 보낸 엽전 N회'(클라이언트가 셈) | 10 |
| ㉑ 받는 쪽 | 엽전 숫자 1초 금색 + '+5' 0.8초 떠오름, 장터 기둥 창이면 머리 줄 엽전, 엽전 없는 기둥 창이면 윗칸 '3번 넋이 보낸 엽전 +5', 효과 줄이기는 색만 | 2(자리 고르기), 10 |
| ㉒ 장터 당첨 | 5·6등급(히든 포함) 유닛 칸에 둥근 고리 지름 40, 1.2초 세 번(켜짐 240/꺼짐 160), 칸 위 'N등급!' 10px 굵게, 불꽃·흔들림 그대로, 효과 줄이기는 고리 고정 + 글만. 결과 줄 6등급 금빛 1.2초. '→ 4행 5열' 규칙 없음 | 11 |
| 8. 창 크기별 | 640×360·800×370·1280×720·1920×1080은 기둥 창이면 좁힘·창 안 단추, 1920×953은 넓은 자리·오른쪽 패널. 가장자리는 `#stage` 안쪽만 | 5·6·10(규칙), 12(확인) |
| 층과 Esc | 위 Global Constraints 표대로 z-index, 4층 이상이면 2·3층 inert(B2 `sidesLocked`에 `paused`·`scene` 넣기) | 6, 8 |
| 연출 값 표 | 줄마다 시간·가속·효과 줄이기 값 | 각 줄의 작업(5·6·7·9·10·11), 값은 이 표에서 그대로 |
| 동시에 움직이는 것 | 반복은 판 전체 하나(카운트다운 숫자 > 초과 장승 > 위험 가장자리 > B1 ▲), 한 번 움직임은 DOM에서 동시에 둘까지 | 2(순위·상한), 4(장승·가장자리·▲), 7(카운트다운), 6·9·10(한 번 움직임) |
| 효과 줄이기 기본값 | 저장한 값이 없으면 OS '움직임 줄이기', OS가 바뀌면 저장값이 없을 때만 따라감, `body.fx-reduced` | 2(읽기), 4(연결) |
| 소리 | 초과 들어갈 때 `error` 낮게 한 번(2초 안 재진입 생략), 탈락 징 낮게, 남의 탄생 `combineBig` 뺌, 결과음은 장면 시작 때 | 4, 9, 5, 8 |
| 오라 고리·폭발 | halo 투명도 .35~.5, 반복은 고른 오라 유닛 범위 안만, 칸 32px 안. pulse .25~.4·한 번에 3개, explode 주황 계열·.5~.7·300ms 이하·동시 4개, 보스 체력바·도깨비불 안 덮음 | 11(값), 12(전후 스크린샷) |
| 확인 방법(브라우저) | 솔로 47·48·57·60·61, 70라운드 보스+멈춤+58마리 상단 줄, P 멈춤, 65라운드, 기둥 창 좁힘, 온라인 두 탭(카운트다운·실패·포기·끊김·넋), 효과 줄이기, 접근성 트리, 오라 전후 | 12 |

## 파일 구조

| 파일 | 맡는 일 | 작업 |
|---|---|---|
| `packages/client/src/ui/models.ts` | `limitLevel`, `hudModel` 단계 값 | 1 |
| `packages/client/src/ui/signals.ts` (새) | `TopSlot`(윗칸 대기열), `slotSpan`, `refusalSpot`·`refusalPos`, `coinSpot`, `loopOwner`, `OneShots`, `endSceneText`·`EndScene` | 2 |
| `packages/client/src/fx/plan.ts` | `readReduceFx`가 OS 설정을 따름, `storedReduceFx`; 오라·폭발 값 상수, `auraBuffedBy` | 2, 11 |
| `packages/client/src/online/models.ts` | `topModel` 둘째 줄, `gateDeadlineRound`, `gateCountdown`, `arrivalModel`(옛 `myTurnText` 대신), `rowsModel` 단계·칩·끊김, `fallenSeats`·`returnedSeats`, `STAGE_NAME` 내보내기, `supportCount` | 3, 10 |
| `packages/client/src/ui/hud.ts` | 단계별 HUD·가장자리·초과 상자, `.notice` 없앰, 멈춤 알약 | 4, 6 |
| `packages/client/src/LaneScene.ts` | 장승 색·흔들림·이름표, '입구' 10px, `body.fx-reduced`·OS 따라가기, 토스트를 페이지로, 당첨 고리 | 4, 5, 11 |
| `packages/client/src/fx/FxLayer.ts`, `src/ui/birth.ts` | 띠 높이·모양, 토스트 넘기기, 오라·폭발 값 | 5, 11 |
| `packages/client/src/ui/mount.ts` | 알림 자리 그리기, 거절, 멈춤 덮개, 관문, 결과 장면, 왼쪽 줄 표시, 넋 목록·받는 쪽 | 4~10 |
| `packages/client/src/online/panels.ts` | `renderTop`·`renderRows` | 4, 7, 9 |
| `packages/client/src/online/spirit.ts` | `survivorsModel`·`survivorsHtml`, 보낸 횟수, `support(target)` | 10 |
| `packages/client/src/ui/panels.ts`, `src/ui/windows.ts` | `renderRight` 엽전 밝아짐, `rightBarHtml` 엽전 밝아짐 | 10 |
| `packages/client/src/online/result.ts`, `src/online/battle.ts` | 결과 화면을 장면 뒤로 | 8 |
| `packages/client/src/ui/gamble.ts` | 6등급 결과 줄 금빛 1.2초 | 11 |
| `packages/client/src/audio/cues.ts` | `limitOver`·`fallen` 소리 | 4, 9 |
| `packages/client/index.html`, `test/fixtures/net.ts` | `#round-banner`의 `aria-live` 빼고 `aria-hidden` | 5 |
| `packages/client/src/ui/style.css` | 단계 색·가장자리·알림 자리·거절·덮개·장면·줄·넋·엽전 효과, z-index | 4~11 |

---

### Task 1: 잡귀 한도 단계 `limitLevel`과 HUD 모델 (순수)

설계: 판정 기준 '잡귀 한도', ①②⑥의 글.

**Files:**
- Modify: `packages/client/src/ui/models.ts`
- Test: `packages/client/test/limit-level.test.ts` (새)

**Interfaces:**
- Produces:
  ```ts
  export type LimitLevel = 'ok' | 'warn' | 'danger' | 'over';
  export function limitLevel(data: GameData, count: number, round: number): { level: LimitLevel; instant: boolean };
  /** '주의' · '2마리 남음' · '한계' · '초과', null when ok */
  export function limitTail(level: LimitLevel, count: number, limit: number): string | null;
  hudModel(state) 결과에 더함: { count: number; limit: number; level: LimitLevel; instant: boolean; tail: string | null; crackShown: boolean; overBy: number }
  ```
  `crackShown`은 `level !== 'danger'`. `overBy`는 초과일 때 `count − limit`, 아니면 0. 기존 필드(`enemyText`·`danger`·`crack` 등)는 그대로 둔다.

- [ ] **Step 1: 실패하는 시험 쓰기** — `limit-level.test.ts`:

```ts
const d3 = loadGameData('stage3'), d1 = loadGameData();
test.each([[47, 'ok'], [48, 'warn'], [56, 'warn'], [57, 'danger'], [60, 'danger'], [61, 'over']])('%i enemies: %s', (n, level) => {
  expect(limitLevel(d3, n, 30).level).toBe(level);
});
test('the warn line is coop.danger when there is one, else ceil(limit x 0.8)', () => {
  expect(limitLevel({ ...d3, coop: { ...d3.coop!, danger: 45 } }, 45, 1).level).toBe('warn');
  expect(limitLevel({ ...d1, coop: undefined }, 48, 1).level).toBe('warn');
});
test('instant defeat from round 65 on boards that reach it', () => {
  expect(limitLevel(d3, 58, 64).instant).toBe(false);
  expect(limitLevel(d3, 58, 65).instant).toBe(true);
  expect(limitLevel(difficultyData(d3, 'easy'), 58, 60).instant).toBe(false);
  expect(limitLevel(d1, 58, 20).instant).toBe(false);
});
test('tails', () => {
  expect([limitTail('ok', 10, 60), limitTail('warn', 50, 60), limitTail('danger', 58, 60), limitTail('danger', 60, 60), limitTail('over', 63, 60)])
    .toEqual([null, '주의', '2마리 남음', '한계', '초과']);
});
test('hudModel carries the level, hides the 장승 word only in danger, and counts how many to cut when over', () => {
  // build states with placeUnitForTest / enemies the way models.test.ts does for crackText
  expect(pick(hudModel(withEnemies(58)))).toEqual({ count: 58, limit: 60, level: 'danger', tail: '2마리 남음', crackShown: false, overBy: 0 });
  expect(pick(hudModel(withEnemies(63)))).toMatchObject({ level: 'over', tail: '초과', crackShown: true, overBy: 3 });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/limit-level.test.ts` → FAIL(`limitLevel` 없음).
- [ ] **Step 3: 구현** — 위 시그니처를 `models.ts`에. 주의 `data.coop?.danger ?? ceil(limit × 0.8)`, 위험 `ceil(limit × 0.95)`, 초과 `count > limit`. `instant`는 `limitInstantFromRound !== undefined && round >= 그 값`(쉬움은 60라운드에서 끝나 저절로 false). `hudModel`은 `countNormalEnemies`를 한 번만 센다.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm test`, `npm run typecheck`.
- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/ui/models.ts packages/client/test/limit-level.test.ts
git commit -m "Grade the enemy count into ok, warn, danger and over from one function"
```

끝난 기준: 경계값 47/48, 56/57, 60/61, 64/65라운드, 쉬움, 20라운드 판이 시험으로 고정됨.

---

### Task 2: 알림 자리 대기열·거절 자리·움직임 순위·결과 장면 시간 (순수)

설계: ⑰ 순서 규칙, ⑧ 자리 고르기, ㉑ 자리, '동시에 움직이는 것 상한', ⑫ 문구·시간, '효과 줄이기 기본값'.

**Files:**
- Create: `packages/client/src/ui/signals.ts`
- Modify: `packages/client/src/fx/plan.ts` (`readReduceFx`)
- Test: `packages/client/test/signals.test.ts` (새), `packages/client/test/fx-plan.test.ts`(읽기 시험 추가)

**Interfaces:**
- Consumes: `NOTICE_SPAN`(layout), `WinPlace`(layout), `Sides`(windows), `BirthBanner`(birth).
- Produces:
  ```ts
  export type SlotKind = 'countdown' | 'birth' | 'banner' | 'fallen' | 'note';
  export interface SlotItem { kind: Exclude<SlotKind, 'countdown'>; text: string; ms: number; say?: string; tail?: string; birth?: BirthBanner }
  export interface SlotShown { kind: SlotKind; item: SlotItem | null; start: number; until: number }
  export const SLOT_RANK: Record<SlotKind, number>;        // countdown 1, birth 2, banner 3, fallen 4, note 5
  export const NOTE_WAIT_MS = 3000, BANNER_LATE_MS = 1200, BIRTH_WAITING_MAX = 4;
  export class TopSlot {
    push(item: SlotItem, now: number): void;
    /** countdown=true holds the slot; the item it pushed off goes back to wait (a note is dropped) */
    current(now: number, countdown: boolean): SlotShown | null;
    clear(): void;
  }
  export function slotSpan(narrow: boolean): { x: number; w: number };   // { x: 128, w: 400 } | NOTICE_SPAN
  export type RefusalSpot = { at: 'button'; selector: string } | { at: 'win'; side: 'left' | 'right'; selector: string } | { at: 'slot' };
  export function refusalSpot(command: { type: string; arg?: string }, visible: (selector: string) => boolean): RefusalSpot;
  export function refusalPos(button: { left: number; top: number; width: number }, box: { w: number }, containerW: number): { left: number; top: number };
  export function coinSpot(wins: WinPlace, sides: Sides): 'right' | 'win' | 'slot';
  export type LoopOwner = 'countdown' | 'jangseung' | 'edge' | 'triangle';
  export function loopOwner(o: { countdownPulse: boolean; over: boolean; danger: boolean }): LoopOwner;
  export class OneShots { begin(now: number, ms: number): boolean }    // at most 2 running
  export type EndKind = 'gate' | 'wipe' | 'clear' | 'soloDefeat' | 'soloClear';
  export function endSceneText(kind: EndKind, stageName?: string): string;
  export const END_SCENE_MS = 1500, END_SCENE_SUB = '곧 결과 화면 · 누르면 바로';
  export class EndScene { start(kind: EndKind, text: string, now: number): void; active(now: number): boolean; skip(): void; get kind(): EndKind | null }
  // fx/plan.ts
  export function storedReduceFx(storage?: Storage): boolean | null;
  export function readReduceFx(storage?: Storage, media?: { matches: boolean } | null): boolean;
  ```
  거절 단추 표(`refusalSpot` 안): `summon` → 패널 `#right [data-action="summon"]`, 창 `#win-right .win-summon`; `convertToken` → `#right [data-action="convert"]`; `upgrade` → 창 `#win-right [data-action="upgrade"][data-arg="<arg>"]`(강화 창 안 단추, 그 자체가 창 안이라 `at: 'win'`); `sell` → `#bottom [data-action="sell"]`, 창 `#win-left [data-action="sell"]`. 그 밖의 명령(조합·도박·사냥·길들이기·보관 등)과 보이는 단추가 없을 때는 `slot`. `visible`은 화면에 있고 inert 안에 있지 않은지를 mount가 판단해 넘긴다.
  `refusalPos`: 상자 밑변(꼬리 4px 포함)이 단추 윗변에 닿게 `top = button.top − 20`(상자 16 + 꼬리 4), 가운데 맞춤 뒤 컨테이너 안 2px 여백으로 자른다.
  `coinSpot`: `wins === 'inside'`이고 `sides.right === 'market'`이면 `win`, `inside`이고 다른 오른쪽 창이면 `slot`, 나머지는 `right`.
  `endSceneText`: gate `관문 실패 · 역신(첫째)을 막지 못했습니다`(stageName 없으면 `관문 실패 · 역신을 막지 못했습니다`), wipe `모두 쓰러졌습니다`, clear·soloClear `고개를 지켜 냈습니다`, soloDefeat `장승이 쓰러졌습니다`.

- [ ] **Step 1: 실패하는 시험 쓰기** — `signals.test.ts`:

```ts
const note = (text: string, ms = 1500): SlotItem => ({ kind: 'note', text, ms });
test('one at a time; the waiting one with the best rank goes next', () => {
  const s = new TopSlot();
  s.push(note('a'), 0);
  expect(s.current(0, false)?.item?.text).toBe('a');
  s.push({ kind: 'fallen', text: 'f', ms: 3000 }, 10); s.push({ kind: 'banner', text: 'b', ms: 1800 }, 20);
  expect(s.current(1500, false)).toMatchObject({ kind: 'banner', until: 1500 + BANNER_LATE_MS });   // waited, so short
  expect(s.current(2700, false)?.kind).toBe('fallen');
});
test('a note that waited over 3 s is dropped, a fallen notice never is', () => {
  const s = new TopSlot();
  s.push({ kind: 'fallen', text: 'f', ms: 3000 }, 0); s.push(note('late'), 0);
  expect(s.current(0, false)?.kind).toBe('fallen');
  expect(s.current(3001, false)).toBeNull();       // "over 3 s": 3000 exactly still shows
});
test('the countdown holds the slot and gives the banner back afterwards', () => {
  const s = new TopSlot();
  s.push({ kind: 'banner', text: 'b', ms: 1800 }, 0);
  s.current(0, false);
  expect(s.current(500, true)?.kind).toBe('countdown');
  s.push(note('n'), 600);
  expect(s.current(9000, false)?.kind).toBe('banner');      // the note waited over 3 s and is gone
});
test('births wait four deep at most', () => { /* push 6 births at 0: current + 4 waiting, the oldest waiting one dropped */ });
test('slotSpan', () => { expect([slotSpan(false), slotSpan(true)]).toEqual([{ x: 128, w: 400 }, { x: 200, w: 254 }]); });
test('refusal spot: the button, else the same button in the window, else the slot', () => {
  const vis = (...on: string[]) => (sel: string) => on.includes(sel);
  expect(refusalSpot({ type: 'summon' }, vis('#right [data-action="summon"]'))).toEqual({ at: 'button', selector: '#right [data-action="summon"]' });
  expect(refusalSpot({ type: 'summon' }, vis('#win-right .win-summon'))).toEqual({ at: 'win', side: 'right', selector: '#win-right .win-summon' });
  expect(refusalSpot({ type: 'combine' }, vis())).toEqual({ at: 'slot' });
  expect(refusalSpot({ type: 'upgrade', arg: 'physical' }, vis('#win-right [data-action="upgrade"][data-arg="physical"]')).at).toBe('win');
});
test('refusalPos sits 20 px over the button and stays inside', () => {
  expect(refusalPos({ left: 560, top: 100, width: 60 }, { w: 120 }, 640)).toEqual({ left: 518, top: 80 });
  expect(refusalPos({ left: 0, top: 100, width: 40 }, { w: 120 }, 640).left).toBe(2);
});
test('coinSpot', () => {
  expect(coinSpot('inside', { left: null, right: 'market', last: 'right' })).toBe('win');
  expect(coinSpot('inside', { left: null, right: 'quests', last: 'right' })).toBe('slot');
  expect(coinSpot('outside', { left: null, right: 'quests', last: 'right' })).toBe('right');
  expect(coinSpot('inside', NO_SIDES)).toBe('right');
});
test('one looping motion on the board, by rank', () => {
  expect(loopOwner({ countdownPulse: true, over: true, danger: true })).toBe('countdown');
  expect(loopOwner({ countdownPulse: false, over: true, danger: false })).toBe('jangseung');
  expect(loopOwner({ countdownPulse: false, over: false, danger: true })).toBe('edge');
  expect(loopOwner({ countdownPulse: false, over: false, danger: false })).toBe('triangle');
});
test('two one-shot motions at once at most', () => {
  const o = new OneShots();
  expect([o.begin(0, 1000), o.begin(10, 1000), o.begin(20, 1000), o.begin(1001, 1000)]).toEqual([true, true, false, true]);
});
test('end scene texts and timing', () => {
  expect(endSceneText('gate', '첫째')).toBe('관문 실패 · 역신(첫째)을 막지 못했습니다');
  expect(['wipe', 'clear', 'soloDefeat', 'soloClear'].map(k => endSceneText(k as EndKind)))
    .toEqual(['모두 쓰러졌습니다', '고개를 지켜 냈습니다', '장승이 쓰러졌습니다', '고개를 지켜 냈습니다']);
  const e = new EndScene(); e.start('wipe', 'x', 0);
  expect([e.active(1499), e.active(1500)]).toEqual([true, false]);
  e.start('wipe', 'x', 0); e.skip(); expect(e.active(1)).toBe(false);
});
```

`fx-plan.test.ts`에 추가: 저장값 `'1'`/`'0'`이 있으면 그 값, 없으면 `media.matches`, 저장소가 던지면 `media`를 따름, `storedReduceFx`는 없을 때 `null`.

- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/signals.test.ts packages/client/test/fx-plan.test.ts` → FAIL.
- [ ] **Step 3: 구현** — `signals.ts`에 위 Interfaces. `TopSlot`은 대기 줄을 `{ item, pushedAt }`로 들고, `current`가 만료·버림·순위 고르기를 한다(같은 순위는 먼저 온 것부터). 밀려서 기다렸던 배너(`start > pushedAt`)는 `BANNER_LATE_MS`. 카운트다운이 밀어낸 항목은 note면 버리고, 아니면 같은 순위 맨 앞으로 되돌려 처음 길이로 다시 띄운다. `readReduceFx`의 `media` 기본값은 `globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null`.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm test`, `npm run typecheck`.
- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/ui/signals.ts packages/client/src/fx/plan.ts packages/client/test/signals.test.ts packages/client/test/fx-plan.test.ts
git commit -m "Model the notice slot queue, refusal spots, motion rank and end scene as pure rules"
```

끝난 기준: ⑰ 순서·버림·짧게, ⑧ 세 경우, ㉑ 세 경우, 움직임 순위, 결과 장면 문구 다섯과 1.5초가 시험으로 고정됨.

---

### Task 3: 온라인 관문·왼쪽 줄 판정 (순수)

설계: ⑨ ⑩ ⑪ ⑬ ⑭ ⑮(감지) ⑯, '내 고개의 위험 단계'.

**Files:**
- Modify: `packages/client/src/online/models.ts`
- Test: `packages/client/test/online-models.test.ts`, `packages/client/test/copy-terms.test.ts`(`mineDanger` → `mineLevel`)

**Interfaces:**
- Consumes: `limitLevel`, `limitTail`, `LimitLevel` (Task 1).
- Produces:
  ```ts
  export const STAGE_NAME: readonly string[];  // ['', '첫째', …] 지금 것을 내보냄
  export interface TopModel { line1: string; line2: string; gateUrgent: boolean; mine: string | null; mineLevel: LimitLevel | null; mineTail: string | null }
  export function gateDeadlineRound(view: ClientView, data: GameData): number | null;
  export interface GateCountdown { seconds: number; hp: number; maxHp: number; where: string; say: string | null }
  export function gateCountdown(view: ClientView, data: GameData): GateCountdown | null;
  export interface Arrival { text: string; seconds: number; urgent: boolean }
  export function arrivalModel(view: ClientView, data: GameData): Arrival | null;
  export interface RowModel { seat: number; empty: boolean; title: string; count: string; level: LimitLevel | null; status: string;
    chip: 'next' | 'current' | null; progress: number | null; me: boolean; spirit: boolean; offline: boolean }
  export function rowsModel(view: ClientView, data: GameData, returned?: ReadonlySet<number>): RowModel[];
  export function fallenSeats(prev: readonly RowView[] | null, next: readonly RowView[]): RowView[];
  export function returnedSeats(prev: readonly RowView[] | null, next: readonly RowView[]): number[];
  ```
  - `TopModel`에서 `myTurn`·`mineDanger`를 뺀다(⑬으로 옮김). `mine`은 `내 잡귀 N / 60`(초과면 `· 초과 N초`는 빼고 꼬리 글로), `mineTail`은 `limitTail`.
  - 둘째 줄: 역신 없음 → 지금 그대로. 역신 있고 `round < deadlineRound` → `관문 1/5 · 마감까지 ${deadlineRound − round}라운드 · 역신(첫째) 체력 6,632 / 7,480`. `round === deadlineRound` → `관문 마감 · 남은 ${secondsOf(deadlineTick − tick)}초 · 역신(첫째) 체력 1,462 / 7,480`, `gateUrgent: true`.
  - `gateDeadlineRound`: 지금 관문의 `deadlineRound`(통과했으면 null). 배너 '· 관문 마감'은 작업 7에서 `event.round === gateDeadlineRound(...)`로 붙인다.
  - `gateCountdown`: 역신이 살아 있고 `clock.phase === 'round'`, `0 < deadlineTick − tick ≤ 200`(10초)일 때. `where`는 `2번 범수 고개`(역신 자리 없으면 `''`), `say`는 초가 10·5일 때만 `관문 마감 10초 전 · 역신 체력 1,462`, 나머지 null.
  - `arrivalModel`: 내가 살아 있고 `yeoksin.seat === me` → `역신이 내 고개에 · ${s}초 뒤 떠남`; `nextSeat === me`이고 `seat !== me` → `역신이 옵니다 · ${s}초`. `s`는 지금 `myTurnText` 계산(`enterTick + stay − tick`). `urgent = s ≤ 5`. `myTurnText`는 지운다(호출처 `panels.ts`는 작업 7에서 고침; 이 작업에서는 `renderRows`·`renderTop`이 컴파일되게 최소 수정).
  - 상태 글 순서: 넋(지금 `탈락·원인` 3초 → `탈락·넋`) > `초과 N초` > `위험`(57~) > `끊김 · m:ss` > `주의`(48~) > `돌아옴`(returned에 있을 때) > `생존`. `다음`은 상태 글에서 빠지고 `chip: 'next'`, 역신이 지금 있는 줄은 `chip: 'current'`. 넋 줄의 `count`는 `넋`. `offline = !connected && reconnectTicksLeft !== null`(위험·초과여도 true).
  - `fallenSeats`: prev에서 `alive`, next에서 `spirit`인 줄. `returnedSeats`: prev `connected === false` → next `true`. prev가 null이면 둘 다 빈 배열.

- [ ] **Step 1: 실패하는 시험 쓰기** — `online-models.test.ts`(기존 `viewWith` 도우미 사용):

```ts
test('second line counts rounds to the deadline, then seconds in the deadline round', () => {
  expect(topModel(gateView({ round: 7 }), data).line2).toBe('관문 1/2 · 마감까지 2라운드 · 역신(첫째) 체력 6,632 / 7,480');
  const last = topModel(gateView({ round: 9, tick: deadline - 360 }), data);
  expect([last.line2, last.gateUrgent]).toEqual(['관문 마감 · 남은 18초 · 역신(첫째) 체력 6,632 / 7,480', true]);
});
test('countdown only in the last 10 s with the 역신 alive; speaks at 10 and 5 only', () => {
  expect(gateCountdown(gateView({ round: 9, tick: deadline - 201 }), data)).toBeNull();
  expect(gateCountdown(gateView({ round: 9, tick: deadline - 200 }), data)).toMatchObject({ seconds: 10, where: '2번 범수 고개', say: '관문 마감 10초 전 · 역신 체력 6,632' });
  expect(gateCountdown(gateView({ round: 9, tick: deadline - 120 }), data)?.say).toBeNull();
  expect(gateCountdown(gateView({ round: 9, tick: deadline - 100, yeoksin: null }), data)).toBeNull();
});
test('arrival: coming, here, urgent from 5 s', () => {
  expect(arrivalModel(nextIsMe(160), data)).toEqual({ text: '역신이 옵니다 · 8초', seconds: 8, urgent: false });
  expect(arrivalModel(hereIsMe(140), data)?.text).toBe('역신이 내 고개에 · 7초 뒤 떠남');
  expect(arrivalModel(nextIsMe(100), data)?.urgent).toBe(true);
});
test('the next chip stays when the next lane is in danger', () => {
  const r = rowsModel(withRow(2, { count: 58 }, { nextSeat: 2 }), data)[1]!;
  expect([r.status, r.chip, r.level]).toEqual(['위험', 'next', 'danger']);
});
test('48 is 주의, 57 위험; a disconnected lane in danger keeps 위험 and the dashed mark', () => {
  expect(rowsModel(withRow(2, { count: 50 }), data)[1]!.status).toBe('주의');
  const r = rowsModel(withRow(2, { count: 58, connected: false, reconnectTicksLeft: 3300 }), data)[1]!;
  expect([r.status, r.offline]).toEqual(['위험', true]);
  expect(rowsModel(withRow(2, { connected: false, reconnectTicksLeft: 3300 }), data)[1]!.status).toBe('끊김 · 2:45');
});
test('spirit row reads 넋 in the count place', () => { /* status 'spirit' → count '넋', spirit true, level null */ });
test('fallen and returned seats', () => {
  expect(fallenSeats(null, rowsAfter).length).toBe(0);
  expect(fallenSeats(rowsBefore, rowsAfter).map(r => r.seat)).toEqual([2, 3]);   // two in one tick
  expect(returnedSeats(offlineRows, onlineRows)).toEqual([4]);
});
```

`copy-terms.test.ts`의 `mineDanger` 두 줄은 `mineLevel`이 `'ok'`/`'warn'`인지로 바꾼다.

- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/online-models.test.ts packages/client/test/copy-terms.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces. 숫자는 지금처럼 `toLocaleString('ko-KR')`. 끊김 시간은 `Math.ceil(ticks / 20)`초를 `m:ss`로.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm test`, `npm run typecheck`.
- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/online/models.ts packages/client/src/online/panels.ts packages/client/test/online-models.test.ts packages/client/test/copy-terms.test.ts
git commit -m "Count down the gate deadline and split the next-lane chip from the row status"
```

끝난 기준: 둘째 줄 세 단계, 카운트다운 조건과 읽는 때, 다음 칩이 위험과 함께, 끊김 글, 탈락·돌아옴 감지가 시험으로 고정됨.

---

### Task 4: 솔로 HUD·장승·가장자리 3단계, 온라인 첫 줄, 효과 줄이기 연결

설계: ①②③④⑥, 온라인 첫 줄 내 잡귀, 소리(초과 `error` 낮게), '동시에 움직이는 것'(장승·가장자리·▲), '효과 줄이기 기본값'.

**Files:**
- Modify: `packages/client/src/ui/hud.ts`, `src/LaneScene.ts`, `src/online/panels.ts`(`renderTop` 첫 줄), `src/ui/mount.ts`, `src/audio/cues.ts`, `src/ui/style.css`
- Test: `packages/client/test/hud-levels.test.ts` (새), `packages/client/test/LaneScene.test.ts`, `packages/client/test/audio.test.ts`

**Interfaces:**
- Consumes: `hudModel` 단계 값(Task 1), `loopOwner`, `readReduceFx`, `storedReduceFx`(Task 2), `TopModel.mineLevel`·`mineTail`(Task 3).
- Produces:
  ```ts
  // hud.ts
  export function renderAlert(state: GameState, opts?: { still?: boolean }): void;   // #alert classes: warn | danger | on(over); .still holds the breathing
  // LaneScene.ts
  export function jangseungLook(level: LimitLevel, now: number, shake: boolean): { fill: number; angle: number };
  LaneScene.edgeStill: boolean      // set by mount: true unless loopOwner is 'edge'
  LaneScene.shakeJangseung: boolean // set by mount: loopOwner === 'jangseung' && !reduceEffects
  // cues.ts
  EFFECTS.limitOver = { file: 'error.ogg', volume: 0.1, interval: 2000 }
  ```
  - HUD 잡귀: `<span class="enemies lv-${level}">내 잡귀 <b class="n">58</b> / 60<i class="tail">· 2마리 남음</i></span>`. CSS: `.lv-warn .n { font-size: 12px; font-weight: bold; color: #ffb396 }`, `.lv-danger .n, .lv-over .n { font-size: 13px; font-weight: bold; color: #ff9482 }`, `.tail { font-size: 10px; font-weight: bold; color: 같은 색; font-style: normal }`. 보통은 지금 마크업과 같은 모양(꼬리 글 없음).
  - 게이지: `.gauge.lv-warn i { background: #ffb396 }`, `.lv-danger/.lv-over i { background: #ff9482 }`. `crackShown`이 false면 '장승 …' 글자를 그리지 않는다(B4 5-1 ⑥과 같은 규칙, 이 계획에서 넣음). '보스 N' 줄이기는 B4.
  - 가장자리 `#alert`: `warn` → `inset 0 0 14px rgba(255,59,47,.15)`; `danger` → .22↔.32 2초 `ease-in-out infinite alternate`(`@keyframes edge-breathe`), `.still`이면 .32 고정; 초과(`on`)는 지금 `.6` 그대로. `#alert`는 지금처럼 `#stage` 안쪽만.
  - 초과 상자 ⑥: 지금 `.countdown` 안 '잡귀 한도 초과 / N초' 아래 한 줄 `<span class="cut">3마리 줄이면 멈춤</span>`(10px).
  - 장승 ④: `jangseungLook` 색 — ok `0x8a6a4a`, warn `0xd0884a`, danger·over `0xc04a3a`; `angle`은 `shake`일 때만 지금 식(`sin(now/40) × 8`), 아니면 0. 효과 줄이기에서는 흔들지 않는다. 이름표 '장승' 10px를 장승 바로 아래(`post.y + 13`, origin 0.5, 0), '입구'와 같은 스타일 객체를 함께 쓰고 '입구'도 10px. 장승 이름표는 솔로·온라인 둘 다.
  - mount `render()`: `loopOwner({ countdownPulse: false(작업 7에서 채움), over, danger })`를 구해 `scene.pulseHeld = owner !== 'triangle'`, `scene.shakeJangseung`, `renderAlert(s, { still: owner !== 'edge' || scene.reduceEffects })`. 단계가 `over`로 바뀌는 순간 `gameAudio.play('limitOver')` 한 번(직전 단계를 mount가 기억).
  - 온라인 첫 줄: `m.mine`을 `<b class="mine lv-${mineLevel}">…<i class="tail">· 주의</i></b>`로 감싼다(10px 그대로, 색만). 옛 `.mine-danger` 규칙은 지운다.
  - 효과 줄이기: LaneScene 생성 때와 `setReduceEffects`에서 `document.body.classList.toggle('fx-reduced', on)`. `storedReduceFx() === null`이면 `matchMedia('(prefers-reduced-motion: reduce)')`의 `change`를 듣고 저장하지 않은 채 `reduceFx`·`fx.setReduced`·`body.fx-reduced`를 바꾼다.

- [ ] **Step 1: 실패하는 시험 쓰기**
  - `hud-levels.test.ts`(happy-dom, `STAGE_HTML`): 잡귀 47·48·58·60·63에서 `#top .enemies`의 클래스와 꼬리 글이 `['lv-ok', null]`, `['lv-warn', '· 주의']`, `['lv-danger', '· 2마리 남음']`, `['lv-danger', '· 한계']`, `['lv-over', '· 초과']`; 58에서 `.gauge-text`가 없고 63에서 '장승 무너짐'이 있음; `#alert` 클래스가 48 `warn`, 58 `danger`, 63 `on`이고 63 상자에 '3마리 줄이면 멈춤'; `renderAlert(s58, { still: true })`면 `.still`.
  - `LaneScene.test.ts`: `jangseungLook('ok'|'warn'|'danger', 0, false).fill`이 세 색, `jangseungLook('over', 100, false).angle === 0`, `jangseungLook('over', 100, true).angle !== 0`.
  - `audio.test.ts`: `EFFECTS.limitOver`가 `error.ogg`이고 `interval` 2000, 볼륨이 `error`보다 낮음.
  - mount 시험(`hud-levels.test.ts` 안 `mountSolo`, side-windows.test.ts 방식): 58마리 + 고른 유닛 없음에서 `scene.pulseHeld === true`, 30마리에서 false; 61로 넘어갈 때 `gameAudio.play`가 `'limitOver'`로 한 번.
- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/hud-levels.test.ts packages/client/test/LaneScene.test.ts packages/client/test/audio.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces와 CSS. `renderHud`의 세 번째 인자 `notice`는 이 작업에서는 그대로 둔다(작업 6에서 없앰).
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm test`, `npm run typecheck`. 기존 `copy-terms`·`ux-text`·`models.test.ts`의 HUD 글 시험이 깨지면 새 마크업 기준으로 고친다(글은 바뀌지 않음).
- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/ui/hud.ts packages/client/src/LaneScene.ts packages/client/src/online/panels.ts packages/client/src/ui/mount.ts packages/client/src/audio/cues.ts packages/client/src/ui/style.css packages/client/test/hud-levels.test.ts packages/client/test/LaneScene.test.ts packages/client/test/audio.test.ts
git commit -m "Show the enemy limit in three steps on the HUD, the edge and the jangseung"
```

끝난 기준: 보통(47 이하)은 지금과 같은 모양, 단계마다 글이 붙음, 효과 줄이기·OS 설정에서 숨쉬기·흔들림이 멈춤.

---

### Task 5: 판 위쪽 알림 자리 — 윗칸 대기열, 아래 고정 줄, 내 탄생 띠

설계: ⑰ ⑱ ⑤, ⑲(띠 없앰·소리), 스크린리더, 연출 값 표 '알림 자리 글'·'내 탄생 띠'.

**Files:**
- Modify: `packages/client/src/ui/mount.ts`, `src/LaneScene.ts`, `src/fx/FxLayer.ts`, `src/ui/birth.ts`, `src/ui/style.css`, `packages/client/index.html`, `packages/client/test/fixtures/net.ts`
- Test: `packages/client/test/top-slot-ui.test.ts` (새), `packages/client/test/birth.test.ts`, `packages/client/test/notice-span.test.ts`

**Interfaces:**
- Consumes: `TopSlot`, `SlotItem`, `slotSpan`, `OneShots`(Task 2), `hudModel.level/instant`(Task 1).
- Produces:
  ```ts
  // mount 안
  const topSlot: TopSlot;                         // later tasks push into it
  function slotNote(text: string, ms?: number, say?: string): void;   // kind 'note', default 1500 ms
  // DOM (mount creates when missing, like #econ-top): #slot-row > #gate-near + #limit-instant, #slot-say (sr-only, role="status", aria-atomic="true")
  // LaneScene / FxLayer
  LaneScene.onToast?: (text: string, color: number) => void;   // FxLayer.toast forwards to it when set
  export function birthBand(): { y: 23; half: 21 };              // canvas px = stage y 26~68
  export function birthLine(b: BirthBanner): string;             // `${who} · ${sub}`
  ```
  - `#round-banner`가 윗칸이다. `index.html`·`STAGE_HTML`에서 `aria-live`를 빼고 `aria-hidden="true"`. 그리는 것: banner·fallen·note는 글(줄바꿈 `\n` → 두 줄, `-webkit-line-clamp: 2` 말줄임), `tail`은 `<b class="slot-tail">`(붉은 `#ff9482`). birth는 글 없음(Phaser 띠가 그림). countdown은 작업 7.
  - 읽어 주기: `#slot-say`는 한 번 만들어 두고 `textContent`만 바꾼다. 항목의 `say ?? text`(줄바꿈은 ' · ')가 바뀔 때만 쓴다. 다른 곳에는 `aria-live`를 새로 두지 않는다(장터 창 안 두 개는 그대로).
  - 들어옴 160ms 페이드 + 위에서 4px, 나감 110ms(`until − 110` 지나면 `.out`), 효과 줄이기는 바로.
  - 넣는 곳: `roundStart` 배너(지금 1800ms, 지금 글) → `push({ kind: 'banner' })`. `say()`(퀘스트·지게·사냥 안내 등 `NOTE_TYPES`) → note(`NOTE_MS`). 장터 '유닛이 바뀌어 지게 목록을 닫았습니다' 등 `say` 호출 전부 note. Phaser 토스트(4·5등급 ★, `gambleHit` 글, `showGambleNotice` 남의 도박 당첨) → `scene.onToast` → note 1500ms. 거절은 작업 6 전까지 지금 자리.
  - 지금 `bannerText`·`moved`(econ 안내가 둘이면 오른쪽 알림 칸으로) 규칙: 윗칸 항목이 글일 때 그대로 적용한다(`renderEcon`이 0을 돌려주는 지금은 바뀌는 것 없음).
  - 내 탄생: `showBirth(alert, true)` → `push({ kind: 'birth', birth, ms: BIRTH_MS, text: birthLine(b), say: `${birthLine(b)} · ${b.title}` })`. 그 항목이 `current`가 되는 첫 그리기에 `scene.showBirth(b)`. FxLayer 띠: `birthBand()` 고정값, 그림 40px(`setScale(1.25)`), 첫 줄 `birthLine` 10px, 둘째 줄 이름 16px 굵게(옛 세 줄 `birthWho`·`birthSub` 합침). 펼침 240ms, 나감 160ms, 효과 줄이기는 펼침 없이.
  - 남의 탄생: `showBirth(alert, false)`는 띠를 만들지 않는다. `flashUntil`(줄 금빛)과 줄 글용 기록(작업 9가 읽음: `peerBirth: Map<seat, { name: string; hidden: boolean; until: number }>`)만 남기고 소리는 `sparkle`만.
  - 아래 고정 줄 `#slot-row`: 무대 x 128, y 68, 폭 400, 높이 14, `pointer-events: none`. `#limit-instant`은 오른쪽 끝, `hud.instant && level ∈ {danger, over}`이고 판이 진행 중일 때 '61마리면 바로 패배'(10px, `#ff9482`). 솔로·온라인 둘 다(온라인은 내 고개 기준). `#gate-near`는 작업 7.
  - 좁힘: `noticeNarrow`(B2, 기둥 창이 열리고 잠기지 않았을 때)면 `#stage.pillar-open #slot-row { left: 200px; width: 254px }`. `#round-banner` 좁힘은 B2 CSS 그대로.

- [ ] **Step 1: 실패하는 시험 쓰기** — `top-slot-ui.test.ts`(happy-dom, `mountSolo`/온라인 `FakeRoom`):

```ts
test('the round banner and a note share one slot, the note waits', () => { /* roundStart then a jige note: #round-banner shows the banner text, after 1800 ms the note */ });
test('only #slot-say speaks, and only when the sentence changes', () => {
  // render twice with the same banner: textContent set once (spy on the setter or count MutationObserver records)
  expect(document.querySelectorAll('#stage [aria-live], #stage [role="status"]').length).toBe(1);
  expect($('#round-banner')!.getAttribute('aria-hidden')).toBe('true');
});
test('a phaser toast lands in the slot', () => { scene.onToast!('★ 귀교 목수', 0xffe35a); render(); expect($('#round-banner')!.textContent).toContain('★ 귀교 목수'); });
test('my birth takes the slot before a waiting banner and is handed to the scene once', () => { /* showBirth spy called once */ });
test('a peer birth shows no band and plays sparkle only', () => { /* online notice for seat 2: scene.showBirth not called, play called with 'sparkle' and not 'combineBig' */ });
test('61마리면 바로 패배 from round 65 in danger, on the right of the fixed row', () => { /* stage3 state round 65, 58 enemies: #limit-instant text; round 64: empty */ });
test('a pillar window narrows the fixed row; a P pause lifts the narrowing again', () => {
  // open market inside: #stage.pillar-open; press P: locked → pillar-open off (B2 memo: setNoticeSpan(false) while paused)
});
```

  `birth.test.ts`: `birthBand()`가 `{ y: 23, half: 21 }`(띠가 무대 y 26~68 안), `birthLine`이 '조합 · 6등급 · 마딜 · 이번 판 첫 6등급'. 옛 `toastY` 시험은 지운다(토스트가 DOM으로 감). `notice-span.test.ts`는 그대로 통과해야 한다.
- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/top-slot-ui.test.ts packages/client/test/birth.test.ts packages/client/test/notice-span.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces. `render()`에서 `topSlot.current(now, false)`(작업 7이 두 번째 인자를 채움)를 그린다. 판이 끝나면(`s.phase === 'ended'`) `topSlot.clear()`. `resetUi`에서도 `clear()`. `FxLayer.toast`는 `host.toast`가 있으면 넘기고 그리지 않는다(시험·헤드리스용으로 옛 그리기는 남김).
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm test`, `npm run typecheck`. `ui-feedback`·`online-mount` 등 `#round-banner` 글을 보던 시험은 새 자리 기준으로 고친다.
- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/ui/mount.ts packages/client/src/LaneScene.ts packages/client/src/fx/FxLayer.ts packages/client/src/ui/birth.ts packages/client/src/ui/style.css packages/client/index.html packages/client/test/fixtures/net.ts packages/client/test/top-slot-ui.test.ts packages/client/test/birth.test.ts packages/client/test/notice-span.test.ts
git commit -m "Queue the notices over the lane in one slot and keep my birth band above the entrance"
```

끝난 기준: 판 위 알림이 y 26~82 안에서 한 번에 하나, 남의 탄생 띠 없음, 읽어 주는 곳 하나.

---

### Task 6: 거절 알림과 P 멈춤 덮개

설계: ⑦ ⑧, 층(4층 덮개·5층 잠그는 창), 연출 값 표 '버튼 위 거절'·'멈춤 덮개'.

**Files:**
- Modify: `packages/client/src/ui/mount.ts`, `src/ui/hud.ts`, `src/ui/style.css`
- Test: `packages/client/test/refusal-ui.test.ts` (새), `packages/client/test/ui-feedback.test.ts`

**Interfaces:**
- Consumes: `refusalSpot`, `refusalPos`, `OneShots`(Task 2), `topSlot`·`slotNote`(Task 5), B2 `sidesLocked`.
- Produces:
  ```ts
  export function renderHud(state: GameState, userPaused: boolean): void;   // notice 인자 없앰, '· 멈춤' → <i class="pill">멈춤</i> 10px
  // mount 안
  function refuse(text: string, command?: { type: string; arg?: string }): void;   // error 소리 + 자리 고르기
  // DOM: .refusal (in #stage, or in #win-left/#win-right when at 'win'), #pause-cover (mount creates in #stage)
  ```
  - `refuse`: `refusalSpot(command, visible)`. `visible(sel)`은 그 요소가 있고 `offsetParent`가 있으며 `closest('[inert]')`가 없을 때. `button` → `#stage`에 `.refusal`(무대 px: 단추 `getBoundingClientRect` ÷ 판 배율 − `#stage` 위치), `win` → 그 창 상자 안(창 px). `slot` → `slotNote(text, 1500)`. 상자: 배경 `#3a1a1f`, 테두리 1px `#ff6b5a`, 글자 `#ffd9cf` 10px, 아래로 향한 꼬리 4px, 1.5초 뒤 사라짐. 들어옴 120ms + 좌우 2px 두 번(160ms, `OneShots`가 허락할 때만, 효과 줄이기에서는 없음), 나감 80ms. 새 거절이 오면 이전 상자를 바꾼다.
  - 창 상자는 `setHtml`로 다시 그려진다. mount는 `refusal: { side, selector, text, until } | null`을 들고 `renderSides` 뒤 상자 안에 `.refusal`이 없으면 흔들림 없이 다시 붙인다.
  - 거절 출처: `driver.onEvents`의 `rejected` 루프(지금 `notice = …` 줄) → `refuse(text, r.command)`(소리는 `audio/battle.ts`가 이미 내므로 여기서는 소리 없이). 지금 `refuse(t.label)`·`refuse(rejectText('noJige'))`·지게 취소 → 명령 종류를 넘김(`tame`·`jigeSwap` → `slot`). 솔로 HUD `.notice`와 온라인 배너 속 `notice`를 없앤다(`bannerText`의 `activeNotice(notice)` 부분, `renderHud` 셋째 인자).
  - 멈춤 중 게임 키·단추: `act()` 첫머리에서 `!online && userPaused && GAME_ACTIONS.has(action)`이면 `refuse('멈춤 중입니다 · P로 계속', { type: COMMAND_OF[action] ?? action, arg })` 후 끝. `COMMAND_OF = { summon: 'summon', convert: 'convertToken', sell: 'sell', upgrade: 'upgrade' }`. 도감으로 멈춘 경우는 이 글을 쓰지 않는다(그때는 `modal`이 키를 받음).
  - 덮개 `#pause-cover`: `!online && userPaused && s.phase !== 'ended'`일 때만 보임(도감·메뉴로 멈출 때는 없음). 판 자리(`left: 128px; top: 24px; width: 400px; height: 308px`)를 `#0d0a14` 55%로 덮고 가운데 '멈춤'(13px 굵게), 아래 `<button data-action="resume">계속 (P)</button>`(64×24, 10px). `act('resume')` → `userPaused = false`. `onAction(el('pause-cover'), act)`. 들어옴 120ms, 나감 80ms, 효과 줄이기 바로.
  - z-index: `#pause-cover` 3, `#modal` 4, `#end-scene` 5(작업 8에서 그 요소), `#error` 6. 모달이 열려 있으면 `#pause-cover`도 `inert`(지금 `inert` 걸어 주는 목록에 넣음).
  - P 멈춤 중 Esc는 멈춤을 풀지 않는다(지금 그대로, 시험으로 고정).

- [ ] **Step 1: 실패하는 시험 쓰기** — `refusal-ui.test.ts`:

```ts
test('Space with no token: the box sits over the right panel 뚝딱', () => { /* tokens 0, key('Space'): .refusal in #stage, text '도깨비불이 없습니다', above #right summon */ });
test('with the market in the pillar the box goes over the window 뚝딱', () => { /* data-wins inside, open market: .refusal inside #win-right */ });
test('창이 다시 그려져도 거절 상자가 남는다', () => { /* after refusal in #win-right, change coins and render: .refusal still there until 1500 ms, gone at 1600 */ });
test('a refusal with no button goes to the slot', () => { /* combine rejected: #round-banner text, no .refusal */ });
test('P pause: cover, pill, Space says 멈춤 중입니다 · P로 계속, 계속 resumes', () => {
  key('KeyP'); render();
  expect($('#pause-cover')!.hidden).toBe(false); expect($('#top .pill')!.textContent).toBe('멈춤');
  key('Space'); expect($('.refusal')!.textContent).toBe('멈춤 중입니다 · P로 계속');
  press($('#pause-cover [data-action="resume"]')); expect(driver.paused).toBe(false);
});
test('the dex pause draws no cover and no pill', () => { /* key('KeyD') */ });
test('P 멈춤 위에 설정, 닫으면 덮개가 남는다', () => {
  // P, open settings: #modal above (z 4 > 3), #pause-cover inert; close: cover visible, driver.paused still true
});
test('Esc does not lift a P pause', () => { /* key('KeyP'), key('Escape'): driver.paused true */ });
test('the HUD no longer has a notice slot', () => { /* refused summon: #top .notice missing */ });
```

- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/refusal-ui.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces와 CSS(`.refusal`, `.refusal::after` 꼬리, `@keyframes refusal-shake`, `#pause-cover`, `.hud .pill { font-size: 10px; padding: 0 4px; border-radius: 6px; background: #2a2236; color: var(--accent) }`). `ui-feedback.test.ts` 등 옛 `.notice` 자리를 보던 시험은 새 자리로 고친다.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm test`, `npm run typecheck`.
- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/ui/mount.ts packages/client/src/ui/hud.ts packages/client/src/ui/style.css packages/client/test/refusal-ui.test.ts packages/client/test/ui-feedback.test.ts
git commit -m "Show refusals over the pressed button and cover the board only for a P pause"
```

끝난 기준: Space·E·S 거절이 버튼 위(가려졌으면 창 안 단추 위), 버튼 없는 거절은 윗칸, 덮개는 P일 때만.

---

### Task 7: 온라인 관문 — 둘째 줄, 마감 배너, 마지막 10초, '역신이 옵니다'

설계: ⑨ ⑩ ⑪ ⑬, 연출 값 표 '관문 카운트다운 상자'·''역신이 옵니다''.

**Files:**
- Modify: `packages/client/src/online/panels.ts`, `src/ui/mount.ts`, `src/ui/style.css`
- Test: `packages/client/test/gate-ui.test.ts` (새), `packages/client/test/online-mount.test.ts`

**Interfaces:**
- Consumes: `topModel`(`gateUrgent`), `gateDeadlineRound`, `gateCountdown`, `arrivalModel`(Task 3), `TopSlot.current(now, countdown)`, `loopOwner`(Task 2).
- Produces:
  ```ts
  export function countdownHtml(c: GateCountdown, pulse: boolean): string;  // online/panels.ts
  export function arrivalHtml(a: Arrival): string;                          // online/panels.ts
  ```
  - `renderTop`: 둘째 줄은 `m.line2`만(끝에 붙던 myTurn 없앰), `gateUrgent`면 `.second.urgent`(줄 전체 `#ff9482`). `renderRows`의 `.arrival` 줄을 없앤다.
  - 배너 ⑩: `roundStart`에서 `online && event.round === gateDeadlineRound(view, data)`이면 배너 항목 `tail: ' · 관문 마감'`(둘째 줄 끝, 붉은색).
  - 카운트다운 ⑪: `const cd = view ? gateCountdown(view, data) : null`, `topSlot.current(now, cd !== null)`. countdown일 때 `#round-banner`에 `countdownHtml`: 붉은 상자 200×40(배경 `#32171ef0`, 테두리 `#ff836a`), 왼쪽 초 `6초` 20px, 오른쪽 '역신을 쓰러뜨리세요' 11px, 그 아래 `${where} · 1,462 / 7,480` 10px, 맨 아래 2px 체력 막대(`hp / maxHp`). 넋도 같은 것을 본다. `pulse = cd.seconds ≤ 5 && !scene.reduceEffects`이면 숫자에 `.pulse`(1 → 1.15 200ms → 1 140ms, 초가 바뀔 때마다 새 요소라 다시 돈다). `cd.say`가 있으면 `#slot-say`에 쓴다(매초 쓰지 않음). 들어옴 200ms, 나감 140ms.
  - `loopOwner`의 `countdownPulse`를 `pulse`로 채운다(작업 4의 자리).
  - ⑬: `#gate-near`(`#slot-row` 안 왼쪽 `left: 104px`, 좁혔을 때도 무대 x 232가 되게 `#stage.pillar-open #gate-near { left: 32px }`)에 `arrivalHtml`: 상자 높이 14, 10px, 왼쪽(입구 쪽)을 가리키는 꼬리, `urgent`면 숫자 `#ff9482`(움직임 없음). 들어옴 160ms, 나감 110ms. 판이 끝나면 비운다.
  - `#tame-anchor` 기본 자리와 `#econ-top` 좁힘은 B2 CSS가 이미 한다. 바꾸지 않는다.

- [ ] **Step 1: 실패하는 시험 쓰기** — `gate-ui.test.ts`(온라인 `FakeRoom`, stage2 `data`):

```ts
test('the deadline round banner ends with a red 관문 마감', () => { /* roundStart 9 → #round-banner .slot-tail ' · 관문 마감' */ });
test('the second line turns red in the deadline round and no longer carries my turn', () => { /* .second.urgent; no '다음은 내 고개' anywhere in #top; no .arrival in #left */ });
test('the last 10 s take the slot from a waiting fallen notice', () => { /* countdown html; push fallen; still countdown */ });
test('역신을 잡으면 카운트다운이 내려가고 기다린 알림이 뜬다', () => { /* yeoksin null next view: #round-banner shows the fallen notice */ });
test('the countdown speaks at 10 and 5 only', () => { /* step ticks 200→100: #slot-say changes twice */ });
test('reduced effects: no pulse class', () => {});
test('역신이 옵니다 sits at stage x 232 in the fixed row, also with a pillar window open', () => {
  expect($('#gate-near')!.textContent).toBe('역신이 옵니다 · 8초');
  // getComputedStyle left: 104px; with #stage.pillar-open: 32px inside a row at 200
});
```

  `online-mount.test.ts`의 둘째 줄 '다음은 내 고개'·`.arrival` 기대는 지운다.
- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/gate-ui.test.ts packages/client/test/online-mount.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces와 CSS.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm test`, `npm run typecheck`.
- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/online/panels.ts packages/client/src/ui/mount.ts packages/client/src/ui/style.css packages/client/test/gate-ui.test.ts packages/client/test/online-mount.test.ts
git commit -m "Warn of the gate deadline three times and say over the entrance when the yeoksin comes"
```

끝난 기준: '마감까지 N라운드' → 마감 배너 → 10초 카운트다운 순으로 보임, '역신이 옵니다'가 한 곳에만.

---

### Task 8: 실패·클리어 장면 1.5초 뒤 결과

설계: ⑫, 층 6, Esc 첫 단계, 연출 값 표 '실패 장면'.

**Files:**
- Modify: `packages/client/src/ui/mount.ts`, `src/online/result.ts`, `src/online/battle.ts`, `src/ui/style.css`
- Test: `packages/client/test/end-scene-ui.test.ts` (새), `packages/client/test/online-result-screen.test.ts`

**Interfaces:**
- Consumes: `EndScene`, `endSceneText`, `END_SCENE_SUB`(Task 2), `STAGE_NAME`(Task 3), B2 `escStep({ scene })`, `sidesLocked({ scene })`.
- Produces:
  ```ts
  // mountUi returns
  { resetUi: () => void; afterEndScene: (cb: () => void) => void }   // cb now when no scene runs
  // online/result.ts
  export function mountResult(net, root, data, go?, goRematch?, hold?: (show: () => void) => void): void;
  ```
  - 시작: 솔로는 `render()`가 `s.phase`가 `'ended'`로 바뀌는 것을 처음 볼 때(마운트 때 이미 끝났으면 시작하지 않음). kind는 `state.result.outcome === 'clear' ? 'soloClear' : 'soloDefeat'`. 온라인은 `view.result`가 처음 생길 때(마운트 때 이미 있으면 시작하지 않음), kind는 `result.outcome`, gate면 `STAGE_NAME[view.gate.stage]`.
  - 그리기: `#end-scene`(mount가 만듦, z-index 5, 판 자리 400×308)에 반투명 `#0d0a14` 50%와 가운데 상자(글 13px 굵게 + `END_SCENE_SUB` 10px). `#stage.end-scene #lane { filter: grayscale(1) brightness(.75) }` 300ms, 상자 180ms. 효과 줄이기에서는 바로.
  - 시작할 때 열린 잠그는 창(`modal`)을 닫는다(솔로는 지금 `render()` 첫머리 규칙, 온라인 메뉴도 같게). 그동안 기둥 창은 B2 `sidesLocked`의 `scene`으로 잠긴다.
  - 건너뛰기: `#end-scene` 누르기, Enter, Esc(`escStep`의 `scene` 단계가 `endScene.skip()`). 끝나면(시간 또는 건너뜀) 솔로는 `#modal`의 결과 창을, 온라인은 `afterEndScene`에 걸린 콜백(결과 화면 `show`)을 부른다. 결과 화면·결과 창은 240ms 페이드로 덮는다(효과 줄이기에서는 바로).
  - 결과음(`clear`/`defeat`)은 지금처럼 결과를 받을 때(=장면 시작) 난다. 바꾸지 않는다.
  - `battle.ts`: `const ui = mountUi(...)`, `mountResult(net, screen, data, undefined, goRematch, cb => ui.afterEndScene(cb))`. `mountResult`는 `hold`가 있으면 첫 `show`만 `hold(show)`로 미룬다. 다시 하기 준비 알림 등 그 뒤 `show`는 바로.

- [ ] **Step 1: 실패하는 시험 쓰기** — `end-scene-ui.test.ts`:

```ts
test('solo defeat: 장승이 쓰러졌습니다 for 1.5 s, then the result window', () => {
  // drive to defeat; render: #end-scene text, #modal has no .result; clock += 1500; render: #modal .result
});
test('a press, Enter or Esc skips to the result', () => {});
test('the end closes an open menu and locks the side windows', () => { /* online: open menu, result arrives: modal closed, #win-right.locked */ });
test('gate failure names the stage', () => { /* result outcome 'gate', gate.stage 1 → '관문 실패 · 역신(첫째)을 막지 못했습니다' */ });
test('붙을 때 이미 끝난 판은 장면 없이 결과', () => {
  // fixtureFull with result set before mount: #end-scene empty, afterEndScene cb runs at once
});
```

  `online-result-screen.test.ts`: `hold`를 넘기면 결과 화면이 `hold`의 콜백 전에는 없고 뒤에는 있음, `hold`가 없으면 지금처럼 바로.
- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/end-scene-ui.test.ts packages/client/test/online-result-screen.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces와 CSS.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm test`, `npm run typecheck`. 솔로 결과 창이 바로 뜨던 것을 기대한 시험(`result-hierarchy`·`solo-record` 등)은 1.5초 뒤 또는 건너뛰기 뒤로 고친다.
- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/ui/mount.ts packages/client/src/online/result.ts packages/client/src/online/battle.ts packages/client/src/ui/style.css packages/client/test/end-scene-ui.test.ts packages/client/test/online-result-screen.test.ts
git commit -m "Hold the result for a skippable 1.5 s scene that says how the game ended"
```

끝난 기준: 다섯 결말 모두 장면 뒤 결과, 건너뛰기 세 가지, 재접속 스냅샷은 장면 없음.

---

### Task 9: 온라인 왼쪽 여섯 고개 — 칩, 탈락, 끊김, 남의 탄생

설계: ⑭ ⑮ ⑯ ⑲(줄 글), '내 고개 줄 단계', 연출 값 표 '동료 탈락 줄', 소리(탈락 징 낮게).

**Files:**
- Modify: `packages/client/src/online/panels.ts`(`renderRows`), `src/ui/mount.ts`, `src/audio/cues.ts`, `src/ui/style.css`
- Test: `packages/client/test/lane-rows-ui.test.ts` (새), `packages/client/test/audio.test.ts`

**Interfaces:**
- Consumes: `rowsModel`, `fallenSeats`, `returnedSeats`(Task 3), `topSlot`(Task 5), `OneShots`(Task 2), 작업 5의 `peerBirth`.
- Produces:
  ```ts
  export interface RowMarks { birthFlash: ReadonlySet<number>; births: ReadonlyMap<number, { name: string; hidden: boolean }>; fallen: ReadonlyMap<number, 'flash' | 'still'>; returned: ReadonlySet<number> }
  export function renderRows(view: ClientView, data: GameData, overlay?: string, marks?: RowMarks): void;
  EFFECTS.fallen = { file: 'gong.ogg', volume: 0.2, interval: 450 }
  ```
  - 줄 클래스: `lv-warn`(숫자 굵은 주황), `lv-danger`·`lv-over`(줄 배경 옅은 붉은 `rgba(255,59,47,.12)`, 숫자·상태 붉은), `spirit`(글자 `#9a90a8`, 왼쪽 테두리 없음), `offline`(왼쪽 2px 점선 `#9a90a8`, 투명도 .75), `fallen-flash`(1초: 120ms에 `rgba(255,59,47,.35)`까지, 880ms에 걸쳐 사라짐), `fallen-still`(효과 줄이기 또는 `OneShots`가 거절: 붉은 배경 1초 고정).
  - 둘째 줄 오른쪽 칩: `<span class="chip next">다음</span>`(10px, 금 테두리 1px) 또는 `<span class="chip current">역신</span>`(금 채움, 글자 `--panel`) + 지금 진행 막대. '탈' 글자 없앰.
  - 남의 탄생 ⑲: `births`에 있으면 둘째 줄 상태 글 자리에 `★ 귀교 목수`(6등급 `#ffe35a`, 히든 `#c48cff`) 2.5초. 그 줄이 `danger`·`over`면 상태 글은 그대로 두고 금빛 물듦만.
  - mount: 매 그리기에 직전 `view.rows`와 비교. `fallenSeats` → 줄 표시 1초, 내 자리가 아니면 `topSlot.push({ kind: 'fallen', text: `${seat} ${name} 님이 쓰러졌습니다 · ${CAUSE_TEXT[cause]}`, say: `${seat}번 ${name} 님이 쓰러졌습니다`, ms: 3000 })`, 한 번 그리기에 `fallen` 소리 한 번. `returnedSeats` → 2초 동안 `rowsModel`의 `returned`. 기둥 창이 왼쪽 줄을 덮어도 알림과 소리는 그대로.

- [ ] **Step 1: 실패하는 시험 쓰기** — `lane-rows-ui.test.ts`:

```ts
test('a danger lane that is next keeps 위험 and shows the 다음 chip', () => {});
test('the lane with the yeoksin shows the 역신 chip and bar, no 탈', () => { expect($('#left').textContent).not.toContain('탈'); });
test('한 번에 둘이 쓰러지면 알림 둘, 소리 하나', () => {
  // next view with seats 2 and 3 spirit: two .fallen-flash rows, play('fallen') once, slot shows seat 2 then seat 3 after 3 s
});
test('my own fall flashes my row but sends no notice', () => {});
test('reduced effects: the fallen row is still red for 1 s, no flash class', () => {});
test('a disconnected lane: dashed, 끊김 · 2:45; back again: 돌아옴 for 2 s', () => {});
test('a peer birth writes ★ name on that row for 2.5 s, unless the row is in danger', () => {});
```

  `audio.test.ts`: `EFFECTS.fallen`이 `gong.ogg`이고 볼륨이 `gong`보다 낮음.
- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/lane-rows-ui.test.ts packages/client/test/audio.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces와 CSS. 기존 `.lane-row.danger`·`.mask` 규칙은 새 클래스로 바꾼다.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm test`, `npm run typecheck`. `online-mount`·`online-stage3` 등 `.danger`·'탈'·'다음' 상태 글을 보던 시험을 고친다.
- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/online/panels.ts packages/client/src/ui/mount.ts packages/client/src/audio/cues.ts packages/client/src/ui/style.css packages/client/test/lane-rows-ui.test.ts packages/client/test/audio.test.ts
git commit -m "Flash and dim a fallen lane, mark dropped ones and move the next mark to its own chip"
```

끝난 기준: 탈락·끊김·다음·역신·남의 탄생이 왼쪽 줄에서 서로 가리지 않고 보임.

---

### Task 10: 넋 생존자 목록과 받는 쪽 엽전 효과

설계: ⑳ ㉑, 넋 카드 횟수, 연출 값 표 '엽전 숫자 밝아짐'·'"+5" 떠오름'.

**Files:**
- Modify: `packages/client/src/online/spirit.ts`, `src/online/models.ts`(`supportCount`), `src/ui/mount.ts`, `src/ui/panels.ts`(`renderRight`), `src/ui/windows.ts`(`rightBarHtml`), `src/ui/style.css`
- Test: `packages/client/test/online-spirit.test.ts`, `packages/client/test/spirit-list-ui.test.ts` (새)

**Interfaces:**
- Consumes: `limitLevel`(Task 1), `coinSpot`, `OneShots`(Task 2), `topSlot`(Task 5).
- Produces:
  ```ts
  export interface SurvivorRow { seat: number; name: string; count: number; level: LimitLevel; received: boolean; canSend: boolean }
  export interface SurvivorsModel { head: string; rows: SurvivorRow[]; sentNote: string | null }
  export function survivorsModel(view: ClientView, data: GameData, sent?: SentSupport | null, now?: number): SurvivorsModel | null;
  export function survivorsHtml(m: SurvivorsModel): string;
  export interface SentSupport { seat: number; round: number; at: number; name: string }   // at: performance.now()
  export function sentCount(): number;                       // 이번 판 보낸 횟수
  OnlineActions.support(target?: number): void;               // target 없으면 관전 중인 고개(지금 동작)
  export function supportCount(): number;                     // online/models.ts: 받은 지원 누계 (noteSupport가 올림)
  renderRight opts: { coinGlow?: boolean }, rightBarHtml(state, heldCoins, coinGlow?: boolean)
  ```
  - `head`: 토큰이 있으면 `지원 토큰 1 · 이번 라운드 안에 보내세요 · 남은 18초`(남은 초 = 라운드 끝까지), 없으면 `다음 라운드에 토큰 1개`.
  - `rows`: 내 자리 빼고 살아 있는 고개를 자리 순서로. `canSend = tokens > 0 && !received && clock.phase === 'round'`. `received`면 단추 대신 흐린 '받음'(10px).
  - `sentNote`: 보낸 뒤 3초 동안 `2번 범수에게 5냥을 보냈습니다`.
  - `survivorsHtml`: 제목 줄 14 + 토큰 줄 28 + 줄 높이 32 × N + 보냄 줄 28(비어 있어도 자리 유지). 줄은 `<div class="sv-row"><button class="sv-watch" data-action="watch" data-arg="2">2 범수 <b class="lv-…">31</b></button><button class="sv-send" data-action="supportTo" data-arg="2">5냥</button></div>`(단추 38×24, 10px, 단추 사이 8px). 5명일 때 230px로 오른쪽 패널 292 안.
  - mount: `view && driver.readOnly`일 때 `#right`에 `survivorsHtml`(옛 '고개 관전'·안내 두 줄 없앰). `act('supportTo', seat)` → `opts.actions.support(Number(seat))`. 넋 카드(`spiritCardHtml`)는 그대로 두고 끝에 `이번 판 보낸 엽전 ${sentCount()}회`(1회 이상일 때).
  - 받는 쪽: `supportCount()`가 늘면 `coinSpot(currentWins(), sides)`. `right` → `#right` 엽전 숫자에 `.coin-glow`(1초: 바로 금색, 700ms 머묾, 300ms 돌아옴) — `renderRight`의 `coinGlow`로 넣어서 다시 그려도 남게. `+5`는 `#stage`에 따로 붙이는 `.coin-float`(800ms 동안 12px 위로 + 페이드, `OneShots`, 효과 줄이기에서는 없음). `win` → `rightBarHtml`의 엽전 `<b>`에 같은 클래스, `+5`는 `#win-right` 안. `slot` → `topSlot.push({ kind: 'note', text: '3번 넋이 보낸 엽전 +5', ms: 3000 })`. 오른쪽 알림 칸의 '3번 넋이 보낸 엽전 +5' 3초는 지금 그대로.

- [ ] **Step 1: 실패하는 시험 쓰기**
  - `online-spirit.test.ts`: 토큰 1·0일 때 `head`, 받은 고개 `received`, 자리 순서(잡귀 많은 순 아님), 보낸 뒤 2.9초 `sentNote` 있고 3.1초 없음, `support(3)`이 `{ type: 'support', target: 3 }`을 보냄, `support()`는 관전 고개로.
  - `spirit-list-ui.test.ts`: 넋일 때 `#right`에 `.sv-row` 줄 수 = 살아 있는 다른 고개 수, '고개 관전' 글 없음; [5냥] 누르면 관전 고개와 다른 자리로 보냄; 줄 누르면 `watch`; '엽전이 바뀌어도 밝아짐이 남는다'(받은 뒤 엽전 바꾸고 다시 그려도 `.coin-glow` 1초 유지); 장터 기둥 창이면 `#win-right .win-money .coin-glow`, 퀘스트 기둥 창이면 `#round-banner`에 '3번 넋이 보낸 엽전 +5'; 효과 줄이기면 `.coin-float` 없음.
- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/online-spirit.test.ts packages/client/test/spirit-list-ui.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces와 CSS.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm test`, `npm run typecheck`.
- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/online/spirit.ts packages/client/src/online/models.ts packages/client/src/ui/mount.ts packages/client/src/ui/panels.ts packages/client/src/ui/windows.ts packages/client/src/ui/style.css packages/client/test/online-spirit.test.ts packages/client/test/spirit-list-ui.test.ts
git commit -m "List the living lanes for a spirit to support and light the coins the receiver gets"
```

끝난 기준: 넋이 오른쪽에서 바로 보낼 고개를 고름, 받는 쪽은 엽전 숫자가 보이는 곳에서 밝아짐.

---

### Task 11: 장터 당첨 고리, 6등급 결과 줄, 오라 고리·폭발 값

설계: ㉒, '장터 결과 줄', 오라 고리·폭발 효과, 연출 값 표 '당첨 고리'·'"6등급!" 글'.

**Files:**
- Modify: `packages/client/src/LaneScene.ts`, `src/fx/FxLayer.ts`, `src/fx/plan.ts`, `src/ui/gamble.ts`
- Test: `packages/client/test/prize-ring.test.ts` (새), `packages/client/test/fx-plan.test.ts`, `packages/client/test/gamble-ui.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // LaneScene.ts
  export function prizeLook(def: { grade: number; hidden?: boolean }): { color: number; text: string } | null;  // grade < 5 → null
  export function ringOn(ms: number, reduced: boolean): boolean;   // 0..1200: on 240 / off 160 × 3, reduced: on for all 1200
  // fx/plan.ts
  export const HALO_ALPHA = 0.42, PULSE_ALPHA = 0.32, PULSE_MAX = 3, BLAST_TINT = 0xffa860, BLAST_ALPHA = 0.6, BLAST_MAX = 4, BLAST_MS = 300;
  export function auraBuffedBy(state: GameState, src: number): Set<number>;   // slots one aura unit buffs; auraBuffedSlots uses it
  ```
  - `prizeLook`: 히든 `0xc48cff`, 6등급 `0xffe35a`, 5등급 `0xff4a3a`. 글 `${grade}등급!`.
  - `showGambleResult(tier, text, unitId)`: 그 유닛 칸이 5·6등급이면 칸 가운데에 둥근 고리(반지름 20, 선 2px)를 `ringOn`으로 1.2초 켜고 끄며, 칸 위 `N등급!` 10px 굵게(160ms에 위로 4px, 900ms 머묾, 140ms 사라짐; 효과 줄이기는 이동 없이). 불꽃(`gambleHit`)·흔들림은 그대로.
  - `gamble.ts`: 결과가 6등급 유닛이면 결과 줄에 `.gold`를 1.2초(효과 줄이기에서도 배경은 그대로, 움직임만 없음). 지금 450ms 번쩍임은 다른 등급 그대로.
  - 오라: `syncHalos`가 `HALO_ALPHA`. 고른 유닛이 오라를 주는 유닛이면 `auraBuffedBy(state, 고른 칸)` 안 유닛의 halo만 돌고, 나머지는 멈춘 모양(지금 효과 줄이기 모양). 고른 유닛이 없거나 오라가 없으면 모두 멈춤. halo 크기는 칸 32px 안(지금 `scale: 1` 확인, 넘치면 줄임).
  - pulse: 투명도 `PULSE_ALPHA`, ground 층 유지, 돌고 있는 pulse가 `PULSE_MAX`개면 새것은 건너뜀. explode: `BLAST_TINT`·`BLAST_ALPHA`, 300ms 안에 끝나게 재생 속도 조정, 동시 `BLAST_MAX`개. air 층을 유지하고 투명도로 보스 체력바·도깨비불이 보이는지 작업 12에서 본다(안 되면 ground 층으로 내리는 것이 설계의 다른 선택지).
  - 값은 설계 범위 안의 시작값이다. 작업 12의 전후 스크린샷을 보고 범위 안에서 고친다.

- [ ] **Step 1: 실패하는 시험 쓰기**
  - `prize-ring.test.ts`: `prizeLook` 네 경우(4등급 null), `ringOn` 0/239/240/399/400/1199/1200 → `true,true,false,false,true,…,false`, 1초 안에 켜지는 횟수 ≤ 3, `ringOn(800, true) === true`.
  - `fx-plan.test.ts`: 상수가 범위 안(`HALO_ALPHA` .35~.5, `PULSE_ALPHA` .25~.4, `BLAST_ALPHA` .5~.7, `BLAST_MS ≤ 300`, `PULSE_MAX 3`, `BLAST_MAX 4`); `auraBuffedBy`의 합집합이 `auraBuffedSlots`와 같음.
  - `gamble-ui.test.ts`: 6등급 결과 줄 `.gold`가 1199ms에 있고 1201ms에 없음.
- [ ] **Step 2: 실패 확인** — `npx vitest run packages/client/test/prize-ring.test.ts packages/client/test/fx-plan.test.ts packages/client/test/gamble-ui.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm test`, `npm run typecheck`.
- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/LaneScene.ts packages/client/src/fx/FxLayer.ts packages/client/src/fx/plan.ts packages/client/src/ui/gamble.ts packages/client/test/prize-ring.test.ts packages/client/test/fx-plan.test.ts packages/client/test/gamble-ui.test.ts
git commit -m "Ring the cell of a grade 5-6 market prize and quiet the late aura halos and blasts"
```

끝난 기준: 당첨 칸이 둥근 등급 색 고리로 B1 크림 꺾쇠와 갈림, 오라 고리는 고른 유닛 범위만 움직임.

---

### Task 12: 브라우저 확인과 기록

설계: '확인 방법' 전체, 8. 창 크기별 표, 오라 전후 스크린샷.

**Files:**
- Modify: 확인하다 나온 고칠 거리(작업마다 따로 커밋), `docs/superpowers/plans/2026-11-25-status-signals.md`('진행'), `docs/superpowers/specs/2026-11-25-status-signals-design.md`(상태·확인 결과 한 줄)

- [ ] **Step 1: 띄우기** — `packages/client`에서 `npx vite --port 5176 --strictPort`(백그라운드, 솔로). 온라인은 `PORT=2568 npm run dev:server`와 `VITE_SERVER_URL=http://localhost:2568 npx vite --port 5177 --strictPort`. 5173·5174·2567은 쓰지 않는다. PID를 적어 둔다.
- [ ] **Step 2: 솔로**(claude-in-chrome 새 탭) — `window.__driver`로 잡귀 47·48·57·60·61을 맞춰 HUD·장승·가장자리를 640×360, 1920×953(판 밖 여백 창), 1920×1080(판 안 기둥)에서 본다. 70라운드 보스 + P 멈춤 + 58마리에서 상단 줄이 640 안에 드는지 실제 글꼴로 재고, 넘치면 넘친 px을 B4 5-1(보스 N 줄이기)로 넘긴다고 적는다. P 멈춤 중 Space → '멈춤 중입니다 · P로 계속'과 [계속] 단추. P 멈춘 채 설정을 열고 닫기. 65라운드에서 '61마리면 바로 패배'. 장터·상세를 기둥 창으로 연 채 알림 자리가 x 200~454, 내 탄생 띠·배너가 창 닫기 단추를 덮지 않는지, Space 거절이 창 머리 '뚝딱' 위인지. 장터 6등급 당첨 고리. 솔로 패배 장면과 건너뛰기.
- [ ] **Step 3: 온라인**(두 탭 2인 방) — 9라운드 마지막 10초 카운트다운과 관문 실패 장면, 한 탭 포기로 탈락 번쩍임·흐림·알림·소리, 한 탭 끊기로 끊김 줄과 '돌아옴', 넋 생존자 목록과 받는 쪽(장터 기둥 창을 연 채·닫은 채), '역신이 옵니다'와 탈락 알림이 함께 떠도 안 겹치는지, 메뉴를 연 채 관문 실패, 배율 1 기둥 창을 연 채 테이밍 단추가 x 200 안쪽인지.
- [ ] **Step 4: 효과 줄이기·접근성** — 설정에서 효과 줄이기를 켜고 같은 장면에서 깜빡임·흔들림이 없는지. `localStorage`의 `dorandi.reduceFx`를 지우고 DevTools Rendering의 `prefers-reduced-motion: reduce`로 시작해 효과 줄이기가 켜진 채인지. 접근성 트리에서 `#slot-say` 하나만 상태 영역이고 카운트다운이 10·5초에만 바뀌는지.
- [ ] **Step 5: 오라·폭발 전후** — 40라운드 이후 유닛 20기 이상 보스 라운드에서 작업 11 전 커밋과 뒤를 배율 1·2로 찍어 보스·윗줄 유닛·등급 점이 보이는지 비교. 값을 고치면 범위 안에서 `fx/plan.ts` 상수만 바꾸고 따로 커밋.
- [ ] **Step 6: 정리** — 띄운 프로세스를 트리째 끄고(`taskkill //PID <pid> //T //F`, npx·npm 부모까지) `netstat -ano | grep LISTENING`으로 5176·5177·2568이 빈 것 확인(5173·5174는 남의 것이라 그대로), 쓴 탭 닫기.
- [ ] **Step 7: 기록과 커밋** — 이 문서 '진행'에 본 것·못 본 것(6인 방의 다음 칩·연달은 탄생은 봇이나 여러 탭으로 못 보면 못 본 것으로), 고친 것, 남은 것을 적고 frontmatter `progress`를 올린다.

```bash
git add docs/superpowers/plans/2026-11-25-status-signals.md docs/superpowers/specs/2026-11-25-status-signals-design.md
git commit -m "Record the B3 status signal checks in the browser"
```

끝난 기준: '확인 방법'의 항목마다 봤음/못 봄이 적혀 있고, 띄운 포트가 모두 비어 있음.

---

## 진행

(작업마다 끝낸 날짜, 커밋, 확인한 것과 확인하지 못한 것을 적는다.)
