import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { type Budget, subscribeToBudgets } from './lib/budgets'
import { WEEKDAY_LABELS, weekdaySummary } from './lib/budgetForm'
import {
  type BudgetDayProgress,
  type BudgetDayStatus,
  type BudgetProgress,
  budgetInstantRange,
  calculateBudgetProgress,
  progressTimeZone,
  zonedDayString,
} from './lib/budgetProgress'
import { WEEKDAYS } from './lib/budgetValidation'
import { dayDate, formatWeekLabel, shiftDayString } from './lib/dates'
import { readableError } from './lib/errors'
import {
  budgetDayLabel,
  budgetDaysInWeek,
  formatBudgetBalance,
  formatBudgetMinutes,
  initialBudgetWeek,
  memberBudgetGroups,
} from './lib/memberBudgets'
import { type TimeEntry, subscribeToCompletedEntriesOverlapping } from './lib/timeEntries'
import { EmptyText, FormMessage, ListRow, LoadingState, SectionCard, SectionHeading } from './ui'

// A symbol next to each status keeps it readable without color.
const STATUS_STYLES: Record<BudgetDayStatus, { symbol: string; color: string }> = {
  under: { symbol: '▼', color: 'error.main' },
  met: { symbol: '✓', color: 'success.main' },
  over: { symbol: '▲', color: 'success.main' },
  off: { symbol: '–', color: 'text.disabled' },
  'in-progress': { symbol: '●', color: 'primary.main' },
  upcoming: { symbol: '○', color: 'text.disabled' },
}

// "Today" moves on at midnight in the member's timezone, so the panel re-reads the clock every minute.
const CLOCK_TICK_MS = 60_000

