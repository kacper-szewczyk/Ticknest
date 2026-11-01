import type { Budget } from './budgets'
import { weekdaySummary } from './budgetForm'
import { groupBudgets, type BudgetDayProgress } from './budgetProgress'
import { dayDate, shiftDayString, startOfWeekString } from './dates'

export type MemberBudgetGroups = {
  /** Target groups with at least one budget covering today. */
  active: Budget[][]
  /** Target groups that do not cover today but have a budget starting later. */
  upcoming: Budget[][]
}

const byTargetName = (a: Budget[], b: Budget[]) => a[0].target.name.localeCompare(b[0].target.name)

/**
 * Splits a member's budgets into groups per target, since overlapping budgets on one target add up. Groups whose
 * budgets have all ended are left out, and archived budgets are ignored.
 */
export function memberBudgetGroups(budgets: Budget[], today: string): MemberBudgetGroups {
  const active: Budget[][] = []
  const upcoming: Budget[][] = []
  for (const group of groupBudgets(budgets)) {
    if (group.some((budget) => budget.startDay <= today && budget.endDay >= today)) active.push(group)
    else if (group.some((budget) => budget.startDay > today)) upcoming.push(group)
  }
  return { active: active.sort(byTargetName), upcoming: upcoming.sort(byTargetName) }
}

/** Formats minutes as `2h 30m`, `2h`, `45m`, or `0h`, ignoring the sign. */
export function formatBudgetMinutes(minutes: number): string {
  const absolute = Math.abs(minutes)
  const hours = Math.floor(absolute / 60)
  const rest = absolute % 60
  if (hours && rest) return `${hours}h ${rest}m`
  if (hours) return `${hours}h`
  return rest ? `${rest}m` : '0h'
}

/** Formats a running balance with its sign: `−2h 30m` behind, `+1h` ahead, `0h` on track. */
export function formatBudgetBalance(minutes: number): string {
  if (minutes === 0) return '0h'
  return `${minutes < 0 ? '−' : '+'}${formatBudgetMinutes(minutes)}`
}

/** Describes a day's status in words, so it does not rely on color. */
export function budgetDayLabel(day: BudgetDayProgress): string {
  const shortfall = day.expectedMinutes - day.actualMinutes
  switch (day.status) {
    case 'under':
      return `${formatBudgetMinutes(shortfall)} under`
    case 'over':
      return `${formatBudgetMinutes(-shortfall)} over`
    case 'met':
      return 'Met'
    case 'off':
      return 'No target'
    case 'in-progress':
      if (day.expectedMinutes === 0) return 'No target'
      return shortfall > 0 ? `${formatBudgetMinutes(shortfall)} to go` : 'Met so far'
    case 'upcoming':
      return day.expectedMinutes === 0 ? 'No target' : 'Upcoming'
  }
}

/** Returns the start of the week to show first: the week of today, kept inside the budget days. */
export function initialBudgetWeek(days: BudgetDayProgress[], today: string, weekStartsOn: number): string {
  const first = days[0].day
  const last = days[days.length - 1].day
  const shown = today < first ? first : today > last ? last : today
  return startOfWeekString(shown, weekStartsOn)
}

/** Returns the budget days that fall in the week starting on `weekStart`. */
export function budgetDaysInWeek(days: BudgetDayProgress[], weekStart: string): BudgetDayProgress[] {
  const weekEnd = shiftDayString(weekStart, 6)
  return days.filter((day) => day.day >= weekStart && day.day <= weekEnd)
}

/** Formats a `YYYY-MM-DD` budget day as a short date with the year. */
export function formatBudgetDay(day: string): string {
  return dayDate(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Returns the first and last day covered by a target group's budgets. */
export function budgetGroupRange(group: Budget[]): [string, string] {
  const startDay = group.reduce((day, budget) => (budget.startDay < day ? budget.startDay : day), group[0].startDay)
  const endDay = group.reduce((day, budget) => (budget.endDay > day ? budget.endDay : day), group[0].endDay)
  return [startDay, endDay]
}

/** Describes a target group's weekday targets, or how many budgets overlap on it. */
export function budgetGroupSchedule(group: Budget[]): string {
  return group.length === 1 ? weekdaySummary(group[0].weekdayMinutes) : `${group.length} overlapping budgets`
}
