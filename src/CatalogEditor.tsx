import { useState, type FormEvent } from 'react'
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Drawer from '@mui/material/Drawer'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { saveCatalogRecord, type Catalog, type CatalogInput } from './lib/catalog'
import {
  CATALOG_NOUNS,
  groupProjectsByClient,
  selectableRecords,
  type CatalogKind,
  type CatalogRecord,
} from './lib/catalogList'
import { readableError } from './lib/errors'
import { ESTIMATE_HOURS, formatHoursInput, parseHoursInput } from './lib/hours'
import { DEFAULT_PROJECT_COLOR } from './lib/projectColors'
import { ProjectColorField } from './ProjectColorField'
import { FormMessage } from './ui'

type ClientOption = { id: string; label: string }
const NO_CLIENT: ClientOption = { id: '', label: 'No client' }

type ProjectOption = { id: string; label: string; color: string; group: string }
// Typing in the project picker also finds projects by their client's name.
const filterProjectOptions = createFilterOptions<ProjectOption>({
  stringify: (option) => `${option.label} ${option.group}`,
})

/** Active projects (plus the one the task already has) grouped by client in the time-entry picker's order. */
function projectOptionsFor(catalog: Catalog, currentId: string): ProjectOption[] {
  return groupProjectsByClient(selectableRecords(catalog.projects, currentId), catalog.clients).flatMap((group) =>
    group.projects.map((project) => ({
      id: project.id,
      label: project.label,
      color: project.color,
      group: group.clientArchived ? `${group.name} (archived)` : group.name,
    })),
  )
}

type Draft = {
  name: string
  clientId: string
  projectId: string
  description: string
  color: string
  estimate: string
  billable: boolean
}
type Field = 'name' | 'projectId' | 'estimate'
type FieldErrors = Partial<Record<Field, string>>

function initialDraft(
  kind: CatalogKind,
  catalog: Catalog,
  record: CatalogRecord | undefined,
  defaultProjectId: string,
): Draft {
  const draft: Draft = {
    name: record?.name ?? '',
    clientId: '',
    projectId: record ? '' : defaultProjectId,
    description: '',
    color: DEFAULT_PROJECT_COLOR,
    estimate: '',
    billable: false,
  }
  if (!record) return draft
  if (kind === 'projects') {
    const project = catalog.projects.find((item) => item.id === record.id)
    return {
      ...draft,
      clientId: project?.clientId ?? '',
      description: project?.description ?? '',
      color: project?.color ?? DEFAULT_PROJECT_COLOR,
      estimate: formatHoursInput(project?.estimateMinutes ?? 0),
    }
  }
  if (kind === 'tasks') {
    const task = catalog.tasks.find((item) => item.id === record.id)
    return {
      ...draft,
      projectId: task?.projectId ?? '',
      estimate: formatHoursInput(task?.estimateMinutes ?? 0),
      billable: task?.billable ?? false,
    }
  }
  return draft
}

/** Reads the estimate in hours as whole minutes: null when blank or zero, undefined when it isn't hours. */
function parseEstimate(text: string): number | null | undefined {
  const minutes = parseHoursInput(text, ESTIMATE_HOURS)
  if (minutes === null) return undefined
  return minutes === 0 ? null : minutes
}

/**
 * The create and edit form for one client, project, or task, in a side drawer so the list stays in place. Pass
 * `record` to edit it, or `defaultProjectId` to start a new task in that project; the parent remounts this component
 * for each opening, so the form starts from that record.
 */