function formatDay(day: string): string {
  return dayDate(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function groupRange(group: Budget[]): [string, string] {
  const startDay = group.reduce((day, budget) => (budget.startDay < day ? budget.startDay : day), group[0].startDay)
  const endDay = group.reduce((day, budget) => (budget.endDay > day ? budget.endDay : day), group[0].endDay)
  return [startDay, endDay]
}

function groupSchedule(group: Budget[]): string {
  return group.length === 1 ? weekdaySummary(group[0].weekdayMinutes) : `${group.length} overlapping budgets`
}

// Members follow their own budgets: today's target, the running balance, and a week-by-week breakdown.
export function MyBudgetsPanel({
  workspaceId,
  userId,
  memberTimeZone,
  weekStartsOn,
}: {
  workspaceId: string
  userId: string
  memberTimeZone: string | undefined
  weekStartsOn: number
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
      <SectionHeading id="my-budgets-heading" kicker="YOUR HOUR TARGETS" title="My budgets" />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.6 }}>
        Hours you’re asked to log on a project or client. Only completed entries count, and days are counted in{' '}
        {timeZone.replaceAll('_', ' ')}.
      </Typography>
      {error && <FormMessage severity="error">{error}</FormMessage>}

      {loading && !error ? (
        <LoadingState label="Loading your budgets…" sx={{ py: 6 }} />
      ) : !hasActive && groups.upcoming.length === 0 ? (
        <EmptyText>
          You have no active or upcoming budgets. Owners and managers set them from the Budgets page.
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
                const [, endDay] = groupRange(group)
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
                        {formatDay(nextStart)} – {formatDay(endDay)} · {groupSchedule(group)}
                      </Typography>
                    </Box>
                    <Chip size="small" variant="outlined" label={`Starts ${formatDay(nextStart)}`} />
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

function BudgetProgressCard({
  group,
  progress,
  today,
  weekStartsOn,
}: {
  group: Budget[]
  progress: BudgetProgress
  today: string
  weekStartsOn: number
}) {
  const { target } = progress
  const [startDay, endDay] = groupRange(group)
  const [weekStart, setWeekStart] = useState(() => initialBudgetWeek(progress.days, today, weekStartsOn))
  const weekDays = budgetDaysInWeek(progress.days, weekStart)
  const todayProgress = progress.days.find((day) => day.day === today)
  const weekExpected = weekDays.reduce((sum, day) => sum + day.expectedMinutes, 0)
  const weekActual = weekDays.reduce((sum, day) => sum + day.actualMinutes, 0)
  const balance = progress.balanceMinutes
  const headingId = `budget-${target.type}-${target.id}`
  const weekHeadingId = `${headingId}-week`

  return (
    <Paper
      component="article"
      variant="outlined"
      aria-labelledby={headingId}
      sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: '14px', minWidth: 0 }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
        <Typography variant="h3" id={headingId} sx={{ overflowWrap: 'anywhere' }}>
          {target.name}
        </Typography>
        <Chip size="small" variant="outlined" label={target.type === 'client' ? 'Client' : 'Project'} />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {formatDay(startDay)} – {formatDay(endDay)} · {groupSchedule(group)}
      </Typography>

      <Box
        component="dl"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
          gap: 1.5,
          m: 0,
          mt: 2,
          '& dt': { typography: 'caption', color: 'text.secondary' },
          '& dd': { m: 0, mt: 0.25, typography: 'body1', fontWeight: 650 },
        }}
      >
        <div>
          <dt>Today</dt>
          <dd>
            {todayProgress && todayProgress.expectedMinutes > 0
              ? `${formatBudgetMinutes(todayProgress.actualMinutes)} of ${formatBudgetMinutes(todayProgress.expectedMinutes)}`
              : `${formatBudgetMinutes(todayProgress?.actualMinutes ?? 0)} · no target`}
          </dd>
        </div>
        <div>
          <dt>Running balance</dt>
          <Box component="dd" sx={{ color: balance < 0 ? 'error.main' : balance > 0 ? 'success.main' : undefined }}>
            {formatBudgetBalance(balance)}{' '}
            <Typography component="span" variant="body2" color="text.secondary">
              {balance < 0 ? 'behind' : balance > 0 ? 'ahead' : 'on track'}
            </Typography>
          </Box>
        </div>
        <div>
          <dt>Logged to date</dt>
          <dd>
            {formatBudgetMinutes(progress.actualToDateMinutes)} of {formatBudgetMinutes(progress.totalExpectedMinutes)}
          </dd>
        </div>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        The balance counts the days that have ended plus the time logged today; today’s target is due at midnight.
      </Typography>

      <Box component="section" aria-labelledby={weekHeadingId} sx={{ mt: 2.5 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between' }}
        >
          <div>
            <Typography variant="body2" id={weekHeadingId} sx={{ fontWeight: 600 }}>
              {formatWeekLabel(weekStart)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatBudgetMinutes(weekActual)} of {formatBudgetMinutes(weekExpected)} this week
            </Typography>
          </div>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setWeekStart(shiftDayString(weekStart, -7))}
              disabled={weekStart <= startDay}
            >
              Previous week
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setWeekStart(shiftDayString(weekStart, 7))}
              disabled={shiftDayString(weekStart, 6) >= endDay}
            >
              Next week
            </Button>
          </Stack>
        </Stack>
        <Box
          component="ol"
          aria-live="polite"
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              sm: 'repeat(4, minmax(0, 1fr))',
              md: 'repeat(7, 1fr)',
            },
            gap: 1,
            listStyle: 'none',
            m: 0,
            mt: 1.5,
            p: 0,
          }}
        >
          {weekDays.map((day) => (
            <BudgetDayCell key={day.day} day={day} isToday={day.day === today} />
          ))}
        </Box>
      </Box>
    </Paper>
  )
}

function BudgetDayCell({ day, isToday }: { day: BudgetDayProgress; isToday: boolean }) {
  const date = dayDate(day.day)
  const weekday = WEEKDAY_LABELS[WEEKDAYS[(date.getDay() + 6) % 7]]
  const style = STATUS_STYLES[day.status]
  return (
    <Box
      component="li"
      aria-current={isToday ? 'date' : undefined}
      sx={{
        display: 'grid',
        gap: 0.25,
        p: 1.25,
        borderRadius: '10px',
        border: 1,
        borderColor: isToday ? 'primary.main' : 'divider',
        minWidth: 0,
      }}
    >
      <Typography variant="caption" color="text.secondary" noWrap>
        <abbr title={weekday.long} style={{ textDecoration: 'none' }}>
          {weekday.short}
        </abbr>{' '}
        {date.getDate()}
        {isToday && ' · Today'}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 650 }}>
        {formatBudgetMinutes(day.actualMinutes)}
        <Typography component="span" variant="caption" color="text.secondary">
          {' '}
          / {formatBudgetMinutes(day.expectedMinutes)}
        </Typography>
      </Typography>
      <Typography variant="caption" sx={{ color: style.color, fontWeight: 600 }}>
        <span aria-hidden="true">{style.symbol}</span> {budgetDayLabel(day)}
      </Typography>
    </Box>
  )
}
