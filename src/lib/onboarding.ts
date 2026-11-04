import type { Catalog } from './catalog'
import type { WorkspaceRole } from './workspaces'

/** The guided steps a new owner walks through after creating a workspace. */
export type SetupStep = 'client' | 'project' | 'task' | 'invite'

export const SETUP_STEPS: readonly SetupStep[] = ['client', 'project', 'task', 'invite']

/**
 * The step after `current`, or null when setup is finished. A task belongs to a project, so the task
 * step only follows when the owner has a project to attach it to; inviting the team always comes last.
 */
export function nextSetupStep(current: SetupStep, hasProject: boolean): SetupStep | null {
  if (current === 'client') return 'project'
  if (current === 'project') return hasProject ? 'task' : 'invite'
  if (current === 'task') return 'invite'
  return null
}

/** What the "Finish setup" card can still offer an owner. */
export type SetupItem = 'project' | 'invite'

/** Who besides the owner is in the workspace: active members (owner included) and pending invitations. */
export type TeamSize = { activeMembers: number; pendingInvitations: number }

/**
 * The setup an owner still has left: a first project, so the timer has something to pick, and a first
 * teammate, so the workspace isn't a solo one. `team` is undefined until it has loaded, and then the
 * invite item stays hidden rather than flashing in.
 */
export function setupItemsLeft(
  role: WorkspaceRole | undefined,
  catalog: Catalog,
  team: TeamSize | undefined,
): SetupItem[] {
  if (role !== 'owner') return []
  const items: SetupItem[] = []
  if (catalog.projects.length === 0) items.push('project')
  if (team && team.activeMembers <= 1 && team.pendingInvitations === 0) items.push('invite')
  return items
}

// Matches the check in the createWorkspaceInvitation callable, so obviously wrong addresses fail before a request.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_EMAIL_LENGTH = 254

export function isValidInviteEmail(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email)
}

/** The addresses in free text separated by commas, semicolons, spaces, or new lines: lowercased, without repeats. */
export function parseInviteEmails(text: string): string[] {
  const emails = text
    .split(/[\s,;]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0)
  return [...new Set(emails)]
}

export type InviteFailure = 'invalid' | 'already-member' | 'already-invited' | 'failed'

/**
 * Sorts a failed createWorkspaceInvitation call into what the owner should be told. The callable reports
 * both "already a member" and "already invited" as `already-exists`, so its message tells them apart.
 */
export function inviteFailureKind(error: unknown): InviteFailure {
  if (!(error instanceof Error)) return 'failed'
  const code = 'code' in error ? String(error.code).replace(/^functions\//, '') : ''
  if (code === 'invalid-argument') return 'invalid'
  if (code === 'already-exists') return /member/i.test(error.message) ? 'already-member' : 'already-invited'
  return 'failed'
}

export type CreatedInvite = { email: string; status: 'created'; link: string }
export type InviteResult = CreatedInvite | { email: string; status: InviteFailure; message: string }

export function isCreatedInvite(result: InviteResult): result is CreatedInvite {
  return result.status === 'created'
}

/**
 * Adds a round of invitation results to the earlier ones. A later attempt for an address replaces its
 * earlier result, except that a created invitation is kept: entering that address again only reports
 * "already invited", and the link created for it must stay available to copy.
 */
export function mergeInviteResults(current: InviteResult[], outcomes: InviteResult[]): InviteResult[] {
  const createdEmails = new Set(current.filter(isCreatedInvite).map((result) => result.email))
  const fresh = outcomes.filter((result) => !createdEmails.has(result.email))
  const replaced = new Set(fresh.map((result) => result.email))
  return [...current.filter((result) => !replaced.has(result.email)), ...fresh]
}

function dismissedKey(uid: string, workspaceId: string): string {
  return `ticknest.setupDismissed.${uid}.${workspaceId}`
}

// Dismissing the reminder is a per-browser convenience, so storage failures (private mode, blocked
// site data) only mean the card shows again.
export function isSetupReminderDismissed(uid: string, workspaceId: string): boolean {
  try {
    return window.localStorage.getItem(dismissedKey(uid, workspaceId)) === 'true'
  } catch {
    return false
  }
}

export function dismissSetupReminder(uid: string, workspaceId: string): void {
  try {
    window.localStorage.setItem(dismissedKey(uid, workspaceId), 'true')
  } catch {
    // See isSetupReminderDismissed.
  }
}
