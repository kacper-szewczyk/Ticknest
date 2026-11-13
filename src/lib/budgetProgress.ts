import type { Budget, BudgetTarget, Weekday } from './budgets'
import { calendarDayMillis, WEEKDAYS } from './budgetValidation'

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

/** The fields progress needs from a time entry; `TimeEntry` satisfies it. */
export type ProgressEntry = {
  userId: string
  projectId?: string | null
  clientId?: string | null
  startAt: { toMillis(): number }
  endAt: { toMillis(): number } | null
}

/**
 * `off` is a past day with no target and no time. `time-off` is a day whose whole target was taken away by
 * approved leave and that has no time logged. Otherwise today is `in-progress` and later days are `upcoming`,
 * whatever has been logged on them.
 */
export type BudgetDayStatus = 'under' | 'met' | 'over' | 'off' | 'time-off' | 'in-progress' | 'upcoming'

export type BudgetDayProgress = {
  day: string
  /** The target after approved leave. */
  expectedMinutes: number
  /** Target minutes taken off by approved leave on this day. */
  leaveMinutes: number
  /** Share of the day on approved leave: 0, 0.5, or 1. */
  leaveFraction: number
  /** Completed time on the target that falls on this day, rounded to the nearest minute. */
  actualMinutes: number
  status: BudgetDayStatus
}

export type BudgetProgress = {
  userId: string
  target: BudgetTarget
  /** Every day covered by at least one of the budgets, in order. */
  days: BudgetDayProgress[]
  totalExpectedMinutes: number
  /** Expected minutes of the days that have ended. Today's target is not due until the day ends. */
  expectedToDateMinutes: number
  /** Target minutes taken off by approved leave over the whole range. */
  totalLeaveMinutes: number
  /** Target minutes taken off by approved leave on the days that have ended. */
  leaveToDateMinutes: number
  /** Minutes logged on the days that have ended plus today. */
  actualToDateMinutes: number
  /** `actualToDateMinutes − expectedToDateMinutes`: negative is behind, positive is ahead. */
  balanceMinutes: number
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>()

function zonedParts(millis: number, timeZone: string) {
  let formatter = partsFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsFormatters.set(timeZone, formatter)
  }
  const parts: Record<string, string> = {}
  for (const part of formatter.formatToParts(millis)) parts[part.type] = part.value
  return parts
}

/**
 * Returns the timezone budget days are counted in: the tracked member's snapshot, or the viewer's timezone when
 * the member joined before snapshots existed or the stored value is not a known timezone.
 */
export function progressTimeZone(memberTimeZone: unknown): string {
  const viewerTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  if (typeof memberTimeZone !== 'string' || !memberTimeZone) return viewerTimeZone
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: memberTimeZone }).resolvedOptions().timeZone
  } catch {
    return viewerTimeZone
  }
}

