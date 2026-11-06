import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { CatalogEditor } from './CatalogEditor'
import { setCatalogArchived, subscribeToCatalog, type Catalog } from './lib/catalog'
import {
  CATALOG_KINDS,
  CATALOG_NOUNS,
  activeProjectCounts,
  filterCatalogRecords,
  type CatalogKind,
  type CatalogRecord,
} from './lib/catalogList'
import { readableError } from './lib/errors'
import { BillableChip, EmptyText, FormMessage, SectionCard, SectionHeading } from './ui'

const EMPTY_HINTS: Record<CatalogKind, string> = {
  clients: 'Clients group your projects by who the work is for.',
  projects: 'Projects are what people pick when they track time.',
  tasks: 'Tasks split a project into smaller pieces of work.',
}

type EditorState = { key: number; open: boolean; record?: CatalogRecord }

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1)

// Owners create, edit, archive, and restore the clients, projects, and tasks that members track time against.
export function CatalogPanel({ workspaceId }: { workspaceId: string }) {
  const [catalog, setCatalog] = useState<Catalog | undefined>()
  const [kind, setKind] = useState<CatalogKind>('clients')
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  // The editor stays mounted while it closes, so the drawer can animate out; a new key starts a fresh form.
  const [editor, setEditor] = useState<EditorState>({ key: 0, open: false })
  const [menu, setMenu] = useState<{ anchor: HTMLElement; record: CatalogRecord } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => subscribeToCatalog(workspaceId, setCatalog, (issue) => setError(readableError(issue))), [workspaceId])

  const nouns = CATALOG_NOUNS[kind]
  const records: readonly CatalogRecord[] = catalog?.[kind] ?? []
  const { visible, total } = filterCatalogRecords(records, { query, showArchived })
  const projectCounts = useMemo(() => activeProjectCounts(catalog?.projects ?? []), [catalog])
  const projectNames = useMemo(
    () => new Map((catalog?.projects ?? []).map((project) => [project.id, project.name])),
    [catalog],
  )

  function changeKind(next: CatalogKind | null) {
    if (!next || next === kind) return
    setKind(next)
    setQuery('')
    setNotice('')
  }

  function openEditor(record?: CatalogRecord) {
    setError('')
    setNotice('')
    setEditor((current) => ({ key: current.key + 1, open: true, record }))
  }

  function closeEditor() {
    setEditor((current) => ({ ...current, open: false }))
  }

  async function archive(record: CatalogRecord, archived: boolean) {
    setPending(true)
    setError('')
    setNotice('')
    try {
      await setCatalogArchived(workspaceId, kind, record.id, archived)
      setNotice(
        archived
          ? `${record.name} archived. It can no longer be picked for new time entries.`
          : `${record.name} restored.`,
      )
    } catch (issue) {
      setError(readableError(issue))
    } finally {
      setPending(false)
    }
  }

  function runMenuAction(action: (record: CatalogRecord) => void) {
    if (!menu) return
    const { record } = menu
    setMenu(null)
    action(record)
  }

  function detailFor(record: CatalogRecord): string {
    if (kind === 'clients') {
      const count = projectCounts.get(record.id) ?? 0
      return count === 0 ? 'No active projects' : `${count} active ${count === 1 ? 'project' : 'projects'}`
    }
    if (kind === 'projects') return (record as Catalog['projects'][number]).description
    return projectNames.get((record as Catalog['tasks'][number]).projectId) ?? ''
  }

  const archivedCount = records.filter((record) => record.archived).length

  return (
    <SectionCard labelledBy="catalog-heading">
      <SectionHeading
        id="catalog-heading"
        kicker="WORK ORGANIZATION"
        title="Clients, projects & tasks"
        action={
          <Button variant="contained" onClick={() => openEditor()} disabled={!catalog}>
            Add {nouns.one}
          </Button>
        }
      />
      <ToggleButtonGroup
        aria-label="Catalog type"
        exclusive
        size="small"
        color="primary"
        value={kind}
        onChange={(_, value: CatalogKind | null) => changeKind(value)}
        sx={{ mt: 2.5 }}
      >
        {CATALOG_KINDS.map((item) => (
          <ToggleButton key={item} value={item} sx={{ px: 2 }}>
            {capitalize(CATALOG_NOUNS[item].many)}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {error && <FormMessage severity="error">{error}</FormMessage>}
      {notice && <FormMessage severity="success">{notice}</FormMessage>}

      <Box component="section" aria-label={`All ${nouns.many}`} sx={{ mt: 2 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          sx={{ alignItems: { xs: 'stretch', sm: 'center' }, gap: { xs: 0.5, sm: 2 }, mb: 1 }}
        >
          <TextField
            size="small"
            type="search"
            label="Search"
            placeholder={`${capitalize(nouns.one)} name`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ flex: 1 }}
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
            }
            label="Show archived"
            sx={{ mr: 0 }}
          />
        </Stack>

        {!catalog ? (
          <EmptyText>Loading {nouns.many}…</EmptyText>
        ) : records.length === 0 ? (
          <Box sx={{ py: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              No {nouns.many} yet. {EMPTY_HINTS[kind]}
            </Typography>
            <Button variant="outlined" onClick={() => openEditor()}>
              Add your first {nouns.one}
            </Button>
          </Box>
        ) : total === 0 ? (
          <EmptyText>
            All {nouns.many} are archived. Turn on Show archived to see {archivedCount === 1 ? 'it' : 'them'}.
          </EmptyText>
        ) : (
          <>
            <Typography variant="caption" color="text.secondary" component="p" role="status" sx={{ mb: 0.5 }}>
              {visible.length} of {total} {total === 1 ? nouns.one : nouns.many}
              {!showArchived && archivedCount > 0 && ` · ${archivedCount} archived hidden`}
            </Typography>
            {visible.length === 0 ? (
              <EmptyText>
                No {nouns.many} match “{query.trim()}”.
              </EmptyText>
            ) : (
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {visible.map((record) => (
                  <CatalogRow
                    key={record.id}
                    record={record}
                    noun={nouns.one}
                    detail={detailFor(record)}
                    billable={kind === 'tasks' && (record as Catalog['tasks'][number]).billable}
                    onOpen={() => openEditor(record)}
                    onMenu={(anchor) => setMenu({ anchor, record })}
                  />
                ))}
              </Box>
            )}
          </>
        )}
      </Box>

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => runMenuAction((record) => openEditor(record))}>Edit</MenuItem>
        <MenuItem disabled={pending} onClick={() => runMenuAction((record) => void archive(record, !record.archived))}>
          {menu?.record.archived ? 'Restore' : 'Archive'}
        </MenuItem>
      </Menu>

      {catalog && (
        <CatalogEditor
          key={editor.key}
          open={editor.open}
          kind={kind}
          record={editor.record}
          workspaceId={workspaceId}
          catalog={catalog}
          onClose={closeEditor}
          onSaved={(message) => {
            closeEditor()
            setNotice(message)
          }}
        />
      )}
    </SectionCard>
  )
}

function CatalogRow({
  record,
  noun,
  detail,
  billable,
  onOpen,
  onMenu,
}: {
  record: CatalogRecord
  noun: string
  detail: string
  billable: boolean
  onOpen: () => void
  onMenu: (anchor: HTMLElement) => void
}) {
  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        borderBottom: 1,
        borderColor: 'divider',
        minWidth: 0,
        opacity: record.archived ? 0.7 : undefined,
      }}
    >
      <ButtonBase
        onClick={onOpen}
        aria-label={`Edit ${noun} ${record.name}${record.archived ? ' (archived)' : ''}`}
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'block',
          textAlign: 'left',
          py: 1.25,
          px: 1,
          borderRadius: 1,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, minWidth: 0 }}>
          <Typography component="span" variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
            {record.name}
          </Typography>
          {billable && <BillableChip />}
          {record.archived && <Chip size="small" variant="outlined" label="Archived" />}
        </Stack>
        {detail && (
          <Typography
            component="span"
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', overflowWrap: 'anywhere' }}
          >
            {detail}
          </Typography>
        )}
      </ButtonBase>
      <IconButton
        aria-label={`More actions for ${record.name}`}
        aria-haspopup="menu"
        onClick={(event) => onMenu(event.currentTarget)}
        sx={{ flex: '0 0 auto' }}
      >
        ⋯
      </IconButton>
    </Box>
  )
}
