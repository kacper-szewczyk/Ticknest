import type { Budget, BudgetTarget, BudgetTargetType, Weekday, WeekdayMinutes } from './budgets'
import type { Catalog } from './catalog'
import { MAX_BUDGET_DAYS, WEEKDAYS, calendarDayMillis } from './budgetValidation'
import { formatHoursInput } from './hours'
import { NO_CLIENT_GROUP } from './workOptions'

export const WEEKDAY_LABELS: Record<keyof WeekdayMinutes, { short: string; long: string }> = {
  mon: { short: 'Mon', long: 'Monday' },
  tue: { short: 'Tue', long: 'Tuesday' },
  wed: { short: 'Wed', long: 'Wednesday' },
  thu: { short: 'Thu', long: 'Thursday' },
  fri: { short: 'Fri', long: 'Friday' },
  sat: { short: 'Sat', long: 'Saturday' },
  sun: { short: 'Sun', long: 'Sunday' },
}

/** Summarises the weekday targets as `Mon 8:00 · Tue 4:00`, skipping weekdays without a target. */
export function weekdaySummary(weekdayMinutes: WeekdayMinutes): string {
  return WEEKDAYS.filter((weekday) => weekdayMinutes[weekday] > 0)
    .map((weekday) => `${WEEKDAY_LABELS[weekday].short} ${formatHoursInput(weekdayMinutes[weekday])}`)
    .join(' · ')
}

export type BudgetPhase = 'active' | 'upcoming' | 'past' | 'archived'

export function budgetPhase(budget: Pick<Budget, 'startDay' | 'endDay' | 'archived'>, today: string): BudgetPhase {
  if (budget.archived) return 'archived'
  if (budget.endDay < today) return 'past'
  if (budget.startDay > today) return 'upcoming'
  return 'active'
}

/** `current` is active plus upcoming, the default view. */
export type BudgetPhaseFilter = 'current' | BudgetPhase | 'all'

export type BudgetListFilters = {
  /** Free text matched against the member and the project or client name, ignoring case. */
  query: string
  phase: BudgetPhaseFilter
}

export function budgetTargetKey(target: Pick<BudgetTarget, 'type' | 'id'>): string {
  return `${target.type}:${target.id}`
}

const snapshotName = (budget: Budget) => budget.userDisplayName

/**
 * Filters and orders budgets for the management list. `todayFor` returns today's date in the tracked member's
 * timezone, since budget days are counted there. `memberName` returns the member's current name; every word of the
 * query must appear in it, in the name snapshot, or in the target name.
 */
export function filterBudgets(
  budgets: Budget[],
  filters: BudgetListFilters,
  todayFor: (budget: Budget) => string,
  memberName: (budget: Budget) => string = snapshotName,
): Budget[] {
  const words = filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return budgets
    .filter((budget) => {
      const text = `${memberName(budget)} ${budget.userDisplayName} ${budget.target.name}`.toLocaleLowerCase()
      return words.every((word) => text.includes(word))
    })
    .filter((budget) => {
      if (filters.phase === 'all') return true
      const phase = budgetPhase(budget, todayFor(budget))
      return filters.phase === 'current' ? phase === 'active' || phase === 'upcoming' : phase === filters.phase
    })
    .sort(
      (a, b) =>
        memberName(a).localeCompare(memberName(b)) ||
        a.userId.localeCompare(b.userId) ||
        a.startDay.localeCompare(b.startDay) ||
        a.target.name.localeCompare(b.target.name),
    )
}

export type BudgetMemberGroup = { userId: string; name: string; budgets: Budget[] }

/** Groups an ordered budget list by member, keeping the order of the members and of their budgets. */
export function groupBudgetsByMember(
  budgets: Budget[],
  memberName: (budget: Budget) => string = snapshotName,
): BudgetMemberGroup[] {
  const groups = new Map<string, BudgetMemberGroup>()
  for (const budget of budgets) {
    const group = groups.get(budget.userId)
    if (group) group.budgets.push(budget)
    else groups.set(budget.userId, { userId: budget.userId, name: memberName(budget), budgets: [budget] })
  }
  return [...groups.values()]
}

/** `weekdays` repeats one daily value Monday to Friday, `everyday` on all seven days; `custom` sets each day. */
export type HoursPreset = 'weekdays' | 'everyday' | 'custom'

