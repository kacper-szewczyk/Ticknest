import type { Catalog } from './catalog'
import type { WorkspaceRole } from './workspaces'

/** The guided steps a new owner walks through after creating a workspace. */
export type SetupStep = 'client' | 'project' | 'task'

export const SETUP_STEPS: readonly SetupStep[] = ['client', 'project', 'task']

/**
 * The step after `current`, or null when setup is finished. A task belongs to a project, so the task
 * step only follows when the owner has a project to attach it to.
 */
export function nextSetupStep(current: SetupStep, hasProject: boolean): SetupStep | null {
  if (current === 'client') return 'project'
  if (current === 'project') return hasProject ? 'task' : null
  return null
}

/** Owners of a workspace without any project still have setup left: the timer has nothing to pick. */
export function hasSetupLeft(role: WorkspaceRole | undefined, catalog: Catalog): boolean {
  return role === 'owner' && catalog.projects.length === 0
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
