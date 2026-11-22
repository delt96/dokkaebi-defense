import { installAudioInput } from './audio/engine';
import { startOnline } from './online/app';
import { startSolo } from './solo';
import './audio/settings.css';

const path = location.pathname.replace(/\/+$/, '');
const room = /^\/room\/([^/]+)$/.exec(path);

installAudioInput();
if (path === '/solo') startSolo();
else if (room) startOnline({ roomId: decodeURIComponent(room[1]!) });
else startOnline({});
