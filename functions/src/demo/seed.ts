// Demo accounts plus about three months of sample data, shared by the daily reset and `npm run demo:seed`.
// buildDemoData is pure and deterministic for a given `now`; writeDemoData writes its output with the Admin SDK.
// The Admin SDK bypasses Firestore Rules, so every document mirrors what the callables and the web app write
// (see docs/firestore-data-model.md).
import { createHash } from 'node:crypto'
import type { Auth } from 'firebase-admin/auth'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { DEMO_ACCOUNTS, DEMO_INVITEE_EMAIL, type DemoAccount } from './accounts'

/** Stands in for FieldValue.serverTimestamp() so buildDemoData stays free of Firestore values. */
export const SERVER_TIMESTAMP = Symbol('serverTimestamp')

export type DemoFieldValue = string | number | boolean | null | Date | typeof SERVER_TIMESTAMP
export type DemoDocument = { path: string; data: Record<string, DemoFieldValue> }
export type DemoAuthUser = {
  uid: string
  email: string
  password: string
  displayName: string
  emailVerified: true
}
export type DemoData = { workspaceId: string; users: DemoAuthUser[]; documents: DemoDocument[] }

/** How many calendar months of entries end on the reset day. */
export const DEMO_WINDOW_MONTHS = 3

const WORKSPACE_NAME = 'Harbor & Pine Studio'
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
// Firestore batches accept up to 500 writes.
const BATCH_SIZE = 400

type ProjectKey = 'website' | 'loyalty' | 'fleet' | 'portal' | 'internal'

const CLIENTS = {
  harbor: 'Harbor Coffee Co.',
  bluefin: 'Bluefin Logistics',
  maple: 'Maple Health Clinic',
} as const

type ProjectSeed = {
  name: string
  client: keyof typeof CLIENTS | null
  description: string
  color: string
  estimateMinutes: number | null
  tasks: { name: string; billable: boolean; estimateMinutes: number | null; descriptions: string[] }[]
}

const PROJECTS: Record<ProjectKey, ProjectSeed> = {
  website: {
    name: 'Website redesign',
    client: 'harbor',
    description: 'New marketing site and online shop.',
    color: '#2e7d32',
    estimateMinutes: 24_000,
    tasks: [
      {
        name: 'Design',
        billable: true,
        estimateMinutes: 6_000,
        descriptions: ['Homepage layout', 'Menu page mockups', 'Design review with client', 'Icon set'],
      },
      {
        name: 'Development',
        billable: true,
        estimateMinutes: 12_000,
        descriptions: ['Shop checkout', 'Store locator', 'CMS integration', 'Fix mobile navigation'],
      },
      {
        name: 'Content migration',
        billable: true,
        estimateMinutes: 3_000,
        descriptions: ['Import product catalog', 'Rewrite redirects', 'Migrate blog posts'],
      },
    ],
  },
  loyalty: {
    name: 'Loyalty app',
    client: 'harbor',
    description: 'Mobile app for stamps and rewards.',
    color: '#1565c0',
    estimateMinutes: 30_000,
    tasks: [
      {
        name: 'Development',
        billable: true,
        estimateMinutes: 18_000,
        descriptions: ['Rewards screen', 'Push notifications', 'QR code scanner', 'Offline sync'],
      },
      {
        name: 'QA',
        billable: true,
        estimateMinutes: 4_800,
        descriptions: ['Regression test pass', 'Test on older Android devices', 'Verify release build'],
      },
      {
        name: 'Project management',
        billable: false,
        estimateMinutes: null,
        descriptions: ['Sprint planning', 'Update roadmap', 'Status report'],
      },
    ],
  },
  fleet: {
    name: 'Fleet dashboard',
    client: 'bluefin',
    description: 'Live map and delivery metrics for dispatchers.',
    color: '#6a1b9a',
    estimateMinutes: 18_000,
    tasks: [
      {
        name: 'Data pipeline',
        billable: true,
        estimateMinutes: 7_200,
        descriptions: ['GPS event ingestion', 'Nightly aggregates', 'Backfill missing routes'],
      },
      {
        name: 'Frontend',
        billable: true,
        estimateMinutes: 7_200,
        descriptions: ['Map clustering', 'Delivery timeline chart', 'Filters and saved views'],
      },
      {
        name: 'Support',
        billable: false,
        estimateMinutes: null,
        descriptions: ['Answer dispatcher questions', 'Investigate stale positions'],
      },
    ],
  },
  portal: {
    name: 'Patient portal',
    client: 'maple',
    description: 'Appointment booking and visit history.',
    color: '#c75b39',
    estimateMinutes: 27_000,
    tasks: [
      {
        name: 'Discovery',
        billable: true,
        estimateMinutes: 2_400,
        descriptions: ['Stakeholder interviews', 'Map booking flow', 'Write requirements'],
      },
      {
        name: 'Development',
        billable: true,
        estimateMinutes: 16_000,
        descriptions: ['Booking calendar', 'Visit history list', 'Reminder emails', 'Sign-in flow'],
      },
      {
        name: 'Accessibility review',
        billable: true,
        estimateMinutes: 1_800,
        descriptions: ['Screen reader pass', 'Contrast fixes', 'Keyboard navigation audit'],
      },
    ],
  },
  internal: {
    name: 'Internal',
    client: null,
    description: 'Studio meetings, learning, and admin.',
    color: '#607d8b',
    estimateMinutes: null,
    tasks: [
      {
        name: 'Meetings',
        billable: false,
        estimateMinutes: null,
        descriptions: ['Weekly team sync', 'One-on-one', 'Retrospective'],
      },
      {
        name: 'Training',
        billable: false,
        estimateMinutes: null,
        descriptions: ['Conference talk', 'Read up on accessibility', 'Pair programming session'],
      },
      {
        name: 'Admin',
        billable: false,
        estimateMinutes: null,
        descriptions: ['Invoices and expenses', 'Hiring interviews', 'Email and planning'],
      },
    ],
  },
}

