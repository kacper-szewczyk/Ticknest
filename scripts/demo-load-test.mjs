// `npm run demo:load-test`: simulates a launch-day spike on the demo against the local emulators.
//
// Each virtual visitor does what a visitor does on the demo sign-in screen, with the same Firebase client SDK and
// the same Firestore rules as the web app: sign in with a random demo account, load its workspaces, run the
// "last 30 days" report, start a timer, wait, and stop it. Afterwards the script can add bulk data and time the
// daily reset on it.
//
//   node scripts/demo-load-test.mjs [--visitors 200] [--concurrency 50] [--extra-entries 20000] [--skip-reset]
//
// It only ever talks to emulators on this machine, under the `demo-ticknest` project. Run `npm run emulators`
// first. It seeds the demo before the run and resets it again at the end, so it wipes the local emulator data.
import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  collection,
  collectionGroup,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  terminate,
  Timestamp,
  where,
} from 'firebase/firestore'

const PROJECT_ID = 'demo-ticknest'
const firestoreHost = (process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080')
const authHost = (process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099')

const { values: options } = parseArgs({
  options: {
    visitors: { type: 'string', default: '200' },
    concurrency: { type: 'string', default: '50' },
    'timer-ms': { type: 'string', default: '2000' },
    'extra-entries': { type: 'string', default: '20000' },
    'skip-reset': { type: 'boolean', default: false },
  },
})
const VISITORS = positiveInt(options.visitors, '--visitors')
const CONCURRENCY = positiveInt(options.concurrency, '--concurrency')
const TIMER_MS = positiveInt(options['timer-ms'], '--timer-ms')
const EXTRA_ENTRIES = positiveInt(options['extra-entries'], '--extra-entries')

// The built Functions code: the same accounts and reset as the scheduled resetDemo function.
// firebase-admin must come from functions/node_modules too: the seed's FieldValue sentinels only work with the
// Firestore client of the same copy.
const require = createRequire(new URL('../functions/lib/', import.meta.url))
const { DEMO_ACCOUNTS } = require('./demo/accounts.js')
const { resetDemoProject } = require('./demo/reset.js')
const admin = {
  app: require('firebase-admin/app'),
  auth: require('firebase-admin/auth'),
  firestore: require('firebase-admin/firestore'),
}

function positiveInt(value, name) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) throw new Error(`${name} must be a positive whole number.`)
  return number
}

