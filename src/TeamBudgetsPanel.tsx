import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { BudgetProgressCard } from './BudgetProgressCard'
import { type Budget, subscribeToBudgets } from './lib/budgets'
import { budgetTargetKey } from './lib/budgetForm'
import { type BudgetProgress, calculateBudgetProgress, progressTimeZone, zonedDayString } from './lib/budgetProgress'
import { localDayString } from './lib/dates'
import { readableError } from './lib/errors'
import { budgetGroupRange, formatBudgetBalance, formatBudgetDay, formatBudgetMinutes } from './lib/memberBudgets'
import {
  type TeamBudgetFilters,
  type TeamBudgetStatus,
  teamBudgetGroups,
  teamBudgetStatus,
  teamEntryRanges,
} from './lib/teamBudgets'
import { type TimeEntry, loadCompletedEntriesOverlapping } from './lib/timeEntries'
import { type WorkspaceMember, subscribeToWorkspaceMembers } from './lib/workspaces'
import { EmptyText, FormMessage, LoadingState, SectionCard, SectionHeading, SelectField } from './ui'

// A symbol next to each status keeps it readable without color.
const STATUS_STYLES: Record<TeamBudgetStatus, { symbol: string; label: string; color: string }> = {
  behind: { symbol: '▼', label: 'Behind', color: 'error.main' },
  'on-track': { symbol: '✓', label: 'On track', color: 'success.main' },
  over: { symbol: '▲', label: 'Over', color: 'success.main' },
}

// "Today" moves on at midnight in each member's timezone, so the panel re-reads the clock every minute.
const CLOCK_TICK_MS = 60_000

type Row = { key: string; group: Budget[]; progress: BudgetProgress; memberName: string; today: string }

function groupKey(group: Budget[]): string {
  return `${group[0].userId}/${budgetTargetKey(group[0].target)}`
}

