// Automates docs/firestore-rules-test-matrix.md. Each `matrix` call is one row of that table.
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  CLIENT_ID,
  createTestEnvironment,
  INVITATION_ID,
  INVITEE,
  MEMBER,
  MEMBER_ENTRY_ID,
  NON_MEMBER,
  OTHER_MEMBER,
  OTHER_MEMBER_ENTRY_ID,
  OTHER_WORKSPACE_ID,
  OWNER,
  OWNER_ENTRY_ID,
  PAST,
  PROJECT_ID_IN_WORKSPACE,
  REMOVED_MEMBER,
  seedWorkspace,
  TASK_ID,
  WORKSPACE_ID,
} from './setup'

type Role = 'unauthenticated' | 'non-member' | 'member' | 'owner'
type Outcome = 'allow' | 'deny'
type Actor = { role: Role; uid: string; email: string; db: Firestore }

const ROLES: Role[] = ['unauthenticated', 'non-member', 'member', 'owner']
const USERS = { unauthenticated: { uid: 'anonymous', email: '' }, 'non-member': NON_MEMBER, member: MEMBER, owner: OWNER }
const WS = `workspaces/${WORKSPACE_ID}`

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await createTestEnvironment()
})

beforeEach(async () => {
  await env.clearFirestore()
  await seedWorkspace(env)
})

afterAll(async () => {
  await env?.cleanup()
})

function firestoreFor(user: { uid: string; email: string } | null, emailVerified = true): Firestore {
  const context = user
    ? env.authenticatedContext(user.uid, { email: user.email, email_verified: emailVerified })
    : env.unauthenticatedContext()
  return context.firestore() as unknown as Firestore
}

function actor(role: Role): Actor {
  const user = USERS[role]
  return { role, ...user, db: firestoreFor(role === 'unauthenticated' ? null : user) }
}

/** Another workspace user whose data the actor must not reach unless they own the workspace. */
function otherUserOf(subject: Actor) {
  return subject.role === 'owner' ? MEMBER : OWNER
}

function ownEntryId(subject: Actor): string {
  return subject.role === 'owner' ? OWNER_ENTRY_ID : MEMBER_ENTRY_ID
}

function otherMembersEntryId(subject: Actor): string {
  return subject.role === 'owner' ? MEMBER_ENTRY_ID : OTHER_MEMBER_ENTRY_ID
}

function matrix(title: string, outcomes: Record<Role, Outcome>, operation: (subject: Actor) => Promise<unknown>) {
  describe(title, () => {
    it.each(ROLES)('%s', async (role) => {
      const result = operation(actor(role))
      await (outcomes[role] === 'allow' ? assertSucceeds(result) : assertFails(result))
    })
  })
}

const DENY_ALL: Record<Role, Outcome> = { unauthenticated: 'deny', 'non-member': 'deny', member: 'deny', owner: 'deny' }
const SIGNED_IN: Record<Role, Outcome> = { unauthenticated: 'deny', 'non-member': 'allow', member: 'allow', owner: 'allow' }
const MEMBERS: Record<Role, Outcome> = { unauthenticated: 'deny', 'non-member': 'deny', member: 'allow', owner: 'allow' }
const OWNER_ONLY: Record<Role, Outcome> = { unauthenticated: 'deny', 'non-member': 'deny', member: 'deny', owner: 'allow' }

function newEntry(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    userId,
    userDisplayName: userId,
    description: 'New entry',
    clientId: CLIENT_ID,
    projectId: PROJECT_ID_IN_WORKSPACE,
    taskId: TASK_ID,
    clientName: 'Acme',
    projectName: 'Website',
    taskName: 'Build',
    billable: false,
    startAt: Timestamp.fromDate(new Date('2026-01-06T08:00:00Z')),
    endAt: Timestamp.fromDate(new Date('2026-01-06T09:00:00Z')),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  }
}

function newProject(overrides: Record<string, unknown> = {}) {
  return {
    name: 'New project', clientId: CLIENT_ID, description: '', color: '#1565c0', estimateMinutes: 120, archived: false,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...overrides,
  }
}

function newTask(overrides: Record<string, unknown> = {}) {
  return { name: 'New task', projectId: PROJECT_ID_IN_WORKSPACE, estimateMinutes: 30, archived: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...overrides }
}