function assertLocal(host, name) {
  if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) {
    throw new Error(`${name} must point to a local emulator, not ${host}.`)
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

/** Times `step` for the summary and counts failures by error code. */
async function timed(stats, name, step) {
  const started = performance.now()
  try {
    return await step()
  } catch (error) {
    const code = error?.code ?? error?.message ?? String(error)
    const key = `${name}: ${code}`
    stats.errors.set(key, (stats.errors.get(key) ?? 0) + 1)
    return undefined
  } finally {
    const list = stats.latencies.get(name) ?? []
    list.push(performance.now() - started)
    stats.latencies.set(name, list)
  }
}

// Mirrors loadWorkspaces in src/lib/workspaces.ts.
async function loadWorkspaces(db, uid) {
  const memberships = await getDocs(query(collectionGroup(db, 'members'), where('uid', '==', uid)))
  return memberships.docs
    .filter((membership) => membership.data().status !== 'removed')
    .map((membership) => ({ id: membership.ref.parent.parent.id, role: membership.data().role }))
}

// Mirrors loadReportSummary in src/lib/reports.ts for the default "last 30 days" range.
async function loadReport(db, workspace, uid) {
  const end = new Date()
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
  const seesAll = workspace.role === 'owner' || workspace.role === 'manager'
  let cursor
  let rows = 0
  do {
    const parts = [
      where('startAt', '>=', Timestamp.fromDate(start)),
      where('startAt', '<', Timestamp.fromDate(end)),
      orderBy('startAt', 'desc'),
      ...(seesAll ? [] : [where('userId', '==', uid)]),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(250),
    ]
    const snapshot = await getDocs(query(collection(db, 'workspaces', workspace.id, 'timeEntries'), ...parts))
    rows += snapshot.size
    cursor = snapshot.size === 250 ? snapshot.docs[snapshot.size - 1] : undefined
  } while (cursor)
  return rows
}

// Mirrors startTimer in src/lib/timeEntries.ts, without a client, project, or task.
async function startTimer(db, user, workspaceId) {
  const entryRef = doc(collection(db, 'workspaces', workspaceId, 'timeEntries'))
  const activeRef = doc(db, 'workspaces', workspaceId, 'activeTimers', user.uid)
  await runTransaction(db, async (transaction) => {
    const active = await transaction.get(activeRef)
    if (active.exists()) throw Object.assign(new Error('timer already running'), { code: 'timer-already-running' })
    transaction.set(entryRef, {
      userId: user.uid,
      userDisplayName: user.displayName || user.email,
      description: 'Load test',
      clientName: null,
      projectName: null,
      taskName: null,
      billable: false,
      startAt: serverTimestamp(),
      startTimeZone: 'UTC',
      endAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    transaction.set(activeRef, { entryId: entryRef.id, startAt: serverTimestamp() })
  })
  return entryRef.id
}

// Mirrors stopTimer in src/lib/timeEntries.ts.
async function stopTimer(db, user, workspaceId, entryId) {
  const entryRef = doc(db, 'workspaces', workspaceId, 'timeEntries', entryId)
  const activeRef = doc(db, 'workspaces', workspaceId, 'activeTimers', user.uid)
  await runTransaction(db, async (transaction) => {
    const [entry, active] = await Promise.all([transaction.get(entryRef), transaction.get(activeRef)])
    if (!entry.exists() || !active.exists() || active.data().entryId !== entryId) {
      throw Object.assign(new Error('timer no longer running'), { code: 'timer-no-longer-running' })
    }
    transaction.update(entryRef, { endAt: serverTimestamp(), updatedAt: serverTimestamp() })
    transaction.delete(activeRef)
  })
}

async function visit(index, stats) {
  // Each visitor gets its own app, so it has its own auth session and Firestore connection, like a browser tab.
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT_ID, appId: 'load-test' }, `visitor-${index}`)
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true })
  const db = initializeFirestore(app, {})
  const [host, port] = firestoreHost.split(':')
  connectFirestoreEmulator(db, host, Number(port))
  try {
    const account = DEMO_ACCOUNTS[index % DEMO_ACCOUNTS.length]
    const credential = await timed(stats, 'sign-in', () =>
      signInWithEmailAndPassword(auth, account.email, account.password),
    )
    if (!credential) return
    const user = credential.user
    const workspaces = await timed(stats, 'load workspaces', () => loadWorkspaces(db, user.uid))
    const workspace = workspaces?.[0]
    if (!workspace) return
    await timed(stats, 'workspace doc', () => getDoc(doc(db, 'workspaces', workspace.id)))
    await timed(stats, 'report (30 days)', () => loadReport(db, workspace, user.uid))
    const entryId = await timed(stats, 'start timer', () => startTimer(db, user, workspace.id))
    if (!entryId) return
    await new Promise((resolve) => setTimeout(resolve, TIMER_MS))
    await timed(stats, 'stop timer', () => stopTimer(db, user, workspace.id, entryId))
    stats.completed += 1
  } finally {
    await terminate(db)
    await deleteApp(app)
  }
}

async function runVisitors() {
  const stats = { latencies: new Map(), errors: new Map(), completed: 0 }
  let next = 0
  const started = performance.now()
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, VISITORS) }, async () => {
      while (next < VISITORS) await visit(next++, stats)
    }),
  )
  return { ...stats, seconds: (performance.now() - started) / 1000 }
}

