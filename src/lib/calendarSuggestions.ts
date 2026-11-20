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
  /**
   * Identifies the same occurrence across calendars, so a meeting in two chosen calendars is suggested once. Google
   * shares an `iCalUID` across every occurrence of a recurring event, so the provider combines it with the start.
   */
  occurrenceKey?: string
  title: string
  start: Date
  end: Date
}

/** The project and task remembered for a recurring event. */
export type SeriesWork = Pick<WorkSelection, 'projectId' | 'taskId'>

/** Pre-fills the project and task for events whose title contains `keyword`, ignoring case. */
export type KeywordRule = SeriesWork & { keyword: string }

export type CalendarSuggestion = CalendarEvent & {
  /** Local calendar date (`YYYY-MM-DD`) the event falls on. */
  day: string
  durationSeconds: number
  /**
   * The project and task chosen for an earlier occurrence of the same recurring event, or else the first keyword rule
   * that matches the title; null when neither applies.
   */
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
  /** Checked in order; used only when the event has no remembered recurring-event work. */
  keywordRules?: readonly KeywordRule[]
  now: Date
}

const normalizeText = (text: string) => text.trim().toLocaleLowerCase()

/** The first rule whose keyword appears in the title, ignoring case and surrounding spaces. */
export function matchKeywordRule(title: string, rules: readonly KeywordRule[]): KeywordRule | null {
  const normalizedTitle = normalizeText(title)
  if (!normalizedTitle) return null
  return (
    rules.find(
      (rule) => rule.projectId && normalizeText(rule.keyword) && normalizedTitle.includes(normalizeText(rule.keyword)),
    ) ?? null
  )
}

/** Keeps the first event of each occurrence, so one meeting found in several calendars is suggested once. */
export function uniqueOccurrences(events: readonly CalendarEvent[]): CalendarEvent[] {
  const seen = new Set<string>()
  return events.filter((event) => {
    const key = event.occurrenceKey ?? `id:${event.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
  for (const event of uniqueOccurrences(events)) {
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
      work: (event.seriesId && context.seriesWork[event.seriesId]) || workFromRule(event.title, context.keywordRules),
    })
  }
  return suggestions.sort((a, b) => a.start.getTime() - b.start.getTime())
}

function workFromRule(title: string, rules: readonly KeywordRule[] = []): SeriesWork | null {
  const rule = matchKeywordRule(title, rules)
  return rule ? { projectId: rule.projectId, taskId: rule.taskId } : null
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
