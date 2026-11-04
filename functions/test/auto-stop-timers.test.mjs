// Emulator test for the scheduled auto-stop of running timers. Run with `npm run test:emulators` from the repository root.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, beforeEach, test } from 'node:test'

// Load firebase-admin from functions/ so the test and the compiled job share one SDK copy.
const require = createRequire(new URL('../package.json', import.meta.url))
const { deleteApp, initializeApp } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const { autoStopRunningTimers } = require('./lib/timers/autoStop.js')

const PROJECT_ID = 'demo-ticknest'

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Run this test through the Firebase emulators: npm run test:emulators')
}

const app = initializeApp({ projectId: PROJECT_ID }, 'auto-stop-test')
const db = getFirestore(app)
const workspaces = ['ws-auto-stop-a', 'ws-auto-stop-b']

after(() => deleteApp(app))

beforeEach(async () => {
  for (const workspaceId of workspaces) await db.recursiveDelete(db.collection('workspaces').doc(workspaceId))
})

const at = (iso) => Timestamp.fromDate(new Date(iso))

/** Seeds a running timer as the client would have started it. */
async function seedTimer(workspaceId, uid, entryId, { startAt, startTimeZone, memberTimeZone } = {}) {
  const workspaceRef = db.collection('workspaces').doc(workspaceId)
  await workspaceRef
    .collection('members')
    .doc(uid)
    .set({
      uid,
      role: 'member',
      status: 'active',
      ...(memberTimeZone ? { timezone: memberTimeZone } : {}),
    })
  await workspaceRef
    .collection('timeEntries')
    .doc(entryId)
    .set({
      userId: uid,
      description: 'Forgot to stop',
      clientName: null,
      projectName: null,
      taskName: null,
      billable: false,
      startAt,
      endAt: null,
      ...(startTimeZone ? { startTimeZone } : {}),
      createdAt: startAt,
      updatedAt: startAt,
    })
  await workspaceRef.collection('activeTimers').doc(uid).set({ entryId, startAt })
}

async function readTimer(workspaceId, uid, entryId) {
  const workspaceRef = db.collection('workspaces').doc(workspaceId)
  const [entry, active] = await Promise.all([
    workspaceRef.collection('timeEntries').doc(entryId).get(),
    workspaceRef.collection('activeTimers').doc(uid).get(),
  ])
  return { entry: entry.data(), isActive: active.exists }
}

test('stops timers past midnight in their start time zone, across workspaces, and leaves the rest running', async () => {
  // 09:00 in Warsaw on 6 January; the day ends at 23:00 UTC.
  await seedTimer('ws-auto-stop-a', 'alice', 'warsaw', {
    startAt: at('2026-01-06T08:00:00Z'),
    startTimeZone: 'Europe/Warsaw',
  })
  // 03:00 in New York on 6 January; that day ends at 05:00 UTC on 7 January, after the run.
  await seedTimer('ws-auto-stop-b', 'bob', 'new-york', {
    startAt: at('2026-01-06T08:00:00Z'),
    startTimeZone: 'America/New_York',
  })
  // Started before the start time zone was recorded: falls back to the member's Tokyo time zone.
  await seedTimer('ws-auto-stop-b', 'carol', 'legacy', {
    startAt: at('2026-01-06T08:00:00Z'),
    memberTimeZone: 'Asia/Tokyo',
  })
  // No time zone at all falls back to UTC.
  await seedTimer('ws-auto-stop-a', 'dave', 'utc', { startAt: at('2026-01-05T12:00:00Z') })

  const result = await autoStopRunningTimers(db, new Date('2026-01-07T01:00:00Z'))

  assert.deepEqual(result, { checked: 4, stopped: 3, skipped: 0 })
  const warsaw = await readTimer('ws-auto-stop-a', 'alice', 'warsaw')
  assert.equal(warsaw.entry.endAt.toDate().toISOString(), '2026-01-06T23:00:00.000Z')
  assert.equal(warsaw.entry.autoStopped, true)
  assert.equal(warsaw.isActive, false)

  const newYork = await readTimer('ws-auto-stop-b', 'bob', 'new-york')
  assert.equal(newYork.entry.endAt, null)
  assert.equal(newYork.entry.autoStopped, undefined)
  assert.equal(newYork.isActive, true)

  const legacy = await readTimer('ws-auto-stop-b', 'carol', 'legacy')
  assert.equal(legacy.entry.endAt.toDate().toISOString(), '2026-01-06T15:00:00.000Z')
  assert.equal(legacy.isActive, false)

  const utc = await readTimer('ws-auto-stop-a', 'dave', 'utc')
  assert.equal(utc.entry.endAt.toDate().toISOString(), '2026-01-06T00:00:00.000Z')
  assert.equal(utc.isActive, false)
})

test('a second run changes nothing', async () => {
  await seedTimer('ws-auto-stop-a', 'alice', 'warsaw', {
    startAt: at('2026-01-06T08:00:00Z'),
    startTimeZone: 'Europe/Warsaw',
  })
  const now = new Date('2026-01-07T01:00:00Z')
  await autoStopRunningTimers(db, now)
  const first = await readTimer('ws-auto-stop-a', 'alice', 'warsaw')

  const result = await autoStopRunningTimers(db, now)

  assert.deepEqual(result, { checked: 0, stopped: 0, skipped: 0 })
  const second = await readTimer('ws-auto-stop-a', 'alice', 'warsaw')
  assert.ok(second.entry.updatedAt.isEqual(first.entry.updatedAt))
})

test('leaves a timer pointer alone when its entry was already stopped', async () => {
  await seedTimer('ws-auto-stop-a', 'alice', 'warsaw', {
    startAt: at('2026-01-06T08:00:00Z'),
    startTimeZone: 'Europe/Warsaw',
  })
  const stoppedAt = at('2026-01-06T17:00:00Z')
  await db.doc('workspaces/ws-auto-stop-a/timeEntries/warsaw').update({ endAt: stoppedAt })

  const result = await autoStopRunningTimers(db, new Date('2026-01-07T01:00:00Z'))

  assert.deepEqual(result, { checked: 1, stopped: 0, skipped: 1 })
  const timer = await readTimer('ws-auto-stop-a', 'alice', 'warsaw')
  assert.ok(timer.entry.endAt.isEqual(stoppedAt))
  assert.equal(timer.entry.autoStopped, undefined)
})
