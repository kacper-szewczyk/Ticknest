import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Timestamp,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { db } from './firebase'

export type Workspace = {
  id: string
  name: string
  ownerUid: string
  role: 'owner' | 'member'
}

type Invitation = {
  email: string
  status: 'pending' | 'accepted' | 'revoked'
  expiresAt: Timestamp
}

function activeWorkspaceKey(uid: string): string {
  return `ticknest.activeWorkspace.${uid}`
}

export function getSavedWorkspaceId(uid: string): string | null {
  return window.localStorage.getItem(activeWorkspaceKey(uid))
}

export function saveActiveWorkspaceId(uid: string, workspaceId: string): void {
  window.localStorage.setItem(activeWorkspaceKey(uid), workspaceId)
}

export async function loadWorkspaces(user: User): Promise<Workspace[]> {
  const memberships = await getDocs(
    query(collectionGroup(db, 'members'), where('uid', '==', user.uid)),
  )
  const workspaces = await Promise.all(
    memberships.docs.map(async (membership) => {
      const workspaceRef = doc(db, 'workspaces', membership.ref.parent.parent!.id)
      const workspaceSnapshot = await getDoc(workspaceRef)
      if (!workspaceSnapshot.exists()) return null
      const workspace = workspaceSnapshot.data()
      return {
        id: workspaceSnapshot.id,
        name: workspace.name as string,
        ownerUid: workspace.ownerUid as string,
        role: membership.data().role as Workspace['role'],
      }
    }),
  )
  return workspaces.filter((workspace): workspace is Workspace => workspace !== null)
}

export async function createWorkspace(user: User, name: string): Promise<string> {
  const workspaceRef = doc(collection(db, 'workspaces'))
  const profileRef = doc(db, 'users', user.uid)
  const memberRef = doc(db, 'workspaces', workspaceRef.id, 'members', user.uid)

  await runTransaction(db, async (transaction) => {
    transaction.set(workspaceRef, {
      name: name.trim(),
      ownerUid: user.uid,
      weekStartsOn: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    transaction.set(memberRef, {
      uid: user.uid,
      email: user.email?.toLowerCase() ?? '',
      displayName: user.displayName ?? '',
      role: 'owner',
      joinedAt: serverTimestamp(),
    })
    transaction.set(
      profileRef,
      {
        displayName: user.displayName ?? '',
        email: user.email?.toLowerCase() ?? '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    )
  })

  saveActiveWorkspaceId(user.uid, workspaceRef.id)
  return workspaceRef.id
}

export async function acceptWorkspaceInvitation(
  user: User,
  workspaceId: string,
  invitationId: string,
): Promise<void> {
  if (!user.emailVerified || !user.email) {
    throw new Error('Verify your email address before accepting a workspace invitation.')
  }

  const invitationRef = doc(db, 'workspaces', workspaceId, 'invitations', invitationId)
  const memberRef = doc(db, 'workspaces', workspaceId, 'members', user.uid)

  await runTransaction(db, async (transaction) => {
    const invitationSnapshot = await transaction.get(invitationRef)
    if (!invitationSnapshot.exists()) throw new Error('This invitation is no longer available.')

    const invitation = invitationSnapshot.data() as Invitation
    if (invitation.email !== user.email?.toLowerCase()) {
      throw new Error('Sign in with the email address that received this invitation.')
    }
    if (invitation.status !== 'pending' || invitation.expiresAt.toMillis() <= Date.now()) {
      throw new Error('This invitation has expired or has already been used.')
    }

    transaction.set(memberRef, {
      uid: user.uid,
      email: user.email.toLowerCase(),
      displayName: user.displayName ?? '',
      role: 'member',
      joinedAt: serverTimestamp(),
    })
    transaction.update(invitationRef, { status: 'accepted', acceptedBy: user.uid })
    transaction.set(
      doc(db, 'users', user.uid),
      {
        displayName: user.displayName ?? '',
        email: user.email.toLowerCase(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })

  saveActiveWorkspaceId(user.uid, workspaceId)
}