function newClient(overrides: Record<string, unknown> = {}) {
  return { name: 'New client', archived: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...overrides }
}

describe('Firestore rules matrix', () => {
  matrix('read own users/{uid} profile', SIGNED_IN, ({ db, uid }) => getDoc(doc(db, 'users', uid)))

  matrix('update own users/{uid} profile, including palette', SIGNED_IN, ({ db, uid }) =>
    updateDoc(doc(db, 'users', uid), { displayName: 'Renamed', palette: 'ocean', updatedAt: serverTimestamp() }))

  matrix('read another user\'s profile', DENY_ALL, (subject) => getDoc(doc(subject.db, 'users', otherUserOf(subject).uid)))

  matrix('update another user\'s profile', DENY_ALL, (subject) =>
    updateDoc(doc(subject.db, 'users', otherUserOf(subject).uid), { displayName: 'Hijacked', updatedAt: serverTimestamp() }))

  matrix('set palette outside the predefined list', DENY_ALL, ({ db, uid }) =>
    updateDoc(doc(db, 'users', uid), { palette: 'neon', updatedAt: serverTimestamp() }))

  matrix('read workspace document', MEMBERS, ({ db }) => getDoc(doc(db, WS)))

  matrix('read workspace clients, projects, and tasks', MEMBERS, async ({ db }) => {
    await getDoc(doc(db, WS, 'clients', CLIENT_ID))
    await getDoc(doc(db, WS, 'projects', PROJECT_ID_IN_WORKSPACE))
    await getDoc(doc(db, WS, 'tasks', TASK_ID))
    await getDocs(collection(db, WS, 'clients'))
    await getDocs(collection(db, WS, 'projects'))
    await getDocs(collection(db, WS, 'tasks'))
  })

  matrix('read own time entries (direct get and query on userId == auth.uid)', MEMBERS, async (subject) => {
    await getDoc(doc(subject.db, WS, 'timeEntries', ownEntryId(subject)))
    await getDocs(query(collection(subject.db, WS, 'timeEntries'), where('userId', '==', subject.uid)))
  })

  matrix('read another member\'s time entry (direct get)', OWNER_ONLY, (subject) =>
    getDoc(doc(subject.db, WS, 'timeEntries', otherMembersEntryId(subject))))

  matrix('query another member\'s time entries', OWNER_ONLY, (subject) =>
    getDocs(query(collection(subject.db, WS, 'timeEntries'), where('userId', '==', otherUserOf(subject).uid))))

  matrix('query all time entries without a user constraint', OWNER_ONLY, ({ db }) => getDocs(collection(db, WS, 'timeEntries')))

  matrix('query own memberships (members group, uid == auth.uid)', SIGNED_IN, ({ db, uid }) =>
    getDocs(query(collectionGroup(db, 'members'), where('uid', '==', uid))))

  matrix('query another user\'s memberships across workspaces', DENY_ALL, (subject) =>
    getDocs(query(collectionGroup(subject.db, 'members'), where('uid', '==', otherUserOf(subject).uid))))

  matrix('read another member\'s membership in a known workspace', MEMBERS, (subject) =>
    getDoc(doc(subject.db, WS, 'members', otherUserOf(subject).uid)))

  matrix('create a membership from a web client', DENY_ALL, ({ db, uid, email }) =>
    setDoc(doc(db, WS, 'members', uid === OWNER.uid ? 'new-member' : uid), { uid, email, displayName: uid, role: 'member', status: 'active', joinedAt: serverTimestamp() }))

  matrix('change a membership role from a web client', DENY_ALL, ({ db }) => updateDoc(doc(db, WS, 'members', MEMBER.uid), { role: 'owner' }))

  matrix('reactivate a removed membership from a web client', DENY_ALL, ({ db }) =>
    updateDoc(doc(db, WS, 'members', REMOVED_MEMBER.uid), { status: 'active' }))

  matrix('delete a membership from a web client', DENY_ALL, ({ db }) => deleteDoc(doc(db, WS, 'members', OTHER_MEMBER.uid)))

  matrix('change workspace owner identity from a web client', DENY_ALL, ({ db, uid }) =>
    updateDoc(doc(db, WS), { ownerUid: uid === OWNER.uid ? MEMBER.uid : uid, updatedAt: serverTimestamp() }))

  matrix('create a workspace from a web client', DENY_ALL, ({ db, uid }) =>
    setDoc(doc(db, 'workspaces', 'new-workspace'), { name: 'New', ownerUid: uid, weekStartsOn: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))

  matrix('read an invitation not addressed to the caller', OWNER_ONLY, ({ db }) => getDoc(doc(db, WS, 'invitations', INVITATION_ID)))

  matrix('list invitations', OWNER_ONLY, ({ db }) => getDocs(collection(db, WS, 'invitations')))

  matrix('create an invitation from a web client', DENY_ALL, ({ db, uid }) =>
    setDoc(doc(db, WS, 'invitations', 'new-invite'), { email: 'someone@example.com', role: 'member', tokenHash: '1'.repeat(64), expiresAt: PAST, status: 'pending', createdBy: uid, createdAt: serverTimestamp() }))

  matrix('update an invitation from a web client', DENY_ALL, ({ db }) => updateDoc(doc(db, WS, 'invitations', INVITATION_ID), { status: 'accepted' }))

  matrix('delete an invitation from a web client', DENY_ALL, ({ db }) => deleteDoc(doc(db, WS, 'invitations', INVITATION_ID)))

  matrix('create a client', OWNER_ONLY, ({ db }) => setDoc(doc(db, WS, 'clients', 'client-new'), newClient()))

  matrix('create a project', OWNER_ONLY, ({ db }) => setDoc(doc(db, WS, 'projects', 'project-new'), newProject()))

  matrix('create a task', OWNER_ONLY, ({ db }) => setDoc(doc(db, WS, 'tasks', 'task-new'), newTask()))

  matrix('update a client, project, and task', OWNER_ONLY, async ({ db }) => {
    await updateDoc(doc(db, WS, 'clients', CLIENT_ID), { archived: true, updatedAt: serverTimestamp() })
    await updateDoc(doc(db, WS, 'projects', PROJECT_ID_IN_WORKSPACE), { name: 'Renamed', estimateMinutes: null, updatedAt: serverTimestamp() })
    await updateDoc(doc(db, WS, 'tasks', TASK_ID), { estimateMinutes: 45, updatedAt: serverTimestamp() })
  })

  matrix('delete a client, project, and task', OWNER_ONLY, async ({ db }) => {
    await deleteDoc(doc(db, WS, 'tasks', TASK_ID))
    await deleteDoc(doc(db, WS, 'projects', PROJECT_ID_IN_WORKSPACE))
    await deleteDoc(doc(db, WS, 'clients', CLIENT_ID))
  })

  matrix('create a time entry attributed to the caller', MEMBERS, ({ db, uid }) => setDoc(doc(db, WS, 'timeEntries', `new-${uid}`), newEntry(uid)))

  matrix('create a time entry attributed to a different user', DENY_ALL, (subject) =>
    setDoc(doc(subject.db, WS, 'timeEntries', `forged-${subject.uid}`), newEntry(otherUserOf(subject).uid)))

  matrix('update own time entry', MEMBERS, (subject) =>
    updateDoc(doc(subject.db, WS, 'timeEntries', ownEntryId(subject)), { description: 'Updated', billable: false, updatedAt: serverTimestamp() }))

  matrix('delete own time entry', MEMBERS, (subject) => deleteDoc(doc(subject.db, WS, 'timeEntries', ownEntryId(subject))))

  matrix('update another user\'s time entry', OWNER_ONLY, (subject) =>
    updateDoc(doc(subject.db, WS, 'timeEntries', otherMembersEntryId(subject)), { description: 'Corrected', updatedAt: serverTimestamp() }))

  matrix('delete another user\'s time entry', OWNER_ONLY, (subject) => deleteDoc(doc(subject.db, WS, 'timeEntries', otherMembersEntryId(subject))))

  describe('access a workspace outside the caller\'s membership', () => {
    // The non-member owns the other workspace, so their outside workspace is the main one.
    const outside = (subject: Actor) => `workspaces/${subject.role === 'non-member' ? WORKSPACE_ID : OTHER_WORKSPACE_ID}`

    matrix('read the workspace and its data', DENY_ALL, async (subject) => {
      await getDoc(doc(subject.db, outside(subject)))
    })
    matrix('list its clients', DENY_ALL, (subject) => getDocs(collection(subject.db, outside(subject), 'clients')))
    matrix('list its members', DENY_ALL, (subject) => getDocs(collection(subject.db, outside(subject), 'members')))
    matrix('create a client there', DENY_ALL, (subject) => setDoc(doc(subject.db, outside(subject), 'clients', 'intruder'), newClient()))
    matrix('create a time entry there', DENY_ALL, (subject) =>
      setDoc(doc(subject.db, outside(subject), 'timeEntries', `intruder-${subject.uid}`), newEntry(subject.uid, { clientId: null, projectId: null, taskId: null, clientName: null, projectName: null, taskName: null })))
  })

  matrix('access an unknown workspace collection', DENY_ALL, async ({ db }) => {
    await getDoc(doc(db, WS, 'secrets', 'config'))
  })

  matrix('write an unknown workspace collection', DENY_ALL, ({ db }) => setDoc(doc(db, WS, 'secrets', 'config'), { value: 1 }))

  matrix('access an unknown top-level collection', DENY_ALL, ({ db }) => getDocs(collection(db, 'admin')))
})

describe('invitation reads by the invitee', () => {
  it('allows the invitee with a verified matching email', async () => {
    await assertSucceeds(getDoc(doc(firestoreFor(INVITEE), WS, 'invitations', INVITATION_ID)))
  })

  it('denies the invitee before their email is verified', async () => {
    await assertFails(getDoc(doc(firestoreFor(INVITEE, false), WS, 'invitations', INVITATION_ID)))
  })
})

describe('removed members', () => {
  it('lose workspace, catalog, membership, and time-entry access', async () => {
    const db = firestoreFor(REMOVED_MEMBER)
    await assertFails(getDoc(doc(db, WS)))
    await assertFails(getDocs(collection(db, WS, 'clients')))
    await assertFails(getDoc(doc(db, WS, 'members', OWNER.uid)))
    await assertFails(getDocs(query(collection(db, WS, 'timeEntries'), where('userId', '==', REMOVED_MEMBER.uid))))
    await assertFails(setDoc(doc(db, WS, 'timeEntries', 'after-removal'), newEntry(REMOVED_MEMBER.uid)))
  })

  it('can still find their own membership record', async () => {
    const db = firestoreFor(REMOVED_MEMBER)
    await assertSucceeds(getDocs(query(collectionGroup(db, 'members'), where('uid', '==', REMOVED_MEMBER.uid))))
  })
})

describe('running timers', () => {
  async function startTimer(db: Firestore, uid: string, entryId: string) {
    const batch = writeBatch(db)
    batch.set(doc(db, WS, 'timeEntries', entryId), newEntry(uid, { startAt: serverTimestamp(), endAt: null }))
    batch.set(doc(db, WS, 'activeTimers', uid), { entryId, startAt: serverTimestamp() })
    await batch.commit()
  }

  it('lets a member start and stop their own timer', async () => {
    const db = firestoreFor(MEMBER)
    await assertSucceeds(startTimer(db, MEMBER.uid, 'running'))

    const stop = writeBatch(db)
    stop.update(doc(db, WS, 'timeEntries', 'running'), { endAt: serverTimestamp(), updatedAt: serverTimestamp() })
    stop.delete(doc(db, WS, 'activeTimers', MEMBER.uid))
    await assertSucceeds(stop.commit())
  })

  it('denies a running entry without its active timer', async () => {
    const db = firestoreFor(MEMBER)
    await assertFails(setDoc(doc(db, WS, 'timeEntries', 'orphan'), newEntry(MEMBER.uid, { startAt: serverTimestamp(), endAt: null })))
  })

  it('denies a running timer started for someone else', async () => {
    const db = firestoreFor(OWNER)
    await assertFails(startTimer(db, MEMBER.uid, 'for-alice'))
  })

  it('denies stopping a timer without clearing the active timer', async () => {
    const db = firestoreFor(MEMBER)
    await startTimer(db, MEMBER.uid, 'running')
    await assertFails(updateDoc(doc(db, WS, 'timeEntries', 'running'), { endAt: serverTimestamp(), updatedAt: serverTimestamp() }))
  })

  it('denies deleting a running entry', async () => {
    const db = firestoreFor(MEMBER)
    await startTimer(db, MEMBER.uid, 'running')
    await assertFails(deleteDoc(doc(db, WS, 'timeEntries', 'running')))
  })

  it('denies a completed entry that ends after the running timer started', async () => {
    const db = firestoreFor(MEMBER)
    await startTimer(db, MEMBER.uid, 'running')
    const startAt = Timestamp.fromMillis(Date.now() - 60 * 60 * 1000)
    const endAt = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000)
    await assertFails(setDoc(doc(db, WS, 'timeEntries', 'overlap'), newEntry(MEMBER.uid, { startAt, endAt })))
  })
})

