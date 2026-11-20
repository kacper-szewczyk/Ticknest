// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Catalog } from '../../src/lib/catalog'
import type { CalendarEvent } from '../../src/lib/calendarSuggestions'
import type { LeaveRequest } from '../../src/lib/leave'
import type { TimeEntry } from '../../src/lib/timeEntries'
import { PALETTES } from '../../src/palettes'
import { createAppTheme } from '../../src/theme'

const calendar = vi.hoisted(() => ({
  token: 'token' as string | null,
  events: [] as CalendarEvent[] | Error,
  connectGoogleCalendar: vi.fn(async () => {}),
}))
const leave = vi.hoisted(() => ({ requests: [] as Partial<LeaveRequest>[] }))
const saveCalendarPreferences = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('../../src/lib/firebase', () => ({ db: {}, callFunction: vi.fn() }))
vi.mock('../../src/lib/googleCalendar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/googleCalendar')>()),
  currentCalendarToken: () => calendar.token,
  subscribeToCalendarToken: () => () => {},
  connectGoogleCalendar: calendar.connectGoogleCalendar,
  fetchGoogleCalendarEvents: async () => {
    if (calendar.events instanceof Error) throw calendar.events
    return calendar.events
  },
}))
vi.mock('../../src/lib/calendarPreferences', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/calendarPreferences')>()),
  saveCalendarPreferences,
}))
vi.mock('../../src/lib/timeOff', () => ({
  subscribeToLeaveRequests: (_workspaceId: string, _filter: unknown, onChange: (requests: unknown[]) => void) => {
    onChange(leave.requests)
    return () => {}
  },
}))

const { CalendarSuggestions } = await import('../../src/CalendarSuggestions')
const { CalendarError } = await import('../../src/lib/googleCalendar')

const catalog: Catalog = {
  clients: [],
  projects: [
    {
      id: 'p1',
      name: 'Internal',
      clientId: null,
      description: '',
      color: '#000',
      estimateMinutes: null,
      archived: false,
    },
  ],
  tasks: [],
}

function event(id: string, start: string, end: string, overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return { id, seriesId: null, title: `Meeting ${id}`, start: new Date(start), end: new Date(end), ...overrides }
}

function entry(start: string, end: string, userId = 'u1'): TimeEntry {
  const stamp = (value: string) => {
    const date = new Date(value)
    return { toMillis: () => date.getTime(), toDate: () => new Date(date) } as TimeEntry['startAt']
  }
  return {
    id: start,
    userId,
    description: '',
    clientName: null,
    projectName: null,
    taskName: null,
    billable: false,
    startAt: stamp(start),
    endAt: stamp(end),
  }
}

function renderSuggestions(entries: TimeEntry[] = [], onAccept = vi.fn()) {
  render(
    <ThemeProvider theme={createAppTheme(PALETTES.forest)}>
      <CalendarSuggestions
        user={{ uid: 'u1' } as User}
        workspaceId="w1"
        weekStart="2026-11-16"
        entries={entries}
        catalog={catalog}
        preferences={{
          connected: true,
          dismissedEventIds: ['old'],
          seriesWork: { standup: { projectId: 'p1', taskId: null } },
        }}
        now={new Date('2026-11-20T12:00:00').getTime()}
        onAccept={onAccept}
      />
    </ThemeProvider>,
  )
  return onAccept
}

beforeEach(() => {
  calendar.token = 'token'
  calendar.events = [
    event('standup_1', '2026-11-17T09:00:00', '2026-11-17T09:15:00', { seriesId: 'standup', title: 'Stand-up' }),
    event('review', '2026-11-18T14:00:00', '2026-11-18T15:00:00', { title: 'Design review' }),
    event('logged', '2026-11-19T10:00:00', '2026-11-19T11:00:00', { title: 'Already logged' }),
    event('old', '2026-11-19T13:00:00', '2026-11-19T14:00:00', { title: 'Dismissed before' }),
  ]
  leave.requests = []
  calendar.connectGoogleCalendar.mockClear()
  saveCalendarPreferences.mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('CalendarSuggestions', () => {
  it('lists the events without an entry, grouped by day, with remembered projects', async () => {
    renderSuggestions([
      entry('2026-11-19T10:30:00', '2026-11-19T12:00:00'),
      entry('2026-11-18T14:00:00', '2026-11-18T15:00:00', 'u2'),
    ])
    expect(await screen.findByText('Stand-up')).toBeTruthy()
    // Another member's entry at the same time does not hide the user's own meeting.
    expect(screen.getByText('Design review')).toBeTruthy()
    expect(screen.queryByText('Already logged')).toBeNull()
    expect(screen.queryByText('Dismissed before')).toBeNull()
    const standup = screen.getByRole('article', { name: 'Stand-up' })
    expect(within(standup).getByText('Internal')).toBeTruthy()
    expect(within(standup).getByText('09:00 AM–09:15 AM · 0:15')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Tuesday, November 17' })).toBeTruthy()
  })

  it('passes the event and its remembered work to Accept', async () => {
    const onAccept = renderSuggestions()
    await userEvent.click(await screen.findByRole('button', { name: 'Accept Stand-up' }))
    expect(onAccept).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'standup_1', day: '2026-11-17', title: 'Stand-up' }),
      expect.objectContaining({ projectId: 'p1', projectName: 'Internal' }),
    )
  })

  it('remembers a dismissed event', async () => {
    renderSuggestions()
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss Design review' }))
    expect(saveCalendarPreferences).toHaveBeenCalledWith('w1', 'u1', {
      connected: true,
      dismissedEventIds: ['old', 'review'],
      seriesWork: { standup: { projectId: 'p1', taskId: null } },
    })
  })

  it('leaves out days of approved time off when time off is on', async () => {
    vi.stubEnv('VITE_FEATURE_TIME_OFF_ENABLED', 'true')
    leave.requests = [{ startDate: '2026-11-17', endDate: '2026-11-17', startHalf: false, endHalf: false }]
    renderSuggestions()
    expect(await screen.findByText('Design review')).toBeTruthy()
    expect(screen.queryByText('Stand-up')).toBeNull()
  })

  it('asks to reconnect when the tab has no access token', async () => {
    calendar.token = null
    renderSuggestions()
    expect(screen.getByText('Reconnect Google Calendar to see this week’s suggestions.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    expect(calendar.connectGoogleCalendar).toHaveBeenCalledTimes(1)
  })

  it('shows an empty state and a failed request', async () => {
    calendar.events = []
    renderSuggestions()
    expect(await screen.findByText('No calendar events to suggest for this week.')).toBeTruthy()
    cleanup()
    calendar.events = new CalendarError('request-failed', 'boom')
    renderSuggestions()
    await waitFor(() =>
      expect(screen.getByText('We couldn’t load your Google Calendar. Try again in a moment.')).toBeTruthy(),
    )
  })
})
