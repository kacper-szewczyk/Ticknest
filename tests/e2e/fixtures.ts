import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { test as base, expect, type Page } from '@playwright/test'
import { DEMO_ACCOUNTS, type DemoAccountRole } from '../../functions/src/demo/accounts.ts'
import type { PaletteId } from '../../src/palettes.ts'

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

const PROJECT_ID = 'demo-ticknest'

function emulatorHost(variable: string, fallback: string): string {
  const host = process.env[variable] ?? fallback
  if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) throw new Error(`${variable} must be a local emulator.`)
  return host
}

/**
 * Saves `palette` on the demo account's profile, the same field the Appearance settings write. The app follows the
 * profile, so this is how a capture switches between the light and dark palettes. The emulators accept the
 * `Bearer owner` token as an admin, which bypasses the security rules.
 */
export async function setProfilePalette(role: DemoAccountRole, palette: PaletteId): Promise<void> {
  const authHost = emulatorHost('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099')
  const firestoreHost = emulatorHost('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080')
  const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }

  const lookup = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
    { method: 'POST', headers, body: JSON.stringify({ email: [demoAccount(role).email] }) },
  )
  const { users } = (await lookup.json()) as { users?: { localId: string }[] }
  const uid = users?.[0]?.localId
  if (!uid) throw new Error(`No ${role} demo account in the Auth emulator; did the seed run?`)

  const update = await fetch(
    `http://${firestoreHost}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=palette`,
    { method: 'PATCH', headers, body: JSON.stringify({ fields: { palette: { stringValue: palette } } }) },
  )
  if (!update.ok) throw new Error(`Could not set the ${role} palette: ${update.status} ${await update.text()}`)
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
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function navigateTo(page: Page, label: string): Promise<void> {
  const openNavigation = page.getByRole('button', { name: 'Open navigation' })
  if (await openNavigation.isVisible()) await openNavigation.click()
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    // The label, maybe followed by a badge ("Time-off approvals, 3 requests waiting"), but not by more letters:
    // "Budgets" must match neither "My budgets" nor a longer label that starts with it.
    .getByRole('button', { name: new RegExp(`^${escapeRegExp(label)}(?!\\p{L})`, 'u') })
    .click()
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
