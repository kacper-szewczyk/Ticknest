// Exercises the callables in functions/src/index.ts through the Functions emulator.
import { createHash } from 'node:crypto'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp as ClientTimestamp, where, type Firestore } from 'firebase/firestore'
import { connectFunctionsEmulator, FunctionsError, getFunctions, httpsCallable } from 'firebase/functions'
import { getApps as getAdminApps, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore, Timestamp } from 'firebase-admin/firestore'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestEnvironment, emulatorOrigin, PROJECT_ID } from './setup'

const PASSWORD = 'correct-horse-battery'
const VALID_TOKEN = 'a'.repeat(43)

type TestUser = { uid: string; email: string; call: <T = Record<string, unknown>>(name: string, data: unknown) => Promise<T> }

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
  const app = initializeApp({ apiKey: 'demo-api-key', projectId: PROJECT_ID, appId: 'demo-app-id' }, `${uid}-${Date.now()}`)
  clientApps.push(app)
  const auth = getAuth(app)
  connectAuthEmulator(auth, authEmulator, { disableWarnings: true })
  await signInWithEmailAndPassword(auth, email, PASSWORD)
  const functions = getFunctions(app, 'europe-west1')
  connectFunctionsEmulator(functions, functionsEmulator.host, functionsEmulator.port)
  return {
    uid,
    email,
    call: async <T,>(name: string, data: unknown) => (await httpsCallable<unknown, T>(functions, name)(data)).data,
  }
}

function anonymousCall(name: string, data: unknown) {
  const app = initializeApp({ apiKey: 'demo-api-key', projectId: PROJECT_ID, appId: 'demo-app-id' }, `anonymous-${Date.now()}`)
  clientApps.push(app)
  const functions = getFunctions(app, 'europe-west1')
  connectFunctionsEmulator(functions, functionsEmulator.host, functionsEmulator.port)
  return httpsCallable(functions, name)(data)
}

async function expectCallError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(() => null, (reason: unknown) => reason)
  expect(error, `expected functions/${code}`).toBeInstanceOf(FunctionsError)
  expect((error as FunctionsError).code).toBe(`functions/${code}`)
}

function rulesFirestore(user: { uid: string; email: string }): Firestore {
  return env.authenticatedContext(user.uid, { email: user.email, email_verified: true }).firestore() as unknown as Firestore
}

async function createWorkspaceAs(owner: TestUser): Promise<string> {
  const { workspaceId } = await owner.call<{ workspaceId: string }>('createWorkspace', { name: 'Studio', timezone: 'Europe/Warsaw', displayName: 'Olivia' })
  return workspaceId
}