const WORKDAYS: readonly Weekday[] = WEEKDAYS.slice(0, 5)

/** Spreads one daily value over a preset's days; the other days get no target. */
export function presetWeekdayMinutes(preset: Exclude<HoursPreset, 'custom'>, dailyMinutes: number): WeekdayMinutes {
  return Object.fromEntries(
    WEEKDAYS.map((weekday) => [weekday, preset === 'everyday' || WORKDAYS.includes(weekday) ? dailyMinutes : 0]),
  ) as WeekdayMinutes
}

/** Finds the simplest preset that reproduces the weekday targets, with its daily value. */
export function detectHoursPreset(weekdayMinutes: WeekdayMinutes): { preset: HoursPreset; dailyMinutes: number } {
  const daily = weekdayMinutes.mon
  const matches = (preset: Exclude<HoursPreset, 'custom'>) => {
    const expected = presetWeekdayMinutes(preset, daily)
    return daily > 0 && WEEKDAYS.every((weekday) => expected[weekday] === weekdayMinutes[weekday])
  }
  if (matches('weekdays')) return { preset: 'weekdays', dailyMinutes: daily }
  if (matches('everyday')) return { preset: 'everyday', dailyMinutes: daily }
  return { preset: 'custom', dailyMinutes: 0 }
}

export function weeklyMinutes(weekdayMinutes: WeekdayMinutes): number {
  return WEEKDAYS.reduce((sum, weekday) => sum + weekdayMinutes[weekday], 0)
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Totals a budget's target over its date range, skipping days off. Returns null while the range is incomplete,
 * reversed, or longer than a budget may be.
 */
export function totalBudgetMinutes(
  budget: Pick<Budget, 'startDay' | 'endDay' | 'weekdayMinutes' | 'exceptions'>,
): number | null {
  const start = calendarDayMillis(budget.startDay)
  const end = calendarDayMillis(budget.endDay)
  if (start === null || end === null || end < start) return null
  const days = (end - start) / DAY_MS + 1
  if (days > MAX_BUDGET_DAYS) return null
  const daysOff = new Set(budget.exceptions)
  let total = 0
  for (let index = 0; index < days; index++) {
    const date = new Date(start + index * DAY_MS)
    if (daysOff.has(date.toISOString().slice(0, 10))) continue
    total += budget.weekdayMinutes[WEEKDAYS[(date.getUTCDay() + 6) % 7]]
  }
  return total
}

export type BudgetTargetOption = {
  key: string
  type: BudgetTargetType
  id: string
  name: string
  /** The client the option is listed under; a client's own row is listed under itself. */
  group: string
  color: string | null
  archived: boolean
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

/**
 * Builds the target picker rows: each active client followed by its active projects, then projects without a
 * client. An archived or deleted current target stays listed so an existing budget remains editable.
 */
export function buildBudgetTargetOptions(catalog: Catalog, current?: BudgetTarget): BudgetTargetOption[] {
  const currentKey = current ? budgetTargetKey(current) : null
  const clientsById = new Map(catalog.clients.map((client) => [client.id, client]))
  const options: BudgetTargetOption[] = []
  const projectRows = (clientId: string | null, group: string) =>
    catalog.projects
      .filter((project) =>
        clientId ? project.clientId === clientId : !project.clientId || !clientsById.has(project.clientId),
      )
      .sort(byName)
      .map<BudgetTargetOption>((project) => ({
        key: `project:${project.id}`,
        type: 'project',
        id: project.id,
        name: project.name,
        group,
        color: project.color,
        archived: project.archived || (!!clientId && clientsById.get(clientId)?.archived === true),
      }))

  for (const client of [...catalog.clients].sort(byName)) {
    const rows: BudgetTargetOption[] = [
      {
        key: `client:${client.id}`,
        type: 'client',
        id: client.id,
        name: client.name,
        group: client.name,
        color: null,
        archived: client.archived,
      },
      ...projectRows(client.id, client.name),
    ]
    options.push(...rows.filter((row) => !row.archived || row.key === currentKey))
  }
  options.push(...projectRows(null, NO_CLIENT_GROUP).filter((row) => !row.archived || row.key === currentKey))

  if (current && currentKey && !options.some((option) => option.key === currentKey)) {
    options.push({ ...current, key: currentKey, group: 'Archived', color: null, archived: true })
  }
  return options
}
