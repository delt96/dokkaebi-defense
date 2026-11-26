# 판 바깥 창 높이 · Space 통일 · 장터 확률 안내 빼기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 판 바깥 창을 판 맨 위부터 그리고, 판을 잠그지 않는 동안 Space는 늘 뚝딱이며, 장터 확률 안내 상자를 없앤다.

**Architecture:** 창 자리는 `layout.ts` `screenLayout` 한 곳에서 정해진다. Space는 `mount.ts`의 window keydown 하나에서 갈린다. 확률 안내는 `gamble.ts` `gambleInfoHtml`과 `mount.ts`의 `marketItem`/`inspectMarket`/`renderMarketInfo`, `econ.ts`의 `#gamble-info` 자리, `style.css` 규칙이 전부다.

**Tech Stack:** TypeScript, vitest + happy-dom (`packages/client`).

**Spec:** `docs/superpowers/specs/2026-11-26-market-rework-design.md`

## Global Constraints

- 판 안 기둥 배치('inside')의 창 자리·높이는 바꾸지 않는다.
- 잠그는 창(`modal !== null`), 끝 장면, `guideOn`, 글 입력칸, Tab 이동은 지금 동작 그대로.
- 최근 결과·뽑기 연출·잠김 이유 글은 그대로.
- 주석은 영어, 코드에서 거꾸로 알 수 없는 것만.

## Review Focus

- 마우스로 누른 장터 사기 버튼에 초점이 남은 채 Space: 뚝딱 한 번만, 같은 상품을 다시 사지 않음 → Task 2 시험.
- 잠그는 창(온라인 포기 확인)에서 Space: 지금처럼 초점 버튼('취소')이 눌림 → 기존 `online-mount.test.ts` 시험이 지킨다.
- 장터를 다시 그려도 몸통 스크롤 위치 유지(정보 상자가 없어진 뒤에도) → Task 3에서 `side-windows.test.ts` 스크롤 시험의 기준을 `.gamble-result`로 옮긴다.
- 실제 Chrome에서 keydown preventDefault가 버튼의 Space 클릭을 막는지(happy-dom은 Space로 클릭을 흉내 내지 않음) → 마지막 브라우저 확인.
- 온라인 판 바깥 창 높이(band 있는 경우 'inside'로 떨어지므로 영향 없음) → 기존 band 시험.

---

### Task 1: 판 바깥 창을 판 맨 위부터

**Files:**
- Modify: `packages/client/src/layout.ts` (`screenLayout`의 outside 분기)
- Test: `packages/client/test/screen-layout.test.ts`
- Modify: `docs/superpowers/specs/2026-11-25-window-layout-design.md` 79줄 높이 문장

- [ ] **Step 1: 시험 고치기** — 'outside boxes …' 시험 이름을 `from the board top to the board bottom`으로, 값은
  - `screenLayout(1920, 953)`: `winLeft: { x: 0, y: 116, w: 156, h: 360 }`, `winRight: { x: 1608, y: 116, w: 156, h: 360 }`
  - `screenLayout(2560, 1305).winLeft`: `{ x: 0, y: 112, w: 156, h: 540 }`
- [ ] **Step 2: 실패 확인** — `npx vitest run test/screen-layout.test.ts` → FAIL (y 164, h 336)
- [ ] **Step 3: 구현** — outside 분기에서 y = `top`, h = `(STAGE_H * zoom) / winZoom`. inside 분기는 지금 `y`(= top + TOP_H × zoom) 그대로.
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS
- [ ] **Step 5: 커밋**

### Task 2: Space는 판을 잠그지 않는 동안 늘 뚝딱

**Files:**
- Modify: `packages/client/src/ui/mount.ts` (keydown의 `if (ev.code === 'Space' && target?.closest?.('button, .gamble-option[tabindex]')) return;` 줄)
- Test: `packages/client/test/side-windows.test.ts`

- [ ] **Step 1: 시험 쓰기** — `describe('solo side windows')`에 `'Space on a clicked window or panel button summons and does not press it'`:
  - stage3(`withoutMarketLock`), `s.buckwheat = 7`, `key('KeyB')`
  - `#win-right .gamble-buy[data-arg="small"]`에 focus → 그 요소에서 Space keydown(버블) → `queue`가 `{ type: 'summon' }`을 받고, keydown 이벤트 `defaultPrevented === true`, `sent('gambleUnit')` 길이 0
  - 오른쪽 패널 `[data-action="toggleMarket"]`(장터 버튼)에 focus → Space → summon 한 번 더, 장터는 열린 채(`#win-right .econ-panel` 있음)
