import { demoAccount, expect, navigateTo, reseedEmulators, signInAs, test } from './fixtures'

test.beforeAll(reseedEmulators)

const HEADER =
  'Project,Client,Description,Task,User,Group,Email,Tags,Billable,Start Date,Start Time,End Date,End Time,Duration (h),Duration (decimal)'

/** A small Clockify Detailed report: two members, someone outside the workspace, and a row with a bad date. */
function clockifyCsv(stamp: number): string {
  const owner = demoAccount('owner')
  const member = demoAccount('member')
  return [
    HEADER,
    `Imported ${stamp},Clockify Co,Kick-off,Planning,${owner.displayName},,${owner.email},,Yes,14/01/2020,09:00:00,14/01/2020,10:30:00,01:30:00,1.50`,
    `Imported ${stamp},Clockify Co,Build,,${member.displayName},,${member.email},,No,14/01/2020,13:00:00,14/01/2020,15:00:00,02:00:00,2.00`,
    `Imported ${stamp},Clockify Co,Review,,Someone Else,,someone@example.com,,No,15/01/2020,09:00:00,15/01/2020,10:00:00,01:00:00,1.00`,
    `Imported ${stamp},Clockify Co,Broken,,${member.displayName},,${member.email},,No,31/02/2020,09:00:00,31/02/2020,10:00:00,01:00:00,1.00`,
  ].join('\n')
}

test('an owner previews and imports a Clockify export, and re-importing it adds nothing', async ({
  page,
  consoleErrors,
}) => {
  const stamp = Date.now()
  const file = { name: 'clockify.csv', mimeType: 'text/csv', buffer: Buffer.from(clockifyCsv(stamp)) }

  await signInAs(page, 'owner')
  await navigateTo(page, 'Settings')
  const panel = page.getByRole('region', { name: 'Import from Clockify' })

  await test.step('preview', async () => {
    await panel.locator('input[type="file"]').setInputFiles(file)
    await expect(panel.getByText('Detected from the file.')).toBeVisible()
    // The row with an impossible date is reported as a problem, not counted for Alice.
    await expect(panel.getByText(`${demoAccount('member').email} → Alice Moreau (1 entry)`)).toBeVisible()
    await expect(panel.getByText('someone@example.com: not a member of this workspace (1 entry)')).toBeVisible()
    await expect(panel.getByText('1 new client')).toBeVisible()
    await expect(panel.getByText('2 entries ready to import, 03:30:00 in total.')).toBeVisible()
    await expect(panel.getByText('Line 4: the person isn’t a member of this workspace.')).toBeVisible()
    await expect(panel.getByText('Line 5: the date can’t be read in the chosen date format.')).toBeVisible()
  })

  await test.step('assign non-members to me', async () => {
    await panel.getByRole('radio', { name: 'Import them as my entries' }).check()
    await expect(panel.getByText('3 entries ready to import, 04:30:00 in total.')).toBeVisible()
  })

  await test.step('import', async () => {
    await panel.getByRole('button', { name: 'Import 3 entries' }).click()
    await expect(panel.getByText('Import finished')).toBeVisible()
    await expect(panel.getByText('3 entries imported, 04:30:00 in total.')).toBeVisible()
    await expect(panel.getByText('Created: 1 clients, 1 projects, 1 tasks.')).toBeVisible()
  })

  await test.step('re-import skips everything', async () => {
    await panel.getByRole('button', { name: 'Import another file' }).click()
    await panel.locator('input[type="file"]').setInputFiles(file)
    await panel.getByRole('radio', { name: 'Import them as my entries' }).check()
    await panel.getByRole('button', { name: 'Import 3 entries' }).click()
    await expect(panel.getByText('0 entries imported, 00:00:00 in total.')).toBeVisible()
    await expect(panel.getByText('Line 2: it overlaps an entry already in Ticknest.')).toBeVisible()
  })

  expect(consoleErrors).toEqual([])
})

test('members do not see the import', async ({ page, consoleErrors }) => {
  await signInAs(page, 'member')
  await navigateTo(page, 'Settings')
  await expect(page.getByRole('heading', { name: 'Name and week start' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Import from Clockify' })).toHaveCount(0)
  expect(consoleErrors).toEqual([])
})
