import { collection, onSnapshot, query, where, type QueryConstraint, type Unsubscribe } from 'firebase/firestore'
import { callFunction, db } from './firebase'
import type { LeaveAllowance, LeaveRequest, LeaveStatus, LeaveType, LeaveTypeSettings } from './leave'

/** Follows the workspace's stored leave types. Combine with `mergeLeaveTypes` to include the built-in defaults. */
export function subscribeToLeaveTypes(
  workspaceId: string,
  onChange: (types: LeaveType[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'workspaces', workspaceId, 'leaveTypes'),
    (snapshot) =>
      onChange(snapshot.docs.map((item) => ({ ...(item.data() as LeaveTypeSettings), id: item.id, isStored: true }))),
    onError,
  )
}

/**
 * Follows leave requests. Members must pass their own `uid`; owners and managers may omit it to read everyone's.
 * `years` (at most 30) and `status` narrow the query.
 */
export function subscribeToLeaveRequests(
  workspaceId: string,
  filter: { uid?: string; years?: number[]; status?: LeaveStatus },
  onChange: (requests: LeaveRequest[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const constraints: QueryConstraint[] = []
  if (filter.uid) constraints.push(where('uid', '==', filter.uid))
  if (filter.years) constraints.push(where('year', 'in', filter.years))
  if (filter.status) constraints.push(where('status', '==', filter.status))
  return onSnapshot(
    query(collection(db, 'workspaces', workspaceId, 'leaveRequests'), ...constraints),
    (snapshot) => onChange(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as LeaveRequest)),
    onError,
  )
}

/** Follows allowances. Members must pass their own `uid`; owners and managers may omit it. `years` narrows it. */
export function subscribeToLeaveAllowances(
  workspaceId: string,
  filter: { uid?: string; years?: number[] },
  onChange: (allowances: LeaveAllowance[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const constraints: QueryConstraint[] = []
  if (filter.years) constraints.push(where('year', 'in', filter.years))
  if (filter.uid) constraints.push(where('uid', '==', filter.uid))
  return onSnapshot(
    query(collection(db, 'workspaces', workspaceId, 'leaveAllowances'), ...constraints),
    (snapshot) => onChange(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as LeaveAllowance)),
    onError,
  )
}

export async function saveLeaveType(
  workspaceId: string,
  typeId: string | null,
  settings: LeaveTypeSettings,
): Promise<string> {
  const { typeId: savedId } = await callFunction<
    LeaveTypeSettings & { workspaceId: string; typeId: string | null },
    { typeId: string }
  >('saveLeaveType', {
    workspaceId,
    typeId,
    name: settings.name,
    color: settings.color,
    unit: settings.unit,
    requiresApproval: settings.requiresApproval,
    defaultAllowanceDays: settings.defaultAllowanceDays,
    archived: settings.archived,
  })
  return savedId
}

type AllowanceTarget = { workspaceId: string; uid: string; typeId: string; year: number }

export async function setLeaveAllowance(target: AllowanceTarget, allowanceDays: number | null): Promise<void> {
  await callFunction<AllowanceTarget & { allowanceDays: number | null }, unknown>('setLeaveAllowance', {
    ...target,
    allowanceDays,
  })
}

export async function addLeaveAdjustment(target: AllowanceTarget, days: number, note: string): Promise<void> {
  await callFunction<AllowanceTarget & { days: number; note: string }, unknown>('addLeaveAdjustment', {
    ...target,
    days,
    note,
  })
}

export type LeaveRequestInput = {
  typeId: string
  startDate: string
  endDate: string
  startHalf: boolean
  endHalf: boolean
  note: string
}

export async function submitLeaveRequest(
  workspaceId: string,
  input: LeaveRequestInput,
): Promise<{ requestId: string; status: LeaveStatus }> {
  return callFunction<LeaveRequestInput & { workspaceId: string }, { requestId: string; status: LeaveStatus }>(
    'submitLeaveRequest',
    { workspaceId, ...input },
  )
}

export async function decideLeaveRequest(
  workspaceId: string,
  requestId: string,
  decision: 'approve' | 'reject',
  note: string,
): Promise<void> {
  await callFunction<{ workspaceId: string; requestId: string; decision: string; note: string }, unknown>(
    'decideLeaveRequest',
    { workspaceId, requestId, decision, note },
  )
}

export async function cancelLeaveRequest(workspaceId: string, requestId: string): Promise<void> {
  await callFunction<{ workspaceId: string; requestId: string }, unknown>('cancelLeaveRequest', {
    workspaceId,
    requestId,
  })
}
