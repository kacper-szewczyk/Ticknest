import { defineConfig } from '@playwright/test'
import e2eConfig from './playwright.config.ts'

// Captures the README and launch screenshots into docs/screenshots. Run it with `npm run screenshots`, which starts
// the Auth, Firestore, and Functions emulators first; this config reuses the e2e web server and demo-mode settings.
// See "Screenshots" in CONTRIBUTING.md.

export default defineConfig({
  ...e2eConfig,
  testDir: 'tests/screenshots',
  retries: 0,
  // Signing in, recording the timer, and exporting the PDF for two languages takes a while.
  timeout: 120_000,
  reporter: [['list']],
  use: {
    ...e2eConfig.use,
    trace: 'off',
    screenshot: 'off',
  },
  projects: [{ name: 'screenshots' }],
})
