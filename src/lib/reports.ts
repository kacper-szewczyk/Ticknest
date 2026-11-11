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
import {
  csvHeader,
  csvRow,
  matchesFilters,
  reportRange,
  reportUserName,
  type ReportFilters,
  type ReportMember,
} from './reportFormat'

const SUMMARY_BATCH_SIZE = 250
export const IN_MEMORY_EXPORT_ROW_LIMIT = 20_000

function constraints(
  workspaceId: string,
  canSeeAllEntries: boolean,
  currentUserId: string,
  filters: ReportFilters,
  batchSize: number,
  cursor?: QueryDocumentSnapshot,
) {
  const [start, end] = reportRange(filters)
  const queryParts: QueryConstraint[] = [
    where('startAt', '>=', Timestamp.fromDate(start)),
    where('startAt', '<', Timestamp.fromDate(end)),
    orderBy('startAt', 'desc'),
  ]
  const selectedUserId = canSeeAllEntries ? filters.userId : currentUserId
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
  canSeeAllEntries: boolean,
  currentUserId: string,
  filters: ReportFilters,
  timeZone: string,
  members: readonly ReportMember[],
  onChunk: (chunk: string, rowCount: number) => Promise<void>,
  onProgress: (rows: number) => void,
): Promise<number> {
  const timezone = timeZone || 'UTC'
  await onChunk(`\uFEFF${csvHeader(timezone)}\r\n`, 0)

  let cursor: QueryDocumentSnapshot | undefined
  let totalRows = 0
  do {
    const snapshot = await getDocs(
      constraints(workspaceId, canSeeAllEntries, currentUserId, filters, SUMMARY_BATCH_SIZE, cursor),
    )
    const lines: string[] = []
    for (const document of snapshot.docs) {
      const entry = toEntry(document)
      if (entry.endAt === null || !matchesFilters(entry, filters)) continue
      lines.push(csvRow({ ...entry, endAt: entry.endAt }, timezone, reportUserName(entry, members)))
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

export async function loadReportSummary(
  workspaceId: string,
  canSeeAllEntries: boolean,
  currentUserId: string,
  filters: ReportFilters,
  onProgress: (entries: TimeEntry[]) => void,
) {
  let cursor: QueryDocumentSnapshot | undefined
  do {
    const snapshot = await getDocs(
      constraints(workspaceId, canSeeAllEntries, currentUserId, filters, SUMMARY_BATCH_SIZE, cursor),
    )
    onProgress(snapshot.docs.map(toEntry).filter((entry) => entry.endAt !== null && matchesFilters(entry, filters)))
    cursor = snapshot.docs.length === SUMMARY_BATCH_SIZE ? snapshot.docs[snapshot.docs.length - 1] : undefined
  } while (cursor)
}
