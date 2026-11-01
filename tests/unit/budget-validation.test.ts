import { describe, expect, it } from 'vitest'
import type { BudgetInput } from '../../src/lib/budgets'
import { BudgetFieldError, calendarDayMillis, validateBudgetInput } from '../../src/lib/budgetValidation'

function budget(overrides: Partial<BudgetInput> = {}): BudgetInput {
  return {
    userId: 'alice',
    target: { type: 'project', id: 'project-site' },
    startDay: '2026-11-02',
    endDay: '2026-12-21',
    weekdayMinutes: { mon: 480, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
    exceptions: [],
    ...overrides,
  }
}

function fieldOf(input: BudgetInput): string | null {
  try {
    validateBudgetInput(input)
    return null
  } catch (error) {
    if (error instanceof BudgetFieldError) return error.field
    throw error
  }
}

describe('calendarDayMillis', () => {
  it('returns UTC midnight for a valid date', () => {
    expect(calendarDayMillis('2026-11-02')).toBe(Date.UTC(2026, 10, 2))
  })

  it('rejects malformed and impossible dates', () => {
    expect(calendarDayMillis('2026-2-1')).toBeNull()
    expect(calendarDayMillis('2026-02-30')).toBeNull()
    expect(calendarDayMillis('2027-02-29')).toBeNull()
    expect(calendarDayMillis('2028-02-29')).toBe(Date.UTC(2028, 1, 29))
  })
})

describe('validateBudgetInput', () => {
  it('accepts a valid budget, including a single-day range', () => {
    expect(fieldOf(budget())).toBeNull()
    expect(fieldOf(budget({ endDay: '2026-11-02' }))).toBeNull()
  })

  it('requires a member and a target', () => {
    expect(fieldOf(budget({ userId: '' }))).toBe('userId')
    expect(fieldOf(budget({ target: { type: 'client', id: '' } }))).toBe('target')
  })

  it('rejects an end before the start', () => {
    expect(fieldOf(budget({ startDay: '2026-11-02', endDay: '2026-11-01' }))).toBe('endDay')
  })

  it('allows at most 731 days, inclusive', () => {
    expect(fieldOf(budget({ startDay: '2026-01-01', endDay: '2028-01-01' }))).toBeNull()
    expect(fieldOf(budget({ startDay: '2026-01-01', endDay: '2028-01-02' }))).toBe('endDay')
  })

  it('requires whole weekday minutes between 0 and 1440 with at least one above zero', () => {
    const zero = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 }
    expect(fieldOf(budget({ weekdayMinutes: zero }))).toBe('weekdayMinutes')
    expect(fieldOf(budget({ weekdayMinutes: { ...zero, mon: 1441 } }))).toBe('weekdayMinutes')
    expect(fieldOf(budget({ weekdayMinutes: { ...zero, mon: 30.5 } }))).toBe('weekdayMinutes')
    expect(fieldOf(budget({ weekdayMinutes: { ...zero, mon: -1, tue: 60 } }))).toBe('weekdayMinutes')
    expect(fieldOf(budget({ weekdayMinutes: { ...zero, sun: 1440 } }))).toBeNull()
  })

  it('requires exception dates inside the range', () => {
    expect(fieldOf(budget({ exceptions: ['2026-11-02', '2026-12-21'] }))).toBeNull()
    expect(fieldOf(budget({ exceptions: ['2026-11-01'] }))).toBe('exceptions')
    expect(fieldOf(budget({ exceptions: ['2026-12-22'] }))).toBe('exceptions')
    expect(fieldOf(budget({ exceptions: ['2026-11-31'] }))).toBe('exceptions')
  })
})
