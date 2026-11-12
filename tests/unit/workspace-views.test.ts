import { describe, expect, it } from 'vitest'
import {
  type ViewAccess,
  WORKSPACE_VIEWS,
  canOpenView,
  isWorkspaceView,
  resolveView,
} from '../../src/lib/workspaceViews'

const OWNER: ViewAccess = { isOwner: true, seesAllEntries: true, budgetsEnabled: true }
const MANAGER: ViewAccess = { isOwner: false, seesAllEntries: true, budgetsEnabled: true }
const MEMBER: ViewAccess = { isOwner: false, seesAllEntries: false, budgetsEnabled: true }

function openViews(access: ViewAccess): string[] {
  return WORKSPACE_VIEWS.filter((view) => canOpenView(view, access))
}

describe('isWorkspaceView', () => {
  it('accepts known views only', () => {
    expect(isWorkspaceView('budgets')).toBe(true)
    expect(isWorkspaceView('nope')).toBe(false)
    expect(isWorkspaceView('')).toBe(false)
  })
})

describe('canOpenView with budgets on', () => {
  it('opens every view to owners', () => {
    expect(openViews(OWNER)).toEqual([...WORKSPACE_VIEWS])
  })

  it('opens budget management but not the catalog or members to managers', () => {
    expect(openViews(MANAGER)).toEqual([
      'timesheet',
      'dashboard',
      'reports',
      'my-budgets',
      'team-budgets',
      'budgets',
      'settings',
    ])
  })

  it('opens only their own budgets to members', () => {
    expect(openViews(MEMBER)).toEqual(['timesheet', 'dashboard', 'reports', 'my-budgets', 'settings'])
  })
})

describe('canOpenView with budgets off', () => {
  it('hides every budget view, whatever the role', () => {
    for (const access of [OWNER, MANAGER, MEMBER]) {
      const views = openViews({ ...access, budgetsEnabled: false })
      expect(views).not.toContain('my-budgets')
      expect(views).not.toContain('team-budgets')
      expect(views).not.toContain('budgets')
    }
    expect(openViews({ ...OWNER, budgetsEnabled: false })).toEqual([
      'timesheet',
      'dashboard',
      'reports',
      'catalog',
      'members',
      'settings',
    ])
  })
})

describe('resolveView', () => {
  it('keeps a view the user may open', () => {
    expect(resolveView('budgets', OWNER)).toBe('budgets')
  })

  it('falls back to the timesheet for a budget view when budgets are off', () => {
    expect(resolveView('my-budgets', { ...MEMBER, budgetsEnabled: false })).toBe('timesheet')
    expect(resolveView('budgets', { ...OWNER, budgetsEnabled: false })).toBe('timesheet')
  })

  it('falls back to the timesheet for a view the role may not open', () => {
    expect(resolveView('members', MANAGER)).toBe('timesheet')
    expect(resolveView('team-budgets', MEMBER)).toBe('timesheet')
  })
})
