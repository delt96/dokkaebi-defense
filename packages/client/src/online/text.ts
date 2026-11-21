import { JOIN_ERROR_CODES } from '@dorandi/logic';

export const TEXT = {
  title: '도깨비 랜덤 디펜스',
  nameLabel: '닉네임',
  namePlaceholder: '한글·영문·숫자 1~8자',
  create: '방 만들기',
  join: '입장하기',
  solo: '혼자 하기',
  soloLong: '혼자 하기 · 60라운드 (시험판)',
  modeLabel: '판 길이',
  mode20: '20라운드',
  mode60: '60라운드 (시험판)',
  modeHostOnly: '판 길이는 방장이 정합니다',
  newRoom: '새 방 만들기',
  connecting: '연결하는 중',
  started: '판이 시작되었습니다',
  lobbyTitle: '대기실',
  copy: '링크 복사',
  copied: '복사했습니다',
  host: '방장',
  me: '나',
  ready: '준비',
  waiting: '대기',
  emptySeat: '빈 자리',
  readyBtn: '준비',
  unreadyBtn: '준비 취소',
  start: '시작',
  startHint: '모두 준비하면 시작할 수 있습니다',
  notReady: '아직 준비하지 않은 사람이 있습니다',
  badName: '닉네임은 한글·영문·숫자 1~8자입니다',
  dupName: '방에 같은 닉네임이 있습니다',
  roomFull: '가득 찬 방입니다',
  alreadyStarted: '이미 시작한 방입니다',
  badKey: '자리를 되찾지 못했습니다',
  noRoom: '없거나 끝난 방입니다',
  roomClosed: '방이 닫혔습니다',
  replaced: '다른 창에서 접속했습니다',
  disconnected: '연결이 끊겼습니다 · 다시 연결하는 중',
  versionMismatch: '게임이 업데이트되었습니다. 새로고침해 주세요',
  connectFail: '서버에 연결하지 못했습니다',
} as const;

export const NO_ROOM_CODE = 522;

export function joinErrorText(code: number): string {
  switch (code) {
    case JOIN_ERROR_CODES.badName: return TEXT.badName;
    case JOIN_ERROR_CODES.dupName: return TEXT.dupName;
    case JOIN_ERROR_CODES.roomFull: return TEXT.roomFull;
    case JOIN_ERROR_CODES.alreadyStarted: return TEXT.alreadyStarted;
    case JOIN_ERROR_CODES.badKey: return TEXT.badKey;
    case NO_ROOM_CODE: return TEXT.noRoom;
    default: return TEXT.connectFail;
  }
}
