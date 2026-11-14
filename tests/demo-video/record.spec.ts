// Records the 60–90 s launch demo video from the seeded demo data, so no real personal data appears. Run it with
// `npm run demo-video` (or `DEMO_VIDEO_LANGUAGE=pl npm run demo-video` for the Polish UI); see "Demo video" in
// CONTRIBUTING.md. Output goes to the gitignored demo-video/ folder; the uploaded copy is the canonical one.
//
// It records the same walkthrough twice: a clean take, which the .srt caption files are timed against (for YouTube),
// and a take with the captions drawn on the page (for LinkedIn and X, which autoplay without sound).
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoAccount, reseedEmulators } from '../e2e/fixtures'
import {
  expandAllDays,
  LANGUAGES,
  loadCatalog,
  newContext,
  signInAs,
  tryRun,
  type Catalog,
  type Language,
} from '../screenshots/helpers'
import { CAPTIONS, toSrt, type CaptionStep, type Cue } from './captions'

const OUTPUT_DIR = path.resolve('demo-video')
// Laid out and recorded at 1280×720, so the text is large enough to read in a video. Playwright records at the
// viewport's CSS size whatever the device scale factor, so ffmpeg scales the result up to 1080p.
const VIEWPORT = { width: 1280, height: 720 }
const OUTPUT_HEIGHT = 1080
const INVITEE = 'new.teammate@example.com'

const requested = process.env.DEMO_VIDEO_LANGUAGE ?? 'en'
if (!(LANGUAGES as readonly string[]).includes(requested)) {
  throw new Error(`DEMO_VIDEO_LANGUAGE must be one of ${LANGUAGES.join(', ')}.`)
}
const language = requested as Language

/**
 * A pointer drawn on the page, since the recorded video has no cursor. It follows the mouse events Playwright sends,
 * and shrinks briefly on a click.
 */
