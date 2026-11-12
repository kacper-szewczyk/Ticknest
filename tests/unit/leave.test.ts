import { describe, expect, it } from 'vitest'
import {
  type LeaveAllowance,
  type LeaveRequest,
  type LeaveType,
  canCancelLeave,
  canDecideLeave,
  countLeaveDays,
  effectiveAllowanceDays,
  hasEligibleApprover,
  isHalfDayAmount,
  memberLeaveBalance,
  mergeLeaveTypes,
  previewLeaveRequest,
  sortLeaveRequests,
} from '../../src/lib/leave'

// 2026-11-16 is a Monday.
const full = (startDate: string, endDate: string) => ({ startDate, endDate, startHalf: false, endHalf: false })

const HOLIDAY: LeaveType = {
  id: 'holiday',
  name: 'Holiday',
  color: '#2e7d6b',
  unit: 'half-day',
  requiresApproval: true,
  defaultAllowanceDays: 20,
  archived: false,
  isStored: false,
}

function request(overrides: Partial<LeaveRequest>): LeaveRequest {
  return {
    id: 'r',
    uid: 'alice',
    userDisplayName: 'Alice',
    typeId: 'holiday',
    year: 2026,
    startDate: '2026-11-16',
    endDate: '2026-11-16',
    startHalf: false,
    endHalf: false,
    days: 1,
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
    ...overrides,
  }
}

function allowance(overrides: Partial<LeaveAllowance>): LeaveAllowance {
  return {
    id: 'alice_holiday_2026',
    uid: 'alice',
    typeId: 'holiday',
    year: 2026,
    allowanceDays: null,
    adjustments: [],
    updatedBy: 'owner',
    ...overrides,
  }
}

describe('countLeaveDays', () => {
  it('counts Monday to Friday and skips weekends', () => {
    expect(countLeaveDays(full('2026-11-16', '2026-11-20'))).toBe(5)
    expect(countLeaveDays(full('2026-11-16', '2026-11-23'))).toBe(6)
    expect(countLeaveDays(full('2026-11-21', '2026-11-22'))).toBe(0)
  })

  it('counts half start and end days as 0.5', () => {
    expect(countLeaveDays({ ...full('2026-11-16', '2026-11-20'), startHalf: true })).toBe(4.5)
    expect(countLeaveDays({ ...full('2026-11-16', '2026-11-20'), startHalf: true, endHalf: true })).toBe(4)
  })

  it('counts a one-day request with a half flag as half a day, however many flags are set', () => {
    expect(countLeaveDays({ ...full('2026-11-17', '2026-11-17'), startHalf: true })).toBe(0.5)
    expect(countLeaveDays({ ...full('2026-11-17', '2026-11-17'), startHalf: true, endHalf: true })).toBe(0.5)
  })

  it('ignores half flags that fall on a weekend', () => {
    expect(countLeaveDays({ ...full('2026-11-21', '2026-11-23'), startHalf: true })).toBe(1)
  })

  it('rejects impossible dates and an end before the start', () => {
    expect(countLeaveDays(full('2026-02-30', '2026-03-02'))).toBeNull()
    expect(countLeaveDays(full('2026-11-20', '2026-11-16'))).toBeNull()
  })

  it('counts across a month and a DST change by calendar day', () => {
    expect(countLeaveDays(full('2026-10-23', '2026-11-02'))).toBe(7)
  })
})

describe('balances', () => {
  it('uses the override, then the type default, and treats null as unlimited', () => {
    expect(effectiveAllowanceDays(HOLIDAY, undefined)).toBe(20)
    expect(effectiveAllowanceDays(HOLIDAY, allowance({ allowanceDays: 26 }))).toBe(26)
    expect(effectiveAllowanceDays(HOLIDAY, allowance({ allowanceDays: null }))).toBe(20)
    expect(effectiveAllowanceDays({ ...HOLIDAY, defaultAllowanceDays: null }, undefined)).toBeNull()
  })

  it('is allowance + adjustments − approved − pending, counting only this member, type, and year', () => {
    const balance = memberLeaveBalance(
      HOLIDAY,
      allowance({ allowanceDays: 20, adjustments: [{ days: 2, note: 'carry-over', by: 'owner', at: null }] }),
      [
        request({ days: 5 }),
        request({ days: 1.5, status: 'pending' }),
        request({ days: 3, status: 'rejected' }),
        request({ days: 2, status: 'cancelled' }),
        request({ days: 4, uid: 'dave' }),
        request({ days: 4, typeId: 'sick' }),
        request({ days: 4, year: 2025 }),
      ],
      'alice',
      2026,
    )
    expect(balance).toEqual({
      allowanceDays: 20,
      adjustmentDays: 2,
      approvedDays: 5,
      pendingDays: 1.5,
      availableDays: 17,
      availableAfterPendingDays: 15.5,
    })
  })

  it('stays unlimited without an allowance, but still totals what was taken', () => {
    const balance = memberLeaveBalance(
      { ...HOLIDAY, defaultAllowanceDays: null },
      undefined,
      [request({})],
      'alice',
      2026,
    )
    expect(balance.availableDays).toBeNull()
    expect(balance.approvedDays).toBe(1)
  })
})

