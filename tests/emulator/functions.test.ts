// Exercises the callables in functions/src/index.ts through the Functions emulator.
import { createHash } from 'node:crypto'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, query, where, type Firestore } from 'firebase/firestore'
import { connectFunctionsEmulator, FunctionsError, getFunctions, httpsCallable } from 'firebase/functions'
import { getApps as getAdminApps, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore, Timestamp } from 'firebase-admin/firestore'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestEnvironment, emulatorOrigin, PROJECT_ID } from './setup'

const PASSWORD = 'correct-horse-battery'
const VALID_TOKEN = 'a'.repeat(43)

type TestUser = {
  uid: string
  email: string
  call: <T = Record<string, unknown>>(name: string, data: unknown) => Promise<T>
}

let env: RulesTestEnvironment
let authEmulator: string
let functionsEmulator: { host: string; port: number }
const clientApps: FirebaseApp[] = []
const admin = initializeAdminAppOnce()
const adminDb = getAdminFirestore(admin)

function initializeAdminAppOnce() {
  return getAdminApps()[0] ?? initializeAdminApp({ projectId: PROJECT_ID })
}

beforeAll(async () => {
  env = await createTestEnvironment()
  const auth = await emulatorOrigin('auth')
  authEmulator = `http://${auth.host}:${auth.port}`
  functionsEmulator = await emulatorOrigin('functions')
})

