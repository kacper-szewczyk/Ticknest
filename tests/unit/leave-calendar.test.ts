import { describe, expect, it } from 'vitest'
import type { Budget } from '../../src/lib/budgets'
import { calculateBudgetProgress } from '../../src/lib/budgetProgress'
import type { LeaveRequest } from '../../src/lib/leave'
import { approvedLeaveDays, daysBetween, leaveDayFraction, monthDays, teamCalendar } from '../../src/lib/leaveCalendar'
import { budgetDayLabel } from '../../src/lib/memberBudgets'

function request(overrides: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: 'leave-1',
    uid: 'alice',
    userDisplayName: 'Alice',
    typeId: 'holiday',
    year: 2026,
    startDate: '2026-11-16',
    endDate: '2026-11-20',
    startHalf: false,
    endHalf: false,
    days: 5,
    note: '',
    status: 'approved',
    overAllowance: false,
    overAllowanceDays: 0,
    autoApproved: false,
    autoApprovedReason: null,
    decidedBy: 'owner',
    decidedAt: null,
    decisionNote: '',
    cancelledBy: null,
    cancelledAt: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as LeaveRequest
}

const MEMBERS = [
  { uid: 'alice', name: 'Alice', removed: false },
  { uid: 'bob', name: 'Bob', removed: false },
  { uid: 'carol', name: 'Carol', removed: true },
]

