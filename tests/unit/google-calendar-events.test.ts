import { describe, expect, it } from 'vitest'
import { parseGoogleCalendarListPage, parseGoogleEventsPage } from '../../src/lib/googleCalendarEvents'

const timed = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  summary: `Meeting ${id}`,
  status: 'confirmed',
  start: { dateTime: '2026-11-17T09:00:00+01:00' },
  end: { dateTime: '2026-11-17T10:00:00+01:00' },
  ...overrides,
})

describe('parseGoogleEventsPage', () => {
  it('keeps timed events with their series and the next page token', () => {
    const page = parseGoogleEventsPage({
      nextPageToken: 'next',
      items: [timed('a', { recurringEventId: 'series', summary: '  Stand-up  ' })],
    })
    expect(page).toEqual({
      nextPageToken: 'next',
      events: [
        {
          id: 'a',
          seriesId: 'series',
          title: 'Stand-up',
          start: new Date('2026-11-17T08:00:00Z'),
          end: new Date('2026-11-17T09:00:00Z'),
        },
      ],
    })
  })

  it.each<[string, Record<string, unknown>]>([
    ['all-day events', { start: { date: '2026-11-17' }, end: { date: '2026-11-18' } }],
    ['cancelled events', { status: 'cancelled' }],
    ['events marked free', { transparency: 'transparent' }],
    ['declined events', { attendees: [{ self: true, responseStatus: 'declined' }] }],
    ['out-of-office blocks', { eventType: 'outOfOffice' }],
    ['working-location entries', { eventType: 'workingLocation' }],
    ['events ending before they start', { end: { dateTime: '2026-11-17T08:00:00+01:00' } }],
    ['events with an invalid time', { start: { dateTime: 'soon' } }],
  ])('skips %s', (_, overrides) => {
    expect(parseGoogleEventsPage({ items: [timed('a', overrides)] }).events).toEqual([])
  })

  it('keeps events others declined and events the user accepted', () => {
    const page = parseGoogleEventsPage({
      items: [
        timed('a', {
          attendees: [{ self: true, responseStatus: 'accepted' }, { responseStatus: 'declined' }],
        }),
      ],
    })
    expect(page.events.map((item) => item.id)).toEqual(['a'])
  })

  it('tolerates malformed responses and items', () => {
    expect(parseGoogleEventsPage(null)).toEqual({ events: [], nextPageToken: null })
    expect(parseGoogleEventsPage({ items: 'nope' })).toEqual({ events: [], nextPageToken: null })
    expect(parseGoogleEventsPage({ items: [null, 1, { id: '' }, timed('ok', { summary: 7 })] }).events).toEqual([
      expect.objectContaining({ id: 'ok', title: '', seriesId: null }),
    ])
  })

  it('shortens very long titles', () => {
    const [item] = parseGoogleEventsPage({ items: [timed('a', { summary: 'x'.repeat(600) })] }).events
    expect(item.title).toHaveLength(500)
  })
})

describe('iCalUID', () => {
  it('becomes an occurrence key that tells recurring occurrences apart', () => {
    const { events } = parseGoogleEventsPage({
      items: [
        timed('a', { iCalUID: 'uid@google.com' }),
        timed('b', {
          iCalUID: 'uid@google.com',
          start: { dateTime: '2026-11-18T09:00:00+01:00' },
          end: { dateTime: '2026-11-18T10:00:00+01:00' },
        }),
        timed('c'),
      ],
    })
    expect(events.map((item) => item.occurrenceKey)).toEqual([
      `uid@google.com|${new Date('2026-11-17T09:00:00+01:00').getTime()}`,
      `uid@google.com|${new Date('2026-11-18T09:00:00+01:00').getTime()}`,
      undefined,
    ])
  })
})

describe('parseGoogleCalendarListPage', () => {
  it('keeps visible calendars with their display name', () => {
    expect(
      parseGoogleCalendarListPage({
        nextPageToken: 'next',
        items: [
          { id: 'me@example.com', summary: 'me@example.com', primary: true },
          { id: 'team', summary: 'Team', summaryOverride: ' Our team ' },
          { id: 'hidden', summary: 'Hidden', hidden: true },
          { id: 'gone', summary: 'Gone', deleted: true },
          { id: 'unnamed' },
          { summary: 'No ID' },
          'junk',
        ],
      }),
    ).toEqual({
      nextPageToken: 'next',
      calendars: [
        { id: 'me@example.com', name: 'me@example.com', primary: true },
        { id: 'team', name: 'Our team', primary: false },
        { id: 'unnamed', name: 'unnamed', primary: false },
      ],
    })
    expect(parseGoogleCalendarListPage(null)).toEqual({ calendars: [], nextPageToken: null })
  })
})
