// Turns a Google Calendar `events.list` response into provider-neutral events. The response is untrusted input,
// so every field is checked before use and anything unexpected is dropped rather than guessed at.
import type { CalendarEvent } from './calendarSuggestions'

/** The only event fields requested from Google, which keeps descriptions, attendees' names and links out of the browser. */
export const GOOGLE_EVENT_FIELDS =
  'nextPageToken,items(id,iCalUID,recurringEventId,summary,status,transparency,eventType,start(dateTime),end(dateTime),attendees(self,responseStatus))'

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
    const iCalUID = typeof item.iCalUID === 'string' && item.iCalUID ? item.iCalUID : null
    events.push({
      id: item.id,
      // Every occurrence of a recurring event shares its iCalUID, so the start tells occurrences apart.
      ...(iCalUID ? { occurrenceKey: `${iCalUID}|${start.getTime()}` } : {}),
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

/** The only calendar-list fields requested: the ID to store, the name to show, and whether it is the primary one. */
export const GOOGLE_CALENDAR_LIST_FIELDS = 'nextPageToken,items(id,summary,summaryOverride,primary,deleted,hidden)'

/** A calendar the user can choose. The name is shown in the picker and never stored. */
export type CalendarListItem = { id: string; name: string; primary: boolean }

const MAX_CALENDAR_ID_LENGTH = 1024

/** Reads one page of `calendarList.list`, skipping deleted and hidden calendars. */
export function parseGoogleCalendarListPage(response: unknown): {
  calendars: CalendarListItem[]
  nextPageToken: string | null
} {
  if (!isRecord(response)) return { calendars: [], nextPageToken: null }
  const items = Array.isArray(response.items) ? response.items : []
  const calendars: CalendarListItem[] = []
  for (const item of items) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id || item.id.length > MAX_CALENDAR_ID_LENGTH) continue
    if (item.deleted === true || item.hidden === true) continue
    const override = typeof item.summaryOverride === 'string' ? item.summaryOverride.trim() : ''
    const summary = typeof item.summary === 'string' ? item.summary.trim() : ''
    calendars.push({
      id: item.id,
      name: (override || summary || item.id).slice(0, MAX_TITLE_LENGTH),
      primary: item.primary === true,
    })
  }
  const nextPageToken =
    typeof response.nextPageToken === 'string' && response.nextPageToken ? response.nextPageToken : null
  return { calendars, nextPageToken }
}
