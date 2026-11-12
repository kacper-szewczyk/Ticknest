import type { Page } from '@playwright/test'
import { expect, reseedEmulators, signInAs, test } from './fixtures'

test.beforeAll(reseedEmulators)

/** The Timesheet row of the entry with `description`: the description sits in a column of that row. */
function entryRow(page: Page, description: string) {
  return page.getByText(description, { exact: true }).locator('xpath=../..')
}

test('a member adds, edits, and deletes a manual entry in the Timesheet', async ({ page, consoleErrors }) => {
  const stamp = Date.now()
  const added = `E2E manual ${stamp}`
  const edited = `E2E manual edited ${stamp}`

  await signInAs(page, 'member')
  await expect(page.getByRole('heading', { name: 'Timesheet', exact: true })).toBeVisible()

  await test.step('add', async () => {
    await page.getByRole('button', { name: 'Add time' }).hover()
    await page.getByRole('menuitem', { name: 'Add manual entry' }).click()

    const editor = page.getByRole('dialog', { name: 'Add time entry' })
    await editor.getByLabel('Description').fill(added)
    await editor.getByLabel('Start').fill('06:00')
    await editor.getByLabel('End').fill('06:30')
    await editor.getByRole('button', { name: 'Add entry' }).click()

    await expect(editor).toHaveCount(0)
    await expect(page.getByText('Time entry added.')).toBeVisible()
    await expect(entryRow(page, added)).toContainText('00:30:00')
  })

  await test.step('edit', async () => {
    await entryRow(page, added).getByRole('button', { name: 'Edit', exact: true }).click()

    const editor = page.getByRole('dialog', { name: 'Edit time entry' })
    await expect(editor.getByLabel('Description')).toHaveValue(added)
    await editor.getByLabel('Description').fill(edited)
    await editor.getByLabel('End').fill('07:15')
    await editor.getByRole('button', { name: 'Save changes' }).click()

    await expect(editor).toHaveCount(0)
    await expect(page.getByText('Time entry updated.')).toBeVisible()
    await expect(page.getByText(added, { exact: true })).toHaveCount(0)
    await expect(entryRow(page, edited)).toContainText('01:15:00')
  })

  await test.step('delete', async () => {
    page.once('dialog', (dialog) => void dialog.accept())
    await entryRow(page, edited).getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(page.getByText('Time entry deleted.')).toBeVisible()
    await expect(page.getByText(edited, { exact: true })).toHaveCount(0)
  })

  expect(consoleErrors).toEqual([])
})
