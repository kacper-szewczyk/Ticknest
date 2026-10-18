import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'

initializeApp()

const db = getFirestore()
const REGION = 'europe-west1'
const FUNCTION_OPTIONS = { region: REGION, maxInstances: 3 }

type CallableData = Record<string, unknown>

function getData(value: unknown): CallableData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', 'The request body must be an object.')
  }
  return value as CallableData
}

function getRequiredText(data: CallableData, field: string, maxLength: number): string {
  const value = data[field]
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `Enter a valid ${field}.`)
  }
  const normalizedValue = value.trim()
  if (normalizedValue.length === 0 || normalizedValue.length > maxLength) {
    throw new HttpsError('invalid-argument', `Enter a valid ${field}.`)
  }
  return normalizedValue
}

function getTimeZone(data: CallableData): string {
  const timezone = data.timezone
  if (typeof timezone !== 'string' || timezone.length > 100) {
    throw new HttpsError('invalid-argument', 'Enter a valid time zone.')
  }
  try {
    // Constructing a formatter throws a RangeError for an unknown time zone.
    // oxlint-disable-next-line no-new
    new Intl.DateTimeFormat('en', { timeZone: timezone })
    return timezone
  } catch {
    throw new HttpsError('invalid-argument', 'Enter a valid time zone.')
  }
}

function getDisplayName(data: CallableData): string {
  const displayName = data.displayName
  if (typeof displayName !== 'string' || displayName.trim().length > 80) {
    throw new HttpsError('invalid-argument', 'Enter a valid display name.')
  }
  return displayName.trim()
}

function getDocumentId(data: CallableData, field: string): string {
  const value = getRequiredText(data, field, 128)
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new HttpsError('invalid-argument', `Enter a valid ${field}.`)
  }
  return value
}

function getAuthenticatedUser(request: CallableRequest<unknown>) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to continue.')

  const email = request.auth.token.email
  return {
    uid: request.auth.uid,
    email: typeof email === 'string' ? email.toLowerCase() : '',
    emailVerified: request.auth.token.email_verified === true,
  }
}

export const createWorkspace = onCall(FUNCTION_OPTIONS, async (request) => {
  const user = getAuthenticatedUser(request)
  if (!user.email) throw new HttpsError('failed-precondition', 'Your account needs an email address.')
  const data = getData(request.data)
  const name = getRequiredText(data, 'name', 80)
  const timezone = getTimeZone(data)
  const displayName = getDisplayName(data)

  const workspaceRef = db.collection('workspaces').doc()
  const memberRef = workspaceRef.collection('members').doc(user.uid)
  const userRef = db.collection('users').doc(user.uid)

  await db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef)
    const now = FieldValue.serverTimestamp()

    transaction.create(workspaceRef, {
      name,
      ownerUid: user.uid,
      weekStartsOn: 1,
      createdAt: now,
      updatedAt: now,
    })
    transaction.create(memberRef, {
      uid: user.uid,
      email: user.email,
      displayName,
      role: 'owner',
      status: 'active',
      joinedAt: now,
    })
    transaction.set(
      userRef,
      {
        displayName,
        email: user.email,
        timezone,
        ...(userSnapshot.exists ? {} : { createdAt: now }),
        updatedAt: now,
      },
      { merge: true },
    )
  })

  return { workspaceId: workspaceRef.id }
})

export const acceptWorkspaceInvitation = onCall(FUNCTION_OPTIONS, async (request) => {
  const user = getAuthenticatedUser(request)
  if (!user.email || !user.emailVerified) {
    throw new HttpsError('failed-precondition', 'Verify your email address before accepting an invitation.')
  }

  const data = getData(request.data)
  const workspaceId = getDocumentId(data, 'workspaceId')
  const invitationId = getDocumentId(data, 'invitationId')
  const invitationToken = getRequiredText(data, 'token', 128)
  if (invitationToken.length < 43) {
    throw new HttpsError('invalid-argument', 'The invitation link is not valid.')
  }
  const timezone = getTimeZone(data)
  const displayName = getDisplayName(data)
  const workspaceRef = db.collection('workspaces').doc(workspaceId)
  const invitationRef = workspaceRef.collection('invitations').doc(invitationId)
  const memberRef = workspaceRef.collection('members').doc(user.uid)
  const userRef = db.collection('users').doc(user.uid)

  await db.runTransaction(async (transaction) => {
    const [workspaceSnapshot, invitationSnapshot, memberSnapshot, userSnapshot] = await Promise.all([
      transaction.get(workspaceRef),
      transaction.get(invitationRef),
      transaction.get(memberRef),
      transaction.get(userRef),
    ])

    if (!workspaceSnapshot.exists || !invitationSnapshot.exists) {
      throw new HttpsError('not-found', 'This invitation is no longer available.')
    }
    if (memberSnapshot.exists && memberSnapshot.data()?.status !== 'removed') {
      throw new HttpsError('already-exists', 'You already belong to this workspace.')
    }

    const invitation = invitationSnapshot.data()
    const expiresAt = invitation?.expiresAt
    if (
      invitation?.status !== 'pending' ||
      invitation.role !== 'member' ||
      typeof invitation.email !== 'string' ||
      invitation.email.toLowerCase() !== user.email ||
      typeof invitation.tokenHash !== 'string' ||
      !matchesTokenHash(invitationToken, invitation.tokenHash) ||
      !(expiresAt instanceof Timestamp) ||
      expiresAt.toMillis() <= Date.now()
    ) {
      throw new HttpsError('failed-precondition', 'This invitation has expired or is not for your account.')
    }

    const now = FieldValue.serverTimestamp()
    transaction.set(memberRef, {
      uid: user.uid,
      email: user.email,
      displayName,
      role: 'member',
      status: 'active',
      joinedAt: now,
    })
    transaction.update(invitationRef, { status: 'accepted', acceptedBy: user.uid, acceptedAt: now })
    transaction.set(
      userRef,
      {
        displayName,
        email: user.email,
        timezone,
        ...(userSnapshot.exists ? {} : { createdAt: now }),
        updatedAt: now,
      },
      { merge: true },
    )
  })

  return { workspaceId }
})

