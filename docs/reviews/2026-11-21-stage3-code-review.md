# 3단계 코드 리뷰 · 2026-11-21

중요 결함 6건을 수정했다. 방을 중단시키거나 판 전체의 상태를 복구할 수 없게 만드는 Critical 결함은 확인되지 않았다. 후속 수정에서 Minor 5건도 해결했다.

검토 범위는 `a12491d..6ace822`의 전투·경제·협동 규칙, 서버, 온라인 명령 송수신 경로다. 검토 도중 갱신된 `main`의 데이터 로더 변경까지 포함했다. 아래 줄 번호는 수정 전 `6ace822` 기준이다. 경제 초안과 구현 계획이 다르게 읽히는 부분은 구체적인 구현 규칙과 대조했다. 예컨대 단지 첫 구매에는 빈칸이 필요하지만, 묵이 확정된 두 번째 구매에는 빈칸이 필요 없다.

## Important · 수정 완료

1. **동의한 짐과 실제로 받는 짐이 달라질 수 있었다.** `packages/logic/src/match/econ.ts:114`. 수신자가 수락을 누른 사이 송신자가 제안을 취소하고 다시 제안하면, 늦게 도착한 수락은 새 제안에 적용됐다. 거절과 송신 취소도 같은 문제였다. 이제 방이 제안마다 번호를 발급하고, 화면에 표시한 번호와 열려 있는 제안이 일치할 때만 처리한다. 이전 응답은 양쪽의 재료·보상·대기 라운드를 건드리지 않는다. 회귀 테스트는 `a delayed response cannot accept or decline a replacement offer`다. 60라운드 배달은 이 번호를 주고받는 클라이언트와 서버가 필요하다.

2. **이벤트가 끝나는 틱에 길들이기가 한 번 더 가능했다.** `packages/logic/src/econ/hooks.ts:17`, `packages/logic/src/game.ts:63`. 씨름 상대가 체력 15% 이하라면 400틱째에 길들여 도주 판정을 건너뛸 수 있었다. 작은 그림자도 200틱째에 성장 전 체력으로 길들일 수 있었다. 솔로와 협동 모두 해당 틱의 도주·성장을 명령보다 먼저 처리한다. 회귀 테스트는 `event deadlines apply before tame commands on the boundary tick`이다.

3. **단절 보류 중 쓰러진 보스가 재료를 주지 않았다.** `packages/logic/src/econ/market.ts:107`. 개인 보스 시계가 잠시 멈춰도 공용 라운드는 넘어간다. 20라운드 강철이가 21라운드에 쓰러지면 격파는 인정하면서 21라운드 드롭 표를 찾아 3등급 재료를 누락했다. 보스가 등장한 라운드로 드롭을 조회하도록 고쳤다. 회귀 테스트는 `a round 20 boss killed after the shared clock enters 21 still drops its material`이다.

4. **종료 조건이 이미 성립한 설화 의뢰가 계속 남았다.** `packages/logic/src/game.ts:63`, `packages/logic/src/match/seats.ts:69`. 31라운드에 남은 재료인 꽹과리를 조합하고 같은 틱에 팔면, 명령을 모두 처리한 뒤에는 다시 한 자리만 비어 있어 의뢰가 살아남았다. 탈락한 고개는 아예 다음 전투 검사를 받지 않아 재접속 스냅샷에도 의뢰가 남았다. 명령·배달로 재료가 변할 때 의뢰를 재검사하고 탈락 시 활성 의뢰를 닫는다. 회귀 테스트는 `crafting and selling the last material in one tick ends the story`, `forfeiting ends an active story on the eliminated lane`이다.

5. **20라운드용 준비 입력으로 60라운드 경기가 시작됐다.** `packages/server/src/core/RoomCore.ts:315`. 예전 페이지에서 누른 준비 입력이 방장의 모드 전환 직후 도착하면 60라운드를 보지 못한 참가자까지 준비 완료가 됐다. 경기 시작 직후 해당 페이지는 데이터 버전이 달라 전투에 들어갈 수 없다. 단계가 생략된 준비 입력은 20라운드에만 유효하도록 했다. 회귀 테스트는 `a legacy ready only consents to a 20-round room`이다.

6. **역신이 다시 방문할 때 지난 방문의 연타가 이어졌다.** `packages/logic/src/match/yeoksin.ts:54`. 한 명만 살아 있고 외다리 도깨비가 직전 방문에서 역신을 두 번 맞혔다면, 다음 방문 첫 타격이 세 번째 타격으로 계산됐다. 역신이 고개를 떠날 때 해당 역신을 겨누던 유닛의 연타와 역신에 남은 약화 시전자 정보를 지운다. 회귀 테스트는 `a new yeoksin visit resets the previous visit's target streak`다.

