import type { BudgetInput } from './budgets'

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
// Bounds progress calculation to about two years of entries per budget.
export const MAX_BUDGET_DAYS = 731
const DAY_MS = 24 * 60 * 60 * 1000

export type BudgetField = 'userId' | 'target' | 'startDay' | 'endDay' | 'weekdayMinutes' | 'exceptions'

// A validation failure the form can attach to one input instead of announcing it for the whole form.
export class BudgetFieldError extends Error {
  readonly field: BudgetField

  constructor(field: BudgetField, message: string) {
    super(message)
    this.name = 'BudgetFieldError'
    this.field = field
  }
}

/** Returns the UTC midnight of a `YYYY-MM-DD` calendar date, or null for malformed or impossible dates. */
export function calendarDayMillis(day: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return null
  const [year, month, date] = match.slice(1).map(Number)
  const millis = Date.UTC(year, month - 1, date)
  const parsed = new Date(millis)
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === date
    ? millis
    : null
}

/** Mirrors the saveBudget callable's checks so the form can explain problems before saving. */
export function validateBudgetInput(input: BudgetInput): void {
  if (!input.userId) throw new BudgetFieldError('userId', 'Choose a workspace member.')
  if (!input.target.id) throw new BudgetFieldError('target', 'Choose a project or a client.')
  const start = calendarDayMillis(input.startDay)
  if (start === null) throw new BudgetFieldError('startDay', 'Enter a valid start date.')
  const end = calendarDayMillis(input.endDay)
  if (end === null) throw new BudgetFieldError('endDay', 'Enter a valid end date.')
  if (end < start) throw new BudgetFieldError('endDay', 'The end date must be on or after the start date.')
  if ((end - start) / DAY_MS + 1 > MAX_BUDGET_DAYS) {
    throw new BudgetFieldError('endDay', `A budget can span at most ${MAX_BUDGET_DAYS} days.`)
  }
  for (const weekday of WEEKDAYS) {
    const minutes = input.weekdayMinutes[weekday]
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
      throw new BudgetFieldError('weekdayMinutes', 'Weekday targets must be whole minutes between 0 and 1440.')
    }
  }
  if (WEEKDAYS.every((weekday) => input.weekdayMinutes[weekday] === 0)) {
    throw new BudgetFieldError('weekdayMinutes', 'Set a target above zero for at least one weekday.')
  }
  for (const exception of input.exceptions) {
    const millis = calendarDayMillis(exception)
    if (millis === null) throw new BudgetFieldError('exceptions', 'Enter valid exception dates.')
    if (millis < start || millis > end) {
      throw new BudgetFieldError('exceptions', 'Exception dates must fall between the start and end dates.')
    }
  }
}
