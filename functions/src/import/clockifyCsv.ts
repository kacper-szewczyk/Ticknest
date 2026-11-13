// Pure rules for importing a Clockify "Detailed report" CSV export. The web app parses the file and builds the
// preview with this module; the importTimeEntries callable re-checks each row and matches the catalog with the same
// functions, so the preview and the import agree. Keep it free of Admin SDK and browser-only imports.

/** Longest text stored on an entry and in a catalog name snapshot (see firestore.rules). */
export const MAX_IMPORT_DESCRIPTION_LENGTH = 500
export const MAX_IMPORT_NAME_LENGTH = 100
/** Rows sent per importTimeEntries call. Leaves room under Firestore's 500 writes per transaction. */
export const IMPORT_CHUNK_SIZE = 200
/** Largest file the web app accepts, in rows. */
export const MAX_IMPORT_ROWS = 50_000
/** Color of projects the import creates; the same as DEFAULT_PROJECT_COLOR in the web app. */
export const DEFAULT_IMPORT_PROJECT_COLOR = '#668a6b'

/** Clockify writes this placeholder instead of an empty description in some exports. */
const EMPTY_DESCRIPTION_PLACEHOLDER = '(Without Description)'

export type DateOrder = 'dmy' | 'mdy' | 'ymd'

/** Why a row was not imported. The web app shows a translated sentence for each. */
export type ImportSkipReason =
  | 'invalidDate'
  | 'invalidTime'
  | 'endNotAfterStart'
  | 'missingEmail'
  | 'taskWithoutProject'
  | 'unknownUser'
  | 'overlapsFile'
  | 'overlapsExisting'
  | 'overlapsRunningTimer'
  | 'invalidRow'

/** A CSV row turned into instants and names, before users are matched. */
export type ClockifyRow = {
  /** 1-based line in the file, counting the header as line 1. */
  line: number
  email: string
  userName: string
  clientName: string | null
  projectName: string | null
  taskName: string | null
  description: string
  billable: boolean
  startAt: number
  endAt: number
  /** True when the description or a name was longer than Ticknest stores and was shortened. */
  shortened: boolean
}

export type RowProblem = { line: number; reason: ImportSkipReason }

const COLUMNS = {
  project: 'project',
  client: 'client',
  description: 'description',
  task: 'task',
  user: 'user',
  email: 'email',
  billable: 'billable',
  startDate: 'start date',
  startTime: 'start time',
  endDate: 'end date',
  endTime: 'end time',
} as const
type ColumnKey = keyof typeof COLUMNS
export type ColumnIndexes = Record<ColumnKey, number>
const REQUIRED_COLUMNS: ColumnKey[] = ['email', 'startDate', 'startTime', 'endDate', 'endTime']

/**
 * Splits CSV text into rows of fields (RFC 4180: quoted fields, doubled quotes, line breaks inside quotes).
 * The delimiter is a comma, or a semicolon when the header line has more semicolons than commas.
 */
export function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const firstLine = source.slice(0, source.search(/\r?\n|$/))
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (inQuotes) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // Blank lines (for example a trailing newline) are not rows.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

/** Finds the columns by their English header names, ignoring case. `missing` lists required columns not found. */
export function findColumns(header: string[]): { columns: ColumnIndexes; missing: string[] } {
  const normalized = header.map((cell) => cell.trim().toLowerCase())
  const columns = Object.fromEntries(
    (Object.keys(COLUMNS) as ColumnKey[]).map((key) => [key, normalized.indexOf(COLUMNS[key])]),
  ) as ColumnIndexes
  const missing = REQUIRED_COLUMNS.filter((key) => columns[key] === -1).map((key) =>
    COLUMNS[key].replace(/\b\w/g, (letter) => letter.toUpperCase()),
  )
  return { columns, missing }
}

function splitDate(value: string): [string, string, string] | null {
  const parts = value.trim().split(/[./-]/)
  return parts.length === 3 && parts.every((part) => /^\d{1,4}$/.test(part)) ? [parts[0], parts[1], parts[2]] : null
}

/**
 * The date order the dates use, worked out from values that can only be read one way (a day above 12, or a
 * four-digit year first). `null` when every date is ambiguous or they contradict each other: ask the user.
 */
export function detectDateOrder(values: string[]): DateOrder | null {
  let firstAbove12 = false
  let secondAbove12 = false
  let yearFirst = false
  for (const value of values) {
    const parts = splitDate(value)
    if (!parts) continue
    if (parts[0].length === 4) yearFirst = true
    else if (Number(parts[0]) > 12) firstAbove12 = true
    else if (Number(parts[1]) > 12) secondAbove12 = true
  }
  if (yearFirst) return firstAbove12 || secondAbove12 ? null : 'ymd'
  if (firstAbove12 && secondAbove12) return null
  if (firstAbove12) return 'dmy'
  if (secondAbove12) return 'mdy'
  return null
}

