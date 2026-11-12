import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, Timestamp, type Firestore } from 'firebase/firestore'

// Must match the project the emulators run under (see `npm run test:emulators`).
export const PROJECT_ID = 'demo-ticknest'

type EmulatorInfo = { host: string; port: number }

/** Asks the emulator hub where each emulator listens, so the tests follow firebase.json. */
export async function emulatorOrigin(name: 'auth' | 'functions'): Promise<EmulatorInfo> {
  const hub = process.env.FIREBASE_EMULATOR_HUB
  if (!hub) throw new Error('Run the emulator tests with `npm run test:emulators`.')
  const emulators = (await (await fetch(`http://${hub}/emulators`)).json()) as Record<string, EmulatorInfo>
  const info = emulators[name]
  if (!info) throw new Error(`The ${name} emulator is not running.`)
  return info
}

export function createTestEnvironment(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  })
}

export const WORKSPACE_ID = 'ws-main'
export const OTHER_WORKSPACE_ID = 'ws-other'

export const OWNER = { uid: 'owner', email: 'owner@example.com' }
export const MEMBER = { uid: 'alice', email: 'alice@example.com' }
export const MANAGER = { uid: 'mira', email: 'mira@example.com' }
export const OTHER_MEMBER = { uid: 'dave', email: 'dave@example.com' }
export const NON_MEMBER = { uid: 'bob', email: 'bob@example.com' }
export const REMOVED_MEMBER = { uid: 'carol', email: 'carol@example.com' }
export const INVITEE = { uid: 'erin', email: 'invitee@example.com' }

export const CLIENT_ID = 'client-acme'
export const PROJECT_ID_IN_WORKSPACE = 'project-site'
export const TASK_ID = 'task-build'
export const MEMBER_ENTRY_ID = 'entry-alice'
export const OWNER_ENTRY_ID = 'entry-owner'
export const MANAGER_ENTRY_ID = 'entry-mira'
export const OTHER_MEMBER_ENTRY_ID = 'entry-dave'
export const INVITATION_ID = 'invite-1'

export const PAST = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))

export function completedEntry(userId: string, displayName: string, hour: number) {
  return {
    userId,
    userDisplayName: displayName,
    description: `Work by ${displayName}`,
    clientId: CLIENT_ID,
    projectId: PROJECT_ID_IN_WORKSPACE,
    taskId: TASK_ID,
    clientName: 'Acme',
    projectName: 'Website',
    taskName: 'Build',
    billable: true,
    startAt: Timestamp.fromDate(new Date(`2026-01-05T${String(hour).padStart(2, '0')}:00:00Z`)),
    endAt: Timestamp.fromDate(new Date(`2026-01-05T${String(hour + 1).padStart(2, '0')}:00:00Z`)),
    createdAt: PAST,
    updatedAt: PAST,
  }
}

export function budgetId(userId: string): string {
  return `budget-${userId}`
}

