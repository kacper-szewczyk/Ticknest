import type { Budget, BudgetTarget, BudgetTargetType, WeekdayMinutes } from './budgets'
import type { Catalog } from './catalog'
import { WEEKDAYS } from './budgetValidation'
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

/**
 * Parses an hours field into whole minutes. Accepts decimal hours (`7.5`, `7,5`) and `H:MM` (`7:30`); a blank
 * field is no target. Returns null when the text is neither.
 */
export function parseHoursInput(text: string): number | null {
  const value = text.trim()
  if (!value) return 0
  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(value)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])
  if (!/^(\d{1,2}([.,]\d*)?|[.,]\d+)$/.test(value)) return null
  return Math.round(Number(value.replace(',', '.')) * 60)
}

/** Formats minutes as `H:MM`, the form the hours fields show after editing. */
export function formatHoursInput(minutes: number): string {
  if (minutes <= 0) return ''
  return `${Math.floor(minutes / 60)}:${(minutes % 60).toString().padStart(2, '0')}`
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
  userId: string
  /** A target key from `budgetTargetKey`, or empty for every target. */
  targetKey: string
  phase: BudgetPhaseFilter
}

export function budgetTargetKey(target: Pick<BudgetTarget, 'type' | 'id'>): string {
  return `${target.type}:${target.id}`
}

/**
 * Filters and orders budgets for the management list. `todayFor` returns today's date in the tracked member's
 * timezone, since budget days are counted there.
 */
export function filterBudgets(
  budgets: Budget[],
  filters: BudgetListFilters,
  todayFor: (budget: Budget) => string,
): Budget[] {
  return budgets
    .filter((budget) => !filters.userId || budget.userId === filters.userId)
    .filter((budget) => !filters.targetKey || budgetTargetKey(budget.target) === filters.targetKey)
    .filter((budget) => {
      if (filters.phase === 'all') return true
      const phase = budgetPhase(budget, todayFor(budget))
      return filters.phase === 'current' ? phase === 'active' || phase === 'upcoming' : phase === filters.phase
    })
    .sort(
      (a, b) =>
        a.userDisplayName.localeCompare(b.userDisplayName) ||
        a.startDay.localeCompare(b.startDay) ||
        a.target.name.localeCompare(b.target.name),
    )
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
