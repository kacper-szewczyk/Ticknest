// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceMember } from '../../src/lib/workspaces'
import { PALETTES } from '../../src/palettes'
import { createAppTheme } from '../../src/theme'

const workspaces = vi.hoisted(() => ({
  createWorkspaceInvitation: vi.fn(),
  removeWorkspaceMember: vi.fn(),
  revokeWorkspaceInvitation: vi.fn(),
  setWorkspaceMemberRole: vi.fn(),
  subscribeToWorkspaceInvitations: vi.fn(),
  subscribeToWorkspaceMembers: vi.fn(),
}))

vi.mock('../../src/lib/workspaces', () => workspaces)

const { MemberManagementPanel } = await import('../../src/MemberManagementPanel')

function member(uid: string, displayName: string, role: WorkspaceMember['role']): WorkspaceMember {
  return { uid, displayName, email: `${uid}@example.com`, role, status: 'active', joinedAt: null }
}

const MEMBERS = [
  member('olivia', 'Olivia Owner', 'owner'),
  member('ben', 'Ben Carter', 'member'),
  member('mia', 'Mia Lopez', 'manager'),
]

function renderPanel() {
  return render(
    <ThemeProvider theme={createAppTheme(PALETTES.forest)}>
      <MemberManagementPanel workspaceId="ws1" currentUserId="olivia" />
    </ThemeProvider>,
  )
}

function row(name: string): HTMLElement {
  const article = screen.getByText(name).closest('article')
  if (!article) throw new Error(`No row for ${name}`)
  return article
}

async function chooseRole(name: string, role: 'Member' | 'Manager') {
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: `Role for ${name}` }))
  await user.click(await screen.findByRole('option', { name: new RegExp(`^${role}`) }))
  return user
}

beforeEach(() => {
  workspaces.subscribeToWorkspaceMembers.mockImplementation((_id: string, onChange: (m: WorkspaceMember[]) => void) => {
    onChange(MEMBERS)
    return () => {}
  })
  workspaces.subscribeToWorkspaceInvitations.mockImplementation((_id: string, onChange: (i: unknown[]) => void) => {
    onChange([])
    return () => {}
  })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

describe('MemberManagementPanel role copy and the budgets flag', () => {
  it('mentions budgets in the manager role while budgets are on', async () => {
    renderPanel()
    await chooseRole('Ben Carter', 'Manager')
    const dialog = await screen.findByRole('dialog', { name: 'Make Ben Carter a manager?' })
    expect(dialog.textContent).toContain('manage budgets')
  })

  it('leaves budgets out of the role copy when budgets are off', async () => {
    vi.stubEnv('VITE_FEATURE_BUDGETS_ENABLED', 'false')
    renderPanel()
    await chooseRole('Ben Carter', 'Manager')
    const dialog = await screen.findByRole('dialog', { name: 'Make Ben Carter a manager?' })
    expect(dialog.textContent).toContain('run reports on everyone')
    expect(document.body.textContent).not.toMatch(/budget/i)
  })
})

describe('MemberManagementPanel roles', () => {
  it('shows each person’s current role as a badge', () => {
    renderPanel()
    expect(within(row('Olivia Owner')).getByText('Owner')).toBeTruthy()
    expect(within(row('Ben Carter')).getAllByText('Member').length).toBeGreaterThan(0)
    expect(within(row('Mia Lopez')).getAllByText('Manager').length).toBeGreaterThan(0)
  })

  it('shows the current role in the control and gives the owner and you no control', () => {
    renderPanel()
    expect(screen.getByRole('combobox', { name: 'Role for Ben Carter' }).textContent).toBe('Member')
    expect(screen.getByRole('combobox', { name: 'Role for Mia Lopez' }).textContent).toBe('Manager')
    expect(screen.queryByRole('combobox', { name: 'Role for Olivia Owner' })).toBeNull()
    expect(screen.queryByText('Make manager')).toBeNull()
    expect(screen.queryByText('Make member')).toBeNull()
  })

  it('confirms before promoting a member and explains what they gain', async () => {
    let finish: () => void = () => {}
    workspaces.setWorkspaceMemberRole.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    renderPanel()

    const user = await chooseRole('Ben Carter', 'Manager')
    const dialog = await screen.findByRole('dialog', { name: 'Make Ben Carter a manager?' })
    expect(dialog.textContent).toContain('see all workspace time entries')
    expect(workspaces.setWorkspaceMemberRole).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Make manager' }))
    expect(workspaces.setWorkspaceMemberRole).toHaveBeenCalledWith('ws1', 'ben', 'manager')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // Only Ben's row is locked while the change is saved.
    expect(screen.getByRole('combobox', { name: 'Role for Ben Carter' }).getAttribute('aria-disabled')).toBe('true')
    expect(within(row('Ben Carter')).getByRole('button', { name: 'Remove' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('combobox', { name: 'Role for Mia Lopez' }).getAttribute('aria-disabled')).toBeNull()
    expect(within(row('Mia Lopez')).getByRole('button', { name: 'Remove' }).hasAttribute('disabled')).toBe(false)

    finish()
    expect(await screen.findByText('Ben Carter is now a manager.')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Role for Ben Carter' }).getAttribute('aria-disabled')).toBeNull()
  })

  it('confirms before demoting a manager and explains what they lose', async () => {
    workspaces.setWorkspaceMemberRole.mockResolvedValue(undefined)
    renderPanel()

    const user = await chooseRole('Mia Lopez', 'Member')
    const dialog = await screen.findByRole('dialog', { name: 'Make Mia Lopez a member?' })
    expect(dialog.textContent).toContain('no longer be able to see other people’s time entries')

    await user.click(within(dialog).getByRole('button', { name: 'Make member' }))
    expect(workspaces.setWorkspaceMemberRole).toHaveBeenCalledWith('ws1', 'mia', 'member')
    expect(await screen.findByText('Mia Lopez is now a member.')).toBeTruthy()
  })

  it('leaves the role unchanged when the confirmation is cancelled', async () => {
    renderPanel()

    const user = await chooseRole('Ben Carter', 'Manager')
    const dialog = await screen.findByRole('dialog', { name: 'Make Ben Carter a manager?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(workspaces.setWorkspaceMemberRole).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox', { name: 'Role for Ben Carter' }).textContent).toBe('Member')
  })

  it('shows the error when the change fails and unlocks the row', async () => {
    workspaces.setWorkspaceMemberRole.mockRejectedValue(new Error('Only the owner can change roles.'))
    renderPanel()

    const user = await chooseRole('Ben Carter', 'Manager')
    const dialog = await screen.findByRole('dialog', { name: 'Make Ben Carter a manager?' })
    await user.click(within(dialog).getByRole('button', { name: 'Make manager' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Only the owner can change roles.')
    expect(screen.queryByText('Ben Carter is now a manager.')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Role for Ben Carter' }).getAttribute('aria-disabled')).toBeNull()
  })

  it('explains roles in the About roles hint', async () => {
    renderPanel()
    const toggle = screen.getByRole('button', { name: 'About roles' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await userEvent.setup().click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Tracks and reports on their own time only.', { selector: 'dd' })).toBeTruthy()
  })
})
