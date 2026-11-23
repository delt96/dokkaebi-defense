# 조합 재료 쏠림 개선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3단계 조합식의 재료를 같은 등급·같은 계열끼리 바꿔, 재료마다 위 등급 조합에 쓰이는 횟수(수요)를 등급별 목표 범위로 모은다.

**Architecture:** 후보는 `@dorandi/sim`의 새 모듈 `spread.ts`가 찾는다. 이 모듈은 수요 집계, 목표 점검, 교체 규칙 점검, 탐색, 1등급 펼침 수를 순수 함수로 제공하고, CLI 스크립트가 후보 보고서를 쓴다. 사용자가 고른 교체를 `stage3/recipes.json`에 넣고, 기획 문서를 v6로 올린다. 시험은 v6 문서를 읽어 데이터와 대조한다. 끝으로 70라운드 개편 때와 같은 시뮬레이터 측정으로 지금 main과 비교한다.

**Tech Stack:** TypeScript, vitest, tsx, npm workspaces (`@dorandi/logic`, `@dorandi/sim`, `client`)

**Spec:** `docs/superpowers/specs/2026-11-24-recipe-spread-design.md`

## Global Constraints

- 브랜치 `recipe-spread`(메인 checkout). 커밋은 하고 push·main 병합은 하지 않는다.
- **바꿀 수 있는 조합은 `packages/logic/data/stage3/recipes.json`에 있고 `kind`가 없는 행뿐이다.** `data/recipes.json`(stage1)과 `data/stage2/recipes.json`의 행은 20라운드 판과 솔로 1단계도 쓰므로 건드리지 않는다. 이 제한 안에서도 모든 목표를 맞추는 해가 있음을 계획 단계에서 확인했다.
- 재료 교체는 같은 등급, 같은 `damageType`끼리만 한다. 1등급 재료는 바꾸지 않는다.
- 결과 유닛(능력치·능력·이름), 조합식 수, 재료 칸 수, 비용(메밀묵·엽전)은 그대로다. 길들이기 조합(`kind: 'tame'`)과 숨은 유닛은 건드리지 않는다.
- 결과 유닛의 스킬이 `source`로 가리키는 재료는 그 조합에서 빼지 않는다: 제주 영감의 `buk`, 천년 상모의 `gat`·`manggeon`, 천년 맷방석의 `gireumteul`, 천년 징의 `moru`, 천년 무쇠솥·천년 요강의 `yaktanggi`. 빼면 재료 지원 효과가 끊긴다.
- 교체 때문에 한 조합에 같은 재료가 두 번 들어가거나, 두 조합의 재료 묶음이 같아지면 안 된다.
- 목표 수요(길들이기 조합 제외, 같은 재료 두 장은 한 번으로 셈): 2등급 3~6, 3등급 1~3이면서 1곳뿐인 재료 5종 이하, 4등급 2~4, 5등급 2~3. 1등급은 모두 7 그대로.
- 검증(`npm run validate`)은 오류 0이어야 한다. 이 검증의 수요 상한 7은 길들이기 조합까지 센다.
- 주석은 영어로, 코드만 봐서 알 수 없는 것만 단다. 커밋 메시지는 영어로 쓰고 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`로 끝낸다.
- `npm install`이 `package-lock.json`을 바꾸면 `git checkout package-lock.json`으로 되돌린다.

## Review Focus

1. **스킬 `source` 재료:** 탐색이 제주 영감의 북 같은 지원 출처 재료를 다른 재료로 바꾸면 효과가 조용히 사라진다(검증에 안 걸린다). → Task 1 시험 `swapProblems rejects removing a skill source`
2. **길들이기 파트너의 상한:** 톱·반짇고리·샅바·제주 허벅·조족등은 길들이기 조합에서 수요를 하나 더 받는다. 목표는 길들이기를 빼고 세지만 상한 7은 포함해 센다. → Task 1 시험 `swapProblems runs validateData on the swapped data`
3. **20라운드 판 데이터:** stage1·stage2 조합은 그대로여야 하고, 20라운드 데이터 버전(`matchDataVersion('stage2')`)도 그대로다. → Task 1 시험 `swapProblems rejects a stage1 or stage2 row`, Task 3 Step 5
4. **조합 손해:** 재료를 바꾸면 '재료 합 DPS'가 바뀌어 조합한 뒤가 재료를 들고 있을 때보다 약해질 수 있다. → Task 2 Step 2의 조합 손익 측정, Task 4 Step 3
5. **옛 3단계 판 기록:** 3단계 데이터 버전이 바뀌므로 개편 전에 남은 판 기록은 지금 데이터로 다시 돌리면 결과가 달라진다. 기록을 버전으로 가려 돌리는지 확인만 한다(`packages/sim/scripts/replay-version.ts`). → Task 4 Step 6

---

### Task 1: 수요 집계와 후보 탐색 모듈

**Files:**
- Create: `packages/sim/src/stage3/spread.ts`
- Create: `packages/sim/scripts/recipe-spread.ts`
- Modify: `packages/sim/package.json` (`"spread": "tsx scripts/recipe-spread.ts"`)
- Test: `packages/sim/test/recipe-spread.test.ts`

**Interfaces:**
- Consumes: `@dorandi/logic`의 `loadGameData`, `dataSources`, `validateData`, `GameData`, `RecipeDef`, `DataSources`; `./combineGain`의 `combineGainAll(data, { seeds, results })`(행마다 `pass`)
- Produces (`spread.ts`):
  - `interface Swap { result: string; from: string; to: string }` — 조합 `result`의 재료 `from` 한 칸을 `to`로
  - `const SPREAD_TARGETS: Record<2 | 3 | 4 | 5, { min: number; max: number }>` = `{ 2: {3,6}, 3: {1,3}, 4: {2,4}, 5: {2,3} }`, `const GRADE3_MAX_SINGLES = 5`
  - `spreadDemand(data: GameData): Map<string, number>` — 숨지 않은 유닛마다, `kind`가 없는 조합 중 그 유닛을 재료로 가진 조합 수
  - `targetMisses(data: GameData): string[]` — 목표를 벗어난 항목을 사람이 읽는 문장으로. 빈 배열이면 모두 맞음
  - `editableRecipes(src: DataSources): Set<string>` — `src.stage3.recipes` 중 `kind`가 없는 행의 `result`
  - `lockedMaterials(data: GameData, result: string): Set<string>` — 그 조합의 1등급 재료 + 결과 유닛 스킬 효과의 `source` 값
  - `applySwaps(data: GameData, swaps: Swap[]): GameData` — 복사본에서 각 조합의 `from` 첫 칸을 `to`로
  - `swapProblems(data: GameData, editable: Set<string>, swaps: Swap[]): string[]` — Global Constraints의 교체 규칙 위반과 교체 뒤 `validateData(...).errors`
  - `searchSpread(data: GameData, editable: Set<string>, opts: { seed: number; iterations?: number; ban?: { result: string; material: string }[]; keep?: Set<string> }): Swap[]` — `swapProblems`가 비고 `targetMisses`가 빈 교체 목록. 바뀌는 조합 수를 최소로. `ban`은 그 조합에 그 재료를 새로 넣지 않기, `keep`은 바꾸지 않을 조합
  - `changedRecipes(swaps: Swap[]): string[]` — 바뀌는 조합의 `result`(중복 없음)
  - `leafCounts(data: GameData, unitId: string): Map<string, number>` — 조합을 1등급까지 재귀로 펼친 1등급 재료별 개수(두 장 재료는 두 번 셈)

- [ ] **Step 1: 실패하는 시험 작성** (`recipe-spread.test.ts`, 데이터는 `loadGameData('stage3')`, `editable = editableRecipes(dataSources())`)
  - `spreadDemand matches the spec's current table`: `kkeul` 7, `sil` 5, `gat` 1, `ja` 7, `onggigama` 6, `cheongsachorong` 2, `saekkijul` 5, `baneul` 5. 3등급 18종 중 수요 1인 것 10종. 1등급 8종 모두 7.
  - `targetMisses lists the current misses`: 현재 데이터에서 `kkeul`, `ja`, `meongseok`, `cheongsachorong`이 들어간 항목이 있고, 3등급 1곳뿐 10종 항목이 있다.
  - `editableRecipes is the stage 3 file only`: `kkeul`, `bihyeongrang` 포함, `yeonjabangga`(stage1), `ja`(stage2), `baekbalbaneulgaksi`(길들이기) 미포함.
  - `lockedMaterials`: `lockedMaterials(d3, 'jejuyeonggam')`에 `buk`, `lockedMaterials(d3, 'cheonnyeonsangmo')`에 `gat`·`manggeon`, `lockedMaterials(d3, 'didilbangga')`는 1등급 셋.
  - `swapProblems rejects a different family`: `{ result: 'bihyeongrang', from: 'kkeul', to: 'sil' }`(물→마) → 비지 않음.
  - `swapProblems rejects a different grade`: `{ result: 'bihyeongrang', from: 'kkeul', to: 'moru' }` → 비지 않음.
  - `swapProblems rejects a stage1 or stage2 row`: `{ result: 'yeonjabangga', from: 'meongseok', to: 'gamasot' }`, `{ result: 'ja', from: 'mumyeong', to: 'cheongsachorong' }` → 각각 비지 않음.
  - `swapProblems rejects removing a skill source`: `{ result: 'jejuyeonggam', from: 'buk', to: 'hahoetal' }` → 비지 않음.
  - `swapProblems rejects a duplicated material`: `{ result: 'bihyeongrang', from: 'top', to: 'kkeul' }` → 비지 않음.
  - `swapProblems runs validateData on the swapped data`: `top`을 수요 7 넘게 만드는 교체 묶음(길들이기 1 포함) → `used in` 오류 포함.
  - `swapProblems accepts a legal swap`: `{ result: 'bihyeongrang', from: 'kkeul', to: 'hahoetal' }` → 빈 배열.
  - `leafCounts`: `leafCounts(d3, 'dunggumi')`는 `jipsin` 2. 6등급 30종 모두 합계가 `recipeValue(d3, recipe)`와 같다(셋째 재료가 3등급이면 36, 4등급이면 40 — v5 4절).
  - `searchSpread meets every target` (타임아웃 120초): `seed: 1`의 결과에 `swapProblems`가 비고, `targetMisses(applySwaps(...))`가 비고, `ban`으로 준 `{ result: 'bihyeongrang', material: 'hahoetal' }`가 결과에 없고 `keep`에 넣은 `bihyeongrang`은 바뀌지 않는다.
