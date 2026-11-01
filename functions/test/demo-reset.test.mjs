// Emulator test for the demo reset. Run with `npm run test:emulators` from the repository root.
// The reset wipes the whole emulator project, so `test:emulators` runs these files one at a time.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, test } from 'node:test'

// Load firebase-admin from functions/ so the test and the compiled reset share one SDK copy.
const require = createRequire(new URL('../package.json', import.meta.url))
const { deleteApp, initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { FieldValue, getFirestore } = require('firebase-admin/firestore')
const { DEMO_ACCOUNTS } = require('./lib/demo/accounts.js')
const { resetDemoProject } = require('./lib/demo/reset.js')
const { buildDemoData } = require('./lib/demo/seed.js')

const PROJECT_ID = 'demo-ticknest'

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Run this test through the Firebase emulators: npm run test:emulators')
}

const app = initializeApp({ projectId: PROJECT_ID }, 'demo-reset-test')
const auth = getAuth(app)
const db = getFirestore(app)

after(() => deleteApp(app))

/** Paths of every document in the project, including documents that only exist as subcollection parents. */
async function listAllDocumentPaths() {
  const paths = []
  const visit = async (collections) => {
    for (const collection of collections) {
      for (const ref of await collection.listDocuments()) {
        if ((await ref.get()).exists) paths.push(ref.path)
        await visit(await ref.listCollections())
      }
    }
  }
  await visit(await db.listCollections())
  return paths.sort()
}

async function listAllUsers() {
  const users = []
  let pageToken
  do {
    const page = await auth.listUsers(1000, pageToken)
    users.push(...page.users)
    pageToken = page.pageToken
  } while (pageToken)
  return users
}

test('the reset leaves only the demo data for the reset day', async () => {
  // Start from a seeded demo, as the deployed project would be after a previous reset.
  await resetDemoProject(auth, db, new Date('2026-10-31T02:00:00Z'))

  // Data a visitor could add during the day: a new account with its own profile and workspace.
  const stray = await auth.createUser({ email: 'visitor@example.test', password: 'visitor-password' })
  const now = FieldValue.serverTimestamp()
  await db.doc(`users/${stray.uid}`).set({ displayName: 'Visitor', email: 'visitor@example.test', timezone: 'UTC' })
  const strayWorkspace = db.collection('workspaces').doc()
  await strayWorkspace.set({ name: 'Visitor workspace', ownerUid: stray.uid, weekStartsOn: 1, createdAt: now })
  await strayWorkspace.collection('members').doc(stray.uid).set({ uid: stray.uid, role: 'owner', status: 'active' })
  // A subcollection document under a parent that was never created, and a collection the app does not use.
  await db.doc(`workspaces/missing-parent/timeEntries/orphan`).set({ userId: stray.uid })
  await db.doc('scratch/leftover').set({ note: 'not part of the demo' })

  const resetDay = new Date('2026-11-01T02:00:00Z')
  const result = await resetDemoProject(auth, db, resetDay)

  const expected = buildDemoData(resetDay)
  assert.equal(result.deletedUsers, DEMO_ACCOUNTS.length + 1)
  assert.ok(result.deletedDocuments > expected.documents.length, 'the stray documents were deleted too')
  assert.equal(result.seededUsers, DEMO_ACCOUNTS.length)
  assert.equal(result.seededDocuments, expected.documents.length)
  assert.equal(
    result.seededTimeEntries,
    expected.documents.filter((document) => document.path.includes('/timeEntries/')).length,
  )

  const users = await listAllUsers()
  assert.deepEqual(users.map((user) => user.email).sort(), DEMO_ACCOUNTS.map((account) => account.email).sort())
  assert.deepEqual(users.map((user) => user.uid).sort(), expected.users.map((user) => user.uid).sort())

  assert.deepEqual(await listAllDocumentPaths(), expected.documents.map((document) => document.path).sort())
})

test('a reset over an already reset project succeeds', async () => {
  const resetDay = new Date('2026-11-01T02:00:00Z')
  const result = await resetDemoProject(auth, db, resetDay)

  const expected = buildDemoData(resetDay)
  assert.equal(result.deletedUsers, DEMO_ACCOUNTS.length)
  assert.equal(result.deletedDocuments, expected.documents.length)
  assert.equal((await listAllUsers()).length, DEMO_ACCOUNTS.length)
  assert.deepEqual(await listAllDocumentPaths(), expected.documents.map((document) => document.path).sort())
})
