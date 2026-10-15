import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import type { User } from 'firebase/auth'
import { db, functions } from './firebase'

export type Workspace = {
  id: string
  name: string
  ownerUid: string
  role: 'owner' | 'member'
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
