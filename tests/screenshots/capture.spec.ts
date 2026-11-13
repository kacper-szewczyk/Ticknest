// Captures the README and launch screenshots from the seeded demo data, so no real personal data appears.
// Run with `npm run screenshots`; see "Screenshots" in CONTRIBUTING.md. Output goes to docs/screenshots/.
import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { devices, expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import type { DemoAccountRole } from '../../functions/src/demo/accounts.ts'
import type { PaletteId } from '../../src/palettes.ts'
import { demoAccount, reseedEmulators } from '../e2e/fixtures'

const run = promisify(execFile)

const OUTPUT_DIR = path.resolve('docs/screenshots')
const DESKTOP_VIEWPORT = { width: 1440, height: 900 }
const GIF_VIEWPORT = { width: 1280, height: 720 }
const PROJECT_ID = 'demo-ticknest'

// Labels for the translated parts of the UI this script clicks, read from the app's own catalogs.
type Catalog = {
  nav: Record<string, string>
  shell: { openNavigation: string; mainNavigation: string }
  demo: { useAccount: string }
}
const LANGUAGES = ['en', 'pl'] as const
type Language = (typeof LANGUAGES)[number]
const LOCALES: Record<Language, string> = { en: 'en-GB', pl: 'pl-PL' }

async function loadCatalog(language: Language): Promise<Catalog> {
  return JSON.parse(await readFile(path.resolve(`src/locales/${language}.json`), 'utf8')) as Catalog
}

/** Runs a command, or returns false when it isn't installed, so a missing optional tool skips one output. */
async function tryRun(command: string, args: string[]): Promise<boolean> {
  try {
    await run(command, args)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(`Skipped: \`${command}\` is not installed.`)
      return false
    }
    throw error
  }
}

function emulatorHost(variable: string, fallback: string): string {
  const host = process.env[variable] ?? fallback
  if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) throw new Error(`${variable} must be a local emulator.`)
  return host
}

/**
 * Saves `palette` on the demo account's profile, the same field the Appearance settings write. The app follows the
 * profile, so this is how a capture switches between the light and dark palettes. The emulators accept the
 * `Bearer owner` token as an admin, which bypasses the security rules.
 */
async function setProfilePalette(role: DemoAccountRole, palette: PaletteId): Promise<void> {
  const authHost = emulatorHost('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099')
  const firestoreHost = emulatorHost('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080')
  const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }

  const lookup = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
    { method: 'POST', headers, body: JSON.stringify({ email: [demoAccount(role).email] }) },
  )
  const { users } = (await lookup.json()) as { users?: { localId: string }[] }
  const uid = users?.[0]?.localId
  if (!uid) throw new Error(`No ${role} demo account in the Auth emulator; did the seed run?`)

  const update = await fetch(
    `http://${firestoreHost}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=palette`,
    { method: 'PATCH', headers, body: JSON.stringify({ fields: { palette: { stringValue: palette } } }) },
  )
  if (!update.ok) throw new Error(`Could not set the ${role} palette: ${update.status} ${await update.text()}`)
}

async function newContext(
  browser: Browser,
  language: Language,
  options: Parameters<Browser['newContext']>[0] = {},
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: DESKTOP_VIEWPORT,
    deviceScaleFactor: 1,
    ...options,
    locale: LOCALES[language],
    timezoneId: 'Europe/Warsaw',
  })
  // Chromium has the save-file picker, which Playwright cannot drive; without it the app downloads a Blob.
  await context.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })
  return context
}

async function signInAs(page: Page, catalog: Catalog, role: DemoAccountRole): Promise<void> {
  await page.goto('/')
  await page
    .getByRole('listitem')
    .filter({ hasText: demoAccount(role).email })
    .getByRole('button', { name: catalog.demo.useAccount })
    .click()
  await expect(page.getByRole('region', { name: 'Timer' })).toBeVisible()
}

async function navigateTo(page: Page, catalog: Catalog, label: string): Promise<void> {
  const openNavigation = page.getByRole('button', { name: catalog.shell.openNavigation })
  if (await openNavigation.isVisible()) await openNavigation.click()
  await page
    .getByRole('navigation', { name: catalog.shell.mainNavigation })
    .getByRole('button', { name: label })
    .click()
}

/** Waits for this week's entries and expands every day, so the Timesheet shows them all. */
async function expandAllDays(page: Page): Promise<void> {
  const expandAll = page.getByRole('button', { name: 'Expand all' })
  const collapseAll = page.getByRole('button', { name: 'Collapse all' })
  await expect(expandAll.or(collapseAll)).toBeVisible()
  if (await expandAll.isVisible()) await expandAll.click()
  await expect(collapseAll).toBeVisible()
}

/** Lets fonts, charts, and transitions settle, moves the pointer out of the way, then saves a screenshot. */
async function capture(page: Page, file: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  await page.mouse.move(0, 0)
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(OUTPUT_DIR, file), animations: 'disabled', caret: 'hide' })
}

async function startTimer(page: Page, description: string, project: string): Promise<void> {
  const timer = page.getByRole('region', { name: 'Timer' })
  await timer.getByRole('textbox', { name: 'What are you working on?' }).pressSequentially(description, { delay: 35 })
  const picker = timer.getByRole('combobox')
  await picker.click()
  await picker.pressSequentially(project, { delay: 35 })
  await page.getByRole('option').filter({ hasText: project }).first().click()
  await timer.getByRole('button', { name: 'Start' }).click()
  await expect(timer.getByRole('button', { name: 'Stop' })).toBeVisible()
}

