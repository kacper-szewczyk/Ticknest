import type { Page } from '@playwright/test'
import { demoAccount, expect, navigateTo, reseedEmulators, signInAs, signOut, test } from './fixtures'

test.beforeAll(reseedEmulators)

function dayString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Monday to Wednesday of a week in the current year, all in one month so the team calendar shows all three days:
 * two weeks ahead (one week ahead when those days would straddle a month boundary), or earlier in the year near
 * New Year.
 */
function leaveWeek(): { start: string; end: string; year: number } {
  const now = new Date()
  const year = now.getUTCFullYear()
  const monday = new Date(Date.UTC(year, now.getUTCMonth(), now.getUTCDate()))
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) + 14)
  const wednesdayOf = (day: Date) => new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 2))
  if (wednesdayOf(monday).getUTCMonth() !== monday.getUTCMonth()) monday.setUTCDate(monday.getUTCDate() - 7)
  if (monday.getUTCFullYear() !== year || monday.getUTCMonth() === 11) monday.setUTCDate(monday.getUTCDate() - 42)
  return { start: dayString(monday), end: dayString(wednesdayOf(monday)), year }
}

async function switchAccount(page: Page): Promise<void> {
  await signOut(page)
  await expect(page.getByRole('button', { name: 'Use this account' }).first()).toBeVisible()
}

function holidayBalance(page: Page, year: number) {
  return page
    .getByRole('list', { name: `Balances for ${year}` })
    .getByRole('listitem')
    .filter({ hasText: 'Holiday' })
}

function formatDays(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

/** Available and taken holiday days, read from the balance card once it has loaded. */
async function readHolidayBalance(page: Page, year: number): Promise<{ available: number; taken: number }> {
  const balance = holidayBalance(page, year)
  await expect(balance).toContainText('taken')
  const text = (await balance.textContent()) ?? ''
  const available = /Holiday([\d.]+) days?available/.exec(text)
  const taken = /([\d.]+) days? taken/.exec(text)
  if (!available || !taken) throw new Error(`Could not read the holiday balance: ${text}`)
  return { available: Number(available[1]), taken: Number(taken[1]) }
}

test('a member requests holiday, a manager approves it, and the balance goes down', async ({ page, consoleErrors }) => {
  const { start, end, year } = leaveWeek()
  const member = demoAccount('member')
  // The demo seed gives the member some leave already, so compare against what the balance starts at.
  let before = { available: 0, taken: 0 }

  await test.step('member sends a request', async () => {
    await signInAs(page, 'member')
    await navigateTo(page, 'Time off')
    before = await readHolidayBalance(page, year)
    await page.getByRole('button', { name: 'Request time off' }).click()
    const dialog = page.getByRole('dialog', { name: 'Request time off' })
    await dialog.getByLabel('Leave type').selectOption({ label: 'Holiday' })
    await dialog.getByRole('textbox', { name: 'First day' }).fill(start)
    await dialog.getByRole('textbox', { name: 'Last day' }).fill(end)
    await expect(dialog.getByText(`Uses 3 days. Balance after: ${formatDays(before.available - 3)}.`)).toBeVisible()
    await dialog.getByRole('button', { name: 'Send request' }).click()
    await expect(page.getByText('Request sent. It is pending approval.')).toBeVisible()
    await expect(holidayBalance(page, year)).toContainText('3 days pending')
    await switchAccount(page)
  })

  await test.step('manager sees it on the team calendar and approves it', async () => {
    await signInAs(page, 'manager')
    await navigateTo(page, 'Team time off')
    await expect(page.getByRole('heading', { name: 'Team time off' })).toBeVisible()
    // Other seeded members have pending requests too.
    const toApprove = page.getByRole('button', { name: /^\d+ requests? to approve$/ })
    await expect(toApprove).toBeVisible()

    // The calendar opens on the current month; step forward to the leave's month.
    const leaveMonth = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${start}T00:00:00Z`),
    )
    const table = page.getByRole('table', { name: `Time off in ${leaveMonth}` })
    await expect(page.getByRole('table', { name: /^Time off in / })).toBeVisible()
    for (let step = 0; step < 2 && !(await table.isVisible()); step += 1) {
      await page.getByRole('button', { name: 'Next month' }).click()
    }
    // The week can run into the next month, so count only its days in the month shown.
    const daysInMonth = [0, 1, 2].filter(
      (offset) =>
        new Date(Date.parse(`${start}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 7) ===
        start.slice(0, 7),
    ).length
    await expect(
      table.getByRole('img', { name: new RegExp(`^${member.displayName}, .*Holiday, Pending`) }),
    ).toHaveCount(daysInMonth)

    await toApprove.click()
    const row = page.getByRole('article').filter({ hasText: member.displayName }).filter({ hasText: 'Pending' })
    await row.getByRole('button', { name: 'Approve' }).click()
    const dialog = page.getByRole('dialog', { name: 'Approve time off' })
    await dialog.getByLabel('Comment (optional)').fill('Enjoy!')
    await dialog.getByRole('button', { name: 'Approve' }).click()
    await expect(page.getByText(`Approved the request from ${member.displayName}.`)).toBeVisible()
    await switchAccount(page)
  })

  await test.step('member sees the approved leave and the lower balance', async () => {
    await signInAs(page, 'member')
    await navigateTo(page, 'Time off')
    await expect(holidayBalance(page, year)).toContainText(`${formatDays(before.available - 3)}available`)
    await expect(holidayBalance(page, year)).toContainText(`${formatDays(before.taken + 3)} taken`)
    await expect(page.getByText('Comment: Enjoy!')).toBeVisible()
  })

  expect(consoleErrors).toEqual([])
})
