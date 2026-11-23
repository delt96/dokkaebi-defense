---
target: 게임 전체 UI
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:C:\\Users\\USER\\Desktop\\이범수\\도랜디\\dokkaebi-defense\\packages\\client\\src\\ui"
timestamp: 2026-11-23T03-57-55Z
slug: packages-client-src-ui
---
# 도깨비 랜덤 디펜스 전체 UI 점검 (2026-11-23)
Method: dual-agent (A 화면 사용성 · B 검사기+브라우저)
점수 20/40: 상태3 말2 통제2 일관2 예방1 알아보기1 효율3 간결2 오류안내3 도움말1

## 우선 문제
- [P1][수정] 조합 줄이 전부 글자. 결과=재료 그림 칩으로 (panels.ts:31-44,97-103,60-66 / helper.ts:168-177 / dex.ts:31,40-41,102), unitFaceHtml(storage.ts:19) 재사용
- [P1][수정] G 전부보관·S 판매·T 길들이기 확인 없음 (mount.ts:440,454,442), 보관함 스크롤 숨김(style.css:427)
- [P1][개편] 장터: 확률이 title 툴팁에만(gamble.ts:143), 횟수 표기 제각각, 사유가 어느 버튼 것인지 모호, 결과 칸 하나, 왼쪽 패널 가림
- [P1][개편] 도감·상세가 보드를 가리는데 시계는 계속 감 (style.css:473), 솔로 P 일시정지 안내 없음
- [P2][수정] 하단 도움말에 Q,Z/X/C,S,R,T,J,P 빠짐(panels.ts:86), 보드 2px 점 범례 없음
- [P2][개편] 솔로/온라인 유닛 카드·결과 화면 불일치
- [P2][수정] 용어(물깎·마깎, 물/물딜, 지게, 고정, 불 바꾸기)
- [P2][수정] 도감 행 글자 벽, 트리 범례 '보드에 있음'이 보관함 포함
- [P3][수정] 길들이기 라벨 겹침, 로비·결과 확대 안 됨, 솔로에 협동 전용 퀘스트

## 검사기
소스 스캔 0건(정규식만 돎). URL 스캔: 9~10px 글자 다수(배율 2 이상이면 실제 16px+, 창 960x540 미만이면 실제 크기), 비활성 버튼 대비 3.08:1(style.css:64), 로비 placeholder 3.7:1. 콘솔 오류 0.
