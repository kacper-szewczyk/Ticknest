import { defineConfig } from 'vitest/config'

// A time zone with DST, so local-day tests cover 23- and 25-hour days. Workers inherit it.
process.env.TZ = 'Europe/Warsaw'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
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
