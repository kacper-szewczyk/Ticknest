// Provider-neutral calendar suggestions. A calendar provider (Google today) turns its events into `CalendarEvent`s,
// which keeps the matching rules here independent of any one provider's API.
import { localDayString } from './dates'
import { workDetails, workOptionKey, type WorkDetails, type WorkOption, type WorkSelection } from './workOptions'

/** One timed calendar event, already filtered by the provider to events the user attends and that block time. */
export type CalendarEvent = {
  /** Unique per occurrence, so one occurrence of a recurring meeting can be dismissed on its own. */
  id: string
  /** Shared by every occurrence of a recurring event; `null` for a one-off event. */
  seriesId: string | null
  title: string
  start: Date
  end: Date
}

/** The project and task remembered for a recurring event. */
export type SeriesWork = Pick<WorkSelection, 'projectId' | 'taskId'>

export type CalendarSuggestion = CalendarEvent & {
  /** Local calendar date (`YYYY-MM-DD`) the event falls on. */
  day: string
  durationSeconds: number
  /** The project and task chosen for an earlier occurrence of the same recurring event, if any. */
  work: SeriesWork | null
}

type EntryInterval = { startAt: Date; endAt: Date | null }

export type SuggestionContext = {
  /** The signed-in user's own entries for the period; a running timer counts up to `now`. */
  entries: readonly EntryInterval[]
  dismissedEventIds: ReadonlySet<string>
  /** Local dates fully covered by approved time off. */
  timeOffDays: ReadonlySet<string>
  seriesWork: Readonly<Record<string, SeriesWork>>
  now: Date
}

/**
 * Keeps the events worth offering as entries: ones that have ended, start and end on the same local day, are not
 * dismissed, do not fall on a day off, and do not overlap an entry the user already has (saving one would conflict).
 */
export function calendarSuggestions(
  events: readonly CalendarEvent[],
  context: SuggestionContext,
): CalendarSuggestion[] {
  const nowMs = context.now.getTime()
  const intervals = context.entries.map((entry) => ({
    start: entry.startAt.getTime(),
    end: entry.endAt ? entry.endAt.getTime() : nowMs,
  }))
  const seen = new Set<string>()
  const suggestions: CalendarSuggestion[] = []
  for (const event of events) {
    const start = event.start.getTime()
    const end = event.end.getTime()
    if (!(end > start) || end > nowMs || seen.has(event.id)) continue
    const day = localDayString(event.start)
    if (localDayString(new Date(end - 1)) !== day) continue
    if (context.dismissedEventIds.has(event.id) || context.timeOffDays.has(day)) continue
    if (intervals.some((interval) => interval.start < end && start < interval.end)) continue
    seen.add(event.id)
    suggestions.push({
      ...event,
      day,
      durationSeconds: Math.round((end - start) / 1000),
      work: (event.seriesId && context.seriesWork[event.seriesId]) || null,
    })
  }
  return suggestions.sort((a, b) => a.start.getTime() - b.start.getTime())
}

/** Local dates covered by whole days of leave; half days at either end of a request still have working time. */
export function fullLeaveDays(
  requests: ReadonlyArray<{ startDate: string; endDate: string; startHalf: boolean; endHalf: boolean }>,
): Set<string> {
  const days = new Set<string>()
  for (const request of requests) {
    const [startYear, startMonth, startDay] = request.startDate.split('-').map(Number)
    const cursor = new Date(startYear, startMonth - 1, startDay)
    for (let guard = 0; guard < 400; guard += 1) {
      const day = localDayString(cursor)
      if (day > request.endDate) break
      const isHalf = (day === request.startDate && request.startHalf) || (day === request.endDate && request.endHalf)
      if (!isHalf) days.add(day)
      cursor.setDate(cursor.getDate() + 1)
    }
  }
  return days
}

/**
 * The remembered project and task as entry details, as long as they are still active. `options` comes from
 * `buildWorkOptions(catalog)`, which hides archived records.
 */
export function workForSeries(options: readonly WorkOption[], work: SeriesWork | null): WorkDetails | undefined {
  if (!work?.projectId) return undefined
  const key = workOptionKey({ clientId: null, ...work })
  const option = options.find((candidate) => candidate.key === key && !candidate.archived)
  return option ? workDetails(option) : undefined
}
