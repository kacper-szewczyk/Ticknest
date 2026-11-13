// A drop-in for `firebase/firestore` that counts billed Firestore operations in the browser.
//
// Only the cost measurement (`npm run measure:costs`) loads it: vite.config.ts aliases `firebase/firestore` to this
// file when TICKNEST_COUNT_FIRESTORE=true. The app code is unchanged; every call goes to the real SDK.
//
// Counts follow the Firestore Standard edition billing rules (https://cloud.google.com/firestore/pricing):
// - a get or query is one read per document returned, and at least one read even when nothing matches;
// - a listener is billed like a query for its first server result, then one read per document added or changed;
// - every set or update is one write and every delete one delete;
// - a request whose security rules read other documents (here the caller's member document, and the client,
//   project and task an entry points to) is billed one read per such document. These are estimated from the
//   request, as the client cannot see the rules engine; they are reported apart as `ruleReads`.
// Snapshots served from the local cache or holding only local, unconfirmed writes are not billed.
import * as firestore from '@firebase/firestore'

export * from '@firebase/firestore'

export type FirestoreUsage = { reads: number; writes: number; deletes: number; ruleReads: number }

type UsageWindow = typeof globalThis & { __firestoreUsage?: FirestoreUsage }

function usage(): FirestoreUsage {
  const target = globalThis as UsageWindow
  target.__firestoreUsage ??= { reads: 0, writes: 0, deletes: 0, ruleReads: 0 }
  return target.__firestoreUsage
}

function pathOf(reference: unknown): string {
  if (reference && typeof reference === 'object') {
    if ('path' in reference && typeof reference.path === 'string') return reference.path
    // A query has no public path. The SDK keeps it on `_query`; this file only runs in the measurement build.
    const internal = (reference as { _query?: { path?: { canonicalString?: () => string } } })._query
    const path = internal?.path?.canonicalString?.()
    if (typeof path === 'string') return path
  }
  return ''
}

/** Workspace data is guarded by rules that read the caller's member document; profiles and memberships are not. */
function ruleReadsFor(path: string): number {
  return /^workspaces\/[^/]+\/(?!members(\/|$))/.test(path) ? 1 : 0
}

