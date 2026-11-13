// Measures the billed Firestore operations of the things a team does on a workday, in the real app against the
// emulators and the seeded demo team (an owner, a manager and three members with three months of entries).
// `npm run measure:costs` runs it and writes docs/costs/firestore-usage.json, which scripts/cost-estimate.mjs turns
// into the monthly estimate in docs/operations.md.
import { writeFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import type { DemoAccountRole } from '../../functions/src/demo/accounts.ts'
import { expect, navigateTo, reseedEmulators, signInAs, test } from '../e2e/fixtures'
import type { FirestoreUsage } from './firestore-counter'

const OUTPUT = new URL('../../docs/costs/firestore-usage.json', import.meta.url)
const ZERO: FirestoreUsage = { reads: 0, writes: 0, deletes: 0, ruleReads: 0 }
// Listeners deliver their results asynchronously; give them time to settle before reading the counter.
const SETTLE_MS = 2_000

type Measurements = Record<string, FirestoreUsage>

test.describe.configure({ mode: 'serial' })
test.beforeAll(reseedEmulators)

const results: Record<string, Measurements> = {}

async function usage(page: Page): Promise<FirestoreUsage> {
  await page.waitForTimeout(SETTLE_MS)
  return page.evaluate((zero) => ({ ...zero, ...(globalThis as { __firestoreUsage?: object }).__firestoreUsage }), ZERO)
}

function difference(after: FirestoreUsage, before: FirestoreUsage): FirestoreUsage {
  return {
    reads: after.reads - before.reads,
    writes: after.writes - before.writes,
    deletes: after.deletes - before.deletes,
    ruleReads: after.ruleReads - before.ruleReads,
  }
}

async function measure(page: Page, step: () => Promise<void>): Promise<FirestoreUsage> {
  const before = await usage(page)
  await step()
  return difference(await usage(page), before)
}

async function startAndStopTimer(page: Page, description: string): Promise<void> {
  const timer = page.getByRole('region', { name: 'Timer' })
  await timer.getByRole('textbox', { name: 'What are you working on?' }).fill(description)
  await timer.getByRole('button', { name: 'Start' }).click()
  await expect(timer.getByRole('button', { name: 'Stop' })).toBeVisible()
  await page.waitForTimeout(SETTLE_MS)
  await timer.getByRole('button', { name: 'Stop' }).click()
  await expect(timer.getByRole('button', { name: 'Start' })).toBeVisible()
}

async function addManualEntry(page: Page, description: string): Promise<void> {
  await page.getByRole('button', { name: 'Add time' }).hover()
  await page.getByRole('menuitem', { name: 'Add manual entry' }).click()
  const editor = page.getByRole('dialog', { name: 'Add time entry' })
  await editor.getByLabel('Description').fill(description)
  await editor.getByLabel('Start').fill('06:00')
  await editor.getByLabel('End').fill('06:30')
  await editor.getByRole('button', { name: 'Add entry' }).click()
  await expect(page.getByText('Time entry added.')).toBeVisible()
}

async function openReports(page: Page): Promise<void> {
  await navigateTo(page, 'Reports')
  await expect(page.getByRole('button', { name: 'Export PDF' })).toBeEnabled()
}

async function openTimesheet(page: Page): Promise<void> {
  await navigateTo(page, 'Timesheet')
  await expect(page.getByRole('heading', { name: 'Timesheet', exact: true })).toBeVisible()
}

for (const role of ['member', 'manager'] as DemoAccountRole[]) {
  test(`a ${role}'s workday`, async ({ page }) => {
    const measured: Measurements = {}
    // The counter starts at zero on every page load.
    await signInAs(page, role)
    measured.signIn = await usage(page)

    await page.reload()
    await expect(page.getByRole('region', { name: 'Timer' })).toBeVisible()
    measured.openApp = await usage(page)

    measured.timer = await measure(page, () => startAndStopTimer(page, `Cost measurement ${role}`))
    measured.manualEntry = await measure(page, () => addManualEntry(page, `Cost manual ${role}`))
    measured.openReports = await measure(page, () => openReports(page))
    measured.backToTimesheet = await measure(page, () => openTimesheet(page))
    results[role] = measured
  })
}

test("a teammate's timer as seen by others with the Timesheet open", async ({ browser }) => {
  const observers = await Promise.all(
    (['manager', 'member'] as DemoAccountRole[]).map(async (role) => {
      const page = await (await browser.newContext()).newPage()
      await signInAs(page, role)
      return { role, page, before: await usage(page) }
    }),
  )
  // The owner does the work, so neither observer is the one starting the timer.
  const owner = await (await browser.newContext()).newPage()
  await signInAs(owner, 'owner')
  await startAndStopTimer(owner, 'Cost measurement teammate')

  for (const { role, page, before } of observers) {
    results[role].teammateTimer = difference(await usage(page), before)
  }

  const output = { measuredOn: new Date().toISOString().slice(0, 10), roles: results }
  await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`)
})