// Owners and managers follow every member's budgets. Entries are read once per member, bounded by the shown
// budgets' days, and refreshed on demand rather than kept live for the whole team.
export function TeamBudgetsPanel({
  workspaceId,
  weekStartsOn,
  onManageBudgets,
}: {
  workspaceId: string
  weekStartsOn: number
  // Opens the Budgets page, where budgets are created and edited.
  onManageBudgets: () => void
}) {
  const [budgets, setBudgets] = useState<Budget[] | undefined>()
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [filters, setFilters] = useState<TeamBudgetFilters>(() => {
    const today = localDayString(new Date())
    return { userId: '', targetKey: '', fromDay: today, toDay: today }
  })
  const [entries, setEntries] = useState<{ key: string; byUser: Map<string, TimeEntry[]> } | undefined>()
  const [reloads, setReloads] = useState(0)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), CLOCK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

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
  // Budget days follow the tracked member's timezone, as in their own view.
  const timeZoneFor = (userId: string) => progressTimeZone(membersById.get(userId)?.timezone)
  const memberNameFor = (budget: Budget) => {
    const member = membersById.get(budget.userId)
    const name = member?.displayName || member?.email || budget.userDisplayName
    return member?.status === 'removed' ? `${name} (removed)` : name
  }

  const groups = teamBudgetGroups(budgets ?? [], filters)
  const ranges = teamEntryRanges(groups, timeZoneFor)
  const rangesKey = `${reloads}|${[...ranges].map(([userId, [start, end]]) => `${userId}:${start}-${end}`).join(',')}`

  useEffect(() => {
    if (ranges.size === 0) return
    let cancelled = false
    const requests = [...ranges].map(async ([userId, [start, end]]) => {
      const loaded = await loadCompletedEntriesOverlapping(workspaceId, userId, new Date(start), new Date(end))
      return [userId, loaded] as const
    })
    Promise.all(requests)
      .then((loaded) => {
        if (!cancelled) setEntries({ key: rangesKey, byUser: new Map(loaded) })
      })
      .catch((issue: Error) => {
        if (!cancelled) setError(readableError(issue))
      })
    return () => {
      cancelled = true
    }
    // `rangesKey` captures `ranges` and the refresh counter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, rangesKey])

  const entriesReady = ranges.size === 0 || entries?.key === rangesKey
  const rows: Row[] =
    entries && entriesReady
      ? groups.map((group) => {
          const timeZone = timeZoneFor(group[0].userId)
          return {
            key: groupKey(group),
            group,
            progress: calculateBudgetProgress(group, entries.byUser.get(group[0].userId) ?? [], timeZone, now),
            memberName: memberNameFor(group[0]),
            today: zonedDayString(now.getTime(), timeZone),
          }
        })
      : []
  const selected = rows.find((row) => row.key === selectedKey)

  const memberOptions = new Map<string, string>()
  const targetOptions = new Map<string, string>()
  for (const budget of budgets ?? []) {
    if (budget.archived) continue
    memberOptions.set(budget.userId, memberNameFor(budget))
    targetOptions.set(
      budgetTargetKey(budget.target),
      `${budget.target.name} (${budget.target.type === 'client' ? 'client' : 'project'})`,
    )
  }
  const byLabel = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1])

  const loading = budgets === undefined || (groups.length > 0 && !entriesReady)
  const windowInvalid = !!filters.fromDay && !!filters.toDay && filters.fromDay > filters.toDay

  return (
    <SectionCard labelledBy="team-budgets-heading" sx={{ maxWidth: 1120 }}>
      <SectionHeading
        id="team-budgets-heading"
        kicker="TEAM HOUR TARGETS"
        title="Budget progress"
        action={
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={onManageBudgets}>
              Manage budgets
            </Button>
            <Button variant="outlined" onClick={() => setReloads((count) => count + 1)} disabled={loading}>
              Refresh
            </Button>
          </Stack>
        }
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.6 }}>
        Every member’s budgets, counted the way they see them: only completed entries, with days in the member’s
        timezone. Expected time counts the days that have ended; logged time includes today.
      </Typography>
      {error && <FormMessage severity="error">{error}</FormMessage>}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mt: 2.5 }}>
        <SelectField
          label="Member"
          value={filters.userId}
          onChange={(event) => setFilters({ ...filters, userId: event.target.value })}
          sx={{ minWidth: 180 }}
        >
          <option value="">All members</option>
          {[...memberOptions].sort(byLabel).map(([userId, name]) => (
            <option key={userId} value={userId}>
              {name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Project or client"
          value={filters.targetKey}
          onChange={(event) => setFilters({ ...filters, targetKey: event.target.value })}
          sx={{ minWidth: 200 }}
        >
          <option value="">All projects and clients</option>
          {[...targetOptions].sort(byLabel).map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Active from"
          type="date"
          value={filters.fromDay}
          onChange={(event) => setFilters({ ...filters, fromDay: event.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="Active to"
          type="date"
          value={filters.toDay}
          onChange={(event) => setFilters({ ...filters, toDay: event.target.value })}
          error={windowInvalid}
          helperText={windowInvalid ? 'Pick a day on or after the start.' : undefined}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>

      {loading && !error ? (
        <LoadingState label="Loading budget progress…" sx={{ py: 6 }} />
      ) : groups.length === 0 ? (
        <EmptyText>
          {budgets && budgets.some((budget) => !budget.archived) ? (
            'No budgets match these filters.'
          ) : (
            <>
              No one has a budget yet. Create budgets from the{' '}
              <Link component="button" type="button" onClick={onManageBudgets} sx={{ verticalAlign: 'baseline' }}>
                Budgets page
              </Link>
              .
            </>
          )}
        </EmptyText>
      ) : (
        <Box sx={{ overflowX: 'auto', mt: 2 }}>
          <Table size="small" sx={{ minWidth: { xs: 0, md: 900 }, '& td, & th': { borderColor: 'divider' } }}>
            <TableHead>
              <TableRow sx={{ '& th': { color: 'text.secondary', fontSize: 12, fontWeight: 650, py: 1.25 } }}>
                <TableCell>Member</TableCell>
                <TableCell>Project or client</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Range</TableCell>
                <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                  Target
                </TableCell>
                <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                  Expected to date
                </TableCell>
                <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                  Logged to date
                </TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>
                  <Box component="span" sx={visuallyHiddenSx}>
                    Actions
                  </Box>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const [startDay, endDay] = budgetGroupRange(row.group)
                const status = STATUS_STYLES[teamBudgetStatus(row.progress)]
                return (
                  <TableRow key={row.key} hover sx={{ '& td': { py: 1.25 } }}>
                    <TableCell sx={{ minWidth: 140, overflowWrap: 'break-word' }}>{row.memberName}</TableCell>
                    <TableCell sx={{ minWidth: 140, overflowWrap: 'break-word' }}>
                      {row.progress.target.name}
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {row.progress.target.type === 'client' ? 'Client' : 'Project'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, whiteSpace: 'nowrap' }}>
                      {formatBudgetDay(startDay)} – {formatBudgetDay(endDay)}
                    </TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' }, ...numberSx }}>
                      {formatBudgetMinutes(row.progress.totalExpectedMinutes)}
                    </TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' }, ...numberSx }}>
                      {formatBudgetMinutes(row.progress.expectedToDateMinutes)}
                    </TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' }, ...numberSx }}>
                      {formatBudgetMinutes(row.progress.actualToDateMinutes)}
                    </TableCell>
                    <TableCell align="right" sx={{ ...numberSx, fontWeight: 650 }}>
                      {formatBudgetBalance(row.progress.balanceMinutes)}
                    </TableCell>
                    <TableCell sx={{ color: status.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      <span aria-hidden="true">{status.symbol}</span> {status.label}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        onClick={() => setSelectedKey(row.key)}
                        aria-label={`View days of ${row.memberName} on ${row.progress.target.name}`}
                      >
                        Days
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Box>
      )}

      {selected && (
        <Dialog open onClose={() => setSelectedKey(null)} fullWidth maxWidth="md" aria-labelledby="team-budget-title">
          <DialogTitle id="team-budget-title">{selected.memberName}</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Days are counted in {timeZoneFor(selected.group[0].userId).replaceAll('_', ' ')}.
            </Typography>
            <BudgetProgressCard
              group={selected.group}
              progress={selected.progress}
              today={selected.today}
              weekStartsOn={weekStartsOn}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSelectedKey(null)}>Close</Button>
          </DialogActions>
        </Dialog>
      )}
    </SectionCard>
  )
}

const numberSx = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const

const visuallyHiddenSx = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const
