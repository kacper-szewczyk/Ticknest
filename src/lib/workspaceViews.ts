/** The pages of a workspace, and which of them the signed-in user may open. */
export type WorkspaceView =
  | 'timesheet'
  | 'dashboard'
  | 'reports'
  | 'my-budgets'
  | 'team-budgets'
  | 'budgets'
  | 'time-off'
  | 'time-off-approvals'
  | 'team-time-off'
  | 'catalog'
  | 'members'
  | 'settings'

export const WORKSPACE_VIEWS: readonly WorkspaceView[] = [
  'timesheet',
  'dashboard',
  'reports',
  'my-budgets',
  'team-budgets',
  'budgets',
  'time-off',
  'time-off-approvals',
  'team-time-off',
  'catalog',
  'members',
  'settings',
]

/** Where a user lands when the requested view is unknown or not open to them. */
export const DEFAULT_VIEW: WorkspaceView = 'timesheet'

const OWNER_VIEWS: readonly WorkspaceView[] = ['catalog', 'members']

// Owners and managers manage budgets, follow everyone's progress on them, and decide time off.
const MANAGER_VIEWS: readonly WorkspaceView[] = ['team-budgets', 'budgets', 'time-off-approvals', 'team-time-off']

const BUDGET_VIEWS: readonly WorkspaceView[] = ['my-budgets', 'team-budgets', 'budgets']

const TIME_OFF_VIEWS: readonly WorkspaceView[] = ['time-off', 'time-off-approvals', 'team-time-off']

export type ViewAccess = { isOwner: boolean; seesAllEntries: boolean; budgetsEnabled: boolean; timeOffEnabled: boolean }

export function isWorkspaceView(value: string): value is WorkspaceView {
  return (WORKSPACE_VIEWS as readonly string[]).includes(value)
}

export function canOpenView(view: WorkspaceView, access: ViewAccess): boolean {
  if (!access.budgetsEnabled && BUDGET_VIEWS.includes(view)) return false
  if (!access.timeOffEnabled && TIME_OFF_VIEWS.includes(view)) return false
  if (!access.isOwner && OWNER_VIEWS.includes(view)) return false
  if (!access.seesAllEntries && MANAGER_VIEWS.includes(view)) return false
  return true
}

/** The view to show: the requested one when the user may open it, otherwise the default view. */
export function resolveView(view: WorkspaceView, access: ViewAccess): WorkspaceView {
  return canOpenView(view, access) ? view : DEFAULT_VIEW
}
