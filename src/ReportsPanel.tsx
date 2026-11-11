import { useEffect, useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import { useTheme } from '@mui/material/styles'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { User } from 'firebase/auth'
import { subscribeToWorkspaceMembers, type WorkspaceMember } from './lib/workspaces'
import type { Catalog } from './lib/catalog'
import { formatElapsed, localDayString } from './lib/dates'
import { IN_MEMORY_EXPORT_ROW_LIMIT, loadReportSummary, streamReportCsv } from './lib/reports'
import {
  reportUserName,
  searchReportEntries,
  UNKNOWN_USER,
  type ReportFilters,
  type ReportMember,
} from './lib/reportFormat'
import {
  buildReportPdfModel,
  describeReportFilters,
  PDF_EXPORT_ROW_LIMIT,
  PDF_ROW_LIMIT_MESSAGE,
} from './lib/reportPdf'
import type { TimeEntry } from './lib/timeEntries'
import {
  entrySeconds,
  groupByOptions,
  parseGroupBy,
  summarizeReport,
  type GroupBy,
  type ReportGroup,
} from './lib/reportGroups'
import { BillableChip, EmptyText, FormMessage, ListRow, SectionCard, SectionHeading, SelectField } from './ui'

type CsvWritable = {
  write(data: string): Promise<void>
  close(): Promise<void>
  abort(reason?: unknown): Promise<void>
}
type SaveFileHandle = { createWritable(): Promise<CsvWritable> }
type SaveFilePicker = (options: {
  suggestedName: string
  types: { description: string; accept: Record<string, string[]> }[]
}) => Promise<SaveFileHandle>

function initialFilters(): ReportFilters {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return {
    startDay: localDayString(start),
    endDay: localDayString(today),
    userId: '',
    clientId: '',
    projectId: '',
    taskId: '',
    billable: '',
  }
}

const duration = entrySeconds

// The selected tab lives in the hash query (#reports?group=client) so reloads and shared links keep it.
function groupFromHash(canSeeAllEntries: boolean): GroupBy {
  const query = window.location.hash.split('?')[1] ?? ''
  return parseGroupBy(new URLSearchParams(query).get('group'), canSeeAllEntries)
}

function saveGroupToHash(groupBy: GroupBy) {
  const [view] = window.location.hash.split('?')
  const next = groupBy === 'day' ? view : `${view}?group=${groupBy}`
  window.history.replaceState(window.history.state, '', next || '#reports')
}

function filterKey(filters: ReportFilters) {
  return [
    filters.startDay,
    filters.endDay,
    filters.userId,
    filters.clientId,
    filters.projectId,
    filters.taskId,
    filters.billable,
  ].join('|')
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ReportsPanel({
  user,
  workspaceId,
  workspaceName,
  canSeeAllEntries,
  catalog,
}: {
  user: User
  workspaceId: string
  workspaceName: string
  canSeeAllEntries: boolean
  catalog: Catalog
}) {
  const [filters, setFilters] = useState<ReportFilters>(initialFilters)
  const [groupBy, setGroupBy] = useState<GroupBy>(() => groupFromHash(canSeeAllEntries))
  const wide = useMediaQuery(useTheme().breakpoints.up('lg'))
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [summaryState, setSummaryState] = useState<{ key: string; entries: TimeEntry[] }>({ key: '', entries: [] })
  // Detailed entries stay collapsed until asked for, and keep their open/closed state across filter changes.
  const [entriesOpen, setEntriesOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [visibleState, setVisibleState] = useState({ key: '', count: ENTRIES_PAGE_SIZE })
  const [loadedKey, setLoadedKey] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportNotice, setExportNotice] = useState('')
  const [errorState, setErrorState] = useState<{ key: string; message: string }>({ key: '', message: '' })
  const key = filterKey(filters)
  // Regular members only ever see their own entries and cannot read the member list, so name them from their profile.
  const reportMembers: readonly ReportMember[] = canSeeAllEntries
    ? members
    : [{ uid: user.uid, displayName: user.displayName ?? '', email: user.email ?? '' }]
  const invalidRange = !filters.startDay || !filters.endDay || filters.startDay > filters.endDay
  const summaryEntries = summaryState.key === key ? summaryState.entries : []
  const summaryLoading = !invalidRange && loadedKey !== key
  const error = invalidRange
    ? 'Choose a valid date range. The start date must be on or before the end date.'
    : errorState.key === key
      ? errorState.message
      : ''

  useEffect(() => {
    if (!canSeeAllEntries) return
    return subscribeToWorkspaceMembers(workspaceId, setMembers, (loadError) =>
      setErrorState({ key, message: loadError.message }),
    )
  }, [workspaceId, canSeeAllEntries, key])

  useEffect(() => {
    let cancelled = false
    if (invalidRange)
      return () => {
        cancelled = true
      }
    // The summary loads every matching entry; the detailed list and its search reuse them, so they need no query.
    void loadReportSummary(workspaceId, canSeeAllEntries, user.uid, filters, (batch) => {
      if (!cancelled)
        setSummaryState((current) => ({ key, entries: [...(current.key === key ? current.entries : []), ...batch] }))
    })
      .catch((loadError: unknown) => {
        if (!cancelled)
          setErrorState({
            key,
            message: loadError instanceof Error ? loadError.message : 'Could not load this report.',
          })
      })
      .finally(() => {
        if (!cancelled) {
          setLoadedKey(key)
        }
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId, user.uid, canSeeAllEntries, filters, key, invalidRange])

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const searchPending = searchInput.trim() !== search
  const matchingEntries = entriesOpen
    ? searchReportEntries(
        summaryEntries,
        search,
        canSeeAllEntries ? (entry) => reportUserName(entry, reportMembers) : undefined,
      )
    : []
  const visibleKey = `${key}|${search}`
  const visibleCount = visibleState.key === visibleKey ? visibleState.count : ENTRIES_PAGE_SIZE
  const entries = matchingEntries.slice(0, visibleCount)
  const hasMore = matchingEntries.length > visibleCount
  const entryCountLabel = summaryLoading
    ? 'entries'
    : `${summaryEntries.length.toLocaleString()} ${summaryEntries.length === 1 ? 'entry' : 'entries'}`

  const groups = summarizeReport(summaryEntries, groupBy, (entry) => reportUserName(entry, reportMembers))
  const totalSeconds = summaryEntries.reduce((total, entry) => total + duration(entry), 0)
  const billableSeconds = summaryEntries.reduce((total, entry) => total + (entry.billable ? duration(entry) : 0), 0)

  function selectGroup(next: GroupBy) {
    setGroupBy(next)
    saveGroupToHash(next)
  }

  function updateFilter<K extends keyof ReportFilters>(field: K, value: ReportFilters[K]) {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  async function exportCsv() {
    setExporting(true)
    setExportProgress(0)
    setExportNotice('')
    setErrorState({ key, message: '' })
    let writable: CsvWritable | undefined
    let fileParts: BlobPart[] = []
    let bufferedRows = 0
    try {
      const suggestedName = `ticknest-report-${filters.startDay}-to-${filters.endDay}.csv`
      const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker
      if (picker) {
        const handle = await picker.call(window, {
          suggestedName,
          types: [{ description: 'CSV file', accept: { 'text/csv': ['.csv'] } }],
        })
        writable = await handle.createWritable()
      }

      const exportedRows = await streamReportCsv(
        workspaceId,
        canSeeAllEntries,
        user.uid,
        filters,
        timezone,
        reportMembers,
        async (chunk, rowCount) => {
          if (writable) {
            await writable.write(chunk)
            return
          }
          if (bufferedRows + rowCount > IN_MEMORY_EXPORT_ROW_LIMIT) {
            throw new Error(
              `This browser’s download limit is ${IN_MEMORY_EXPORT_ROW_LIMIT.toLocaleString()} rows. Use a browser that supports streamed file saving or narrow the date range.`,
            )
          }
          bufferedRows += rowCount
          fileParts.push(chunk)
        },
        setExportProgress,
      )

      if (writable) {
        await writable.close()
      } else {
        downloadBlob(new Blob(fileParts, { type: 'text/csv;charset=utf-8' }), suggestedName)
        fileParts = []
      }
      setExportNotice(`Exported ${exportedRows.toLocaleString()} ${exportedRows === 1 ? 'entry' : 'entries'}.`)
    } catch (exportError) {
      if (writable) await writable.abort(exportError).catch(() => undefined)
      if (exportError instanceof DOMException && exportError.name === 'AbortError') return
      setErrorState({
        key,
        message: exportError instanceof Error ? exportError.message : 'Could not export this report.',
      })
    } finally {
      setExporting(false)
      setExportProgress(0)
    }
  }

  // The summary already holds every matching entry, so the PDF is built from it without reading Firestore again.
  async function exportPdf() {
    setExportNotice('')
    if (summaryEntries.length > PDF_EXPORT_ROW_LIMIT) {
      setErrorState({ key, message: PDF_ROW_LIMIT_MESSAGE })
      return
    }
    setExportingPdf(true)
    setErrorState({ key, message: '' })
    try {
      const model = buildReportPdfModel({
        workspaceName,
        filters,
        filterLabels: describeReportFilters(filters, catalog, reportMembers, canSeeAllEntries),
        timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        groupBy,
        groups,
        entries: summaryEntries,
        userName: (entry) => reportUserName(entry, reportMembers),
        showUser: canSeeAllEntries,
      })
      const { renderReportPdf } = await import('./lib/renderReportPdf')
      downloadBlob(await renderReportPdf(model), model.fileName)
      const count = summaryEntries.length
      setExportNotice(`Exported ${count.toLocaleString()} ${count === 1 ? 'entry' : 'entries'} to PDF.`)
    } catch (exportError) {
      setErrorState({
        key,
        message: exportError instanceof Error ? exportError.message : 'Could not export this report as a PDF.',
      })
    } finally {
      setExportingPdf(false)
    }
  }

  const timezone = new Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time'
  const exportBusy = exporting || exportingPdf
  const filterCount = canSeeAllEntries ? 7 : 6
  return (
    <SectionCard labelledBy="reports-heading" sx={{ maxWidth: 'none' }}>
      <SectionHeading
        id="reports-heading"
        kicker="WORKSPACE INSIGHTS"
        title="Reports"
        description={`Dates in ${timezone}`}
        action={
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1.5, flexShrink: 0 }}>
            <Button variant="outlined" onClick={() => void exportCsv()} disabled={invalidRange || exportBusy}>
              {exporting ? `Exporting… ${exportProgress.toLocaleString()}` : 'Export CSV'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => void exportPdf()}
              // The PDF is built from the summary, so it waits until every matching entry has loaded.
              disabled={invalidRange || summaryLoading || exportBusy}
            >
              {exportingPdf ? 'Preparing PDF…' : summaryLoading && !invalidRange ? 'Loading entries…' : 'Export PDF'}
            </Button>
          </Stack>
        }
      />
      {exportNotice && <FormMessage severity="success">{exportNotice}</FormMessage>}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            md: 'repeat(4, minmax(0, 1fr))',
            lg: `repeat(${filterCount}, minmax(0, 1fr))`,
          },
          gap: 1.5,
          mt: 2.75,
        }}
      >
        <TextField
          label="From"
          type="date"
          value={filters.startDay}
          onChange={(event) => updateFilter('startDay', event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="Through"
          type="date"
          value={filters.endDay}
          onChange={(event) => updateFilter('endDay', event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        {canSeeAllEntries && (
          <SelectField
            label="Member"
            value={filters.userId}
            onChange={(event) => updateFilter('userId', event.target.value)}
          >
            <option value="">Everyone</option>
            {members
              .filter((member) => member.status !== 'removed')
              .map((member) => (
                <option key={member.uid} value={member.uid}>
                  {member.displayName || member.email || UNKNOWN_USER}
                </option>
              ))}
          </SelectField>
        )}
        <SelectField
          label="Client"
          value={filters.clientId}
          onChange={(event) => updateFilter('clientId', event.target.value)}
        >
          <option value="">All clients</option>
          {catalog.clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Project"
          value={filters.projectId}
          onChange={(event) => updateFilter('projectId', event.target.value)}
        >
          <option value="">All projects</option>
          {catalog.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Task"
          value={filters.taskId}
          onChange={(event) => updateFilter('taskId', event.target.value)}
        >
          <option value="">All tasks</option>
          {catalog.tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Billable"
          value={filters.billable}
          onChange={(event) => updateFilter('billable', event.target.value as ReportFilters['billable'])}
        >
          <option value="">All entries</option>
          <option value="yes">Billable</option>
          <option value="no">Non-billable</option>
        </SelectField>
      </Box>
      {error && <FormMessage severity="error">{error}</FormMessage>}
      <Box
        aria-live="polite"
        sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 0.75, sm: 1.25 }, mt: 2.5 }}
      >
        {[
          ['Total tracked', formatElapsed(totalSeconds)],
          ['Billable', formatElapsed(billableSeconds)],
          ['Entries', `${summaryEntries.length}${summaryLoading ? '…' : ''}`],
        ].map(([label, value]) => (
          <Paper
            key={label}
            variant="outlined"
            sx={{ display: 'grid', gap: 0.75, p: { xs: 1.25, sm: 1.75 }, minWidth: 0, bgcolor: 'app.surface' }}
          >
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
            <Typography
              sx={{
                color: 'primary.main',
                fontVariantNumeric: 'tabular-nums',
                fontSize: { xs: 15, sm: 18 },
                fontWeight: 700,
              }}
            >
              {value}
            </Typography>
          </Paper>
        ))}
      </Box>
      <Typography variant="h3" sx={{ mt: 3 }}>
        Summary
      </Typography>
      <Tabs
        value={groupBy}
        onChange={(_event, next: GroupBy) => selectGroup(next)}
        variant="scrollable"
        allowScrollButtonsMobile
        aria-label="Group summary by"
        sx={{ mt: 1, borderBottom: 1, borderColor: 'divider' }}
      >
        {groupByOptions(canSeeAllEntries).map((option) => (
          <Tab
            key={option.value}
            value={option.value}
            label={option.label}
            id={`report-group-tab-${option.value}`}
            aria-controls="report-group-panel"
          />
        ))}
      </Tabs>
      <Box
        role="tabpanel"
        id="report-group-panel"
        aria-labelledby={`report-group-tab-${groupBy}`}
        aria-live="polite"
        sx={{ mt: 0.5 }}
      >
        {groups.length === 0 && !summaryLoading ? (
          <EmptyText>No completed entries match these filters.</EmptyText>
        ) : (
          groups.map((group) =>
            group.children ? (
              <SummaryLane key={group.key} group={group} totalSeconds={totalSeconds} />
            ) : (
              <SummaryRow key={group.key} group={group} totalSeconds={totalSeconds} />
            ),
          )
        )}
        {summaryLoading && <EmptyText>Updating summary…</EmptyText>}
      </Box>
      <Divider sx={{ mt: 2 }} />
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 1.5, mt: 2 }}
      >
        <Typography variant="h3" id="report-entries-heading">
          Detailed entries
        </Typography>
        <Button
          variant="outlined"
          onClick={() => setEntriesOpen((current) => !current)}
          aria-expanded={entriesOpen}
          aria-controls="report-entries"
          disabled={invalidRange}
        >
          {entriesOpen ? 'Hide entries' : `Show ${entryCountLabel}`}
        </Button>
      </Stack>
      {entriesOpen && (
        <Box id="report-entries" role="region" aria-labelledby="report-entries-heading">
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            sx={{ alignItems: { xs: 'stretch', sm: 'flex-start' }, justifyContent: 'space-between', gap: 1.5, mt: 1.5 }}
          >
            <TextField
              label="Search entries"
              type="search"
              size="small"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              helperText={
                canSeeAllEntries ? 'Description, client, project, task or user' : 'Description, client, project or task'
              }
              sx={{ width: { xs: '100%', sm: 360 } }}
            />
            {/* Lines up with the input box rather than the input plus its helper text. */}
            <Typography variant="caption" color="text.secondary" aria-live="polite" sx={{ pt: { sm: 1.25 } }}>
              {summaryLoading || searchPending
                ? 'Loading entries…'
                : search
                  ? `${matchingEntries.length.toLocaleString()} of ${summaryEntries.length.toLocaleString()} entries · newest first`
                  : 'Newest first'}
            </Typography>
          </Stack>
          <Box sx={{ mt: 1 }}>
            {wide
              ? entries.length > 0 && <EntriesTable entries={entries} members={members} showUser={canSeeAllEntries} />
              : entries.map((entry) => (
                  <ListRow key={entry.id} sx={{ alignItems: { xs: 'flex-start', sm: 'center' } }}>
                    <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                        {entry.description || UNTITLED_ENTRY}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {[
                          entry.startAt.toDate().toLocaleString(),
                          // Every entry a regular member sees is their own, so the user segment would be noise.
                          canSeeAllEntries ? reportUserName(entry, members) : null,
                          [entry.clientName, entry.projectName, entry.taskName].filter(Boolean).join(' · ') ||
                            'No client, project, or task',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Typography>
                    </Box>
                    <Stack spacing={0.5} sx={{ alignItems: 'flex-end', flex: '0 0 auto' }}>
                      <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {formatElapsed(duration(entry))}
                      </Typography>
                      {entry.billable && <BillableChip />}
                    </Stack>
                  </ListRow>
                ))}
            {entries.length === 0 && !summaryLoading && !searchPending && (
              <EmptyText>
                {search ? `No entries match “${search}”.` : 'No completed entries match these filters.'}
              </EmptyText>
            )}
          </Box>
          {hasMore && (
            <Button
              variant="outlined"
              onClick={() => setVisibleState({ key: visibleKey, count: visibleCount + ENTRIES_PAGE_SIZE })}
              sx={{ display: 'flex', mx: 'auto', mt: 2 }}
            >
              Show more entries
            </Button>
          )}
        </Box>
      )}
    </SectionCard>
  )
}

const ENTRIES_PAGE_SIZE = 25
const SEARCH_DEBOUNCE_MS = 300
const UNTITLED_ENTRY = 'Untitled entry'
const EMPTY_CELL = '—'

/** Wide-screen layout for detailed entries: one column per field so nothing gets truncated. */
function EntriesTable({
  entries,
  members,
  showUser,
}: {
  entries: TimeEntry[]
  members: ReportMember[]
  showUser: boolean
}) {
  const headers = ['Description', 'Date & time', ...(showUser ? ['User'] : []), 'Client', 'Project', 'Task', 'Billable']
  return (
    // The scroll box is a safety net for narrow lg viewports with long names; it should rarely engage.
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" aria-label="Detailed entries">
        <TableHead>
          <TableRow>
            {headers.map((header) => (
              <TableCell key={header}>{header}</TableCell>
            ))}
            <TableCell align="right">Duration</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell sx={{ fontWeight: 600 }}>{entry.description || UNTITLED_ENTRY}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {entry.startAt.toDate().toLocaleDateString()}
                <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {entry.startAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Typography>
              </TableCell>
              {showUser && <TableCell>{reportUserName(entry, members)}</TableCell>}
              <TableCell>{entry.clientName || EMPTY_CELL}</TableCell>
              <TableCell>{entry.projectName || EMPTY_CELL}</TableCell>
              <TableCell>{entry.taskName || EMPTY_CELL}</TableCell>
              <TableCell>{entry.billable ? <BillableChip /> : EMPTY_CELL}</TableCell>
              <TableCell
                align="right"
                sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, whiteSpace: 'nowrap' }}
              >
                {formatElapsed(duration(entry))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}

function shareOfTotal(seconds: number, totalSeconds: number) {
  return totalSeconds > 0 ? Math.round((seconds / totalSeconds) * 100) : 0
}

function ShareBar({ percent }: { percent: number }) {
  return (
    <Box
      role="img"
      aria-label={`${percent}% of total`}
      sx={{ height: 6, borderRadius: 3, bgcolor: 'action.hover', overflow: 'hidden' }}
    >
      <Box sx={{ width: `${percent}%`, height: '100%', bgcolor: 'primary.main' }} />
    </Box>
  )
}

const SUMMARY_COLUMNS = {
  xs: 'minmax(0, 1fr) auto',
  sm: 'minmax(0, 1fr) 72px 88px 88px 96px',
}

/** One summary line: label, entry count, billable time, total time and share of the report total. */
function SummaryRow({
  group,
  totalSeconds,
  nested = false,
  toggle,
}: {
  group: ReportGroup
  totalSeconds: number
  nested?: boolean
  toggle?: ReactNode
}) {
  const percent = shareOfTotal(group.seconds, totalSeconds)
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: SUMMARY_COLUMNS,
        alignItems: 'center',
        columnGap: { xs: 1, sm: 2.25 },
        rowGap: 0.75,
        py: nested ? 1 : 1.5,
        pl: nested ? { xs: 3, sm: 5 } : 0,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
        {toggle}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: nested ? 500 : 600 }}>
            {group.label}
          </Typography>
          {group.caption && (
            <Typography variant="caption" color="text.secondary" noWrap component="p">
              {group.caption}
            </Typography>
          )}
        </Box>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
        {group.count} {group.count === 1 ? 'entry' : 'entries'}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: { xs: 'none', sm: 'block' }, fontVariantNumeric: 'tabular-nums' }}
        aria-label={`Billable ${formatElapsed(group.billableSeconds)}`}
      >
        {formatElapsed(group.billableSeconds)}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: nested ? 500 : 600, textAlign: 'right' }}
      >
        {formatElapsed(group.seconds)}
      </Typography>
      <Box sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}>
        <ShareBar percent={percent} />
      </Box>
    </Box>
  )
}

/** A client or project swimlane: a header row with its totals, then its projects or tasks underneath. */
function SummaryLane({ group, totalSeconds }: { group: ReportGroup; totalSeconds: number }) {
  const [open, setOpen] = useState(true)
  const childrenId = `report-lane-${group.key || 'none'}`.replace(/[^\w-]/g, '-')
  return (
    <Box component="section" aria-label={group.label}>
      <SummaryRow
        group={group}
        totalSeconds={totalSeconds}
        toggle={
          <IconButton
            size="small"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls={childrenId}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${group.label}`}
            sx={{ ml: -0.75 }}
          >
            <Box
              component="svg"
              viewBox="0 0 24 24"
              aria-hidden
              sx={{
                width: 18,
                height: 18,
                transform: open ? 'rotate(90deg)' : 'none',
                transition: 'transform 150ms',
              }}
            >
              <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </Box>
          </IconButton>
        }
      />
      <Collapse in={open} id={childrenId}>
        {group.children?.map((child) => (
          <SummaryRow key={child.key} group={child} totalSeconds={totalSeconds} nested />
        ))}
      </Collapse>
    </Box>
  )
}
