import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type QueryDocumentSnapshot,
  type QueryConstraint,
} from 'firebase/firestore'
import { db } from './firebase'
import type { TimeEntry } from './timeEntries'

export type ReportFilters = {
  startDay: string
  endDay: string
  userId: string
  clientId: string
  projectId: string
  taskId: string
  billable: '' | 'yes' | 'no'
}

const PAGE_SIZE = 25
const SUMMARY_BATCH_SIZE = 250
export const IN_MEMORY_EXPORT_ROW_LIMIT = 20_000

function constraints(
  workspaceId: string,
  isOwner: boolean,
  currentUserId: string,
  filters: ReportFilters,
  batchSize: number,
  cursor?: QueryDocumentSnapshot,
) {
  const [startYear, startMonth, startDate] = filters.startDay.split('-').map(Number)
  const [endYear, endMonth, endDate] = filters.endDay.split('-').map(Number)
  const start = new Date(startYear, startMonth - 1, startDate)
  const end = new Date(endYear, endMonth - 1, endDate + 1)
  const queryParts: QueryConstraint[] = [
    where('startAt', '>=', Timestamp.fromDate(start)),
    where('startAt', '<', Timestamp.fromDate(end)),
    orderBy('startAt', 'desc'),
  ]
  const selectedUserId = isOwner ? filters.userId : currentUserId
  if (selectedUserId) queryParts.push(where('userId', '==', selectedUserId))
  if (cursor) queryParts.push(startAfter(cursor))
  queryParts.push(limit(batchSize))
  return query(collection(db, 'workspaces', workspaceId, 'timeEntries'), ...queryParts)
}

function toEntry(snapshot: QueryDocumentSnapshot): TimeEntry {
  return { id: snapshot.id, ...snapshot.data() } as TimeEntry
}

function matchesFilters(entry: TimeEntry, filters: ReportFilters) {
  return (
    (!filters.clientId || entry.clientId === filters.clientId) &&
    (!filters.projectId || entry.projectId === filters.projectId) &&
    (!filters.taskId || entry.taskId === filters.taskId) &&
    (!filters.billable || entry.billable === (filters.billable === 'yes'))
  )
}

function csvField(value: string | number | boolean | null | undefined): string {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function localDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function localDateTime(date: Date, timeZone: string): string {
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

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, '0')
  const minutes = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0')
  const remainder = (seconds % 60).toString().padStart(2, '0')
  return `${hours}:${minutes}:${remainder}`
}

export async function streamReportCsv(
  workspaceId: string,
  isOwner: boolean,
  currentUserId: string,
  filters: ReportFilters,
  timeZone: string,
  onChunk: (chunk: string, rowCount: number) => Promise<void>,
  onProgress: (rows: number) => void,
): Promise<number> {
  const timezone = timeZone || 'UTC'
  const timezoneSuffix = timezone === 'UTC' ? 'UTC' : timezone
  const headers = [
    'Date',
    'User',
    'Description',
    'Client',
    'Project',
    'Task',
    `Start (${timezoneSuffix})`,
    `End (${timezoneSuffix})`,
    'Duration',
    'Billable',
  ]
  await onChunk(`\uFEFF${headers.map(csvField).join(',')}\r\n`, 0)

  let cursor: QueryDocumentSnapshot | undefined
  let totalRows = 0
  do {
    const snapshot = await getDocs(
      constraints(workspaceId, isOwner, currentUserId, filters, SUMMARY_BATCH_SIZE, cursor),
    )
    const lines: string[] = []
    for (const document of snapshot.docs) {
      const entry = toEntry(document)
      if (entry.endAt === null || !matchesFilters(entry, filters)) continue
      const start = entry.startAt.toDate()
      const end = entry.endAt.toDate()
      const seconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000))
      lines.push(
        [
          localDate(start, timezone),
          entry.userDisplayName ?? entry.userId,
          entry.description,
          entry.clientName,
          entry.projectName,
          entry.taskName,
          localDateTime(start, timezone),
          localDateTime(end, timezone),
          formatDuration(seconds),
          entry.billable ? 'Yes' : 'No',
        ]
          .map(csvField)
          .join(','),
      )
    }
    if (lines.length > 0) {
      totalRows += lines.length
      await onChunk(`${lines.join('\r\n')}\r\n`, lines.length)
      onProgress(totalRows)
    }
    cursor = snapshot.docs.length === SUMMARY_BATCH_SIZE ? snapshot.docs[snapshot.docs.length - 1] : undefined
  } while (cursor)
  return totalRows
}

export async function loadReportPage(
  workspaceId: string,
  isOwner: boolean,
  currentUserId: string,
  filters: ReportFilters,
  cursor?: QueryDocumentSnapshot,
) {
  let nextCursor = cursor
  let exhausted = false
  const entries: TimeEntry[] = []
  while (entries.length < PAGE_SIZE && !exhausted) {
    const snapshot = await getDocs(
      constraints(workspaceId, isOwner, currentUserId, filters, SUMMARY_BATCH_SIZE, nextCursor),
    )
    const docs = snapshot.docs
    let reachedPageSize = false
    for (const document of docs) {
      const entry = toEntry(document)
      if (entry.endAt !== null && matchesFilters(entry, filters)) entries.push(entry)
      if (entries.length === PAGE_SIZE) {
        nextCursor = document
        reachedPageSize = true
        break
      }
    }
    if (reachedPageSize) break
    exhausted = docs.length < SUMMARY_BATCH_SIZE
    nextCursor = docs.length === SUMMARY_BATCH_SIZE ? docs[docs.length - 1] : undefined
  }
  return {
    entries: entries.slice(0, PAGE_SIZE),
    cursor: nextCursor,
  }
}

export async function loadReportSummary(
  workspaceId: string,
  isOwner: boolean,
  currentUserId: string,
  filters: ReportFilters,
  onProgress: (entries: TimeEntry[]) => void,
) {
  let cursor: QueryDocumentSnapshot | undefined
  do {
    const snapshot = await getDocs(
      constraints(workspaceId, isOwner, currentUserId, filters, SUMMARY_BATCH_SIZE, cursor),
    )
    onProgress(snapshot.docs.map(toEntry).filter((entry) => entry.endAt !== null && matchesFilters(entry, filters)))
    cursor = snapshot.docs.length === SUMMARY_BATCH_SIZE ? snapshot.docs[snapshot.docs.length - 1] : undefined
  } while (cursor)
}
