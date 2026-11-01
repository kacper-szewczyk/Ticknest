import { describe, expect, it } from 'vitest'
import type { Budget } from '../../src/lib/budgets'
import {
  budgetInstantRange,
  calculateBudgetProgress,
  expectedMinutesForDay,
  groupBudgets,
  progressTimeZone,
  zonedDayStartMillis,
  zonedDayString,
  type ProgressEntry,
} from '../../src/lib/budgetProgress'

const WARSAW = 'Europe/Warsaw'
const NEW_YORK = 'America/New_York'

function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'budget-1',
    userId: 'alice',
    userDisplayName: 'Alice',
    target: { type: 'project', id: 'project-site', name: 'Site' },
    startDay: '2026-11-02',
    endDay: '2026-11-08',
    weekdayMinutes: { mon: 480, tue: 240, wed: 0, thu: 0, fri: 60, sat: 0, sun: 0 },
    exceptions: [],
    archived: false,
    createdBy: 'owner',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

function instant(iso: string) {
  const millis = Date.parse(iso)
  return { toMillis: () => millis }
}

function entry(start: string, end: string | null, overrides: Partial<ProgressEntry> = {}): ProgressEntry {
  return {
    userId: 'alice',
    projectId: 'project-site',
    clientId: 'client-acme',
    startAt: instant(start),
    endAt: end === null ? null : instant(end),
    ...overrides,
  }
}

// Long after every test range, so all days are in the past.
const LATER = new Date('2027-06-01T12:00:00Z')

function byDay(progress: ReturnType<typeof calculateBudgetProgress>) {
  return Object.fromEntries(progress.days.map((day) => [day.day, day]))
}

describe('zoned days', () => {
  it('finds the calendar day of an instant in a timezone', () => {
    expect(zonedDayString(Date.parse('2026-11-02T23:30:00Z'), WARSAW)).toBe('2026-11-03')
    expect(zonedDayString(Date.parse('2026-11-02T23:30:00Z'), NEW_YORK)).toBe('2026-11-02')
  })

  it('finds local midnight, including on 23- and 25-hour days', () => {
    expect(zonedDayStartMillis('2026-11-02', WARSAW)).toBe(Date.parse('2026-11-01T23:00:00Z'))
    expect(zonedDayStartMillis('2026-03-29', WARSAW)).toBe(Date.parse('2026-03-28T23:00:00Z'))
    expect(zonedDayStartMillis('2026-03-30', WARSAW)).toBe(Date.parse('2026-03-29T22:00:00Z'))
    expect(zonedDayStartMillis('2026-10-25', WARSAW)).toBe(Date.parse('2026-10-24T22:00:00Z'))
    expect(zonedDayStartMillis('2026-10-26', WARSAW)).toBe(Date.parse('2026-10-25T23:00:00Z'))
    expect(zonedDayStartMillis('2026-11-01', NEW_YORK)).toBe(Date.parse('2026-11-01T04:00:00Z'))
  })

  it('starts a day at the first instant when a DST change skips midnight', () => {
    // Havana springs forward from 00:00 to 01:00.
    expect(zonedDayStartMillis('2026-03-08', 'America/Havana')).toBe(Date.parse('2026-03-08T05:00:00Z'))
  })

  it('bounds the days of several budgets', () => {
    const [start, end] = budgetInstantRange(
      [budget(), budget({ startDay: '2026-10-26', endDay: '2026-11-03' })],
      WARSAW,
    )
    expect(start.toISOString()).toBe('2026-10-25T23:00:00.000Z')
    expect(end.toISOString()).toBe('2026-11-08T23:00:00.000Z')
  })
})