// Relative share of each account's day spent on each project.
const PROJECT_WEIGHTS: Record<string, Partial<Record<ProjectKey, number>>> = {
  'owner@demo.ticknest.app': { website: 2, portal: 2, internal: 3 },
  'alice@demo.ticknest.app': { website: 5, loyalty: 3, internal: 1 },
  'ben@demo.ticknest.app': { fleet: 5, loyalty: 3, internal: 1 },
  'chloe@demo.ticknest.app': { portal: 5, website: 2, internal: 1 },
}
const DEFAULT_WEIGHTS: Partial<Record<ProjectKey, number>> = { internal: 1 }

type Random = () => number

/** mulberry32: a small, fast PRNG that is good enough for sample data. */
function createRandom(seed: number): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

function seedFor(now: Date): number {
  return createHash('sha256')
    .update(`ticknest-demo:${now.toISOString().slice(0, 10)}`)
    .digest()
    .readUInt32BE(0)
}

function pick<T>(random: Random, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]
}

function pickWeighted<T extends string>(random: Random, weights: Partial<Record<T, number>>): T {
  const entries = Object.entries(weights) as [T, number][]
  let roll = random() * entries.reduce((sum, [, weight]) => sum + weight, 0)
  for (const [key, weight] of entries) {
    roll -= weight
    if (roll < 0) return key
  }
  return entries[entries.length - 1][0]
}

/** A whole number of minutes from `min` to `max` inclusive, in `step` increments. */
function pickMinutes(random: Random, min: number, max: number, step: number): number {
  return min + step * Math.floor(random() * (Math.floor((max - min) / step) + 1))
}

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** An ID shaped like Firestore's auto IDs (and accepted by the callables' ID check). */
function createId(random: Random, length = 20): string {
  let id = ''
  for (let index = 0; index < length; index += 1) id += ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length)]
  return id
}

const formatters = new Map<string, Intl.DateTimeFormat>()

/** The wall-clock date and time in `timeZone` at `utcMs`, encoded as if it were a UTC instant. */
function wallClockMs(utcMs: number, timeZone: string): number {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(timeZone, formatter)
  }
  const parts = Object.fromEntries(formatter.formatToParts(new Date(utcMs)).map((part) => [part.type, part.value]))
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
}

