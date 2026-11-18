// Keyboard-only smoke test: everything after signing in uses page.keyboard alone, no clicks or fills, to catch
// controls that cannot be reached or used without a mouse. See "Accessibility checks" in CONTRIBUTING.md.
import type { Locator, Page } from '@playwright/test'
import { expect, reseedEmulators, signInAs, test } from './fixtures'

test.beforeAll(reseedEmulators)

/** Presses Tab until `target` has focus, and fails if it is not reached within `maxPresses`. */
async function tabTo(page: Page, target: Locator, maxPresses = 60): Promise<void> {
  for (let press = 0; press < maxPresses; press += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  await expect(target, `Not reachable with Tab in ${maxPresses} presses`).toBeFocused()
}

/** The Timesheet row of the entry with `description`: the description sits in a column of that row. */
function entryRow(page: Page, description: string) {
  return page.getByText(description, { exact: true }).locator('xpath=../..')
}

test('a member starts and stops a timer and adds a manual entry with the keyboard only', async ({
  page,
  consoleErrors,
}) => {
  const stamp = Date.now()
  const timed = `E2E keyboard timer ${stamp}`
  const manual = `E2E keyboard manual ${stamp}`
  const timer = page.getByRole('region', { name: 'Timer' })

  await signInAs(page, 'member')
  // Start from the top of the page, as a keyboard user would after loading it.
  await page.reload()
  await expect(timer).toBeVisible()

  await test.step('start a timer', async () => {
    await tabTo(page, timer.getByRole('textbox', { name: 'What are you working on?' }))
    await page.keyboard.type(timed)
    await page.keyboard.press('Enter')
    await expect(timer.getByRole('textbox', { name: 'Description of the running timer' })).toHaveValue(timed)
  })

  await test.step('stop it', async () => {
    await tabTo(page, timer.getByRole('button', { name: 'Stop' }))
    await page.keyboard.press('Enter')
    await expect(timer.getByRole('button', { name: 'Start' })).toBeVisible()
  })

  await test.step('add a manual entry', async () => {
    // "Add time" is a speed dial: focusing it opens its actions, and the arrow keys move between them.
    await tabTo(page, page.getByRole('button', { name: 'Add time' }))
    const addManual = page.getByRole('menuitem', { name: 'Add manual entry' })
    await expect(addManual).toBeVisible()
    await page.keyboard.press('ArrowUp')
    await expect(addManual).toBeFocused()
    await page.keyboard.press('Enter')

    const editor = page.getByRole('dialog', { name: 'Add time entry' })
    await expect(editor).toBeVisible()
    await tabTo(page, editor.getByLabel('Description'), 10)
    await page.keyboard.type(manual)
    await tabTo(page, editor.getByLabel('Start'), 10)
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.type('06:00')
    await tabTo(page, editor.getByLabel('End'), 10)
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.type('06:30')
    await tabTo(page, editor.getByRole('button', { name: 'Add entry' }), 20)
    await page.keyboard.press('Enter')

    await expect(editor).toHaveCount(0)
    await expect(page.getByText('Time entry added.')).toBeVisible()
    await expect(entryRow(page, manual)).toContainText('00:30:00')
  })

  expect(consoleErrors).toEqual([])
})
