import { expect, navigateTo, reseedEmulators, signInAs, test } from './fixtures'

test.beforeAll(reseedEmulators)

// A member's sidebar and a heading each view shows once it has loaded.
const NAV_ITEMS = [
  { label: 'Timesheet', heading: 'Timesheet' },
  { label: 'Dashboard', heading: 'Timesheet dashboard' },
  { label: 'Reports', heading: 'Reports' },
  { label: 'My budgets', heading: 'My budgets' },
  { label: 'Settings', heading: 'Color palette' },
]

test('every navigation item renders without console errors @mobile', async ({ page, consoleErrors }) => {
  await signInAs(page, 'member')

  for (const item of NAV_ITEMS) {
    await test.step(item.label, async () => {
      await navigateTo(page, item.label)
      await expect(page.getByRole('heading', { name: item.heading, exact: true })).toBeVisible()
    })
  }

  expect(consoleErrors).toEqual([])
})

test('each view leads with one focused h1 and has its own title @mobile', async ({ page }) => {
  await signInAs(page, 'member')

  for (const item of NAV_ITEMS) {
    await test.step(item.label, async () => {
      await navigateTo(page, item.label)
      const main = page.getByRole('main')
      const h1 = main.locator('h1')
      await expect(h1).toHaveCount(1)
      await expect(h1).toBeFocused()
      // The h1 is the first heading in <main>.
      await expect(main.getByRole('heading').first()).toHaveJSProperty('tagName', 'H1')
      await expect(page).toHaveTitle(new RegExp(`^${item.label} · .+ · Ticknest$`))
    })
  }
})

test('the skip link is the first tab stop and moves focus into main', async ({ page }) => {
  await signInAs(page, 'member')
  await page.reload()
  await expect(page.getByRole('region', { name: 'Timer' })).toBeVisible()

  await page.keyboard.press('Tab')
  const skipLink = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skipLink).toBeFocused()
  await expect(skipLink).toBeInViewport()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
})
