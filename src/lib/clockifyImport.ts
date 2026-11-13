// Clockify CSV import for the web app: builds the preview from a parsed file and sends the rows to the
// importTimeEntries callable in chunks. Parsing and catalog matching come from the module the callable uses.
import {
  type CatalogPlan,
  type ClockifyRow,
  type DateOrder,
  type ImportCatalog,
  type ImportSkipReason,
  type RowProblem,
  IMPORT_CHUNK_SIZE,
  MAX_IMPORT_ROWS,
  detectDateOrder,
  findColumns,
  findOverlappingLines,
  parseCsv,
  planCatalog,
  readClockifyRows,
} from '../../functions/src/import/clockifyCsv'
import type { Catalog } from './catalog'
import { callFunction } from './firebase'
import type { WorkspaceMember } from './workspaces'

export type { CatalogPlan, DateOrder, ImportSkipReason, RowProblem }

/** A file read into its header columns and data rows, before dates are interpreted. */
export type ClockifyFile = {
  dataRows: string[][]
  columns: ReturnType<typeof findColumns>['columns']
  /** The date order the file's dates can only be read in, or `null` when the user must choose. */
  detectedDateOrder: DateOrder | null
}

export type ClockifyFileError =
  { kind: 'empty' } | { kind: 'missingColumns'; columns: string[] } | { kind: 'tooManyRows'; max: number }

/** Splits the CSV text and finds the Clockify columns. */
export function readClockifyFile(
  text: string,
): { ok: true; file: ClockifyFile } | { ok: false; error: ClockifyFileError } {
  const [header, ...dataRows] = parseCsv(text)
  if (!header || dataRows.length === 0) return { ok: false, error: { kind: 'empty' } }
  const { columns, missing } = findColumns(header)
  if (missing.length > 0) return { ok: false, error: { kind: 'missingColumns', columns: missing } }
  if (dataRows.length > MAX_IMPORT_ROWS) return { ok: false, error: { kind: 'tooManyRows', max: MAX_IMPORT_ROWS } }
  const dates = dataRows.flatMap((cells) => [cells[columns.startDate] ?? '', cells[columns.endDate] ?? ''])
  return { ok: true, file: { dataRows, columns, detectedDateOrder: detectDateOrder(dates) } }
}

/** What to do with rows whose email is not an active workspace member. */
export type UnknownUserPolicy = 'skip' | 'assign-to-me'

export type ImportUser = {
  email: string
  /** The name in the export, shown next to the email. */
  name: string
  rowCount: number
  member: Pick<WorkspaceMember, 'uid' | 'displayName'> | null
}

export type PlannedRow = Omit<ClockifyRow, 'email' | 'userName'> & { userId: string }

export type ImportPlan = {
  /** Rows that will be sent, in start order. */
  rows: PlannedRow[]
  /** Rows that will not be sent, with the reason, in line order. */
  problems: RowProblem[]
  users: ImportUser[]
  catalog: CatalogPlan
  /** Rows imported with a description or name shortened to fit. */
  shortenedCount: number
  totalSeconds: number
}

export type ImportPlanOptions = {
  dateOrder: DateOrder
  timeZone: string
  unknownUsers: UnknownUserPolicy
  /** The member running the import, who receives rows of unknown users with `assign-to-me`. */
  importerUid: string
}

export function toImportCatalog(catalog: Catalog): ImportCatalog {
  return {
    clients: catalog.clients,
    projects: catalog.projects.map((project) => ({ ...project, clientId: project.clientId ?? null })),
    tasks: catalog.tasks,
  }
}

