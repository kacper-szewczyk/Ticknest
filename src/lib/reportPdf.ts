import type { Catalog } from './catalog'
import { formatElapsed } from './dates'
import {
  localDate,
  localDateTime,
  localTime,
  UNKNOWN_USER,
  type ReportFilters,
  type ReportMember,
} from './reportFormat'
import { entrySeconds, type GroupBy, GROUP_BY_OPTIONS, type ReportGroup } from './reportGroups'
import type { TimeEntry } from './timeEntries'

/** A PDF this long is already around 120 pages; past it, people should narrow the filters or use CSV. */
export const PDF_EXPORT_ROW_LIMIT = 5_000

export const PDF_ROW_LIMIT_MESSAGE = `This report has more than ${PDF_EXPORT_ROW_LIMIT.toLocaleString('en-US')} entries, which is too many for a PDF. Narrow the filters or use Export CSV instead.`

const EMPTY_CELL = '—'

export type ReportPdfInput = {
  workspaceName: string
  filters: Pick<ReportFilters, 'startDay' | 'endDay'>
  /** Human-readable active filters, e.g. "Client: Acme". */
  filterLabels: readonly string[]
  timeZone: string
  /** Defaults to now. */
  generatedAt?: Date
  groupBy: GroupBy
  groups: readonly ReportGroup[]
  /** Completed entries in report order (newest first). */
  entries: readonly TimeEntry[]
  userName: (entry: TimeEntry) => string
  /** Managers and owners see who tracked each entry; regular members only ever see their own. */
  showUser: boolean
}

export type ReportPdfSummaryRow = { cells: string[]; nested: boolean }

export type ReportPdfModel = {
  fileName: string
  title: string
  subtitle: string
  details: string[]
  totals: [label: string, value: string][]
  summaryTitle: string
  summaryHead: string[]
  summaryBody: ReportPdfSummaryRow[]
  entriesHead: string[]
  entriesBody: string[][]
}

export function reportPdfFileName(filters: Pick<ReportFilters, 'startDay' | 'endDay'>) {
  return `ticknest-report-${filters.startDay}-to-${filters.endDay}.pdf`
}

/** Names the active filters for the PDF header. Never includes raw IDs. */
export function describeReportFilters(
  filters: ReportFilters,
  catalog: Catalog,
  members: readonly ReportMember[],
  canSeeAllEntries: boolean,
): string[] {
  const labels: string[] = []
  if (canSeeAllEntries && filters.userId) {
    const member = members.find((item) => item.uid === filters.userId)
    labels.push(`Member: ${member?.displayName?.trim() || member?.email?.trim() || UNKNOWN_USER}`)
  }
  const named = (items: readonly { id: string; name: string }[], id: string, fallback: string) =>
    items.find((item) => item.id === id)?.name || fallback
  if (filters.clientId) labels.push(`Client: ${named(catalog.clients, filters.clientId, 'Unknown client')}`)
  if (filters.projectId) labels.push(`Project: ${named(catalog.projects, filters.projectId, 'Unknown project')}`)
  if (filters.taskId) labels.push(`Task: ${named(catalog.tasks, filters.taskId, 'Unknown task')}`)
  if (filters.billable) labels.push(filters.billable === 'yes' ? 'Billable only' : 'Non-billable only')
  return labels
}

function share(seconds: number, totalSeconds: number) {
  return `${totalSeconds > 0 ? Math.round((seconds / totalSeconds) * 100) : 0}%`
}

function summaryRow(group: ReportGroup, totalSeconds: number, nested: boolean): ReportPdfSummaryRow {
  return {
    nested,
    cells: [
      group.caption ? `${group.label} · ${group.caption}` : group.label,
      String(group.count),
      formatElapsed(group.billableSeconds),
      formatElapsed(group.seconds),
      share(group.seconds, totalSeconds),
    ],
  }
}

function entryRow(entry: TimeEntry, input: ReportPdfInput): string[] {
  const start = entry.startAt.toDate()
  const end = entry.endAt?.toDate() ?? start
  const startDay = localDate(start, input.timeZone)
  const endDay = localDate(end, input.timeZone)
  // An entry that runs past midnight names its end day too, so the time alone is not misleading.
  const endLabel = endDay === startDay ? localTime(end, input.timeZone) : `${endDay} ${localTime(end, input.timeZone)}`
  return [
    startDay,
    ...(input.showUser ? [input.userName(entry)] : []),
    entry.description || 'Untitled entry',
    entry.clientName || EMPTY_CELL,
    entry.projectName || EMPTY_CELL,
    entry.taskName || EMPTY_CELL,
    localTime(start, input.timeZone),
    endLabel,
    formatElapsed(entrySeconds(entry)),
    entry.billable ? 'Yes' : 'No',
  ]
}

/** Lays out everything the PDF shows. Kept free of the PDF library so it stays cheap to test. */
export function buildReportPdfModel(input: ReportPdfInput): ReportPdfModel {
  const totalSeconds = input.entries.reduce((total, entry) => total + entrySeconds(entry), 0)
  const billableSeconds = input.entries.reduce((total, entry) => total + (entry.billable ? entrySeconds(entry) : 0), 0)
  const groupLabel = GROUP_BY_OPTIONS.find((option) => option.value === input.groupBy)?.label ?? 'Day'
  return {
    fileName: reportPdfFileName(input.filters),
    title: input.workspaceName.trim() || 'Ticknest',
    subtitle: `Time report · ${input.filters.startDay} to ${input.filters.endDay}`,
    details: [
      `Time zone: ${input.timeZone}`,
      `Generated: ${localDateTime(input.generatedAt ?? new Date(), input.timeZone)}`,
      `Filters: ${input.filterLabels.length > 0 ? input.filterLabels.join(', ') : 'None'}`,
    ],
    totals: [
      ['Total tracked', formatElapsed(totalSeconds)],
      ['Billable', formatElapsed(billableSeconds)],
      ['Entries', input.entries.length.toLocaleString('en-US')],
    ],
    summaryTitle: `Summary by ${groupLabel.toLowerCase()}`,
    summaryHead: [groupLabel, 'Entries', 'Billable', 'Total', 'Share'],
    summaryBody: input.groups.flatMap((group) => [
      summaryRow(group, totalSeconds, false),
      ...(group.children ?? []).map((child) => summaryRow(child, totalSeconds, true)),
    ]),
    entriesHead: [
      'Date',
      ...(input.showUser ? ['User'] : []),
      'Description',
      'Client',
      'Project',
      'Task',
      'Start',
      'End',
      'Duration',
      'Billable',
    ],
    entriesBody: input.entries.map((entry) => entryRow(entry, input)),
  }
}
