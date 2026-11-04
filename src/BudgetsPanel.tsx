import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { BudgetEditor, type MemberOption } from './BudgetEditor'
import { type Budget, deleteBudget, setBudgetArchived, subscribeToBudgets } from './lib/budgets'
import {
  type BudgetListFilters,
  type BudgetPhase,
  budgetPhase,
  filterBudgets,
  groupBudgetsByMember,
  weekdaySummary,
  weeklyMinutes,
} from './lib/budgetForm'
import { progressTimeZone, zonedDayString } from './lib/budgetProgress'
import type { Catalog } from './lib/catalog'
import { dayDate } from './lib/dates'
import { readableError } from './lib/errors'
import { formatBudgetMinutes } from './lib/memberBudgets'
import { type WorkspaceMember, subscribeToWorkspaceMembers } from './lib/workspaces'
import { EmptyText, FormMessage, SectionCard, SectionHeading, SelectField } from './ui'

const PHASE_LABELS: Record<BudgetPhase, string> = {
  active: 'Active',
  upcoming: 'Upcoming',
  past: 'Past',
  archived: 'Archived',
}

function formatDay(day: string): string {
  return dayDate(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

type EditorState = { key: number; open: boolean; budget?: Budget }

// Owners and managers create, edit, archive, and delete hour budgets for workspace members.
export function BudgetsPanel({ workspaceId, catalog }: { workspaceId: string; catalog: Catalog }) {
  const [budgets, setBudgets] = useState<Budget[] | undefined>()
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [filters, setFilters] = useState<BudgetListFilters>({ query: '', phase: 'current' })
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  // The editor stays mounted while it closes, so the drawer can animate out; a new key starts a fresh form.
  const [editor, setEditor] = useState<EditorState>({ key: 0, open: false })
  const [menu, setMenu] = useState<{ anchor: HTMLElement; budget: Budget } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  // Phases are a coarse label, so the instant when the panel opened is precise enough.
  const [now] = useState(() => Date.now())

  // The parent keys this panel by workspace, so switching workspaces starts with fresh state.
  useEffect(() => {
    const handleError = (issue: Error) => setError(readableError(issue))
    const stopBudgets = subscribeToBudgets(workspaceId, {}, setBudgets, handleError)
    const stopMembers = subscribeToWorkspaceMembers(workspaceId, setMembers, handleError)
    return () => {
      stopBudgets()
      stopMembers()
    }
  }, [workspaceId])

  const membersById = useMemo(() => new Map(members.map((member) => [member.uid, member])), [members])
  const memberName = (member: WorkspaceMember) => member.displayName || member.email
  const budgetMemberName = (budget: Budget) => {
    const member = membersById.get(budget.userId)
    return member ? memberName(member) : budget.userDisplayName
  }
  const memberOptions: MemberOption[] = members
    .filter((member) => member.status !== 'removed')
    .sort((a, b) => memberName(a).localeCompare(memberName(b)))
    .map((member) => ({ uid: member.uid, label: memberName(member) }))
  // Budget days follow the tracked member's timezone, so "today" differs per member.
  const todayFor = (budget: Budget) => zonedDayString(now, progressTimeZone(membersById.get(budget.userId)?.timezone))

  const visibleBudgets = budgets ? filterBudgets(budgets, filters, todayFor, budgetMemberName) : []
  const groups = groupBudgetsByMember(visibleBudgets, budgetMemberName)

  function openEditor(budget?: Budget) {
    setError('')
    setNotice('')
    setEditor((current) => ({ key: current.key + 1, open: true, budget }))
  }

  function closeEditor() {
    setEditor((current) => ({ ...current, open: false }))
  }

  function toggleGroup(userId: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(userId)) next.add(userId)
      return next
    })
  }

  async function archive(budget: Budget, archived: boolean) {
    setPending(true)
    setError('')
    setNotice('')
    try {
      await setBudgetArchived(workspaceId, budget.id, archived)
      setNotice(archived ? 'Budget archived. It no longer counts toward progress.' : 'Budget restored.')
    } catch (issue) {
      setError(readableError(issue))
    } finally {
      setPending(false)
    }
  }

  async function remove(budget: Budget) {
    if (
      !window.confirm(
        `Permanently delete ${budget.userDisplayName}’s budget on ${budget.target.name}? This cannot be undone. Time entries are not affected.`,
      )
    )
      return
    setPending(true)
    setError('')
    setNotice('')
    try {
      await deleteBudget(workspaceId, budget.id)
      setNotice('Budget deleted.')
    } catch (issue) {
      setError(readableError(issue))
    } finally {
      setPending(false)
    }
  }

  function runMenuAction(action: (budget: Budget) => void) {
    if (!menu) return
    const { budget } = menu
    setMenu(null)
    action(budget)
  }

  return (
    <SectionCard labelledBy="budgets-heading">
      <SectionHeading
        id="budgets-heading"
        kicker="HOUR TARGETS"
        title="Budgets"
        action={
          <Button variant="contained" onClick={() => openEditor()}>
            New budget
          </Button>
        }
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.6 }}>
        Set how many hours a member should log on a project or client. Select a budget to edit it.
      </Typography>
      {error && <FormMessage severity="error">{error}</FormMessage>}
      {notice && <FormMessage severity="success">{notice}</FormMessage>}

      <Box component="section" aria-label="All budgets" sx={{ mt: 2.5 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 2fr) minmax(0, 1fr)' },
            gap: 1.5,
            mb: 1,
          }}
        >
          <TextField
            size="small"
            type="search"
            label="Search"
            placeholder="Member, project or client"
            value={filters.query}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <SelectField
            size="small"
            label="Status"
            value={filters.phase}
            onChange={(event) => setFilters({ ...filters, phase: event.target.value as BudgetListFilters['phase'] })}
          >
            <option value="current">Active and upcoming</option>
            <option value="active">Active</option>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </SelectField>
        </Box>
        {budgets === undefined ? (
          <EmptyText>Loading budgets…</EmptyText>
        ) : budgets.length === 0 ? (
          <EmptyText>No budgets yet. Select New budget to set a member’s hour target.</EmptyText>
        ) : groups.length === 0 ? (
          <EmptyText>No budgets match these filters.</EmptyText>
        ) : (
          <>
            <Typography variant="caption" color="text.secondary" component="p" role="status" sx={{ mb: 0.5 }}>
              {visibleBudgets.length} of {budgets.length} {budgets.length === 1 ? 'budget' : 'budgets'}
            </Typography>
            {groups.map((group) => {
              const expanded = !collapsed.has(group.userId)
              const activeWeekly = group.budgets
                .filter((budget) => budgetPhase(budget, todayFor(budget)) === 'active')
                .reduce((sum, budget) => sum + weeklyMinutes(budget.weekdayMinutes), 0)
              const listId = `budget-group-${group.userId}`
              return (
                <Box key={group.userId} component="section" aria-label={group.name} sx={{ mt: 1 }}>
                  <ButtonBase
                    onClick={() => toggleGroup(group.userId)}
                    aria-expanded={expanded}
                    aria-controls={listId}
                    sx={{
                      width: '100%',
                      justifyContent: 'flex-start',
                      gap: 1,
                      py: 1,
                      px: 0.5,
                      borderRadius: 1,
                      textAlign: 'left',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Box component="span" aria-hidden sx={{ width: 12, color: 'text.secondary' }}>
                      {expanded ? '▾' : '▸'}
                    </Box>
                    <Typography component="span" variant="body2" sx={{ fontWeight: 650, overflowWrap: 'anywhere' }}>
                      {group.name}
                    </Typography>
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                      {group.budgets.length} {group.budgets.length === 1 ? 'budget' : 'budgets'}
                      {activeWeekly > 0 && ` · ${formatBudgetMinutes(activeWeekly)}/week active`}
                    </Typography>
                  </ButtonBase>
                  {expanded && (
                    <Box component="ul" id={listId} sx={{ listStyle: 'none', m: 0, p: 0 }}>
                      {group.budgets.map((budget) => (
                        <BudgetRow
                          key={budget.id}
                          budget={budget}
                          phase={budgetPhase(budget, todayFor(budget))}
                          onOpen={() => openEditor(budget)}
                          onMenu={(anchor) => setMenu({ anchor, budget })}
                        />
                      ))}
                    </Box>
                  )}
                </Box>
              )
            })}
          </>
        )}
        {budgets && budgets.some((budget) => !budget.archived) && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Archive a budget to stop counting it. Archived budgets can be restored or permanently deleted.
          </Typography>
        )}
      </Box>

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        {menu?.budget.archived
          ? [
              <MenuItem key="restore" disabled={pending} onClick={() => runMenuAction((b) => void archive(b, false))}>
                Restore
              </MenuItem>,
              <MenuItem
                key="delete"
                disabled={pending}
                onClick={() => runMenuAction((b) => void remove(b))}
                sx={{ color: 'error.main' }}
              >
                Delete
              </MenuItem>,
            ]
          : [
              <MenuItem key="edit" onClick={() => runMenuAction((b) => openEditor(b))}>
                Edit
              </MenuItem>,
              <MenuItem key="archive" disabled={pending} onClick={() => runMenuAction((b) => void archive(b, true))}>
                Archive
              </MenuItem>,
            ]}
      </Menu>

      <BudgetEditor
        key={editor.key}
        open={editor.open}
        budget={editor.budget}
        workspaceId={workspaceId}
        catalog={catalog}
        members={memberOptions}
        onClose={closeEditor}
        onSaved={(message) => {
          closeEditor()
          setNotice(message)
        }}
      />
    </SectionCard>
  )
}

