import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// A time zone with DST, so local-day tests cover 23- and 25-hour days. Workers inherit it.
process.env.TZ = 'Europe/Warsaw'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          environment: 'node',
        },
        // vite-plugin-pwa only runs in vite.config.ts, so its virtual module needs a stand-in here.
        resolve: {
          alias: {
            'virtual:pwa-register': fileURLToPath(new URL('./tests/unit/stubs/pwa-register.ts', import.meta.url)),
          },
        },
      },
      {
        // Needs the Auth, Firestore, and Functions emulators; run through `npm run test:emulators`.
        test: {
          name: 'emulator',
          include: ['tests/emulator/**/*.test.ts'],
          environment: 'node',
          // Files share one emulator project and clear it between tests.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
