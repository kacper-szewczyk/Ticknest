import { describe, expect, it } from 'vitest'
import type { Budget } from '../../src/lib/budgets'
import {
  budgetPhase,
  buildBudgetTargetOptions,
  filterBudgets,
  formatHoursInput,
  parseHoursInput,
  weekdaySummary,
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

describe('parseHoursInput', () => {
  it('reads decimal hours with a dot or a comma', () => {
    expect(parseHoursInput('8')).toBe(480)
    expect(parseHoursInput('7.5')).toBe(450)
    expect(parseHoursInput('7,25')).toBe(435)
    expect(parseHoursInput('.5')).toBe(30)
    expect(parseHoursInput('8.')).toBe(480)
  })

  it('reads H:MM', () => {
    expect(parseHoursInput('7:30')).toBe(450)
    expect(parseHoursInput('0:05')).toBe(5)
    expect(parseHoursInput('24:00')).toBe(1440)
  })

  it('rounds decimal hours to the nearest minute', () => {
    expect(parseHoursInput('1.333')).toBe(80)
  })

  it('treats a blank field as no target', () => {
    expect(parseHoursInput('')).toBe(0)
    expect(parseHoursInput('  ')).toBe(0)
  })

  it('rejects other text', () => {
    for (const text of ['abc', '7:5', '7:60', '-1', '7h', '1.2.3', '100']) expect(parseHoursInput(text)).toBeNull()
  })
})

describe('formatHoursInput', () => {
  it('formats minutes as H:MM and leaves zero blank', () => {
    expect(formatHoursInput(450)).toBe('7:30')
    expect(formatHoursInput(5)).toBe('0:05')
    expect(formatHoursInput(0)).toBe('')
  })

  it('round-trips with parseHoursInput', () => {
    for (const minutes of [1, 59, 60, 450, 1440]) expect(parseHoursInput(formatHoursInput(minutes))).toBe(minutes)
  })
})

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
    expect(ids(filterBudgets(budgets, { userId: '', targetKey: '', phase: 'current' }, today))).toEqual([
      'client',
      'active-alice',
      'upcoming',
      'active-bob',
    ])
  })

  it('filters by phase, member and target', () => {
    expect(ids(filterBudgets(budgets, { userId: '', targetKey: '', phase: 'past' }, today))).toEqual(['past'])
    expect(ids(filterBudgets(budgets, { userId: '', targetKey: '', phase: 'archived' }, today))).toEqual(['archived'])
    expect(ids(filterBudgets(budgets, { userId: 'bob', targetKey: '', phase: 'all' }, today))).toEqual(['active-bob'])
    expect(ids(filterBudgets(budgets, { userId: '', targetKey: 'client:acme', phase: 'all' }, today))).toEqual([
      'client',
    ])
  })

  it('uses each budget’s own today', () => {
    const todayFor = (item: Budget) => (item.userId === 'bob' ? '2026-12-22' : '2026-11-10')
    expect(ids(filterBudgets(budgets, { userId: '', targetKey: '', phase: 'past' }, todayFor))).toEqual([
      'past',
      'active-bob',
    ])
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