/** The preview: which rows will be imported for whom, what will be created, and which rows are skipped and why. */
export function buildImportPlan(
  file: ClockifyFile,
  members: WorkspaceMember[],
  catalog: Catalog,
  options: ImportPlanOptions,
): ImportPlan {
  const { rows, problems } = readClockifyRows(file.dataRows, file.columns, options)
  const memberByEmail = new Map(
    members
      .filter((member) => member.status !== 'removed')
      .map((member) => [member.email.trim().toLowerCase(), member]),
  )

  const users = new Map<string, ImportUser>()
  const assigned: PlannedRow[] = []
  for (const { email, userName, ...row } of rows) {
    const member = memberByEmail.get(email) ?? null
    const user = users.get(email) ?? {
      email,
      name: userName,
      rowCount: 0,
      member: member && { uid: member.uid, displayName: member.displayName },
    }
    user.rowCount += 1
    users.set(email, user)
    const userId = member?.uid ?? (options.unknownUsers === 'assign-to-me' ? options.importerUid : null)
    if (userId) assigned.push({ ...row, userId })
    else problems.push({ line: row.line, reason: 'unknownUser' })
  }

  const overlapping = findOverlappingLines(assigned)
  for (const line of overlapping) problems.push({ line, reason: 'overlapsFile' })
  const planned = assigned
    .filter((row) => !overlapping.has(row.line))
    .sort((a, b) => a.startAt - b.startAt || a.line - b.line)

  return {
    rows: planned,
    problems: problems.sort((a, b) => a.line - b.line),
    users: [...users.values()].sort((a, b) => a.email.localeCompare(b.email)),
    catalog: planCatalog(toImportCatalog(catalog), planned),
    shortenedCount: planned.filter((row) => row.shortened).length,
    totalSeconds: planned.reduce((total, row) => total + Math.round((row.endAt - row.startAt) / 1000), 0),
  }
}

type ImportRowResult =
  { line: number; status: 'imported' } | { line: number; status: 'skipped'; reason: ImportSkipReason }
type ImportResponse = { results: ImportRowResult[]; created: { clients: number; projects: number; tasks: number } }

export type ImportReport = {
  importedCount: number
  importedSeconds: number
  /** Rows not imported: those left out by the preview and those the server skipped, in line order. */
  skipped: RowProblem[]
  created: { clients: number; projects: number; tasks: number }
  /** Rows not sent because the import stopped with an error. */
  notSentCount: number
}

/**
 * Sends the plan's rows in chunks, one call at a time, and reports progress after each. When a call fails the
 * import stops; the report covers the chunks already sent and the error is returned so the user can retry.
 * Retrying is safe: rows already imported overlap themselves and are skipped.
 */
export async function runImport(
  workspaceId: string,
  plan: ImportPlan,
  onProgress: (sentRows: number) => void,
): Promise<{ report: ImportReport; error: unknown }> {
  const report: ImportReport = {
    importedCount: 0,
    importedSeconds: 0,
    skipped: [...plan.problems],
    created: { clients: 0, projects: 0, tasks: 0 },
    notSentCount: plan.rows.length,
  }
  const byLine = new Map(plan.rows.map((row) => [row.line, row]))
  for (let start = 0; start < plan.rows.length; start += IMPORT_CHUNK_SIZE) {
    const chunk = plan.rows.slice(start, start + IMPORT_CHUNK_SIZE)
    let response: ImportResponse
    try {
      response = await callFunction<{ workspaceId: string; rows: unknown[] }, ImportResponse>('importTimeEntries', {
        workspaceId,
        rows: chunk.map((row) => ({
          line: row.line,
          userId: row.userId,
          clientName: row.clientName,
          projectName: row.projectName,
          taskName: row.taskName,
          description: row.description,
          billable: row.billable,
          startAt: row.startAt,
          endAt: row.endAt,
        })),
      })
    } catch (error) {
      report.skipped.sort((a, b) => a.line - b.line)
      return { report, error }
    }
    for (const result of response.results) {
      if (result.status === 'imported') {
        const row = byLine.get(result.line)
        report.importedCount += 1
        if (row) report.importedSeconds += Math.round((row.endAt - row.startAt) / 1000)
      } else {
        report.skipped.push({ line: result.line, reason: result.reason })
      }
    }
    report.created.clients += response.created.clients
    report.created.projects += response.created.projects
    report.created.tasks += response.created.tasks
    report.notSentCount -= chunk.length
    onProgress(start + chunk.length)
  }
  report.skipped.sort((a, b) => a.line - b.line)
  return { report, error: null }
}

/** Every IANA time zone this browser knows, for the time zone picker. */
export function availableTimeZones(current: string): string[] {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return zones.includes(current) ? zones : [current, ...zones]
}