/** Year, month and day of a date in `order`, or `null` for an invalid date such as 31/02/2026. */
export function parseDate(value: string, order: DateOrder): { year: number; month: number; day: number } | null {
  const parts = splitDate(value)
  if (!parts) return null
  const [first, second, third] = parts.map(Number)
  const [year, month, day] =
    order === 'ymd' ? [first, second, third] : order === 'dmy' ? [third, second, first] : [third, first, second]
  if (year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1) return null
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null
  return { year, month, day }
}

/** Hours, minutes and seconds of `13:05`, `13:05:09` or `1:05:09 PM`, or `null` when invalid. */
export function parseTime(value: string): { hour: number; minute: number; second: number } | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(value.trim())
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  const second = match[3] === undefined ? 0 : Number(match[3])
  const meridiem = match[4]?.toLowerCase()
  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    hour = (hour % 12) + (meridiem === 'pm' ? 12 : 0)
  }
  if (hour > 23 || minute > 59 || second > 59) return null
  return { hour, minute, second }
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>()

/** Milliseconds `timeZone` is ahead of UTC at `instantMs`. */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  let formatter = offsetFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    offsetFormatters.set(timeZone, formatter)
  }
  const parts = Object.fromEntries(formatter.formatToParts(new Date(instantMs)).map((part) => [part.type, part.value]))
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return asUtc - Math.floor(instantMs / 1000) * 1000
}

/**
 * The instant a wall-clock time occurs in `timeZone`. In a daylight-saving gap the time is read with the offset
 * from before the change; in a repeated hour the first occurrence is used.
 */
export function zonedTimeToUtc(
  date: { year: number; month: number; day: number },
  time: { hour: number; minute: number; second: number },
  timeZone: string,
): number {
  const wallClockAsUtc = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute, time.second)
  const guess = wallClockAsUtc - zoneOffsetMs(wallClockAsUtc, timeZone)
  // A second pass corrects the guess when a daylight-saving change falls between the wall-clock time and the instant.
  return wallClockAsUtc - zoneOffsetMs(guess, timeZone)
}

function cellAt(cells: string[], index: number): string {
  return index === -1 ? '' : (cells[index] ?? '').trim()
}

function clip(value: string, maxLength: number): { value: string; shortened: boolean } {
  return value.length > maxLength
    ? { value: value.slice(0, maxLength).trim(), shortened: true }
    : { value, shortened: false }
}

/**
 * Turns the data rows (without the header) into import rows. Dates and times are read in `timeZone`, the zone
 * the export was made in. Rows that cannot be read are returned as problems with the reason.
 */
export function readClockifyRows(
  dataRows: string[][],
  columns: ColumnIndexes,
  options: { dateOrder: DateOrder; timeZone: string },
): { rows: ClockifyRow[]; problems: RowProblem[] } {
  const rows: ClockifyRow[] = []
  const problems: RowProblem[] = []
  dataRows.forEach((cells, index) => {
    const line = index + 2
    const email = cellAt(cells, columns.email).toLowerCase()
    if (!email) {
      problems.push({ line, reason: 'missingEmail' })
      return
    }
    const startDate = parseDate(cellAt(cells, columns.startDate), options.dateOrder)
    const endDate = parseDate(cellAt(cells, columns.endDate), options.dateOrder)
    if (!startDate || !endDate) {
      problems.push({ line, reason: 'invalidDate' })
      return
    }
    const startTime = parseTime(cellAt(cells, columns.startTime))
    const endTime = parseTime(cellAt(cells, columns.endTime))
    if (!startTime || !endTime) {
      problems.push({ line, reason: 'invalidTime' })
      return
    }
    const startAt = zonedTimeToUtc(startDate, startTime, options.timeZone)
    const endAt = zonedTimeToUtc(endDate, endTime, options.timeZone)
    if (endAt <= startAt) {
      problems.push({ line, reason: 'endNotAfterStart' })
      return
    }
    const rawDescription = cellAt(cells, columns.description)
    const description = clip(
      rawDescription === EMPTY_DESCRIPTION_PLACEHOLDER ? '' : rawDescription,
      MAX_IMPORT_DESCRIPTION_LENGTH,
    )
    const [client, project, task] = [columns.client, columns.project, columns.task].map((column) =>
      clip(cellAt(cells, column), MAX_IMPORT_NAME_LENGTH),
    )
    if (task.value && !project.value) {
      problems.push({ line, reason: 'taskWithoutProject' })
      return
    }
    rows.push({
      line,
      email,
      userName: cellAt(cells, columns.user),
      clientName: client.value || null,
      projectName: project.value || null,
      taskName: task.value || null,
      description: description.value,
      billable: cellAt(cells, columns.billable).toLowerCase() === 'yes',
      startAt,
      endAt,
      shortened: description.shortened || client.shortened || project.shortened || task.shortened,
    })
  })
  return { rows, problems }
}