beforeEach(async () => {
  await env.clearFirestore()
  await fetch(`${authEmulator}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' })
})

afterEach(async () => {
  await Promise.all(clientApps.splice(0).map((app) => deleteApp(app)))
})

afterAll(async () => {
  await env?.cleanup()
})

/** Creates an Auth emulator account and returns a signed-in callable client for it. */
async function createUser(uid: string, email: string, emailVerified = true): Promise<TestUser> {
  await getAdminAuth(admin).createUser({ uid, email, password: PASSWORD, emailVerified })
  const app = initializeApp(
    { apiKey: 'demo-api-key', projectId: PROJECT_ID, appId: 'demo-app-id' },
    `${uid}-${Date.now()}`,
  )
  clientApps.push(app)
  const auth = getAuth(app)
  connectAuthEmulator(auth, authEmulator, { disableWarnings: true })
  await signInWithEmailAndPassword(auth, email, PASSWORD)
  const functions = getFunctions(app, 'europe-west1')
  connectFunctionsEmulator(functions, functionsEmulator.host, functionsEmulator.port)
  return {
    uid,
    email,
    call: async <T>(name: string, data: unknown) => (await httpsCallable<unknown, T>(functions, name)(data)).data,
  }
}

function anonymousCall(name: string, data: unknown) {
  const app = initializeApp(
    { apiKey: 'demo-api-key', projectId: PROJECT_ID, appId: 'demo-app-id' },
    `anonymous-${Date.now()}`,
  )
  clientApps.push(app)
  const functions = getFunctions(app, 'europe-west1')
  connectFunctionsEmulator(functions, functionsEmulator.host, functionsEmulator.port)
  return httpsCallable(functions, name)(data)
}

async function expectCallError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  )
  expect(error, `expected functions/${code}`).toBeInstanceOf(FunctionsError)
  expect((error as FunctionsError).code).toBe(`functions/${code}`)
}

function rulesFirestore(user: { uid: string; email: string }): Firestore {
  return env
    .authenticatedContext(user.uid, { email: user.email, email_verified: true })
    .firestore() as unknown as Firestore
}

async function createWorkspaceAs(owner: TestUser): Promise<string> {
  const { workspaceId } = await owner.call<{ workspaceId: string }>('createWorkspace', {
    name: 'Studio',
    timezone: 'Europe/Warsaw',
    displayName: 'Olivia',
  })
  return workspaceId
}

async function inviteAndAccept(owner: TestUser, workspaceId: string, member: TestUser) {
  const invitation = await owner.call<{ invitationId: string; token: string }>('createWorkspaceInvitation', {
    workspaceId,
    email: member.email,
  })
  await member.call('acceptWorkspaceInvitation', {
    workspaceId,
    invitationId: invitation.invitationId,
    token: invitation.token,
    timezone: 'UTC',
    displayName: 'Alice',
  })
  return invitation
}

/** Seeds an invitation directly, so tests can control its token, status, and expiry. */
async function seedInvitation(workspaceId: string, email: string, overrides: Record<string, unknown> = {}) {
  const ref = adminDb.collection('workspaces').doc(workspaceId).collection('invitations').doc()
  await ref.set({
    email,
    role: 'member',
    tokenHash: createHash('sha256').update(VALID_TOKEN).digest('hex'),
    expiresAt: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
    status: 'pending',
    createdBy: 'seed',
    createdAt: Timestamp.now(),
    ...overrides,
  })
  return ref.id
}

function acceptInput(workspaceId: string, invitationId: string, token = VALID_TOKEN) {
  return { workspaceId, invitationId, token, timezone: 'UTC', displayName: 'Alice' }
}

describe('createWorkspace', () => {
  it('creates the workspace, the owner membership, and the profile', async () => {
    const owner = await createUser('owner', 'Owner@Example.com')
    const workspaceId = await createWorkspaceAs(owner)

    const workspace = await adminDb.doc(`workspaces/${workspaceId}`).get()
    expect(workspace.data()).toMatchObject({ name: 'Studio', ownerUid: 'owner', weekStartsOn: 1 })
    const membership = await adminDb.doc(`workspaces/${workspaceId}/members/owner`).get()
    expect(membership.data()).toMatchObject({
      uid: 'owner',
      email: 'owner@example.com',
      role: 'owner',
      status: 'active',
      timezone: 'Europe/Warsaw',
    })
    const profile = await adminDb.doc('users/owner').get()
    expect(profile.data()).toMatchObject({
      displayName: 'Olivia',
      email: 'owner@example.com',
      timezone: 'Europe/Warsaw',
    })
  })

  it('stores a Sunday week start when the owner picks it', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const { workspaceId } = await owner.call<{ workspaceId: string }>('createWorkspace', {
      name: 'Studio',
      timezone: 'UTC',
      displayName: '',
      weekStartsOn: 0,
    })
    const workspace = await adminDb.doc(`workspaces/${workspaceId}`).get()
    expect(workspace.data()).toMatchObject({ weekStartsOn: 0 })
  })

  it('requires a signed-in user', async () => {
    await expectCallError(
      anonymousCall('createWorkspace', { name: 'Studio', timezone: 'UTC', displayName: '' }),
      'unauthenticated',
    )
  })

  it.each([
    ['an empty name', { name: '   ', timezone: 'UTC', displayName: '' }],
    ['an oversized name', { name: 'a'.repeat(81), timezone: 'UTC', displayName: '' }],
    ['an unknown time zone', { name: 'Studio', timezone: 'Mars/Olympus', displayName: '' }],
    ['an oversized display name', { name: 'Studio', timezone: 'UTC', displayName: 'a'.repeat(81) }],
    ['a Saturday week start', { name: 'Studio', timezone: 'UTC', displayName: '', weekStartsOn: 6 }],
    ['a week start that is not a number', { name: 'Studio', timezone: 'UTC', displayName: '', weekStartsOn: '1' }],
    ['a null week start', { name: 'Studio', timezone: 'UTC', displayName: '', weekStartsOn: null }],
    ['a body that is not an object', ['Studio']],
  ])('rejects %s', async (_, data) => {
    const owner = await createUser('owner', 'owner@example.com')
    await expectCallError(owner.call('createWorkspace', data), 'invalid-argument')
  })
})

describe('createWorkspaceInvitation and revokeWorkspaceInvitation', () => {
  it('lets only an active owner invite, and refuses duplicates', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const member = await createUser('alice', 'alice@example.com')
    const workspaceId = await createWorkspaceAs(owner)

    await expectCallError(
      member.call('createWorkspaceInvitation', { workspaceId, email: 'new@example.com' }),
      'permission-denied',
    )

    const invitation = await owner.call<{ invitationId: string; token: string; expiresAt: number }>(
      'createWorkspaceInvitation',
      { workspaceId, email: 'New@Example.com' },
    )
    expect(invitation.token.length).toBeGreaterThanOrEqual(43)
    expect(invitation.expiresAt).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000)
    const stored = await adminDb.doc(`workspaces/${workspaceId}/invitations/${invitation.invitationId}`).get()
    expect(stored.data()).toMatchObject({
      email: 'new@example.com',
      role: 'member',
      status: 'pending',
      createdBy: 'owner',
    })
    expect(stored.data()?.tokenHash).toBe(createHash('sha256').update(invitation.token).digest('hex'))
    expect(JSON.stringify(stored.data())).not.toContain(invitation.token)

    await expectCallError(
      owner.call('createWorkspaceInvitation', { workspaceId, email: 'new@example.com' }),
      'already-exists',
    )
    await expectCallError(
      owner.call('createWorkspaceInvitation', { workspaceId, email: 'owner@example.com' }),
      'already-exists',
    )
    await expectCallError(
      owner.call('createWorkspaceInvitation', { workspaceId, email: 'not-an-email' }),
      'invalid-argument',
    )
  })

  it('lets only an active owner revoke, and only pending invitations', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const invitee = await createUser('alice', 'alice@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    const invitation = await owner.call<{ invitationId: string; token: string }>('createWorkspaceInvitation', {
      workspaceId,
      email: invitee.email,
    })

    await expectCallError(
      invitee.call('revokeWorkspaceInvitation', { workspaceId, invitationId: invitation.invitationId }),
      'permission-denied',
    )
    await owner.call('revokeWorkspaceInvitation', { workspaceId, invitationId: invitation.invitationId })
    const stored = await adminDb.doc(`workspaces/${workspaceId}/invitations/${invitation.invitationId}`).get()
    expect(stored.data()?.status).toBe('revoked')

    await expectCallError(
      owner.call('revokeWorkspaceInvitation', { workspaceId, invitationId: invitation.invitationId }),
      'failed-precondition',
    )
    await expectCallError(
      invitee.call('acceptWorkspaceInvitation', {
        workspaceId,
        invitationId: invitation.invitationId,
        token: invitation.token,
        timezone: 'UTC',
        displayName: '',
      }),
      'failed-precondition',
    )
  })
})

describe('acceptWorkspaceInvitation', () => {
  it('adds the invitee as a member and marks the invitation accepted', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const member = await createUser('alice', 'alice@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    const invitation = await inviteAndAccept(owner, workspaceId, member)

    const membership = await adminDb.doc(`workspaces/${workspaceId}/members/alice`).get()
    expect(membership.data()).toMatchObject({
      uid: 'alice',
      email: 'alice@example.com',
      role: 'member',
      status: 'active',
      timezone: 'UTC',
    })
    const stored = await adminDb.doc(`workspaces/${workspaceId}/invitations/${invitation.invitationId}`).get()
    expect(stored.data()).toMatchObject({ status: 'accepted', acceptedBy: 'alice' })
    await assertSucceeds(getDoc(doc(rulesFirestore(member), 'workspaces', workspaceId)))
  })

  it('denies accepting the same invitation twice', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const member = await createUser('alice', 'alice@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    const invitation = await inviteAndAccept(owner, workspaceId, member)

    await expectCallError(
      member.call('acceptWorkspaceInvitation', {
        workspaceId,
        invitationId: invitation.invitationId,
        token: invitation.token,
        timezone: 'UTC',
        displayName: 'Alice',
      }),
      'already-exists',
    )
  })

  it('denies an invitation that is no longer pending', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    const invitationId = await seedInvitation(workspaceId, 'alice@example.com', { status: 'accepted' })
    const member = await createUser('alice', 'alice@example.com')

    await expectCallError(
      member.call('acceptWorkspaceInvitation', acceptInput(workspaceId, invitationId)),
      'failed-precondition',
    )
  })

  it('denies an expired invitation', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    const invitationId = await seedInvitation(workspaceId, 'alice@example.com', {
      expiresAt: Timestamp.fromMillis(Date.now() - 1000),
    })
    const member = await createUser('alice', 'alice@example.com')

    await expectCallError(
      member.call('acceptWorkspaceInvitation', acceptInput(workspaceId, invitationId)),
      'failed-precondition',
    )
    expect((await adminDb.doc(`workspaces/${workspaceId}/members/alice`).get()).exists).toBe(false)
  })

  it('denies an invitation addressed to another email', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    const invitationId = await seedInvitation(workspaceId, 'someone-else@example.com')
    const member = await createUser('alice', 'alice@example.com')

    await expectCallError(
      member.call('acceptWorkspaceInvitation', acceptInput(workspaceId, invitationId)),
      'failed-precondition',
    )
  })

  it('denies a wrong token', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    const invitationId = await seedInvitation(workspaceId, 'alice@example.com')
    const member = await createUser('alice', 'alice@example.com')

    await expectCallError(
      member.call('acceptWorkspaceInvitation', acceptInput(workspaceId, invitationId, 'b'.repeat(43))),
      'failed-precondition',
    )
    await expectCallError(
      member.call('acceptWorkspaceInvitation', acceptInput(workspaceId, invitationId, 'short')),
      'invalid-argument',
    )
  })

  it('requires a verified email', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    const invitationId = await seedInvitation(workspaceId, 'alice@example.com')
    const member = await createUser('alice', 'alice@example.com', false)

    await expectCallError(
      member.call('acceptWorkspaceInvitation', acceptInput(workspaceId, invitationId)),
      'failed-precondition',
    )
  })

  it('reports a missing invitation as not found', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    const member = await createUser('alice', 'alice@example.com')

    await expectCallError(member.call('acceptWorkspaceInvitation', acceptInput(workspaceId, 'missing')), 'not-found')
  })
})

describe('removeWorkspaceMember', () => {
  it('denies the owner removing themselves', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const workspaceId = await createWorkspaceAs(owner)

    await expectCallError(
      owner.call('removeWorkspaceMember', { workspaceId, memberUid: owner.uid }),
      'failed-precondition',
    )
    expect((await adminDb.doc(`workspaces/${workspaceId}/members/owner`).get()).data()?.status).toBe('active')
  })

  it('denies removing another owner', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    await adminDb.doc(`workspaces/${workspaceId}/members/co-owner`).set({
      uid: 'co-owner',
      email: 'co@example.com',
      displayName: 'Co',
      role: 'owner',
      status: 'active',
      joinedAt: Timestamp.now(),
    })

    await expectCallError(owner.call('removeWorkspaceMember', { workspaceId, memberUid: 'co-owner' }), 'not-found')
  })

  it('denies a member removing someone', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const member = await createUser('alice', 'alice@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    await inviteAndAccept(owner, workspaceId, member)

    await expectCallError(
      member.call('removeWorkspaceMember', { workspaceId, memberUid: owner.uid }),
      'permission-denied',
    )
  })

  it("revokes the member's access, stops their timer, and keeps their history for the owner", async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const member = await createUser('alice', 'alice@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    await inviteAndAccept(owner, workspaceId, member)
    const workspacePath = `workspaces/${workspaceId}`

    // The member logs a completed entry through the callable, as the app does, and has a timer running.
    const manualEntry = (description: string, hoursAgo: number) => ({
      workspaceId,
      entryId: null,
      description,
      clientId: null,
      projectId: null,
      taskId: null,
      billable: false,
      startAt: Date.now() - (hoursAgo + 1) * 60 * 60 * 1000,
      endAt: Date.now() - hoursAgo * 60 * 60 * 1000,
    })
    const { entryId: historyId } = await member.call<{ entryId: string }>(
      'saveManualTimeEntry',
      manualEntry('Before removal', 2),
    )
    const memberDb = rulesFirestore(member)
    await adminDb.doc(`${workspacePath}/timeEntries/running`).set({
      userId: member.uid,
      userDisplayName: 'Alice',
      description: 'Running',
      clientName: null,
      projectName: null,
      taskName: null,
      billable: false,
      startAt: Timestamp.now(),
      endAt: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
    await adminDb
      .doc(`${workspacePath}/activeTimers/${member.uid}`)
      .set({ entryId: 'running', startAt: Timestamp.now() })

    await owner.call('removeWorkspaceMember', { workspaceId, memberUid: member.uid })

    const membership = await adminDb.doc(`${workspacePath}/members/${member.uid}`).get()
    expect(membership.data()).toMatchObject({ uid: member.uid, email: member.email, status: 'removed' })
    expect((await adminDb.doc(`${workspacePath}/activeTimers/${member.uid}`).get()).exists).toBe(false)
    expect((await adminDb.doc(`${workspacePath}/timeEntries/running`).get()).data()?.endAt).toBeInstanceOf(Timestamp)

    // The former member loses reads and writes.
    await assertFails(getDoc(doc(memberDb, workspacePath)))
    await assertFails(
      getDocs(query(collection(memberDb, workspacePath, 'timeEntries'), where('userId', '==', member.uid))),
    )
    await assertFails(getDoc(doc(memberDb, workspacePath, 'timeEntries', historyId)))
    await expectCallError(member.call('saveManualTimeEntry', manualEntry('After removal', 4)), 'permission-denied')

    // The owner keeps the membership identity and the historical entries.
    const ownerDb = rulesFirestore(owner)
    await assertSucceeds(getDoc(doc(ownerDb, workspacePath, 'members', member.uid)))
    const history = await assertSucceeds(
      getDocs(query(collection(ownerDb, workspacePath, 'timeEntries'), where('userId', '==', member.uid))),
    )
    expect(history.docs.map((entry) => entry.id).sort()).toEqual([historyId, 'running'].sort())

    // A new invitation can bring them back.
    await inviteAndAccept(owner, workspaceId, member)
    await assertSucceeds(getDoc(doc(memberDb, workspacePath)))
  })
})

describe('setWorkspaceMemberRole', () => {
  async function workspaceWithManager() {
    const owner = await createUser('owner', 'owner@example.com')
    const manager = await createUser('mira', 'mira@example.com')
    const member = await createUser('alice', 'alice@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    await inviteAndAccept(owner, workspaceId, manager)
    await inviteAndAccept(owner, workspaceId, member)
    await owner.call('setWorkspaceMemberRole', { workspaceId, memberUid: manager.uid, role: 'manager' })
    return { owner, manager, member, workspaceId }
  }

  it('lets the owner promote a member to manager and demote them back', async () => {
    const { owner, manager, workspaceId } = await workspaceWithManager()
    const memberPath = `workspaces/${workspaceId}/members/${manager.uid}`
    expect((await adminDb.doc(memberPath).get()).data()?.role).toBe('manager')

    await owner.call('setWorkspaceMemberRole', { workspaceId, memberUid: manager.uid, role: 'member' })
    expect((await adminDb.doc(memberPath).get()).data()?.role).toBe('member')
  })

  it('gives managers every workspace entry while members keep only their own', async () => {
    const { manager, member, workspaceId } = await workspaceWithManager()
    const entriesPath = `workspaces/${workspaceId}/timeEntries`
    await member.call('saveManualTimeEntry', {
      workspaceId,
      entryId: null,
      description: 'Member work',
      clientId: null,
      projectId: null,
      taskId: null,
      billable: false,
      startAt: Date.now() - 2 * 60 * 60 * 1000,
      endAt: Date.now() - 60 * 60 * 1000,
    })

    const all = await assertSucceeds(getDocs(collection(rulesFirestore(manager), entriesPath)))
    expect(all.docs.map((entry) => entry.data().userId)).toContain(member.uid)
    await assertFails(getDocs(collection(rulesFirestore(member), entriesPath)))
  })

  it('denies role changes from members and managers', async () => {
    const { owner, manager, member, workspaceId } = await workspaceWithManager()

    await expectCallError(
      member.call('setWorkspaceMemberRole', { workspaceId, memberUid: member.uid, role: 'manager' }),
      'permission-denied',
    )
    await expectCallError(
      manager.call('setWorkspaceMemberRole', { workspaceId, memberUid: member.uid, role: 'manager' }),
      'permission-denied',
    )
    await expectCallError(
      manager.call('setWorkspaceMemberRole', { workspaceId, memberUid: owner.uid, role: 'member' }),
      'permission-denied',
    )
    expect((await adminDb.doc(`workspaces/${workspaceId}/members/${member.uid}`).get()).data()?.role).toBe('member')
  })

  it('keeps managers out of invitations and member removal', async () => {
    const { manager, member, workspaceId } = await workspaceWithManager()

    await expectCallError(
      manager.call('createWorkspaceInvitation', { workspaceId, email: 'new@example.com' }),
      'permission-denied',
    )
    await expectCallError(
      manager.call('removeWorkspaceMember', { workspaceId, memberUid: member.uid }),
      'permission-denied',
    )
  })

  it("denies changing the owner's role, assigning owner, and changing a removed member", async () => {
    const { owner, manager, member, workspaceId } = await workspaceWithManager()

    await expectCallError(
      owner.call('setWorkspaceMemberRole', { workspaceId, memberUid: owner.uid, role: 'member' }),
      'failed-precondition',
    )
    await expectCallError(
      owner.call('setWorkspaceMemberRole', { workspaceId, memberUid: member.uid, role: 'owner' }),
      'invalid-argument',
    )

    await owner.call('removeWorkspaceMember', { workspaceId, memberUid: manager.uid })
    expect((await adminDb.doc(`workspaces/${workspaceId}/members/${manager.uid}`).get()).data()?.status).toBe('removed')
    await expectCallError(
      owner.call('setWorkspaceMemberRole', { workspaceId, memberUid: manager.uid, role: 'manager' }),
      'not-found',
    )
  })
})

describe('budget callables', () => {
  const WEEKDAY_MINUTES = { mon: 480, tue: 240, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 }

  async function workspaceWithCatalog() {
    const owner = await createUser('owner', 'owner@example.com')
    const manager = await createUser('mira', 'mira@example.com')
    const member = await createUser('alice', 'alice@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    await inviteAndAccept(owner, workspaceId, manager)
    await inviteAndAccept(owner, workspaceId, member)
    await owner.call('setWorkspaceMemberRole', { workspaceId, memberUid: manager.uid, role: 'manager' })
    const workspacePath = `workspaces/${workspaceId}`
    const catalogItem = { archived: false, createdAt: Timestamp.now(), updatedAt: Timestamp.now() }
    await adminDb.doc(`${workspacePath}/clients/acme`).set({ ...catalogItem, name: 'Acme' })
    await adminDb.doc(`${workspacePath}/clients/old-client`).set({ ...catalogItem, name: 'Old', archived: true })
    await adminDb.doc(`${workspacePath}/projects/site`).set({
      ...catalogItem,
      name: 'Website',
      clientId: 'acme',
      description: '',
      color: '#2e7d32',
      estimateMinutes: null,
    })
    return { owner, manager, member, workspaceId, workspacePath }
  }

  function budgetPayload(workspaceId: string, userId: string, overrides: Record<string, unknown> = {}) {
    return {
      workspaceId,
      budgetId: null,
      userId,
      target: { type: 'project', id: 'site' },
      startDay: '2026-11-02',
      endDay: '2026-12-21',
      weekdayMinutes: WEEKDAY_MINUTES,
      exceptions: [],
      ...overrides,
    }
  }

  it('lets owners and managers create, edit, archive, and delete any budget, including their own', async () => {
    const { owner, manager, member, workspaceId, workspacePath } = await workspaceWithCatalog()

    const { budgetId } = await manager.call<{ budgetId: string }>(
      'saveBudget',
      budgetPayload(workspaceId, member.uid, { exceptions: ['2026-12-07', '2026-11-09', '2026-12-07'] }),
    )
    const stored = (await adminDb.doc(`${workspacePath}/budgets/${budgetId}`).get()).data()
    expect(stored).toMatchObject({
      userId: member.uid,
      userDisplayName: 'Alice',
      target: { type: 'project', id: 'site', name: 'Website' },
      startDay: '2026-11-02',
      endDay: '2026-12-21',
      weekdayMinutes: WEEKDAY_MINUTES,
      exceptions: ['2026-11-09', '2026-12-07'],
      archived: false,
      createdBy: manager.uid,
    })

    await owner.call(
      'saveBudget',
      budgetPayload(workspaceId, member.uid, { budgetId, target: { type: 'client', id: 'acme' } }),
    )
    expect((await adminDb.doc(`${workspacePath}/budgets/${budgetId}`).get()).data()?.target).toEqual({
      type: 'client',
      id: 'acme',
      name: 'Acme',
    })

    await manager.call('saveBudget', budgetPayload(workspaceId, manager.uid))
    await manager.call('saveBudget', budgetPayload(workspaceId, owner.uid))
    await owner.call('saveBudget', budgetPayload(workspaceId, owner.uid))

    await expectCallError(manager.call('deleteBudget', { workspaceId, budgetId }), 'failed-precondition')
    await manager.call('setBudgetArchived', { workspaceId, budgetId, archived: true })
    await expectCallError(
      owner.call('saveBudget', budgetPayload(workspaceId, member.uid, { budgetId })),
      'failed-precondition',
    )
    await owner.call('setBudgetArchived', { workspaceId, budgetId, archived: false })
    await owner.call('setBudgetArchived', { workspaceId, budgetId, archived: true })
    await manager.call('deleteBudget', { workspaceId, budgetId })
    expect((await adminDb.doc(`${workspacePath}/budgets/${budgetId}`).get()).exists).toBe(false)
  })

  it('denies budget writes from members and lets them read only their own budgets', async () => {
    const { owner, member, workspaceId, workspacePath } = await workspaceWithCatalog()
    const { budgetId } = await owner.call<{ budgetId: string }>('saveBudget', budgetPayload(workspaceId, member.uid))
    const { budgetId: ownerBudgetId } = await owner.call<{ budgetId: string }>(
      'saveBudget',
      budgetPayload(workspaceId, owner.uid),
    )

    await expectCallError(member.call('saveBudget', budgetPayload(workspaceId, member.uid)), 'permission-denied')
    await expectCallError(
      member.call('saveBudget', budgetPayload(workspaceId, member.uid, { budgetId })),
      'permission-denied',
    )
    await expectCallError(
      member.call('setBudgetArchived', { workspaceId, budgetId, archived: true }),
      'permission-denied',
    )
    await expectCallError(member.call('deleteBudget', { workspaceId, budgetId }), 'permission-denied')

    const memberDb = rulesFirestore(member)
    await assertSucceeds(
      getDocs(query(collection(memberDb, workspacePath, 'budgets'), where('userId', '==', member.uid))),
    )
    await assertFails(getDoc(doc(memberDb, workspacePath, 'budgets', ownerBudgetId)))
    await assertFails(getDocs(collection(memberDb, workspacePath, 'budgets')))
  })

  it('rejects invalid payloads', async () => {
    const { owner, member, workspaceId } = await workspaceWithCatalog()
    const outsider = await createUser('bob', 'bob@example.com')
    const zeroMinutes = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 }
    const invalid: [Record<string, unknown>, string][] = [
      [{ startDay: '2026-12-21', endDay: '2026-11-02' }, 'invalid-argument'],
      [{ startDay: '2026-02-30' }, 'invalid-argument'],
      [{ startDay: '2026-01-01', endDay: '2028-01-02' }, 'invalid-argument'],
      [{ weekdayMinutes: zeroMinutes }, 'invalid-argument'],
      [{ weekdayMinutes: { ...WEEKDAY_MINUTES, mon: 1441 } }, 'invalid-argument'],
      [{ weekdayMinutes: { ...WEEKDAY_MINUTES, holiday: 60 } }, 'invalid-argument'],
      [{ exceptions: ['2026-11-01'] }, 'invalid-argument'],
      [{ target: { type: 'task', id: 'site' } }, 'invalid-argument'],
      [{ target: { type: 'project', id: 'missing' } }, 'failed-precondition'],
      [{ target: { type: 'client', id: 'site' } }, 'failed-precondition'],
      [{ target: { type: 'client', id: 'old-client' } }, 'failed-precondition'],
      [{ userId: outsider.uid }, 'failed-precondition'],
    ]
    for (const [overrides, code] of invalid) {
      await expectCallError(owner.call('saveBudget', budgetPayload(workspaceId, member.uid, overrides)), code)
    }
    // The longest allowed range is 731 days, inclusive.
    await owner.call(
      'saveBudget',
      budgetPayload(workspaceId, member.uid, { startDay: '2026-01-01', endDay: '2028-01-01' }),
    )
  })

  it('keeps budgets of removed members and archived targets editable but not reassignable to them', async () => {
    const { owner, manager, member, workspaceId, workspacePath } = await workspaceWithCatalog()
    const { budgetId } = await owner.call<{ budgetId: string }>('saveBudget', budgetPayload(workspaceId, member.uid))
    await owner.call('removeWorkspaceMember', { workspaceId, memberUid: member.uid })
    await adminDb.doc(`${workspacePath}/projects/site`).update({ archived: true })

    await manager.call('saveBudget', budgetPayload(workspaceId, member.uid, { budgetId, endDay: '2026-11-30' }))
    const stored = (await adminDb.doc(`${workspacePath}/budgets/${budgetId}`).get()).data()
    expect(stored).toMatchObject({ endDay: '2026-11-30', userDisplayName: 'Alice', target: { name: 'Website' } })

    await expectCallError(owner.call('saveBudget', budgetPayload(workspaceId, member.uid)), 'failed-precondition')
    await expectCallError(
      owner.call('saveBudget', budgetPayload(workspaceId, manager.uid, { target: { type: 'project', id: 'site' } })),
      'failed-precondition',
    )
    const { budgetId: otherId } = await owner.call<{ budgetId: string }>(
      'saveBudget',
      budgetPayload(workspaceId, manager.uid, { target: { type: 'client', id: 'acme' } }),
    )
    await expectCallError(
      owner.call(
        'saveBudget',
        budgetPayload(workspaceId, member.uid, { budgetId: otherId, target: { type: 'client', id: 'acme' } }),
      ),
      'failed-precondition',
    )
  })
})

describe('time-off callables', () => {
  // 2030-03-04 and 2030-03-11 are Mondays; dates in 2030 are in the future, so approved leave there has not started.
  async function workspaceWithTeam() {
    const owner = await createUser('owner', 'owner@example.com')
    const manager = await createUser('mira', 'mira@example.com')
    const member = await createUser('alice', 'alice@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    await inviteAndAccept(owner, workspaceId, manager)
    await inviteAndAccept(owner, workspaceId, member)
    await owner.call('setWorkspaceMemberRole', { workspaceId, memberUid: manager.uid, role: 'manager' })
    return { owner, manager, member, workspaceId, workspacePath: `workspaces/${workspaceId}` }
  }

  function leavePayload(workspaceId: string, overrides: Record<string, unknown> = {}) {
    return {
      workspaceId,
      typeId: 'holiday',
      startDate: '2030-03-04',
      endDate: '2030-03-08',
      startHalf: false,
      endHalf: false,
      note: 'Skiing',
      ...overrides,
    }
  }

  function typePayload(workspaceId: string, overrides: Record<string, unknown> = {}) {
    return {
      workspaceId,
      typeId: null,
      name: 'Unpaid',
      color: '#123456',
      unit: 'day',
      requiresApproval: true,
      defaultAllowanceDays: null,
      archived: false,
      ...overrides,
    }
  }

  type Submitted = { requestId: string; status: string }

  // A free Monday, after the request each test starts with.
  const MAY_SIXTH = { startDate: '2030-05-06', endDate: '2030-05-06' }

  async function storedRequest(workspacePath: string, requestId: string) {
    return (await adminDb.doc(`${workspacePath}/leaveRequests/${requestId}`).get()).data()
  }

  it('submits a request against the built-in Holiday type, counting working days only', async () => {
    const { member, workspaceId, workspacePath } = await workspaceWithTeam()
    const { requestId, status } = await member.call<Submitted>(
      'submitLeaveRequest',
      leavePayload(workspaceId, { endDate: '2030-03-11', endHalf: true }),
    )
    expect(status).toBe('pending')
    expect(await storedRequest(workspacePath, requestId)).toMatchObject({
      uid: member.uid,
      userDisplayName: 'Alice',
      typeId: 'holiday',
      year: 2030,
      days: 5.5,
      note: 'Skiing',
      status: 'pending',
      overAllowance: false,
      overAllowanceDays: 0,
      autoApproved: false,
      decidedBy: null,
    })
  })

  it('rejects overlaps, impossible ranges, unknown types, and half days on full-day types', async () => {
    const { owner, member, workspaceId } = await workspaceWithTeam()
    await member.call('submitLeaveRequest', leavePayload(workspaceId))
    await expectCallError(
      member.call('submitLeaveRequest', leavePayload(workspaceId, { typeId: 'sick', startDate: '2030-03-08' })),
      'failed-precondition',
    )
    const invalid: Record<string, unknown>[] = [
      { startDate: '2030-04-02', endDate: '2030-04-01' },
      { startDate: '2030-02-30' },
      { startDate: '2030-12-30', endDate: '2031-01-02' },
      { startDate: '2030-03-09', endDate: '2030-03-10' },
      { startHalf: 'yes' },
    ]
    for (const overrides of invalid) {
      const payload = leavePayload(workspaceId, { startDate: '2030-04-01', endDate: '2030-04-02', ...overrides })
      await expectCallError(member.call('submitLeaveRequest', payload), 'invalid-argument')
    }
    const { typeId: unpaidId } = await owner.call<{ typeId: string }>('saveLeaveType', typePayload(workspaceId))
    await expectCallError(
      member.call(
        'submitLeaveRequest',
        leavePayload(workspaceId, {
          typeId: unpaidId,
          startDate: '2030-05-06',
          endDate: '2030-05-06',
          startHalf: true,
        }),
      ),
      'invalid-argument',
    )
    await expectCallError(
      member.call('submitLeaveRequest', leavePayload(workspaceId, { typeId: 'missing', ...MAY_SIXTH })),
      'failed-precondition',
    )
    await owner.call('saveLeaveType', typePayload(workspaceId, { typeId: unpaidId, archived: true }))
    await expectCallError(
      member.call('submitLeaveRequest', leavePayload(workspaceId, { typeId: unpaidId, ...MAY_SIXTH })),
      'failed-precondition',
    )
  })

  it('marks requests over the allowance without blocking them, and re-checks on approval', async () => {
    const { manager, member, workspaceId, workspacePath } = await workspaceWithTeam()
    const target = { workspaceId, uid: member.uid, typeId: 'holiday', year: 2030 }
    await manager.call('setLeaveAllowance', { ...target, allowanceDays: 3 })
    const first = await member.call<Submitted>('submitLeaveRequest', leavePayload(workspaceId))
    expect(await storedRequest(workspacePath, first.requestId)).toMatchObject({
      status: 'pending',
      overAllowance: true,
      overAllowanceDays: 2,
    })
    await manager.call('addLeaveAdjustment', { ...target, days: 2, note: 'Carry-over' })
    await manager.call('decideLeaveRequest', { workspaceId, requestId: first.requestId, decision: 'approve', note: '' })
    expect(await storedRequest(workspacePath, first.requestId)).toMatchObject({
      status: 'approved',
      overAllowance: false,
      overAllowanceDays: 0,
      decidedBy: manager.uid,
    })
  })

  it('lets owners and managers decide other people’s requests, never their own', async () => {
    const { owner, manager, member, workspaceId, workspacePath } = await workspaceWithTeam()
    const memberRequest = await member.call<Submitted>('submitLeaveRequest', leavePayload(workspaceId))
    const managerRequest = await manager.call<Submitted>('submitLeaveRequest', leavePayload(workspaceId))
    const ownerRequest = await owner.call<Submitted>('submitLeaveRequest', leavePayload(workspaceId))
    expect([memberRequest.status, managerRequest.status, ownerRequest.status]).toEqual([
      'pending',
      'pending',
      'pending',
    ])

    const decide = (user: TestUser, requestId: string, decision = 'approve') =>
      user.call('decideLeaveRequest', { workspaceId, requestId, decision, note: 'Enjoy' })
    await expectCallError(decide(member, memberRequest.requestId), 'permission-denied')
    await expectCallError(decide(manager, managerRequest.requestId), 'permission-denied')
    await expectCallError(decide(owner, ownerRequest.requestId), 'permission-denied')

    await decide(manager, memberRequest.requestId, 'reject')
    await decide(owner, managerRequest.requestId)
    await decide(manager, ownerRequest.requestId)
    await expectCallError(decide(owner, memberRequest.requestId), 'failed-precondition')
    await expectCallError(decide(owner, managerRequest.requestId, 'maybe'), 'invalid-argument')
    expect(await storedRequest(workspacePath, memberRequest.requestId)).toMatchObject({
      status: 'rejected',
      decidedBy: manager.uid,
      decisionNote: 'Enjoy',
    })
  })

  it('auto-approves when nobody else can approve, and for types that need no approval', async () => {
    const { owner, manager, member, workspaceId, workspacePath } = await workspaceWithTeam()
    await owner.call('setWorkspaceMemberRole', { workspaceId, memberUid: manager.uid, role: 'member' })
    const ownerRequest = await owner.call<Submitted>('submitLeaveRequest', leavePayload(workspaceId))
    expect(ownerRequest.status).toBe('approved')
    expect(await storedRequest(workspacePath, ownerRequest.requestId)).toMatchObject({
      autoApproved: true,
      autoApprovedReason: 'no-approver',
    })

    const sickType = typePayload(workspaceId, {
      typeId: 'sick',
      name: 'Sick leave',
      color: '#C2185B',
      unit: 'half-day',
      requiresApproval: false,
    })
    await expectCallError(member.call('saveLeaveType', sickType), 'permission-denied')
    await expectCallError(manager.call('saveLeaveType', sickType), 'permission-denied')
    await expectCallError(owner.call('saveLeaveType', { ...sickType, typeId: 'missing' }), 'not-found')
    await expectCallError(owner.call('saveLeaveType', { ...sickType, color: 'red' }), 'invalid-argument')
    await owner.call('saveLeaveType', sickType)
    expect((await adminDb.doc(`${workspacePath}/leaveTypes/sick`).get()).data()).toMatchObject({
      color: '#c2185b',
      requiresApproval: false,
    })
    const sick = await member.call<Submitted>('submitLeaveRequest', leavePayload(workspaceId, { typeId: 'sick' }))
    expect(sick.status).toBe('approved')
    expect(await storedRequest(workspacePath, sick.requestId)).toMatchObject({ autoApprovedReason: 'type' })
  })

  it('lets members cancel pending and not-yet-started leave, and approvers cancel started leave', async () => {
    const { owner, manager, member, workspaceId, workspacePath } = await workspaceWithTeam()
    const other = await createUser('dave', 'dave@example.com')
    await inviteAndAccept(owner, workspaceId, other)
    const cancel = (user: TestUser, requestId: string) => user.call('cancelLeaveRequest', { workspaceId, requestId })

    const pending = await member.call<Submitted>('submitLeaveRequest', leavePayload(workspaceId))
    await expectCallError(cancel(other, pending.requestId), 'failed-precondition')
    await expectCallError(cancel(manager, pending.requestId), 'failed-precondition')
    await cancel(member, pending.requestId)
    expect(await storedRequest(workspacePath, pending.requestId)).toMatchObject({
      status: 'cancelled',
      cancelledBy: member.uid,
    })
    await expectCallError(cancel(member, pending.requestId), 'failed-precondition')

    const future = await member.call<Submitted>('submitLeaveRequest', leavePayload(workspaceId))
    await manager.call('decideLeaveRequest', {
      workspaceId,
      requestId: future.requestId,
      decision: 'approve',
      note: '',
    })
    await cancel(member, future.requestId)

    const started = await member.call<Submitted>(
      'submitLeaveRequest',
      leavePayload(workspaceId, { startDate: '2026-01-05', endDate: '2026-01-09' }),
    )
    await owner.call('decideLeaveRequest', { workspaceId, requestId: started.requestId, decision: 'approve', note: '' })
    await expectCallError(cancel(member, started.requestId), 'failed-precondition')
    await cancel(manager, started.requestId)
    expect(await storedRequest(workspacePath, started.requestId)).toMatchObject({
      status: 'cancelled',
      cancelledBy: manager.uid,
    })
  })

  it('lets owners and managers edit allowances, but managers not their own, and keeps an adjustment log', async () => {
    const { owner, manager, member, workspaceId, workspacePath } = await workspaceWithTeam()
    const target = (uid: string) => ({ workspaceId, uid, typeId: 'holiday', year: 2030 })
    await manager.call('setLeaveAllowance', { ...target(member.uid), allowanceDays: 26 })
    await manager.call('addLeaveAdjustment', { ...target(member.uid), days: -0.5, note: 'Correction' })
    await owner.call('addLeaveAdjustment', { ...target(member.uid), days: 2, note: 'Carry-over' })
    await manager.call('setLeaveAllowance', { ...target(owner.uid), allowanceDays: 30 })
    await owner.call('setLeaveAllowance', { ...target(owner.uid), allowanceDays: 25 })
    await owner.call('setLeaveAllowance', { ...target(manager.uid), allowanceDays: null })

    await expectCallError(
      manager.call('setLeaveAllowance', { ...target(manager.uid), allowanceDays: 40 }),
      'permission-denied',
    )
    await expectCallError(
      member.call('setLeaveAllowance', { ...target(member.uid), allowanceDays: 40 }),
      'permission-denied',
    )
    await expectCallError(
      member.call('addLeaveAdjustment', { ...target(member.uid), days: 5, note: 'Please' }),
      'permission-denied',
    )
    const invalid: [string, Record<string, unknown>][] = [
      ['setLeaveAllowance', { allowanceDays: 0.25 }],
      ['setLeaveAllowance', { allowanceDays: -1 }],
      ['setLeaveAllowance', { allowanceDays: 400 }],
      ['setLeaveAllowance', { allowanceDays: 10, year: 1999 }],
      ['addLeaveAdjustment', { days: 0, note: 'Nothing' }],
      ['addLeaveAdjustment', { days: 1, note: '  ' }],
    ]
    for (const [name, overrides] of invalid) {
      await expectCallError(owner.call(name, { ...target(member.uid), ...overrides }), 'invalid-argument')
    }
    await expectCallError(
      owner.call('setLeaveAllowance', { ...target(member.uid), typeId: 'missing', allowanceDays: 1 }),
      'not-found',
    )

    const stored = (await adminDb.doc(`${workspacePath}/leaveAllowances/${member.uid}_holiday_2030`).get()).data()
    expect(stored).toMatchObject({
      uid: member.uid,
      typeId: 'holiday',
      year: 2030,
      allowanceDays: 26,
      updatedBy: owner.uid,
    })
    const log = ((stored?.adjustments ?? []) as { days: number; note: string; by: string }[]).map((item) => [
      item.days,
      item.note,
      item.by,
    ])
    expect(log).toEqual([
      [-0.5, 'Correction', manager.uid],
      [2, 'Carry-over', owner.uid],
    ])

    const memberDb = rulesFirestore(member)
    await assertSucceeds(
      getDocs(query(collection(memberDb, workspacePath, 'leaveAllowances'), where('uid', '==', member.uid))),
    )
    await assertFails(getDocs(collection(memberDb, workspacePath, 'leaveAllowances')))
  })
})

describe('importTimeEntries', () => {
  const HOUR = 60 * 60 * 1000
  const BASE = Date.UTC(2026, 5, 1, 9)

  async function workspaceWithTeam() {
    const owner = await createUser('owner', 'owner@example.com')
    const manager = await createUser('mira', 'mira@example.com')
    const member = await createUser('alice', 'alice@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    await inviteAndAccept(owner, workspaceId, manager)
    await inviteAndAccept(owner, workspaceId, member)
    await owner.call('setWorkspaceMemberRole', { workspaceId, memberUid: manager.uid, role: 'manager' })
    return { owner, manager, member, workspaceId }
  }

  function row(line: number, userId: string, hour: number, overrides: Record<string, unknown> = {}) {
    return {
      line,
      userId,
      clientName: 'Globex',
      projectName: 'App',
      taskName: 'Build',
      description: `Row ${line}`,
      billable: true,
      startAt: BASE + hour * HOUR,
      endAt: BASE + (hour + 1) * HOUR,
      ...overrides,
    }
  }

  type ImportResult = {
    results: Array<{ line: number; status: string; reason?: string }>
    created: { clients: number; projects: number; tasks: number }
  }

  it('creates missing catalog items once and writes entries with name snapshots for each member', async () => {
    const { owner, member, workspaceId } = await workspaceWithTeam()
    const result = await owner.call<ImportResult>('importTimeEntries', {
      workspaceId,
      rows: [row(2, member.uid, 0), row(3, member.uid, 1), row(4, owner.uid, 0, { taskName: null, billable: false })],
    })

    expect(result.created).toEqual({ clients: 1, projects: 1, tasks: 1 })
    expect(result.results.map((item) => item.status)).toEqual(['imported', 'imported', 'imported'])
    const entries = await adminDb.collection(`workspaces/${workspaceId}/timeEntries`).get()
    expect(entries.size).toBe(3)
    const project = (await adminDb.collection(`workspaces/${workspaceId}/projects`).get()).docs[0]!
    expect(project.data()).toMatchObject({ name: 'App', archived: false, color: '#668a6b' })
    const first = entries.docs.find((entry) => entry.data().description === 'Row 2')!.data()
    expect(first).toMatchObject({
      userId: member.uid,
      userDisplayName: 'Alice',
      clientName: 'Globex',
      projectId: project.id,
      projectName: 'App',
      taskName: 'Build',
      billable: true,
    })
    expect((first.startAt as Timestamp).toMillis()).toBe(BASE)
    expect((first.endAt as Timestamp).toMillis()).toBe(BASE + HOUR)
  })

  it('skips overlaps with stored entries, running timers, and other rows, so re-importing adds nothing', async () => {
    const { owner, member, workspaceId } = await workspaceWithTeam()
    const rows = [row(2, member.uid, 0), row(3, member.uid, 0.5), row(4, member.uid, 2)]
    const first = await owner.call<ImportResult>('importTimeEntries', { workspaceId, rows })
    expect(first.results).toEqual([
      { line: 2, status: 'imported' },
      { line: 3, status: 'skipped', reason: 'overlapsFile' },
      { line: 4, status: 'imported' },
    ])

    const again = await owner.call<ImportResult>('importTimeEntries', { workspaceId, rows })
    expect(again.created).toEqual({ clients: 0, projects: 0, tasks: 0 })
    expect(again.results.map((item) => item.reason)).toEqual([
      'overlapsExisting',
      'overlapsExisting',
      'overlapsExisting',
    ])

    await adminDb.doc(`workspaces/${workspaceId}/activeTimers/${owner.uid}`).set({
      entryId: 'running',
      startAt: Timestamp.fromMillis(BASE + 5 * HOUR),
    })
    const running = await owner.call<ImportResult>('importTimeEntries', {
      workspaceId,
      rows: [row(5, owner.uid, 4), row(6, owner.uid, 5)],
    })
    expect(running.results).toEqual([
      { line: 5, status: 'imported' },
      { line: 6, status: 'skipped', reason: 'overlapsRunningTimer' },
    ])
    expect((await adminDb.collection(`workspaces/${workspaceId}/timeEntries`).get()).size).toBe(3)
  })

  it('reuses archived catalog items without unarchiving them', async () => {
    const { owner, member, workspaceId } = await workspaceWithTeam()
    const now = Timestamp.now()
    await adminDb
      .doc(`workspaces/${workspaceId}/clients/acme`)
      .set({ name: 'Acme', archived: true, createdAt: now, updatedAt: now })
    await adminDb.doc(`workspaces/${workspaceId}/projects/site`).set({
      name: 'Website',
      clientId: 'acme',
      description: '',
      color: '#668a6b',
      estimateMinutes: null,
      archived: true,
      createdAt: now,
      updatedAt: now,
    })

    const result = await owner.call<ImportResult>('importTimeEntries', {
      workspaceId,
      rows: [row(2, member.uid, 0, { clientName: 'acme', projectName: 'WEBSITE', taskName: null })],
    })

    expect(result.created).toEqual({ clients: 0, projects: 0, tasks: 0 })
    const entry = (await adminDb.collection(`workspaces/${workspaceId}/timeEntries`).get()).docs[0]!.data()
    expect(entry).toMatchObject({ clientId: 'acme', clientName: 'Acme', projectId: 'site', projectName: 'Website' })
    expect((await adminDb.doc(`workspaces/${workspaceId}/projects/site`).get()).data()?.archived).toBe(true)
  })

  it('lets managers import, and denies members, non-members, and signed-out callers', async () => {
    const { manager, member, workspaceId } = await workspaceWithTeam()
    const outsider = await createUser('olaf', 'olaf@example.com')
    const result = await manager.call<ImportResult>('importTimeEntries', { workspaceId, rows: [row(2, member.uid, 0)] })
    expect(result.results).toEqual([{ line: 2, status: 'imported' }])

    await expectCallError(
      member.call('importTimeEntries', { workspaceId, rows: [row(3, member.uid, 3)] }),
      'permission-denied',
    )
    await expectCallError(
      outsider.call('importTimeEntries', { workspaceId, rows: [row(4, member.uid, 4)] }),
      'permission-denied',
    )
    await expectCallError(
      anonymousCall('importTimeEntries', { workspaceId, rows: [row(5, member.uid, 5)] }),
      'unauthenticated',
    )
  })

  it('skips rows for users who are not active members and rows with invalid values', async () => {
    const { owner, member, workspaceId } = await workspaceWithTeam()
    await owner.call('removeWorkspaceMember', { workspaceId, memberUid: member.uid })
    const result = await owner.call<ImportResult>('importTimeEntries', {
      workspaceId,
      rows: [
        row(2, member.uid, 0),
        row(3, 'nobody', 0),
        row(4, owner.uid, 0, { endAt: BASE }),
        row(5, owner.uid, 1, { projectName: null }),
        row(6, owner.uid, 2, { description: 'x'.repeat(501) }),
        row(7, owner.uid, 3),
      ],
    })
    expect(result.results).toEqual([
      { line: 2, status: 'skipped', reason: 'unknownUser' },
      { line: 3, status: 'skipped', reason: 'unknownUser' },
      { line: 4, status: 'skipped', reason: 'invalidRow' },
      { line: 5, status: 'skipped', reason: 'invalidRow' },
      { line: 6, status: 'skipped', reason: 'invalidRow' },
      { line: 7, status: 'imported' },
    ])
  })

  it('rejects requests without rows, with too many rows, or with duplicate line numbers', async () => {
    const { owner, workspaceId } = await workspaceWithTeam()
    await expectCallError(owner.call('importTimeEntries', { workspaceId, rows: [] }), 'invalid-argument')
    const tooMany = Array.from({ length: 201 }, (_, index) => row(index + 2, owner.uid, index))
    await expectCallError(owner.call('importTimeEntries', { workspaceId, rows: tooMany }), 'invalid-argument')
    await expectCallError(
      owner.call('importTimeEntries', { workspaceId, rows: [row(2, owner.uid, 0), row(2, owner.uid, 1)] }),
      'invalid-argument',
    )
  })
})
