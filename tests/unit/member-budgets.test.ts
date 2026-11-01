import { describe, expect, it } from 'vitest'
import type { Budget } from '../../src/lib/budgets'
import { calculateBudgetProgress, type BudgetDayProgress } from '../../src/lib/budgetProgress'
import {
  budgetDayLabel,
  budgetDaysInWeek,
  formatBudgetBalance,
  formatBudgetMinutes,
  initialBudgetWeek,
  memberBudgetGroups,
} from '../../src/lib/memberBudgets'

const WARSAW = 'Europe/Warsaw'

function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'budget-1',
    userId: 'alice',
    userDisplayName: 'Alice',
    target: { type: 'project', id: 'project-x', name: 'Project X' },
    startDay: '2026-11-02',
    endDay: '2026-12-21',
    weekdayMinutes: { mon: 480, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
    exceptions: [],
    archived: false,
    createdBy: 'owner',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

function day(overrides: Partial<BudgetDayProgress>): BudgetDayProgress {
  return { day: '2026-11-02', expectedMinutes: 480, actualMinutes: 0, status: 'under', ...overrides }
}

describe('memberBudgetGroups', () => {
  it('splits target groups into active and upcoming, leaving out ended and archived budgets', () => {
    const groups = memberBudgetGroups(
      [
        budget({ id: 'active', target: { type: 'project', id: 'p-b', name: 'Beta' } }),
        budget({ id: 'active-2', target: { type: 'client', id: 'c-a', name: 'Acme' } }),
        budget({ id: 'later', target: { type: 'project', id: 'p-c', name: 'Gamma' }, startDay: '2026-12-01' }),
        budget({ id: 'ended', target: { type: 'project', id: 'p-d', name: 'Delta' }, endDay: '2026-11-03' }),
        budget({ id: 'archived', target: { type: 'project', id: 'p-e', name: 'Echo' }, archived: true }),
      ],
      '2026-11-10',
    )
    expect(groups.active.map((group) => group[0].id)).toEqual(['active-2', 'active'])
    expect(groups.upcoming.map((group) => group[0].id)).toEqual(['later'])
  })

  it('keeps overlapping budgets on one target together, active when any of them covers today', () => {
    const groups = memberBudgetGroups(
      [budget({ id: 'old', endDay: '2026-11-05' }), budget({ id: 'current', startDay: '2026-11-09' })],
      '2026-11-10',
    )
    expect(groups.active).toHaveLength(1)
    expect(groups.active[0].map((item) => item.id)).toEqual(['old', 'current'])
  })
})

describe('formatting', () => {
  it('formats minutes as hours and minutes', () => {
    expect(formatBudgetMinutes(150)).toBe('2h 30m')
    expect(formatBudgetMinutes(120)).toBe('2h')
    expect(formatBudgetMinutes(45)).toBe('45m')
    expect(formatBudgetMinutes(0)).toBe('0h')
    expect(formatBudgetMinutes(-90)).toBe('1h 30m')
  })

  it('signs the balance', () => {
    expect(formatBudgetBalance(-150)).toBe('−2h 30m')
    expect(formatBudgetBalance(60)).toBe('+1h')
    expect(formatBudgetBalance(0)).toBe('0h')
  })
})

describe('budgetDayLabel', () => {
  it('describes each status in words', () => {
    expect(budgetDayLabel(day({ actualMinutes: 360, status: 'under' }))).toBe('2h under')
    expect(budgetDayLabel(day({ actualMinutes: 510, status: 'over' }))).toBe('30m over')
    expect(budgetDayLabel(day({ actualMinutes: 480, status: 'met' }))).toBe('Met')
    expect(budgetDayLabel(day({ expectedMinutes: 0, status: 'off' }))).toBe('No target')
    expect(budgetDayLabel(day({ actualMinutes: 300, status: 'in-progress' }))).toBe('3h to go')
    expect(budgetDayLabel(day({ actualMinutes: 500, status: 'in-progress' }))).toBe('Met so far')
    expect(budgetDayLabel(day({ expectedMinutes: 0, status: 'in-progress' }))).toBe('No target')
    expect(budgetDayLabel(day({ status: 'upcoming' }))).toBe('Upcoming')
    expect(budgetDayLabel(day({ expectedMinutes: 0, status: 'upcoming' }))).toBe('No target')
  })

  it('shows a Monday with 6h of an 8h target as 2h under once it has ended', () => {
    const millis = (iso: string) => ({ toMillis: () => Date.parse(iso) })
    const progress = calculateBudgetProgress(
      [budget()],
      [
        {
          userId: 'alice',
          projectId: 'project-x',
          startAt: millis('2026-11-02T08:00:00+01:00'),
          endAt: millis('2026-11-02T14:00:00+01:00'),
        },
      ],
      WARSAW,
      new Date('2026-11-03T10:00:00+01:00'),
    )
    expect(budgetDayLabel(progress.days[0])).toBe('2h under')
    expect(formatBudgetBalance(progress.balanceMinutes)).toBe('−2h')
  })
})

describe('budget weeks', () => {
  const days = calculateBudgetProgress([budget()], [], WARSAW, new Date('2026-11-01T12:00:00Z')).days

  it('starts on the week of today, kept inside the budget days', () => {
    expect(initialBudgetWeek(days, '2026-11-12', 1)).toBe('2026-11-09')
    expect(initialBudgetWeek(days, '2026-11-12', 0)).toBe('2026-11-08')
    expect(initialBudgetWeek(days, '2026-10-01', 1)).toBe('2026-11-02')
    expect(initialBudgetWeek(days, '2027-03-01', 1)).toBe('2026-12-21')
  })

  it('returns only budget days inside the week', () => {
    expect(budgetDaysInWeek(days, '2026-11-09').map((item) => item.day)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ])
    expect(budgetDaysInWeek(days, '2026-11-01').map((item) => item.day)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
    ])
  })
})
