// Emulator test for the saveManualTimeEntry callable. Run with `npm run test:emulators` from the repository root.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'

const PROJECT_ID = 'demo-ticknest'

if (!process.env.FIREBASE_EMULATOR_HUB || !process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Run this test through the Firebase emulators: npm run test:emulators')
}

const emulators = await (await fetch(`http://${process.env.FIREBASE_EMULATOR_HUB}/emulators`)).json()
const AUTH_URL = `http://${emulators.auth.host}:${emulators.auth.port}`
const FUNCTIONS_URL = `http://${emulators.functions.host}:${emulators.functions.port}`

const app = initializeApp({ projectId: PROJECT_ID }, 'manual-time-entries-test')
const db = getFirestore(app)
const HOUR = 60 * 60 * 1000
const BASE = Date.UTC(2026, 0, 5, 9)

let workspaceId
let owner
let member

async function signUp() {
  const response = await fetch(`${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${randomUUID()}@example.test`, password: 'test-password', returnSecureToken: true }),
  })
  const body = await response.json()
  assert.equal(response.status, 200, JSON.stringify(body))
  return { uid: body.localId, idToken: body.idToken }
}

async function save(user, data) {
  const response = await fetch(`${FUNCTIONS_URL}/${PROJECT_ID}/europe-west1/saveManualTimeEntry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.idToken}` },
    body: JSON.stringify({ data: { workspaceId, ...data } }),
  })
  const body = await response.json()
  return body.error
    ? { ok: false, status: body.error.status, message: body.error.message }
    : { ok: true, entryId: body.result.entryId }
}

function entry(startHour, endHour, extra = {}) {
  return {
    description: 'Focus work',
    clientId: null,
    projectId: null,
    taskId: null,
    billable: false,
    startAt: BASE + startHour * HOUR,
    endAt: BASE + endHour * HOUR,
    ...extra,
  }
}

async function entriesFor(uid) {
  const snapshot = await db
    .collection('workspaces')
    .doc(workspaceId)
    .collection('timeEntries')
    .where('userId', '==', uid)
    .get()
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
}

before(async () => {
  owner = await signUp()
  member = await signUp()
  const workspaceRef = db.collection('workspaces').doc()
  workspaceId = workspaceRef.id
  const now = FieldValue.serverTimestamp()
  await workspaceRef.set({
    name: 'Test workspace',
    ownerUid: owner.uid,
    weekStartsOn: 1,
    createdAt: now,
    updatedAt: now,
  })
  await workspaceRef.collection('members').doc(owner.uid).set({
    uid: owner.uid,
    email: 'owner@example.test',
    displayName: 'Owner',
    role: 'owner',
    status: 'active',
    joinedAt: now,
  })
  await workspaceRef.collection('members').doc(member.uid).set({
    uid: member.uid,
    email: 'member@example.test',
    displayName: 'Member',
    role: 'member',
    status: 'active',
    joinedAt: now,
  })
})

after(async () => {
  await deleteApp(app)
})

test('concurrent conflicting creates save exactly one entry', async () => {
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, index) => save(member, entry(index * 0.1, 2 + index * 0.1))),
  )
  const saved = results.filter((result) => result.ok)
  const rejected = results.filter((result) => !result.ok)
  assert.equal(saved.length, 1, JSON.stringify(results))
  for (const result of rejected) {
    assert.ok(['FAILED_PRECONDITION', 'ABORTED'].includes(result.status), JSON.stringify(result))
  }
  assert.equal((await entriesFor(member.uid)).length, 1)
})

test('a concurrent edit and create cannot overlap', async () => {
  const created = await save(member, entry(10, 11))
  assert.ok(created.ok, JSON.stringify(created))
  const [edit, create] = await Promise.all([
    save(member, { ...entry(12, 13), entryId: created.entryId }),
    save(member, entry(12.5, 13.5)),
  ])
  assert.equal([edit, create].filter((result) => result.ok).length, 1, JSON.stringify([edit, create]))
})

test('edits exclude the edited entry and adjacent entries are allowed', async () => {
  const created = await save(member, entry(20, 21))
  assert.ok(created.ok, JSON.stringify(created))
  const edited = await save(member, { ...entry(20.5, 21.5), entryId: created.entryId, description: 'Edited' })
  assert.ok(edited.ok, JSON.stringify(edited))
  const adjacent = await save(member, entry(21.5, 22))
  assert.ok(adjacent.ok, JSON.stringify(adjacent))
  const overlapping = await save(member, entry(21, 21.75))
  assert.equal(overlapping.status, 'FAILED_PRECONDITION')
  assert.match(overlapping.message, /overlaps another entry/)
})

test('entries cannot overlap a running timer', async () => {
  const timerStart = BASE + 1000 * HOUR
  const timerEntryRef = db.collection('workspaces').doc(workspaceId).collection('timeEntries').doc()
  await timerEntryRef.set({
    userId: owner.uid,
    description: 'Running',
    billable: false,
    startAt: Timestamp.fromMillis(timerStart),
    endAt: null,
  })
  await db
    .collection('workspaces')
    .doc(workspaceId)
    .collection('activeTimers')
    .doc(owner.uid)
    .set({ entryId: timerEntryRef.id, startAt: Timestamp.fromMillis(timerStart) })
  const earlier = await save(owner, entry(998, 1000))
  assert.ok(earlier.ok, JSON.stringify(earlier))
  const overlapping = await save(owner, entry(1000.5, 1001))
  assert.equal(overlapping.status, 'FAILED_PRECONDITION')
  assert.match(overlapping.message, /running timer/)
})

test('members cannot edit other users entries but owners can', async () => {
  const ownerEntry = await save(owner, entry(200, 201))
  assert.ok(ownerEntry.ok, JSON.stringify(ownerEntry))
  const denied = await save(member, { ...entry(200, 201), entryId: ownerEntry.entryId })
  assert.equal(denied.status, 'PERMISSION_DENIED')

  const memberEntry = await save(member, entry(300, 301))
  const ownerEdit = await save(owner, { ...entry(300, 302), entryId: memberEntry.entryId })
  assert.ok(ownerEdit.ok, JSON.stringify(ownerEdit))
  const [stored] = (await entriesFor(member.uid)).filter((item) => item.id === memberEntry.entryId)
  assert.equal(stored.userId, member.uid)
  assert.equal(stored.endAt.toMillis(), BASE + 302 * HOUR)
})

test('invalid durations are rejected', async () => {
  const result = await save(member, entry(400, 400))
  assert.equal(result.status, 'INVALID_ARGUMENT')
})