describe('previewLeaveRequest', () => {
  const draft = { typeId: 'holiday', startDate: '2026-11-16', endDate: '2026-11-20', startHalf: false, endHalf: false }

  it('shows the days used and the balance after', () => {
    expect(previewLeaveRequest(draft, HOLIDAY, undefined, [], 'alice')).toEqual({
      ok: true,
      days: 5,
      year: 2026,
      overDays: 0,
      balanceAfter: 15,
    })
  })

  it('warns, without blocking, when the request goes over the allowance', () => {
    const preview = previewLeaveRequest(draft, HOLIDAY, allowance({ allowanceDays: 3 }), [], 'alice')
    expect(preview).toMatchObject({ ok: true, days: 5, overDays: 2, balanceAfter: -2 })
  })

  it('counts pending requests against what is left', () => {
    const pending = request({ startDate: '2026-12-01', endDate: '2026-12-02', days: 2, status: 'pending' })
    const preview = previewLeaveRequest(draft, HOLIDAY, allowance({ allowanceDays: 6 }), [pending], 'alice')
    expect(preview).toMatchObject({ overDays: 1, balanceAfter: -1 })
  })

  it('never goes over an unlimited allowance', () => {
    const preview = previewLeaveRequest(draft, { ...HOLIDAY, defaultAllowanceDays: null }, undefined, [], 'alice')
    expect(preview).toMatchObject({ ok: true, overDays: 0, balanceAfter: null })
  })

  it('ignores half days for full-day types', () => {
    const preview = previewLeaveRequest(
      { ...draft, startHalf: true },
      { ...HOLIDAY, unit: 'day' },
      undefined,
      [],
      'alice',
    )
    expect(preview).toMatchObject({ days: 5 })
  })

  it.each<[Partial<typeof draft>, string]>([
    [{ startDate: '' }, 'dates'],
    [{ endDate: '2026-11-13' }, 'end-before-start'],
    [{ startDate: '2026-12-28', endDate: '2027-01-04' }, 'crosses-year'],
    [{ startDate: '2026-11-21', endDate: '2026-11-22' }, 'no-working-days'],
  ])('rejects %j as %s', (change, problem) => {
    expect(previewLeaveRequest({ ...draft, ...change }, HOLIDAY, undefined, [], 'alice')).toEqual({
      ok: false,
      problem,
    })
  })

  it('rejects an overlap with a pending or approved request, of any type, but not a rejected or cancelled one', () => {
    const overlapping = { startDate: '2026-11-20', endDate: '2026-11-23' }
    for (const status of ['pending', 'approved'] as const) {
      const other = request({ ...overlapping, status, typeId: 'sick' })
      expect(previewLeaveRequest(draft, HOLIDAY, undefined, [other], 'alice')).toEqual({
        ok: false,
        problem: 'overlap',
      })
    }
    for (const status of ['rejected', 'cancelled'] as const) {
      const other = request({ ...overlapping, status })
      expect(previewLeaveRequest(draft, HOLIDAY, undefined, [other], 'alice')).toMatchObject({ ok: true })
    }
  })
})

