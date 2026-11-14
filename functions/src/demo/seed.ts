// Demo accounts plus about three months of sample data (entries, budgets, and time off), shared by the daily reset and `npm run demo:seed`.
// buildDemoData is pure and deterministic for a given `now`; writeDemoData writes its output with the Admin SDK.
// The Admin SDK bypasses Firestore Rules, so every document mirrors what the callables and the web app write
// (see docs/firestore-data-model.md).
import { createHash } from 'node:crypto'
import type { Auth } from 'firebase-admin/auth'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import {
  allowanceDocumentId,
  BUILT_IN_LEAVE_TYPES,
  countLeaveDays,
  leaveBalance,
  overAllowanceDays,
} from '../timeOff/leave'
import { DEMO_ACCOUNTS, DEMO_INVITEE_EMAIL, type DemoAccount } from './accounts'

/** Stands in for FieldValue.serverTimestamp() so buildDemoData stays free of Firestore values. */
export const SERVER_TIMESTAMP = Symbol('serverTimestamp')

export type DemoFieldValue =
  | string
  | number
  | boolean
  | null
  | Date
  | typeof SERVER_TIMESTAMP
  | DemoFieldValue[]
  | { [field: string]: DemoFieldValue }
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
  'manager@demo.ticknest.app': { fleet: 2, loyalty: 2, portal: 1, internal: 2 },
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
  leaveDays: ReadonlyMap<number, 'full' | 'half'>,
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
    const leave = leaveDays.get(day)
    if (leave === 'full') continue
    // An occasional day off.
    if (random() < 0.05) continue

    let cursor = pickMinutes(random, 8 * 60, 9 * 60 + 30, 15)
    const fullDay = pickMinutes(random, 6 * 60 + 30, 8 * 60, 15)
    // Half a day of leave leaves half a day of work.
    const target = leave === 'half' ? Math.round(fullDay / 30) * 15 : fullDay
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

type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

type BudgetSeed = {
  target: { type: 'project'; key: ProjectKey } | { type: 'client'; key: keyof typeof CLIENTS }
  /** Offsets in days from the user's local today. */
  startOffset: number
  endOffset: number
  weekdayMinutes: Partial<Record<Weekday, number>>
  /** Offsets in days from the user's local today, moved to the Monday on or after them. */
  exceptionOffsets?: number[]
  archived?: boolean
}

// Targets sit well above or below each account's share of PROJECT_WEIGHTS (about 410 logged minutes per
// weekday), so progress shows a clear spread of behind and over on every reset.
const BUDGETS: Record<string, BudgetSeed[]> = {
  // Maple Health Clinic is the portal, about 2/7 of the day (~120 min): behind.
  'owner@demo.ticknest.app': [
    {
      target: { type: 'client', key: 'maple' },
      startOffset: -60,
      endOffset: 30,
      weekdayMinutes: { mon: 180, tue: 180, wed: 180, thu: 180, fri: 180 },
      exceptionOffsets: [-28],
    },
    // Past: ended a month ago.
    {
      target: { type: 'project', key: 'internal' },
      startOffset: -90,
      endOffset: -31,
      weekdayMinutes: { mon: 120, tue: 120, wed: 120, thu: 120, fri: 120 },
    },
  ],
  // Fleet is about 2/7 of the day (~120 min) against a four-day 60-minute target: over.
  'manager@demo.ticknest.app': [
    {
      target: { type: 'project', key: 'fleet' },
      startOffset: -40,
      endOffset: 50,
      weekdayMinutes: { mon: 60, tue: 60, wed: 60, thu: 60 },
    },
    // Upcoming: starts next week.
    {
      target: { type: 'project', key: 'loyalty' },
      startOffset: 7,
      endOffset: 97,
      weekdayMinutes: { mon: 120, tue: 120, wed: 120, thu: 120, fri: 120 },
    },
  ],
  // Website is about 5/9 of the day (~230 min): behind.
  'alice@demo.ticknest.app': [
    {
      target: { type: 'project', key: 'website' },
      startOffset: -45,
      endOffset: 45,
      weekdayMinutes: { mon: 330, tue: 330, wed: 330, thu: 330, fri: 330 },
      exceptionOffsets: [-21],
    },
  ],
  // Bluefin Logistics is the fleet dashboard, about 5/9 of the day (~230 min): over.
  'ben@demo.ticknest.app': [
    {
      target: { type: 'client', key: 'bluefin' },
      startOffset: -75,
      endOffset: 15,
      weekdayMinutes: { mon: 150, tue: 150, wed: 150, thu: 150, fri: 150 },
    },
    // Archived: can be restored from the Budgets screen.
    {
      target: { type: 'project', key: 'loyalty' },
      startOffset: -30,
      endOffset: 60,
      weekdayMinutes: { mon: 120, wed: 120, fri: 120 },
      archived: true,
    },
  ],
  // Part time on the portal, Monday to Thursday, about 5/8 of the day (~260 min): behind.
  'chloe@demo.ticknest.app': [
    {
      target: { type: 'project', key: 'portal' },
      startOffset: -45,
      endOffset: 45,
      weekdayMinutes: { mon: 480, tue: 480, wed: 480, thu: 480 },
      exceptionOffsets: [-14, -35],
    },
  ],
}