- [ ] **Step 2: 실패 확인:** `npx vitest run packages/sim/test/recipe-spread.test.ts` → `spread` 모듈이 없어 FAIL
- [ ] **Step 3: `spread.ts` 구현.** 탐색 방법은 자유다. 등급·계열마다 재료 자리 옮기기 문제라서, 필요한 옮김 수의 하한은 (목표 상한을 넘는 수요 합)과 (하한에 모자란 수요 합) 중 큰 값이다. 탐색은 원래 조합에서 출발해 위반을 줄이는 교체만 받고, 같은 조합에 옮김을 몰아 바뀌는 조합 수를 줄인다. 계획 단계에서 해 본 담금질(조합 변경 비용 없이)은 위반 0에 바뀐 조합 63개였다. 이보다 훨씬 적어야 한다. 난수는 `seed`로 고정한다.
- [ ] **Step 4: 통과 확인:** `npx vitest run packages/sim/test/recipe-spread.test.ts` → PASS
- [ ] **Step 5: CLI 작성** (`scripts/recipe-spread.ts`). 인자: `--seeds 1-5`(여러 해), `--ban result:material,...`, `--keep result,...`, `--combine on|off`(기본 on, 바뀐 조합만 `combineGainAll(..., { seeds: 3, results })`). 출력은 표준 출력과 `sim-out/spread/candidates.md`에 쓴다. 해마다 다음을 적는다:
  - 바뀐 조합 수와 하한
  - 바뀐 조합 표: 결과 이름 | 바꾸기 전 재료 → 바꾼 뒤 재료(이름으로) | 나간 재료·들어온 재료의 수요 변화
  - 등급별 수요 분포 전 → 후(스펙 표와 같은 꼴: 유닛 수, 평균, 분포, 1곳뿐, 5곳 이상)
  - 재료가 바뀐 6등급마다 `leafCounts` 최댓값 전 → 후('가장 많이 기다리던 재료', v5 4절 표와 같은 꼴). 3 넘게 늘면 표시
  - 조합 손익 `pass`가 false인 행(결과·시나리오)
