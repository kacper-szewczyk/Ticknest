// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { changeAppLanguage } from '../../src/i18n'
import type { Catalog } from '../../src/lib/catalog'
import type { TimeEntry } from '../../src/lib/timeEntries'
import type { WorkspaceMember } from '../../src/lib/workspaces'
import { PALETTES } from '../../src/palettes'
import { loadReportSummary, streamReportCsv } from '../../src/lib/reports'
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

const OTHER_ENTRY: TimeEntry = {
  ...ENTRY,
  id: 'e2',
  userId: 'grace',
  description: 'Invoice prep',
  clientName: 'Acme Corp',
  projectName: 'Website',
  taskName: 'Billing',
  startAt: timestamp('2026-11-08T09:00:00Z'),
  endAt: timestamp('2026-11-08T10:00:00Z'),
}

// The entries every report load returns; tests that need more than ENTRY replace it.
let reportEntries: TimeEntry[] = [ENTRY]

vi.mock('../../src/lib/reports', () => ({
  IN_MEMORY_EXPORT_ROW_LIMIT: 20_000,
  loadReportSummary: vi.fn(
    async (
      _workspaceId: string,
      _canSeeAllEntries: boolean,
      _uid: string,
      _filters: unknown,
      onBatch: (entries: TimeEntry[]) => void,
    ) => onBatch(reportEntries),
  ),
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
  reportEntries = [ENTRY]
  vi.mocked(loadReportSummary).mockClear()
})

/** Detailed entries start collapsed; open them once the summary has counted the entries. */
async function openEntries() {
  fireEvent.click(await screen.findByRole('button', { name: /^Show \d+ entr/ }))
}

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
    await openEntries()
    const row = await screen.findByText(/Maple Health Clinic/)
    expect(row.textContent).toContain('Ada Lovelace')
    expect(document.body.textContent).not.toContain(UID)
  })

  it('hides the user segment on entry rows for regular members', async () => {
    renderPanel(false, { uid: UID, displayName: 'Ada Lovelace', email: 'ada@example.com' })
    await openEntries()
    const row = await screen.findByText(/Maple Health Clinic/)
    expect(row.textContent).not.toContain('Ada Lovelace')
    expect(row.textContent).toMatch(/ · Maple Health Clinic$/)
    expect(document.body.textContent).not.toContain(UID)
  })
})

describe('ReportsPanel detailed entries on demand', () => {
  it('starts collapsed with the entry count and loads nothing beyond the summary', async () => {
    reportEntries = [ENTRY, OTHER_ENTRY]
    renderPanel(true, { uid: 'manager', displayName: 'Manager' })
    const toggle = await screen.findByRole('button', { name: 'Show 2 entries' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText(/Maple Health Clinic/)).toBeNull()
    expect(screen.queryByLabelText('Search entries')).toBeNull()
    expect(vi.mocked(loadReportSummary)).toHaveBeenCalledTimes(1)

    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Hide entries' }).getAttribute('aria-expanded')).toBe('true')
    expect(await screen.findByText(/Maple Health Clinic/)).toBeTruthy()
    expect(screen.getByText(/Acme Corp/)).toBeTruthy()
    // Opening reuses the summary's entries rather than querying again.
    expect(vi.mocked(loadReportSummary)).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Hide entries' }))
    expect(screen.queryByText(/Maple Health Clinic/)).toBeNull()
  })

  it('stays open when the filters change', async () => {
    renderPanel(true, { uid: 'manager', displayName: 'Manager' })
    await openEntries()
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } })
    expect(await screen.findByRole('button', { name: 'Hide entries' })).toBeTruthy()
    expect(await screen.findByText(/Maple Health Clinic/)).toBeTruthy()
  })

  it('searches description, client, project, task and user name, with an empty state', async () => {
    reportEntries = [ENTRY, OTHER_ENTRY]
    renderPanel(true, { uid: 'manager', displayName: 'Manager' })
    await openEntries()
    const search = screen.getByLabelText('Search entries')

    fireEvent.change(search, { target: { value: 'acme billing' } })
    expect(await screen.findByText('1 of 2 entries · newest first')).toBeTruthy()
    expect(screen.getByText(/Acme Corp/)).toBeTruthy()
    expect(screen.queryByText(/Maple Health Clinic/)).toBeNull()

    fireEvent.change(search, { target: { value: 'lovelace' } })
    expect(await screen.findByText(/Maple Health Clinic/)).toBeTruthy()
    expect(screen.queryByText(/Acme Corp/)).toBeNull()

    fireEvent.change(search, { target: { value: 'xyz' } })
    expect(await screen.findByText('No entries match “xyz”.')).toBeTruthy()
  })

  it('does not search by user name for regular members', async () => {
    renderPanel(false, { uid: UID, displayName: 'Ada Lovelace', email: 'ada@example.com' })
    await openEntries()
    fireEvent.change(screen.getByLabelText('Search entries'), { target: { value: 'lovelace' } })
    expect(await screen.findByText('No entries match “lovelace”.')).toBeTruthy()
  })

  it('shows 25 entries at a time', async () => {
    reportEntries = Array.from({ length: 30 }, (_, index) => ({
      ...ENTRY,
      id: `e${index}`,
      description: `Entry ${index}`,
    }))
    renderPanel(false, { uid: UID, displayName: 'Ada Lovelace', email: 'ada@example.com' })
    await openEntries()
    expect(await screen.findByText('Entry 24')).toBeTruthy()
    expect(screen.queryByText('Entry 25')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show more entries' }))
    expect(screen.getByText('Entry 29')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show more entries' })).toBeNull()
  })
})

describe('ReportsPanel wide layout', () => {
  it('shows detailed entries as a table with one column per field on large screens', async () => {
    stubWideScreen()
    renderPanel(true, { uid: 'manager', displayName: 'Manager' })
    await openEntries()
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
    await openEntries()
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
    expect(
      heading
        .closest('div')
        ?.parentElement?.contains(await screen.findByRole('button', { name: /PDF|Loading entries/ })),
    ).toBe(true)
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

  it('names the CSV file type in the save dialog in the interface language', async () => {
    const events = userEvent.setup()
    const write = vi.fn(async () => {})
    const close = vi.fn(async () => {})
    const showSaveFilePicker = vi.fn(async (_options: { types: { description: string }[] }) => ({
      createWritable: async () => ({ write, close, abort: async () => {} }),
    }))
    vi.stubGlobal('showSaveFilePicker', showSaveFilePicker)
    vi.mocked(streamReportCsv).mockResolvedValue(1)
    await changeAppLanguage('pl')
    try {
      renderPanel(true, { uid: 'manager', displayName: 'Manager' })
      await events.click(screen.getByRole('button', { name: 'Export CSV' }))
      await waitFor(() => expect(showSaveFilePicker).toHaveBeenCalled())
      expect(showSaveFilePicker.mock.calls[0][0].types[0].description).toBe('Plik CSV')
    } finally {
      await changeAppLanguage('en')
    }
  })

  it('disables Export CSV when the date range is invalid', () => {
    renderPanel(true, { uid: 'manager', displayName: 'Manager' })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-12-31' } })
    fireEvent.change(screen.getByLabelText('Through'), { target: { value: '2026-01-01' } })
    expect(screen.getByRole('button', { name: 'Export CSV' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Export PDF' }).hasAttribute('disabled')).toBe(true)
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
