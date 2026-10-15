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
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type QueryConstraint,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { db } from './firebase'

export type TimeEntry = {
  id: string
  userId: string
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

export type TimerDetails = Pick<TimeEntry, 'description' | 'clientName' | 'projectName' | 'taskName' | 'billable'> & Pick<TimeEntry, 'clientId' | 'projectId' | 'taskId'>
export type ManualEntryInput = TimerDetails & { startAt: Date; endAt: Date }

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
  return onSnapshot(entriesQuery, (snapshot) => {
    const entries = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as TimeEntry)
    onEntries(entries)
  }, onError)
}

function localDayBounds(day: string): [Date, Date] {
  const [year, month, date] = day.split('-').map(Number)
  const start = new Date(year, month - 1, date)
  const end = new Date(year, month - 1, date + 1)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error('Choose a valid date.')
  return [start, end]
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
  return onSnapshot(query(entriesPath(workspaceId), ...filters), (snapshot) => {
    onEntries(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as TimeEntry))
  }, onError)
}

async function assertNoOverlap(
  workspaceId: string,
  userId: string,
  startAt: Date,
  endAt: Date | null,
  excludedEntryId?: string,
): Promise<void> {
  const filters: QueryConstraint[] = [
    where('userId', '==', userId),
    where('endAt', '>', Timestamp.fromDate(startAt)),
    orderBy('endAt'),
  ]
  if (endAt) filters.push(where('startAt', '<', Timestamp.fromDate(endAt)), orderBy('startAt'))
  const overlapping = await getDocs(query(entriesPath(workspaceId), ...filters))
  if (overlapping.docs.some((entry) => entry.id !== excludedEntryId)) {
    throw new Error('This time overlaps another entry for this user. Adjust the start or end time.')
  }

  const activeSnapshot = await getDoc(doc(db, 'workspaces', workspaceId, 'activeTimers', userId))
  if (activeSnapshot.exists()) {
    const activeStart = (activeSnapshot.data().startAt as Timestamp).toMillis()
    if (endAt === null || endAt.getTime() > activeStart) {
      throw new Error('This time overlaps the user’s running timer. Stop the timer or choose a different time.')
    }
  }
}

export async function startTimer(user: User, workspaceId: string, details: TimerDetails): Promise<string> {
  await assertNoOverlap(workspaceId, user.uid, new Date(), null)
  const entryRef = doc(entriesPath(workspaceId))
  const activeRef = doc(db, 'workspaces', workspaceId, 'activeTimers', user.uid)

  await runTransaction(db, async (transaction) => {
    const active = await transaction.get(activeRef)
    if (active.exists()) throw new Error('You already have a running timer in this workspace. Stop it before starting another.')
    transaction.set(entryRef, {
      userId: user.uid,
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

export async function saveManualTimeEntry(
  user: User,
  workspaceId: string,
  input: ManualEntryInput,
  userId = user.uid,
  entryId?: string,
): Promise<string> {
  const description = input.description.trim()
  if (!description) throw new Error('Add a description for this entry.')
  if (description.length > 500) throw new Error('Descriptions must be 500 characters or fewer.')
  for (const [label, value] of [['Client', input.clientName], ['Project', input.projectName], ['Task', input.taskName]] as const) {
    if ((value?.trim().length ?? 0) > 100) throw new Error(`${label} names must be 100 characters or fewer.`)
  }
  if (!Number.isFinite(input.startAt.getTime()) || !Number.isFinite(input.endAt.getTime()) || input.endAt <= input.startAt) {
    throw new Error('The end time must be later than the start time.')
  }

  await assertNoOverlap(workspaceId, userId, input.startAt, input.endAt, entryId)
  const entryRef = entryId ? doc(entriesPath(workspaceId), entryId) : doc(entriesPath(workspaceId))
  const values = {
    userId,
    description,
    clientName: input.clientName?.trim() || null,
    projectName: input.projectName?.trim() || null,
    taskName: input.taskName?.trim() || null,
    clientId: input.clientId ?? null,
    projectId: input.projectId ?? null,
    taskId: input.taskId ?? null,
    billable: input.billable,
    startAt: Timestamp.fromDate(input.startAt),
    endAt: Timestamp.fromDate(input.endAt),
    updatedAt: serverTimestamp(),
  }
  if (entryId) await updateDoc(entryRef, values)
  else await setDoc(entryRef, { ...values, createdAt: serverTimestamp() })
  return entryRef.id
}

export async function deleteTimeEntry(workspaceId: string, entry: TimeEntry): Promise<void> {
  if (entry.endAt === null) throw new Error('Stop a running timer before deleting its entry.')
  await deleteDoc(doc(entriesPath(workspaceId), entry.id))
}

export async function stopTimer(user: User, workspaceId: string, entryId: string): Promise<void> {
  const entryRef = doc(entriesPath(workspaceId), entryId)
  const activeRef = doc(db, 'workspaces', workspaceId, 'activeTimers', user.uid)

  await runTransaction(db, async (transaction) => {
    const [entrySnapshot, activeSnapshot] = await Promise.all([
      transaction.get(entryRef),
      transaction.get(activeRef),
    ])
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