export function budgetFixture(userId: string) {
  return {
    userId,
    userDisplayName: userId,
    target: { type: 'project', id: PROJECT_ID_IN_WORKSPACE, name: 'Website' },
    startDay: '2026-01-05',
    endDay: '2026-03-27',
    weekdayMinutes: { mon: 480, tue: 240, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
    exceptions: ['2026-02-16'],
    archived: false,
    createdBy: OWNER.uid,
    createdAt: PAST,
    updatedAt: PAST,
  }
}

export function leaveRequestId(uid: string): string {
  return `leave-${uid}`
}

export function leaveAllowanceId(uid: string): string {
  return `${uid}_holiday_2026`
}

export function leaveRequestFixture(uid: string) {
  return {
    uid,
    userDisplayName: uid,
    typeId: 'holiday',
    year: 2026,
    startDate: '2026-11-16',
    endDate: '2026-11-20',
    startHalf: false,
    endHalf: false,
    days: 5,
    note: '',
    status: 'pending',
    overAllowance: false,
    overAllowanceDays: 0,
    autoApproved: false,
    autoApprovedReason: null,
    decidedBy: null,
    decidedAt: null,
    decisionNote: '',
    cancelledBy: null,
    cancelledAt: null,
    createdAt: PAST,
    updatedAt: PAST,
  }
}

export function leaveAllowanceFixture(uid: string) {
  return {
    uid,
    typeId: 'holiday',
    year: 2026,
    allowanceDays: 26,
    adjustments: [{ days: 2, note: 'Carry-over', by: OWNER.uid, at: PAST }],
    updatedBy: OWNER.uid,
    createdAt: PAST,
    updatedAt: PAST,
  }
}

function membership(
  user: { uid: string; email: string },
  role: 'owner' | 'manager' | 'member',
  status: 'active' | 'removed' = 'active',
) {
  return { uid: user.uid, email: user.email, displayName: user.uid, role, status, joinedAt: PAST }
}

function profile(user: { uid: string; email: string }) {
  return {
    displayName: user.uid,
    email: user.email,
    timezone: 'Europe/Warsaw',
    palette: 'system',
    createdAt: PAST,
    updatedAt: PAST,
  }
}

/** Writes the shared fixture with rules disabled, the way trusted Admin code would. */
export async function seedWorkspace(env: RulesTestEnvironment): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore() as unknown as Firestore
    const ws = `workspaces/${WORKSPACE_ID}`
    const writes: [string, object][] = [
      [`users/${OWNER.uid}`, profile(OWNER)],
      [`users/${MEMBER.uid}`, profile(MEMBER)],
      [`users/${MANAGER.uid}`, profile(MANAGER)],
      [`users/${NON_MEMBER.uid}`, profile(NON_MEMBER)],
      [ws, { name: 'Main', ownerUid: OWNER.uid, weekStartsOn: 1, createdAt: PAST, updatedAt: PAST }],
      [`${ws}/members/${OWNER.uid}`, membership(OWNER, 'owner')],
      [`${ws}/members/${MEMBER.uid}`, membership(MEMBER, 'member')],
      [`${ws}/members/${MANAGER.uid}`, membership(MANAGER, 'manager')],
      [`${ws}/members/${OTHER_MEMBER.uid}`, membership(OTHER_MEMBER, 'member')],
      [`${ws}/members/${REMOVED_MEMBER.uid}`, membership(REMOVED_MEMBER, 'member', 'removed')],
      [`${ws}/clients/${CLIENT_ID}`, { name: 'Acme', archived: false, createdAt: PAST, updatedAt: PAST }],
      [
        `${ws}/projects/${PROJECT_ID_IN_WORKSPACE}`,
        {
          name: 'Website',
          clientId: CLIENT_ID,
          description: '',
          color: '#2e7d32',
          estimateMinutes: 600,
          archived: false,
          createdAt: PAST,
          updatedAt: PAST,
        },
      ],
      [
        `${ws}/tasks/${TASK_ID}`,
        {
          name: 'Build',
          projectId: PROJECT_ID_IN_WORKSPACE,
          estimateMinutes: null,
          archived: false,
          createdAt: PAST,
          updatedAt: PAST,
        },
      ],
      [`${ws}/timeEntries/${MEMBER_ENTRY_ID}`, completedEntry(MEMBER.uid, 'alice', 8)],
      [`${ws}/timeEntries/${OTHER_MEMBER_ENTRY_ID}`, completedEntry(OTHER_MEMBER.uid, 'dave', 10)],
      [`${ws}/timeEntries/${OWNER_ENTRY_ID}`, completedEntry(OWNER.uid, 'owner', 12)],
      [`${ws}/timeEntries/${MANAGER_ENTRY_ID}`, completedEntry(MANAGER.uid, 'mira', 14)],
      ...[OWNER, MEMBER, MANAGER, OTHER_MEMBER, REMOVED_MEMBER].map((user): [string, object] => [
        `${ws}/budgets/${budgetId(user.uid)}`,
        budgetFixture(user.uid),
      ]),
      [
        `${ws}/leaveTypes/holiday`,
        {
          name: 'Holiday',
          color: '#2e7d6b',
          unit: 'half-day',
          requiresApproval: true,
          defaultAllowanceDays: 20,
          archived: false,
          createdAt: PAST,
          updatedAt: PAST,
        },
      ],
      ...[OWNER, MEMBER, MANAGER, OTHER_MEMBER, REMOVED_MEMBER].flatMap((user): [string, object][] => [
        [`${ws}/leaveRequests/${leaveRequestId(user.uid)}`, leaveRequestFixture(user.uid)],
        [`${ws}/leaveAllowances/${leaveAllowanceId(user.uid)}`, leaveAllowanceFixture(user.uid)],
      ]),
      [
        `${ws}/invitations/${INVITATION_ID}`,
        {
          email: INVITEE.email,
          role: 'member',
          tokenHash: '0'.repeat(64),
          expiresAt: Timestamp.fromDate(new Date('2099-01-01T00:00:00Z')),
          status: 'pending',
          createdBy: OWNER.uid,
          createdAt: PAST,
        },
      ],
      [
        `workspaces/${OTHER_WORKSPACE_ID}`,
        { name: 'Other', ownerUid: NON_MEMBER.uid, weekStartsOn: 1, createdAt: PAST, updatedAt: PAST },
      ],
      [`workspaces/${OTHER_WORKSPACE_ID}/members/${NON_MEMBER.uid}`, membership(NON_MEMBER, 'owner')],
      [
        `workspaces/${OTHER_WORKSPACE_ID}/clients/client-other`,
        { name: 'Other client', archived: false, createdAt: PAST, updatedAt: PAST },
      ],
      [`workspaces/${OTHER_WORKSPACE_ID}/timeEntries/entry-bob`, completedEntry(NON_MEMBER.uid, 'bob', 8)],
    ]
    for (const [path, data] of writes) await setDoc(doc(db, path), data)
  })
}