function calendarDay(dayMs: number): string {
  return new Date(dayMs).toISOString().slice(0, 10)
}

/** The Monday on or after `dayMs`. */
function mondayFrom(dayMs: number): number {
  return dayMs + ((8 - new Date(dayMs).getUTCDay()) % 7) * DAY_MS
}

function buildBudgets(
  random: Random,
  now: Date,
  workspacePath: string,
  user: DemoAuthUser,
  account: DemoAccount,
  createdBy: string,
  catalog: Catalog,
): DemoDocument[] {
  const today = localDayMs(now.getTime(), account.timezone)
  return (BUDGETS[account.email] ?? []).map((budget) => {
    const target =
      budget.target.type === 'project'
        ? { type: 'project', id: catalog.projectIds[budget.target.key], name: PROJECTS[budget.target.key].name }
        : { type: 'client', id: catalog.clientIds[budget.target.key], name: CLIENTS[budget.target.key] }
    const exceptions = [
      ...new Set((budget.exceptionOffsets ?? []).map((offset) => calendarDay(mondayFrom(today + offset * DAY_MS)))),
    ].sort()
    return {
      path: `${workspacePath}/budgets/${createId(random)}`,
      data: {
        userId: user.uid,
        userDisplayName: user.displayName,
        target,
        startDay: calendarDay(today + budget.startOffset * DAY_MS),
        endDay: calendarDay(today + budget.endOffset * DAY_MS),
        weekdayMinutes: Object.fromEntries(WEEKDAYS.map((weekday) => [weekday, budget.weekdayMinutes[weekday] ?? 0])),
        exceptions,
        archived: budget.archived ?? false,
        createdBy,
        createdAt: SERVER_TIMESTAMP,
        updatedAt: SERVER_TIMESTAMP,
      },
    }
  })
}

type LeaveTypeId = keyof typeof BUILT_IN_LEAVE_TYPES
type LeaveSeedStatus = 'approved' | 'pending' | 'rejected' | 'cancelled'

type LeaveSeed = {
  typeId: LeaveTypeId
  /** Offset in days from the user's local today, moved to the weekday on or after it. */
  startOffset: number
  /** Monday-to-Friday days the leave spans, counting half days as whole ones. */
  workingDays: number
  startHalf?: boolean
  endHalf?: boolean
  status: LeaveSeedStatus
  note: string
  decisionNote?: string
}

// Spread over the entry window and the weeks after it, so the calendar, the approval queue, balances, and the
// leave history all have something to show. Ranges of one account that are pending or approved never overlap.
const LEAVE: Record<string, LeaveSeed[]> = {
  'owner@demo.ticknest.app': [
    { typeId: 'holiday', startOffset: -50, workingDays: 3, status: 'approved', note: 'Long weekend away' },
    { typeId: 'sick', startOffset: -12, workingDays: 1, status: 'approved', note: 'Migraine' },
    { typeId: 'holiday', startOffset: 20, workingDays: 5, status: 'approved', note: 'Family visit' },
  ],
  'manager@demo.ticknest.app': [
    { typeId: 'holiday', startOffset: -70, workingDays: 5, status: 'approved', note: 'Hiking trip' },
    {
      typeId: 'sick',
      startOffset: -25,
      workingDays: 1,
      startHalf: true,
      status: 'approved',
      note: 'Dentist, then home for the afternoon',
    },
    { typeId: 'holiday', startOffset: 30, workingDays: 3, status: 'pending', note: 'Friend’s wedding' },
  ],
  'alice@demo.ticknest.app': [
    { typeId: 'holiday', startOffset: -35, workingDays: 5, status: 'approved', note: 'Trip to Lisbon' },
    { typeId: 'sick', startOffset: -8, workingDays: 2, status: 'approved', note: 'Flu' },
    { typeId: 'holiday', startOffset: 14, workingDays: 2, status: 'pending', note: 'Moving flat' },
    {
      typeId: 'holiday',
      startOffset: 40,
      workingDays: 5,
      status: 'rejected',
      note: 'Ski week',
      decisionNote: 'That is the shop launch week. Could you move it a week later?',
    },
  ],
  'ben@demo.ticknest.app': [
    { typeId: 'sick', startOffset: -40, workingDays: 1, status: 'approved', note: 'Cold' },
    { typeId: 'holiday', startOffset: -60, workingDays: 2, status: 'cancelled', note: 'Road trip' },
    { typeId: 'holiday', startOffset: 5, workingDays: 4, status: 'approved', note: 'Visiting family' },
  ],
  'chloe@demo.ticknest.app': [
    { typeId: 'holiday', startOffset: -20, workingDays: 4, status: 'approved', note: 'Edinburgh with friends' },
    { typeId: 'sick', startOffset: -3, workingDays: 1, status: 'pending', note: 'Stomach bug' },
    {
      typeId: 'holiday',
      startOffset: 25,
      workingDays: 5,
      endHalf: true,
      status: 'pending',
      note: 'Half day on Friday to catch a flight',
    },
  ],
}

