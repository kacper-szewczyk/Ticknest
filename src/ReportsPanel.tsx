import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { subscribeToWorkspaceMembers, type WorkspaceMember } from './lib/workspaces'
import type { Catalog } from './lib/catalog'
import { IN_MEMORY_EXPORT_ROW_LIMIT, loadReportPage, loadReportSummary, streamReportCsv, type ReportFilters } from './lib/reports'
import type { TimeEntry } from './lib/timeEntries'

type GroupBy = 'day' | 'user' | 'client' | 'project' | 'task'
type CsvWritable = { write(data: string): Promise<void>; close(): Promise<void>; abort(reason?: unknown): Promise<void> }
type SaveFileHandle = { createWritable(): Promise<CsvWritable> }
type SaveFilePicker = (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<SaveFileHandle>

function localDay(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`
}

function initialFilters(): ReportFilters {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return { startDay: localDay(start), endDay: localDay(today), userId: '', clientId: '', projectId: '', taskId: '', billable: '' }
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600).toString().padStart(2, '0')
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')
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
  return [filters.startDay, filters.endDay, filters.userId, filters.clientId, filters.projectId, filters.taskId, filters.billable].join('|')
}

export function ReportsPanel({ user, workspaceId, isOwner, catalog }: { user: User; workspaceId: string; isOwner: boolean; catalog: Catalog }) {
  const [filters, setFilters] = useState<ReportFilters>(initialFilters)
  const [groupBy, setGroupBy] = useState<GroupBy>('day')
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [summaryState, setSummaryState] = useState<{ key: string; entries: TimeEntry[] }>({ key: '', entries: [] })
  const [pageState, setPageState] = useState<{ key: string; entries: TimeEntry[]; cursor?: QueryDocumentSnapshot }>({ key: '', entries: [] })
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
    : errorState.key === key ? errorState.message : ''

  useEffect(() => {
    if (!isOwner) return
    return subscribeToWorkspaceMembers(workspaceId, setMembers, (loadError) => setErrorState({ key, message: loadError.message }))
  }, [workspaceId, isOwner, key])

  useEffect(() => {
    let cancelled = false
    if (invalidRange) return () => { cancelled = true }
    void Promise.all([
      loadReportSummary(workspaceId, isOwner, user.uid, filters, (batch) => {
        if (!cancelled) setSummaryState((current) => ({ key, entries: [...(current.key === key ? current.entries : []), ...batch] }))
      }),
      loadReportPage(workspaceId, isOwner, user.uid, filters).then((page) => {
        if (!cancelled) {
          setPageState({ key, entries: page.entries, cursor: page.cursor })
        }
      }),
    ]).catch((loadError: unknown) => {
      if (!cancelled) setErrorState({ key, message: loadError instanceof Error ? loadError.message : 'Could not load this report.' })
    }).finally(() => {
      if (!cancelled) {
        setLoadedKey(key)
      }
    })
    return () => { cancelled = true }
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
      setPageState((current) => ({ key, entries: [...(current.key === key ? current.entries : []), ...page.entries], cursor: page.cursor }))
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
            throw new Error(`This browser’s download limit is ${IN_MEMORY_EXPORT_ROW_LIMIT.toLocaleString()} rows. Use a browser that supports streamed file saving or narrow the date range.`)
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
      setErrorState({ key, message: exportError instanceof Error ? exportError.message : 'Could not export this report.' })
    } finally {
      setExporting(false)
      setExportProgress(0)
    }
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time'
  return <section className="reports-card" aria-labelledby="reports-heading">
    <div className="catalog-heading"><div><p className="section-kicker">WORKSPACE INSIGHTS</p><h2 id="reports-heading">Reports</h2></div><span className="report-timezone">Dates in {timezone}</span></div>
    <div className="report-filters">
      <label>From<input type="date" value={filters.startDay} onChange={(event) => updateFilter('startDay', event.target.value)} /></label>
      <label>Through<input type="date" value={filters.endDay} onChange={(event) => updateFilter('endDay', event.target.value)} /></label>
      {isOwner && <label>Member<select value={filters.userId} onChange={(event) => updateFilter('userId', event.target.value)}><option value="">Everyone</option>{members.filter((member) => member.status !== 'removed').map((member) => <option key={member.uid} value={member.uid}>{member.displayName || member.email || member.uid}</option>)}</select></label>}
      <label>Client<select value={filters.clientId} onChange={(event) => updateFilter('clientId', event.target.value)}><option value="">All clients</option>{catalog.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
      <label>Project<select value={filters.projectId} onChange={(event) => updateFilter('projectId', event.target.value)}><option value="">All projects</option>{catalog.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label>Task<select value={filters.taskId} onChange={(event) => updateFilter('taskId', event.target.value)}><option value="">All tasks</option>{catalog.tasks.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}</select></label>
      <label>Billable<select value={filters.billable} onChange={(event) => updateFilter('billable', event.target.value as ReportFilters['billable'])}><option value="">All entries</option><option value="yes">Billable</option><option value="no">Non-billable</option></select></label>
    </div>
    {error && <p className="form-message is-error" role="alert">{error}</p>}
    <div className="report-totals" aria-live="polite"><div><span>Total tracked</span><strong>{formatDuration(totalSeconds)}</strong></div><div><span>Billable</span><strong>{formatDuration(billableSeconds)}</strong></div><div><span>Entries</span><strong>{summaryEntries.length}{summaryLoading ? '…' : ''}</strong></div></div>
    <div className="report-summary-heading"><h3>Summary</h3><label>Group by<select value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupBy)}><option value="day">Day</option><option value="user">User</option><option value="client">Client</option><option value="project">Project</option><option value="task">Task</option></select></label></div>
    <div className="report-groups" aria-live="polite">{groups.length === 0 && !summaryLoading ? <p className="empty-entries">No completed entries match these filters.</p> : groups.map(([label, total]) => <div className="report-group" key={label}><strong>{label}</strong><span>{total.count} {total.count === 1 ? 'entry' : 'entries'}</span><b>{formatDuration(total.seconds)}</b></div>)}{summaryLoading && <p className="empty-entries">Updating summary…</p>}</div>
    <div className="report-summary-heading report-detail-heading"><h3>Detailed entries</h3><div className="report-detail-actions"><span>Newest first</span><button className="secondary-button" type="button" onClick={() => void exportCsv()} disabled={invalidRange || exporting}>{exporting ? `Exporting… ${exportProgress.toLocaleString()}` : 'Export CSV'}</button></div></div>
    {exportNotice && <p className="form-message is-success" role="status">{exportNotice}</p>}
    <div className="report-details">{entries.map((entry) => <article className="report-entry" key={entry.id}><div><strong>{entry.description || 'Untitled entry'}</strong><span>{entry.startAt.toDate().toLocaleString()} · {groupValue(entry, 'user', members)} · {[entry.clientName, entry.projectName, entry.taskName].filter(Boolean).join(' · ') || 'No client, project, or task'}</span></div><div className="report-entry-total"><b>{formatDuration(duration(entry))}</b>{entry.billable && <span className="billable-tag">Billable</span>}</div></article>)}{entries.length === 0 && !pageLoading && <p className="empty-entries">No completed entries match these filters.</p>}</div>
    {hasMore && <button className="secondary-button report-load-more" type="button" onClick={() => void loadMore()} disabled={pageLoading} aria-live="polite">{pageLoading ? 'Loading…' : 'Load more entries'}</button>}
  </section>
}
