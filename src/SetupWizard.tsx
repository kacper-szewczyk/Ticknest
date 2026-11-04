import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Stepper from '@mui/material/Stepper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { type FormEvent, useState } from 'react'
import { type Catalog, saveCatalogRecord } from './lib/catalog'
import { readableError } from './lib/errors'
import { SETUP_STEPS, type SetupStep, nextSetupStep } from './lib/onboarding'
import { FormMessage, SelectField } from './ui'

const DEFAULT_PROJECT_COLOR = '#668a6b'

const STEP_COPY: Record<SetupStep, { label: string; title: string; hint: string; placeholder: string }> = {
  client: {
    label: 'Client',
    title: 'Who do you work for?',
    hint: 'Add your first client. Skip this step if you only track internal work.',
    placeholder: 'e.g. Acme Corp',
  },
  project: {
    label: 'Project',
    title: 'What’s your first project?',
    hint: 'Projects group your time. You can add more later under Clients & projects.',
    placeholder: 'e.g. Website redesign',
  },
  task: {
    label: 'Task',
    title: 'Add a first task',
    hint: 'Tasks split a project into pieces you track time against.',
    placeholder: 'e.g. Design review',
  },
}

export type SetupSummary = { clientName?: string; projectName?: string; taskName?: string }

/**
 * Guides a new owner through adding a first client, project, and task. Each step saves on its own, so
 * leaving part-way keeps what was already added; `onFinish` fires when the owner completes or skips the rest.
 */
export function SetupWizard({
  workspaceId,
  workspaceName,
  catalog,
  onFinish,
}: {
  workspaceId: string
  workspaceName: string
  catalog: Catalog
  onFinish: (summary: SetupSummary) => void
}) {
  const [step, setStep] = useState<SetupStep>('client')
  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_PROJECT_COLOR)
  const [billable, setBillable] = useState(false)
  const [clientId, setClientId] = useState('')
  const [project, setProject] = useState<{ id: string; name: string } | null>(null)
  const [summary, setSummary] = useState<SetupSummary>({})
  const [skipped, setSkipped] = useState<SetupStep[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const activeClients = catalog.clients.filter((client) => !client.archived)
  const copy = STEP_COPY[step]

  function advance(hasProject: boolean, nextSummary: SetupSummary) {
    setName('')
    setError('')
    const next = nextSetupStep(step, hasProject)
    if (next) setStep(next)
    else onFinish(nextSummary)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      const trimmed = name.trim()
      if (step === 'client') {
        const id = await saveCatalogRecord(workspaceId, 'clients', { name: trimmed })
        setClientId(id)
        const next = { ...summary, clientName: trimmed }
        setSummary(next)
        advance(false, next)
      } else if (step === 'project') {
        const id = await saveCatalogRecord(workspaceId, 'projects', { name: trimmed, clientId, color })
        setProject({ id, name: trimmed })
        const next = { ...summary, projectName: trimmed }
        setSummary(next)
        advance(true, next)
      } else if (project) {
        await saveCatalogRecord(workspaceId, 'tasks', { name: trimmed, projectId: project.id, billable })
        const next = { ...summary, taskName: trimmed }
        setSummary(next)
        advance(true, next)
      }
    } catch (requestError) {
      setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  return (
    <Box component="section" aria-labelledby="setup-heading" sx={{ maxWidth: 750, mx: 'auto', mt: 3 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ alignItems: { xs: 'flex-start', sm: 'flex-end' }, justifyContent: 'space-between', gap: 1, mb: 3 }}
      >
        <div>
          <Typography variant="overline" component="p" sx={{ overflowWrap: 'anywhere' }}>
            SET UP {workspaceName.toUpperCase()}
          </Typography>
          <Typography variant="h1" id="setup-heading" sx={{ mt: 1 }}>
            Get ready to track
          </Typography>
        </div>
        <Button size="small" onClick={() => onFinish(summary)} disabled={pending}>
          Skip setup
        </Button>
      </Stack>
      <Stepper activeStep={SETUP_STEPS.indexOf(step)} sx={{ mb: 2.5 }}>
        {SETUP_STEPS.map((item) => (
          // Only steps that added something get a checkmark; skipped ones stay plain.
          <Step key={item} completed={summary[`${item}Name`] !== undefined}>
            <StepLabel optional={skipped.includes(item) ? 'Skipped' : undefined}>{STEP_COPY[item].label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      <Paper
        component="form"
        variant="outlined"
        onSubmit={(event) => void handleSubmit(event)}
        aria-busy={pending}
        aria-labelledby="setup-step-heading"
        sx={{ display: 'grid', gap: 2, p: { xs: 2.25, sm: 4 }, borderRadius: '18px' }}
      >
        <div>
          <Typography variant="h2" id="setup-step-heading" sx={{ fontSize: 23 }}>
            {copy.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            {copy.hint}
          </Typography>
        </div>
        {error && <FormMessage severity="error">{error}</FormMessage>}
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: step === 'project' ? 'minmax(0, 1fr) 96px' : '1fr' },
            alignItems: 'start',
          }}
        >
          <TextField
            // Re-mount per step so the field takes focus again after advancing.
            key={step}
            label={`${copy.label} name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoFocus
            placeholder={copy.placeholder}
            helperText={step === 'task' && project ? `Part of ${project.name}` : undefined}
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />
          {step === 'project' && (
            <TextField label="Color" type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          )}
          {step === 'project' && activeClients.length > 0 && (
            <SelectField
              label="Client"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              sx={{ gridColumn: '1 / -1' }}
            >
              <option value="">No client</option>
              {activeClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </SelectField>
          )}
          {step === 'task' && (
            <FormControlLabel
              control={<Checkbox checked={billable} onChange={(event) => setBillable(event.target.checked)} />}
              label="Billable"
            />
          )}
        </Box>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
          <Button
            onClick={() => {
              setSkipped((current) => [...current, step])
              advance(project !== null, summary)
            }}
            disabled={pending}
          >
            Skip
          </Button>
          <Button variant="contained" type="submit" disabled={pending || !name.trim()}>
            {pending ? 'Saving…' : step === 'task' ? 'Finish' : 'Continue'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  )
}
