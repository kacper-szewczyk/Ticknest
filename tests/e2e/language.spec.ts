import { demoAccount, expect, reseedEmulators, test } from './fixtures'

test.beforeAll(reseedEmulators)

test('a visitor switches the sign-in screen to Spanish, and it stays Spanish after a reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()

  await page.getByLabel('Language').selectOption('es')

  await expect(page.getByRole('heading', { name: 'Hola de nuevo' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')

  await page.reload()

  await expect(page.getByRole('heading', { name: 'Hola de nuevo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible()
})

test.describe('with a browser that prefers Polish', () => {
  test.use({ locale: 'pl-PL' })

  test('the sign-in screen starts in Polish', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Witaj ponownie' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
  })
})

test('a language chosen in Settings follows the user to another device', async ({ page, browser }) => {
  const account = demoAccount('member')
  await page.goto('/')
  await page
    .getByRole('listitem')
    .filter({ hasText: account.email })
    .getByRole('button', { name: 'Use this account' })
    .click()
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Settings' }).click()

  await page.getByRole('region', { name: 'Interface language' }).getByLabel('Language').selectOption('pl')

  await expect(page.getByText('Język zapisany.', { exact: false })).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('button', { name: 'Ustawienia' }),
  ).toBeVisible()

  // A fresh browser context has no cached language, so Polish can only come from the profile.
  const otherDevice = await browser.newContext({ locale: 'en-GB', timezoneId: 'Europe/Warsaw' })
  const otherPage = await otherDevice.newPage()
  await otherPage.goto('/')
  await otherPage
    .getByRole('listitem')
    .filter({ hasText: account.email })
    .getByRole('button', { name: 'Use this account' })
    .click()

  await expect(
    otherPage.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('button', { name: 'Karta czasu' }),
  ).toBeVisible()
  await otherDevice.close()
})
