import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import SpeedDial from '@mui/material/SpeedDial'
import SpeedDialAction from '@mui/material/SpeedDialAction'
import SpeedDialIcon from '@mui/material/SpeedDialIcon'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import type { Catalog } from './lib/catalog'
import { NavIcon } from './AppShell'
import { EntryEditor } from './EntryEditor'
import { dayDate, formatElapsed, formatWeekLabel, localDayString, shiftDayString, startOfWeekString } from './lib/dates'
import { readableError } from './lib/errors'
import { type TimeEntry, continueTimer, deleteTimeEntry, subscribeToEntriesForRange } from './lib/timeEntries'
import { AutoStoppedChip, BillableChip, EmptyText, FormMessage, SectionCard, SectionHeading } from './ui'

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
  const [editor, setEditor] = useState<{ entry?: TimeEntry; day: string } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [now, setNow] = useState(() => Date.now())

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

  function openEditor(day: string, entry?: TimeEntry) {
    setEditor({ entry, day })
    setError('')
    setNotice('')
  }

  async function handleDelete(entry: TimeEntry) {
    if (!window.confirm(`Delete “${entry.description || 'Untitled entry'}”?`)) return
    setPending(true)
    setError('')
    setNotice('')
    try {
      await deleteTimeEntry(workspaceId, entry)
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
  }

  const weekDays = Array.from({ length: 7 }, (_, index) => shiftDayString(weekStart, index))
  const secondsFor = (entry: TimeEntry) =>
    entry.endAt
      ? Math.max(0, Math.floor((entry.endAt.toMillis() - entry.startAt.toMillis()) / 1000))
      : Math.max(0, Math.floor(now / 1000 - entry.startAt.toMillis() / 1000))
  const weekTotal = entries.reduce((total, entry) => total + secondsFor(entry), 0)

  return (
    <SectionCard labelledBy="entries-heading" sx={{ mb: { xs: 10, sm: 12 } }}>
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
                  <Button size="small" onClick={() => openEditor(weekDay)}>
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
                      {entry.autoStopped === true && <AutoStoppedChip />}
                      {entry.billable && <BillableChip />}
                      {entry.endAt !== null && entry.userId === user.uid && (
                        <Button size="small" onClick={() => void handleContinue(entry)} disabled={pending}>
                          Continue
                        </Button>
                      )}
                      <Button
                        size="small"
                        onClick={() => openEditor(weekDay, entry)}
                        disabled={pending || entry.endAt === null}
                      >
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
      <SpeedDial
        ariaLabel="Add time"
        icon={<SpeedDialIcon />}
        sx={{ position: 'fixed', right: { xs: 16, sm: 32 }, bottom: { xs: 16, sm: 32 } }}
      >
        <SpeedDialAction
          icon={
            <NavIcon>
              <path d="M4 7h16M4 12h10M4 17h7M17 14v6M14 17h6" />
            </NavIcon>
          }
          slotProps={{ tooltip: { title: 'Add manual entry', open: true } }}
          onClick={() => openEditor(weekDays.includes(today) ? today : weekStart)}
        />
      </SpeedDial>
      {editor && (
        <EntryEditor
          workspaceId={workspaceId}
          catalog={catalog}
          entry={editor.entry}
          day={editor.day}
          onClose={() => setEditor(null)}
          onSaved={(message) => {
            setEditor(null)
            setNotice(message)
          }}
        />
      )}
    </SectionCard>
  )
}
