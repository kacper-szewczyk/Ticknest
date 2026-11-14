// Browser helpers shared by the screenshot capture (tests/screenshots) and the demo video (tests/demo-video). Both
// drive the app against the seeded demo data in the emulators, so no real personal data appears.
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import type { DemoAccountRole } from '../../functions/src/demo/accounts.ts'
import { demoAccount } from '../e2e/fixtures'

const run = promisify(execFile)

export const DESKTOP_VIEWPORT = { width: 1440, height: 900 }

// Labels for the translated parts of the UI these scripts click, read from the app's own catalogs.
export type Catalog = {
  nav: Record<string, string>
  shell: { openNavigation: string; mainNavigation: string }
  demo: { useAccount: string }
  timer: { region: string; placeholder: string; start: string; stop: string }
  entries: { expandAll: string; collapseAll: string }
}
export const LANGUAGES = ['en', 'pl'] as const
export type Language = (typeof LANGUAGES)[number]
const LOCALES: Record<Language, string> = { en: 'en-GB', pl: 'pl-PL' }

export async function loadCatalog(language: Language): Promise<Catalog> {
  return JSON.parse(await readFile(path.resolve(`src/locales/${language}.json`), 'utf8')) as Catalog
}

/** Runs a command, or returns false when it isn't installed, so a missing optional tool skips one output. */
export async function tryRun(command: string, args: string[]): Promise<boolean> {
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

export async function newContext(
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

export async function signInAs(page: Page, catalog: Catalog, role: DemoAccountRole): Promise<void> {
  await page.goto('/')
  await page
    .getByRole('listitem')
    .filter({ hasText: demoAccount(role).email })
    .getByRole('button', { name: catalog.demo.useAccount })
    .click()
  await expect(page.getByRole('region', { name: catalog.timer.region })).toBeVisible()
}

export async function navigateTo(page: Page, catalog: Catalog, label: string): Promise<void> {
  const openNavigation = page.getByRole('button', { name: catalog.shell.openNavigation })
  if (await openNavigation.isVisible()) await openNavigation.click()
  await page
    .getByRole('navigation', { name: catalog.shell.mainNavigation })
    .getByRole('button', { name: label })
    .click()
}

/** Waits for this week's entries and expands every day, so the Timesheet shows them all. */
export async function expandAllDays(page: Page, catalog: Catalog): Promise<void> {
  const expandAll = page.getByRole('button', { name: catalog.entries.expandAll })
  const collapseAll = page.getByRole('button', { name: catalog.entries.collapseAll })
  await expect(expandAll.or(collapseAll)).toBeVisible()
  if (await expandAll.isVisible()) await expandAll.click()
  await expect(collapseAll).toBeVisible()
}

export async function startTimer(page: Page, catalog: Catalog, description: string, project: string): Promise<void> {
  const timer = page.getByRole('region', { name: catalog.timer.region })
  await timer.getByRole('textbox', { name: catalog.timer.placeholder }).pressSequentially(description, { delay: 35 })
  const picker = timer.getByRole('combobox')
  await picker.click()
  await picker.pressSequentially(project, { delay: 35 })
  await page.getByRole('option').filter({ hasText: project }).first().click()
  await timer.getByRole('button', { name: catalog.timer.start }).click()
  await expect(timer.getByRole('button', { name: catalog.timer.stop })).toBeVisible()
}
