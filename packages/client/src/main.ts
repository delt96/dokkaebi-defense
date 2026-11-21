import { startOnline } from './online/app';
import { startSolo } from './solo';

const path = location.pathname.replace(/\/+$/, '');
const room = /^\/room\/([^/]+)$/.exec(path);

if (path === '/solo') startSolo();
else if (room) startOnline({ roomId: decodeURIComponent(room[1]!) });
else startOnline({});
