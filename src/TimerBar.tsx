import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Snackbar from '@mui/material/Snackbar'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { User } from 'firebase/auth'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { autoStopNoticeEntry, markAutoStopNoticeSeen, readSeenAutoStopNotice } from './lib/autoStopNotice'
import type { Catalog } from './lib/catalog'
import { formatElapsed } from './lib/dates'
import { readableError } from './lib/errors'
import { runningTimerTitle } from './lib/tabTitle'
import {
  type TimeEntry,
  startTimer,
  stopTimer,
  subscribeToTimeEntries,
  updateRunningTimer,
  updateRunningTimerDescription,
} from './lib/timeEntries'
import { type WorkDetails, workDetails } from './lib/workOptions'
import { BillableChip, FormMessage } from './ui'
import { WorkPicker } from './WorkPicker'

// Always-visible timer at the top of every workspace page.
export function TimerBar({ user, workspaceId, catalog }: { user: User; workspaceId: string; catalog: Catalog }) {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [description, setDescription] = useState('')
  const [work, setWork] = useState<WorkDetails>(() => workDetails(null))
  const [now, setNow] = useState(() => Date.now())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(
    () => subscribeToTimeEntries(workspaceId, user.uid, setEntries, (loadError) => setError(readableError(loadError))),
    [workspaceId, user.uid],
  )
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const runningEntry = entries.find((entry) => entry.endAt === null)

  // Tell the user once when their last timer was stopped automatically at midnight. The notice compares against
  // what was seen when the workspace opened, so it stays up for this visit after being recorded as seen.
  const seenAutoStopId = useMemo(() => readSeenAutoStopNotice(user.uid, workspaceId), [user.uid, workspaceId])
  const autoStoppedEntry = autoStopNoticeEntry(entries, seenAutoStopId)
  const autoStoppedEntryId = autoStoppedEntry?.id
  const [dismissedAutoStopId, setDismissedAutoStopId] = useState<string | null>(null)
  const isAutoStopNoticeOpen = autoStoppedEntry !== null && autoStoppedEntry.id !== dismissedAutoStopId
  useEffect(() => {
    if (autoStoppedEntryId) markAutoStopNoticeSeen(user.uid, workspaceId, autoStoppedEntryId)
  }, [autoStoppedEntryId, user.uid, workspaceId])

  async function handleStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      await startTimer(user, workspaceId, { description: description.trim(), ...work })
      setDescription('')
      setWork(workDetails(null))
    } catch (requestError) {
      setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  async function handleRunningWorkChange(entryId: string, details: WorkDetails) {
    setPending(true)
    setError('')
    try {
      await updateRunningTimer(workspaceId, entryId, details)
    } catch (requestError) {
      setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  async function handleRunningDescriptionChange(entryId: string, nextDescription: string) {
    setError('')
    try {
      await updateRunningTimerDescription(workspaceId, entryId, nextDescription)
    } catch (requestError) {
      setError(readableError(requestError))
      throw requestError
    }
  }

  async function handleStop(entryId: string) {
    setPending(true)
    setError('')
    try {
      await stopTimer(user, workspaceId, entryId)
    } catch (requestError) {
      setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  const elapsed = runningEntry?.startAt
    ? Math.max(0, Math.floor(now / 1000 - runningEntry.startAt.toMillis() / 1000))
    : 0

  // Show the running timer in the browser tab, driven by the same one-second clock as the bar. The title that was
  // there before comes back when the timer stops or the bar unmounts (sign-out, leaving the workspace).
  const isRunning = runningEntry !== undefined
  const tabTitle = runningEntry ? runningTimerTitle(elapsed, runningEntry) : null
  useEffect(() => {
    if (!isRunning) return
    const defaultTitle = document.title
    return () => {
      document.title = defaultTitle
    }
  }, [isRunning])
  useEffect(() => {
    if (tabTitle !== null) document.title = tabTitle
  }, [tabTitle])

  const elapsedText = (
    <Typography
      component="span"
      aria-label={`Elapsed time ${formatElapsed(elapsed)}`}
      sx={{
        color: runningEntry ? 'primary.main' : 'text.secondary',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 20,
        fontWeight: 650,
        letterSpacing: 0.5,
        flexShrink: 0,
      }}
    >
      {formatElapsed(elapsed)}
    </Typography>
  )

  return (
    <Box component="section" aria-label="Timer" sx={{ px: { xs: 1.5, sm: 2.25, md: 4 }, py: 1.25 }}>
      {error && <FormMessage severity="error">{error}</FormMessage>}
      <Snackbar
        open={isAutoStopNoticeOpen}
        onClose={(_event, reason) => reason !== 'clickaway' && setDismissedAutoStopId(autoStoppedEntryId ?? null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="info"
          variant="filled"
          onClose={() => setDismissedAutoStopId(autoStoppedEntryId ?? null)}
          sx={{ width: '100%' }}
        >
          Your timer “{autoStoppedEntry?.description || 'Untitled entry'}” ran past midnight, so it was stopped at the
          end of the day it started. Edit the entry if you worked later.
        </Alert>
      </Snackbar>
      {runningEntry ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr) auto auto',
              sm: 'minmax(0, 1fr) auto auto auto',
              lg: 'minmax(0, 2fr) minmax(0, 1.5fr) auto auto auto',
            },
            alignItems: 'center',
            gap: 1.25,
            minHeight: 48,
          }}
        >
          <RunningDescriptionField
            key={runningEntry.id}
            savedDescription={runningEntry.description}
            onSave={(nextDescription) => handleRunningDescriptionChange(runningEntry.id, nextDescription)}
          />
          <Box sx={{ gridColumn: { xs: '1 / -1', lg: 'auto' }, gridRow: { xs: 2, lg: 'auto' }, minWidth: 0 }}>
            <WorkPicker
              size="small"
              catalog={catalog}
              value={{
                clientId: runningEntry.clientId ?? null,
                projectId: runningEntry.projectId ?? null,
                taskId: runningEntry.taskId ?? null,
              }}
              onChange={(details) => void handleRunningWorkChange(runningEntry.id, details)}
              disabled={pending}
            />
          </Box>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>{runningEntry.billable && <BillableChip />}</Box>
          {elapsedText}
          <Button
            variant="contained"
            color="error"
            onClick={() => void handleStop(runningEntry.id)}
            disabled={pending}
            sx={{ flexShrink: 0 }}
          >
            {pending ? 'Saving…' : 'Stop'}
          </Button>
        </Box>
      ) : (
        <Box
          component="form"
          onSubmit={handleStart}
          aria-busy={pending}
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr) auto',
              sm: 'minmax(0, 1fr) auto auto auto',
              lg: 'minmax(0, 2fr) minmax(0, 1.5fr) auto auto auto',
            },
            alignItems: 'center',
            gap: 1.25,
          }}
        >
          <TextField
            size="small"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What are you working on?"
            slotProps={{ htmlInput: { maxLength: 500, 'aria-label': 'What are you working on?' } }}
          />
          <Box sx={{ gridColumn: { xs: '1 / -1', lg: 'auto' }, gridRow: { xs: 2, lg: 'auto' }, minWidth: 0 }}>
            <WorkPicker size="small" catalog={catalog} value={work} onChange={setWork} disabled={pending} />
          </Box>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>{work.billable && <BillableChip />}</Box>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>{elapsedText}</Box>
          <Button variant="contained" type="submit" disabled={pending} sx={{ flexShrink: 0 }}>
            {pending ? 'Starting…' : 'Start'}
          </Button>
        </Box>
      )}
    </Box>
  )
}