describe('approvers', () => {
  const owner = { uid: 'owner', role: 'owner' }
  const manager = { uid: 'mira', role: 'manager' }
  const member = { uid: 'alice', role: 'member' }

  it('lets owners and managers decide anyone else’s request, never their own', () => {
    expect(canDecideLeave(owner, 'alice')).toBe(true)
    expect(canDecideLeave(manager, 'alice')).toBe(true)
    expect(canDecideLeave(manager, 'owner')).toBe(true)
    expect(canDecideLeave(owner, 'mira')).toBe(true)
    expect(canDecideLeave(manager, 'mira')).toBe(false)
    expect(canDecideLeave(owner, 'owner')).toBe(false)
    expect(canDecideLeave(member, 'dave')).toBe(false)
    expect(canDecideLeave({ ...manager, status: 'removed' }, 'alice')).toBe(false)
  })

  it('finds no approver for an owner without managers', () => {
    expect(hasEligibleApprover([owner, member], 'owner')).toBe(false)
    expect(hasEligibleApprover([owner, manager], 'owner')).toBe(true)
    expect(hasEligibleApprover([owner, manager], 'mira')).toBe(true)
    expect(hasEligibleApprover([owner, { ...manager, status: 'removed' }], 'owner')).toBe(false)
  })
})

describe('canCancelLeave', () => {
  const today = '2026-11-12'
  const alice = { uid: 'alice', role: 'member' }
  const manager = { uid: 'mira', role: 'manager' }

  it('lets the requester cancel pending requests and approved leave that has not started', () => {
    expect(canCancelLeave({ uid: 'alice', status: 'pending', startDate: '2026-11-01' }, alice, today)).toBe(true)
    expect(canCancelLeave({ uid: 'alice', status: 'approved', startDate: '2026-11-13' }, alice, today)).toBe(true)
    expect(canCancelLeave({ uid: 'alice', status: 'approved', startDate: '2026-11-12' }, alice, today)).toBe(false)
  })

  it('lets an approver cancel approved leave at any time, but not pending requests', () => {
    expect(canCancelLeave({ uid: 'alice', status: 'approved', startDate: '2026-11-01' }, manager, today)).toBe(true)
    expect(canCancelLeave({ uid: 'alice', status: 'pending', startDate: '2026-11-20' }, manager, today)).toBe(false)
  })

  it('refuses rejected and cancelled requests, and other members', () => {
    expect(canCancelLeave({ uid: 'alice', status: 'rejected', startDate: '2026-12-01' }, alice, today)).toBe(false)
    expect(canCancelLeave({ uid: 'alice', status: 'cancelled', startDate: '2026-12-01' }, alice, today)).toBe(false)
    expect(
      canCancelLeave(
        { uid: 'alice', status: 'approved', startDate: '2026-12-01' },
        { uid: 'dave', role: 'member' },
        today,
      ),
    ).toBe(false)
  })
})

describe('helpers', () => {
  it('accepts whole and half days within the limits', () => {
    expect(isHalfDayAmount(2.5, 0, 366)).toBe(true)
    expect(isHalfDayAmount(-1, -366, 366)).toBe(true)
    expect(isHalfDayAmount(0.25, 0, 366)).toBe(false)
    expect(isHalfDayAmount(367, 0, 366)).toBe(false)
    expect(isHalfDayAmount('2', 0, 366)).toBe(false)
    expect(isHalfDayAmount(Number.NaN, 0, 366)).toBe(false)
  })

  it('lists built-ins first, using stored overrides, then custom types by name', () => {
    const stored: LeaveType[] = [
      { ...HOLIDAY, id: 'u2', name: 'Unpaid', isStored: true },
      { ...HOLIDAY, id: 'sick', name: 'Sick', requiresApproval: false, isStored: true },
      { ...HOLIDAY, id: 'u1', name: 'Parental', isStored: true },
    ]
    const merged = mergeLeaveTypes(stored)
    expect(merged.map((type) => type.id)).toEqual(['holiday', 'sick', 'u1', 'u2'])
    expect(merged[0]).toMatchObject({ isStored: false, defaultAllowanceDays: 20 })
    expect(merged[1]).toMatchObject({ isStored: true, requiresApproval: false })
  })

  it('puts pending requests first, then the latest start dates', () => {
    const sorted = sortLeaveRequests([
      request({ id: 'old', startDate: '2026-01-05' }),
      request({ id: 'pending', startDate: '2026-02-02', status: 'pending' }),
      request({ id: 'new', startDate: '2026-12-01', status: 'rejected' }),
    ])
    expect(sorted.map((item) => item.id)).toEqual(['pending', 'new', 'old'])
  })
})
