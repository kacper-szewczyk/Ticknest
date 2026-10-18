import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  type QueryConstraint,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { callFunction, db } from './firebase'
import { localDayBounds } from './dates'
import { validateManualEntryFields } from './timeEntryValidation'

export type TimeEntry = {
  id: string
  userId: string
  userDisplayName?: string
  description: string
  clientName: string | null
  projectName: string | null
  taskName: string | null
  clientId?: string | null
  projectId?: string | null
  taskId?: string | null
  billable: boolean
  startAt: Timestamp
  endAt: Timestamp | null
}

export type TimerDetails = Pick<TimeEntry, 'description' | 'clientName' | 'projectName' | 'taskName' | 'billable'> &
  Pick<TimeEntry, 'clientId' | 'projectId' | 'taskId'>
export type ManualEntryInput = Pick<TimeEntry, 'description' | 'billable'> &
  Pick<TimeEntry, 'clientId' | 'projectId' | 'taskId'> & { startAt: Date; endAt: Date }

type SaveManualTimeEntryRequest = {
  workspaceId: string
  entryId: string | null
  description: string
  clientId: string | null
  projectId: string | null
  taskId: string | null
  billable: boolean
  startAt: number
  endAt: number
}

function entriesPath(workspaceId: string) {
  return collection(db, 'workspaces', workspaceId, 'timeEntries')
}

export function subscribeToTimeEntries(
  workspaceId: string,
  userId: string,
  onEntries: (entries: TimeEntry[]) => void,
  onError: (error: Error) => void,
): () => void {
  const entriesQuery = query(
    entriesPath(workspaceId),
    where('userId', '==', userId),
    orderBy('startAt', 'desc'),
    limit(20),
  )
  return onSnapshot(
    entriesQuery,
    (snapshot) => {
      const entries = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as TimeEntry)
      onEntries(entries)
    },
    onError,
  )
}

export function subscribeToEntriesForDay(
  workspaceId: string,
  userId: string,
  isOwner: boolean,
  day: string,
  onEntries: (entries: TimeEntry[]) => void,
  onError: (error: Error) => void,
): () => void {
  const [start, end] = localDayBounds(day)
  const filters: QueryConstraint[] = [
    ...(isOwner ? [] : [where('userId', '==', userId)]),
    where('startAt', '>=', Timestamp.fromDate(start)),
    where('startAt', '<', Timestamp.fromDate(end)),
    orderBy('startAt', 'desc'),
  ]
  return onSnapshot(
    query(entriesPath(workspaceId), ...filters),
    (snapshot) => {
      onEntries(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as TimeEntry))
    },
    onError,
  )
}

export function subscribeToEntriesForRange(
  workspaceId: string,
  userId: string,
  isOwner: boolean,
  startDay: string,
  dayCount: number,
  onEntries: (entries: TimeEntry[]) => void,
  onError: (error: Error) => void,
): () => void {
  const [start] = localDayBounds(startDay)
  const end = new Date(start)
  end.setDate(end.getDate() + dayCount)
  const filters: QueryConstraint[] = [
    ...(isOwner ? [] : [where('userId', '==', userId)]),
    where('startAt', '>=', Timestamp.fromDate(start)),
    where('startAt', '<', Timestamp.fromDate(end)),
    orderBy('startAt', 'desc'),
  ]
  return onSnapshot(
    query(entriesPath(workspaceId), ...filters),
    (snapshot) => {
      onEntries(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as TimeEntry))
    },
    onError,
  )
}

// Browser-side guard for starting a timer; the rules also block entries that overlap a running timer.
async function assertNoOverlapFromNow(workspaceId: string, userId: string): Promise<void> {
  const overlapping = await getDocs(
    query(
      entriesPath(workspaceId),
      where('userId', '==', userId),
      where('endAt', '>', Timestamp.now()),
      orderBy('endAt'),
    ),
  )
  if (!overlapping.empty) {
    throw new Error('This time overlaps another entry for this user. Adjust the start or end time.')
  }

  const activeSnapshot = await getDoc(doc(db, 'workspaces', workspaceId, 'activeTimers', userId))
  if (activeSnapshot.exists()) {
    throw new Error('This time overlaps the user’s running timer. Stop the timer or choose a different time.')
  }
}

export async function startTimer(user: User, workspaceId: string, details: TimerDetails): Promise<string> {
  await assertNoOverlapFromNow(workspaceId, user.uid)
  const entryRef = doc(entriesPath(workspaceId))
  const activeRef = doc(db, 'workspaces', workspaceId, 'activeTimers', user.uid)

  await runTransaction(db, async (transaction) => {
    const active = await transaction.get(activeRef)
    if (active.exists())
      throw new Error('You already have a running timer in this workspace. Stop it before starting another.')
    transaction.set(entryRef, {
      userId: user.uid,
      userDisplayName: user.displayName?.trim() || user.email || user.uid,
      ...details,
      startAt: serverTimestamp(),
      endAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    transaction.set(activeRef, { entryId: entryRef.id, startAt: serverTimestamp() })
  })

  return entryRef.id
}

// Manual entries are saved by a callable so the overlap check and the write happen in one transaction.
export async function saveManualTimeEntry(
  workspaceId: string,
  input: ManualEntryInput,
  entryId?: string,
): Promise<string> {
  validateManualEntryFields(input)
  const description = input.description.trim()

  const { entryId: savedEntryId } = await callFunction<SaveManualTimeEntryRequest, { entryId: string }>(
    'saveManualTimeEntry',
    {
      workspaceId,
      entryId: entryId ?? null,
      description,
      clientId: input.clientId ?? null,
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      billable: input.billable,
      startAt: input.startAt.getTime(),
      endAt: input.endAt.getTime(),
    },
  )
  return savedEntryId
}

export async function deleteTimeEntry(workspaceId: string, entry: TimeEntry): Promise<void> {
  if (entry.endAt === null) throw new Error('Stop a running timer before deleting its entry.')
  await deleteDoc(doc(entriesPath(workspaceId), entry.id))
}

export async function stopTimer(user: User, workspaceId: string, entryId: string): Promise<void> {
  const entryRef = doc(entriesPath(workspaceId), entryId)
  const activeRef = doc(db, 'workspaces', workspaceId, 'activeTimers', user.uid)

  await runTransaction(db, async (transaction) => {
    const [entrySnapshot, activeSnapshot] = await Promise.all([transaction.get(entryRef), transaction.get(activeRef)])
    if (!entrySnapshot.exists() || !activeSnapshot.exists() || activeSnapshot.data().entryId !== entryId) {
      throw new Error('This timer is no longer running. Refresh the page and try again.')
    }
    transaction.update(entryRef, { endAt: serverTimestamp(), updatedAt: serverTimestamp() })
    transaction.delete(activeRef)
  })
}

export async function continueTimer(user: User, workspaceId: string, entry: TimeEntry): Promise<string> {
  return startTimer(user, workspaceId, {
    description: entry.description,
    clientName: entry.clientName,
    projectName: entry.projectName,
    taskName: entry.taskName,
    clientId: entry.clientId ?? null,
    projectId: entry.projectId ?? null,
    taskId: entry.taskId ?? null,
    billable: entry.billable,
  })
}
