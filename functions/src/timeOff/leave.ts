// Pure time-off rules. The leave callables enforce them, and the web app imports this same module so it can explain
// a request (days used, balance after, over allowance) before it is sent. Keep it free of Admin SDK imports.

export type LeaveUnit = 'day' | 'half-day'
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export type LeaveTypeSettings = {
  name: string
  color: string
  unit: LeaveUnit
  requiresApproval: boolean
  /** Days per calendar year; `null` is unlimited. */
  defaultAllowanceDays: number | null
  archived: boolean
}

/**
 * Built-in types exist in every workspace without a stored document; a stored document with the same ID overrides
 * them. The names are English fallbacks: the web app shows translated names until the owner saves the type.
 */
export const BUILT_IN_LEAVE_TYPES: Record<'holiday' | 'sick', LeaveTypeSettings> = {
  holiday: {
    name: 'Holiday',
    color: '#2e7d6b',
    unit: 'half-day',
    requiresApproval: true,
    defaultAllowanceDays: 20,
    archived: false,
  },
  sick: {
    name: 'Sick leave',
    color: '#c2185b',
    unit: 'half-day',
    requiresApproval: true,
    defaultAllowanceDays: null,
    archived: false,
  },
}

export function isBuiltInLeaveType(typeId: string): typeId is keyof typeof BUILT_IN_LEAVE_TYPES {
  return typeId === 'holiday' || typeId === 'sick'
}

export const MAX_LEAVE_DAYS = 366
export const MAX_ADJUSTMENTS = 50

const DAY_MS = 24 * 60 * 60 * 1000

/** UTC midnight of a valid `YYYY-MM-DD` date, or `null` (e.g. for 2026-02-30). */
export function calendarDayMillis(value: unknown): number | null {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null
  if (!match) return null
  const [year, month, date] = match.slice(1).map(Number)
  const millis = Date.UTC(year, month - 1, date)
  const parsed = new Date(millis)
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== date) {
    return null
  }
  return millis
}

function isWeekend(millis: number): boolean {
  const weekday = new Date(millis).getUTCDay()
  return weekday === 0 || weekday === 6
}

export type LeaveRange = { startDate: string; endDate: string; startHalf: boolean; endHalf: boolean }

/**
 * Working days (Monday to Friday) a request uses. A half start or end day counts 0.5; a one-day request with
 * either half flag counts 0.5. Returns `null` for invalid dates or an end before the start.
 */
export function countLeaveDays(range: LeaveRange): number | null {
  const start = calendarDayMillis(range.startDate)
  const end = calendarDayMillis(range.endDate)
  if (start === null || end === null || end < start) return null
  let halves = 0
  for (let day = start; day <= end; day += DAY_MS) {
    if (isWeekend(day)) continue
    const isHalf = (day === start && range.startHalf) || (day === end && range.endHalf)
    halves += isHalf ? 1 : 2
  }
  return halves / 2
}

/** True when two inclusive date ranges share at least one calendar day. */
export function rangesOverlap(a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }) {
  return a.startDate <= b.endDate && b.startDate <= a.endDate
}

export type BalanceRequest = { status: LeaveStatus; days: number }

export type LeaveBalance = {
  /** `null` is unlimited. */
  allowanceDays: number | null
  adjustmentDays: number
  approvedDays: number
  pendingDays: number
  /** Allowance plus adjustments minus approved days; `null` is unlimited. */
  availableDays: number | null
  /** What stays available if every pending request is approved; `null` is unlimited. */
  availableAfterPendingDays: number | null
}

export function leaveBalance(
  allowanceDays: number | null,
  adjustments: readonly { days: number }[],
  requests: readonly BalanceRequest[],
): LeaveBalance {
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
  const adjustmentDays = sum(adjustments.map((adjustment) => adjustment.days))
  const approvedDays = sum(requests.filter((request) => request.status === 'approved').map((request) => request.days))
  const pendingDays = sum(requests.filter((request) => request.status === 'pending').map((request) => request.days))
  const availableDays = allowanceDays === null ? null : allowanceDays + adjustmentDays - approvedDays
  return {
    allowanceDays,
    adjustmentDays,
    approvedDays,
    pendingDays,
    availableDays,
    availableAfterPendingDays: availableDays === null ? null : availableDays - pendingDays,
  }
}

/** How many days a request of `days` goes over what is left after approved and other pending requests; 0 if none. */
export function overAllowanceDays(balance: LeaveBalance, days: number): number {
  if (balance.availableAfterPendingDays === null) return 0
  return Math.max(0, days - balance.availableAfterPendingDays)
}

/** A leave amount in days: a multiple of 0.5 within ±limit. */
export function isHalfDayAmount(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (value * 2) % 1 === 0
}

export type ApproverCandidate = { uid: string; role: string; status?: string }

/** Owners and managers decide leave, but never their own request. */
export function canDecideLeave(approver: ApproverCandidate | undefined, requesterUid: string): boolean {
  return (
    approver !== undefined &&
    approver.status !== 'removed' &&
    (approver.role === 'owner' || approver.role === 'manager') &&
    approver.uid !== requesterUid
  )
}

/** Whether anyone in the workspace may decide this requester's leave; if nobody can, requests are auto-approved. */
export function hasEligibleApprover(members: readonly ApproverCandidate[], requesterUid: string): boolean {
  return members.some((member) => canDecideLeave(member, requesterUid))
}

/**
 * Who may cancel a request: the requester while it is pending, or while it is approved and has not started yet
 * (`today` in the requester's time zone); an eligible approver once approved leave has started or at any time.
 */
export function canCancelLeave(
  request: { uid: string; status: LeaveStatus; startDate: string },
  caller: ApproverCandidate,
  today: string,
): boolean {
  if (request.status === 'pending') return caller.uid === request.uid
  if (request.status !== 'approved') return false
  if (canDecideLeave(caller, request.uid)) return true
  return caller.uid === request.uid && request.startDate > today
}

export function allowanceDocumentId(uid: string, typeId: string, year: number): string {
  return `${uid}_${typeId}_${year}`
}
