import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { apiDevServer } from './vite-plugins/apiDevServer.ts';

export default defineConfig(({ mode }) => {
  // Make .env / .env.local available to the dev API routes (server side only; nothing is exposed to the client).
  // Skipped under Vitest so tests never pick up real secrets.
  if (mode !== 'test') {
    for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) {
      process.env[key] ??= value;
    }
  }

  return {
    plugins: [react(), apiDevServer()],
    server: { host: true },
    test: {
      env: { TZ: 'America/Toronto' },
      coverage: {
        include: ['src/**', 'api/**', 'server/**', 'shared/**'],
        exclude: ['**/*.test.*', 'src/test/**', 'server/testing/**', 'src/main.tsx'],
      },
      projects: [
        {
          extends: true,
          test: {
            name: 'server',
            environment: 'node',
            // Creating and migrating an in-memory Postgres (PGlite) takes a few seconds under a parallel load.
            testTimeout: 20_000,
            hookTimeout: 20_000,
            include: ['tests/**/*.test.ts', 'server/**/*.test.ts', 'shared/**/*.test.ts', 'vite-plugins/**/*.test.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'web',
            environment: 'happy-dom',
            include: ['src/**/*.test.{ts,tsx}'],
            setupFiles: ['src/test/setup.ts'],
          },
        },
      ],
    },
  };
});
