export type SoloMenuKind = 'menu' | 'restartAsk' | 'homeAsk';

const MENU_TEXT = '시간이 멈춰 있습니다. 다시 시작하거나 처음 화면으로 가면 지금 판은 기록되지 않고 사라집니다.';

const ASKS: Record<Exclude<SoloMenuKind, 'menu'>, { head: string; text: string; action: string }> = {
  restartAsk: { head: '다시 시작', text: '지금 판을 버리고 같은 난이도로 다시 시작할까요?', action: 'restart' },
  homeAsk: { head: '처음 화면으로', text: '지금 판을 버리고 처음 화면으로 갈까요?', action: 'home' },
};

export function soloMenuHtml(kind: SoloMenuKind): string {
  if (kind === 'menu') {
    return `<div class="modal solo-menu" role="dialog" aria-label="메뉴"><div class="modal-head"><span>메뉴</span><button data-action="closeModal">닫기</button></div>`
      + `<div class="modal-actions"><button data-action="askRestart">다시 시작</button><button data-action="askHome">처음 화면으로</button></div>`
      + `<p class="modal-text">${MENU_TEXT}</p></div>`;
  }
  const a = ASKS[kind];
  // danger left and 취소 right with the focus, as in the online forfeit window
  return `<div class="modal solo-menu" role="alertdialog" aria-label="${a.head}"><div class="modal-head">${a.head}</div>`
    + `<p class="modal-text">${a.text}</p>`
    + `<div class="modal-actions"><button class="danger" data-action="${a.action}">${a.head}</button><button data-action="menuBack" data-autofocus>취소</button></div></div>`;
}
