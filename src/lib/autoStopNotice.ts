import type { TimeEntry } from './timeEntries'

function seenKey(uid: string, workspaceId: string): string {
  return `ticknest.autoStopNoticeSeen.${uid}.${workspaceId}`
}

/**
 * The entry to tell the user about: their latest entry, when it was stopped automatically and its notice has not
 * been shown yet. Starting a new timer makes it no longer the latest, so the notice is dropped.
 */
export function autoStopNoticeEntry(entries: TimeEntry[], seenEntryId: string | null): TimeEntry | null {
  const latest = entries[0]
  return latest?.autoStopped === true && latest.endAt !== null && latest.id !== seenEntryId ? latest : null
}

// The notice is a per-browser convenience, so storage failures (private mode, blocked site data) only mean it
// shows again.
export function readSeenAutoStopNotice(uid: string, workspaceId: string): string | null {
  try {
    return window.localStorage.getItem(seenKey(uid, workspaceId))
  } catch {
    return null
  }
}

export function markAutoStopNoticeSeen(uid: string, workspaceId: string, entryId: string): void {
  try {
    window.localStorage.setItem(seenKey(uid, workspaceId), entryId)
  } catch {
    // See readSeenAutoStopNotice.
  }
}
