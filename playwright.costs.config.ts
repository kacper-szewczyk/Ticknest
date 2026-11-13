import { defineConfig } from '@playwright/test'
import e2e from './playwright.config.ts'

// The Firestore cost measurement. Run it with `npm run measure:costs`, which starts the emulators first. It drives
// the real app like the e2e suite, in a build that counts billed Firestore operations (tests/costs/firestore-counter.ts).

const PORT = 5175
const e2eServer = Array.isArray(e2e.webServer) ? e2e.webServer[0] : e2e.webServer

export default defineConfig({
  ...e2e,
  testDir: 'tests/costs',
  retries: 0,
  timeout: 180_000,
  use: { ...e2e.use, baseURL: `http://127.0.0.1:${PORT}` },
  projects: e2e.projects?.filter((project) => project.name === 'chromium'),
  webServer: {
    ...e2eServer,
    command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    env: {
      ...e2eServer?.env,
      TICKNEST_COUNT_FIRESTORE: 'true',
      // Measure what a default deployment has: budgets on, time off off.
      VITE_FEATURE_TIME_OFF_ENABLED: 'false',
    },
  },
})
