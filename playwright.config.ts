import { defineConfig, devices } from '@playwright/test'

// End-to-end tests. Run them with `npm run test:e2e`, which starts the Auth, Firestore, and Functions emulators
// first; this config only starts the web app. See "End-to-end tests" in CONTRIBUTING.md.

// A port of its own, so a `npm run dev` server on 5173 (possibly with other settings) is never reused.
const PORT = 5174
const isCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: 'tests/e2e',
  // Every spec file reseeds the one shared emulator project, so files must not run at the same time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // The demo accounts work in Europe/Warsaw, so "today" in the app matches the seeded workday.
    timezoneId: 'Europe/Warsaw',
    locale: 'en-GB',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      // Only the specs tagged @mobile run on the small-screen layout, which keeps the suite fast.
      grep: /@mobile/,
    },
  ],
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    // Process env wins over .env files, so a local .env.local pointing at a real project cannot leak in.
    env: {
      VITE_USE_FIREBASE_EMULATORS: 'true',
      VITE_FIREBASE_API_KEY: 'demo-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-ticknest.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-ticknest',
      VITE_FIREBASE_APP_ID: 'demo-app-id',
      VITE_FIREBASE_FUNCTIONS_REGION: 'europe-west1',
      VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: '',
      VITE_APP_CHECK_DEBUG_TOKEN: '',
      VITE_DEMO_MODE: 'true',
      VITE_GOOGLE_SIGN_IN_ENABLED: 'false',
    },
  },
})