export const createWorkspaceInvitation = onCall(FUNCTION_OPTIONS, async (request) => {
  const user = getAuthenticatedUser(request)
  const data = getData(request.data)
  const workspaceId = getDocumentId(data, 'workspaceId')
  const email = getRequiredText(data, 'email', 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.')
  }
  const workspaceRef = db.collection('workspaces').doc(workspaceId)
  const ownerRef = workspaceRef.collection('members').doc(user.uid)
  const membersQuery = workspaceRef.collection('members').where('email', '==', email)
  const invitationsQuery = workspaceRef.collection('invitations').where('email', '==', email)
  const invitationRef = workspaceRef.collection('invitations').doc()
  const token = randomBytes(32).toString('base64url')
  const now = Timestamp.now()
  const expiresAt = Timestamp.fromMillis(now.toMillis() + 7 * 24 * 60 * 60 * 1000)

  await db.runTransaction(async (transaction) => {
    const [owner, members, invitations] = await Promise.all([
      transaction.get(ownerRef),
      transaction.get(membersQuery),
      transaction.get(invitationsQuery),
    ])
    if (!owner.exists || owner.data()?.role !== 'owner' || owner.data()?.status === 'removed') {
      throw new HttpsError('permission-denied', 'Only the workspace owner can manage members.')
    }
    if (members.docs.some((member) => member.data().status !== 'removed')) {
      throw new HttpsError('already-exists', 'This person is already a workspace member.')
    }
    if (invitations.docs.some((invitation) => invitation.data().status === 'pending')) {
      throw new HttpsError('already-exists', 'A pending invitation already exists for this email.')
    }
    transaction.create(invitationRef, {
      email,
      role: 'member',
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt,
      status: 'pending',
      createdBy: user.uid,
      createdAt: FieldValue.serverTimestamp(),
    })
  })
  return { invitationId: invitationRef.id, token, expiresAt: expiresAt.toMillis() }
})

export const revokeWorkspaceInvitation = onCall(FUNCTION_OPTIONS, async (request) => {
  const user = getAuthenticatedUser(request)
  const data = getData(request.data)
  const workspaceId = getDocumentId(data, 'workspaceId')
  const invitationId = getDocumentId(data, 'invitationId')
  const workspaceRef = db.collection('workspaces').doc(workspaceId)
  const ownerRef = workspaceRef.collection('members').doc(user.uid)
  const invitationRef = workspaceRef.collection('invitations').doc(invitationId)
  await db.runTransaction(async (transaction) => {
    const [owner, invitation] = await Promise.all([transaction.get(ownerRef), transaction.get(invitationRef)])
    if (!owner.exists || owner.data()?.role !== 'owner' || owner.data()?.status === 'removed') {
      throw new HttpsError('permission-denied', 'Only the workspace owner can manage members.')
    }
    if (!invitation.exists || invitation.data()?.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'This invitation is no longer pending.')
    }
    transaction.update(invitationRef, { status: 'revoked', revokedAt: FieldValue.serverTimestamp() })
  })
  return { invitationId }
})

export const removeWorkspaceMember = onCall(FUNCTION_OPTIONS, async (request) => {
  const user = getAuthenticatedUser(request)
  const data = getData(request.data)
  const workspaceId = getDocumentId(data, 'workspaceId')
  const memberUid = getDocumentId(data, 'memberUid')
  if (memberUid === user.uid)
    throw new HttpsError('failed-precondition', 'The workspace owner cannot remove themselves.')
  const workspaceRef = db.collection('workspaces').doc(workspaceId)
  const ownerRef = workspaceRef.collection('members').doc(user.uid)
  const memberRef = workspaceRef.collection('members').doc(memberUid)
  const timerRef = workspaceRef.collection('activeTimers').doc(memberUid)
  await db.runTransaction(async (transaction) => {
    const [owner, member, timer] = await Promise.all([
      transaction.get(ownerRef),
      transaction.get(memberRef),
      transaction.get(timerRef),
    ])
    if (!owner.exists || owner.data()?.role !== 'owner' || owner.data()?.status === 'removed') {
      throw new HttpsError('permission-denied', 'Only the workspace owner can manage members.')
    }
    if (!member.exists || member.data()?.role !== 'member') {
      throw new HttpsError('not-found', 'This workspace member no longer exists.')
    }
    if (timer.exists && typeof timer.data()?.entryId === 'string') {
      const entryRef = workspaceRef.collection('timeEntries').doc(timer.data()!.entryId as string)
      const entry = await transaction.get(entryRef)
      if (entry.exists && entry.data()?.endAt == null) {
        transaction.update(entryRef, { endAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
      }
    }
    transaction.update(memberRef, { status: 'removed', removedAt: FieldValue.serverTimestamp() })
    if (timer.exists) transaction.delete(timerRef)
  })
  return { memberUid }
})

function matchesTokenHash(token: string, expectedHash: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) return false
  const actualHash = createHash('sha256').update(token).digest()
  const expectedDigest = Buffer.from(expectedHash, 'hex')
  return actualHash.length === expectedDigest.length && timingSafeEqual(actualHash, expectedDigest)
}
