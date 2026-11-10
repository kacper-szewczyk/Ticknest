// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Catalog } from '../../src/lib/catalog'
import type { TimeEntry } from '../../src/lib/timeEntries'
import type { WorkspaceMember } from '../../src/lib/workspaces'
import { PALETTES } from '../../src/palettes'
import { createAppTheme } from '../../src/theme'
import { TimesheetDashboard } from '../../src/TimesheetDashboard'

// Entries keyed by the first day of the two-week range the dashboard subscribes with (previous week start).
const ranges = new Map<string, TimeEntry[]>()
const deleteTimeEntry = vi.fn()

vi.mock('../../src/lib/timeEntries', () => ({
  subscribeToEntriesForRange: (
    _workspaceId: string,
    _uid: string,
    _canSeeAll: boolean,
    startDay: string,
    _days: number,
    onEntries: (entries: TimeEntry[]) => void,
  ) => {
    onEntries(ranges.get(startDay) ?? [])
    return () => {}
  },
  deleteTimeEntry: (...args: unknown[]) => deleteTimeEntry(...args),
}))

vi.mock('../../src/lib/workspaces', () => ({
  subscribeToWorkspaceMembers: (_workspaceId: string, onMembers: (members: WorkspaceMember[]) => void) => {
    onMembers([
      { uid: 'u1', displayName: 'Ada Lovelace', email: 'ada@example.com', status: 'active' },
      { uid: 'u2', displayName: 'Grace Hopper', email: 'grace@example.com', status: 'active' },
    ] as WorkspaceMember[])
    return () => {}
  },
}))

// A stand-in editor that reports which entry and day it was opened for.
vi.mock('../../src/EntryEditor', () => ({
  EntryEditor: ({ day, entry }: { day: string; entry?: TimeEntry }) => (
    <div role="dialog" aria-label="Entry editor">
      {entry ? `Editing ${entry.description} on ${day}` : `Adding on ${day}`}
    </div>
  ),
}))

function timestamp(value: string) {
  const date = new Date(value)
  return { toMillis: () => date.getTime(), toDate: () => new Date(date) } as TimeEntry['startAt']
}

function timeEntry(id: string, start: string, end: string | null, overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id,
    userId: 'u1',
    description: `Entry ${id}`,
    clientName: null,
    projectName: null,
    taskName: null,
    billable: false,
    startAt: timestamp(start),
    endAt: end === null ? null : timestamp(end),
    ...overrides,
  }
}

const user = { uid: 'u1', displayName: 'Ada Lovelace', email: 'ada@example.com' } as User

function renderDashboard(canSeeAllEntries: boolean) {
  return render(
    <ThemeProvider theme={createAppTheme(PALETTES.forest)}>
      <TimesheetDashboard
        user={user}
        workspaceId="w1"
        canSeeAllEntries={canSeeAllEntries}
        isOwner={canSeeAllEntries}
        weekStartsOn={1}
        catalog={{} as Catalog}
      />
    </ThemeProvider>,
  )
}

function timelineDays(): string[] {
  return screen
    .getAllByRole('region')
    .map((region) => region.getAttribute('aria-label') ?? '')
    .filter((label) => label.endsWith('tracked'))
}

