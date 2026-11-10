import { demoAccount, expect, reseedEmulators, signInAs, signOut, test } from './fixtures'

test.beforeAll(reseedEmulators)

test('a demo member signs in, sees the workspace, and signs out @mobile', async ({ page }) => {
  await signInAs(page, 'member')

  await expect(page.getByRole('heading', { name: 'Timesheet', exact: true })).toBeVisible()
  await expect(page.getByText(demoAccount('member').email)).toBeAttached()

  await signOut(page)

  await expect(page.getByRole('button', { name: 'Use this account' }).first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'Timer' })).toHaveCount(0)
})