/** Midnight of the calendar day `utcMs` falls on in `timeZone`, encoded as a UTC instant. */
function localDayMs(utcMs: number, timeZone: string): number {
  const wall = wallClockMs(utcMs, timeZone)
  return wall - (((wall % DAY_MS) + DAY_MS) % DAY_MS)
}

/** The instant at `minutes` past midnight on calendar day `dayMs` in `timeZone`. */
function zonedInstant(dayMs: number, minutes: number, timeZone: string): Date {
  const wall = dayMs + minutes * MINUTE_MS
  // Two passes settle the offset; workday hours never fall in a DST gap.
  let utc = wall - (wallClockMs(wall, timeZone) - wall)
  utc = wall - (wallClockMs(utc, timeZone) - utc)
  return new Date(utc)
}

type Catalog = {
  clientIds: Record<keyof typeof CLIENTS, string>
  projectIds: Record<ProjectKey, string>
  taskIds: Record<ProjectKey, string[]>
}

function buildEntries(
  random: Random,
  now: Date,
  workspacePath: string,
  user: DemoAuthUser,
  account: DemoAccount,
  catalog: Catalog,
): DemoDocument[] {
  const entries: DemoDocument[] = []
  const today = localDayMs(now.getTime(), account.timezone)
  const todayDate = new Date(today)
  const firstDay = Date.UTC(
    todayDate.getUTCFullYear(),
    todayDate.getUTCMonth() - DEMO_WINDOW_MONTHS,
    todayDate.getUTCDate(),
  )
  const weights = PROJECT_WEIGHTS[account.email] ?? DEFAULT_WEIGHTS

  for (let day = firstDay; day <= today; day += DAY_MS) {
    const weekday = new Date(day).getUTCDay()
    if (weekday === 0 || weekday === 6) continue
    // An occasional day off.
    if (random() < 0.05) continue

    let cursor = pickMinutes(random, 8 * 60, 9 * 60 + 30, 15)
    const target = pickMinutes(random, 6 * 60 + 30, 8 * 60, 15)
    let worked = 0
    let hadLunch = false
    while (worked < target) {
      if (!hadLunch && cursor >= 12 * 60) {
        cursor += pickMinutes(random, 30, 60, 15)
        hadLunch = true
      }
      const length = Math.min(target - worked, pickMinutes(random, 30, 150, 15))
      const projectKey = pickWeighted(random, weights)
      const project = PROJECTS[projectKey]
      const taskIndex = Math.floor(random() * project.tasks.length)
      const task = project.tasks[taskIndex]
      const startAt = zonedInstant(day, cursor, account.timezone)
      const endAt = zonedInstant(day, cursor + length, account.timezone)
      const description = pick(random, task.descriptions)
      const id = createId(random)
      worked += length
      cursor += length + pick(random, [0, 0, 5, 10, 15])
      // Today's workday is cut off at the reset time; nothing is left running.
      if (endAt.getTime() > now.getTime()) continue

      entries.push({
        path: `${workspacePath}/timeEntries/${id}`,
        data: {
          userId: user.uid,
          userDisplayName: user.displayName,
          description,
          clientId: project.client ? catalog.clientIds[project.client] : null,
          clientName: project.client ? CLIENTS[project.client] : null,
          projectId: catalog.projectIds[projectKey],
          projectName: project.name,
          taskId: catalog.taskIds[projectKey][taskIndex],
          taskName: task.name,
          billable: task.billable,
          startAt,
          endAt,
          createdAt: SERVER_TIMESTAMP,
          updatedAt: SERVER_TIMESTAMP,
        },
      })
    }
  }
  return entries
}