- [ ] **Step 6: 실행 확인:** `npm run spread -w @dorandi/sim -- --seeds 1-3` → 세 해 모두 목표 위반 0, `sim-out/spread/candidates.md`가 생긴다. `npm run typecheck` PASS.
- [ ] **Step 7: 커밋:** `git add packages/sim/src/stage3/spread.ts packages/sim/scripts/recipe-spread.ts packages/sim/package.json packages/sim/test/recipe-spread.test.ts` → `git commit -m "Find recipe material swaps that even out material demand"`

### Task 2: 장면 고르기와 사용자 확인

코드 변경 없음. **이 Task가 끝나기 전에 Task 3을 시작하지 않는다.**

**Files:**
- Create: `docs/design/recipe-spread-v6-candidates.md`

**Interfaces:**
- Consumes: Task 1의 `npm run spread -w @dorandi/sim` (`--ban`·`--keep`로 다시 돌리기)
- Produces: 사용자가 승인한 교체 목록(이 문서의 '확정' 표). Task 3이 이 표를 그대로 반영한다.

- [ ] **Step 1: 기준 측정을 미리 돌린다** (데이터를 바꾸기 전이라야 지금 main과 같다. 오래 걸리면 백그라운드로 돌리고 다음 Step을 진행한다). 봇마다:
  ```
  npm run sim -- --stage 3 --check grade6 --matrix on --bot all --config <bot>-full-q2 --defeat on --seeds 20 --out sim-out/spread-base
  npm run sim -- --stage 3 --check grade6 --matrix on --bot all --config <bot>-full-q2 --defeat off --seeds 20 --out sim-out/spread-base
  npm run sim -- --stage 3 --check combine --seeds 3 --out sim-out/spread-base
  ```
  `<bot>`은 `econRun.ts`의 `ECON_BOTS` 전부(`clumsy normal target switch synergy`)다. 실행 커밋 해시를 적어 둔다.
