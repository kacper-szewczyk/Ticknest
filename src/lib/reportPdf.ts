import { currentLanguage, i18n } from '../i18n'
import type { Catalog } from './catalog'
import { formatElapsed } from './dates'
import { localDate, localDateTime, localTime, unknownUser, type ReportFilters, type ReportMember } from './reportFormat'
import { entrySeconds, groupByLabel, type GroupBy, type ReportGroup } from './reportGroups'
import type { TimeEntry } from './timeEntries'

/** A PDF this long is already around 120 pages; past it, people should narrow the filters or use CSV. */
export const PDF_EXPORT_ROW_LIMIT = 5_000

/** Shown instead of exporting when the report has more entries than {@link PDF_EXPORT_ROW_LIMIT}. */
export function pdfRowLimitMessage(): string {
  return i18n.t('reports.export.pdfRowLimit', { limit: PDF_EXPORT_ROW_LIMIT })
}

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
  entriesTitle: string
  entriesHead: string[]
  entriesBody: string[][]
  /** Index of the duration column in `entriesHead`, which the renderer right-aligns. */
  durationColumn: number
  /** Placeholder cell for an empty table. */
  noEntries: string
  /** Footer page label, e.g. "Page 2 of 9". */
  pageLabel: (page: number, pages: number) => string
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
  const { t } = i18n
  const labels: string[] = []
  if (canSeeAllEntries && filters.userId) {
    const member = members.find((item) => item.uid === filters.userId)
    labels.push(
      t('reports.pdf.memberFilter', {
        name: member?.displayName?.trim() || member?.email?.trim() || unknownUser(),
      }),
    )
  }
  const named = (items: readonly { id: string; name: string }[], id: string, fallback: string) =>
    items.find((item) => item.id === id)?.name || fallback
  if (filters.clientId)
    labels.push(
      t('reports.pdf.clientFilter', { name: named(catalog.clients, filters.clientId, t('reports.pdf.unknownClient')) }),
    )
  if (filters.projectId)
    labels.push(
      t('reports.pdf.projectFilter', {
        name: named(catalog.projects, filters.projectId, t('reports.pdf.unknownProject')),
      }),
    )
  if (filters.taskId)
    labels.push(
      t('reports.pdf.taskFilter', { name: named(catalog.tasks, filters.taskId, t('reports.pdf.unknownTask')) }),
    )
  if (filters.billable)
    labels.push(filters.billable === 'yes' ? t('reports.pdf.billableOnly') : t('reports.pdf.nonBillableOnly'))
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
    entry.description || i18n.t('common.untitledEntry'),
    entry.clientName || EMPTY_CELL,
    entry.projectName || EMPTY_CELL,
    entry.taskName || EMPTY_CELL,
    localTime(start, input.timeZone),
    endLabel,
    formatElapsed(entrySeconds(entry)),
    entry.billable ? i18n.t('reports.yes') : i18n.t('reports.no'),
  ]
}

/** Lays out everything the PDF shows. Kept free of the PDF library so it stays cheap to test. */
export function buildReportPdfModel(input: ReportPdfInput): ReportPdfModel {
  const { t } = i18n
  const totalSeconds = input.entries.reduce((total, entry) => total + entrySeconds(entry), 0)
  const billableSeconds = input.entries.reduce((total, entry) => total + (entry.billable ? entrySeconds(entry) : 0), 0)
  const entriesHead = [
    t('reports.columns.date'),
    ...(input.showUser ? [t('reports.columns.user')] : []),
    t('reports.columns.description'),
    t('reports.columns.client'),
    t('reports.columns.project'),
    t('reports.columns.task'),
    t('reports.columns.start'),
    t('reports.columns.end'),
    t('reports.columns.duration'),
    t('reports.columns.billable'),
  ]
  return {
    fileName: reportPdfFileName(input.filters),
    title: input.workspaceName.trim() || 'Ticknest',
    subtitle: t('reports.pdf.subtitle', { start: input.filters.startDay, end: input.filters.endDay }),
    details: [
      t('reports.pdf.timeZone', { timeZone: input.timeZone }),
      t('reports.pdf.generated', { date: localDateTime(input.generatedAt ?? new Date(), input.timeZone) }),
      t('reports.pdf.filters', {
        filters: input.filterLabels.length > 0 ? input.filterLabels.join(', ') : t('reports.pdf.noFilters'),
      }),
    ],
    totals: [
      [t('reports.totals.totalTracked'), formatElapsed(totalSeconds)],
      [t('reports.totals.billable'), formatElapsed(billableSeconds)],
      [t('reports.totals.entries'), input.entries.length.toLocaleString(currentLanguage())],
    ],
    summaryTitle: t(`reports.pdf.summaryBy.${input.groupBy}`),
    summaryHead: [
      groupByLabel(input.groupBy),
      t('reports.columns.entries'),
      t('reports.totals.billable'),
      t('reports.columns.total'),
      t('reports.columns.share'),
    ],
    summaryBody: input.groups.flatMap((group) => [
      summaryRow(group, totalSeconds, false),
      ...(group.children ?? []).map((child) => summaryRow(child, totalSeconds, true)),
    ]),
    entriesTitle: t('reports.pdf.detailedEntries'),
    entriesHead,
    entriesBody: input.entries.map((entry) => entryRow(entry, input)),
    durationColumn: entriesHead.length - 2,
    noEntries: t('reports.pdf.noEntries'),
    pageLabel: (page, pages) => t('reports.pdf.page', { page, pages }),
  }
}