describe('progressTimeZone', () => {
  it('uses the member’s snapshot and falls back to the viewer’s timezone', () => {
    // vitest.config.ts sets the process timezone to Europe/Warsaw.
    expect(progressTimeZone(NEW_YORK)).toBe(NEW_YORK)
    expect(progressTimeZone(undefined)).toBe(WARSAW)
    expect(progressTimeZone('')).toBe(WARSAW)
    expect(progressTimeZone('Mars/Olympus')).toBe(WARSAW)
    expect(progressTimeZone(42)).toBe(WARSAW)
  })
})

describe('expectedMinutesForDay', () => {
  it('uses the weekday target and zero outside the range or on exceptions', () => {
    const item = budget({ exceptions: ['2026-11-03'] })
    expect(expectedMinutesForDay(item, '2026-11-02')).toBe(480)
    expect(expectedMinutesForDay(item, '2026-11-03')).toBe(0)
    expect(expectedMinutesForDay(item, '2026-11-06')).toBe(60)
    expect(expectedMinutesForDay(item, '2026-11-09')).toBe(0)
    expect(expectedMinutesForDay(item, '2026-11-01')).toBe(0)
  })
})

describe('groupBudgets', () => {
  it('groups by user and target and drops archived budgets', () => {
    const groups = groupBudgets([
      budget({ id: 'a' }),
      budget({ id: 'b', startDay: '2026-11-05' }),
      budget({ id: 'c', target: { type: 'client', id: 'project-site', name: 'Same id, other type' } }),
      budget({ id: 'd', userId: 'bob' }),
      budget({ id: 'e', archived: true }),
    ])
    expect(groups.map((group) => group.map((item) => item.id))).toEqual([['a', 'b'], ['c'], ['d']])
  })
})