type AllowanceSeed = {
  typeId: LeaveTypeId
  allowanceDays: number | null
  adjustments: { days: number; note: string }[]
}

// Allowances for the year of the reset day. Everyone else uses the type defaults.
const ALLOWANCES: Record<string, AllowanceSeed[]> = {
  'alice@demo.ticknest.app': [
    { typeId: 'holiday', allowanceDays: null, adjustments: [{ days: 3, note: 'Carried over from last year' }] },
  ],
  // Part time, Monday to Thursday.
  'chloe@demo.ticknest.app': [{ typeId: 'holiday', allowanceDays: 16, adjustments: [] }],
}

/** Who decides leave in the demo: the manager decides the owner's and members' requests, the owner the manager's. */
function leaveApprover(requester: DemoAccount, users: readonly DemoAuthUser[]): DemoAuthUser {
  const role = requester.role === 'manager' ? 'owner' : 'manager'
  return users[DEMO_ACCOUNTS.findIndex((account) => account.role === role)]
}

function isWeekendDay(dayMs: number): boolean {
  const weekday = new Date(dayMs).getUTCDay()
  return weekday === 0 || weekday === 6
}

type PlannedLeave = LeaveSeed & { startDay: number; endDay: number; endHalf: boolean }

/** Calendar ranges for an account's leave. A range that would cross the new year ends on the year's last weekday. */
function planLeave(now: Date, account: DemoAccount): PlannedLeave[] {
  const today = localDayMs(now.getTime(), account.timezone)
  return (LEAVE[account.email] ?? []).map((leave) => {
    let startDay = today + leave.startOffset * DAY_MS
    while (isWeekendDay(startDay)) startDay += DAY_MS
    let endDay = startDay
    for (let counted = 1; counted < leave.workingDays;) {
      endDay += DAY_MS
      if (!isWeekendDay(endDay)) counted += 1
    }
    let endHalf = leave.endHalf ?? false
    if (new Date(endDay).getUTCFullYear() !== new Date(startDay).getUTCFullYear()) {
      endDay = Date.UTC(new Date(startDay).getUTCFullYear(), 11, 31)
      while (isWeekendDay(endDay)) endDay -= DAY_MS
      endHalf = false
    }
    return { ...leave, startDay, endDay, endHalf }
  })
}

/** Weekdays an account is away on pending or approved leave, so no time is logged on them. */
function leaveDaysFor(planned: readonly PlannedLeave[]): Map<number, 'full' | 'half'> {
  const days = new Map<number, 'full' | 'half'>()
  for (const leave of planned) {
    if (leave.status !== 'approved' && leave.status !== 'pending') continue
    for (let day = leave.startDay; day <= leave.endDay; day += DAY_MS) {
      if (isWeekendDay(day)) continue
      const half = (day === leave.startDay && leave.startHalf) || (day === leave.endDay && leave.endHalf)
      days.set(day, half ? 'half' : 'full')
    }
  }
  return days
}

function earliest(...dates: Date[]): Date {
  return new Date(Math.min(...dates.map((date) => date.getTime())))
}

