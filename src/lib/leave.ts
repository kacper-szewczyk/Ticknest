// Time-off rules for the web app. Day counting, balances, and permissions come from the module the leave callables
// use, so the form shows the same numbers the server stores.
import {
  type LeaveBalance,
  type LeaveStatus,
  type LeaveTypeSettings,
  BUILT_IN_LEAVE_TYPES,
  countLeaveDays,
  isBuiltInLeaveType,
  leaveBalance,
  overAllowanceDays,
  rangesOverlap,
} from '../../functions/src/timeOff/leave'

export {
  type LeaveBalance,
  type LeaveStatus,
  type LeaveTypeSettings,
  type LeaveUnit,
  allowanceDocumentId,
  canCancelLeave,
  canDecideLeave,
  countLeaveDays,
  hasEligibleApprover,
  isBuiltInLeaveType,
  isHalfDayAmount,
  MAX_LEAVE_DAYS,
} from '../../functions/src/timeOff/leave'

export type LeaveType = LeaveTypeSettings & {
  id: string
  /** False for a built-in type the owner has not saved yet; its name is then shown translated. */
  isStored: boolean
}

export type LeaveRequest = {
  id: string
  uid: string
  /** Display snapshot of the requester. */
  userDisplayName: string
  typeId: string
  year: number
  /** Inclusive calendar dates (`YYYY-MM-DD`). */
  startDate: string
  endDate: string
  startHalf: boolean
  endHalf: boolean
  days: number
  note: string
  status: LeaveStatus
  overAllowance: boolean
  overAllowanceDays: number
  autoApproved: boolean
  /** Why it was approved on submit: the type needs no approval, or nobody else could approve it. */
  autoApprovedReason: 'type' | 'no-approver' | null
  decidedBy: string | null
  decidedAt: { toDate(): Date } | null
  decisionNote: string
  cancelledBy: string | null
  cancelledAt: { toDate(): Date } | null
  createdAt: { toDate(): Date } | null
}

export type LeaveAdjustment = { days: number; note: string; by: string; at: { toDate(): Date } | null }

export type LeaveAllowance = {
  id: string
  uid: string
  typeId: string
  year: number
  /** `null` uses the type's default. */
  allowanceDays: number | null
  adjustments: LeaveAdjustment[]
  updatedBy: string
}

const BUILT_IN_ORDER = ['holiday', 'sick']

/** The built-in types (stored or default) followed by custom types by name. */
export function mergeLeaveTypes(stored: readonly LeaveType[]): LeaveType[] {
  const byId = new Map(stored.map((type) => [type.id, type]))
  const builtIns = BUILT_IN_ORDER.map(
    (id) => byId.get(id) ?? { ...BUILT_IN_LEAVE_TYPES[id as keyof typeof BUILT_IN_LEAVE_TYPES], id, isStored: false },
  )
  const custom = stored.filter((type) => !isBuiltInLeaveType(type.id)).sort((a, b) => a.name.localeCompare(b.name))
  return [...builtIns, ...custom]
}

/** The allowance in force: the member's override for the year, or the type's default; `null` is unlimited. */
export function effectiveAllowanceDays(type: LeaveTypeSettings, allowance: LeaveAllowance | undefined): number | null {
  return allowance && allowance.allowanceDays !== null ? allowance.allowanceDays : type.defaultAllowanceDays
}

/** One member's balance for a type and year, from their allowance document and requests. */
export function memberLeaveBalance(
  type: LeaveType,
  allowance: LeaveAllowance | undefined,
  requests: readonly LeaveRequest[],
  uid: string,
  year: number,
): LeaveBalance {
  const counted = requests.filter(
    (request) => request.uid === uid && request.typeId === type.id && request.year === year,
  )
  return leaveBalance(effectiveAllowanceDays(type, allowance), allowance?.adjustments ?? [], counted)
}

export type LeaveRequestDraft = {
  typeId: string
  startDate: string
  endDate: string
  startHalf: boolean
  endHalf: boolean
}

export type LeaveDraftProblem = 'dates' | 'end-before-start' | 'crosses-year' | 'no-working-days' | 'overlap'

export type LeaveDraftPreview =
  | { ok: false; problem: LeaveDraftProblem }
  | { ok: true; days: number; year: number; overDays: number; balanceAfter: number | null }

/**
 * Checks a request the way `submitLeaveRequest` will and works out what it uses. Half days are ignored for
 * full-day types. Over allowance is not a problem: it is shown as a warning and the request can still be sent.
 */
export function previewLeaveRequest(
  draft: LeaveRequestDraft,
  type: LeaveType,
  allowance: LeaveAllowance | undefined,
  ownRequests: readonly LeaveRequest[],
  uid: string,
): LeaveDraftPreview {
  if (!draft.startDate || !draft.endDate) return { ok: false, problem: 'dates' }
  const halves = type.unit === 'half-day'
  const range = {
    startDate: draft.startDate,
    endDate: draft.endDate,
    startHalf: halves && draft.startHalf,
    endHalf: halves && draft.endHalf,
  }
  if (draft.endDate < draft.startDate) return { ok: false, problem: 'end-before-start' }
  const days = countLeaveDays(range)
  if (days === null) return { ok: false, problem: 'dates' }
  if (draft.startDate.slice(0, 4) !== draft.endDate.slice(0, 4)) return { ok: false, problem: 'crosses-year' }
  if (days === 0) return { ok: false, problem: 'no-working-days' }
  const active = ownRequests.filter((request) => request.status === 'pending' || request.status === 'approved')
  if (active.some((request) => rangesOverlap(request, range))) return { ok: false, problem: 'overlap' }
  const year = Number(draft.startDate.slice(0, 4))
  const balance = memberLeaveBalance(type, allowance, ownRequests, uid, year)
  const overDays = overAllowanceDays(balance, days)
  const balanceAfter = balance.availableAfterPendingDays === null ? null : balance.availableAfterPendingDays - days
  return { ok: true, days, year, overDays, balanceAfter }
}

/** Pending requests first, then everything by start date, latest first. */
export function sortLeaveRequests(requests: readonly LeaveRequest[]): LeaveRequest[] {
  const rank = (request: LeaveRequest) => (request.status === 'pending' ? 0 : 1)
  return [...requests].sort((a, b) => rank(a) - rank(b) || b.startDate.localeCompare(a.startDate))
}