function BudgetRow({
  budget,
  phase,
  onOpen,
  onMenu,
}: {
  budget: Budget
  phase: BudgetPhase
  onOpen: () => void
  onMenu: (anchor: HTMLElement) => void
}) {
  // The saveBudget callable refuses archived budgets, so those open only their menu.
  const editable = !budget.archived
  const details = (
    <>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, minWidth: 0 }}>
        <Typography component="span" variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
          {budget.target.name}
        </Typography>
        {budget.target.type === 'client' && <Chip size="small" variant="outlined" label="Client" />}
        <Chip
          size="small"
          variant={phase === 'active' ? 'filled' : 'outlined'}
          color={phase === 'active' ? 'success' : 'default'}
          label={PHASE_LABELS[phase]}
        />
      </Stack>
      <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {formatDay(budget.startDay)} – {formatDay(budget.endDay)} ·{' '}
        {formatBudgetMinutes(weeklyMinutes(budget.weekdayMinutes))}
        /week ({weekdaySummary(budget.weekdayMinutes)})
        {budget.exceptions.length > 0 &&
          ` · ${budget.exceptions.length} ${budget.exceptions.length === 1 ? 'day off' : 'days off'}`}
      </Typography>
    </>
  )
  return (
    <Box
      component="li"
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, borderBottom: 1, borderColor: 'divider', minWidth: 0 }}
    >
      {editable ? (
        <ButtonBase
          onClick={onOpen}
          aria-label={`Edit ${budget.userDisplayName}’s budget on ${budget.target.name}`}
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'block',
            textAlign: 'left',
            py: 1.25,
            pl: 3,
            pr: 1,
            borderRadius: 1,
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          {details}
        </ButtonBase>
      ) : (
        <Box sx={{ flex: 1, minWidth: 0, py: 1.25, pl: 3, pr: 1 }}>{details}</Box>
      )}
      <IconButton
        aria-label={`More actions for ${budget.userDisplayName}’s budget on ${budget.target.name}`}
        aria-haspopup="menu"
        onClick={(event) => onMenu(event.currentTarget)}
        sx={{ flex: '0 0 auto' }}
      >
        ⋯
      </IconButton>
    </Box>
  )
}