describe('calendar days', () => {
  it('lists every day of a month, leap years included', () => {
    expect(monthDays(2026, 11)).toHaveLength(30)
    expect(monthDays(2028, 2).at(-1)).toBe('2028-02-29')
    expect(monthDays(2026, 12)[0]).toBe('2026-12-01')
    expect(daysBetween('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
  })

  it('takes a full working day, half on half days, and nothing on weekends or outside the range', () => {
    const halfEnds = request({ startDate: '2026-11-13', endDate: '2026-11-16', startHalf: true, endHalf: true })
    expect(leaveDayFraction(halfEnds, '2026-11-13')).toBe(0.5)
    expect(leaveDayFraction(halfEnds, '2026-11-14')).toBe(0)
    expect(leaveDayFraction(halfEnds, '2026-11-16')).toBe(0.5)
    expect(leaveDayFraction(halfEnds, '2026-11-17')).toBe(0)
    expect(leaveDayFraction(request(), '2026-11-18')).toBe(1)
  })
})

describe('approvedLeaveDays', () => {
  it('counts only the member’s approved leave and never more than a whole day', () => {
    const days = approvedLeaveDays(
      [
        request({ id: 'a', startDate: '2026-11-16', endDate: '2026-11-16', endHalf: true }),
        request({ id: 'b', startDate: '2026-11-16', endDate: '2026-11-17', startHalf: true }),
        request({ id: 'c', startDate: '2026-11-18', endDate: '2026-11-18', status: 'pending' }),
        request({ id: 'd', startDate: '2026-11-19', endDate: '2026-11-19', status: 'cancelled' }),
        request({ id: 'e', uid: 'bob', startDate: '2026-11-20', endDate: '2026-11-20' }),
      ],
      'alice',
    )
    expect(Object.fromEntries(days)).toEqual({ '2026-11-16': 1, '2026-11-17': 1 })
  })
})

describe('teamCalendar', () => {
  const days = monthDays(2026, 11)

  it('gives every active member a row and lays approved and pending leave on their days', () => {
    const calendar = teamCalendar(
      [
        request({ id: 'pending', uid: 'bob', userDisplayName: 'Bob', status: 'pending', startDate: '2026-11-18' }),
        request(),
        request({ id: 'rejected', uid: 'bob', status: 'rejected', startDate: '2026-11-02', endDate: '2026-11-02' }),
      ],
      MEMBERS,
      days,
      { uid: '', typeId: '' },
    )
    expect(calendar.rows.map((row) => row.member.uid)).toEqual(['alice', 'bob'])
    const index = days.indexOf('2026-11-18')
    expect(calendar.rows[0].cells[index].map((leave) => leave.request.status)).toEqual(['approved'])
    expect(calendar.rows[1].cells[index].map((leave) => leave.request.status)).toEqual(['pending'])
    expect(calendar.rows[1].cells[days.indexOf('2026-11-02')]).toEqual([])
    expect(calendar.onLeave[index]).toBe(2)
    expect(calendar.onLeave[days.indexOf('2026-11-16')]).toBe(1)
    expect(calendar.onLeave[days.indexOf('2026-11-21')]).toBe(0)
    expect(calendar.requests.map((item) => item.id)).toEqual(['leave-1', 'pending'])
  })

  it('shows removed members only while they have leave, and narrows by member and type', () => {
    const leave = [request({ id: 'carol', uid: 'carol', userDisplayName: 'Carol' }), request({ typeId: 'sick' })]
    expect(teamCalendar(leave, MEMBERS, days, { uid: '', typeId: '' }).rows.map((row) => row.member.uid)).toEqual([
      'alice',
      'bob',
      'carol',
    ])
    expect(teamCalendar([], MEMBERS, days, { uid: '', typeId: '' }).rows).toHaveLength(2)
    const onlyAlice = teamCalendar(leave, MEMBERS, days, { uid: 'alice', typeId: '' })
    expect(onlyAlice.rows.map((row) => row.member.uid)).toEqual(['alice'])
    expect(teamCalendar(leave, MEMBERS, days, { uid: '', typeId: 'holiday' }).requests.map((item) => item.id)).toEqual([
      'carol',
    ])
  })

  it('leaves out requests outside the shown days', () => {
    const calendar = teamCalendar([request({ startDate: '2026-12-01', endDate: '2026-12-04' })], MEMBERS, days, {
      uid: '',
      typeId: '',
    })
    expect(calendar.requests).toEqual([])
    expect(calendar.onLeave.every((count) => count === 0)).toBe(true)
  })
})

describe('budget progress with approved leave', () => {
  const budget: Budget = {
    id: 'budget-1',
    userId: 'alice',
    userDisplayName: 'Alice',
    target: { type: 'project', id: 'project-site', name: 'Site' },
    startDay: '2026-11-16',
    endDay: '2026-11-20',
    weekdayMinutes: { mon: 480, tue: 480, wed: 480, thu: 480, fri: 480, sat: 0, sun: 0 },
    exceptions: [],
    archived: false,
    createdBy: 'owner',
    createdAt: null,
    updatedAt: null,
  }
  const leaveDays = approvedLeaveDays(
    [request({ startDate: '2026-11-17', endDate: '2026-11-18', endHalf: true })],
    'alice',
  )
  // Thursday 19 November: the 16th to the 18th have ended.
  const now = new Date('2026-11-19T12:00:00Z')

  it('lowers the target of leave days and reports how much was taken off', () => {
    const progress = calculateBudgetProgress([budget], [], 'Europe/Warsaw', now, leaveDays)
    const days = Object.fromEntries(progress.days.map((day) => [day.day, day]))
    expect(days['2026-11-17']).toMatchObject({ expectedMinutes: 0, leaveMinutes: 480, status: 'time-off' })
    expect(days['2026-11-18']).toMatchObject({ expectedMinutes: 240, leaveMinutes: 240, status: 'under' })
    expect(days['2026-11-16']).toMatchObject({ expectedMinutes: 480, leaveMinutes: 0, leaveFraction: 0 })
    expect(progress.totalExpectedMinutes).toBe(5 * 480 - 720)
    expect(progress.expectedToDateMinutes).toBe(480 + 240)
    expect(progress.totalLeaveMinutes).toBe(720)
    expect(progress.leaveToDateMinutes).toBe(720)
    expect(budgetDayLabel(days['2026-11-17'])).toBe('Time off')
  })

  it('counts time logged on a day off as extra', () => {
    const entries = [
      {
        userId: 'alice',
        projectId: 'project-site',
        startAt: { toMillis: () => Date.parse('2026-11-17T08:00:00Z') },
        endAt: { toMillis: () => Date.parse('2026-11-17T09:00:00Z') },
      },
    ]
    const progress = calculateBudgetProgress([budget], entries, 'Europe/Warsaw', now, leaveDays)
    expect(progress.days.find((day) => day.day === '2026-11-17')).toMatchObject({ status: 'over', actualMinutes: 60 })
  })

  it('is unchanged without leave', () => {
    const progress = calculateBudgetProgress([budget], [], 'Europe/Warsaw', now)
    expect(progress.totalLeaveMinutes).toBe(0)
    expect(progress.expectedToDateMinutes).toBe(3 * 480)
  })
})
