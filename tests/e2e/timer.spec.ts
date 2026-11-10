import type { Page } from '@playwright/test'
import { expect, reseedEmulators, signInAs, test } from './fixtures'

test.beforeAll(reseedEmulators)

test.beforeEach(async ({ page }) => {
  await signInAs(page, 'member')
})

/** Expands every collapsed day in the Timesheet, so all of this week's entries are on screen. */
async function expandAllDays(page: Page): Promise<void> {
  const expandAll = page.getByRole('button', { name: 'Expand all' })
  const collapseAll = page.getByRole('button', { name: 'Collapse all' })
  // Wait for the week's entries to load: the toggle only appears once a day has entries.
  await expect(expandAll.or(collapseAll)).toBeVisible()
  if (await expandAll.isVisible()) await expandAll.click()
  await expect(collapseAll).toBeVisible()
}

async function startAndStopTimer(page: Page, description: string): Promise<void> {
  const timer = page.getByRole('region', { name: 'Timer' })
  await timer.getByRole('textbox', { name: 'What are you working on?' }).fill(description)
  await timer.getByRole('button', { name: 'Start' }).click()

  await expect(timer.getByRole('textbox', { name: 'Description of the running timer' })).toHaveValue(description)
  await timer.getByRole('button', { name: 'Stop' }).click()
  await expect(timer.getByRole('button', { name: 'Start' })).toBeVisible()
}

test('starting and stopping a timer adds the entry to the Timesheet', async ({ page }) => {
  const description = `E2E timer ${Date.now()}`

  await startAndStopTimer(page, description)
  await expandAllDays(page)

  await expect(page.getByText(description, { exact: true })).toBeVisible()
})

test('a timer without a description is saved as an untitled entry', async ({ page }) => {
  await startAndStopTimer(page, '')
  await expandAllDays(page)

  // Every seeded entry has a description, so this is the one just stopped.
  await expect(page.getByText('Untitled entry', { exact: true })).toHaveCount(1)
})