- [ ] **Step 2: 실패 확인** — `npx vitest run test/side-windows.test.ts -t "clicked window"` → FAIL
- [ ] **Step 3: 구현** — 그 줄을 지운다. 아래 `if (ev.code === 'Space') { ev.preventDefault(); act('summon', ''); }`가 그대로 받는다. 위쪽 `if (modal || sceneRunning || phase ended) return`이 잠그는 창을 이미 걸러 준다.
- [ ] **Step 4: 통과 확인** — `npx vitest run test/side-windows.test.ts test/online-mount.test.ts` → PASS
- [ ] **Step 5: 커밋**

### Task 3: 장터 확률 안내 빼기

**Files:**
- Modify: `packages/client/src/ui/gamble.ts` (`gambleInfoHtml` 삭제, `GambleJige` 타입은 econ.ts가 '보유 지게'에 쓰므로 유지. `Odds`, `odds`/`consolation`/`payback` 필드와 `PAYOUT_COLORS`, `percent`는 다른 데서 안 쓰면 삭제. `gambleHtml`: `inspect` 버튼 → 그룹 이름은 글로, 보따리 이름은 `<span class="gamble-name">`; `data-market-item` 속성 삭제. `.gamble-option`의 `tabindex="0" role="group"`은 사는 중 버튼이 꺼질 때 초점을 붙잡는 자리라 유지)
- Modify: `packages/client/src/ui/econ.ts` (`#gamble-info` div 삭제)
- Modify: `packages/client/src/ui/mount.ts` (`marketItem`, `inspectMarket`과 rightBox의 pointerover/pointerdown/focusin/click 리스너, `renderMarketInfo`와 호출, 1605줄 초기화, import 정리. 'odds' 언급 주석 고침)
- Modify: `packages/client/src/ui/style.css` (`.gamble-inspect`, `.gamble-info*`, `.gamble-odds*` 규칙 삭제, `.win .pin-btn` 줄에서 `.gamble-inspect` 빼기, `.gamble-name`은 지금 `.gamble-inspect` 글 모양(금색 10px, 줄높이 13px, nowrap))
- Test: `test/gamble-ui.test.ts`, `test/copy-terms.test.ts`, `test/econ-ui.test.ts`, `test/fit.test.ts`, `test/side-windows.test.ts`

- [ ] **Step 1: 시험 고치기**
  - gamble-ui: `gambleInfoHtml` 시험(59~70줄 표) 삭제, 대신 `'the market draws no odds box and no name buttons'`: `gambleHtml(model, null)` 결과에 `.gamble-inspect`, `.gamble-odds`, `[data-market-item]` 없음, `.gamble-name` 글이 `['보따리', '큰 보따리']`
  - copy-terms: `gambleInfoHtml` 쓰는 두 시험(156·169줄 근처) 삭제
  - econ-ui: 211·232~234줄의 `#gamble-info` 기대 → `#gamble-info`가 없음을 확인하는 한 줄로
  - fit: 85줄 목록에서 `.win .gamble-inspect` 빼기
  - side-windows: 스크롤 시험의 대역 기준을 `.gamble-result`로(주석도 "the result is filled after the redraw")
- [ ] **Step 2: 실패 확인** — `npx vitest run test/gamble-ui.test.ts test/econ-ui.test.ts` → FAIL
- [ ] **Step 3: 구현** (Files 목록대로)
- [ ] **Step 4: 통과 확인** — `npx tsc -p packages/client --noEmit`(또는 저장소 typecheck 스크립트), `npx vitest run packages/client` → PASS
- [ ] **Step 5: 커밋**

### Task 4: 확인과 문서

- [ ] 전체 시험 `npx vitest run`, typecheck
- [ ] 로컬 Chrome(2560×1271, 판 바깥 창): 창 위가 판 위와 맞음, 장터에 확률 상자 없음, '묵 1개'·'뽑기' 탭·'장터 (B)'를 클릭한 뒤 Space → 도깨비불이 줄고 장터 그대로
- [ ] 설계 문서 status completed, 커밋
