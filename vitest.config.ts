import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'packages',
          include: ['packages/*/test/**/*.test.ts'],
          exclude: ['packages/server/**', '**/node_modules/**'],
        },
      },
      {
        // Colyseus loads @pm2/io, which writes to process.send when it exists;
        // the forks pool owns that IPC channel, so server tests run in threads.
        extends: true,
        test: {
          name: 'server',
          include: ['packages/server/test/**/*.test.ts'],
          pool: 'threads',
        },
      },
    ],
  },
});
