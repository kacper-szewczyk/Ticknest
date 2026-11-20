// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

type Requests = string[]

beforeAll(() => {
  // The module reads the tab's token when it loads.
  window.sessionStorage.setItem(
    'tickness.googleCalendarToken.v2',
    JSON.stringify({ accessToken: 'token', expiresAt: Date.now() + 3_600_000 }),
  )
})

const load = () => import('../../src/lib/googleCalendar')

function stubFetch(respond: (url: URL) => { status?: number; body?: unknown }): Requests {
  const requests: Requests = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      requests.push(decodeURIComponent(url.pathname))
      const { status = 200, body = {} } = respond(url)
      return new Response(JSON.stringify(body), { status })
    }),
  )
  return requests
}

const item = (id: string, iCalUID = id) => ({
  id,
  iCalUID,
  summary: id,
  start: { dateTime: '2026-11-17T09:00:00+01:00' },
  end: { dateTime: '2026-11-17T10:00:00+01:00' },
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchGoogleCalendarEvents', () => {
  const from = new Date('2026-11-16T00:00:00+01:00')
  const to = new Date('2026-11-23T00:00:00+01:00')

  it('reads the primary calendar when none is chosen', async () => {
    const requests = stubFetch(() => ({ body: { items: [item('a')] } }))
    const { fetchGoogleCalendarEvents } = await load()
    expect((await fetchGoogleCalendarEvents(from, to)).map((event) => event.id)).toEqual(['a'])
    expect(requests).toEqual(['/calendar/v3/calendars/primary/events'])
  })

  it('reads each chosen calendar in order and skips one that no longer exists', async () => {
    const requests = stubFetch((url) => {
      if (url.pathname.includes('gone')) return { status: 404 }
      if (url.pathname.includes('team')) return { body: { items: [item('team-copy', 'shared')] } }
      return { body: { items: [item('mine', 'shared')] } }
    })
    const { fetchGoogleCalendarEvents } = await load()
    const events = await fetchGoogleCalendarEvents(from, to, ['me@example.com', 'gone@example.com', 'team#x'])
    expect(events.map((event) => event.id)).toEqual(['mine', 'team-copy'])
    expect(events[0].occurrenceKey).toBe(events[1].occurrenceKey)
    expect(requests).toEqual([
      '/calendar/v3/calendars/me@example.com/events',
      '/calendar/v3/calendars/gone@example.com/events',
      '/calendar/v3/calendars/team#x/events',
    ])
  })

  it('fails on other errors', async () => {
    stubFetch(() => ({ status: 500 }))
    const { fetchGoogleCalendarEvents, CalendarError } = await load()
    await expect(fetchGoogleCalendarEvents(from, to, ['a'])).rejects.toBeInstanceOf(CalendarError)
  })
})

describe('fetchGoogleCalendarList', () => {
  it('lists calendars with the primary one first', async () => {
    const requests = stubFetch(() => ({
      body: {
        items: [
          { id: 'team', summary: 'Team' },
          { id: 'me@example.com', summary: 'Me', primary: true },
        ],
      },
    }))
    const { fetchGoogleCalendarList } = await load()
    expect((await fetchGoogleCalendarList()).map((calendar) => calendar.id)).toEqual(['me@example.com', 'team'])
    expect(requests).toEqual(['/calendar/v3/users/me/calendarList'])
  })
})
