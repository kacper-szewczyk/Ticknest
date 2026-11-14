import { localDayBounds, shiftDayString } from './dates'

/** The parts of a time entry the Timesheet summary needs; `TimeEntry` satisfies it. */
export type SummaryEntry = {
  id: string
  userId: string
  clientName: string | null
  projectName: string | null
  billable: boolean
  startAt: { toMillis(): number }
  endAt: { toMillis(): number } | null
}

/** `label` is "Client · Project", or empty for entries with neither, which the UI names in the active language. */
export type SummaryGroup = { label: string; seconds: number }

export type DaySummary = {
  count: number
  totalSeconds: number
  billableSeconds: number
  isRunning: boolean
  /** The biggest client/project groups by time, largest first. */
  topGroups: SummaryGroup[]
  /** How many groups are left out of `topGroups`. */
  moreGroups: number
}

export const DAY_SECONDS = 24 * 60 * 60

function endMillis(entry: SummaryEntry, nowMs: number): number {
  return entry.endAt ? entry.endAt.toMillis() : nowMs
}

/** Whole seconds an entry has run; a running entry counts up to `nowMs`. */
export function entrySeconds(entry: SummaryEntry, nowMs: number): number {
  return Math.max(0, Math.floor((endMillis(entry, nowMs) - entry.startAt.toMillis()) / 1000))
}

function secondsWithin(entry: SummaryEntry, fromMs: number, toMs: number, nowMs: number): number {
  const start = Math.max(entry.startAt.toMillis(), fromMs)
  const end = Math.min(endMillis(entry, nowMs), toMs)
  return Math.max(0, Math.floor((end - start) / 1000))
}

function groupLabel(entry: SummaryEntry): string {
  return [entry.clientName, entry.projectName].filter(Boolean).join(' · ')
}

/** Totals, billable time, running state, and the top client/project groups for one day's entries. */
export function summarizeDay(entries: SummaryEntry[], nowMs: number, maxGroups = 2): DaySummary {
  const groups = new Map<string, number>()
  let totalSeconds = 0
  let billableSeconds = 0
  for (const entry of entries) {
    const seconds = entrySeconds(entry, nowMs)
    totalSeconds += seconds
    if (entry.billable) billableSeconds += seconds
    const label = groupLabel(entry)
    groups.set(label, (groups.get(label) ?? 0) + seconds)
  }
  const sorted = [...groups]
    .map(([label, seconds]) => ({ label, seconds }))
    .sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label))
  return {
    count: entries.length,
    totalSeconds,
    billableSeconds,
    isRunning: entries.some((entry) => entry.endAt === null),
    topGroups: sorted.slice(0, maxGroups),
    moreGroups: Math.max(0, sorted.length - maxGroups),
  }
}

function anyPersonOver(
  entries: SummaryEntry[],
  fromMs: number,
  toMs: number,
  nowMs: number,
  limitSeconds: number,
): boolean {
  const perPerson = new Map<string, number>()
  for (const entry of entries) {
    perPerson.set(entry.userId, (perPerson.get(entry.userId) ?? 0) + secondsWithin(entry, fromMs, toMs, nowMs))
  }
  return [...perPerson.values()].some((seconds) => seconds > limitSeconds)
}

/**
 * Whether one person's time inside a local day (midnight to midnight) adds up to more than 24 hours.
 * Pass every entry that may touch the day: an entry crossing midnight only counts its part inside the day.
 * People are counted apart, so an owner's view of several members does not trip it.
 */
export function isDayOverLimit(entries: SummaryEntry[], day: string, nowMs: number): boolean {
  const [start, end] = localDayBounds(day)
  return anyPersonOver(entries, start.getTime(), end.getTime(), nowMs, DAY_SECONDS)
}

/** Whether one person's time inside the week adds up to more than 24 hours for each of its days. */
export function isWeekOverLimit(entries: SummaryEntry[], weekStart: string, days: number, nowMs: number): boolean {
  const [start] = localDayBounds(weekStart)
  const [end] = localDayBounds(shiftDayString(weekStart, days))
  return anyPersonOver(entries, start.getTime(), end.getTime(), nowMs, DAY_SECONDS * days)
}

/** IDs of entries that overlap another entry of the same person; entries that only touch do not overlap. */
export function overlappingEntryIds(entries: SummaryEntry[], nowMs: number): Set<string> {
  const ids = new Set<string>()
  const byPerson = new Map<string, SummaryEntry[]>()
  for (const entry of entries) byPerson.set(entry.userId, [...(byPerson.get(entry.userId) ?? []), entry])
  for (const personEntries of byPerson.values()) {
    const sorted = [...personEntries].sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())
    // Sweep by start time, tracking the entry that reaches furthest so far.
    let furthest: SummaryEntry | null = null
    for (const entry of sorted) {
      if (furthest && entry.startAt.toMillis() < endMillis(furthest, nowMs)) {
        ids.add(entry.id)
        ids.add(furthest.id)
      }
      if (!furthest || endMillis(entry, nowMs) > endMillis(furthest, nowMs)) furthest = entry
    }
  }
  return ids
}

/** Formats seconds as hours and minutes, such as `4:15`, for compact summaries. */
export function formatHoursMinutes(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}:${minutes.toString().padStart(2, '0')}`
}
