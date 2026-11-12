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
import type { TFunction } from 'i18next'
import { type FormEvent, useState } from 'react'
import { useTranslation } from './i18n'
import { InviteTeamStep } from './InviteTeamStep'
import { type Catalog, saveCatalogRecord } from './lib/catalog'
import { readableError } from './lib/errors'
import { SETUP_STEPS, type SetupStep, nextSetupStep } from './lib/onboarding'
import { DEFAULT_PROJECT_COLOR } from './lib/projectColors'
import { FormMessage, SelectField } from './ui'

type CatalogStep = Exclude<SetupStep, 'invite'>

function stepLabel(step: SetupStep, t: TFunction): string {
  const labels: Record<SetupStep, string> = {
    client: t('setup.stepClient'),
    project: t('setup.stepProject'),
    task: t('setup.stepTask'),
    invite: t('setup.stepTeam'),
  }
  return labels[step]
}

function stepCopy(
  step: CatalogStep,
  t: TFunction,
): { field: string; title: string; hint: string; placeholder: string } {
  const copy: Record<CatalogStep, { field: string; title: string; hint: string; placeholder: string }> = {
    client: {
      field: t('setup.clientName'),
      title: t('setup.clientTitle'),
      hint: t('setup.clientHint'),
      placeholder: t('setup.clientPlaceholder'),
    },
    project: {
      field: t('setup.projectName'),
      title: t('setup.projectTitle'),
      hint: t('setup.projectHint'),
      placeholder: t('setup.projectPlaceholder'),
    },
    task: {
      field: t('setup.taskName'),
      title: t('setup.taskTitle'),
      hint: t('setup.taskHint'),
      placeholder: t('setup.taskPlaceholder'),
    },
  }
  return copy[step]
}

export type SetupSummary = { clientName?: string; projectName?: string; taskName?: string; invitedCount?: number }

function isStepCompleted(item: SetupStep, summary: SetupSummary): boolean {
  return item === 'invite' ? (summary.invitedCount ?? 0) > 0 : summary[`${item}Name`] !== undefined
}

/**
 * Guides a new owner through adding a first client, project, and task, then inviting their team. Each step
 * saves on its own, so leaving part-way keeps what was already added; `onFinish` fires when the owner
 * completes or skips the rest. `initialStep` opens it part-way, e.g. straight at inviting the team.
 */
export function SetupWizard({
  workspaceId,
  workspaceName,
  catalog,
  initialStep = 'client',
  onFinish,
}: {
  workspaceId: string
  workspaceName: string
  catalog: Catalog
  initialStep?: SetupStep
  onFinish: (summary: SetupSummary) => void
}) {
  const { t, i18n } = useTranslation()
  const [step, setStep] = useState<SetupStep>(initialStep)
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
  const visibleSteps = SETUP_STEPS.slice(SETUP_STEPS.indexOf(initialStep))
  // The catalog form below is only shown on catalog steps; the invite step has its own form.
  const copy = stepCopy(step === 'invite' ? 'task' : step, t)

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
      } else if (step === 'task' && project) {
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
            {t('setup.kicker', { workspace: workspaceName }).toLocaleUpperCase(i18n.language)}
          </Typography>
          <Typography variant="h1" id="setup-heading" sx={{ mt: 1 }}>
            {t('setup.title')}
          </Typography>
        </div>
        <Button size="small" onClick={() => onFinish(summary)} disabled={pending}>
          {t('setup.skipSetup')}
        </Button>
      </Stack>
      {/* Opened part-way (from the "Finish setup" card), only the steps from there on are shown, if more than one. */}
      {visibleSteps.length > 1 && (
        <Stepper activeStep={visibleSteps.indexOf(step)} sx={{ mb: 2.5 }}>
          {visibleSteps.map((item) => (
            // Only steps that added something get a checkmark; skipped ones stay plain.
            <Step key={item} completed={isStepCompleted(item, summary)}>
              <StepLabel optional={skipped.includes(item) ? t('setup.skipped') : undefined}>
                {stepLabel(item, t)}
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      )}
      {step === 'invite' ? (
        <InviteTeamStep workspaceId={workspaceId} onDone={(invitedCount) => onFinish({ ...summary, invitedCount })} />
      ) : (
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
              label={copy.field}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoFocus
              placeholder={copy.placeholder}
              helperText={step === 'task' && project ? t('setup.partOf', { project: project.name }) : undefined}
              slotProps={{ htmlInput: { maxLength: 120 } }}
            />
            {step === 'project' && (
              <TextField
                label={t('setup.color')}
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            )}
            {step === 'project' && activeClients.length > 0 && (
              <SelectField
                label={t('setup.client')}
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                sx={{ gridColumn: '1 / -1' }}
              >
                <option value="">{t('setup.noClient')}</option>
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
                label={t('common.billable')}
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
              {t('setup.skip')}
            </Button>
            <Button variant="contained" type="submit" disabled={pending || !name.trim()}>
              {pending ? t('setup.saving') : step === 'task' ? t('setup.finish') : t('setup.continue')}
            </Button>
          </Stack>
        </Paper>
      )}
    </Box>
  )
}
