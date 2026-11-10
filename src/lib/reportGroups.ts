import { localDayString } from './dates'
import type { TimeEntry } from './timeEntries'

export type GroupBy = 'day' | 'client' | 'project' | 'task' | 'user'

export const GROUP_BY_OPTIONS: readonly { value: GroupBy; label: string; managersOnly?: boolean }[] = [
  { value: 'day', label: 'Day' },
  { value: 'client', label: 'Client' },
  { value: 'project', label: 'Project' },
  { value: 'task', label: 'Task' },
  { value: 'user', label: 'User', managersOnly: true },
]

/** The tabs a viewer may use: regular members only see their own entries, so grouping by user is noise for them. */
export function groupByOptions(canSeeAllEntries: boolean) {
  return GROUP_BY_OPTIONS.filter((option) => canSeeAllEntries || !option.managersOnly)
}

/** Reads a group-by value from untrusted input (the URL), falling back to Day when it is unknown or not allowed. */
export function parseGroupBy(value: string | null | undefined, canSeeAllEntries: boolean): GroupBy {
  return groupByOptions(canSeeAllEntries).find((option) => option.value === value)?.value ?? 'day'
}

export type ReportGroup = {
  key: string
  label: string
  /** Extra context for the label, e.g. the client of a project lane. */
  caption?: string
  count: number
  seconds: number
  billableSeconds: number
  /** Nested rows for swimlanes: projects within a client lane, tasks within a project lane. */
  children?: ReportGroup[]
}

export function entrySeconds(entry: TimeEntry) {
  return entry.endAt ? Math.max(0, Math.floor((entry.endAt.toMillis() - entry.startAt.toMillis()) / 1000)) : 0
}

type Dimension = { key: string; label: string; caption?: string }

// Catalog items are keyed by ID when the entry has one, so two projects sharing a name stay apart.
function catalogDimension(id: string | null | undefined, name: string | null, emptyLabel: string): Dimension {
  return { key: id || (name ? `name:${name}` : ''), label: name || emptyLabel }
}

function dimension(entry: TimeEntry, groupBy: GroupBy, userName: (entry: TimeEntry) => string): Dimension {
  switch (groupBy) {
    case 'day': {
      const day = localDayString(entry.startAt.toDate())
      return { key: day, label: day }
    }
    case 'client':
      return catalogDimension(entry.clientId, entry.clientName, 'No client')
    case 'project':
      return { ...catalogDimension(entry.projectId, entry.projectName, 'No project'), caption: entry.clientName ?? '' }
    case 'task':
      return catalogDimension(entry.taskId, entry.taskName, 'No task')
    case 'user': {
      const label = userName(entry)
      return { key: entry.userId, label }
    }
  }
}

const CHILD_DIMENSION: Partial<Record<GroupBy, GroupBy>> = { client: 'project', project: 'task' }

function sortGroups(groups: ReportGroup[], groupBy: GroupBy) {
  // Days read best in calendar order; everything else ranks by time spent.
  return groupBy === 'day'
    ? groups.sort((left, right) => left.key.localeCompare(right.key))
    : groups.sort((left, right) => right.seconds - left.seconds || left.label.localeCompare(right.label))
}

function group(
  entries: readonly TimeEntry[],
  groupBy: GroupBy,
  userName: (entry: TimeEntry) => string,
  topLevel: boolean,
): ReportGroup[] {
  const buckets = new Map<string, { group: ReportGroup; entries: TimeEntry[] }>()
  for (const entry of entries) {
    const { key, label, caption: dimensionCaption } = dimension(entry, groupBy, userName)
    // Inside a lane the parent already names the context, so only top-level rows carry a caption.
    const caption = topLevel ? dimensionCaption : undefined
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        group: { key, label, ...(caption ? { caption } : {}), count: 0, seconds: 0, billableSeconds: 0 },
        entries: [],
      }
      buckets.set(key, bucket)
    }
    const seconds = entrySeconds(entry)
    bucket.group.count += 1
    bucket.group.seconds += seconds
    if (entry.billable) bucket.group.billableSeconds += seconds
    bucket.entries.push(entry)
  }
  const childBy = topLevel ? CHILD_DIMENSION[groupBy] : undefined
  const groups = [...buckets.values()].map(({ group: result, entries: groupEntries }) =>
    childBy ? { ...result, children: group(groupEntries, childBy, userName, false) } : result,
  )
  return sortGroups(groups, groupBy)
}

/**
 * Summarises report entries for one group-by tab. Client and Project tabs return swimlanes: each lane carries its
 * projects (or tasks) as children, and lane totals add up to the report totals.
 */
export function summarizeReport(
  entries: readonly TimeEntry[],
  groupBy: GroupBy,
  userName: (entry: TimeEntry) => string,
): ReportGroup[] {
  return group(entries, groupBy, userName, true)
}