- [ ] **Step 2: 장면 고르기.** 후보 해들에서 바뀐 조합마다 '재료가 결과를 만드는 작업 장면'을 v5 '재료가 이어지는 이유' 칸의 말투로 쓴다. 억지스러운 조합이 있으면 `--ban`(그 재료를 그 조합에 넣지 않기)이나 `--keep`(그 조합은 그대로)으로 다시 돌린다. 조합 손익 `pass`가 false인 교체, 6등급 1등급 펼침 최댓값이 3 넘게 느는 교체는 다른 해를 찾고, 못 찾으면 문서에 이유와 함께 남긴다.
- [ ] **Step 3: 문서 작성** (`recipe-spread-v6-candidates.md`):
  - 확정 후보 표: 결과 | 바꾸기 전 재료 → 바꾼 뒤 재료 | 새 장면 | 수요 변화(나간 재료 n→n−1, 들어온 재료 m→m+1)
  - 등급별 수요 분포 전 → 후, 목표와의 대조
  - 6등급 '가장 많이 기다리던 재료' 전 → 후
  - 조합 손익 측정 결과(바뀐 조합)
  - 목표를 못 맞춘 등급이 있으면 그 이유
  - 바뀐 조합 수와 하한
- [ ] **Step 4: 사용자 확인.** 문서 경로를 알리고 표를 보여 준 뒤 확인을 받는다. 고치라는 조합이 있으면 Step 2로 돌아간다. 승인받으면 문서의 표 제목을 '확정'으로 바꾼다.
- [ ] **Step 5: 커밋:** `git commit -m "Pick the recipe material swaps and their work scenes"` (`docs/design/recipe-spread-v6-candidates.md`만)

