import { describe, expect, it } from 'vitest'
import type { Budget } from '../../src/lib/budgets'
import { calculateBudgetProgress, zonedDayStartMillis } from '../../src/lib/budgetProgress'
import { memberBudgetGroups } from '../../src/lib/memberBudgets'
import { type TeamBudgetFilters, teamBudgetGroups, teamBudgetStatus, teamEntryRanges } from '../../src/lib/teamBudgets'

const WARSAW = 'Europe/Warsaw'
const ALL: TeamBudgetFilters = { userId: '', targetKey: '', fromDay: '', toDay: '' }

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

function entry(userId: string, start: string, end: string) {
  return {
    userId,
    projectId: 'project-x',
    clientId: null,
    startAt: { toMillis: () => Date.parse(start) },
    endAt: { toMillis: () => Date.parse(end) },
  }
}

describe('teamBudgetGroups', () => {
  const budgets = [
    budget({ id: 'bob-x', userId: 'bob', userDisplayName: 'Bob' }),
    budget({ id: 'alice-client', target: { type: 'client', id: 'acme', name: 'Acme' } }),
    budget({ id: 'alice-x' }),
    budget({ id: 'alice-x-later', startDay: '2027-01-04', endDay: '2027-01-25' }),
    budget({ id: 'archived', userId: 'carol', userDisplayName: 'Carol', archived: true }),
  ]

  it('groups by member and target, orders by member then target, and leaves out archived budgets', () => {
    const groups = teamBudgetGroups(budgets, ALL)
    expect(groups.map((group) => group.map((item) => item.id))).toEqual([
      ['alice-client'],
      ['alice-x', 'alice-x-later'],
      ['bob-x'],
    ])
  })

  it('filters by member and target', () => {
    expect(teamBudgetGroups(budgets, { ...ALL, userId: 'bob' }).map((group) => group[0].id)).toEqual(['bob-x'])
    expect(teamBudgetGroups(budgets, { ...ALL, targetKey: 'client:acme' }).map((group) => group[0].id)).toEqual([
      'alice-client',
    ])
  })

  it('keeps whole groups when one of their budgets overlaps the window', () => {
    const groups = teamBudgetGroups(budgets, { ...ALL, fromDay: '2027-01-10', toDay: '2027-01-10' })
    expect(groups.map((group) => group.map((item) => item.id))).toEqual([['alice-x', 'alice-x-later']])
    expect(teamBudgetGroups(budgets, { ...ALL, toDay: '2026-11-01' })).toEqual([])
    expect(teamBudgetGroups(budgets, { ...ALL, fromDay: '2026-12-21' })).toHaveLength(3)
  })

  it('shows the same group a member sees for themselves', () => {
    const today = '2026-11-10'
    const mine = memberBudgetGroups(
      budgets.filter((item) => item.userId === 'alice'),
      today,
    ).active.find((group) => group[0].target.id === 'project-x')!
    const team = teamBudgetGroups(budgets, { ...ALL, userId: 'alice', targetKey: 'project:project-x' })[0]
    const entries = [entry('alice', '2026-11-02T08:00:00Z', '2026-11-02T14:00:00Z')]
    const now = new Date('2026-11-10T12:00:00Z')
    expect(calculateBudgetProgress(team, entries, WARSAW, now)).toEqual(
      calculateBudgetProgress(mine, entries, WARSAW, now),
    )
  })
})

describe('teamBudgetStatus', () => {
  it('maps the running balance to behind, on track, or over', () => {
    expect(teamBudgetStatus({ balanceMinutes: -30 })).toBe('behind')
    expect(teamBudgetStatus({ balanceMinutes: 0 })).toBe('on-track')
    expect(teamBudgetStatus({ balanceMinutes: 15 })).toBe('over')
  })
})

describe('teamEntryRanges', () => {
  it('bounds each member by the days of their shown budgets in their timezone', () => {
    const groups = teamBudgetGroups(
      [
        budget({ id: 'alice-x', endDay: '2026-11-30' }),
        budget({ id: 'alice-y', target: { type: 'project', id: 'p-y', name: 'Y' }, startDay: '2026-11-16' }),
        budget({ id: 'bob-x', userId: 'bob', userDisplayName: 'Bob', startDay: '2026-11-09', endDay: '2026-11-15' }),
      ],
      ALL,
    )
    const ranges = teamEntryRanges(groups, (userId) => (userId === 'bob' ? 'America/New_York' : WARSAW))
    expect(ranges.get('alice')).toEqual([
      zonedDayStartMillis('2026-11-02', WARSAW),
      zonedDayStartMillis('2026-12-22', WARSAW),
    ])
    expect(ranges.get('bob')).toEqual([
      zonedDayStartMillis('2026-11-09', 'America/New_York'),
      zonedDayStartMillis('2026-11-16', 'America/New_York'),
    ])
  })
})
