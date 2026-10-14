import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Timestamp,
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
  billable: boolean
  startAt: Timestamp
  endAt: Timestamp | null
}

export type TimerDetails = Pick<TimeEntry, 'description' | 'clientName' | 'projectName' | 'taskName' | 'billable'>

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

export async function startTimer(user: User, workspaceId: string, details: TimerDetails): Promise<string> {
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
    billable: entry.billable,
  })
}