function buildLeave(
  random: Random,
  now: Date,
  workspacePath: string,
  users: readonly DemoAuthUser[],
  index: number,
  planned: readonly PlannedLeave[],
): DemoDocument[] {
  const account = DEMO_ACCOUNTS[index]
  const user = users[index]
  const approver = leaveApprover(account, users)
  const today = localDayMs(now.getTime(), account.timezone)
  const year = new Date(today).getUTCFullYear()
  const documents: DemoDocument[] = []
  const allowances = new Map<string, { allowanceDays: number | null; adjustments: { days: number }[] }>()

  for (const allowance of ALLOWANCES[account.email] ?? []) {
    const at = earliest(new Date(Date.UTC(year, 0, 2, 9)), new Date(now.getTime() - 60 * MINUTE_MS))
    const adjustments = allowance.adjustments.map((adjustment) => ({ ...adjustment, by: approver.uid, at }))
    allowances.set(`${allowance.typeId}_${year}`, { allowanceDays: allowance.allowanceDays, adjustments })
    documents.push({
      path: `${workspacePath}/leaveAllowances/${allowanceDocumentId(user.uid, allowance.typeId, year)}`,
      data: {
        uid: user.uid,
        typeId: allowance.typeId,
        year,
        allowanceDays: allowance.allowanceDays,
        adjustments,
        updatedBy: approver.uid,
        createdAt: at,
        updatedAt: at,
      },
    })
  }

  // Requests submitted so far, per type and year, for the over-allowance check the callables make.
  const submitted = new Map<string, { status: LeaveSeedStatus; days: number }[]>()
  for (const leave of planned) {
    const startDate = calendarDay(leave.startDay)
    const endDate = calendarDay(leave.endDay)
    const startHalf = leave.startHalf ?? false
    const days = countLeaveDays({ startDate, endDate, startHalf, endHalf: leave.endHalf })!
    const leaveYear = new Date(leave.startDay).getUTCFullYear()
    const key = `${leave.typeId}_${leaveYear}`
    const allowance = allowances.get(key)
    const balance = leaveBalance(
      allowance?.allowanceDays ?? BUILT_IN_LEAVE_TYPES[leave.typeId].defaultAllowanceDays,
      allowance?.adjustments ?? [],
      submitted.get(key) ?? [],
    )
    const overDays = overAllowanceDays(balance, days)
    submitted.set(key, [...(submitted.get(key) ?? []), { status: leave.status, days }])

    // Holiday is booked about three weeks ahead; sick leave on the morning it starts.
    const leadDays = leave.typeId === 'holiday' ? 21 : 0
    const createdAt = earliest(
      zonedInstant(leave.startDay - leadDays * DAY_MS, 9 * 60, account.timezone),
      new Date(now.getTime() - 2 * DAY_MS),
    )
    const decided = leave.status !== 'pending'
    const decidedAt = decided ? new Date(createdAt.getTime() + DAY_MS) : null
    const cancelledAt = leave.status === 'cancelled' ? earliest(new Date(decidedAt!.getTime() + 3 * DAY_MS), now) : null
    documents.push({
      path: `${workspacePath}/leaveRequests/${createId(random)}`,
      data: {
        uid: user.uid,
        userDisplayName: user.displayName,
        typeId: leave.typeId,
        year: leaveYear,
        startDate,
        endDate,
        startHalf,
        endHalf: leave.endHalf,
        days,
        note: leave.note,
        status: leave.status,
        overAllowance: overDays > 0,
        overAllowanceDays: overDays,
        autoApproved: false,
        autoApprovedReason: null,
        decidedBy: decided ? approver.uid : null,
        decidedAt,
        decisionNote: leave.decisionNote ?? '',
        cancelledBy: cancelledAt ? user.uid : null,
        cancelledAt,
        createdAt,
        updatedAt: cancelledAt ?? decidedAt ?? createdAt,
      },
    })
  }
  return documents
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
        timezone: DEMO_ACCOUNTS[index].timezone,
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
  const leavePlans = DEMO_ACCOUNTS.map((account) => planLeave(now, account))
  users.forEach((user, index) => {
    const leaveDays = leaveDaysFor(leavePlans[index])
    documents.push(...buildEntries(random, now, workspacePath, user, DEMO_ACCOUNTS[index], catalog, leaveDays))
  })
  // Budgets come last so adding them leaves the IDs and entries above unchanged.
  users.forEach((user, index) => {
    documents.push(...buildBudgets(random, now, workspacePath, user, DEMO_ACCOUNTS[index], owner.uid, catalog))
  })
  // Holiday and sick leave use the built-in types, which need no stored type documents.
  users.forEach((_, index) => {
    documents.push(...buildLeave(random, now, workspacePath, users, index, leavePlans[index]))
  })

  return { workspaceId, users, documents }
}

function toFirestoreValue(value: DemoFieldValue): unknown {
  if (value === SERVER_TIMESTAMP) return FieldValue.serverTimestamp()
  if (value instanceof Date) return Timestamp.fromDate(value)
  if (Array.isArray(value)) return value.map(toFirestoreValue)
  if (value !== null && typeof value === 'object') return toFirestoreData(value)
  return value
}

function toFirestoreData(data: Record<string, DemoFieldValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([field, value]) => [field, toFirestoreValue(value)]))
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
