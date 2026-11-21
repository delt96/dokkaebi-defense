import { NetClient, stage2DataVersion, type NetEvent } from '../net/NetClient';
import { connectCreate, connectJoin, type RoomLike } from '../net/room';
import { clearSession, lastName, loadSession } from '../net/session';
import { JOIN_ERROR_CODES, loadGameData } from '@dorandi/logic';
import { startBattle } from './battle';
import { renderEntry } from './entry';
import { renderLobby } from './lobby';
import { NO_ROOM_CODE, TEXT, joinErrorText } from './text';

type Screen = 'entry' | 'connecting' | 'lobby' | 'battle';

function errorCode(err: unknown): number {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'number' ? code : 0;
}

export function startOnline(opts: { roomId?: string }): void {
  const root = document.getElementById('screen');
  if (!root) throw new Error('missing #screen');
  let screen: Screen = 'entry';
  let net: NetClient | null = null;
  let notice = '';
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  const showEntry = (error?: string, name?: string, newRoomButton = false): void => {
    screen = 'entry';
    net = null;
    renderEntry(root, {
      roomId: opts.roomId,
      name: name ?? lastName() ?? '',
      error,
      newRoomButton,
      onSubmit: submit,
    });
  };

  const showConnecting = (): void => {
    screen = 'connecting';
    root.replaceChildren();
    const box = document.createElement('div');
    box.className = 'screen-box';
    box.textContent = TEXT.connecting;
    root.append(box);
  };

  const showLobby = (): void => {
    const msg = net?.lobby;
    if (!net || !msg) return;
    const n = net;
    screen = 'lobby';
    renderLobby(root, msg, {
      ready: v => n.ready(v),
      start: () => n.start(),
      copy: () => { void navigator.clipboard?.writeText(location.href).catch(() => undefined); },
    }, notice);
  };

  const flashNotice = (text: string): void => {
    notice = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice = ''; if (screen === 'lobby') showLobby(); }, 3000);
    if (screen === 'lobby') showLobby();
  };

  const showBattle = (n: NetClient): void => {
    screen = 'battle';
    // an empty #screen is hidden, which uncovers the stage underneath
    root.replaceChildren();
    startBattle(n, loadGameData('stage2'));
  };

  const onEvent = (e: NetEvent): void => {
    switch (e.kind) {
      case 'lobby':
        if (screen === 'connecting' || screen === 'lobby') showLobby();
        break;
      case 'view':
        // the first full snapshot means the match is on
        if (screen !== 'battle' && net) showBattle(net);
        break;
      case 'notice':
        // a second "start" answers notInLobby; once the match runs it is not worth a message
        if (e.msg.kind === 'roomError' && e.msg.reason === 'notReady' && screen === 'lobby') flashNotice(TEXT.notReady);
        break;
      case 'left':
        if (screen === 'lobby' || screen === 'connecting') showEntry(TEXT.connectFail);
        break;
      default:
        break;
    }
  };

  const attach = (room: RoomLike): void => {
    const client = new NetClient(room, stage2DataVersion());
    net = client;
    history.replaceState(null, '', `/room/${room.roomId}`);
    client.on(onEvent);
  };

  async function submit(name: string): Promise<void> {
    showConnecting();
    try {
      attach(opts.roomId ? await connectJoin(opts.roomId, { name }) : await connectCreate(name));
    } catch (err) {
      const code = errorCode(err);
      showEntry(joinErrorText(code), name, code === NO_ROOM_CODE);
    }
  }

  const stored = opts.roomId ? loadSession(opts.roomId) : null;
  if (opts.roomId && stored?.key) {
    // a reload or a duplicated tab: take the seat back with the stored key, no nickname prompt
    const roomId = opts.roomId;
    showConnecting();
    connectJoin(roomId, { name: stored.name, rejoinKey: stored.key }).then(attach, (err: unknown) => {
      const code = errorCode(err);
      if (code === JOIN_ERROR_CODES.badKey) clearSession(roomId);
      showEntry(joinErrorText(code), stored.name, code === NO_ROOM_CODE);
    });
  } else {
    showEntry(undefined, stored?.name);
  }
}
