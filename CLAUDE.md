# 작업 규칙

## main 브랜치 푸시
- main은 render.com(`render.yaml`)에 연결되어 있어, main에 푸시하면 바로 실서버에 배포된다.
- **main에 푸시(머지 포함)하기 전에는 반드시 사용자에게 먼저 물어보고 승인을 받는다.** 예약된 푸시도 마찬가지로, 사용자가 그 푸시를 직접 지시한 경우에만 한다.
- 평소 작업은 작업 브랜치에 커밋·푸시한다.
- 승인을 구하기 전에 `curl -s https://dokkaebi-defense.onrender.com/api/live`로 지금 열린 방을 확인해 함께 알린다. 배포하면 서버가 재시작돼 온라인 방이 끊긴다(솔로는 브라우저에서 돌아 영향 없음). `phase`가 `playing`인 방이 있으면 인원과 라운드를 말하고 지금 올릴지 기다릴지 묻는다.
- 배포 결과는 GitHub 배포 기록으로 본다: `gh api "repos/delt96/dokkaebi-defense/deployments?per_page=3"`로 커밋을 찾고 `deployments/<id>/statuses`가 `success`인지 확인한다.

## 실서버 접속 현황 (`GET /api/live`)
- 주소: https://dokkaebi-defense.onrender.com/api/live (로컬 서버는 `http://localhost:2567/api/live`)
- 응답: `{ rooms, players, list: [{ phase, stage, round, players }] }`
  - `phase`: `lobby`(대기실) · `playing`(게임 중) · `result`(결과 화면) · `closed`
  - `round`: 게임 중이면 현재 라운드, 대기실이면 0
  - `players`: 지금 연결된 사람만 센다(끊긴 좌석은 빠진다)
- 누구나 열 수 있는 주소다. **방 id와 닉네임은 응답에 넣지 않는다.** 방 id가 보이면 모르는 사람이 남의 방에 들어올 수 있다.
- 솔로 판은 브라우저에서만 돌아 셀 수 없다.
- Render 무료 서버가 잠들어 있으면 이 주소를 여는 순간 깨어난다. 그때는 방 0개로 나온다.
- 코드: `packages/server/src/live.ts`. 방은 `MatchRoom` 생성 때 `liveRooms`에 넣고 `onDispose`에서 뺀다. 시험은 `packages/server/test/live.test.ts`, `server.test.ts`.

## 실서버 로그 (Render API)
- 키는 메인 체크아웃 루트의 `.env`(git이 무시함)에 있다: `RENDER_API_KEY`, `RENDER_SERVICE_ID`(`srv-…`), `RENDER_OWNER_ID`(`tea-…`). worktree에는 없으니 메인 체크아웃의 파일을 읽는다. 키 값은 출력하지 않는다.
- `GET https://api.render.com/v1/logs?ownerId=…&resource=<서비스 id>&startTime=…&endTime=…&direction=backward&limit=100`, 헤더 `Authorization: Bearer <키>`. 응답 `hasMore`가 참이면 `nextEndTime`을 다음 `endTime`으로 넣어 이어 받는다.
- 글자 검색(`text=`)은 시간 범위를 함께 줘야 한다. 범위 없이 한글로 찾으면 응답이 오지 않았다.
- 끝난 판은 `[판 기록] <id> {요약}` 한 줄과 `[판 기록 데이터 i/n] <id> <조각>` 줄로 남는다. `readPlayLog`(`packages/server/src/playLog.ts`)로 되살리고, 솔로 판은 그 판의 `rulesRevision` 커밋에서 `replayGame(data, seed, difficulty, log)`로 다시 돌린다(데이터 버전이 맞아야 같은 판이 나온다).
