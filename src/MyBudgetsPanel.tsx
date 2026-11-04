import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { BudgetProgressCard } from './BudgetProgressCard'
import { type Budget, subscribeToBudgets } from './lib/budgets'
import { budgetInstantRange, calculateBudgetProgress, progressTimeZone, zonedDayString } from './lib/budgetProgress'
import { readableError } from './lib/errors'
import { budgetGroupRange, budgetGroupSchedule, formatBudgetDay, memberBudgetGroups } from './lib/memberBudgets'
import { type TimeEntry, subscribeToCompletedEntriesOverlapping } from './lib/timeEntries'
import { EmptyText, FormMessage, ListRow, LoadingState, SectionCard, SectionHeading } from './ui'

// "Today" moves on at midnight in the member's timezone, so the panel re-reads the clock every minute.
const CLOCK_TICK_MS = 60_000

// Members follow their own budgets: today's target, the running balance, and a week-by-week breakdown.
export function MyBudgetsPanel({
  workspaceId,
  userId,
  memberTimeZone,
  weekStartsOn,
  onManageBudgets,
}: {
  workspaceId: string
  userId: string
  memberTimeZone: string | undefined
  weekStartsOn: number
  // Given to owners and managers, who can open the Budgets page to set budgets up.
  onManageBudgets?: () => void
}) {
  const [budgets, setBudgets] = useState<Budget[] | undefined>()
  const [entries, setEntries] = useState<TimeEntry[] | undefined>()
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => new Date())
  const timeZone = progressTimeZone(memberTimeZone)
  const today = zonedDayString(now.getTime(), timeZone)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), CLOCK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  // The parent keys this panel by workspace, so switching workspaces starts with fresh state.
  useEffect(
    () => subscribeToBudgets(workspaceId, { userId }, setBudgets, (issue) => setError(readableError(issue))),
    [workspaceId, userId],
  )

  const groups = memberBudgetGroups(budgets ?? [], today)
  const activeBudgets = groups.active.flat()
  const [rangeStart, rangeEnd] =
    activeBudgets.length > 0 ? budgetInstantRange(activeBudgets, timeZone).map((date) => date.getTime()) : [0, 0]

  // Live, so progress follows a stopped timer and saved, edited, or deleted entries.
  useEffect(() => {
    if (rangeEnd === 0) return
    return subscribeToCompletedEntriesOverlapping(
      workspaceId,
      userId,
      new Date(rangeStart),
      new Date(rangeEnd),
      setEntries,
      (issue) => setError(readableError(issue)),
    )
  }, [workspaceId, userId, rangeStart, rangeEnd])

  const progress = entries ? groups.active.map((group) => calculateBudgetProgress(group, entries, timeZone, now)) : []

  const hasActive = groups.active.length > 0
  const loading = budgets === undefined || (hasActive && entries === undefined)

  return (
    <SectionCard labelledBy="my-budgets-heading">
      <SectionHeading
        id="my-budgets-heading"
        kicker="YOUR HOUR TARGETS"
        title="My budgets"
        action={
          onManageBudgets && (
            <Button variant="outlined" onClick={onManageBudgets}>
              Manage budgets
            </Button>
          )
        }
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.6 }}>
        Hours you’re asked to log on a project or client. Only completed entries count, and days are counted in{' '}
        {timeZone.replaceAll('_', ' ')}.
      </Typography>
      {error && <FormMessage severity="error">{error}</FormMessage>}

      {loading && !error ? (
        <LoadingState label="Loading your budgets…" sx={{ py: 6 }} />
      ) : !hasActive && groups.upcoming.length === 0 ? (
        <EmptyText>
          You have no active or upcoming budgets. Owners and managers set them from the{' '}
          {onManageBudgets ? (
            <Link component="button" type="button" onClick={onManageBudgets} sx={{ verticalAlign: 'baseline' }}>
              Budgets page
            </Link>
          ) : (
            'Budgets page'
          )}
          .
        </EmptyText>
      ) : (
        <>
          {groups.active.length > 0 && (
            <Box component="section" aria-labelledby="active-budgets-heading" sx={{ mt: 2.5 }}>
              <Typography variant="h3" id="active-budgets-heading">
                Active
              </Typography>
              <Stack spacing={2} sx={{ mt: 1.5 }}>
                {groups.active.map((group, index) =>
                  progress[index] ? (
                    <BudgetProgressCard
                      key={`${group[0].target.type}:${group[0].target.id}`}
                      group={group}
                      progress={progress[index]}
                      today={today}
                      weekStartsOn={weekStartsOn}
                    />
                  ) : null,
                )}
              </Stack>
            </Box>
          )}
          {groups.upcoming.length > 0 && (
            <Box component="section" aria-labelledby="upcoming-budgets-heading" sx={{ mt: 3.5 }}>
              <Typography variant="h3" id="upcoming-budgets-heading">
                Upcoming
              </Typography>
              {groups.upcoming.map((group) => {
                const nextStart = group
                  .map((budget) => budget.startDay)
                  .filter((day) => day > today)
                  .sort()[0]
                const [, endDay] = budgetGroupRange(group)
                return (
                  <ListRow
                    key={`${group[0].target.type}:${group[0].target.id}`}
                    sx={{ flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' } }}
                  >
                    <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0, overflowWrap: 'anywhere' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {group[0].target.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatBudgetDay(nextStart)} – {formatBudgetDay(endDay)} · {budgetGroupSchedule(group)}
                      </Typography>
                    </Box>
                    <Chip size="small" variant="outlined" label={`Starts ${formatBudgetDay(nextStart)}`} />
                  </ListRow>
                )
              })}
            </Box>
          )}
        </>
      )}
    </SectionCard>
  )
}