// The running timer's description, edited in place. It saves when the field loses focus or Enter is pressed;
// Escape puts back the saved description.
function RunningDescriptionField({
  savedDescription,
  onSave,
}: {
  savedDescription: string
  onSave: (description: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(savedDescription)
  const [lastSaved, setLastSaved] = useState(savedDescription)
  const [saving, setSaving] = useState(false)

  // Follow changes saved elsewhere (another tab or device) unless the user has unsaved edits.
  if (savedDescription !== lastSaved) {
    setLastSaved(savedDescription)
    if (draft.trim() === lastSaved.trim()) setDraft(savedDescription)
  }

  async function save() {
    const nextDescription = draft.trim()
    setDraft(nextDescription)
    if (nextDescription === savedDescription.trim() || saving) return
    setSaving(true)
    try {
      await onSave(nextDescription)
    } catch {
      setDraft(savedDescription)
    } finally {
      setSaving(false)
    }
  }

  return (
    <TextField
      size="small"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void save()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.querySelector('input')?.blur()
        } else if (event.key === 'Escape') {
          setDraft(savedDescription)
          // Blur after the revert has rendered so the blur handler sees the saved value.
          const input = event.currentTarget.querySelector('input')
          window.setTimeout(() => input?.blur())
        }
      }}
      placeholder="Untitled entry"
      disabled={saving}
      slotProps={{
        htmlInput: { maxLength: 500, 'aria-label': 'Description of the running timer' },
      }}
      sx={{ '& .MuiInputBase-input': { fontWeight: 600 } }}
    />
  )
}
