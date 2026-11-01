// Wipes the whole project and seeds the demo data. Used by the scheduled resetDemo function and `npm run demo:seed`.
// Every run starts with a full wipe, so a run that fails halfway is repaired by the next one.
import type { Auth } from 'firebase-admin/auth'
import type { Firestore } from 'firebase-admin/firestore'
import { buildDemoData, writeDemoData } from './seed'

export type DemoResetResult = {
  deletedUsers: number
  deletedDocuments: number
  seededUsers: number
  seededDocuments: number
  seededTimeEntries: number
}

// listUsers and deleteUsers both accept at most 1000 users per call.
const USER_PAGE_SIZE = 1000

/** Deletes every Auth user in the project and returns how many were deleted. */
async function deleteAllUsers(auth: Auth): Promise<number> {
  let deleted = 0
  // Always read the first page: the users on it are gone after each deleteUsers call.
  for (;;) {
    const { users } = await auth.listUsers(USER_PAGE_SIZE)
    if (users.length === 0) return deleted
    const result = await auth.deleteUsers(users.map((user) => user.uid))
    if (result.failureCount > 0) {
      const reasons = result.errors.map((error) => error.error.message).join('; ')
      throw new Error(`Could not delete ${result.failureCount} Auth users: ${reasons}`)
    }
    deleted += result.successCount
  }
}

/** Deletes every document in every collection, including subcollections, and returns how many were deleted. */
async function deleteAllDocuments(db: Firestore): Promise<number> {
  let deleted = 0
  const writer = db.bulkWriter()
  writer.onWriteResult(() => {
    deleted += 1
  })
  try {
    // Every top-level collection, not only users and workspaces: the project is dedicated to the demo.
    for (const collection of await db.listCollections()) {
      await db.recursiveDelete(collection, writer)
    }
  } finally {
    await writer.close()
  }
  return deleted
}

/** Wipes ALL Auth users and Firestore data, then seeds the demo for `now`. Check the demo guard before calling it. */
export async function resetDemoProject(auth: Auth, db: Firestore, now: Date): Promise<DemoResetResult> {
  const deletedUsers = await deleteAllUsers(auth)
  const deletedDocuments = await deleteAllDocuments(db)
  const data = buildDemoData(now)
  await writeDemoData(auth, db, data)
  return {
    deletedUsers,
    deletedDocuments,
    seededUsers: data.users.length,
    seededDocuments: data.documents.length,
    seededTimeEntries: data.documents.filter((document) => document.path.includes('/timeEntries/')).length,
  }
}