describe('calculateBudgetProgress', () => {
  it('uses a different target for each weekday and exceptions', () => {
    const progress = calculateBudgetProgress([budget({ exceptions: ['2026-11-06'] })], [], WARSAW, LATER)
    expect(progress.days.map((day) => [day.day, day.expectedMinutes, day.status])).toEqual([
      ['2026-11-02', 480, 'under'],
      ['2026-11-03', 240, 'under'],
      ['2026-11-04', 0, 'off'],
      ['2026-11-05', 0, 'off'],
      ['2026-11-06', 0, 'off'],
      ['2026-11-07', 0, 'off'],
      ['2026-11-08', 0, 'off'],
    ])
    expect(progress.totalExpectedMinutes).toBe(720)
    expect(progress.balanceMinutes).toBe(-720)
  })

  it('reports under, met and over for past days', () => {
    const progress = calculateBudgetProgress(
      [budget()],
      [
        entry('2026-11-02T08:00:00+01:00', '2026-11-02T16:00:00+01:00'),
        entry('2026-11-03T09:00:00+01:00', '2026-11-03T12:00:00+01:00'),
        entry('2026-11-04T09:00:00+01:00', '2026-11-04T09:30:00+01:00'),
        entry('2026-11-06T09:00:00+01:00', '2026-11-06T09:59:40+01:00'),
      ],
      WARSAW,
      LATER,
    )
    const days = byDay(progress)
    expect(days['2026-11-02']).toMatchObject({ actualMinutes: 480, status: 'met' })
    expect(days['2026-11-03']).toMatchObject({ actualMinutes: 180, status: 'under' })
    expect(days['2026-11-04']).toMatchObject({ expectedMinutes: 0, actualMinutes: 30, status: 'over' })
    // Rounded to the nearest minute.
    expect(days['2026-11-06']).toMatchObject({ actualMinutes: 60, status: 'met' })
    expect(progress.actualToDateMinutes).toBe(750)
    expect(progress.balanceMinutes).toBe(750 - 780)
  })

  it('adds up overlapping budgets for the same user and target', () => {
    const progress = calculateBudgetProgress(
      [budget(), budget({ id: 'budget-2', startDay: '2026-11-03', endDay: '2026-11-10' })],
      [],
      WARSAW,
      LATER,
    )
    const days = byDay(progress)
    expect(days['2026-11-02'].expectedMinutes).toBe(480)
    expect(days['2026-11-03'].expectedMinutes).toBe(480)
    expect(days['2026-11-09'].expectedMinutes).toBe(480)
    expect(progress.days.at(-1)?.day).toBe('2026-11-10')
    expect(progress.totalExpectedMinutes).toBe(480 + 480 + 120 + 480 + 240)
  })

  it('skips days between budgets that do not overlap', () => {
    const progress = calculateBudgetProgress(
      [budget({ endDay: '2026-11-02' }), budget({ id: 'budget-2', startDay: '2026-11-09', endDay: '2026-11-09' })],
      [entry('2026-11-04T09:00:00+01:00', '2026-11-04T10:00:00+01:00')],
      WARSAW,
      LATER,
    )
    expect(progress.days.map((day) => day.day)).toEqual(['2026-11-02', '2026-11-09'])
    expect(progress.actualToDateMinutes).toBe(0)
  })

  it('counts the same time toward a client budget and a project budget', () => {
    const entries = [
      entry('2026-11-02T09:00:00+01:00', '2026-11-02T11:00:00+01:00'),
      entry('2026-11-02T12:00:00+01:00', '2026-11-02T13:00:00+01:00', { projectId: 'project-app' }),
      entry('2026-11-02T14:00:00+01:00', '2026-11-02T15:00:00+01:00', { projectId: 'project-other', clientId: null }),
      entry('2026-11-02T15:00:00+01:00', '2026-11-02T16:00:00+01:00', { userId: 'bob' }),
    ]
    const project = calculateBudgetProgress([budget()], entries, WARSAW, LATER)
    const client = calculateBudgetProgress(
      [budget({ target: { type: 'client', id: 'client-acme', name: 'Acme' } })],
      entries,
      WARSAW,
      LATER,
    )
    expect(byDay(project)['2026-11-02'].actualMinutes).toBe(120)
    expect(byDay(client)['2026-11-02'].actualMinutes).toBe(180)
  })

  it('splits an entry that crosses midnight between its days', () => {
    const progress = calculateBudgetProgress(
      [budget()],
      [entry('2026-11-02T22:00:00+01:00', '2026-11-03T02:00:00+01:00')],
      WARSAW,
      LATER,
    )
    const days = byDay(progress)
    expect(days['2026-11-02'].actualMinutes).toBe(120)
    expect(days['2026-11-03'].actualMinutes).toBe(120)
  })

  it('takes days in the tracked user’s timezone', () => {
    const work = [entry('2026-11-02T23:00:00Z', '2026-11-03T03:00:00Z')]
    expect(byDay(calculateBudgetProgress([budget()], work, NEW_YORK, LATER))['2026-11-02'].actualMinutes).toBe(240)
    expect(byDay(calculateBudgetProgress([budget()], work, WARSAW, LATER))['2026-11-03'].actualMinutes).toBe(240)
  })

  it('clips entries to the budget range', () => {
    const progress = calculateBudgetProgress(
      [budget()],
      [
        entry('2026-11-01T22:00:00+01:00', '2026-11-02T03:00:00+01:00'),
        entry('2026-11-08T23:00:00+01:00', '2026-11-09T05:00:00+01:00'),
      ],
      WARSAW,
      LATER,
    )
    expect(byDay(progress)['2026-11-02'].actualMinutes).toBe(180)
    expect(byDay(progress)['2026-11-08'].actualMinutes).toBe(60)
    expect(progress.actualToDateMinutes).toBe(240)
  })

  it('handles the 23-hour and 25-hour DST days', () => {
    const spring = calculateBudgetProgress(
      [budget({ startDay: '2026-03-28', endDay: '2026-03-30', weekdayMinutes: allDays(1380) })],
      // Saturday 22:00 to Monday 00:00 local is 2 h + 23 h.
      [entry('2026-03-28T22:00:00+01:00', '2026-03-30T00:00:00+02:00')],
      WARSAW,
      LATER,
    )
    expect(spring.days.map((day) => day.actualMinutes)).toEqual([120, 1380, 0])
    expect(byDay(spring)['2026-03-29'].status).toBe('met')

    const autumn = calculateBudgetProgress(
      [budget({ startDay: '2026-10-25', endDay: '2026-10-25', weekdayMinutes: allDays(1440) })],
      [entry('2026-10-25T00:00:00+02:00', '2026-10-26T00:00:00+01:00')],
      WARSAW,
      LATER,
    )
    expect(autumn.days[0]).toMatchObject({ actualMinutes: 1500, status: 'over' })
  })

  it('ignores a running timer', () => {
    const progress = calculateBudgetProgress(
      [budget()],
      [entry('2026-11-02T08:00:00+01:00', null)],
      WARSAW,
      new Date('2026-11-02T18:00:00+01:00'),
    )
    expect(progress.actualToDateMinutes).toBe(0)
  })

  it('counts nothing as due for a range entirely in the future', () => {
    const progress = calculateBudgetProgress([budget()], [], WARSAW, new Date('2026-10-01T12:00:00Z'))
    expect(progress.days.every((day) => day.status === 'upcoming')).toBe(true)
    expect(progress.totalExpectedMinutes).toBe(780)
    expect(progress.expectedToDateMinutes).toBe(0)
    expect(progress.balanceMinutes).toBe(0)
  })

  it('counts the whole range once it is entirely in the past', () => {
    const progress = calculateBudgetProgress(
      [budget()],
      [entry('2026-11-02T08:00:00+01:00', '2026-11-02T12:00:00+01:00')],
      WARSAW,
      LATER,
    )
    expect(progress.days.some((day) => day.status === 'upcoming' || day.status === 'in-progress')).toBe(false)
    expect(progress.expectedToDateMinutes).toBe(780)
    expect(progress.balanceMinutes).toBe(240 - 780)
  })

  it('counts today’s logged time but not its target while the day is in progress', () => {
    const progress = calculateBudgetProgress(
      [budget()],
      [
        entry('2026-11-02T08:00:00+01:00', '2026-11-02T16:00:00+01:00'),
        entry('2026-11-03T08:00:00+01:00', '2026-11-03T09:00:00+01:00'),
        entry('2026-11-03T10:00:00+01:00', null),
      ],
      WARSAW,
      new Date('2026-11-03T11:00:00+01:00'),
    )
    const days = byDay(progress)
    expect(days['2026-11-02'].status).toBe('met')
    expect(days['2026-11-03']).toMatchObject({ actualMinutes: 60, status: 'in-progress' })
    expect(days['2026-11-04'].status).toBe('upcoming')
    expect(progress.expectedToDateMinutes).toBe(480)
    expect(progress.actualToDateMinutes).toBe(540)
    expect(progress.balanceMinutes).toBe(60)
  })

  it('uses the tracked user’s timezone to decide which day is today', () => {
    const now = new Date('2026-11-03T03:00:00Z')
    expect(byDay(calculateBudgetProgress([budget()], [], WARSAW, now))['2026-11-03'].status).toBe('in-progress')
    expect(byDay(calculateBudgetProgress([budget()], [], NEW_YORK, now))['2026-11-03'].status).toBe('upcoming')
  })

  it('rejects budgets for different targets or archived budgets', () => {
    expect(() => calculateBudgetProgress([], [], WARSAW, LATER)).toThrow()
    expect(() => calculateBudgetProgress([budget(), budget({ userId: 'bob' })], [], WARSAW, LATER)).toThrow()
    expect(() => calculateBudgetProgress([budget({ archived: true })], [], WARSAW, LATER)).toThrow()
  })
})

function allDays(minutes: number): Budget['weekdayMinutes'] {
  return { mon: minutes, tue: minutes, wed: minutes, thu: minutes, fri: minutes, sat: minutes, sun: minutes }
}