### Task 3: 조합 데이터와 기획 문서 v6 반영

**Files:**
- Create: `docs/design/content-draft-116-v6.md` (v5 복사 뒤 수정)
- Modify: `packages/logic/data/stage3/recipes.json` (확정 표의 행만)
- Rename: `packages/logic/test/v5-table.ts` → `packages/logic/test/v6-table.ts` (`readV5` → `readV6`, 읽는 파일 `content-draft-116-v6.md`)
- Modify: `packages/logic/test/data-stage3.test.ts` (import, `demand table` 고정값, `each partner ... v5 table`의 `before` 값과 시험 이름)
- Modify: `packages/logic/test/econ-budget.test.ts:109` (v6 문서도 읽기)
- Modify (시험이 옛 조합을 고정한 경우만): 후보 `packages/logic/test/stage3-rules.test.ts`, `stage3-effects.test.ts`, `validate-stage3.test.ts`, `packages/client/test/dex-links.test.ts`, `dex-filter.test.ts`, `stage3-text.test.ts`, `resist-text.test.ts`, `packages/sim/test/stage3-sim.test.ts`

**Interfaces:**
- Consumes: Task 2의 확정 표
- Produces: `readV6(): { units: V5Unit[]; recipes: V5Recipe[] }`(타입 이름은 그대로 둔다)

- [ ] **Step 1: v6 문서 작성.** `content-draft-116-v5.md`를 복사해 다음을 고친다.
  - 제목 '5차 초안' → '6차 초안'. 상단 'v4 대비 변경' 절을 'v5 대비 변경'으로 바꾸고 바뀐 조합 표(전 → 후)와 이유(스펙 '왜 하는가' 한 문단)를 넣는다. 나머지 v4 대비 표는 지운다(v5 문서에 남아 있다).
  - 2절 등급별 표: 바뀐 행의 '재료'와 '재료가 이어지는 이유' 칸. 재료는 `이름 + 이름 + 이름` 꼴을 지킨다(`v6-table.ts`가 이 꼴을 읽는다).
  - '조합 전후 화력' 6등급 표: 재료가 바뀐 행의 '재료 합' 쪽 값을 같은 절 '표 읽기'의 규칙으로 다시 계산한다. 완성품 쪽은 그대로다. 108개 검산 표는 Task 2의 조합 손익 측정에서 바뀐 조합이 표의 '최소 배수'보다 근소해졌을 때만 고치고, 아니면 그대로 두고 v5 대비 변경에 그렇게 적는다.
  - 4절 수요 점검과 '바닥 재료에서 시작할 때'(바뀐 6등급의 가장 많이 기다리던 재료), 8절 재료별 수요표(열별 수, 합계).
  - 3절 1등급 재료 수요는 1등급을 안 바꾸므로 그대로인지 확인만 한다.
- [ ] **Step 2: 시험을 v6로 돌리기(실패하는 시험).** `v5-table.ts`를 `git mv`로 `v6-table.ts`로 옮기고 경로·함수 이름을 바꾼다. `data-stage3.test.ts`의 `demand table` 고정값 `T`를 확정 표 반영 뒤 값으로 바꾸고(길들이기 조합 포함 수, 즉 `recipeDemand` 값) 시험 이름을 'from v6 section 8'로, partner 시험의 `before`를 v6 수요표(길들이기 제외) 값으로 바꾼다. `econ-budget.test.ts`의 문서 목록에 `design/content-draft-116-v6.md`를 더한다.
- [ ] **Step 3: 실패 확인:** `npx vitest run packages/logic/test/data-stage3.test.ts` → `every v5 row matches ...`(재료)와 `demand table`이 FAIL
- [ ] **Step 4: `stage3/recipes.json` 반영.** 확정 표의 행만 바꾼다. 줄 형식(한 조합 한 줄)과 순서는 그대로 둔다.
- [ ] **Step 5: 통과 확인:**
  - `npm run validate` → stage1·2·3 errors 0. 경고는 바꾸기 전과 같은 목록이어야 한다.
  - `npm test` → 전체 PASS. 실패하는 시험이 옛 조합을 고정한 것이면 새 조합으로 기대값을 바꾼다(검사를 약하게 하지 않는다). 그 밖의 실패는 멈추고 원인을 본다.
  - `npm run typecheck` → PASS
  - `git diff --stat main -- packages/logic/data` → `stage3/recipes.json` 한 파일만 바뀌었다(20라운드 데이터 그대로).
  - `npm run spread -w @dorandi/sim -- --seeds 1 --combine off`의 '현재 데이터' 분포가 목표 위반 0이다(또는 Task 2에서 보고한 예외와 같다).
