import { createHash, timingSafeEqual } from 'node:crypto'
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
    if (memberSnapshot.exists) throw new HttpsError('already-exists', 'You already belong to this workspace.')

    const invitation = invitationSnapshot.data()
    const expiresAt = invitation?.expiresAt
    if (
      invitation?.status !== 'pending'
      || invitation.role !== 'member'
      || typeof invitation.email !== 'string'
      || invitation.email.toLowerCase() !== user.email
      || typeof invitation.tokenHash !== 'string'
      || !matchesTokenHash(invitationToken, invitation.tokenHash)
      || !(expiresAt instanceof Timestamp)
      || expiresAt.toMillis() <= Date.now()
    ) {
      throw new HttpsError('failed-precondition', 'This invitation has expired or is not for your account.')
    }

    const now = FieldValue.serverTimestamp()
    transaction.create(memberRef, {
      uid: user.uid,
      email: user.email,
      displayName,
      role: 'member',
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

function matchesTokenHash(token: string, expectedHash: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) return false
  const actualHash = createHash('sha256').update(token).digest()
  const expectedDigest = Buffer.from(expectedHash, 'hex')
  return actualHash.length === expectedDigest.length && timingSafeEqual(actualHash, expectedDigest)
}
