// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Catalog } from '../../src/lib/catalog'
import type { TimeEntry } from '../../src/lib/timeEntries'
import { PALETTES } from '../../src/palettes'
import { createAppTheme } from '../../src/theme'
import { TimeEntriesPanel } from '../../src/TimeEntriesPanel'

// Entries for the week on screen, keyed by the week start the panel subscribes with.
const weeks = new Map<string, TimeEntry[]>()

vi.mock('../../src/lib/timeEntries', () => ({
  subscribeToEntriesForRange: (
    _workspaceId: string,
    _uid: string,
    _isOwner: boolean,
    weekStart: string,
    _days: number,
    onEntries: (entries: TimeEntry[]) => void,
  ) => {
    onEntries(weeks.get(weekStart) ?? [])
    return () => {}
  },
  continueTimer: vi.fn(),
  deleteTimeEntry: vi.fn(),
}))

// A stand-in editor that saves straight away on the day it was opened for.
vi.mock('../../src/EntryEditor', () => ({
  EntryEditor: ({ day, onSaved }: { day: string; onSaved: (message: string, day: string) => void }) => (
    <button type="button" onClick={() => onSaved('Time entry added.', day)}>
      Save entry for {day}
    </button>
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

function renderPanel() {
  return render(
    <ThemeProvider theme={createAppTheme(PALETTES.forest)}>
      <TimeEntriesPanel
        user={{ uid: 'u1' } as User}
        workspaceId="w1"
        isOwner={false}
        weekStartsOn={1}
        catalog={{} as Catalog}
      />
    </ThemeProvider>,
  )
}

const WEEKDAYS: Record<string, string> = {
  Monday: '2026-11-02',
  Tuesday: '2026-11-03',
  Wednesday: '2026-11-04',
}

function daySection(weekday: string): HTMLElement {
  return document.querySelector(`section[aria-labelledby="timesheet-${WEEKDAYS[weekday]}"]`) as HTMLElement
}

function dayEntries(weekday: string): HTMLElement {
  return document.getElementById(`timesheet-${WEEKDAYS[weekday]}-entries`) as HTMLElement
}

beforeEach(() => {
  // Wednesday 4 November 2026; the week on screen runs Monday 2 to Sunday 8 November.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-04T12:00:00'))
  weeks.clear()
  weeks.set('2026-11-02', [
    timeEntry('a', '2026-11-02T09:00', '2026-11-02T11:00', {
      clientName: 'Acme',
      projectName: 'Website',
      billable: true,
    }),
    timeEntry('b', '2026-11-02T13:00', '2026-11-02T14:00', { projectName: 'Internal' }),
    timeEntry('c', '2026-11-04T10:00', null, { description: 'Still going' }),
  ])
  weeks.set('2026-11-09', [timeEntry('d', '2026-11-10T09:00', '2026-11-10T10:00')])
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('TimeEntriesPanel day sections', () => {
  it('starts with every day collapsed and shows a summary line', () => {
    renderPanel()
    const monday = screen.getByRole('button', { name: /Monday/ })
    expect(monday.getAttribute('aria-expanded')).toBe('false')
    expect(monday.getAttribute('aria-controls')).toBe('timesheet-2026-11-02-entries')
    expect(screen.queryByText('Entry a')).toBeNull()
    expect(
      within(daySection('Monday')).getByText('2 entries · 2:00 billable · Acme · Website 2:00 · Internal 1:00'),
    ).toBeTruthy()
  })

  it('shows a running entry while its day is collapsed', () => {
    renderPanel()
    const wednesday = daySection('Wednesday')
    expect(within(wednesday).getByText('Running')).toBeTruthy()
    expect(within(wednesday).queryByText('Still going')).toBeNull()
  })

  it('keeps empty days without an expand control', () => {
    renderPanel()
    expect(screen.queryByRole('button', { name: /Tuesday/ })).toBeNull()
    expect(screen.getAllByText('No entries')).toHaveLength(5)
  })

  it('expands and collapses a day from its header button and the keyboard', async () => {
    const user = userEvent.setup()
    renderPanel()
    const monday = screen.getByRole('button', { name: /Monday/ })
    await user.click(monday)
    expect(monday.getAttribute('aria-expanded')).toBe('true')
    const entries = dayEntries('Monday')
    expect(within(entries).getByText('Entry a')).toBeTruthy()
    expect(within(entries).getAllByRole('button', { name: 'Continue' })).toHaveLength(2)
    expect(within(entries).getAllByRole('button', { name: 'Edit' })).toHaveLength(2)
    expect(within(entries).getAllByRole('button', { name: 'Delete' })).toHaveLength(2)

    monday.focus()
    await user.keyboard('{Enter}')
    expect(monday.getAttribute('aria-expanded')).toBe('false')
    await user.keyboard(' ')
    expect(monday.getAttribute('aria-expanded')).toBe('true')
  })

  it('expands every day with entries, then collapses them all', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(screen.getByRole('button', { name: /Monday/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: /Wednesday/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Still going')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Collapse all' }))
    expect(screen.getByRole('button', { name: /Monday/ }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: /Wednesday/ }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: 'Expand all' })).toBeTruthy()
  })

  it('collapses again after moving to another week', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: /Monday/ }))
    await user.click(screen.getByRole('button', { name: 'Next week' }))
    expect(screen.getByRole('button', { name: /Tuesday/ }).getAttribute('aria-expanded')).toBe('false')
    await user.click(screen.getByRole('button', { name: 'Previous week' }))
    expect(screen.getByRole('button', { name: /Monday/ }).getAttribute('aria-expanded')).toBe('false')
  })

  it('adds an entry from a collapsed day header and expands that day after saving', async () => {
    const user = userEvent.setup()
    renderPanel()
    const monday = screen.getByRole('button', { name: /Monday/ })
    await user.click(within(daySection('Monday')).getByRole('button', { name: 'Add entry' }))
    expect(monday.getAttribute('aria-expanded')).toBe('false')
    await user.click(screen.getByRole('button', { name: 'Save entry for 2026-11-02' }))
    expect(monday.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Time entry added.')).toBeTruthy()
  })
})

describe('TimeEntriesPanel over-24h warning', () => {
  beforeEach(() => {
    weeks.set('2026-11-02', [
      timeEntry('a', '2026-11-03T00:00', '2026-11-03T20:00', { description: 'Forgotten timer' }),
      timeEntry('b', '2026-11-03T09:00', '2026-11-03T14:00', { description: 'Meeting' }),
      timeEntry('c', '2026-11-03T21:00', '2026-11-03T22:00', { description: 'Evening' }),
    ])
  })

  it('warns in the header of a collapsed day', () => {
    renderPanel()
    const tuesday = daySection('Tuesday')
    expect(within(tuesday).getByText('Over 24h')).toBeTruthy()
    expect(within(tuesday).getByLabelText(/add up to more than 24 hours/)).toBeTruthy()
    expect(within(daySection('Wednesday')).queryByText('Over 24h')).toBeNull()
  })

  it('highlights only the overlapping entries once expanded', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: /Tuesday/ }))
    expect(within(daySection('Tuesday')).getByText('Over 24h')).toBeTruthy()
    const rows = within(dayEntries('Tuesday')).getAllByRole('article')
    const overlaps = rows.map((row) => within(row).queryByText('Overlaps') !== null)
    expect(overlaps).toEqual([true, true, false])
  })
})
