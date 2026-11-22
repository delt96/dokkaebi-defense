import { gameAudio } from '../audio/engine';
import { NetClient, knownDataVersions, stageOfVersion, type NetEvent } from '../net/NetClient';
import { connectCreate, connectJoin, devCreateOptions, type RoomLike } from '../net/room';
import { clearSession, lastName, loadSession } from '../net/session';
import { JOIN_ERROR_CODES, loadGameData, type Difficulty } from '@dorandi/logic';
import { startBattle } from './battle';
import { renderEntry } from './entry';
import { renderLobby } from './lobby';
import { NO_ROOM_CODE, TEXT, joinErrorText } from './text';

const RETRY_MS = 2000;
/** Colyseus close codes: 4000 consented leave (ours, or the server closing the room), 4001 server-side close (tab replaced). */
const LEAVE_CONSENTED = 4000;
const LEAVE_REPLACED = 4001;

const REMATCH_KEY = 'dorandi.rematch';

/** The rematch room is entered on a fresh page load, so the battle screen's handlers are never mounted twice. */
function takeRematch(roomId: string): { hostToken?: string } | null {
  try {
    const raw = sessionStorage.getItem(REMATCH_KEY);
    sessionStorage.removeItem(REMATCH_KEY);
    const v = raw ? JSON.parse(raw) as { roomId?: unknown; hostToken?: unknown } : null;
    if (!v || v.roomId !== roomId) return null;
    return typeof v.hostToken === 'string' ? { hostToken: v.hostToken } : {};
  } catch { return null; }
}

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

  const showEntry = (error?: string, name?: string): void => {
    if (error) gameAudio.play('error');
    screen = 'entry';
    net = null;
    renderEntry(root, {
      roomId: opts.roomId,
      name: name ?? lastName() ?? '',
      error,
      onSubmit: submit,
    });
  };

  const showConnecting = (): void => {
    screen = 'connecting';
    root.replaceChildren();
    const box = document.createElement('div');
    box.className = 'screen-box message';
    box.textContent = TEXT.connecting;
    root.append(box);
  };

  const showLobby = (): void => {
    const msg = net?.lobby;
    if (!net || !msg) return;
    const n = net;
    screen = 'lobby';
    renderLobby(root, msg, {
      ready: v => n.ready(v, msg.stage, msg.difficulty),
      start: () => n.start(),
      difficulty: d => n.setDifficulty(d),
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
    // the snapshot's data version says which rules the room plays (20 or 60 rounds)
    startBattle(n, loadGameData(stageOfVersion(n.view?.dataVersion ?? '') ?? 'stage2'), goRematch);
  };

  let stopped = false;
  let reconnecting = false;
  const band = document.createElement('div');
  band.id = 'conn-band';
  band.setAttribute('role', 'status');
  document.body.append(band);

  /**
   * Ends the page with a message. Once the battle screen is mounted the entry form must not come back
   * on this page (a second battle would double every key handler), so a new room is a fresh page load.
   */
  const showMessage = (text: string, newRoomLink = false): void => {
    gameAudio.musicMode(null);
    gameAudio.play('error');
    stopped = true;
    band.textContent = '';
    root.replaceChildren();
    const box = document.createElement('div');
    box.className = 'screen-box message';
    box.textContent = text;
    if (newRoomLink) {
      const link = document.createElement('a');
      link.className = 'entry-link';
      link.setAttribute('href', '/');
      link.textContent = TEXT.newRoom;
      box.append(link);
    }
    root.append(box);
  };

  // Lost link during the match: retry with the stored key every 2 seconds (spec 6).
  const reconnect = (): void => {
    if (reconnecting || stopped) return;
    const roomId = opts.roomId ?? net?.roomId;
    const stored = roomId ? loadSession(roomId) : null;
    if (!roomId || !stored?.key) { showMessage(TEXT.noRoom, true); return; }
    reconnecting = true;
    band.textContent = TEXT.disconnected;
    const attempt = (): void => {
      if (stopped) return;
      connectJoin(roomId, { name: stored.name, rejoinKey: stored.key }).then(room => {
        // the new client saves the reissued key on its first snapshot; a reload then takes the seat again
        const fresh = new NetClient(room, knownDataVersions());
        let done = false;
        fresh.on(ev => {
          if (done) return;
          if (ev.kind === 'view') { done = true; location.reload(); return; }
          if (ev.kind === 'notice' && ev.msg.kind === 'replaced') { done = true; showMessage(TEXT.replaced); return; }
          // dropped before the snapshot: the server still takes the stored key, so try again
          if (ev.kind === 'left') { done = true; setTimeout(attempt, RETRY_MS); }
        });
      }, (err: unknown) => {
        const code = errorCode(err);
        if (code === JOIN_ERROR_CODES.badKey) { showMessage(TEXT.badKey, true); return; }
        if (code === NO_ROOM_CODE) { showMessage(TEXT.noRoom, true); return; }
        setTimeout(attempt, RETRY_MS);
      });
    };
    setTimeout(attempt, RETRY_MS);
  };

  // Leave the finished room and open the new one (the first presser carries the host token).
  const goRematch = (roomId: string, hostToken?: string): void => {
    if (stopped) return;
    stopped = true;
    try { sessionStorage.setItem(REMATCH_KEY, JSON.stringify({ roomId, hostToken })); } catch { /* the entry screen takes over */ }
    const go = (): void => location.assign(`/room/${roomId}`);
    if (net) void net.leave().catch(() => undefined).then(go); else go();
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
      case 'versionMismatch':
        showMessage(TEXT.versionMismatch);
        break;
      case 'notice':
        if (e.msg.kind === 'replaced') { showMessage(TEXT.replaced); break; }
        // a second "start" answers notInLobby; once the match runs it is not worth a message
        if (e.msg.kind === 'roomError' && e.msg.reason === 'notReady' && screen === 'lobby') flashNotice(TEXT.notReady);
        if (e.msg.kind === 'roomError') gameAudio.play('error');
        break;
      case 'left':
        if (screen === 'lobby' || screen === 'connecting') showEntry(TEXT.connectFail);
        else if (screen !== 'battle' || net?.leaving || e.code === LEAVE_REPLACED) break;
        else if (e.code !== LEAVE_CONSENTED) reconnect();
        // the server closed the room (Room.disconnect); the result screen marks itself closed
        else if (!net?.view?.result) showMessage(TEXT.roomClosed, true);
        break;
      default:
        break;
    }
  };

  const attach = (room: RoomLike): void => {
    const client = new NetClient(room, knownDataVersions());
    net = client;
    history.replaceState(null, '', `/room/${room.roomId}`);
    client.on(onEvent);
  };

  function showJoinError(code: number, name: string): void {
    if (code === NO_ROOM_CODE) showMessage(TEXT.noRoom, true);
    else showEntry(joinErrorText(code), name);
  }

  async function submit(name: string, difficulty: Difficulty): Promise<void> {
    showConnecting();
    try {
      attach(opts.roomId ? await connectJoin(opts.roomId, { name }) : await connectCreate(name, { ...devCreateOptions(location.search, import.meta.env.DEV), difficulty }));
    } catch (err) {
      const code = errorCode(err);
      showJoinError(code, name);
    }
  }

  const stored = opts.roomId ? loadSession(opts.roomId) : null;
  const rematch = opts.roomId ? takeRematch(opts.roomId) : null;
  if (opts.roomId && rematch) {
    const roomId = opts.roomId;
    const name = lastName() ?? '';
    showConnecting();
    connectJoin(roomId, { name, ...(rematch.hostToken ? { hostToken: rematch.hostToken } : {}) }).then(attach, (err: unknown) => {
      const code = errorCode(err);
      showJoinError(code, name);
    });
  } else if (opts.roomId && stored?.key) {
    // a reload or a duplicated tab: take the seat back with the stored key, no nickname prompt
    const roomId = opts.roomId;
    showConnecting();
    connectJoin(roomId, { name: stored.name, rejoinKey: stored.key }).then(attach, (err: unknown) => {
      const code = errorCode(err);
      // a started room takes no nickname, so a refused key means the seat is gone for good
      if (code === JOIN_ERROR_CODES.badKey) { clearSession(roomId); showMessage(TEXT.badKey, true); return; }
      showJoinError(code, stored.name);
    });
  } else {
    showEntry(undefined, stored?.name);
  }
}
