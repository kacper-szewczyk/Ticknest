import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
  groupProjectsByClient,
  groupTasksByProject,
  projectSearchText,
  taskSearchText,
  type CatalogKind,
  type CatalogRecord,
} from './lib/catalogList'
import { readableError } from './lib/errors'
import { formatHoursInput } from './lib/hours'
import { BillableChip, EmptyText, FormMessage, SectionCard, SectionHeading } from './ui'

const EMPTY_HINTS: Record<CatalogKind, string> = {
  clients: 'Clients group your projects by who the work is for.',
  projects: 'Projects are what people pick when they track time.',
  tasks: 'Tasks split a project into smaller pieces of work.',
}

const SEARCH_PLACEHOLDERS: Record<CatalogKind, string> = {
  clients: 'Client name',
  projects: 'Project, client or description',
  tasks: 'Task or project name',
}

type EditorState = { key: number; open: boolean; record?: CatalogRecord; defaultProjectId?: string }
type Project = Catalog['projects'][number]
type Task = Catalog['tasks'][number]

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1)

// Owners create, edit, archive, and restore the clients, projects, and tasks that members track time against.
export function CatalogPanel({ workspaceId }: { workspaceId: string }) {
  const [catalog, setCatalog] = useState<Catalog | undefined>()
  const [kind, setKind] = useState<CatalogKind>('clients')
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  // Groups the user folded: `projects:<client ID>` on the Projects tab and `tasks:<project ID>` on the Tasks tab, with
  // an empty ID for "No client" and "No project".
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  // The editor stays mounted while it closes, so the drawer can animate out; a new key starts a fresh form.
  const [editor, setEditor] = useState<EditorState>({ key: 0, open: false })
  const [menu, setMenu] = useState<{ anchor: HTMLElement; record: CatalogRecord } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => subscribeToCatalog(workspaceId, setCatalog, (issue) => setError(readableError(issue))), [workspaceId])

  const nouns = CATALOG_NOUNS[kind]
  const records: readonly CatalogRecord[] = catalog?.[kind] ?? []
  const clientNames = useMemo(
    () => new Map((catalog?.clients ?? []).map((client) => [client.id, client.name])),
    [catalog],
  )
  const projectNames = useMemo(
    () => new Map((catalog?.projects ?? []).map((project) => [project.id, project.name])),
    [catalog],
  )
  const { visible, total } = filterCatalogRecords(
    records,
    { query, showArchived },
    kind === 'projects'
      ? (record) => projectSearchText(record as Project, clientNames)
      : kind === 'tasks'
        ? (record) => taskSearchText(record as Task, projectNames)
        : undefined,
  )
  const searching = query.trim() !== ''
  const projectGroups = kind === 'projects' ? groupProjectsByClient(visible as Project[], catalog?.clients ?? []) : []
  // Without a search, empty active projects are listed too, so their first task can be added from the group.
  const taskGroups = kind === 'tasks' && catalog ? groupTasksByProject(visible as Task[], catalog, !searching) : []
  const projectCounts = useMemo(() => activeProjectCounts(catalog?.projects ?? []), [catalog])

  function changeKind(next: CatalogKind | null) {
    if (!next || next === kind) return
    setKind(next)
    setQuery('')
    setNotice('')
  }

  function toggleGroup(id: string | null) {
    const key = `${kind}:${id ?? ''}`
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }

  function openEditor(record?: CatalogRecord, defaultProjectId?: string) {
    setError('')
    setNotice('')
    setEditor((current) => ({ key: current.key + 1, open: true, record, defaultProjectId }))
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
    return (record as Project).description
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
            placeholder={SEARCH_PLACEHOLDERS[kind]}
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
            ) : kind === 'projects' ? (
              projectGroups.map((group) => (
                <CatalogGroup
                  key={group.clientId ?? ''}
                  id={`projects-${group.clientId ?? 'none'}`}
                  name={group.name}
                  archived={group.clientArchived}
                  count={group.projects.length}
                  noun={nouns}
                  expanded={!collapsed.has(`projects:${group.clientId ?? ''}`)}
                  onToggle={() => toggleGroup(group.clientId)}
                >
                  {group.projects.map((project) => (
                    <CatalogRow
                      key={project.id}
                      record={project}
                      noun={nouns.one}
                      detail={project.description}
                      singleLineDetail
                      color={project.color}
                      estimateMinutes={project.estimateMinutes}
                      onOpen={() => openEditor(project)}
                      onMenu={(anchor) => setMenu({ anchor, record: project })}
                    />
                  ))}
                </CatalogGroup>
              ))
            ) : kind === 'tasks' ? (
              taskGroups.map(({ projectId, ...group }) => (
                <CatalogGroup
                  key={projectId ?? ''}
                  id={`tasks-${projectId ?? 'none'}`}
                  name={group.name}
                  detail={group.clientName ?? undefined}
                  color={group.color ?? undefined}
                  archived={group.projectArchived}
                  count={group.tasks.length}
                  noun={nouns}
                  expanded={!collapsed.has(`tasks:${projectId ?? ''}`)}
                  onToggle={() => toggleGroup(projectId)}
                  action={
                    projectId && !group.projectArchived ? (
                      <Button
                        size="small"
                        aria-label={`Add task to ${group.name}`}
                        onClick={() => openEditor(undefined, projectId)}
                        sx={{ flexShrink: 0 }}
                      >
                        Add task
                      </Button>
                    ) : undefined
                  }
                  emptyText="No tasks yet."
                  indent
                >
                  {group.tasks.map((task) => (
                    <CatalogRow
                      key={task.id}
                      record={task}
                      noun={nouns.one}
                      detail=""
                      billable={task.billable}
                      estimateMinutes={task.estimateMinutes}
                      onOpen={() => openEditor(task)}
                      onMenu={(anchor) => setMenu({ anchor, record: task })}
                    />
                  ))}
                </CatalogGroup>
              ))
            ) : (
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {visible.map((record) => (
                  <CatalogRow
                    key={record.id}
                    record={record}
                    noun={nouns.one}
                    detail={detailFor(record)}
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
          defaultProjectId={editor.defaultProjectId}
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

/** A collapsible group of catalog rows, such as the projects of one client or the tasks of one project. */
function CatalogGroup({
  id,
  name,
  detail,
  color,
  archived,
  count,
  noun,
  expanded,
  onToggle,
  action,
  emptyText,
  indent = false,
  children,
}: {
  /** Unique within the page, for the list's element ID. */
  id: string
  name: string
  /** A muted line under the name, such as the project's client. */
  detail?: string
  /** Shows a color dot before the name. */
  color?: string
  archived: boolean
  count: number
  noun: { one: string; many: string }
  expanded: boolean
  onToggle: () => void
  /** A control beside the group header, such as "Add task". */
  action?: ReactNode
  /** Shown in an expanded group without rows. */
  emptyText?: string
  /** Indents the rows under the header. */
  indent?: boolean
  children: ReactNode
}) {
  const listId = `catalog-group-${id}`
  return (
    <Box component="section" aria-label={name} sx={{ mt: 1 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, minWidth: 0 }}>
        <ButtonBase
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={listId}
          sx={{
            flex: 1,
            minWidth: 0,
            justifyContent: 'flex-start',
            alignItems: 'flex-start',
            gap: 1,
            py: 1,
            px: 0.5,
            borderRadius: 1,
            textAlign: 'left',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <Box component="span" aria-hidden sx={{ width: 12, flexShrink: 0, color: 'text.secondary' }}>
            {expanded ? '▾' : '▸'}
          </Box>
          {color && (
            <Box
              component="span"
              aria-hidden
              sx={{ width: 10, height: 10, flexShrink: 0, mt: '5px', borderRadius: '50%', bgcolor: color }}
            />
          )}
          <Box component="span" sx={{ display: 'block', minWidth: 0 }}>
            <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1 }}>
              <Typography component="span" variant="body2" sx={{ fontWeight: 650, overflowWrap: 'anywhere' }}>
                {name}
                {archived && ' (archived)'}
              </Typography>
              <Typography component="span" variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                {count} {count === 1 ? noun.one : noun.many}
              </Typography>
            </Box>
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
          </Box>
        </ButtonBase>
        {action}
      </Stack>
      {expanded && (
        <Box component="ul" id={listId} sx={{ listStyle: 'none', m: 0, p: 0, pl: indent ? 2 : 0 }}>
          {count === 0 && emptyText ? (
            <Typography
              component="li"
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', py: 1.25, px: 1 }}
            >
              {emptyText}
            </Typography>
          ) : (
            children
          )}
        </Box>
      )}
    </Box>
  )
}

function CatalogRow({
  record,
  noun,
  detail,
  singleLineDetail = false,
  billable = false,
  color,
  estimateMinutes,
  onOpen,
  onMenu,
}: {
  record: CatalogRecord
  noun: string
  detail: string
  /** Cuts the detail to one line, for long text such as a project description. */
  singleLineDetail?: boolean
  billable?: boolean
  /** Shows a color dot before the name. */
  color?: string
  estimateMinutes?: number | null
  onOpen: () => void
  onMenu: (anchor: HTMLElement) => void
}) {
  const estimate = estimateMinutes ? formatHoursInput(estimateMinutes) : ''
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
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          gap: 1.25,
          textAlign: 'left',
          py: 1.25,
          px: 1,
          borderRadius: 1,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        {color && (
          <Box
            component="span"
            aria-hidden
            sx={{ width: 10, height: 10, flexShrink: 0, mt: '5px', borderRadius: '50%', bgcolor: color }}
          />
        )}
        <Box component="span" sx={{ display: 'block', flex: 1, minWidth: 0 }}>
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
              noWrap={singleLineDetail}
              sx={{ display: 'block', overflowWrap: singleLineDetail ? undefined : 'anywhere' }}
            >
              {detail}
            </Typography>
          )}
        </Box>
        {estimate && (
          <Typography
            component="span"
            variant="caption"
            color="text.secondary"
            sx={{ flexShrink: 0, whiteSpace: 'nowrap', mt: '2px', fontVariantNumeric: 'tabular-nums' }}
          >
            Est. {estimate}
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
