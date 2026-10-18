import type { TimeEntry } from './timeEntries'
import { formatDuration, localDayBounds } from './dates'

export type ReportFilters = {
  startDay: string
  endDay: string
  userId: string
  clientId: string
  projectId: string
  taskId: string
  billable: '' | 'yes' | 'no'
}

/** Returns the start of the first local day and the exclusive end of the last one. */
export function reportRange(filters: Pick<ReportFilters, 'startDay' | 'endDay'>): [Date, Date] {
  const [start] = localDayBounds(filters.startDay)
  const [, end] = localDayBounds(filters.endDay)
  return [start, end]
}

// Firestore filters by date and user; these filters are applied after the read.
export function matchesFilters(entry: TimeEntry, filters: ReportFilters): boolean {
  return (!filters.clientId || entry.clientId === filters.clientId)
    && (!filters.projectId || entry.projectId === filters.projectId)
    && (!filters.taskId || entry.taskId === filters.taskId)
    && (!filters.billable || entry.billable === (filters.billable === 'yes'))
}

export function csvField(value: string | number | boolean | null | undefined): string {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function localDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function localDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(date)
}

export function csvHeader(timeZone: string): string {
  const headers = ['Date', 'User', 'Description', 'Client', 'Project', 'Task', `Start (${timeZone})`, `End (${timeZone})`, 'Duration', 'Billable']
  return headers.map(csvField).join(',')
}

/** Formats a completed entry as one CSV line, with dates in the report's time zone. */
export function csvRow(entry: TimeEntry & { endAt: NonNullable<TimeEntry['endAt']> }, timeZone: string): string {
  const start = entry.startAt.toDate()
  const end = entry.endAt.toDate()
  const seconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000))
  return [
    localDate(start, timeZone),
    entry.userDisplayName ?? entry.userId,
    entry.description,
    entry.clientName,
    entry.projectName,
    entry.taskName,
    localDateTime(start, timeZone),
    localDateTime(end, timeZone),
    formatDuration(seconds),
    entry.billable ? 'Yes' : 'No',
  ].map(csvField).join(',')
}