async function inviteAndAccept(owner: TestUser, workspaceId: string, member: TestUser) {
  const invitation = await owner.call<{ invitationId: string; token: string }>('createWorkspaceInvitation', { workspaceId, email: member.email })
  await member.call('acceptWorkspaceInvitation', { workspaceId, invitationId: invitation.invitationId, token: invitation.token, timezone: 'UTC', displayName: 'Alice' })
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
    expect(membership.data()).toMatchObject({ uid: 'owner', email: 'owner@example.com', role: 'owner', status: 'active' })
    const profile = await adminDb.doc('users/owner').get()
    expect(profile.data()).toMatchObject({ displayName: 'Olivia', email: 'owner@example.com', timezone: 'Europe/Warsaw' })
  })

  it('requires a signed-in user', async () => {
    await expectCallError(anonymousCall('createWorkspace', { name: 'Studio', timezone: 'UTC', displayName: '' }), 'unauthenticated')
  })

  it.each([
    ['an empty name', { name: '   ', timezone: 'UTC', displayName: '' }],
    ['an oversized name', { name: 'a'.repeat(81), timezone: 'UTC', displayName: '' }],
    ['an unknown time zone', { name: 'Studio', timezone: 'Mars/Olympus', displayName: '' }],
    ['an oversized display name', { name: 'Studio', timezone: 'UTC', displayName: 'a'.repeat(81) }],
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

    await expectCallError(member.call('createWorkspaceInvitation', { workspaceId, email: 'new@example.com' }), 'permission-denied')

    const invitation = await owner.call<{ invitationId: string; token: string; expiresAt: number }>('createWorkspaceInvitation', { workspaceId, email: 'New@Example.com' })
    expect(invitation.token.length).toBeGreaterThanOrEqual(43)
    expect(invitation.expiresAt).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000)
    const stored = await adminDb.doc(`workspaces/${workspaceId}/invitations/${invitation.invitationId}`).get()
    expect(stored.data()).toMatchObject({ email: 'new@example.com', role: 'member', status: 'pending', createdBy: 'owner' })
    expect(stored.data()?.tokenHash).toBe(createHash('sha256').update(invitation.token).digest('hex'))
    expect(JSON.stringify(stored.data())).not.toContain(invitation.token)

    await expectCallError(owner.call('createWorkspaceInvitation', { workspaceId, email: 'new@example.com' }), 'already-exists')
    await expectCallError(owner.call('createWorkspaceInvitation', { workspaceId, email: 'owner@example.com' }), 'already-exists')
    await expectCallError(owner.call('createWorkspaceInvitation', { workspaceId, email: 'not-an-email' }), 'invalid-argument')
  })

  it('lets only an active owner revoke, and only pending invitations', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const invitee = await createUser('alice', 'alice@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    const invitation = await owner.call<{ invitationId: string; token: string }>('createWorkspaceInvitation', { workspaceId, email: invitee.email })

    await expectCallError(invitee.call('revokeWorkspaceInvitation', { workspaceId, invitationId: invitation.invitationId }), 'permission-denied')
    await owner.call('revokeWorkspaceInvitation', { workspaceId, invitationId: invitation.invitationId })
    const stored = await adminDb.doc(`workspaces/${workspaceId}/invitations/${invitation.invitationId}`).get()
    expect(stored.data()?.status).toBe('revoked')

    await expectCallError(owner.call('revokeWorkspaceInvitation', { workspaceId, invitationId: invitation.invitationId }), 'failed-precondition')
    await expectCallError(
      invitee.call('acceptWorkspaceInvitation', { workspaceId, invitationId: invitation.invitationId, token: invitation.token, timezone: 'UTC', displayName: '' }),
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
    expect(membership.data()).toMatchObject({ uid: 'alice', email: 'alice@example.com', role: 'member', status: 'active' })
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
      member.call('acceptWorkspaceInvitation', { workspaceId, invitationId: invitation.invitationId, token: invitation.token, timezone: 'UTC', displayName: 'Alice' }),
      'already-exists',
    )
  })

  it('denies an invitation that is no longer pending', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    const invitationId = await seedInvitation(workspaceId, 'alice@example.com', { status: 'accepted' })
    const member = await createUser('alice', 'alice@example.com')

    await expectCallError(member.call('acceptWorkspaceInvitation', acceptInput(workspaceId, invitationId)), 'failed-precondition')
  })

  it('denies an expired invitation', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    const invitationId = await seedInvitation(workspaceId, 'alice@example.com', { expiresAt: Timestamp.fromMillis(Date.now() - 1000) })
    const member = await createUser('alice', 'alice@example.com')

    await expectCallError(member.call('acceptWorkspaceInvitation', acceptInput(workspaceId, invitationId)), 'failed-precondition')
    expect((await adminDb.doc(`workspaces/${workspaceId}/members/alice`).get()).exists).toBe(false)
  })

  it('denies an invitation addressed to another email', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    const invitationId = await seedInvitation(workspaceId, 'someone-else@example.com')
    const member = await createUser('alice', 'alice@example.com')

    await expectCallError(member.call('acceptWorkspaceInvitation', acceptInput(workspaceId, invitationId)), 'failed-precondition')
  })

  it('denies a wrong token', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    const invitationId = await seedInvitation(workspaceId, 'alice@example.com')
    const member = await createUser('alice', 'alice@example.com')

    await expectCallError(member.call('acceptWorkspaceInvitation', acceptInput(workspaceId, invitationId, 'b'.repeat(43))), 'failed-precondition')
    await expectCallError(member.call('acceptWorkspaceInvitation', acceptInput(workspaceId, invitationId, 'short')), 'invalid-argument')
  })

  it('requires a verified email', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    const invitationId = await seedInvitation(workspaceId, 'alice@example.com')
    const member = await createUser('alice', 'alice@example.com', false)

    await expectCallError(member.call('acceptWorkspaceInvitation', acceptInput(workspaceId, invitationId)), 'failed-precondition')
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

    await expectCallError(owner.call('removeWorkspaceMember', { workspaceId, memberUid: owner.uid }), 'failed-precondition')
    expect((await adminDb.doc(`workspaces/${workspaceId}/members/owner`).get()).data()?.status).toBe('active')
  })

  it('denies removing another owner', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    await adminDb.doc(`workspaces/${workspaceId}/members/co-owner`).set({ uid: 'co-owner', email: 'co@example.com', displayName: 'Co', role: 'owner', status: 'active', joinedAt: Timestamp.now() })

    await expectCallError(owner.call('removeWorkspaceMember', { workspaceId, memberUid: 'co-owner' }), 'not-found')
  })

  it('denies a member removing someone', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const member = await createUser('alice', 'alice@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    await inviteAndAccept(owner, workspaceId, member)

    await expectCallError(member.call('removeWorkspaceMember', { workspaceId, memberUid: owner.uid }), 'permission-denied')
  })

  it('revokes the member\'s access, stops their timer, and keeps their history for the owner', async () => {
    const owner = await createUser('owner', 'owner@example.com')
    const member = await createUser('alice', 'alice@example.com')
    const workspaceId = await createWorkspaceAs(owner)
    await inviteAndAccept(owner, workspaceId, member)
    const workspacePath = `workspaces/${workspaceId}`

    // The member logs a completed entry and starts a timer through the rules, as the app does.
    const memberDb = rulesFirestore(member)
    await assertSucceeds(setDoc(doc(memberDb, workspacePath, 'timeEntries', 'history'), {
      userId: member.uid, userDisplayName: 'Alice', description: 'Before removal', clientName: null, projectName: null, taskName: null,
      billable: false, startAt: ClientTimestamp.fromMillis(Date.now() - 2 * 60 * 60 * 1000), endAt: ClientTimestamp.fromMillis(Date.now() - 60 * 60 * 1000),
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }))
    await adminDb.doc(`${workspacePath}/timeEntries/running`).set({
      userId: member.uid, userDisplayName: 'Alice', description: 'Running', clientName: null, projectName: null, taskName: null,
      billable: false, startAt: Timestamp.now(), endAt: null, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    })
    await adminDb.doc(`${workspacePath}/activeTimers/${member.uid}`).set({ entryId: 'running', startAt: Timestamp.now() })

    await owner.call('removeWorkspaceMember', { workspaceId, memberUid: member.uid })

    const membership = await adminDb.doc(`${workspacePath}/members/${member.uid}`).get()
    expect(membership.data()).toMatchObject({ uid: member.uid, email: member.email, status: 'removed' })
    expect((await adminDb.doc(`${workspacePath}/activeTimers/${member.uid}`).get()).exists).toBe(false)
    expect((await adminDb.doc(`${workspacePath}/timeEntries/running`).get()).data()?.endAt).toBeInstanceOf(Timestamp)

    // The former member loses reads and writes.
    await assertFails(getDoc(doc(memberDb, workspacePath)))
    await assertFails(getDocs(query(collection(memberDb, workspacePath, 'timeEntries'), where('userId', '==', member.uid))))
    await assertFails(getDoc(doc(memberDb, workspacePath, 'timeEntries', 'history')))
    await assertFails(setDoc(doc(memberDb, workspacePath, 'timeEntries', 'after'), {
      userId: member.uid, userDisplayName: 'Alice', description: 'After removal', clientName: null, projectName: null, taskName: null,
      billable: false, startAt: ClientTimestamp.fromMillis(Date.now() - 60 * 1000), endAt: ClientTimestamp.now(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }))

    // The owner keeps the membership identity and the historical entries.
    const ownerDb = rulesFirestore(owner)
    await assertSucceeds(getDoc(doc(ownerDb, workspacePath, 'members', member.uid)))
    const history = await assertSucceeds(getDocs(query(collection(ownerDb, workspacePath, 'timeEntries'), where('userId', '==', member.uid))))
    expect(history.docs.map((entry) => entry.id).sort()).toEqual(['history', 'running'])

    // A new invitation can bring them back.
    await inviteAndAccept(owner, workspaceId, member)
    await assertSucceeds(getDoc(doc(memberDb, workspacePath)))
  })
})
