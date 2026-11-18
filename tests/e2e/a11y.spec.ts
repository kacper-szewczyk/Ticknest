// Automated accessibility scan: runs axe (WCAG 2.2 A and AA) on every main view, dialog and drawer, in a light and
// a dark palette. Known, tracked violations are listed in ./axe.ts. See "Accessibility checks" in CONTRIBUTING.md.
import type { Page } from '@playwright/test'
import type { PaletteId } from '../../src/palettes.ts'
import { expectNoAxeViolations } from './axe'
import { escapeRegExp, expect, navigateTo, reseedEmulators, setProfilePalette, signInAs, test } from './fixtures'

// Contrast differs per palette, so scan one light and one dark one. The unit contrast tests cover the others.
const PALETTES: PaletteId[] = ['forest', 'forest-night']

// Every view the owner can open; the owner sees all of them, including the team and admin views.
const OWNER_VIEWS = [
  'Timesheet',
  'Team dashboard',
  'Reports',
  'My budgets',
  'Budget progress',
  'Budgets',
  'Time off',
  'Time-off approvals',
  'Team time off',
  'Clients & projects',
  'Members',
  'Settings',
]

test.beforeAll(reseedEmulators)

// Each scan takes a second or two, and some tests run a dozen of them.
test.describe.configure({ timeout: 120_000 })

/**
 * Waits until the view is open (its title starts with the nav label) and nothing is still loading. Pass no label
 * while a timer runs: the title then shows the elapsed time instead.
 */
async function waitForView(page: Page, label?: string): Promise<void> {
  if (label) await expect(page).toHaveTitle(new RegExp(`^${escapeRegExp(label)} · `))
  await expect(page.getByRole('main').locator('h1')).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveCount(0)
}

test('the sign-in and sign-up screens', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Use this account' }).first()).toBeVisible()
  await expectNoAxeViolations(page, 'sign-in screen')

  await page.getByRole('button', { name: 'Create an account' }).click()
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
  await expectNoAxeViolations(page, 'sign-up screen')
})

test('the onboarding screen and the setup wizard', async ({ page }) => {
  // A new account has no workspace, so it lands on onboarding; creating one opens the setup wizard.
  await page.goto('/')
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Full name').fill('Axe Tester')
  await page.getByLabel('Email address').fill(`axe-${Date.now()}@example.test`)
  await page.getByLabel('Password').fill(`e2e-${Date.now()}`)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByRole('heading', { name: 'Create a workspace' })).toBeVisible()
  await expectNoAxeViolations(page, 'onboarding screen')

  await page.getByLabel('Workspace name').fill('Axe Studio')
  await page.getByRole('button', { name: 'Create workspace' }).click()
  await expect(page.getByRole('main').locator('h1')).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expectNoAxeViolations(page, 'setup wizard')
})

for (const palette of PALETTES) {
  test.describe(`in the ${palette} palette`, () => {
    test.beforeEach(async ({ page }) => {
      await setProfilePalette('owner', palette)
      await signInAs(page, 'owner')
    })

    test('every main view', async ({ page }) => {
      for (const view of OWNER_VIEWS) {
        await test.step(view, async () => {
          await navigateTo(page, view)
          await waitForView(page, view)
          // Refresh is disabled while budgets load; scanning mid-transition would catch its faded colour.
          if (view === 'Budget progress') await expect(page.getByRole('button', { name: 'Refresh' })).toBeEnabled()
          await expectNoAxeViolations(page, `${view} (${palette})`)
        })
      }
    })

    test('the Timesheet with a running timer', async ({ page }) => {
      const timer = page.getByRole('region', { name: 'Timer' })
      await timer.getByRole('textbox', { name: 'What are you working on?' }).fill('Axe scan')
      await timer.getByRole('button', { name: 'Start' }).click()
      await expect(timer.getByRole('button', { name: 'Stop' })).toBeVisible()
      await waitForView(page)
      await expectNoAxeViolations(page, `Timesheet with a running timer (${palette})`)

      await timer.getByRole('button', { name: 'Stop' }).click()
      await expect(timer.getByRole('button', { name: 'Start' })).toBeVisible()
    })

    test('the dialogs and drawers', async ({ page }) => {
      await test.step('entry editor', async () => {
        await page.getByRole('button', { name: 'Add time' }).hover()
        await page.getByRole('menuitem', { name: 'Add manual entry' }).click()
        const editor = page.getByRole('dialog', { name: 'Add time entry' })
        await expect(editor).toBeVisible()
        await expectNoAxeViolations(page, `entry editor (${palette})`)
        await page.keyboard.press('Escape')
        await expect(editor).toHaveCount(0)
      })

      await test.step('catalog editor', async () => {
        await navigateTo(page, 'Clients & projects')
        await waitForView(page, 'Clients & projects')
        await page.getByRole('button', { name: /^Add / }).click()
        await expect(page.getByRole('heading', { name: /^New / })).toBeVisible()
        await expectNoAxeViolations(page, `catalog editor (${palette})`)
        await page.keyboard.press('Escape')
        await expect(page.getByRole('heading', { name: /^New / })).toHaveCount(0)
      })

      await test.step('budget editor', async () => {
        await navigateTo(page, 'Budgets')
        await waitForView(page, 'Budgets')
        await page.getByRole('button', { name: 'New budget' }).click()
        await expect(page.getByRole('heading', { name: 'New budget' })).toBeVisible()
        await expectNoAxeViolations(page, `budget editor (${palette})`)
        await page.keyboard.press('Escape')
        await expect(page.getByRole('heading', { name: 'New budget' })).toHaveCount(0)
      })

      await test.step('leave request', async () => {
        await navigateTo(page, 'Time off')
        await waitForView(page, 'Time off')
        await page.getByRole('button', { name: 'Request time off' }).click()
        const dialog = page.getByRole('dialog', { name: 'Request time off' })
        await expect(dialog).toBeVisible()
        await expectNoAxeViolations(page, `leave request (${palette})`)
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
      })
    })
  })
}

test('the small-screen layout and navigation drawer @mobile', async ({ page }) => {
  await signInAs(page, 'member')
  await waitForView(page, 'Timesheet')
  await expectNoAxeViolations(page, 'Timesheet')

  const openNavigation = page.getByRole('button', { name: 'Open navigation' })
  // The drawer exists only on small screens; on desktop this test checks the Timesheet alone.
  if (await openNavigation.isVisible()) {
    await openNavigation.click()
    await expect(page.getByRole('dialog', { name: 'Main navigation' })).toBeVisible()
    await expectNoAxeViolations(page, 'navigation drawer')
  }
})
