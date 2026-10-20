import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { User } from 'firebase/auth'
import { type FormEvent, useEffect, useState } from 'react'
import type { Catalog } from './lib/catalog'
import {
  dateTimeForDay,
  dayDate,
  formatElapsed,
  formatWeekLabel,
  localDateTimeValue,
  localDayString,
  shiftDayString,
  startOfWeekString,
} from './lib/dates'
import { readableError } from './lib/errors'
import {
  type TimeEntry,
  continueTimer,
  deleteTimeEntry,
  saveManualTimeEntry,
  subscribeToEntriesForRange,
} from './lib/timeEntries'
import { type WorkDetails, workDetails } from './lib/workOptions'
import { BillableChip, EmptyText, FormMessage, SectionCard, SectionHeading } from './ui'
import { useManualEntryFieldErrors } from './useManualEntryFieldErrors'
import { WorkPicker } from './WorkPicker'

export function TimeEntriesPanel({
  user,
  workspaceId,
  isOwner,
  weekStartsOn,
  catalog,
}: {
  user: User
  workspaceId: string
  isOwner: boolean
  weekStartsOn: number
  catalog: Catalog
}) {
  const [today] = useState(() => localDayString(new Date()))
  const [weekStart, setWeekStart] = useState(() => startOfWeekString(today, weekStartsOn))
  const [entryState, setEntryState] = useState<{ workspaceId: string; weekStart: string; entries: TimeEntry[] }>({
    workspaceId: '',
    weekStart: '',
    entries: [],
  })
  const entries = entryState.workspaceId === workspaceId && entryState.weekStart === weekStart ? entryState.entries : []
  const [editId, setEditId] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [work, setWork] = useState<WorkDetails>(() => workDetails(null))
  const [editorDay, setEditorDay] = useState(today)
  const [startAt, setStartAt] = useState(() => dateTimeForDay(today, 9))
  const [endAt, setEndAt] = useState(() => dateTimeForDay(today, 10))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const { fieldProps, showFieldError, clearFieldError, clearFieldErrors } = useManualEntryFieldErrors()

  useEffect(() => {
    return subscribeToEntriesForRange(
      workspaceId,
      user.uid,
      isOwner,
      weekStart,
      7,
      (nextEntries) => setEntryState({ workspaceId, weekStart, entries: nextEntries }),
      (loadError) => setError(readableError(loadError)),
    )
  }, [workspaceId, user.uid, isOwner, weekStart])
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  function clearForm(forDay = weekStart) {
    setEditId(null)
    setDescription('')
    setWork(workDetails(null))
    setEditorDay(forDay)
    setStartAt(dateTimeForDay(forDay, 9))
    setEndAt(dateTimeForDay(forDay, 10))
    clearFieldErrors()
  }

  function beginEdit(entry: TimeEntry) {
    if (entry.endAt === null) return
    setEditId(entry.id)
    setDescription(entry.description)
    setWork({
      clientId: entry.clientId ?? null,
      clientName: entry.clientName,
      projectId: entry.projectId ?? null,
      projectName: entry.projectName,
      taskId: entry.taskId ?? null,
      taskName: entry.taskName,
      billable: entry.billable,
    })
    setStartAt(localDateTimeValue(entry.startAt.toDate()))
    setEndAt(localDateTimeValue(entry.endAt.toDate()))
    setError('')
    setNotice('')
    clearFieldErrors()
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    setNotice('')
    clearFieldErrors()
    try {
      await saveManualTimeEntry(
        workspaceId,
        {
          description,
          clientId: work.clientId,
          projectId: work.projectId,
          taskId: work.taskId,
          billable: work.billable,
          startAt: new Date(startAt),
          endAt: new Date(endAt),
        },
        editId ?? undefined,
      )
      clearForm()
      setNotice(editId ? 'Time entry updated.' : 'Time entry added.')
    } catch (requestError) {
      if (!showFieldError(requestError)) setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  async function handleDelete(entry: TimeEntry) {
    if (!window.confirm(`Delete “${entry.description || 'Untitled entry'}”?`)) return
    setPending(true)
    setError('')
    setNotice('')
    try {
      await deleteTimeEntry(workspaceId, entry)
      if (editId === entry.id) clearForm()
      setNotice('Time entry deleted.')
    } catch (requestError) {
      setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  async function handleContinue(entry: TimeEntry) {
    setPending(true)
    setError('')
    setNotice('')
    try {
      await continueTimer(user, workspaceId, entry)
    } catch (requestError) {
      setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  function changeWeek(value: string) {
    if (!value) return
    const nextWeekStart = startOfWeekString(value, weekStartsOn)
    setWeekStart(nextWeekStart)
    setError('')
    setNotice('')
    clearForm(nextWeekStart)
  }

  const weekDays = Array.from({ length: 7 }, (_, index) => shiftDayString(weekStart, index))
  const secondsFor = (entry: TimeEntry) =>
    entry.endAt
      ? Math.max(0, Math.floor((entry.endAt.toMillis() - entry.startAt.toMillis()) / 1000))
      : Math.max(0, Math.floor(now / 1000 - entry.startAt.toMillis() / 1000))
  const weekTotal = entries.reduce((total, entry) => total + secondsFor(entry), 0)

  return (
    <SectionCard labelledBy="entries-heading">
      <SectionHeading
        id="entries-heading"
        kicker="YOUR TIME"
        title="Timesheet"
        action={
          <Stack
            direction="row"
            aria-label="Timesheet week navigation"
            spacing={1}
            sx={{ alignItems: 'center', width: { xs: '100%', sm: 'auto' }, justifyContent: 'space-between' }}
          >
            <Button
              variant="outlined"
              aria-label="Previous week"
              onClick={() => changeWeek(shiftDayString(weekStart, -7))}
              sx={{ minWidth: 44, px: 1 }}
            >
              ←
            </Button>
            <Stack sx={{ alignItems: 'center', flex: { xs: 1, sm: 'none' } }}>
              <Typography variant="body2" sx={{ fontWeight: 650 }}>
                {formatWeekLabel(weekStart)}
              </Typography>
              <TextField
                variant="standard"
                type="date"
                value={weekStart}
                onChange={(event) => changeWeek(event.target.value)}
                fullWidth={false}
                slotProps={{
                  htmlInput: { 'aria-label': 'Choose a week', style: { fontSize: 12, padding: 0 } },
                  input: { disableUnderline: true },
                }}
                sx={{ width: 130 }}
              />
            </Stack>
            <Button
              variant="outlined"
              aria-label="Next week"
              onClick={() => changeWeek(shiftDayString(weekStart, 7))}
              sx={{ minWidth: 44, px: 1 }}
            >
              →
            </Button>
            <Button size="small" onClick={() => changeWeek(today)}>
              Today
            </Button>
          </Stack>
        }
      />
      {error && <FormMessage severity="error">{error}</FormMessage>}
      {notice && <FormMessage severity="success">{notice}</FormMessage>}
      <Paper
        component="form"
        variant="outlined"
        onSubmit={handleSave}
        aria-busy={pending}
        sx={{ display: 'grid', gap: 2, mt: 3, p: 2.25, borderRadius: '12px', bgcolor: 'app.surface' }}
      >
        <Typography variant="h3">
          {editId
            ? 'Edit entry'
            : `Add time · ${dayDate(editorDay).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`}
        </Typography>
        <TextField
          label="Description"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value)
            clearFieldError('description')
          }}
          required
          {...fieldProps('description')}
          slotProps={{ htmlInput: { maxLength: 500 } }}
        />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
          <TextField
            label="Start"
            type="datetime-local"
            value={startAt}
            onChange={(event) => {
              setStartAt(event.target.value)
              clearFieldError('startAt')
              clearFieldError('endAt')
            }}
            required
            {...fieldProps('startAt')}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="End"
            type="datetime-local"
            value={endAt}
            onChange={(event) => {
              setEndAt(event.target.value)
              clearFieldError('endAt')
            }}
            required
            {...fieldProps('endAt')}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>
        <WorkPicker catalog={catalog} value={work} onChange={setWork} />
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {work.billable && (
            <Box sx={{ mr: 'auto' }}>
              <BillableChip />
            </Box>
          )}
          {editId && (
            <Button variant="outlined" onClick={() => clearForm()} disabled={pending}>
              Cancel
            </Button>
          )}
          <Button variant="contained" type="submit" disabled={pending}>
            {pending ? 'Saving…' : editId ? 'Save changes' : 'Add entry'}
          </Button>
        </Stack>
      </Paper>
      <Paper
        variant="outlined"
        aria-live="polite"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          mt: 3,
          px: 2,
          py: 1.75,
          borderRadius: '11px',
          borderColor: 'app.tintBorder',
          bgcolor: 'app.tint',
        }}
      >
        <Box sx={{ display: 'grid', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            Week total
          </Typography>
          <Typography sx={{ color: 'primary.main', fontVariantNumeric: 'tabular-nums', fontSize: 20, fontWeight: 700 }}>
            {formatElapsed(weekTotal)}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'} this week
        </Typography>
      </Paper>
      <Box aria-live="polite" sx={{ mt: 2.25 }}>
        {weekDays.map((weekDay) => {
          const dayEntries = entries
            .filter((entry) => localDayString(entry.startAt.toDate()) === weekDay)
            .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())
          const dayTotal = dayEntries.reduce((total, entry) => total + secondsFor(entry), 0)
          const date = dayDate(weekDay)
          return (
            <Box
              component="section"
              key={weekDay}
              aria-labelledby={`timesheet-${weekDay}`}
              sx={{ pt: 2, pb: 0.75, borderBottom: 1, borderColor: 'divider' }}
            >
              <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1.75 }}>
                <Typography
                  variant="h3"
                  id={`timesheet-${weekDay}`}
                  sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}
                >
                  <span>{date.toLocaleDateString(undefined, { weekday: 'long' })}</span>
                  <Typography component="time" variant="caption" color="text.secondary" dateTime={weekDay}>
                    {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </Typography>
                </Typography>
                <Stack direction="row" spacing={{ xs: 0.5, sm: 1.75 }} sx={{ alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {formatElapsed(dayTotal)}
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => {
                      clearForm(weekDay)
                      setError('')
                      setNotice('')
                    }}
                  >
                    Add entry
                  </Button>
                </Stack>
              </Stack>
              {dayEntries.length === 0 ? (
                <EmptyText>No entries</EmptyText>
              ) : (
                dayEntries.map((entry) => (
                  <Box
                    component="article"
                    key={entry.id}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '54px minmax(0, 1fr) auto', sm: '78px minmax(0, 1fr) auto auto' },
                      alignItems: 'center',
                      gap: { xs: 1, sm: 1.75 },
                      py: 1.5,
                      borderTop: 1,
                      borderColor: 'app.track',
                      minWidth: 0,
                    }}
                  >
                    <Box sx={{ display: 'grid', gap: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {entry.startAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {entry.endAt
                          ? entry.endAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'Running'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                        {entry.description || 'Untitled entry'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {[entry.clientName, entry.projectName, entry.taskName].filter(Boolean).join(' · ') ||
                          'No client, project, or task'}
                        {entry.userId !== user.uid && ' · Workspace member'}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>
                      {formatElapsed(secondsFor(entry))}
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        justifyContent: 'flex-end',
                        gridColumn: { xs: '1 / -1', sm: 'auto' },
                      }}
                    >
                      {entry.endAt === null && <Chip label="Running" color="warning" variant="outlined" />}
                      {entry.billable && <BillableChip />}
                      {entry.endAt !== null && entry.userId === user.uid && (
                        <Button size="small" onClick={() => void handleContinue(entry)} disabled={pending}>
                          Continue
                        </Button>
                      )}
                      <Button size="small" onClick={() => beginEdit(entry)} disabled={pending || entry.endAt === null}>
                        Edit
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => void handleDelete(entry)}
                        disabled={pending || entry.endAt === null}
                      >
                        Delete
                      </Button>
                    </Stack>
                  </Box>
                ))
              )}
            </Box>
          )
        })}
      </Box>
    </SectionCard>
  )
}
