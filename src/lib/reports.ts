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
import { csvHeader, csvRow, matchesFilters, reportRange, type ReportFilters } from './reportFormat'

const PAGE_SIZE = 25
const SUMMARY_BATCH_SIZE = 250
export const IN_MEMORY_EXPORT_ROW_LIMIT = 20_000

function constraints(workspaceId: string, isOwner: boolean, currentUserId: string, filters: ReportFilters, batchSize: number, cursor?: QueryDocumentSnapshot) {
  const [start, end] = reportRange(filters)
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
  await onChunk(`\uFEFF${csvHeader(timezone)}\r\n`, 0)

  let cursor: QueryDocumentSnapshot | undefined
  let totalRows = 0
  do {
    const snapshot = await getDocs(constraints(workspaceId, isOwner, currentUserId, filters, SUMMARY_BATCH_SIZE, cursor))
    const lines: string[] = []
    for (const document of snapshot.docs) {
      const entry = toEntry(document)
      if (entry.endAt === null || !matchesFilters(entry, filters)) continue
      lines.push(csvRow({ ...entry, endAt: entry.endAt }, timezone))
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

export async function loadReportPage(workspaceId: string, isOwner: boolean, currentUserId: string, filters: ReportFilters, cursor?: QueryDocumentSnapshot) {
  let nextCursor = cursor
  let exhausted = false
  const entries: TimeEntry[] = []
  while (entries.length < PAGE_SIZE && !exhausted) {
    const snapshot = await getDocs(constraints(workspaceId, isOwner, currentUserId, filters, SUMMARY_BATCH_SIZE, nextCursor))
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

export async function loadReportSummary(workspaceId: string, isOwner: boolean, currentUserId: string, filters: ReportFilters, onProgress: (entries: TimeEntry[]) => void) {
  let cursor: QueryDocumentSnapshot | undefined
  do {
    const snapshot = await getDocs(constraints(workspaceId, isOwner, currentUserId, filters, SUMMARY_BATCH_SIZE, cursor))
    onProgress(snapshot.docs.map(toEntry).filter((entry) => entry.endAt !== null && matchesFilters(entry, filters)))
    cursor = snapshot.docs.length === SUMMARY_BATCH_SIZE ? snapshot.docs[snapshot.docs.length - 1] : undefined
  } while (cursor)
}
