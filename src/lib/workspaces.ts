import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import type { User } from 'firebase/auth'
import { db, functions } from './firebase'

export type Workspace = {
  id: string
  name: string
  ownerUid: string
  role: 'owner' | 'member'
  weekStartsOn: number
}

export type WorkspaceMember = {
  uid: string
  email: string
  displayName: string
  role: 'owner' | 'member'
  status?: 'active' | 'removed'
  joinedAt: unknown
}
export type WorkspaceInvitation = {
  id: string
  email: string
  role: 'member'
  status: 'pending' | 'accepted' | 'revoked'
  expiresAt: { toDate(): Date }
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

export function subscribeToMembershipStatus(workspaceId: string, uid: string, onRemoved: () => void): Unsubscribe {
  return onSnapshot(doc(db, 'workspaces', workspaceId, 'members', uid), (snapshot) => {
    if (snapshot.exists() && snapshot.data().status === 'removed') onRemoved()
  })
}

export async function loadWorkspaces(user: User): Promise<Workspace[]> {
  const memberships = await getDocs(query(collectionGroup(db, 'members'), where('uid', '==', user.uid)))
  const workspaces = await Promise.all(
    memberships.docs
      .filter((membership) => membership.data().status !== 'removed')
      .map(async (membership) => {
        const workspaceRef = doc(db, 'workspaces', membership.ref.parent.parent!.id)
        const workspaceSnapshot = await getDoc(workspaceRef)
        if (!workspaceSnapshot.exists()) return null
        const workspace = workspaceSnapshot.data()
        return {
          id: workspaceSnapshot.id,
          name: workspace.name as string,
          ownerUid: workspace.ownerUid as string,
          role: membership.data().role as Workspace['role'],
          weekStartsOn: typeof workspace.weekStartsOn === 'number' ? workspace.weekStartsOn : 1,
        }
      }),
  )
  return workspaces.filter((workspace): workspace is Workspace => workspace !== null)
}

export async function createWorkspace(user: User, name: string): Promise<string> {
  const createWorkspaceCall = httpsCallable<
    { name: string; displayName: string; timezone: string },
    { workspaceId: string }
  >(functions, 'createWorkspace')
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const result = await createWorkspaceCall({ name, displayName: user.displayName ?? '', timezone })
  saveActiveWorkspaceId(user.uid, result.data.workspaceId)
  return result.data.workspaceId
}

export async function acceptWorkspaceInvitation(
  user: User,
  workspaceId: string,
  invitationId: string,
  token: string,
): Promise<void> {
  if (!user.emailVerified || !user.email) {
    throw new Error('Verify your email address before accepting a workspace invitation.')
  }

  const acceptInvitationCall = httpsCallable<
    { workspaceId: string; invitationId: string; token: string; displayName: string; timezone: string },
    { workspaceId: string }
  >(functions, 'acceptWorkspaceInvitation')
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  await acceptInvitationCall({ workspaceId, invitationId, token, displayName: user.displayName ?? '', timezone })
  saveActiveWorkspaceId(user.uid, workspaceId)
}

export function subscribeToWorkspaceMembers(
  workspaceId: string,
  onChange: (members: WorkspaceMember[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'workspaces', workspaceId, 'members'),
    (snapshot) => {
      onChange(snapshot.docs.map((item) => ({ uid: item.id, ...item.data() }) as WorkspaceMember))
    },
    onError,
  )
}

export function subscribeToWorkspaceInvitations(
  workspaceId: string,
  onChange: (invitations: WorkspaceInvitation[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'workspaces', workspaceId, 'invitations'), where('status', '==', 'pending')),
    (snapshot) => {
      onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as WorkspaceInvitation))
    },
    onError,
  )
}

export async function createWorkspaceInvitation(
  workspaceId: string,
  email: string,
): Promise<{ invitationId: string; token: string; expiresAt: number }> {
  const call = httpsCallable<
    { workspaceId: string; email: string },
    { invitationId: string; token: string; expiresAt: number }
  >(functions, 'createWorkspaceInvitation')
  return (await call({ workspaceId, email })).data
}

export async function revokeWorkspaceInvitation(workspaceId: string, invitationId: string): Promise<void> {
  const call = httpsCallable<{ workspaceId: string; invitationId: string }, { invitationId: string }>(
    functions,
    'revokeWorkspaceInvitation',
  )
  await call({ workspaceId, invitationId })
}

export async function removeWorkspaceMember(workspaceId: string, memberUid: string): Promise<void> {
  const call = httpsCallable<{ workspaceId: string; memberUid: string }, { memberUid: string }>(
    functions,
    'removeWorkspaceMember',
  )
  await call({ workspaceId, memberUid })
}