/** Returns the `YYYY-MM-DD` calendar date of an instant in an IANA timezone. */
export function zonedDayString(millis: number, timeZone: string): string {
  const parts = zonedParts(millis, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}`
}

// How far the timezone's wall clock is ahead of UTC at an instant.
function offsetMillis(millis: number, timeZone: string): number {
  const parts = zonedParts(millis, timeZone)
  const wallClock = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return wallClock - (millis - (((millis % 1000) + 1000) % 1000))
}

/**
 * Returns the first instant of a calendar day in an IANA timezone. The day is 23 or 25 hours long on DST
 * changes, and starts at 01:00 where a change skips midnight.
 */
export function zonedDayStartMillis(day: string, timeZone: string): number {
  const midnight = calendarDayMillis(day)
  if (midnight === null) throw new Error(`Not a calendar day: ${day}`)
  // The offset before or after a change on this day; the earlier candidate that falls on the day wins.
  const candidates = [
    midnight - offsetMillis(midnight - DAY_MS, timeZone),
    midnight - offsetMillis(midnight + DAY_MS, timeZone),
  ]
  const onDay = candidates.filter((candidate) => zonedDayString(candidate, timeZone) === day)
  return Math.min(...(onDay.length > 0 ? onDay : candidates))
}

function dayString(millis: number): string {
  return new Date(millis).toISOString().slice(0, 10)
}

function nextDay(day: string): string {
  return dayString(calendarDayMillis(day)! + DAY_MS)
}

function weekdayOf(day: string): Weekday {
  return WEEKDAYS[(new Date(calendarDayMillis(day)!).getUTCDay() + 6) % 7]
}

/** Returns the target minutes of one budget on a day: 0 outside its range and on exception dates. */
export function expectedMinutesForDay(budget: Budget, day: string): number {
  if (day < budget.startDay || day > budget.endDay || budget.exceptions.includes(day)) return 0
  return budget.weekdayMinutes[weekdayOf(day)]
}

/** Project budgets count entries on that project; client budgets count entries whose client snapshot matches. */
export function entryCountsToward(entry: ProgressEntry, userId: string, target: BudgetTarget): boolean {
  if (entry.endAt === null || entry.userId !== userId) return false
  return target.type === 'project' ? entry.projectId === target.id : entry.clientId === target.id
}

function budgetKey(budget: Budget): string {
  return `${budget.userId}/${budget.target.type}/${budget.target.id}`
}

/** Groups active budgets by user and target, since overlapping budgets for the same pair add up. */
export function groupBudgets(budgets: Budget[]): Budget[][] {
  const groups = new Map<string, Budget[]>()
  for (const budget of budgets) {
    if (budget.archived) continue
    const key = budgetKey(budget)
    groups.set(key, [...(groups.get(key) ?? []), budget])
  }
  return [...groups.values()]
}

function dayRange(budgets: Budget[]): [string, string] {
  if (budgets.length === 0) throw new Error('Pass at least one budget.')
  const startDay = budgets.reduce((day, budget) => (budget.startDay < day ? budget.startDay : day), budgets[0].startDay)
  const endDay = budgets.reduce((day, budget) => (budget.endDay > day ? budget.endDay : day), budgets[0].endDay)
  return [startDay, endDay]
}

/** Returns the instants that bound every day of the budgets in a timezone: the start inclusive, the end exclusive. */
export function budgetInstantRange(budgets: Budget[], timeZone: string): [Date, Date] {
  const [startDay, endDay] = dayRange(budgets)
  return [new Date(zonedDayStartMillis(startDay, timeZone)), new Date(zonedDayStartMillis(nextDay(endDay), timeZone))]
}

function dayStatus(
  day: string,
  today: string,
  expectedMinutes: number,
  actualMinutes: number,
  wholeDayOff: boolean,
): BudgetDayStatus {
  if (wholeDayOff && actualMinutes === 0) return 'time-off'
  if (day > today) return 'upcoming'
  if (day === today) return 'in-progress'
  if (expectedMinutes === 0 && actualMinutes === 0) return 'off'
  if (actualMinutes < expectedMinutes) return 'under'
  return actualMinutes === expectedMinutes ? 'met' : 'over'
}

/**
 * Calculates progress for active budgets that share one user and target. Days are calendar dates in the
 * tracked user's timezone, and an entry crossing midnight is split between its days. Running timers count
 * only after they stop. `leaveDays` holds the member's approved leave per calendar day (see `approvedLeaveDays`);
 * it lowers each day's target by the share of the day taken off.
 */
export function calculateBudgetProgress(
  budgets: Budget[],
  entries: ProgressEntry[],
  timeZone: string,
  now: Date,
  leaveDays: ReadonlyMap<string, number> = new Map(),
): BudgetProgress {
  if (budgets.length === 0) throw new Error('Pass at least one budget.')
  if (budgets.some((budget) => budget.archived || budgetKey(budget) !== budgetKey(budgets[0]))) {
    throw new Error('Pass active budgets that share one user and target.')
  }
  const { userId, target } = budgets[0]

  const [startDay, endDay] = dayRange(budgets)
  const covered: string[] = []
  for (let day = startDay; day <= endDay; day = nextDay(day)) {
    if (budgets.some((budget) => day >= budget.startDay && day <= budget.endDay)) covered.push(day)
  }
  // Gaps between budgets are not covered, so each day keeps its own start and end.
  const starts = covered.map((day) => zonedDayStartMillis(day, timeZone))
  const ends = covered.map((day) => zonedDayStartMillis(nextDay(day), timeZone))
  const rangeStart = starts[0]
  const rangeEnd = ends[ends.length - 1]

  const loggedMillis = covered.map(() => 0)
  for (const entry of entries) {
    if (!entryCountsToward(entry, userId, target)) continue
    const start = Math.max(entry.startAt.toMillis(), rangeStart)
    const end = Math.min(entry.endAt!.toMillis(), rangeEnd)
    if (end <= start) continue
    let index = firstDayEndingAfter(ends, start)
    for (; index < covered.length && starts[index] < end; index += 1) {
      loggedMillis[index] += Math.min(end, ends[index]) - Math.max(start, starts[index])
    }
  }

  const today = zonedDayString(now.getTime(), timeZone)
  let totalExpectedMinutes = 0
  let expectedToDateMinutes = 0
  let actualToDateMinutes = 0
  let totalLeaveMinutes = 0
  let leaveToDateMinutes = 0
  const days = covered.map((day, index): BudgetDayProgress => {
    const scheduledMinutes = budgets.reduce((sum, budget) => sum + expectedMinutesForDay(budget, day), 0)
    const leaveFraction = Math.min(1, Math.max(0, leaveDays.get(day) ?? 0))
    const expectedMinutes = Math.round(scheduledMinutes * (1 - leaveFraction))
    const leaveMinutes = scheduledMinutes - expectedMinutes
    const actualMinutes = Math.round(loggedMillis[index] / MINUTE_MS)
    totalExpectedMinutes += expectedMinutes
    totalLeaveMinutes += leaveMinutes
    if (day < today) {
      expectedToDateMinutes += expectedMinutes
      leaveToDateMinutes += leaveMinutes
    }
    if (day <= today) actualToDateMinutes += actualMinutes
    const wholeDayOff = scheduledMinutes > 0 && expectedMinutes === 0
    return {
      day,
      expectedMinutes,
      leaveMinutes,
      leaveFraction,
      actualMinutes,
      status: dayStatus(day, today, expectedMinutes, actualMinutes, wholeDayOff),
    }
  })

  return {
    userId,
    target,
    days,
    totalExpectedMinutes,
    expectedToDateMinutes,
    totalLeaveMinutes,
    leaveToDateMinutes,
    actualToDateMinutes,
    balanceMinutes: actualToDateMinutes - expectedToDateMinutes,
  }
}

// Binary search over the sorted day ends for the first day that ends after an instant.
function firstDayEndingAfter(ends: number[], millis: number): number {
  let low = 0
  let high = ends.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (ends[middle] <= millis) low = middle + 1
    else high = middle
  }
  return low
}
