import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { test as base, expect, type Page } from '@playwright/test'
import { DEMO_ACCOUNTS, type DemoAccountRole } from '../../functions/src/demo/accounts.ts'

const run = promisify(execFile)

/**
 * Wipes the Auth and Firestore emulators and seeds the demo data, the same as `npm run demo:seed`.
 * Call it from `test.beforeAll` in every spec file, so each file starts from the same data.
 */
export async function reseedEmulators(): Promise<void> {
  await run(process.execPath, ['functions/lib/demo/seed-emulators.js'], { env: process.env })
}

/** The first seeded demo account with `role`. */
export function demoAccount(role: DemoAccountRole) {
  const account = DEMO_ACCOUNTS.find((candidate) => candidate.role === role)
  if (!account) throw new Error(`No demo account with the ${role} role.`)
  return account
}

/** Signs in with a demo account button on the sign-in screen and waits for the workspace. */
export async function signInAs(page: Page, role: DemoAccountRole): Promise<void> {
  const account = demoAccount(role)
  await page.goto('/')
  await page
    .getByRole('listitem')
    .filter({ hasText: account.email })
    .getByRole('button', { name: 'Use this account' })
    .click()
  await expect(page.getByRole('region', { name: 'Timer' })).toBeVisible()
}

/** Opens a sidebar item, through the navigation drawer on small screens. */
export async function navigateTo(page: Page, label: string): Promise<void> {
  const openNavigation = page.getByRole('button', { name: 'Open navigation' })
  if (await openNavigation.isVisible()) await openNavigation.click()
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: label }).click()
}

/** Signs out from the sidebar footer, through the navigation drawer on small screens. */
export async function signOut(page: Page): Promise<void> {
  const openNavigation = page.getByRole('button', { name: 'Open navigation' })
  if (await openNavigation.isVisible()) await openNavigation.click()
  await page.getByRole('button', { name: 'Sign out' }).click()
}

type Fixtures = {
  /** Console errors and uncaught exceptions on the page, collected for the whole test. */
  consoleErrors: string[]
}

export const test = base.extend<Fixtures>({
  // Not named `use`, which the React hooks lint rule would mistake for React's `use` hook.
  consoleErrors: async ({ page }, provide) => {
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))
    await provide(errors)
  },
})

export { expect }