/** The catalog documents the time-entry rules read to check the names an entry copies. */
function catalogReadsFor(path: string, data: unknown): number {
  if (!/^workspaces\/[^/]+\/timeEntries\//.test(path) || !data || typeof data !== 'object') return 0
  return ['clientId', 'projectId', 'taskId'].filter(
    (field) => typeof (data as Record<string, unknown>)[field] === 'string',
  ).length
}

function countQuery(path: string, size: number): void {
  usage().reads += Math.max(1, size)
  usage().ruleReads += ruleReadsFor(path)
}

function countWrite(path: string, data?: unknown): void {
  usage().writes += 1
  usage().ruleReads += ruleReadsFor(path) + catalogReadsFor(path, data)
}

function countDelete(path: string): void {
  usage().deletes += 1
  usage().ruleReads += ruleReadsFor(path)
}

type AnySnapshot = firestore.DocumentSnapshot | firestore.QuerySnapshot

function isQuerySnapshot(snapshot: AnySnapshot): snapshot is firestore.QuerySnapshot {
  return 'docChanges' in snapshot
}

/** Wraps a listener so each server result is billed: the whole result first, then the documents that changed. */
function countingListener(path: string, next: (snapshot: AnySnapshot) => void): (snapshot: AnySnapshot) => void {
  let hasServerResult = false
  return (snapshot) => {
    const { fromCache, hasPendingWrites } = snapshot.metadata
    if (!fromCache && !hasPendingWrites) {
      if (isQuerySnapshot(snapshot)) {
        const changed = snapshot.docChanges().filter((change) => change.type !== 'removed').length
        if (!hasServerResult) countQuery(path, snapshot.size)
        else if (changed > 0) {
          usage().reads += changed
          usage().ruleReads += ruleReadsFor(path)
        }
      } else {
        usage().reads += 1
        if (!hasServerResult) usage().ruleReads += ruleReadsFor(path)
      }
      hasServerResult = true
    }
    next(snapshot)
  }
}

export const onSnapshot = ((reference: unknown, ...args: unknown[]) => {
  const path = pathOf(reference)
  const wrapped = [...args]
  const index = wrapped.findIndex(
    (argument) =>
      typeof argument === 'function' || (argument !== null && typeof argument === 'object' && 'next' in argument),
  )
  const argument = wrapped[index]
  if (typeof argument === 'function') {
    wrapped[index] = countingListener(path, argument as (snapshot: AnySnapshot) => void)
  } else if (argument && typeof argument === 'object') {
    const observer = argument as { next?: (snapshot: AnySnapshot) => void }
    if (observer.next) wrapped[index] = { ...observer, next: countingListener(path, observer.next.bind(observer)) }
  }
  return (firestore.onSnapshot as (...parameters: unknown[]) => firestore.Unsubscribe)(reference, ...wrapped)
}) as typeof firestore.onSnapshot

export const getDoc = (async (reference: firestore.DocumentReference) => {
  const snapshot = await firestore.getDoc(reference)
  countQuery(reference.path, 1)
  return snapshot
}) as typeof firestore.getDoc

export const getDocs = (async (query: firestore.Query) => {
  const snapshot = await firestore.getDocs(query)
  countQuery(pathOf(query), snapshot.size)
  return snapshot
}) as typeof firestore.getDocs

export const setDoc = (async (reference: firestore.DocumentReference, data: unknown, ...rest: unknown[]) => {
  await (firestore.setDoc as (...parameters: unknown[]) => Promise<void>)(reference, data, ...rest)
  countWrite(reference.path, data)
}) as typeof firestore.setDoc

export const updateDoc = (async (reference: firestore.DocumentReference, ...rest: unknown[]) => {
  await (firestore.updateDoc as (...parameters: unknown[]) => Promise<void>)(reference, ...rest)
  countWrite(reference.path, rest[0])
}) as typeof firestore.updateDoc

export const deleteDoc = (async (reference: firestore.DocumentReference) => {
  await firestore.deleteDoc(reference)
  countDelete(reference.path)
}) as typeof firestore.deleteDoc

/** Counts the reads of every attempt, and the writes and rule reads of the attempt that commits. */
export const runTransaction = (async (
  db: firestore.Firestore,
  updateFunction: (transaction: firestore.Transaction) => Promise<unknown>,
  options?: firestore.TransactionOptions,
) => {
  let pending: { writes: number; deletes: number; ruleReads: number } = { writes: 0, deletes: 0, ruleReads: 0 }
  const result = await firestore.runTransaction(
    db,
    async (transaction) => {
      pending = { writes: 0, deletes: 0, ruleReads: 0 }
      // The rules read the caller's member document once per commit, however many workspace documents it writes.
      let readsMember = false
      const note = (path: string, data?: unknown) => {
        if (ruleReadsFor(path) > 0) readsMember = true
        pending.ruleReads += catalogReadsFor(path, data)
      }
      const counting = {
        get: async (reference: firestore.DocumentReference) => {
          const snapshot = await transaction.get(reference)
          countQuery(reference.path, 1)
          return snapshot
        },
        set: (reference: firestore.DocumentReference, data: unknown, setOptions?: firestore.SetOptions) => {
          pending.writes += 1
          note(reference.path, data)
          if (setOptions) transaction.set(reference, data as firestore.DocumentData, setOptions)
          else transaction.set(reference, data as firestore.DocumentData)
          return counting
        },
        update: (reference: firestore.DocumentReference, data: unknown) => {
          pending.writes += 1
          note(reference.path, data)
          transaction.update(reference, data as firestore.UpdateData<firestore.DocumentData>)
          return counting
        },
        delete: (reference: firestore.DocumentReference) => {
          pending.deletes += 1
          note(reference.path)
          // Deleting a running timer makes the rules read the entry it points to.
          if (/\/activeTimers\//.test(reference.path)) pending.ruleReads += 1
          transaction.delete(reference)
          return counting
        },
      }
      const value = await updateFunction(counting as unknown as firestore.Transaction)
      if (readsMember) pending.ruleReads += 1
      return value
    },
    options,
  )
  usage().writes += pending.writes
  usage().deletes += pending.deletes
  usage().ruleReads += pending.ruleReads
  return result
}) as typeof firestore.runTransaction
