import { FieldValue, Timestamp, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { endOfZonedDay, isValidTimeZone, resolveTimeZone } from './midnight'

const PAGE_SIZE = 200

export type AutoStopResult = {
  /** Running timers looked at. */
  checked: number
  /** Timers stopped at the end of their start day. */
  stopped: number
  /** Timers stopped or changed by someone else between the read and the write. */
  skipped: number
}

/**
 * Stops every running timer whose start day has ended, in the time zone the timer was started in (falling back to
 * the member's time zone snapshot, then UTC). The entry ends at 24:00 of its start day, not at the time of the run,
 * and is marked `autoStopped`. Each stop is its own transaction that re-checks the timer, so a retry or a race with
 * a manual stop leaves the entry as it is.
 */
export async function autoStopRunningTimers(db: Firestore, now: Date): Promise<AutoStopResult> {
  const result: AutoStopResult = { checked: 0, stopped: 0, skipped: 0 }
  const nowMs = now.getTime()
  let cursor: QueryDocumentSnapshot | undefined

  do {
    let page = db.collectionGroup('activeTimers').where('startAt', '<', Timestamp.fromDate(now)).orderBy('startAt')
    if (cursor) page = page.startAfter(cursor)
    const snapshot = await page.limit(PAGE_SIZE).get()
    cursor = snapshot.docs.length === PAGE_SIZE ? snapshot.docs[snapshot.docs.length - 1] : undefined

    for (const active of snapshot.docs) {
      result.checked += 1
      const outcome = await stopIfPastMidnight(db, active, nowMs)
      if (outcome === 'stopped') result.stopped += 1
      if (outcome === 'skipped') result.skipped += 1
    }
  } while (cursor)

  return result
}

async function stopIfPastMidnight(
  db: Firestore,
  active: QueryDocumentSnapshot,
  nowMs: number,
): Promise<'stopped' | 'running' | 'skipped'> {
  const activeRef = active.ref
  const workspaceRef = activeRef.parent.parent
  const entryId: unknown = active.data().entryId
  if (!workspaceRef || typeof entryId !== 'string' || entryId.length === 0) return 'skipped'
  const entryRef = workspaceRef.collection('timeEntries').doc(entryId)
  const memberRef = workspaceRef.collection('members').doc(activeRef.id)

  return db.runTransaction(async (transaction) => {
    const [currentActive, entry] = await Promise.all([transaction.get(activeRef), transaction.get(entryRef)])
    const entryData = entry.data()
    const startAt: unknown = entryData?.startAt
    if (
      !currentActive.exists ||
      currentActive.data()?.entryId !== entryId ||
      !entryData ||
      entryData.endAt != null ||
      entryData.userId !== activeRef.id ||
      !(startAt instanceof Timestamp)
    ) {
      return 'skipped'
    }

    // Timers started before the start time zone was recorded use the member's time zone snapshot.
    const memberTimeZone = isValidTimeZone(entryData.startTimeZone)
      ? undefined
      : (await transaction.get(memberRef)).data()?.timezone
    const timeZone = resolveTimeZone(entryData.startTimeZone, memberTimeZone)
    const cutoffMs = endOfZonedDay(startAt.toMillis(), timeZone)
    if (cutoffMs > nowMs) return 'running'

    transaction.update(entryRef, {
      endAt: Timestamp.fromMillis(cutoffMs),
      autoStopped: true,
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.delete(activeRef)
    return 'stopped'
  })
}
