// Turns a Google Calendar `events.list` response into provider-neutral events. The response is untrusted input,
// so every field is checked before use and anything unexpected is dropped rather than guessed at.
import type { CalendarEvent } from './calendarSuggestions'

/** The only event fields requested from Google, which keeps descriptions, attendees' names and links out of the browser. */
export const GOOGLE_EVENT_FIELDS =
  'nextPageToken,items(id,recurringEventId,summary,status,transparency,eventType,start(dateTime),end(dateTime),attendees(self,responseStatus))'

// Working location, out-of-office and birthday entries are calendar bookkeeping, not meetings.
const SKIPPED_EVENT_TYPES = new Set(['workingLocation', 'outOfOffice', 'birthday'])
const MAX_TITLE_LENGTH = 500

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function dateTimeOf(value: unknown): Date | null {
  // All-day events have `date` instead of `dateTime`, so they end up here as null and are skipped.
  if (!isRecord(value) || typeof value.dateTime !== 'string') return null
  const date = new Date(value.dateTime)
  return Number.isNaN(date.getTime()) ? null : date
}

function hasDeclined(attendees: unknown): boolean {
  if (!Array.isArray(attendees)) return false
  return attendees.some(
    (attendee) => isRecord(attendee) && attendee.self === true && attendee.responseStatus === 'declined',
  )
}

/** Reads one page of `events.list`, keeping timed, confirmed, busy events the user has not declined. */
export function parseGoogleEventsPage(response: unknown): { events: CalendarEvent[]; nextPageToken: string | null } {
  if (!isRecord(response)) return { events: [], nextPageToken: null }
  const items = Array.isArray(response.items) ? response.items : []
  const events: CalendarEvent[] = []
  for (const item of items) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id) continue
    if (item.status === 'cancelled' || item.transparency === 'transparent') continue
    if (typeof item.eventType === 'string' && SKIPPED_EVENT_TYPES.has(item.eventType)) continue
    if (hasDeclined(item.attendees)) continue
    const start = dateTimeOf(item.start)
    const end = dateTimeOf(item.end)
    if (!start || !end || end <= start) continue
    const title = typeof item.summary === 'string' ? item.summary.trim().slice(0, MAX_TITLE_LENGTH) : ''
    events.push({
      id: item.id,
      seriesId: typeof item.recurringEventId === 'string' && item.recurringEventId ? item.recurringEventId : null,
      title,
      start,
      end,
    })
  }
  const nextPageToken =
    typeof response.nextPageToken === 'string' && response.nextPageToken ? response.nextPageToken : null
  return { events, nextPageToken }
}
