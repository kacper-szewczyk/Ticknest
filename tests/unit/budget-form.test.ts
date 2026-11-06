import { describe, expect, it } from 'vitest'
import type { Budget } from '../../src/lib/budgets'
import {
  budgetPhase,
  buildBudgetTargetOptions,
  detectHoursPreset,
  filterBudgets,
  groupBudgetsByMember,
  presetWeekdayMinutes,
  totalBudgetMinutes,
  weekdaySummary,
  weeklyMinutes,
} from '../../src/lib/budgetForm'
import type { Catalog } from '../../src/lib/catalog'

function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'budget-1',
    userId: 'alice',
    userDisplayName: 'Alice',
    target: { type: 'project', id: 'project-site', name: 'Site' },
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

describe('weekdaySummary', () => {
  it('lists weekdays with a target in week order', () => {
    expect(weekdaySummary({ mon: 480, tue: 0, wed: 270, thu: 0, fri: 0, sat: 0, sun: 60 })).toBe(
      'Mon 8:00 · Wed 4:30 · Sun 1:00',
    )
  })
})

describe('budgetPhase', () => {
  it('places a budget relative to today, inclusive of both ends', () => {
    expect(budgetPhase(budget(), '2026-11-01')).toBe('upcoming')
    expect(budgetPhase(budget(), '2026-11-02')).toBe('active')
    expect(budgetPhase(budget(), '2026-12-21')).toBe('active')
    expect(budgetPhase(budget(), '2026-12-22')).toBe('past')
  })

  it('reports archived budgets whatever their dates', () => {
    expect(budgetPhase(budget({ archived: true }), '2026-11-10')).toBe('archived')
  })
})

describe('filterBudgets', () => {
  const budgets = [
    budget({ id: 'active-bob', userId: 'bob', userDisplayName: 'Bob' }),
    budget({ id: 'active-alice' }),
    budget({ id: 'upcoming', startDay: '2026-12-01' }),
    budget({ id: 'past', startDay: '2026-10-01', endDay: '2026-10-31' }),
    budget({ id: 'archived', archived: true }),
    budget({ id: 'client', target: { type: 'client', id: 'acme', name: 'Acme' } }),
  ]
  const ids = (result: Budget[]) => result.map((item) => item.id)
  const today = () => '2026-11-10'

  it('shows active and upcoming budgets by default, ordered by member then start date', () => {
    expect(ids(filterBudgets(budgets, { query: '', phase: 'current' }, today))).toEqual([
      'client',
      'active-alice',
      'upcoming',
      'active-bob',
    ])
  })

  it('filters by phase', () => {
    expect(ids(filterBudgets(budgets, { query: '', phase: 'past' }, today))).toEqual(['past'])
    expect(ids(filterBudgets(budgets, { query: '', phase: 'archived' }, today))).toEqual(['archived'])
  })

  it('searches member and target names, ignoring case, with every word required', () => {
    expect(ids(filterBudgets(budgets, { query: ' bob ', phase: 'all' }, today))).toEqual(['active-bob'])
    expect(ids(filterBudgets(budgets, { query: 'ACME', phase: 'all' }, today))).toEqual(['client'])
    expect(ids(filterBudgets(budgets, { query: 'alice acme', phase: 'all' }, today))).toEqual(['client'])
    expect(ids(filterBudgets(budgets, { query: 'bob acme', phase: 'all' }, today))).toEqual([])
  })

  it('searches and orders by the current member name when given', () => {
    const memberName = (item: Budget) => (item.userId === 'bob' ? 'Aaron' : item.userDisplayName)
    expect(ids(filterBudgets(budgets, { query: 'aaron', phase: 'all' }, today, memberName))).toEqual(['active-bob'])
    expect(ids(filterBudgets(budgets, { query: '', phase: 'current' }, today, memberName))[0]).toBe('active-bob')
  })

  it('uses each budget’s own today', () => {
    const todayFor = (item: Budget) => (item.userId === 'bob' ? '2026-12-22' : '2026-11-10')
    expect(ids(filterBudgets(budgets, { query: '', phase: 'past' }, todayFor))).toEqual(['past', 'active-bob'])
  })
})

describe('groupBudgetsByMember', () => {
  it('groups consecutive budgets per member, keeping their order', () => {
    const groups = groupBudgetsByMember([
      budget({ id: 'a1' }),
      budget({ id: 'a2' }),
      budget({ id: 'b1', userId: 'bob', userDisplayName: 'Bob' }),
    ])
    expect(groups.map((group) => [group.userId, group.name, group.budgets.map((item) => item.id)])).toEqual([
      ['alice', 'Alice', ['a1', 'a2']],
      ['bob', 'Bob', ['b1']],
    ])
  })
})