/** Lines of rows that overlap an earlier-starting row of the same user. The earlier row is kept. */
export function findOverlappingLines<T extends { line: number; userId: string; startAt: number; endAt: number }>(
  rows: T[],
): Set<number> {
  const overlapping = new Set<number>()
  const byUser = new Map<string, T[]>()
  for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row])
  for (const userRows of byUser.values()) {
    const sorted = [...userRows].sort((a, b) => a.startAt - b.startAt || a.line - b.line)
    let lastEnd = Number.NEGATIVE_INFINITY
    for (const row of sorted) {
      if (row.startAt < lastEnd) {
        overlapping.add(row.line)
      } else {
        lastEnd = row.endAt
      }
    }
  }
  return overlapping
}

// Catalog matching. Names compare without case or surrounding spaces; an active item wins over an archived one,
// which is reused as it is so history groups with it in reports.

export type CatalogItem = { id: string; name: string; archived: boolean }
export type CatalogProject = CatalogItem & { clientId: string | null }
export type CatalogTask = CatalogItem & { projectId: string }
export type ImportCatalog = { clients: CatalogItem[]; projects: CatalogProject[]; tasks: CatalogTask[] }

export function catalogKey(name: string): string {
  return name.trim().toLowerCase()
}

function pick<T extends CatalogItem>(items: T[], name: string, matches: (item: T) => boolean): T | undefined {
  const candidates = items.filter((item) => catalogKey(item.name) === catalogKey(name) && matches(item))
  return candidates.find((item) => !item.archived) ?? candidates[0]
}

export function findClient(catalog: ImportCatalog, name: string): CatalogItem | undefined {
  return pick(catalog.clients, name, () => true)
}

/** A project with this name under the same client (or with no client when `clientId` is null). */
export function findProject(catalog: ImportCatalog, name: string, clientId: string | null): CatalogProject | undefined {
  return pick(catalog.projects, name, (project) => (project.clientId ?? null) === clientId)
}

export function findTask(catalog: ImportCatalog, name: string, projectId: string): CatalogTask | undefined {
  return pick(catalog.tasks, name, (task) => task.projectId === projectId)
}

/** Placeholder IDs for items the import will create, so later rows can match them during the preview. */
const PENDING_PREFIX = 'pending:'

/** What the import will create: names of new clients, projects (with client) and tasks (with project). */
export type CatalogPlan = {
  clients: string[]
  projects: Array<{ name: string; clientName: string | null }>
  tasks: Array<{ name: string; projectName: string; clientName: string | null }>
}

/** The clients, projects and tasks the rows need that the catalog does not have yet. */
export function planCatalog(
  catalog: ImportCatalog,
  rows: Array<Pick<ClockifyRow, 'clientName' | 'projectName' | 'taskName'>>,
): CatalogPlan {
  const working: ImportCatalog = {
    clients: [...catalog.clients],
    projects: [...catalog.projects],
    tasks: [...catalog.tasks],
  }
  const plan: CatalogPlan = { clients: [], projects: [], tasks: [] }
  for (const row of rows) {
    let clientId: string | null = null
    if (row.clientName) {
      let client = findClient(working, row.clientName)
      if (!client) {
        client = { id: `${PENDING_PREFIX}client:${catalogKey(row.clientName)}`, name: row.clientName, archived: false }
        working.clients.push(client)
        plan.clients.push(row.clientName)
      }
      clientId = client.id
    }
    if (!row.projectName) continue
    let project = findProject(working, row.projectName, clientId)
    if (!project) {
      project = {
        id: `${PENDING_PREFIX}project:${clientId ?? ''}:${catalogKey(row.projectName)}`,
        name: row.projectName,
        clientId,
        archived: false,
      }
      working.projects.push(project)
      plan.projects.push({ name: row.projectName, clientName: row.clientName })
    }
    if (!row.taskName) continue
    if (!findTask(working, row.taskName, project.id)) {
      working.tasks.push({
        id: `${PENDING_PREFIX}task:${project.id}:${catalogKey(row.taskName)}`,
        name: row.taskName,
        projectId: project.id,
        archived: false,
      })
      plan.tasks.push({ name: row.taskName, projectName: row.projectName, clientName: row.clientName })
    }
  }
  return plan
}
