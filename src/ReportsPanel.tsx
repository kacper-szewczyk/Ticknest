import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { User } from 'firebase/auth'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { subscribeToWorkspaceMembers, type WorkspaceMember } from './lib/workspaces'
import type { Catalog } from './lib/catalog'
import { IN_MEMORY_EXPORT_ROW_LIMIT, loadReportPage, loadReportSummary, streamReportCsv } from './lib/reports'
import type { ReportFilters } from './lib/reportFormat'
import type { TimeEntry } from './lib/timeEntries'
import { BillableChip, EmptyText, FormMessage, ListRow, SectionCard, SectionHeading, SelectField } from './ui'

type GroupBy = 'day' | 'user' | 'client' | 'project' | 'task'
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

function localDay(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`
}

function initialFilters(): ReportFilters {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return {
    startDay: localDay(start),
    endDay: localDay(today),
    userId: '',
    clientId: '',
    projectId: '',
    taskId: '',
    billable: '',
  }
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, '0')
  const minutes = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0')
  const remainder = (seconds % 60).toString().padStart(2, '0')
  return `${hours}:${minutes}:${remainder}`
}

function duration(entry: TimeEntry) {
  return entry.endAt ? Math.max(0, Math.floor((entry.endAt.toMillis() - entry.startAt.toMillis()) / 1000)) : 0
}

function groupValue(entry: TimeEntry, groupBy: GroupBy, members: WorkspaceMember[]) {
  if (groupBy === 'day') return localDay(entry.startAt.toDate())
  if (groupBy === 'user') {
    const member = members.find((item) => item.uid === entry.userId)
    return member?.displayName || member?.email || entry.userId
  }
  if (groupBy === 'client') return entry.clientName || 'No client'
  if (groupBy === 'project') return entry.projectName || 'No project'
  return entry.taskName || 'No task'
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

export function ReportsPanel({
  user,
  workspaceId,
  isOwner,
  catalog,
}: {
  user: User
  workspaceId: string
  isOwner: boolean
  catalog: Catalog
}) {
  const [filters, setFilters] = useState<ReportFilters>(initialFilters)
  const [groupBy, setGroupBy] = useState<GroupBy>('day')
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [summaryState, setSummaryState] = useState<{ key: string; entries: TimeEntry[] }>({ key: '', entries: [] })
  const [pageState, setPageState] = useState<{ key: string; entries: TimeEntry[]; cursor?: QueryDocumentSnapshot }>({
    key: '',
    entries: [],
  })
  const [loadedKey, setLoadedKey] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportNotice, setExportNotice] = useState('')
  const [errorState, setErrorState] = useState<{ key: string; message: string }>({ key: '', message: '' })
  const key = filterKey(filters)
  const invalidRange = !filters.startDay || !filters.endDay || filters.startDay > filters.endDay
  const summaryEntries = summaryState.key === key ? summaryState.entries : []
  const entries = pageState.key === key ? pageState.entries : []
  const cursor = pageState.key === key ? pageState.cursor : undefined
  const hasMore = Boolean(cursor)
  const summaryLoading = !invalidRange && loadedKey !== key
  const pageLoading = summaryLoading || loadingMore
  const error = invalidRange
    ? 'Choose a valid date range. The start date must be on or before the end date.'
    : errorState.key === key
      ? errorState.message
      : ''

  useEffect(() => {
    if (!isOwner) return
    return subscribeToWorkspaceMembers(workspaceId, setMembers, (loadError) =>
      setErrorState({ key, message: loadError.message }),
    )
  }, [workspaceId, isOwner, key])

  useEffect(() => {
    let cancelled = false
    if (invalidRange)
      return () => {
        cancelled = true
      }
    void Promise.all([
      loadReportSummary(workspaceId, isOwner, user.uid, filters, (batch) => {
        if (!cancelled)
          setSummaryState((current) => ({ key, entries: [...(current.key === key ? current.entries : []), ...batch] }))
      }),
      loadReportPage(workspaceId, isOwner, user.uid, filters).then((page) => {
        if (!cancelled) {
          setPageState({ key, entries: page.entries, cursor: page.cursor })
        }
      }),
    ])
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
  }, [workspaceId, user.uid, isOwner, filters, key, invalidRange])

  const totals = new Map<string, { seconds: number; count: number }>()
  summaryEntries.forEach((entry) => {
    const label = groupValue(entry, groupBy, members)
    const current = totals.get(label) ?? { seconds: 0, count: 0 }
    current.seconds += duration(entry)
    current.count += 1
    totals.set(label, current)
  })
  const groups = [...totals.entries()].sort((left, right) => right[1].seconds - left[1].seconds)
  const totalSeconds = summaryEntries.reduce((total, entry) => total + duration(entry), 0)
  const billableSeconds = summaryEntries.reduce((total, entry) => total + (entry.billable ? duration(entry) : 0), 0)

  function updateFilter<K extends keyof ReportFilters>(field: K, value: ReportFilters[K]) {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  async function loadMore() {
    if (!cursor || pageLoading) return
    setLoadingMore(true)
    try {
      const page = await loadReportPage(workspaceId, isOwner, user.uid, filters, cursor)
      setPageState((current) => ({
        key,
        entries: [...(current.key === key ? current.entries : []), ...page.entries],
        cursor: page.cursor,
      }))
    } catch (loadError) {
      setErrorState({ key, message: loadError instanceof Error ? loadError.message : 'Could not load more entries.' })
    } finally {
      setLoadingMore(false)
    }
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
        isOwner,
        user.uid,
        filters,
        timezone,
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
        const blob = new Blob(fileParts, { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = suggestedName
        document.body.append(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
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

  const timezone = new Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time'
  return (
    <SectionCard labelledBy="reports-heading">
      <SectionHeading
        id="reports-heading"
        kicker="WORKSPACE INSIGHTS"
        title="Reports"
        action={
          <Typography variant="caption" color="text.secondary">
            Dates in {timezone}
          </Typography>
        }
      />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
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
        {isOwner && (
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
                  {member.displayName || member.email || member.uid}
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
          ['Total tracked', formatDuration(totalSeconds)],
          ['Billable', formatDuration(billableSeconds)],
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
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 1.5, mt: 3 }}
      >
        <Typography variant="h3">Summary</Typography>
        <SelectField
          label="Group by"
          value={groupBy}
          onChange={(event) => setGroupBy(event.target.value as GroupBy)}
          sx={{ width: { sm: 160 } }}
        >
          <option value="day">Day</option>
          <option value="user">User</option>
          <option value="client">Client</option>
          <option value="project">Project</option>
          <option value="task">Task</option>
        </SelectField>
      </Stack>
      <Box aria-live="polite" sx={{ mt: 1.25 }}>
        {groups.length === 0 && !summaryLoading ? (
          <EmptyText>No completed entries match these filters.</EmptyText>
        ) : (
          groups.map(([label, total]) => (
            <Box
              key={label}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', sm: 'minmax(0, 1fr) auto auto' },
                alignItems: 'center',
                columnGap: { xs: 1, sm: 2.25 },
                py: 1.5,
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                {label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {total.count} {total.count === 1 ? 'entry' : 'entries'}
              </Typography>
              <Typography
                variant="body2"
                sx={{ gridColumn: { xs: 2, sm: 'auto' }, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
              >
                {formatDuration(total.seconds)}
              </Typography>
            </Box>
          ))
        )}
        {summaryLoading && <EmptyText>Updating summary…</EmptyText>}
      </Box>
      <Divider sx={{ mt: 2 }} />
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 1.5, mt: 2 }}
      >
        <Typography variant="h3">Detailed entries</Typography>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            Newest first
          </Typography>
          <Button variant="outlined" onClick={() => void exportCsv()} disabled={invalidRange || exporting}>
            {exporting ? `Exporting… ${exportProgress.toLocaleString()}` : 'Export CSV'}
          </Button>
        </Stack>
      </Stack>
      {exportNotice && <FormMessage severity="success">{exportNotice}</FormMessage>}
      <Box sx={{ mt: 1 }}>
        {entries.map((entry) => (
          <ListRow key={entry.id} sx={{ alignItems: { xs: 'flex-start', sm: 'center' } }}>
            <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                {entry.description || 'Untitled entry'}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {entry.startAt.toDate().toLocaleString()} · {groupValue(entry, 'user', members)} ·{' '}
                {[entry.clientName, entry.projectName, entry.taskName].filter(Boolean).join(' · ') ||
                  'No client, project, or task'}
              </Typography>
            </Box>
            <Stack spacing={0.5} sx={{ alignItems: 'flex-end', flex: '0 0 auto' }}>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {formatDuration(duration(entry))}
              </Typography>
              {entry.billable && <BillableChip />}
            </Stack>
          </ListRow>
        ))}
        {entries.length === 0 && !pageLoading && <EmptyText>No completed entries match these filters.</EmptyText>}
      </Box>
      {hasMore && (
        <Button
          variant="outlined"
          onClick={() => void loadMore()}
          disabled={pageLoading}
          aria-live="polite"
          sx={{ display: 'flex', mx: 'auto', mt: 2 }}
        >
          {pageLoading ? 'Loading…' : 'Load more entries'}
        </Button>
      )}
    </SectionCard>
  )
}