/** Builds the demo Auth users and Firestore documents. Deterministic for a given `now`. */
export function buildDemoData(now: Date): DemoData {
  const random = createRandom(seedFor(now))
  const users: DemoAuthUser[] = DEMO_ACCOUNTS.map((account) => ({
    uid: createId(random, 28),
    email: account.email,
    password: account.password,
    displayName: account.displayName,
    emailVerified: true,
  }))
  const owner = users[DEMO_ACCOUNTS.findIndex((account) => account.role === 'owner')]
  const workspaceId = createId(random)
  const workspacePath = `workspaces/${workspaceId}`
  const documents: DemoDocument[] = []

  users.forEach((user, index) => {
    documents.push({
      path: `users/${user.uid}`,
      data: {
        displayName: user.displayName,
        email: user.email,
        timezone: DEMO_ACCOUNTS[index].timezone,
        createdAt: SERVER_TIMESTAMP,
        updatedAt: SERVER_TIMESTAMP,
      },
    })
  })
  documents.push({
    path: workspacePath,
    data: {
      name: WORKSPACE_NAME,
      ownerUid: owner.uid,
      weekStartsOn: 1,
      createdAt: SERVER_TIMESTAMP,
      updatedAt: SERVER_TIMESTAMP,
    },
  })
  users.forEach((user, index) => {
    documents.push({
      path: `${workspacePath}/members/${user.uid}`,
      data: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        role: DEMO_ACCOUNTS[index].role,
        status: 'active',
        joinedAt: SERVER_TIMESTAMP,
      },
    })
  })

  const clientIds = {} as Catalog['clientIds']
  for (const [key, name] of Object.entries(CLIENTS) as [keyof typeof CLIENTS, string][]) {
    clientIds[key] = createId(random)
    documents.push({
      path: `${workspacePath}/clients/${clientIds[key]}`,
      data: { name, archived: false, createdAt: SERVER_TIMESTAMP, updatedAt: SERVER_TIMESTAMP },
    })
  }
  const projectIds = {} as Catalog['projectIds']
  const taskIds = {} as Catalog['taskIds']
  for (const [key, project] of Object.entries(PROJECTS) as [ProjectKey, ProjectSeed][]) {
    projectIds[key] = createId(random)
    documents.push({
      path: `${workspacePath}/projects/${projectIds[key]}`,
      data: {
        name: project.name,
        clientId: project.client ? clientIds[project.client] : null,
        description: project.description,
        color: project.color,
        estimateMinutes: project.estimateMinutes,
        archived: false,
        createdAt: SERVER_TIMESTAMP,
        updatedAt: SERVER_TIMESTAMP,
      },
    })
    taskIds[key] = project.tasks.map((task) => {
      const taskId = createId(random)
      documents.push({
        path: `${workspacePath}/tasks/${taskId}`,
        data: {
          name: task.name,
          projectId: projectIds[key],
          estimateMinutes: task.estimateMinutes,
          billable: task.billable,
          archived: false,
          createdAt: SERVER_TIMESTAMP,
          updatedAt: SERVER_TIMESTAMP,
        },
      })
      return taskId
    })
  }

  // Nobody holds the token, so the invitation can be shown and revoked but not accepted.
  const invitationToken = createId(random, 43)
  documents.push({
    path: `${workspacePath}/invitations/${createId(random)}`,
    data: {
      email: DEMO_INVITEE_EMAIL,
      role: 'member',
      tokenHash: createHash('sha256').update(invitationToken).digest('hex'),
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      status: 'pending',
      createdBy: owner.uid,
      createdAt: SERVER_TIMESTAMP,
    },
  })

  const catalog: Catalog = { clientIds, projectIds, taskIds }
  users.forEach((user, index) => {
    documents.push(...buildEntries(random, now, workspacePath, user, DEMO_ACCOUNTS[index], catalog))
  })

  return { workspaceId, users, documents }
}

function toFirestoreData(data: DemoDocument['data']): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([field, value]) => [
      field,
      value === SERVER_TIMESTAMP
        ? FieldValue.serverTimestamp()
        : value instanceof Date
          ? Timestamp.fromDate(value)
          : value,
    ]),
  )
}

/** Creates the Auth users and writes the documents. Expects an empty project: run it after the wipe. */
export async function writeDemoData(auth: Auth, db: Firestore, data: DemoData): Promise<void> {
  for (const user of data.users) {
    await auth.createUser(user)
  }
  for (let start = 0; start < data.documents.length; start += BATCH_SIZE) {
    const batch = db.batch()
    for (const document of data.documents.slice(start, start + BATCH_SIZE)) {
      batch.set(db.doc(document.path), toFirestoreData(document.data))
    }
    await batch.commit()
  }
}