test.beforeAll(async () => {
  for (const language of LANGUAGES) await mkdir(path.join(OUTPUT_DIR, language), { recursive: true })
})

for (const language of LANGUAGES) {
  test.describe(`${language} screenshots`, () => {
    let catalog: Catalog

    test.beforeAll(async () => {
      catalog = await loadCatalog(language)
    })

    // Each test reseeds, so a timer left running or a palette changed by one test never shows up in another.
    test.beforeEach(reseedEmulators)

    test('timesheet with a running timer, light and dark', async ({ browser }) => {
      for (const [palette, suffix] of [
        ['forest', 'light'],
        ['forest-night', 'dark'],
      ] as const) {
        await setProfilePalette('manager', palette)
        const context = await newContext(browser, language)
        const page = await context.newPage()
        await signInAs(page, catalog, 'manager')
        await expandAllDays(page)
        // The timer started for the light capture keeps running, so the dark one shows it too.
        if (suffix === 'light') {
          await startTimer(
            page,
            language === 'pl' ? 'Przegląd makiet strony głównej' : 'Homepage wireframe review',
            'Website redesign',
          )
        }
        // Let the running timer tick past zero.
        await page.waitForTimeout(2_500)
        await capture(page, `${language}/timesheet-${suffix}.png`)
        await context.close()
      }
    })

    test('reports and the exported PDF', async ({ browser }) => {
      const context = await newContext(browser, language)
      const page = await context.newPage()
      await signInAs(page, catalog, 'manager')
      await navigateTo(page, catalog, catalog.nav.reports)

      const exportPdf = page.getByRole('button', { name: 'Export PDF' })
      await expect(exportPdf).toBeEnabled()
      await capture(page, `${language}/reports.png`)

      const downloadEvent = page.waitForEvent('download')
      await exportPdf.click()
      const download = await downloadEvent

      // The first page of the PDF, rendered with Poppler's pdftoppm. The download is copied out first, since closing
      // the context deletes it.
      const workDir = await mkdtemp(path.join(tmpdir(), 'ticknest-pdf-'))
      try {
        const pdfPath = path.join(workDir, 'report.pdf')
        await download.saveAs(pdfPath)
        await context.close()
        const prefix = path.join(workDir, 'page')
        if (await tryRun('pdftoppm', ['-png', '-r', '110', '-f', '1', '-l', '1', '-singlefile', pdfPath, prefix])) {
          await copyFile(`${prefix}.png`, path.join(OUTPUT_DIR, `${language}/pdf-export.png`))
        }
      } finally {
        await rm(workDir, { recursive: true, force: true })
      }
    })

    test('team members', async ({ browser }) => {
      const context = await newContext(browser, language)
      const page = await context.newPage()
      await signInAs(page, catalog, 'owner')
      await navigateTo(page, catalog, catalog.nav.members)
      await expect(page.getByText('People with access')).toBeVisible()
      await expect(page.getByText(demoAccount('member').email).first()).toBeVisible()
      await capture(page, `${language}/members.png`)
      await context.close()
    })

    test('mobile timesheet', async ({ browser }) => {
      const { viewport, userAgent, isMobile, hasTouch } = devices['Pixel 7']
      const context = await newContext(browser, language, {
        viewport,
        userAgent,
        isMobile,
        hasTouch,
        deviceScaleFactor: 2,
      })
      const page = await context.newPage()
      await signInAs(page, catalog, 'member')
      await expandAllDays(page)
      await capture(page, `${language}/mobile.png`)
      await context.close()
    })

    test('timer GIF', async ({ browser }) => {
      const videoDir = await mkdtemp(path.join(tmpdir(), 'ticknest-video-'))
      try {
        const context = await newContext(browser, language, {
          viewport: GIF_VIEWPORT,
          recordVideo: { dir: videoDir, size: GIF_VIEWPORT },
        })
        const recordingStarted = Date.now()
        const page = await context.newPage()
        await signInAs(page, catalog, 'member')
        await expandAllDays(page)
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(500)

        // Only the part from here on goes into the GIF.
        const clipStart = (Date.now() - recordingStarted) / 1000
        await startTimer(page, language === 'pl' ? 'Poprawki po przeglądzie' : 'Review fixes', 'Loyalty app')
        await page.waitForTimeout(3_000)
        await page.getByRole('region', { name: 'Timer' }).getByRole('button', { name: 'Stop' }).click()
        await expect(page.getByRole('region', { name: 'Timer' }).getByRole('button', { name: 'Start' })).toBeVisible()
        await page.waitForTimeout(1_500)

        const video = page.video()
        await context.close()
        if (!video) throw new Error('The browser did not record a video.')

        // A two-pass palette keeps the GIF small and the colours true; 12 fps at 960 px wide is enough for a README.
        const filters =
          'fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5'
        await tryRun('ffmpeg', [
          '-y',
          '-loglevel',
          'error',
          '-ss',
          clipStart.toFixed(2),
          '-i',
          await video.path(),
          '-filter_complex',
          filters,
          '-loop',
          '0',
          path.join(OUTPUT_DIR, `${language}/timer.gif`),
        ])
      } finally {
        await rm(videoDir, { recursive: true, force: true })
      }
    })
  })
}
