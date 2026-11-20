import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameServer } from './server';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

void createGameServer({ clientDist: resolve(repo, 'packages/client/dist') }).listen(Number(process.env.PORT ?? 2567));
