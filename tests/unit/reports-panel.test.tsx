// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Catalog } from '../../src/lib/catalog'
import type { TimeEntry } from '../../src/lib/timeEntries'
import type { WorkspaceMember } from '../../src/lib/workspaces'
import { PALETTES } from '../../src/palettes'
import { streamReportCsv } from '../../src/lib/reports'
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

describe('ReportsPanel export', () => {
  function precedes(first: Node, second: Node): boolean {
    return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
  }

  it('shows Export CSV in the page header, above the filters and the report', async () => {
    renderPanel(true, { uid: 'manager', displayName: 'Manager' })
    const button = screen.getByRole('button', { name: 'Export CSV' })
    const heading = screen.getByRole('heading', { name: 'Reports' })
    expect(heading.closest('div')?.parentElement?.contains(button)).toBe(true)
    expect(precedes(button, screen.getByLabelText('From'))).toBe(true)
    expect(precedes(button, await screen.findByRole('heading', { name: 'Detailed entries' }))).toBe(true)
    expect(screen.getByText(/^Dates in /)).toBeTruthy()
  })

  it('shows progress while exporting and the notice next to the button when done', async () => {
    const events = userEvent.setup()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:report', revokeObjectURL: () => {} }))
    let finish: (rows: number) => void = () => {}
    vi.mocked(streamReportCsv).mockImplementation(async (...args) => {
      const onProgress = args.at(-1) as (rows: number) => void
      onProgress(5)
      return new Promise<number>((resolve) => {
        finish = resolve
      })
    })
    renderPanel(true, { uid: 'manager', displayName: 'Manager' })
    await events.click(screen.getByRole('button', { name: 'Export CSV' }))
    const progress = await screen.findByRole('button', { name: 'Exporting… 5' })
    expect(progress.hasAttribute('disabled')).toBe(true)

    finish(3)
    const notice = await screen.findByRole('status')
    expect(notice.textContent).toBe('Exported 3 entries.')
    expect(precedes(notice, screen.getByLabelText('From'))).toBe(true)
    expect(screen.getByRole('button', { name: 'Export CSV' }).hasAttribute('disabled')).toBe(false)
  })

  it('disables Export CSV when the date range is invalid', () => {
    renderPanel(true, { uid: 'manager', displayName: 'Manager' })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-12-31' } })
    fireEvent.change(screen.getByLabelText('Through'), { target: { value: '2026-01-01' } })
    expect(screen.getByRole('button', { name: 'Export CSV' }).hasAttribute('disabled')).toBe(true)
  })
})
