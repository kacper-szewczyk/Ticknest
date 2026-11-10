// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Catalog } from '../../src/lib/catalog'
import type { TimeEntry } from '../../src/lib/timeEntries'
import type { WorkspaceMember } from '../../src/lib/workspaces'
import { PALETTES } from '../../src/palettes'
import { ReportsPanel } from '../../src/ReportsPanel'
import { createAppTheme } from '../../src/theme'

const UID = 'KXvfP50TqhDXZDEQSM6ybgRecg6T'

function timestamp(value: string) {
  const date = new Date(value)
  return { toMillis: () => date.getTime(), toDate: () => new Date(date) } as TimeEntry['startAt']
}

const ENTRY: TimeEntry = {
  id: 'e1',
  userId: UID,
  description: 'Design review',
  clientName: 'Maple Health Clinic',
  projectName: null,
  taskName: null,
  billable: false,
  startAt: timestamp('2026-11-09T16:55:00Z'),
  endAt: timestamp('2026-11-09T17:55:00Z'),
}

const MEMBERS: WorkspaceMember[] = [
  { uid: UID, email: 'ada@example.com', displayName: 'Ada Lovelace', role: 'member', joinedAt: null },
]

vi.mock('../../src/lib/reports', () => ({
  IN_MEMORY_EXPORT_ROW_LIMIT: 20_000,
  loadReportSummary: async (
    _workspaceId: string,
    _canSeeAllEntries: boolean,
    _uid: string,
    _filters: unknown,
    onBatch: (entries: TimeEntry[]) => void,
  ) => onBatch([ENTRY]),
  loadReportPage: async () => ({ entries: [ENTRY], cursor: undefined }),
  streamReportCsv: vi.fn(),
}))

const renderReportPdf = vi.fn(async (_model: unknown) => new Blob(['%PDF-'], { type: 'application/pdf' }))
vi.mock('../../src/lib/renderReportPdf', () => ({ renderReportPdf }))

vi.mock('../../src/lib/workspaces', () => ({
  subscribeToWorkspaceMembers: (_workspaceId: string, onChange: (members: WorkspaceMember[]) => void) => {
    onChange(MEMBERS)
    return () => {}
  },
}))

function renderPanel(canSeeAllEntries: boolean, user: Partial<User>) {
  return render(
    <ThemeProvider theme={createAppTheme(PALETTES.forest)}>
      <ReportsPanel
        user={user as User}
        workspaceId="w1"
        workspaceName="Northwind Studio"
        canSeeAllEntries={canSeeAllEntries}
        catalog={{ clients: [], projects: [], tasks: [] } as unknown as Catalog}
      />
    </ThemeProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stubWideScreen() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))
}

describe('ReportsPanel user names', () => {
  it('shows managers and owners the member name instead of the user ID', async () => {
    renderPanel(true, { uid: 'manager', displayName: 'Manager' })
    const row = await screen.findByText(/Maple Health Clinic/)
    expect(row.textContent).toContain('Ada Lovelace')
    expect(document.body.textContent).not.toContain(UID)
  })

  it('hides the user segment on entry rows for regular members', async () => {
    renderPanel(false, { uid: UID, displayName: 'Ada Lovelace', email: 'ada@example.com' })
    const row = await screen.findByText(/Maple Health Clinic/)
    expect(row.textContent).not.toContain('Ada Lovelace')
    expect(row.textContent).toMatch(/ · Maple Health Clinic$/)
    expect(document.body.textContent).not.toContain(UID)
  })
})

describe('ReportsPanel wide layout', () => {
  it('shows detailed entries as a table with one column per field on large screens', async () => {
    stubWideScreen()
    renderPanel(true, { uid: 'manager', displayName: 'Manager' })
    const table = await screen.findByRole('table', { name: 'Detailed entries' })
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent)
    expect(headers).toEqual(['Description', 'Date & time', 'User', 'Client', 'Project', 'Task', 'Billable', 'Duration'])
    expect(within(table).getByRole('cell', { name: 'Maple Health Clinic' })).toBeTruthy()
    expect(within(table).getByRole('cell', { name: 'Ada Lovelace' })).toBeTruthy()
  })

  it('omits the user column for regular members', async () => {
    stubWideScreen()
    renderPanel(false, { uid: UID, displayName: 'Ada Lovelace', email: 'ada@example.com' })
    const table = await screen.findByRole('table', { name: 'Detailed entries' })
    expect(within(table).queryByRole('columnheader', { name: 'User' })).toBeNull()
  })
})

describe('ReportsPanel group-by tabs', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('shows the User tab to managers but not to regular members', async () => {
    renderPanel(true, { uid: 'manager', displayName: 'Manager' })
    expect((await screen.findAllByRole('tab')).map((tab) => tab.textContent)).toEqual([
      'Day',
      'Client',
      'Project',
      'Task',
      'User',
    ])
    cleanup()
    renderPanel(false, { uid: UID, displayName: 'Ada Lovelace', email: 'ada@example.com' })
    await screen.findByRole('tab', { name: 'Day' })
    expect(screen.queryByRole('tab', { name: 'User' })).toBeNull()
  })

  it('shows client swimlanes and keeps the tab in the URL', async () => {
    window.history.replaceState(null, '', '/#reports')
    renderPanel(true, { uid: 'manager', displayName: 'Manager' })
    fireEvent.click(await screen.findByRole('tab', { name: 'Client' }))
    expect(screen.getByRole('tab', { name: 'Client' }).getAttribute('aria-selected')).toBe('true')
    expect(window.location.hash).toBe('#reports?group=client')
    const lane = await screen.findByRole('region', { name: 'Maple Health Clinic' })
    expect(within(lane).getByText('No project')).toBeTruthy()
    const toggle = within(lane).getByRole('button', { name: 'Collapse Maple Health Clinic' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })

  it('restores the tab from the URL and ignores tabs the viewer may not use', async () => {
    window.history.replaceState(null, '', '/#reports?group=project')
    renderPanel(true, { uid: 'manager', displayName: 'Manager' })
    expect((await screen.findByRole('tab', { name: 'Project' })).getAttribute('aria-selected')).toBe('true')
    cleanup()
    window.history.replaceState(null, '', '/#reports?group=user')
    renderPanel(false, { uid: UID, displayName: 'Ada Lovelace', email: 'ada@example.com' })
    expect((await screen.findByRole('tab', { name: 'Day' })).getAttribute('aria-selected')).toBe('true')
  })
})

describe('ReportsPanel PDF export', () => {
  it('downloads the filtered report as a PDF named like the CSV', async () => {
    const createObjectURL = vi.fn(() => 'blob:report')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }))
    const downloads: string[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download)
    })
    renderPanel(true, { uid: 'manager', displayName: 'Manager' })
    const button = await screen.findByRole('button', { name: 'Export PDF' })
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(button)

    expect(await screen.findByText('Exported 1 entry to PDF.')).toBeTruthy()
    expect(downloads).toHaveLength(1)
    expect(downloads[0]).toMatch(/^ticknest-report-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.pdf$/)
    const model = renderReportPdf.mock.calls[0][0] as { title: string; entriesHead: string[]; entriesBody: string[][] }
    expect(model.title).toBe('Northwind Studio')
    expect(model.entriesHead).toContain('User')
    expect(model.entriesBody[0]).toContain('Ada Lovelace')
    expect(JSON.stringify(model)).not.toContain(UID)
    click.mockRestore()
  })
})
