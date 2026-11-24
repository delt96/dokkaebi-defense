# 실서버 접속 현황 (`GET /api/live`)

## 왜
main에 push하면 Render가 서버를 재시작해 진행 중인 온라인 방이 끊긴다. 지금은 누가 플레이 중인지 알 길이 없다(방 정보는 Render 로그에만 있고, 세션에는 Render API 키가 없다). push 전에 확인할 수 있게 한다.

## 결정
- 서버에 `GET /api/live`를 추가한다. 응답:
  `{ rooms, players, list: [{ phase, stage, round, players }] }`
  - `phase`: 방 단계(lobby | playing | result | closed)
  - `round`: 게임 중이면 현재 라운드, 대기실이면 0
  - `players`: 지금 연결된 사람 수(끊긴 좌석은 세지 않음)
- 방 id·닉네임은 넣지 않는다. 누구나 열 수 있는 주소라 방 id가 보이면 모르는 사람이 남의 방에 들어올 수 있다.
- 캐시하지 않는다(`Cache-Control: no-store`).
- 방 목록은 Colyseus 매치메이커 대신 서버가 직접 들고 있는 집합으로 센다: 방이 만들어질 때 넣고, 사라질 때(`onDispose`) 뺀다. `RoomCore`만으로 시험할 수 있다.
- push 전 확인 순서는 프로젝트 `CLAUDE.md`의 main 푸시 항목에 적는다.

## 방식 비교
- 직접 들고 있는 집합(채택): 단순하고 Colyseus 내부 API에 기대지 않는다.
- `matchMaker.query`: Colyseus가 방 캐시를 주지만 단계·라운드는 없어 결국 방 객체를 따로 찾아야 한다.
- Render 로그 API: API 키를 세션에 두어야 하고, 로그를 해석해야 한다.

## 한계
- 솔로는 브라우저에서만 돌아 셀 수 없다(배포해도 솔로 판은 끊기지 않는다).
- 이 경로가 들어가는 첫 배포 때는 확인할 수 없다.
- Render 무료 서버가 잠들어 있으면 이 주소를 여는 순간 깨어난다(그때는 당연히 방 0개).
