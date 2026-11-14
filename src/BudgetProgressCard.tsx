import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useAppLanguage } from './i18n'
import type { Budget } from './lib/budgets'
import { WEEKDAY_LABELS } from './lib/budgetForm'
import type { BudgetDayProgress, BudgetDayStatus, BudgetProgress } from './lib/budgetProgress'
import { WEEKDAYS } from './lib/budgetValidation'
import { dayDate, formatWeekLabel, shiftDayString } from './lib/dates'
import {
  budgetDayLabel,
  budgetDaysInWeek,
  budgetGroupRange,
  budgetGroupSchedule,
  formatBudgetBalance,
  formatBudgetDay,
  formatBudgetMinutes,
  initialBudgetWeek,
} from './lib/memberBudgets'

// A symbol next to each status keeps it readable without color.
const STATUS_STYLES: Record<BudgetDayStatus, { symbol: string; color: string }> = {
  under: { symbol: '▼', color: 'error.main' },
  met: { symbol: '✓', color: 'success.main' },
  over: { symbol: '▲', color: 'success.main' },
  off: { symbol: '–', color: 'text.disabled' },
  'time-off': { symbol: '◇', color: 'info.main' },
  'in-progress': { symbol: '●', color: 'primary.main' },
  upcoming: { symbol: '○', color: 'text.disabled' },
}

// One target's progress: today's target, the running balance, and a week-by-week breakdown. Shared by the
// member's own view and the team overview so both show the same numbers.
export function BudgetProgressCard({
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
  const language = useAppLanguage()
  const { target } = progress
  const [startDay, endDay] = budgetGroupRange(group)
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
        {formatBudgetDay(startDay)} – {formatBudgetDay(endDay)} · {budgetGroupSchedule(group)}
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
      {progress.totalLeaveMinutes > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Approved time off lowers the target by {formatBudgetMinutes(progress.totalLeaveMinutes)}
          {progress.leaveToDateMinutes > 0 && ` (${formatBudgetMinutes(progress.leaveToDateMinutes)} so far)`}; the
          numbers above already leave it out.
        </Typography>
      )}

      <Box component="section" aria-labelledby={weekHeadingId} sx={{ mt: 2.5 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between' }}
        >
          {/* Only the short week summary is live, so Previous/Next week announces it without reading every day. */}
          <div aria-live="polite">
            <Typography variant="body2" id={weekHeadingId} sx={{ fontWeight: 600 }}>
              {formatWeekLabel(weekStart, language)}
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
      {day.leaveFraction > 0 && day.status !== 'time-off' && (
        <Typography variant="caption" color="text.secondary">
          {day.leaveFraction < 1 ? 'Half day off' : 'Time off'} · −{formatBudgetMinutes(day.leaveMinutes)}
        </Typography>
      )}
    </Box>
  )
}
