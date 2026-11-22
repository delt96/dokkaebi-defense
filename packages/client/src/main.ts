import { installAudioInput } from './audio/engine';
import { startOnline } from './online/app';
import { startSolo } from './solo';
import { warmArt } from './art';
import './audio/settings.css';

const path = location.pathname.replace(/\/+$/, '');
const room = /^\/room\/([^/]+)$/.exec(path);

installAudioInput();
if (path === '/solo') startSolo();
else {
  startOnline({
    roomId: room ? decodeURIComponent(room[1]!) : undefined,
    onSolo: href => {
      history.pushState(null, '', href);
      window.addEventListener('popstate', () => location.reload(), { once: true });
      startSolo();
    },
  });
  warmArt();
}
