import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { User } from 'firebase/auth'
import { type FormEvent, useEffect, useState } from 'react'
import type { Catalog } from './lib/catalog'
import { formatElapsed } from './lib/dates'
import { readableError } from './lib/errors'
import { type TimeEntry, startTimer, stopTimer, subscribeToTimeEntries } from './lib/timeEntries'
import { FormMessage, SelectField } from './ui'

// Always-visible timer at the top of every workspace page.
export function TimerBar({ user, workspaceId, catalog }: { user: User; workspaceId: string; catalog: Catalog }) {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [description, setDescription] = useState('')
  const [clientName, setClientName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [taskName, setTaskName] = useState('')
  const [billable, setBillable] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
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
      await startTimer(user, workspaceId, {
        description: description.trim(),
        clientId: clientName || null,
        projectId: projectName || null,
        taskId: taskName || null,
        clientName: catalog.clients.find((item) => item.id === clientName)?.name ?? null,
        projectName: catalog.projects.find((item) => item.id === projectName)?.name ?? null,
        taskName: catalog.tasks.find((item) => item.id === taskName)?.name ?? null,
        billable,
      })
      setDescription('')
      setClientName('')
      setProjectName('')
      setTaskName('')
      setBillable(false)
      setShowDetails(false)
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
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', minHeight: 48 }}>
          <Box sx={{ display: 'grid', gap: 0.25, minWidth: 0, flex: 1 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
              {runningEntry.description || 'Untitled entry'}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {[runningEntry.clientName, runningEntry.projectName, runningEntry.taskName].filter(Boolean).join(' · ') ||
                'No client, project, or task'}
              {runningEntry.billable && ' · Billable'}
            </Typography>
          </Box>
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
        </Stack>
      ) : (
        <Box
          component="form"
          onSubmit={handleStart}
          aria-busy={pending}
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr) auto auto',
              sm: 'minmax(0, 1fr) auto auto auto',
              lg: 'minmax(0, 2fr) repeat(3, minmax(0, 1fr)) auto auto auto',
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
          <Box
            sx={{
              display: { xs: showDetails ? 'grid' : 'none', lg: 'contents' },
              gridColumn: { xs: '1 / -1', lg: 'auto' },
              gridRow: { xs: 2, lg: 'auto' },
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr)) auto' },
              alignItems: 'center',
              gap: 1.25,
            }}
          >
            <SelectField
              size="small"
              label="Client"
              value={clientName}
              onChange={(event) => {
                setClientName(event.target.value)
                setProjectName('')
                setTaskName('')
              }}
            >
              <option value="">No client</option>
              {catalog.clients
                .filter((item) => !item.archived)
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
            </SelectField>
            <SelectField
              size="small"
              label="Project"
              value={projectName}
              onChange={(event) => {
                setProjectName(event.target.value)
                setTaskName('')
              }}
            >
              <option value="">No project</option>
              {catalog.projects
                .filter(
                  (item) =>
                    !item.archived &&
                    (!clientName || item.clientId === clientName) &&
                    (!item.clientId ||
                      catalog.clients.some((client) => client.id === item.clientId && !client.archived)),
                )
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
            </SelectField>
            <SelectField
              size="small"
              label="Task"
              value={taskName}
              onChange={(event) => setTaskName(event.target.value)}
            >
              <option value="">No task</option>
              {catalog.tasks
                .filter(
                  (item) =>
                    !item.archived &&
                    (!projectName || item.projectId === projectName) &&
                    catalog.projects.some(
                      (project) =>
                        project.id === item.projectId &&
                        !project.archived &&
                        (!project.clientId ||
                          catalog.clients.some((client) => client.id === project.clientId && !client.archived)),
                    ),
                )
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
            </SelectField>
            <FormControlLabel
              control={
                <Checkbox size="small" checked={billable} onChange={(event) => setBillable(event.target.checked)} />
              }
              label="Billable"
              sx={{ mr: 0 }}
            />
          </Box>
          <Button
            size="small"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((open) => !open)}
            sx={{ display: { lg: 'none' }, minWidth: 0 }}
          >
            {showDetails ? 'Less' : 'Details'}
          </Button>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>{elapsedText}</Box>
          <Button variant="contained" type="submit" disabled={pending} sx={{ flexShrink: 0 }}>
            {pending ? 'Starting…' : 'Start'}
          </Button>
        </Box>
      )}
    </Box>
  )
}
