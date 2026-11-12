import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import type { DemoAccountRole } from '../../functions/src/demo/accounts.ts'
import { expect, navigateTo, reseedEmulators, signInAs, test } from './fixtures'

test.beforeAll(reseedEmulators)

// A manager's PDF lists everyone's entries, a member's only their own; both must download.
const ROLES: DemoAccountRole[] = ['manager', 'member']

for (const role of ROLES) {
  test(`a ${role} exports the report as a PDF`, async ({ page, consoleErrors }) => {
    await signInAs(page, role)
    await navigateTo(page, 'Reports')
    await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible()

    // The button reads "Loading entries…" and stays disabled until the summary has every matching entry.
    const exportPdf = page.getByRole('button', { name: 'Export PDF' })
    await expect(exportPdf).toBeEnabled()

    const startDay = await page.getByLabel('From').inputValue()
    const endDay = await page.getByLabel('Through').inputValue()

    const downloadEvent = page.waitForEvent('download')
    await exportPdf.click()
    const download = await downloadEvent

    expect(download.suggestedFilename()).toBe(`ticknest-report-${startDay}-to-${endDay}.pdf`)
    const contents = await readFile(await download.path())
    expect(contents.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    await expect(page.getByText(/^Exported [\d,]+ entr(y|ies) to PDF\.$/)).toBeVisible()

    expect(consoleErrors).toEqual([])
  })
}

/** A calendar day (`YYYY-MM-DD`) in the demo accounts' time zone, `offset` days from today. */
function warsawDay(offset: number): string {
  const date = new Date(Date.now() + offset * 24 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(date)
}

/** The value of a stat tile above the summary, such as "Entries" or "Total tracked". */
function statValue(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator('xpath=following-sibling::*[1]')
}

test('a member filters the report by date range and exports it as CSV', async ({ page, consoleErrors }) => {
  // Chromium has the save-file picker, which Playwright cannot drive; without it the app downloads a Blob.
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })
  await signInAs(page, 'member')
  await navigateTo(page, 'Reports')
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible()

  await test.step('a range before the demo data has no entries', async () => {
    await page.getByLabel('From').fill('2001-01-01')
    await page.getByLabel('Through').fill('2001-01-31')
    await expect(statValue(page, 'Entries')).toHaveText('0')
    await expect(statValue(page, 'Total tracked')).toHaveText('00:00:00')
  })

  const startDay = warsawDay(-13)
  const endDay = warsawDay(0)

  await test.step('the last two weeks have entries and totals', async () => {
    await page.getByLabel('From').fill(startDay)
    await page.getByLabel('Through').fill(endDay)
    await expect(statValue(page, 'Entries')).toHaveText(/^[1-9]\d*$/)
    await expect(statValue(page, 'Total tracked')).not.toHaveText('00:00:00')
  })

  await test.step('Export CSV downloads the filtered range', async () => {
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export CSV' }).click()
    const download = await downloadEvent

    expect(download.suggestedFilename()).toBe(`ticknest-report-${startDay}-to-${endDay}.csv`)
    const [header, ...rows] = (await readFile(await download.path(), 'utf8')).replace(/^﻿/, '').split('\r\n')
    expect(header).toBe(
      'Date,User,Description,Client,Project,Task,Start (Europe/Warsaw),End (Europe/Warsaw),Duration,Billable',
    )
    expect(rows.filter(Boolean).length).toBeGreaterThan(0)
    await expect(page.getByText(/^Exported [\d,]+ entr(y|ies)\.$/)).toBeVisible()
  })

  expect(consoleErrors).toEqual([])
})