describe('hours presets', () => {
  const minutes = (mon: number, tue: number, wed: number, thu: number, fri: number, sat: number, sun: number) => ({
    mon,
    tue,
    wed,
    thu,
    fri,
    sat,
    sun,
  })

  it('spreads a daily value over the preset days', () => {
    expect(presetWeekdayMinutes('weekdays', 240)).toEqual(minutes(240, 240, 240, 240, 240, 0, 0))
    expect(presetWeekdayMinutes('everyday', 60)).toEqual(minutes(60, 60, 60, 60, 60, 60, 60))
  })

  it('detects the preset that reproduces the targets', () => {
    expect(detectHoursPreset(minutes(450, 450, 450, 450, 450, 0, 0))).toEqual({ preset: 'weekdays', dailyMinutes: 450 })
    expect(detectHoursPreset(minutes(60, 60, 60, 60, 60, 60, 60))).toEqual({ preset: 'everyday', dailyMinutes: 60 })
    expect(detectHoursPreset(minutes(480, 480, 480, 480, 240, 0, 0)).preset).toBe('custom')
    expect(detectHoursPreset(minutes(480, 0, 0, 0, 0, 0, 0)).preset).toBe('custom')
    expect(detectHoursPreset(minutes(0, 0, 0, 0, 0, 0, 0)).preset).toBe('custom')
  })

  it('sums a week', () => {
    expect(weeklyMinutes(minutes(240, 240, 240, 240, 240, 0, 0))).toBe(1200)
  })
})

describe('totalBudgetMinutes', () => {
  const weekdays = { mon: 240, tue: 240, wed: 240, thu: 240, fri: 240, sat: 0, sun: 0 }

  it('totals full and partial weeks', () => {
    // 2026-11-02 is a Monday; two full weeks.
    expect(
      totalBudgetMinutes({ startDay: '2026-11-02', endDay: '2026-11-15', weekdayMinutes: weekdays, exceptions: [] }),
    ).toBe(10 * 240)
    // Thursday to the next Tuesday: Thu, Fri, Mon, Tue.
    expect(
      totalBudgetMinutes({ startDay: '2026-11-05', endDay: '2026-11-10', weekdayMinutes: weekdays, exceptions: [] }),
    ).toBe(4 * 240)
  })

  it('skips days off', () => {
    expect(
      totalBudgetMinutes({
        startDay: '2026-11-02',
        endDay: '2026-11-08',
        weekdayMinutes: weekdays,
        exceptions: ['2026-11-04', '2026-11-07'],
      }),
    ).toBe(4 * 240)
  })

  it('returns null for an incomplete, reversed or too long range', () => {
    const base = { weekdayMinutes: weekdays, exceptions: [] }
    expect(totalBudgetMinutes({ ...base, startDay: '', endDay: '2026-11-08' })).toBeNull()
    expect(totalBudgetMinutes({ ...base, startDay: '2026-11-08', endDay: '2026-11-02' })).toBeNull()
    expect(totalBudgetMinutes({ ...base, startDay: '2026-01-01', endDay: '2028-01-02' })).toBeNull()
  })
})

describe('buildBudgetTargetOptions', () => {
  const catalog: Catalog = {
    clients: [
      { id: 'acme', name: 'Acme', archived: false },
      { id: 'old', name: 'Old Co', archived: true },
    ],
    projects: [
      {
        id: 'site',
        name: 'Site',
        clientId: 'acme',
        description: '',
        color: '#111',
        estimateMinutes: null,
        archived: false,
      },
      {
        id: 'app',
        name: 'App',
        clientId: 'acme',
        description: '',
        color: '#222',
        estimateMinutes: null,
        archived: false,
      },
      {
        id: 'legacy',
        name: 'Legacy',
        clientId: 'old',
        description: '',
        color: '#333',
        estimateMinutes: null,
        archived: false,
      },
      {
        id: 'gone',
        name: 'Gone',
        clientId: 'acme',
        description: '',
        color: '#444',
        estimateMinutes: null,
        archived: true,
      },
      {
        id: 'internal',
        name: 'Internal',
        clientId: null,
        description: '',
        color: '#555',
        estimateMinutes: null,
        archived: false,
      },
    ],
    tasks: [],
  }

  it('lists active clients with their active projects, then projects without a client', () => {
    expect(buildBudgetTargetOptions(catalog).map((option) => [option.key, option.group])).toEqual([
      ['client:acme', 'Acme'],
      ['project:app', 'Acme'],
      ['project:site', 'Acme'],
      ['project:internal', 'No client'],
    ])
  })

  it('keeps an archived current target so an existing budget stays editable', () => {
    const options = buildBudgetTargetOptions(catalog, { type: 'project', id: 'legacy', name: 'Legacy' })
    expect(options.find((option) => option.key === 'project:legacy')).toMatchObject({ archived: true, group: 'Old Co' })
  })

  it('falls back to the budget snapshot when the target no longer exists', () => {
    const options = buildBudgetTargetOptions(catalog, { type: 'client', id: 'deleted', name: 'Deleted Co' })
    expect(options.at(-1)).toMatchObject({ key: 'client:deleted', name: 'Deleted Co', archived: true })
  })
})