- [ ] **Step 6: 참조 확인:** `grep -rn "content-draft-116-v5\|readV5\|v5-table" packages docs/superpowers/plans/2026-11-24-recipe-spread.md` → 코드에서 남은 참조 없음(주석의 'v5 6장' 같은 설명은 v6에서도 같은 장이면 둔다).
- [ ] **Step 7: 커밋:** `git commit -m "Even out recipe material demand in stage 3 (content draft v6)"`

### Task 4: 밸런스 비교와 기록

**Files:**
- Modify: `docs/balance/stage3-economy-pass.md` (새 장 '18. 조합 재료 쏠림 개선')
- Modify: `docs/superpowers/specs/2026-11-24-recipe-spread-design.md` (끝에 '결과' 절)

**Interfaces:**
- Consumes: Task 2 Step 1의 `sim-out/spread-base`, Task 3이 반영한 데이터

- [ ] **Step 1: 같은 측정을 v6 데이터로 돌린다.** Task 2 Step 1의 세 명령을 `--out sim-out/spread-v6`로.
- [ ] **Step 2: 비교 표 작성.** 봇마다 기준 → v6:
  - 패배 켬 팀 클리어(/20), 61R 이후 탈락 라운드 분포
  - 6등급 수(패배 끔, 60R 시작 / 70R 끝 중앙값, 60R 시작 3~4기 비율)
  - 첫 6등급 라운드(중앙값, 늦은 10%, 미완성 비율)
  - 역신 5 처치 / 제한 대비, 70R 보스 처치 시간 중앙값
- [ ] **Step 3: 조합 손익 비교.** `combine.csv`에서 `pass`가 false인 행이 기준보다 늘었는지 본다. 늘었다면 결과·시나리오를 표로 적는다.
- [ ] **Step 4: 판정.** 다음 중 하나라도 해당하면 멈추고 측정 표와 함께 사용자에게 보고한다(수치를 이 작업에서 맞추지 않는다):
  - 전환 봇 팀 클리어가 기준보다 3/20 넘게 바뀜(20시드 노이즈 ±10%p를 넘는 폭)
  - 어느 봇이든 60R 시작 6등급 수 중앙값이 1기 넘게 줄거나 첫 6등급 라운드 중앙값이 5라운드 넘게 늦어짐
  - 조합 손익 실패 행이 늘어남
- [ ] **Step 5: 기록.** `stage3-economy-pass.md` 18장에 설계 문서 링크, 실행 명령, 시드 수, 기준 커밋, 바뀐 조합 수, Step 2~3 표, 판정을 적는다. 스펙 끝 '결과' 절에 등급별 수요 분포 전 → 후와 밸런스 판정을 세 줄 안팎으로 적는다.
- [ ] **Step 6: 옛 판 기록 확인.** `packages/sim/scripts/replay-version.ts`가 기록의 `dataVersion`으로 옛 데이터를 골라 돌리는지 읽어 보고, 아니면 18장 '재지 않은 것'에 '개편 전 3단계 판 기록은 지금 데이터로 다시 돌리면 결과가 달라진다'고 적는다(코드는 고치지 않는다).
- [ ] **Step 7: 커밋:** `git commit -m "Record the balance check after evening out recipe materials"`