function printVisitorStats(stats) {
  console.log(
    `\n${VISITORS} visitors, ${CONCURRENCY} at a time, finished in ${stats.seconds.toFixed(1)} s; ` +
      `${stats.completed} completed every step.`,
  )
  console.log('\nstep               count   p50 ms   p95 ms   max ms')
  for (const [name, list] of stats.latencies) {
    const sorted = [...list].sort((a, b) => a - b)
    const row = [percentile(sorted, 50), percentile(sorted, 95), sorted.at(-1)].map((ms) => ms.toFixed(0).padStart(8))
    console.log(`${name.padEnd(18)} ${String(list.length).padStart(5)} ${row.join(' ')}`)
  }
  console.log(stats.errors.size === 0 ? '\nNo errors.' : '\nErrors:')
  for (const [key, count] of stats.errors) console.log(`  ${count} × ${key}`)
}

/** Adds `count` completed entries to the demo workspace, as heavy launch traffic would, then times the reset. */
async function timeResetOnBulkData(adminAuth, adminDb) {
  const owner = await adminAuth.getUserByEmail(DEMO_ACCOUNTS[0].email)
  const membership = await adminDb.collectionGroup('members').where('uid', '==', owner.uid).limit(1).get()
  const workspaceRef = membership.docs[0].ref.parent.parent
  const writer = adminDb.bulkWriter()
  const now = Date.now()
  for (let i = 0; i < EXTRA_ENTRIES; i += 1) {
    const startAt = admin.firestore.Timestamp.fromMillis(now - (i + 2) * 60 * 60 * 1000)
    const endAt = admin.firestore.Timestamp.fromMillis(startAt.toMillis() + 30 * 60 * 1000)
    void writer.create(workspaceRef.collection('timeEntries').doc(), {
      userId: owner.uid,
      description: 'Bulk load test entry',
      clientName: null,
      projectName: null,
      taskName: null,
      billable: false,
      startAt,
      endAt,
      createdAt: endAt,
      updatedAt: endAt,
    })
  }
  await writer.close()
  // Visitors also create accounts on the demo; add some so the Auth wipe is exercised too.
  const extraUsers = Math.min(500, Math.ceil(EXTRA_ENTRIES / 100))
  await Promise.all(
    Array.from({ length: extraUsers }, (_, i) => adminAuth.createUser({ email: `visitor-${i}@example.com` })),
  )
  console.log(`\nAdded ${EXTRA_ENTRIES} time entries and ${extraUsers} accounts. Running the daily reset…`)
  const started = performance.now()
  const result = await resetDemoProject(adminAuth, adminDb, new Date())
  const seconds = (performance.now() - started) / 1000
  console.log(
    `Reset took ${seconds.toFixed(1)} s: deleted ${result.deletedUsers} accounts and ${result.deletedDocuments} ` +
      `documents, seeded ${result.seededDocuments} documents. The resetDemo function has a 540 s timeout.`,
  )
}

async function main() {
  assertLocal(firestoreHost, 'FIRESTORE_EMULATOR_HOST')
  assertLocal(authHost, 'FIREBASE_AUTH_EMULATOR_HOST')
  try {
    await fetch(`http://${firestoreHost}/`)
    await fetch(`http://${authHost}/`)
  } catch (error) {
    throw new Error('Start the emulators with `npm run emulators` first.', { cause: error })
  }

  const adminApp = admin.app.initializeApp({ projectId: PROJECT_ID }, 'load-test-admin')
  const adminAuth = admin.auth.getAuth(adminApp)
  const adminDb = admin.firestore.getFirestore(adminApp)
  await resetDemoProject(adminAuth, adminDb, new Date())
  console.log(`Seeded the demo in ${PROJECT_ID}. Starting ${VISITORS} visitors…`)

  printVisitorStats(await runVisitors())
  if (!options['skip-reset']) await timeResetOnBulkData(adminAuth, adminDb)
  await admin.app.deleteApp(adminApp)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