## Minor · 수정 완료

1. **설화로 만든 최고 등급이 결산에서 빠진다.** `packages/logic/src/match/step.ts:147`. 첫 6등급을 설화로 받으면 최고 유닛 집계가 끝난 뒤에 소환 이벤트가 생긴다. 이후 다른 6등급을 만들지 않으면 실제로 6등급을 사용해도 결산에는 이전 최고 유닛이 남았다. 라운드 종료에 새로 발생한 소환 이벤트도 결산 집계에 반영한다. 회귀 테스트는 `story settlement sees coins before the round-end 10 and records the grade-6 award in the result`다.

2. **늦은 보스 격파의 소요 시간이 다음 라운드 통계에 찍힌다.** `packages/logic/src/combat.ts:119`. 20라운드 보스를 21라운드 첫 틱에 처치하면 21라운드 통계에 0초가 기록된다. 보스가 등장한 라운드 통계에 그 라운드 시작부터의 경과 시간을 기록한다. 회귀 테스트는 `a round 20 boss killed after the shared clock enters 21 drops its material and records time in round 20`이다.

3. **보스 스턴이 상한에 걸릴 때 화면 위치가 한 틱 뒤처진다.** `packages/logic/src/bosscontrol.ts:35`. 스턴을 풀면서 이동 전 좌표를 전송한 뒤 같은 틱에 서버 보스가 이동한다. 다음 위치 갱신 전까지 스트림으로 보는 좌표와 전체 스냅샷 좌표가 한 틱 이동 거리만큼 달랐다. 스턴 해제 이벤트가 해당 틱의 이동 후 좌표를 전송한다. 회귀 테스트는 `a stun right after spawn is dropped and the speed event reports the moved position`이다.

4. **사슬의 두 번째 표적부터 이벤트 적의 우선순위가 떨어진다.** `packages/logic/src/effects.ts:225`. 씨름 상대와 더 작은 ID의 잡귀가 모두 다음 사슬 거리 안에 있으면 사슬은 잡귀로 간다. 첫 표적을 고를 때에는 씨름 상대에 보스와 같은 우선순위를 준다. 사슬이 이어질 때도 같은 우선순위를 적용한다. 회귀 테스트는 `a chain bounce prefers the event enemy over a lower-id normal enemy`다.

5. **탈락한 고개의 이벤트 표시 상태가 남는다.** `packages/logic/src/match/seats.ts:69`. 쇠밥짐승이 살아 있는 채로 기권하면 적 목록은 비워지지만 개인 미션의 활성 상태와 이벤트 적 기록은 남는다. 이후 명령과 보상은 생존 검사에서 걸러지지만, 넋으로 재접속한 플레이어의 개인 스냅샷에는 끝난 고개의 기록이 활성 상태로 실렸다. 탈락할 때 활성 미션을 실패로 닫고 이벤트 적 기록을 지운다. 회귀 테스트는 `forfeiting closes the active mission and clears event records from the personal snapshot`이다.

## 검증 범위

고개별 시드 파생, 장터·소환·전투 난수 분리, 구매 실패 시 재화와 덱 보존, 보정 유닛 대기열, 배달의 199/200틱 경계·중복 제안·재배달·단절·탈락, 설화 지원 한도와 길들이기 중복 정산을 기존 테스트와 함께 확인했다. 서버는 발신 좌석을 연결에서 정하고, 명령 파서는 허용 필드와 배열 길이를 검사한다. 전송 계층의 기본 수신 한도는 4 KiB이며 방은 연결당 초당 120개, 좌석당 틱당 20개의 게임 명령 한도를 적용한다. 대량 트래픽 부하 시험은 수행하지 않았다.

리뷰 커밋에서 밸런스 데이터와 1단계 골든 기준 파일의 변경은 없다. 20라운드 협동판은 기존 6인 방의 전체 진행·재생 테스트로도 확인했다.

최종 실행에서 `npm test`는 69개 파일의 622개 테스트를 모두 통과했다. `npm run typecheck`와 `npm run validate`도 통과했다. 데이터 검증 경고는 1단계 4건, 2단계 1건이며 3단계는 0건이다. 이후 `main`에 들어온 `7c73ffe`까지의 추가 변경은 도감 검색·도우미 표시·UX 기록이며 이 검증 수치는 리뷰 브랜치 기준이다.
