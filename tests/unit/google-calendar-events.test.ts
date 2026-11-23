import { describe, expect, it } from 'vitest'
import { parseGoogleEventsPage } from '../../src/lib/googleCalendarEvents'

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
