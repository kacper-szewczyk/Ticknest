// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen } from '@testing-library/react'
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

afterEach(cleanup)

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
