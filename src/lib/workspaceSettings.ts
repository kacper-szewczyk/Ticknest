import type { WeekStart } from './dates'

export const WORKSPACE_NAME_MAX_LENGTH = 80

export type WorkspaceSettings = { name: string; weekStartsOn: WeekStart }

/** Returns the trimmed settings, or an error message when they would be rejected by the rules. */
export function validateWorkspaceSettings(
  settings: WorkspaceSettings,
): { ok: true; value: WorkspaceSettings } | { ok: false; error: string } {
  const name = settings.name.trim()
  if (!name) return { ok: false, error: 'Enter a workspace name.' }
  if (name.length > WORKSPACE_NAME_MAX_LENGTH) {
    return { ok: false, error: `Keep the workspace name to ${WORKSPACE_NAME_MAX_LENGTH} characters or fewer.` }
  }
  if (settings.weekStartsOn !== 0 && settings.weekStartsOn !== 1) {
    return { ok: false, error: 'Choose Monday or Sunday as the week start.' }
  }
  return { ok: true, value: { name, weekStartsOn: settings.weekStartsOn } }
}