function installPointer(): void {
  const draw = () => {
    if (document.getElementById('demo-pointer')) return
    const pointer = document.createElement('div')
    pointer.id = 'demo-pointer'
    Object.assign(pointer.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '22px',
      height: '22px',
      margin: '-11px 0 0 -11px',
      borderRadius: '50%',
      background: 'rgba(20, 20, 20, 0.35)',
      border: '2px solid rgba(255, 255, 255, 0.9)',
      boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
      pointerEvents: 'none',
      zIndex: '2147483647',
      transform: 'translate(-100px, -100px)',
      transition: 'scale 120ms ease-out',
    })
    document.body.append(pointer)
    document.addEventListener('mousemove', (event) => {
      pointer.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`
    })
    document.addEventListener('mousedown', () => (pointer.style.scale = '0.7'))
    document.addEventListener('mouseup', () => (pointer.style.scale = '1'))
  }
  if (document.body) draw()
  else document.addEventListener('DOMContentLoaded', draw)
}

/** Shows `text` in a caption bar at the bottom of the page, or hides the bar when `text` is null. */
async function showCaption(page: Page, text: string | null): Promise<void> {
  await page.evaluate((caption) => {
    let bar = document.getElementById('demo-caption')
    if (!bar) {
      bar = document.createElement('div')
      bar.id = 'demo-caption'
      Object.assign(bar.style, {
        position: 'fixed',
        left: '50%',
        bottom: '28px',
        transform: 'translateX(-50%)',
        maxWidth: '80%',
        padding: '10px 18px',
        borderRadius: '8px',
        background: 'rgba(0, 0, 0, 0.78)',
        color: '#fff',
        font: '500 22px/1.35 system-ui, sans-serif',
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: '2147483646',
      })
      document.body.append(bar)
    }
    bar.textContent = caption ?? ''
    bar.style.display = caption ? 'block' : 'none'
  }, text)
}

/** Glides the pointer to the middle of `target`, so viewers can follow it, then clicks. */
async function glideAndClick(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded()
  const box = await target.boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 })
    await page.waitForTimeout(200)
  }
  await target.click()
}

/** Smoothly scrolls the main content by `pixels`. */
async function scrollBy(page: Page, pixels: number): Promise<void> {
  await page.evaluate((top) => {
    const scroller = document.querySelector('main') ?? document.scrollingElement
    scroller?.scrollBy({ top, behavior: 'smooth' })
    if (scroller !== document.scrollingElement) document.scrollingElement?.scrollBy({ top, behavior: 'smooth' })
  }, pixels)
  await page.waitForTimeout(900)
}

type Take = { captioned: boolean }

/**
 * Walks through the app as the demo owner and returns when each caption step started and ended, in seconds from
 * `clipStart` (the moment the walkthrough begins, after signing in).
 */
async function walkthrough(page: Page, catalog: Catalog, { captioned }: Take, recordingStarted: number) {
  const cues: Cue[] = []
  let clipStart = 0
  const elapsed = () => (Date.now() - recordingStarted) / 1000 - clipStart

  /** Runs one step with its caption on screen for at least `minSeconds`. */
  async function step(name: CaptionStep, minSeconds: number, action: () => Promise<void> = async () => {}) {
    const start = elapsed()
    if (captioned) await showCaption(page, CAPTIONS[language][name])
    await action()
    const remaining = minSeconds - (elapsed() - start)
    if (remaining > 0) await page.waitForTimeout(remaining * 1000)
    cues.push({ step: name, start, end: elapsed() })
  }

  await signInAs(page, catalog, 'owner')
  await expandAllDays(page)
  await page.evaluate(() => document.fonts.ready)
  await page.mouse.move(VIEWPORT.width * 0.6, VIEWPORT.height * 0.6)
  await page.waitForTimeout(800)
  clipStart = (Date.now() - recordingStarted) / 1000

  const timer = page.getByRole('region', { name: 'Timer' })

  await step('intro', 4)
  await step('startTimer', 6, async () => {
    const description = timer.getByRole('textbox', { name: 'What are you working on?' })
    await glideAndClick(page, description)
    await description.pressSequentially(
      language === 'pl' ? 'Przegląd makiet strony głównej' : 'Homepage wireframe review',
      { delay: 45 },
    )
    const picker = timer.getByRole('combobox')
    await glideAndClick(page, picker)
    await picker.pressSequentially('Website', { delay: 60 })
    await glideAndClick(page, page.getByRole('option').filter({ hasText: 'Website redesign' }).first())
    await glideAndClick(page, timer.getByRole('button', { name: 'Start' }))
    await expect(timer.getByRole('button', { name: 'Stop' })).toBeVisible()
  })
  await step('running', 5)
  await step('stopTimer', 5, async () => {
    await glideAndClick(page, timer.getByRole('button', { name: 'Stop' }))
    await expect(timer.getByRole('button', { name: 'Start' })).toBeVisible()
  })
  await step('timesheet', 7, async () => {
    await page.waitForTimeout(1_000)
    await scrollBy(page, 420)
    await page.waitForTimeout(1_200)
    await scrollBy(page, -420)
  })
  await step('reports', 9, async () => {
    const nav = page.getByRole('navigation', { name: catalog.shell.mainNavigation })
    await glideAndClick(page, nav.getByRole('button', { name: catalog.nav.reports }))
    await expect(page.getByRole('button', { name: 'Export PDF' })).toBeEnabled()
    await page.waitForTimeout(1_500)
    await glideAndClick(page, page.locator('#report-group-tab-project'))
    await page.waitForTimeout(1_500)
    await glideAndClick(page, page.locator('#report-group-tab-user'))
    await page.waitForTimeout(1_000)
  })
  await step('exportPdf', 5, async () => {
    const exportPdf = page.getByRole('button', { name: 'Export PDF' })
    const download = page.waitForEvent('download')
    await glideAndClick(page, exportPdf)
    await download
  })
  await step('members', 6, async () => {
    const nav = page.getByRole('navigation', { name: catalog.shell.mainNavigation })
    await glideAndClick(page, nav.getByRole('button', { name: catalog.nav.members }))
    await expect(page.getByText(demoAccount('member').email).first()).toBeVisible()
    await page.waitForTimeout(1_000)
  })
  await step('invite', 8, async () => {
    const email = page.getByRole('textbox', { name: 'Email address' })
    await glideAndClick(page, email)
    await email.pressSequentially(INVITEE, { delay: 40 })
    await glideAndClick(page, page.getByRole('button', { name: 'Create invitation' }))
    await expect(page.getByRole('textbox', { name: 'Invitation link' })).toBeVisible()
  })
  await step('outro', 5, async () => {
    await page.mouse.move(VIEWPORT.width - 40, VIEWPORT.height - 40, { steps: 20 })
  })
  if (captioned) await showCaption(page, null)

  return { cues, clipStart, duration: elapsed() }
}

test.beforeAll(async () => {
  await mkdir(OUTPUT_DIR, { recursive: true })
})

// Each take reseeds, so the timer and invitation from the first never show up in the second.
test.beforeEach(reseedEmulators)

for (const captioned of [false, true]) {
  test(`${language} demo video, ${captioned ? 'with captions' : 'clean'}`, async ({ browser }) => {
    const catalog = await loadCatalog(language)
    const videoDir = await mkdtemp(path.join(tmpdir(), 'ticknest-demo-video-'))
    try {
      const context = await newContext(browser, language, {
        viewport: VIEWPORT,
        recordVideo: { dir: videoDir, size: VIEWPORT },
      })
      await context.addInitScript(installPointer)
      const recordingStarted = Date.now()
      const page = await context.newPage()
      const { cues, clipStart, duration } = await walkthrough(page, catalog, { captioned }, recordingStarted)

      const video = page.video()
      await context.close()
      if (!video) throw new Error('The browser did not record a video.')

      const name = `ticknest-demo-${language}${captioned ? '-captioned' : ''}`
      // The .srt files are timed against the clean take, the one uploaded with separate captions.
      if (!captioned) {
        for (const captionLanguage of ['en', 'pl'] as const) {
          await writeFile(path.join(OUTPUT_DIR, `${name}.${captionLanguage}.srt`), toSrt(cues, captionLanguage))
        }
      }
      // H.264 in an MP4 plays everywhere the launch posts go; the walkthrough starts after the sign-in screen.
      await tryRun('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-ss',
        clipStart.toFixed(2),
        '-t',
        duration.toFixed(2),
        '-i',
        await video.path(),
        '-vf',
        `scale=-2:${OUTPUT_HEIGHT}:flags=lanczos`,
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-r',
        '30',
        '-movflags',
        '+faststart',
        '-an',
        path.join(OUTPUT_DIR, `${name}.mp4`),
      ])
      console.log(`${name}: ${duration.toFixed(1)} s`)
    } finally {
      await rm(videoDir, { recursive: true, force: true })
    }
  })
}