describe('boundary validation', () => {
  const memberDb = () => firestoreFor(MEMBER)
  const ownerDb = () => firestoreFor(OWNER)
  const createEntry = (overrides: Record<string, unknown>) =>
    setDoc(doc(memberDb(), WS, 'timeEntries', 'boundary'), newEntry(MEMBER.uid, overrides))

  describe('time entries', () => {
    it('accepts the valid baseline entry', async () => {
      await assertSucceeds(createEntry({}))
    })

    it.each<[string, Record<string, unknown>]>([
      ['an unknown field', { invoiced: true }],
      ['an empty description', { description: '' }],
      ['an oversized description', { description: 'a'.repeat(501) }],
      ['an oversized display name', { userDisplayName: 'a'.repeat(321) }],
      ['a non-boolean billable value', { billable: 'yes' }],
      ['a start time that is not a timestamp', { startAt: '2026-01-06T08:00:00Z' }],
      ['an end time that is not a timestamp', { endAt: 1767690000000 }],
      ['a client-chosen createdAt', { createdAt: PAST }],
      ['a client-chosen updatedAt', { updatedAt: PAST }],
      ['an end at the start', { endAt: Timestamp.fromDate(new Date('2026-01-06T08:00:00Z')) }],
      ['an end before the start', { endAt: Timestamp.fromDate(new Date('2026-01-06T07:00:00Z')) }],
      ['a catalog name that does not match the reference', { clientName: 'Someone else' }],
      ['a reference to a missing catalog item', { taskId: 'task-missing' }],
      ['a name without its reference', { clientId: null }],
      ['an oversized reference', { clientId: 'c'.repeat(129) }],
    ])('denies %s', async (_, overrides) => {
      await assertFails(createEntry(overrides))
    })

    it('denies a reference to an archived catalog item', async () => {
      await env.withSecurityRulesDisabled((context) =>
        updateDoc(doc(context.firestore() as unknown as Firestore, WS, 'tasks', TASK_ID), { archived: true }))
      await assertFails(createEntry({}))
    })

    it.each<[string, Record<string, unknown>]>([
      ['an end at or before the start', { endAt: Timestamp.fromDate(new Date('2026-01-05T08:00:00Z')) }],
      ['a changed owner', { userId: OWNER.uid }],
      ['a changed createdAt', { createdAt: serverTimestamp() }],
      ['an unknown field', { invoiced: true }],
      ['an oversized description', { description: 'a'.repeat(501) }],
    ])('denies updates with %s', async (_, changes) => {
      await assertFails(updateDoc(doc(memberDb(), WS, 'timeEntries', MEMBER_ENTRY_ID), { ...changes, updatedAt: serverTimestamp() }))
    })

    it('denies updates without a server updatedAt', async () => {
      await assertFails(updateDoc(doc(memberDb(), WS, 'timeEntries', MEMBER_ENTRY_ID), { description: 'Updated' }))
    })
  })

  describe('catalog', () => {
    it.each<[string, () => Promise<unknown>]>([
      ['a client with an unknown field', () => setDoc(doc(ownerDb(), WS, 'clients', 'c'), newClient({ notes: 'x' }))],
      ['a client with an empty name', () => setDoc(doc(ownerDb(), WS, 'clients', 'c'), newClient({ name: '' }))],
      ['a client with an oversized name', () => setDoc(doc(ownerDb(), WS, 'clients', 'c'), newClient({ name: 'a'.repeat(121) }))],
      ['a client with a non-boolean archived flag', () => setDoc(doc(ownerDb(), WS, 'clients', 'c'), newClient({ archived: 'no' }))],
      ['a client with a client-chosen createdAt', () => setDoc(doc(ownerDb(), WS, 'clients', 'c'), newClient({ createdAt: PAST }))],
      ['a project with an oversized description', () => setDoc(doc(ownerDb(), WS, 'projects', 'p'), newProject({ description: 'a'.repeat(1001) }))],
      ['a project with an oversized color', () => setDoc(doc(ownerDb(), WS, 'projects', 'p'), newProject({ color: 'a'.repeat(33) }))],
      ['a project with a negative estimate', () => setDoc(doc(ownerDb(), WS, 'projects', 'p'), newProject({ estimateMinutes: -5 }))],
      ['a project with a fractional estimate', () => setDoc(doc(ownerDb(), WS, 'projects', 'p'), newProject({ estimateMinutes: 1.5 }))],
      ['a project missing a field', () => setDoc(doc(ownerDb(), WS, 'projects', 'p'), { name: 'Short', archived: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })],
      ['a task with a negative estimate', () => setDoc(doc(ownerDb(), WS, 'tasks', 't'), newTask({ estimateMinutes: -1 }))],
      ['a task without a project', () => setDoc(doc(ownerDb(), WS, 'tasks', 't'), newTask({ projectId: '' }))],
      ['a project update with a negative estimate', () => updateDoc(doc(ownerDb(), WS, 'projects', PROJECT_ID_IN_WORKSPACE), { estimateMinutes: -1, updatedAt: serverTimestamp() })],
      ['a client update to an oversized name', () => updateDoc(doc(ownerDb(), WS, 'clients', CLIENT_ID), { name: 'a'.repeat(121), updatedAt: serverTimestamp() })],
      ['a task update that changes createdAt', () => updateDoc(doc(ownerDb(), WS, 'tasks', TASK_ID), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() })],
    ])('denies %s', async (_, write) => {
      await assertFails(write())
    })
  })

  describe('workspace settings', () => {
    it('lets the owner rename the workspace and change the week start', async () => {
      await assertSucceeds(updateDoc(doc(ownerDb(), WS), { name: 'Renamed', weekStartsOn: 0, updatedAt: serverTimestamp() }))
    })

    it('denies the same change from a member', async () => {
      await assertFails(updateDoc(doc(memberDb(), WS), { name: 'Renamed', updatedAt: serverTimestamp() }))
    })

    it.each<[string, Record<string, unknown>]>([
      ['a week start above 6', { weekStartsOn: 7 }],
      ['a negative week start', { weekStartsOn: -1 }],
      ['a week start that is not an integer', { weekStartsOn: '1' }],
      ['an empty name', { name: '' }],
      ['an oversized name', { name: 'a'.repeat(121) }],
      ['a client-chosen updatedAt', { updatedAt: PAST }],
    ])('denies %s', async (_, changes) => {
      await assertFails(updateDoc(doc(ownerDb(), WS), { updatedAt: serverTimestamp(), ...changes }))
    })
  })

  describe('user profiles', () => {
    const update = (changes: Record<string, unknown>) => updateDoc(doc(memberDb(), 'users', MEMBER.uid), { updatedAt: serverTimestamp(), ...changes })

    it.each(['system', 'forest', 'ocean', 'plum', 'terracotta', 'forest-night', 'midnight', 'graphite'])('accepts the %s palette', async (palette) => {
      await assertSucceeds(update({ palette }))
    })

    it.each<[string, Record<string, unknown>]>([
      ['an oversized display name', { displayName: 'a'.repeat(81) }],
      ['an email that does not match the token', { email: 'someone@example.com' }],
      ['an oversized time zone', { timezone: 'a'.repeat(101) }],
      ['an unknown field', { role: 'owner' }],
      ['a changed createdAt', { createdAt: serverTimestamp() }],
      ['a palette that is not a string', { palette: 1 }],
    ])('denies %s', async (_, changes) => {
      await assertFails(update(changes))
    })

    it('allows creating a valid profile and denies listing profiles', async () => {
      const db = firestoreFor(INVITEE)
      await assertSucceeds(setDoc(doc(db, 'users', INVITEE.uid), { displayName: 'Erin', email: INVITEE.email, timezone: 'UTC', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
      await assertFails(getDocs(collection(db, 'users')))
    })
  })
})
