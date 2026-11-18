import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Snackbar from '@mui/material/Snackbar'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { User } from 'firebase/auth'
import type { TFunction } from 'i18next'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from './i18n'
import { autoStopNoticeEntry, markAutoStopNoticeSeen, readSeenAutoStopNotice } from './lib/autoStopNotice'
import type { Catalog } from './lib/catalog'
import { formatElapsed } from './lib/dates'
import { setTimerTitle } from './lib/documentTitle'
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
  const { t } = useTranslation()
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [description, setDescription] = useState('')
  const [work, setWork] = useState<WorkDetails>(() => workDetails(null))
  const [now, setNow] = useState(() => Date.now())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  // A short status message for screen readers ("Timer started"); never the ticking time.
  const [announcement, setAnnouncement] = useState('')
  // Where focus goes once the layout switches after this bar's own Start or Stop. Changes made elsewhere (another
  // tab, another device, the midnight auto-stop) leave it null, so they never move focus.
  const focusAfterSwitch = useRef<'stop' | 'description' | null>(null)
  const stopButtonRef = useRef<HTMLButtonElement>(null)
  const descriptionInputRef = useRef<HTMLInputElement>(null)

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
    // Set before the request: the running layout can render from the local write before the request resolves.
    focusAfterSwitch.current = 'stop'
    try {
      await startTimer(user, workspaceId, { description: description.trim(), ...work })
      setDescription('')
      setWork(workDetails(null))
      setAnnouncement(t('timer.started'))
    } catch (requestError) {
      focusAfterSwitch.current = null
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

  async function handleStop(entryId: string, startedAt: number | null) {
    setPending(true)
    setError('')
    focusAfterSwitch.current = 'description'
    try {
      await stopTimer(user, workspaceId, entryId)
      const seconds = startedAt === null ? 0 : Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      setAnnouncement(t('timer.stopped', { duration: spokenDuration(seconds, t) }))
    } catch (requestError) {
      focusAfterSwitch.current = null
      setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  const elapsed = runningEntry?.startAt
    ? Math.max(0, Math.floor(now / 1000 - runningEntry.startAt.toMillis() / 1000))
    : 0

  // Show the running timer in the browser tab, driven by the same one-second clock as the bar. The current view's
  // title comes back when the timer stops or the bar unmounts (sign-out, leaving the workspace).
  const tabTitle = runningEntry ? runningTimerTitle(elapsed, runningEntry) : null
  useEffect(() => {
    setTimerTitle(tabTitle)
  }, [tabTitle])
  useEffect(() => () => setTimerTitle(null), [])

  // Move focus into the new layout after a Start or Stop from this bar, once its controls are enabled again.
  const isRunning = runningEntry !== undefined
  useEffect(() => {
    if (pending) return
    const target =
      focusAfterSwitch.current === 'stop' && isRunning
        ? stopButtonRef.current
        : focusAfterSwitch.current === 'description' && !isRunning
          ? descriptionInputRef.current
          : null
    if (!target) return
    focusAfterSwitch.current = null
    target.focus()
  }, [isRunning, pending])

  const elapsedText = (
    <Typography
      component="span"
      sx={{
        color: runningEntry ? 'primary.main' : 'text.secondary',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 20,
        fontWeight: 650,
        letterSpacing: 0.5,
        flexShrink: 0,
      }}
    >
      <Box component="span" sx={visuallyHiddenSx}>
        {t('timer.elapsedLabel')}{' '}
      </Box>
      {formatElapsed(elapsed)}
    </Typography>
  )

  return (
    <Box component="section" aria-label={t('timer.region')} sx={{ px: { xs: 1.5, sm: 2.25, md: 4 }, py: 1.25 }}>
      {error && <FormMessage severity="error">{error}</FormMessage>}
      <Box role="status" sx={visuallyHiddenSx}>
        {announcement}
      </Box>
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
          {t('timer.autoStopped', { description: autoStoppedEntry?.description || t('common.untitledEntry') })}
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
            ref={stopButtonRef}
            onClick={() => void handleStop(runningEntry.id, runningEntry.startAt?.toMillis() ?? null)}
            disabled={pending}
            sx={{ flexShrink: 0 }}
          >
            {pending ? t('common.saving') : t('timer.stop')}
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
            inputRef={descriptionInputRef}
            placeholder={t('timer.placeholder')}
            slotProps={{ htmlInput: { maxLength: 500, 'aria-label': t('timer.placeholder') } }}
          />
          <Box sx={{ gridColumn: { xs: '1 / -1', lg: 'auto' }, gridRow: { xs: 2, lg: 'auto' }, minWidth: 0 }}>
            <WorkPicker size="small" catalog={catalog} value={work} onChange={setWork} disabled={pending} />
          </Box>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>{work.billable && <BillableChip />}</Box>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>{elapsedText}</Box>
          <Button variant="contained" type="submit" disabled={pending} sx={{ flexShrink: 0 }}>
            {pending ? t('timer.starting') : t('timer.start')}
          </Button>
        </Box>
      )}
    </Box>
  )
}

// The running timer's description, edited in place. It saves when the field loses focus or Enter is pressed;
// Escape puts back the saved description. Enter saves without leaving the field, and the field stays focusable
// while saving, so a failed save leaves the user where they were. The error itself shows above the bar.
function RunningDescriptionField({
  savedDescription,
  onSave,
}: {
  savedDescription: string
  onSave: (description: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(savedDescription)
  const [lastSaved, setLastSaved] = useState(savedDescription)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  // The last value this field saved, until the saved description catches up, so a blur after Enter does not save
  // the same text twice.
  const [justSaved, setJustSaved] = useState<string | null>(null)

  // Follow changes saved elsewhere (another tab or device) unless the user has unsaved edits.
  if (savedDescription !== lastSaved) {
    setLastSaved(savedDescription)
    setJustSaved(null)
    if (draft.trim() === lastSaved.trim()) setDraft(savedDescription)
  }

  async function save() {
    const nextDescription = draft.trim()
    setDraft(nextDescription)
    if (nextDescription === (justSaved ?? savedDescription.trim()) || saving) return
    setSaving(true)
    setFailed(false)
    try {
      await onSave(nextDescription)
      setJustSaved(nextDescription)
    } catch {
      setDraft(justSaved ?? savedDescription)
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <TextField
      size="small"
      value={draft}
      onChange={(event) => {
        if (saving) return
        setDraft(event.target.value)
        setFailed(false)
      }}
      onBlur={() => void save()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          void save()
        } else if (event.key === 'Escape') {
          setDraft(justSaved ?? savedDescription)
          setFailed(false)
          // Blur after the revert has rendered so the blur handler sees the saved value.
          const input = event.currentTarget.querySelector('input')
          window.setTimeout(() => input?.blur())
        }
      }}
      placeholder={t('common.untitledEntry')}
      slotProps={{
        htmlInput: {
          maxLength: 500,
          'aria-label': t('timer.runningDescription'),
          readOnly: saving,
          'aria-busy': saving,
          'aria-invalid': failed,
        },
      }}
      sx={{ '& .MuiInputBase-input': { fontWeight: 600 } }}
    />
  )
}

// Hours and minutes for the "timer stopped" announcement, such as "1 h 12 min".
function spokenDuration(seconds: number, t: TFunction): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return t('timer.durationHours', { hours, minutes })
  return minutes > 0 ? t('timer.durationMinutes', { minutes }) : t('timer.durationUnderMinute')
}

const visuallyHiddenSx = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const
