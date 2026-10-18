import { useEffect, useState, type FormEvent } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { saveCatalogRecord, setCatalogArchived, subscribeToCatalog, type Catalog, type CatalogInput } from './lib/catalog'
import { EmptyText, FormMessage, ListRow, SectionCard, SectionHeading, SelectField } from './ui'

const empty: Catalog = { clients: [], projects: [], tasks: [] }

export function CatalogPanel({ workspaceId }: { workspaceId: string }) {
  const [catalog, setCatalog] = useState(empty)
  const [kind, setKind] = useState<'clients' | 'projects' | 'tasks'>('clients')
  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#668a6b')
  const [estimate, setEstimate] = useState('')
  const [editing, setEditing] = useState<{ id: string } | undefined>()
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => subscribeToCatalog(workspaceId, setCatalog, (issue) => setError(issue.message)), [workspaceId])
  const visible = catalog[kind].filter((record) => showArchived || !record.archived)

  function reset() { setName(''); setDescription(''); setEstimate(''); setEditing(undefined) }
  function beginEdit(record: { id: string; name: string }) {
    setEditing({ id: record.id }); setName(record.name)
    if (kind === 'projects') {
      const item = catalog.projects.find((project) => project.id === record.id)
      setClientId(item?.clientId ?? ''); setDescription(item?.description ?? ''); setColor(item?.color ?? '#668a6b'); setEstimate(item?.estimateMinutes?.toString() ?? '')
    } else if (kind === 'tasks') {
      const item = catalog.tasks.find((task) => task.id === record.id)
      setProjectId(item?.projectId ?? ''); setEstimate(item?.estimateMinutes?.toString() ?? '')
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setError('')
    const minutes = estimate ? Number(estimate) : null
    const input: CatalogInput = { name, clientId, projectId, description, color, estimateMinutes: minutes }
    try { await saveCatalogRecord(workspaceId, kind, input, editing); reset() }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Could not save this record.') }
    finally { setPending(false) }
  }
  async function archive(id: string, archived: boolean) {
    setPending(true); setError('')
    try { await setCatalogArchived(workspaceId, kind, id, archived) }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Could not update this record.') }
    finally { setPending(false) }
  }

  return <SectionCard labelledBy="catalog-heading">
    <SectionHeading id="catalog-heading" kicker="WORK ORGANIZATION" title="Clients, projects & tasks" action={<FormControlLabel control={<Checkbox size="small" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />} label="Show archived" />} />
    <ToggleButtonGroup aria-label="Catalog type" exclusive size="small" color="primary" value={kind} onChange={(_, value: typeof kind | null) => { if (value) { setKind(value); reset() } }} sx={{ my: 2.5 }}>
      {(['clients', 'projects', 'tasks'] as const).map((item) => <ToggleButton key={item} value={item} sx={{ px: 2 }}>{item[0].toUpperCase() + item.slice(1)}</ToggleButton>)}
    </ToggleButtonGroup>
    {error && <FormMessage severity="error">{error}</FormMessage>}
    <Paper component="form" variant="outlined" onSubmit={(event) => void submit(event)} aria-busy={pending} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, alignItems: 'end', gap: 2, p: 2, bgcolor: 'app.surface' }}>
      <Typography variant="h3" sx={{ gridColumn: '1 / -1' }}>{editing ? `Edit ${kind.slice(0, -1)}` : `Add ${kind.slice(0, -1)}`}</Typography>
      <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} required slotProps={{ htmlInput: { maxLength: 120 } }} />
      {kind === 'projects' && <>
        <SelectField label="Client" value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">No client</option>{catalog.clients.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>
        <TextField label="Description" value={description} onChange={(event) => setDescription(event.target.value)} slotProps={{ htmlInput: { maxLength: 1000 } }} />
        <TextField label="Color" type="color" value={color} onChange={(event) => setColor(event.target.value)} sx={{ width: 96 }} />
      </>}
      {kind === 'tasks' && <SelectField label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)} required><option value="">Select a project</option>{catalog.projects.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>}
      {kind !== 'clients' && <TextField label="Estimate (minutes)" type="number" value={estimate} onChange={(event) => setEstimate(event.target.value)} placeholder="Optional" slotProps={{ htmlInput: { min: 0, step: 1 }, inputLabel: { shrink: true } }} />}
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', gridColumn: { sm: '2' } }}>
        {editing && <Button variant="outlined" onClick={reset}>Cancel</Button>}
        <Button variant="contained" type="submit" disabled={pending}>{pending ? 'Saving…' : editing ? 'Save changes' : 'Add'}</Button>
      </Stack>
    </Paper>
    <Box sx={{ mt: 1.75 }}>{visible.map((record) => {
      const archived = record.archived
      const detail = kind === 'projects' ? (record as Catalog['projects'][number]).description : kind === 'tasks' ? catalog.projects.find((project) => project.id === (record as Catalog['tasks'][number]).projectId)?.name : ''
      return <ListRow key={record.id} sx={archived ? { opacity: 0.65 } : undefined}>
        <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0, overflowWrap: 'anywhere' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{record.name}</Typography>
          {detail && <Typography variant="caption" color="text.secondary">{detail}</Typography>}
          {archived && <Typography variant="caption" color="text.secondary">Archived</Typography>}
        </Box>
        <Stack direction="row" spacing={1} sx={{ flex: '0 0 auto' }}>
          <Button size="small" onClick={() => beginEdit(record)} disabled={pending}>Edit</Button>
          <Button size="small" onClick={() => void archive(record.id, !archived)} disabled={pending}>{archived ? 'Restore' : 'Archive'}</Button>
        </Stack>
      </ListRow>
    })}{visible.length === 0 && <EmptyText>No {kind} yet.</EmptyText>}</Box>
  </SectionCard>
}