export function CatalogEditor({
  open,
  kind,
  record,
  defaultProjectId = '',
  workspaceId,
  catalog,
  onClose,
  onSaved,
}: {
  open: boolean
  kind: CatalogKind
  record?: CatalogRecord
  defaultProjectId?: string
  workspaceId: string
  catalog: Catalog
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [initial] = useState(() => initialDraft(kind, catalog, record, defaultProjectId))
  const [draft, setDraft] = useState(initial)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const noun = CATALOG_NOUNS[kind].one
  const Noun = noun[0].toUpperCase() + noun.slice(1)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const clientOptions: ClientOption[] = [NO_CLIENT, ...selectableRecords(catalog.clients, initial.clientId)]
  const client = clientOptions.find((option) => option.id === draft.clientId) ?? NO_CLIENT
  const projectOptions = kind === 'tasks' ? projectOptionsFor(catalog, initial.projectId) : []
  const project = projectOptions.find((option) => option.id === draft.projectId) ?? null
  const headingId = 'catalog-editor-heading'

  function update(changes: Partial<Draft>, ...cleared: Field[]) {
    setDraft((current) => ({ ...current, ...changes }))
    if (cleared.some((field) => fieldErrors[field])) {
      setFieldErrors((current) => ({ ...current, ...Object.fromEntries(cleared.map((field) => [field, undefined])) }))
    }
  }

  function requestClose() {
    if (pending) return
    if (dirty && !window.confirm(`Discard your changes to this ${noun}?`)) return
    onClose()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    const estimateMinutes = kind === 'clients' ? null : parseEstimate(draft.estimate)
    const errors: FieldErrors = {}
    if (!draft.name.trim()) errors.name = `Enter a name for this ${noun}.`
    if (kind === 'tasks' && !draft.projectId) errors.projectId = 'Choose the project this task belongs to.'
    if (estimateMinutes === undefined) errors.estimate = 'Enter hours like 7.5 or 7:30.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    const input: CatalogInput = {
      name: draft.name,
      clientId: draft.clientId,
      projectId: draft.projectId,
      description: draft.description,
      color: draft.color,
      estimateMinutes,
      billable: draft.billable,
    }
    setPending(true)
    try {
      await saveCatalogRecord(workspaceId, kind, input, record)
      onSaved(record ? `${Noun} updated.` : `${Noun} added.`)
    } catch (issue) {
      setError(readableError(issue))
      setPending(false)
    }
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={requestClose}
      slotProps={{ paper: { 'aria-labelledby': headingId, sx: { width: { xs: '100%', sm: 460 } } } }}
    >
      <Box
        component="form"
        noValidate
        onSubmit={(event: FormEvent) => void submit(event)}
        aria-busy={pending}
        sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      >
        <Stack
          direction="row"
          sx={{
            alignItems: 'flex-start',
            gap: 1,
            px: { xs: 2, sm: 3 },
            pt: 2.5,
            pb: 2,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h3" id={headingId} sx={{ overflowWrap: 'anywhere' }}>
              {record ? `Edit ${noun}` : `New ${noun}`}
            </Typography>
            {record?.archived && (
              <Typography variant="caption" color="text.secondary">
                This {noun} is archived, so it can’t be picked for new time entries. Restore it from the row menu.
              </Typography>
            )}
          </Box>
          <IconButton aria-label="Close" onClick={requestClose} sx={{ mt: -0.5 }}>
            ×
          </IconButton>
        </Stack>

        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            display: 'grid',
            alignContent: 'start',
            gap: 2.5,
            px: { xs: 2, sm: 3 },
            py: 2.5,
          }}
        >
          {error && <FormMessage severity="error">{error}</FormMessage>}
          <TextField
            label="Name"
            value={draft.name}
            onChange={(event) => update({ name: event.target.value }, 'name')}
            required
            autoFocus
            error={!!fieldErrors.name}
            helperText={fieldErrors.name}
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />
          {kind === 'projects' && (
            <>
              <Autocomplete<ClientOption, false, true>
                options={clientOptions}
                value={client}
                onChange={(_, option) => update({ clientId: option.id })}
                getOptionLabel={(option) => option.label}
                isOptionEqualToValue={(option, current) => option.id === current.id}
                disableClearable
                autoHighlight
                noOptionsText="No matching clients"
                renderInput={(params) => <TextField {...params} label="Client" />}
              />
              <TextField
                label="Description"
                value={draft.description}
                onChange={(event) => update({ description: event.target.value })}
                multiline
                minRows={2}
                maxRows={6}
                slotProps={{ htmlInput: { maxLength: 1000 } }}
              />
              <ProjectColorField value={draft.color} onChange={(color) => update({ color })} />
            </>
          )}
          {kind === 'tasks' && (
            <Autocomplete<ProjectOption>
              options={projectOptions}
              value={project}
              onChange={(_, option) => update({ projectId: option?.id ?? '' }, 'projectId')}
              groupBy={(option) => option.group}
              getOptionLabel={(option) => option.label}
              isOptionEqualToValue={(option, current) => option.id === current.id}
              filterOptions={filterProjectOptions}
              autoHighlight
              noOptionsText="No matching projects"
              renderOption={({ key, ...props }, option) => (
                <Box component="li" key={key} {...props} sx={{ gap: 1.25 }}>
                  <ColorDot color={option.color} />
                  {option.label}
                </Box>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Project"
                  required
                  error={!!fieldErrors.projectId}
                  helperText={fieldErrors.projectId}
                  slotProps={{
                    ...params.slotProps,
                    input: {
                      ...params.slotProps.input,
                      startAdornment: project ? (
                        <Box component="span" sx={{ display: 'flex', pl: 0.75 }}>
                          <ColorDot color={project.color} />
                        </Box>
                      ) : undefined,
                    },
                  }}
                />
              )}
            />
          )}
          {kind !== 'clients' && (
            <TextField
              label="Estimate (hours)"
              value={draft.estimate}
              onChange={(event) => update({ estimate: event.target.value }, 'estimate')}
              onBlur={() => {
                const minutes = parseHoursInput(draft.estimate, ESTIMATE_HOURS)
                if (minutes !== null) setDraft((current) => ({ ...current, estimate: formatHoursInput(minutes) }))
              }}
              placeholder="0:00"
              error={!!fieldErrors.estimate}
              helperText={fieldErrors.estimate ?? 'Optional. Decimal hours (7.5) or H:MM (7:30).'}
              slotProps={{ htmlInput: { inputMode: 'decimal' }, inputLabel: { shrink: true } }}
              sx={{ maxWidth: 220 }}
            />
          )}
          {kind === 'tasks' && (
            <FormControlLabel
              control={
                <Switch checked={draft.billable} onChange={(event) => update({ billable: event.target.checked })} />
              }
              label="Billable"
              sx={{ justifySelf: 'start' }}
            />
          )}
        </Box>

        <Stack
          direction="row"
          spacing={1.25}
          sx={{ justifyContent: 'flex-end', px: { xs: 2, sm: 3 }, py: 2, borderTop: 1, borderColor: 'divider' }}
        >
          <Button onClick={requestClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="contained" type="submit" disabled={pending}>
            {pending ? 'Saving…' : record ? 'Save changes' : `Add ${noun}`}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  )
}

function ColorDot({ color }: { color: string }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{ width: 10, height: 10, flexShrink: 0, borderRadius: '50%', bgcolor: color }}
    />
  )
}
