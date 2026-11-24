# 작업 규칙

## main 브랜치 푸시
- main은 render.com(`render.yaml`)에 연결되어 있어, main에 푸시하면 바로 실서버에 배포된다.
- **main에 푸시(머지 포함)하기 전에는 반드시 사용자에게 먼저 물어보고 승인을 받는다.** 예약된 푸시도 마찬가지로, 사용자가 그 푸시를 직접 지시한 경우에만 한다.
- 평소 작업은 작업 브랜치에 커밋·푸시한다.
- 승인을 구하기 전에 `curl -s https://dokkaebi-defense.onrender.com/api/live`로 지금 열린 방을 확인해 함께 알린다. 배포하면 서버가 재시작돼 온라인 방이 끊긴다(솔로는 브라우저에서 돌아 영향 없음). `phase`가 `playing`인 방이 있으면 인원과 라운드를 말하고 지금 올릴지 기다릴지 묻는다.
- 배포 결과는 GitHub 배포 기록으로 본다: `gh api "repos/delt96/dokkaebi-defense/deployments?per_page=3"`로 커밋을 찾고 `deployments/<id>/statuses`가 `success`인지 확인한다.