beforeEach(() => {
  // Wednesday 4 November 2026; the week on screen runs Monday 2 to Sunday 8 November.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-04T12:00:00'))
  ranges.clear()
  deleteTimeEntry.mockReset()
  ranges.set('2026-10-26', [
    timeEntry('prev', '2026-10-27T09:00', '2026-10-27T10:00'),
    timeEntry('a', '2026-11-02T09:00', '2026-11-02T11:00', { billable: true }),
    timeEntry('b', '2026-11-03T13:00', '2026-11-03T14:00'),
    timeEntry('g', '2026-11-02T09:00', '2026-11-02T12:00', { userId: 'u2', description: 'Grace work' }),
  ])
  ranges.set('2026-10-19', [timeEntry('old', '2026-10-27T09:00', '2026-10-27T10:30', { description: 'Last week' })])
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('TimesheetDashboard for members', () => {
  it('shows the personal week inline, without the team table or a dialog', () => {
    renderDashboard(false)
    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Timeline' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Entries (2)' })).toBeTruthy()
    expect(screen.getByText('Weekly target')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /Open timesheet/ })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    expect(screen.queryByText('Active members')).toBeNull()
    // Only their own entries count, today and earlier days are shown newest first.
    expect(timelineDays()).toEqual(['Today, 0m tracked', 'Yesterday, 1h tracked', 'Monday, Nov 2, 2h tracked'])
  })

  it('filters the timeline and entries to a day picked in the day strip', async () => {
    const events = userEvent.setup()
    renderDashboard(false)
    const strip = screen.getByRole('group', { name: 'Show day' })
    await events.click(within(strip).getByRole('button', { name: 'Monday, Nov 2, 2h tracked' }))
    expect(timelineDays()).toEqual(['Monday, Nov 2, 2h tracked'])
    expect(within(strip).getByRole('button', { name: 'Monday, Nov 2, 2h tracked' }).getAttribute('aria-pressed')).toBe(
      'true',
    )

    await events.click(screen.getByRole('tab', { name: 'Entries (1)' }))
    expect(screen.getByText('Entry a')).toBeTruthy()
    expect(screen.queryByText('Entry b')).toBeNull()

    await events.click(screen.getByRole('button', { name: '+ Add entry' }))
    expect(screen.getByRole('dialog', { name: 'Entry editor' }).textContent).toBe('Adding on 2026-11-02')
  })

  it('returns to the whole week from the All week chip', async () => {
    const events = userEvent.setup()
    renderDashboard(false)
    await events.click(screen.getByRole('button', { name: 'Yesterday, 1h tracked' }))
    expect(timelineDays()).toHaveLength(1)
    await events.click(screen.getByRole('button', { name: 'All week' }))
    expect(timelineDays()).toHaveLength(3)
  })

  it('moves between weeks with the week picker and clears the picked day', async () => {
    const events = userEvent.setup()
    renderDashboard(false)
    await events.click(screen.getByRole('button', { name: 'Monday, Nov 2, 2h tracked' }))
    await events.click(screen.getByRole('button', { name: 'Previous week' }))
    expect(screen.getByRole('button', { name: 'All week' }).getAttribute('aria-pressed')).toBe('true')
    expect(timelineDays()).toHaveLength(7)
    await events.click(screen.getByRole('tab', { name: 'Entries (1)' }))
    expect(screen.getByText('Last week')).toBeTruthy()
  })

  it('edits and deletes their own entries from the Entries tab', async () => {
    const events = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    deleteTimeEntry.mockResolvedValue(undefined)
    renderDashboard(false)
    await events.click(screen.getByRole('tab', { name: 'Entries (2)' }))

    const entryA = screen.getByText('Entry a').closest('article') as HTMLElement
    await events.click(within(entryA).getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('dialog', { name: 'Entry editor' }).textContent).toBe('Editing Entry a on 2026-11-02')

    await events.click(within(entryA).getByRole('button', { name: 'Delete' }))
    expect(deleteTimeEntry).toHaveBeenCalledWith('w1', expect.objectContaining({ id: 'a' }))
    expect(await screen.findByText('Time entry deleted.')).toBeTruthy()
  })
})

describe('TimesheetDashboard for managers', () => {
  it('keeps the team table and opens a member in the dialog', async () => {
    const events = userEvent.setup()
    renderDashboard(true)
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: 'Search members' })).toBeTruthy()
    expect(screen.getByText('Active members')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Show day' })).toBeNull()

    await events.click(screen.getByRole('button', { name: 'Open timesheet for Grace Hopper' }))
    const dialog = screen.getByRole('dialog', { name: 'Grace Hopper' })
    expect(within(dialog).getByRole('tab', { name: 'Entries (1)' })).toBeTruthy()
    expect(within(dialog).getByText(/^Week of /)).toBeTruthy()
    expect(within(dialog).queryByRole('group', { name: 'Show day' })).toBeNull()

    await events.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Grace Hopper' })).toBeNull()
  })
})
