import type { Page } from '@playwright/test'
import type { DemoAccountRole } from '../../functions/src/demo/accounts.ts'
import { expect, navigateTo, reseedEmulators, signInAs, test } from './fixtures'

test.beforeAll(reseedEmulators)

const EVERYONE = ['Timesheet', 'Reports', 'My budgets', 'Settings']
const MANAGERS = ['Budget progress', 'Budgets']
const OWNERS = ['Clients & projects', 'Members']

const ROLES: { role: DemoAccountRole; dashboard: string; nav: string[]; seesTeam: boolean }[] = [
  { role: 'member', dashboard: 'Dashboard', nav: EVERYONE, seesTeam: false },
  { role: 'manager', dashboard: 'Team dashboard', nav: [...EVERYONE, ...MANAGERS], seesTeam: true },
  { role: 'owner', dashboard: 'Team dashboard', nav: [...EVERYONE, ...MANAGERS, ...OWNERS], seesTeam: true },
]

const ALL_NAV = ['Dashboard', 'Team dashboard', ...EVERYONE, ...MANAGERS, ...OWNERS]

async function expectNavItems(page: Page, labels: string[]): Promise<void> {
  const openNavigation = page.getByRole('button', { name: 'Open navigation' })
  if (await openNavigation.isVisible()) await openNavigation.click()
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  for (const label of ALL_NAV) {
    await expect(nav.getByRole('button', { name: label, exact: true })).toHaveCount(labels.includes(label) ? 1 : 0)
  }
}

for (const { role, dashboard, nav, seesTeam } of ROLES) {
  test(`${role === 'owner' ? 'an' : 'a'} ${role} sees ${seesTeam ? 'the team views' : 'only their own data'}`, async ({
    page,
    consoleErrors,
  }) => {
    await signInAs(page, role)

    await test.step('sidebar', async () => {
      await expectNavItems(page, [dashboard, ...nav])
    })

    await test.step('dashboard', async () => {
      await navigateTo(page, dashboard)
      await expect(page.getByRole('heading', { name: 'Timesheet dashboard', exact: true })).toBeVisible()
      const teamTable = page.getByRole('columnheader', { name: 'Member', exact: true })
      if (seesTeam) {
        await expect(teamTable).toBeVisible()
        await expect(page.getByRole('searchbox', { name: 'Search members' })).toBeVisible()
      } else {
        await expect(page.getByText('YOUR TIMESHEET', { exact: true })).toBeVisible()
        await expect(teamTable).toHaveCount(0)
        await expect(page.getByRole('searchbox', { name: 'Search members' })).toHaveCount(0)
      }
    })

    await test.step('reports', async () => {
      await navigateTo(page, 'Reports')
      await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible()
      await expect(page.getByLabel('Client')).toBeVisible()
      await expect(page.getByLabel('Member', { exact: true })).toHaveCount(seesTeam ? 1 : 0)
    })

    expect(consoleErrors).toEqual([])
  })
}
