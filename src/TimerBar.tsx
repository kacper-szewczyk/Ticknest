import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { User } from 'firebase/auth'
import { type FormEvent, useEffect, useState } from 'react'
import type { Catalog } from './lib/catalog'
import { formatElapsed } from './lib/dates'
import { readableError } from './lib/errors'
import { type TimeEntry, startTimer, stopTimer, subscribeToTimeEntries, updateRunningTimer } from './lib/timeEntries'
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
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {runningEntry.description || 'Untitled entry'}
          </Typography>
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
            required
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
