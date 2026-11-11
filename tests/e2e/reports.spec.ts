import { readFile } from 'node:fs/promises'
import type { DemoAccountRole } from '../../functions/src/demo/accounts.ts'
import { expect, navigateTo, reseedEmulators, signInAs, test } from './fixtures'

test.beforeAll(reseedEmulators)

// A manager's PDF lists everyone's entries, a member's only their own; both must download.
const ROLES: DemoAccountRole[] = ['manager', 'member']

for (const role of ROLES) {
  test(`a ${role} exports the report as a PDF`, async ({ page, consoleErrors }) => {
    await signInAs(page, role)
    await navigateTo(page, 'Reports')
    await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible()

    // The button reads "Loading entries…" and stays disabled until the summary has every matching entry.
    const exportPdf = page.getByRole('button', { name: 'Export PDF' })
    await expect(exportPdf).toBeEnabled()

    const startDay = await page.getByLabel('From').inputValue()
    const endDay = await page.getByLabel('Through').inputValue()

    const downloadEvent = page.waitForEvent('download')
    await exportPdf.click()
    const download = await downloadEvent

    expect(download.suggestedFilename()).toBe(`ticknest-report-${startDay}-to-${endDay}.pdf`)
    const contents = await readFile(await download.path())
    expect(contents.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    await expect(page.getByText(/^Exported [\d,]+ entr(y|ies) to PDF\.$/)).toBeVisible()

    expect(consoleErrors).toEqual([])
  })
}
