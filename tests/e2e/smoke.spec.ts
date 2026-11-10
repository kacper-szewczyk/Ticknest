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
