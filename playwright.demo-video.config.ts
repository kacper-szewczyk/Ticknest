import { defineConfig } from '@playwright/test'
import e2eConfig from './playwright.config.ts'

// Records the launch demo video into the gitignored demo-video/ folder. Run it with `npm run demo-video`, which
// starts the Auth, Firestore, and Functions emulators first; this config reuses the e2e web server and demo-mode
// settings. See "Demo video" in CONTRIBUTING.md.

export default defineConfig({
  ...e2eConfig,
  testDir: 'tests/demo-video',
  retries: 0,
  // Each take is a 60–90 s walkthrough plus signing in and encoding.
  timeout: 240_000,
  reporter: [['list']],
  use: {
    ...e2eConfig.use,
    trace: 'off',
    screenshot: 'off',
  },
  projects: [{ name: 'demo-video' }],
})
