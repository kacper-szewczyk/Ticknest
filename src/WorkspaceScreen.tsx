import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { type Theme, alpha } from '@mui/material/styles'
import { type User, sendEmailVerification } from 'firebase/auth'
import { type ChangeEvent, type FormEvent, lazy, Suspense, useEffect, useState } from 'react'
import { deleteCurrentAccount, getReauthMethod, signOutUser } from './lib/auth'
import { type Catalog, subscribeToCatalog } from './lib/catalog'
import { readableError } from './lib/errors'
import {
  type Workspace,
  acceptWorkspaceInvitation,
  createWorkspace,
  getSavedWorkspaceId,
  loadWorkspaces,
  saveActiveWorkspaceId,
  subscribeToMembershipStatus,
} from './lib/workspaces'
import { AppShell, NavIcon, type NavItem } from './AppShell'
import { AppearancePanel } from './AppearancePanel'
import { Brand } from './Brand'
import { CatalogPanel } from './CatalogPanel'
import { TimeEntriesPanel } from './TimeEntriesPanel'
import { TimerBar } from './TimerBar'
import { TimesheetDashboard } from './TimesheetDashboard'
import { FormMessage, LoadingState } from './ui'

// Reports and member management are visited less often, so they load on demand to keep the initial bundle small.
const ReportsPanel = lazy(() => import('./ReportsPanel').then((module) => ({ default: module.ReportsPanel })))
const MemberManagementPanel = lazy(() =>
  import('./MemberManagementPanel').then((module) => ({ default: module.MemberManagementPanel })),
)

type WorkspaceView = 'timesheet' | 'dashboard' | 'reports' | 'catalog' | 'members' | 'settings'

const WORKSPACE_VIEWS: WorkspaceView[] = ['timesheet', 'dashboard', 'reports', 'catalog', 'members', 'settings']

const OWNER_VIEWS: WorkspaceView[] = ['catalog', 'members']

// The current page lives in the URL hash so refreshes and the back button keep it.
function viewFromHash(): WorkspaceView | null {
  const hash = window.location.hash.slice(1)
  return (WORKSPACE_VIEWS as string[]).includes(hash) ? (hash as WorkspaceView) : null
}

export function WorkspaceScreen({ user }: { user: User }) {
  // undefined until the first membership read finishes, so an empty list really means "no workspace yet".
  const [workspaces, setWorkspaces] = useState<Workspace[] | undefined>()
  const [activeId, setActiveId] = useState<string | null>(getSavedWorkspaceId(user.uid))
  const [workspaceName, setWorkspaceName] = useState('')
  const [inviteLink, setInviteLink] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.has('workspace') && params.has('invite') ? window.location.href : ''
  })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [catalog, setCatalog] = useState<Catalog>({ clients: [], projects: [], tasks: [] })
  const [view, setView] = useState<WorkspaceView>(() => viewFromHash() ?? (inviteLink ? 'settings' : 'timesheet'))

  useEffect(() => {
    const syncView = () => setView(viewFromHash() ?? 'timesheet')
    window.addEventListener('hashchange', syncView)
    return () => window.removeEventListener('hashchange', syncView)
  }, [])

  useEffect(() => {
    if (!activeId) return
    return subscribeToCatalog(activeId, setCatalog, (loadError) => setError(readableError(loadError)))
  }, [activeId])

  async function refreshWorkspaces() {
    const found = await loadWorkspaces(user)
    setWorkspaces(found)
    const requestedId = getSavedWorkspaceId(user.uid)
    if (requestedId && found.some((workspace) => workspace.id === requestedId)) setActiveId(requestedId)
    else if (found[0]) {
      setActiveId(found[0].id)
      saveActiveWorkspaceId(user.uid, found[0].id)
    } else setActiveId(null)
  }

  useEffect(() => {
    if (!activeId) return
    return subscribeToMembershipStatus(activeId, user.uid, () => {
      void refreshWorkspaces().catch((loadError: unknown) => setError(readableError(loadError)))
    })
    // Follow the currently selected workspace membership.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, user.uid])

  useEffect(() => {
    void refreshWorkspaces().catch((loadError: unknown) => {
      setError(readableError(loadError))
      setWorkspaces((current) => current ?? [])
    })
    // Initial membership load for this authenticated account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      const id = await createWorkspace(user, workspaceName)
      setWorkspaceName('')
      setActiveId(id)
      await refreshWorkspaces()
    } catch (requestError) {
      setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  async function handleAcceptInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    setNotice('')
    try {
      const url = new URL(inviteLink)
      const workspaceId = url.searchParams.get('workspace')
      const invitationId = url.searchParams.get('invite')
      const token = url.searchParams.get('token')
      if (!workspaceId || !invitationId || !token) throw new Error('That invitation link is not valid.')
      await acceptWorkspaceInvitation(user, workspaceId, invitationId, token)
      setInviteLink('')
      await refreshWorkspaces()
      setNotice('You joined the workspace.')
    } catch (requestError) {
      setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  async function handleDeleteAccount() {
    const method = getReauthMethod(user)
    setError('')
    if (!method) {
      setError(
        'Account deletion needs a Google or email/password sign-in. Sign out and sign in with one of those methods, then try again.',
      )
      return
    }
    const confirmed = window.confirm(
      `Delete this Ticknest account? This will sign you out. Workspace data is retained in the Firebase project.\n\n${method === 'google' ? 'You’ll be asked to confirm with Google next.' : 'You’ll be asked for your password next.'}`,
    )
    if (!confirmed) return
    let password: string | undefined
    if (method === 'password') {
      const entered = window.prompt('Enter your password to confirm account deletion.')
      if (entered === null) return
      if (!entered) {
        setError('Enter your password to confirm account deletion.')
        return
      }
      password = entered
    }
    setPending(true)
    try {
      await deleteCurrentAccount(user, method, password)
    } catch (requestError) {
      setError(`Your account was not deleted. ${readableError(requestError)}`)
    } finally {
      setPending(false)
    }
  }

  const activeWorkspace = workspaces?.find((workspace) => workspace.id === activeId)
  const isOwner = activeWorkspace?.role === 'owner'
  const currentView: WorkspaceView = !isOwner && OWNER_VIEWS.includes(view) ? 'timesheet' : view
  const navItems: NavItem<WorkspaceView>[] = activeWorkspace
    ? [
        { value: 'timesheet', label: 'Timesheet', icon: navIcons.timesheet, section: 'Track' },
        {
          value: 'dashboard',
          label: isOwner ? 'Team dashboard' : 'Dashboard',
          icon: navIcons.dashboard,
          section: 'Analyze',
        },
        { value: 'reports', label: 'Reports', icon: navIcons.reports, section: 'Analyze' },
        ...(isOwner
          ? ([
              { value: 'catalog', label: 'Clients & projects', icon: navIcons.catalog, section: 'Manage' },
              { value: 'members', label: 'Members', icon: navIcons.members, section: 'Manage' },
            ] satisfies NavItem<WorkspaceView>[])
          : []),
        { value: 'settings', label: 'Settings', icon: navIcons.settings, section: 'Account' },
      ]
    : []

  function navigate(next: WorkspaceView) {
    setError('')
    setNotice('')
    window.location.hash = next
    setView(next)
  }

  const joinWorkspaceForm = (
    <Paper
      component="form"
      variant="outlined"
      onSubmit={handleAcceptInvite}
      sx={{
        display: 'grid',
        gap: 1.5,
        maxWidth: 750,
        mx: 'auto',
        mt: 2.25,
        p: { xs: 2.25, sm: 4 },
        borderRadius: '18px',
      }}
    >
      <div>
        <Typography variant="h2" sx={{ fontSize: 22 }}>
          Join another workspace
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Paste an invitation link sent to your email.
        </Typography>
      </div>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
        <TextField
          type="url"
          value={inviteLink}
          onChange={(event) => setInviteLink(event.target.value)}
          required
          placeholder="https://…?workspace=…&invite=…&token=…"
          slotProps={{ htmlInput: { 'aria-label': 'Invitation link' } }}
        />
        <Button variant="outlined" type="submit" disabled={pending || !user.emailVerified} sx={{ flex: '0 0 auto' }}>
          Accept invitation
        </Button>
      </Stack>
    </Paper>
  )

  const workspaceSwitcher =
    workspaces && workspaces.length > 0 ? (
      <Box component="label" sx={{ display: 'grid', gap: 0.5, px: 1 }}>
        <Typography
          component="span"
          sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'app.sidebar.muted' }}
        >
          WORKSPACE
        </Typography>
        <Box
          component="select"
          value={activeId ?? ''}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            setActiveId(event.target.value)
            saveActiveWorkspaceId(user.uid, event.target.value)
          }}
          sx={{
            width: '100%',
            minHeight: 40,
            px: 1.25,
            borderRadius: '9px',
            border: '1px solid',
            borderColor: (theme) => alpha(theme.palette.app.sidebar.strong, 0.16),
            bgcolor: (theme) => alpha(theme.palette.app.sidebar.strong, 0.06),
            color: 'app.sidebar.strong',
            font: 'inherit',
            fontSize: 14,
            fontWeight: 600,
            '&:focus-visible': {
              outline: (theme) => `3px solid ${theme.palette.app.sidebar.accent}`,
              outlineOffset: 1,
            },
            '& option': { color: 'text.primary', bgcolor: 'background.paper' },
          }}
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </Box>
      </Box>
    ) : null

  const sidebarFooter = (
    <Stack spacing={1.25}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', px: 1, py: 0.5, minWidth: 0 }}>
        <Box
          aria-hidden="true"
          sx={{
            display: 'grid',
            placeItems: 'center',
            width: 36,
            height: 36,
            flexShrink: 0,
            borderRadius: '50%',
            bgcolor: 'app.sidebar.avatarBg',
            color: 'app.sidebar.avatarText',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {(user.displayName || user.email || '?').trim().charAt(0).toUpperCase()}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" noWrap sx={{ color: 'app.sidebar.strong', fontWeight: 600 }}>
            {user.displayName || 'Your account'}
          </Typography>
          <Typography variant="caption" noWrap sx={{ display: 'block', color: 'app.sidebar.muted' }}>
            {user.email}
          </Typography>
        </Box>
      </Stack>
      <Button
        size="small"
        onClick={() => void signOutUser()}
        sx={{
          minHeight: 36,
          color: 'app.sidebar.text',
          justifyContent: 'flex-start',
          px: 1,
          '&:hover': { bgcolor: (theme) => alpha(theme.palette.app.sidebar.strong, 0.09) },
        }}
      >
        Sign out
      </Button>
      <Typography variant="caption" sx={{ px: 1, color: 'app.sidebar.faint' }}>
        Ticknest v{__APP_VERSION__}
      </Typography>
    </Stack>
  )

  return (
    <AppShell
      brand={<Brand tone="light" />}
      header={workspaceSwitcher}
      topBar={
        activeWorkspace && (
          <TimerBar key={activeWorkspace.id} user={user} workspaceId={activeWorkspace.id} catalog={catalog} />
        )
      }
      items={navItems}
      active={activeWorkspace ? currentView : null}
      onNavigate={navigate}
      footer={sidebarFooter}
    >
      <Box
        component="main"
        sx={{
          width: { xs: 'calc(100% - 24px)', sm: 'calc(100% - 36px)', md: 'calc(100% - 64px)' },
          maxWidth: activeWorkspace && currentView === 'dashboard' ? 1120 : 960,
          mx: 'auto',
          pt: { xs: 3, md: 5 },
          pb: 5,
        }}
      >
        {error && <FormMessage severity="error">{error}</FormMessage>}
        {notice && <FormMessage severity="success">{notice}</FormMessage>}
        {!user.emailVerified && <EmailVerificationNotice user={user} />}
        {activeWorkspace ? (
          <>
            {currentView === 'timesheet' && (
              <TimeEntriesPanel
                user={user}
                workspaceId={activeWorkspace.id}
                isOwner={isOwner}
                weekStartsOn={activeWorkspace.weekStartsOn}
                catalog={catalog}
              />
            )}
            {currentView === 'dashboard' && (
              <TimesheetDashboard
                key={activeWorkspace.id}
                user={user}
                workspaceId={activeWorkspace.id}
                isOwner={isOwner}
                weekStartsOn={activeWorkspace.weekStartsOn}
                catalog={catalog}
              />
            )}
            {currentView === 'reports' && (
              <Suspense fallback={<LoadingState label="Loading…" sx={{ py: 8 }} />}>
                <ReportsPanel user={user} workspaceId={activeWorkspace.id} isOwner={isOwner} catalog={catalog} />
              </Suspense>
            )}
            {currentView === 'catalog' && <CatalogPanel workspaceId={activeWorkspace.id} />}
            {currentView === 'members' && (
              <Suspense fallback={<LoadingState label="Loading…" sx={{ py: 8 }} />}>
                <MemberManagementPanel
                  key={activeWorkspace.id}
                  workspaceId={activeWorkspace.id}
                  currentUserId={user.uid}
                />
              </Suspense>
            )}
            {currentView === 'settings' && (
              <>
                <Paper
                  component="section"
                  variant="outlined"
                  sx={{ maxWidth: 750, mx: 'auto', mt: 2.25, p: { xs: 2.25, sm: 4 }, borderRadius: '18px' }}
                >
                  <Typography variant="overline" component="p">
                    YOUR WORKSPACE
                  </Typography>
                  <Typography variant="h2" sx={{ my: 1, overflowWrap: 'anywhere' }}>
                    {activeWorkspace.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    Signed in as {user.email}.
                    {(workspaces?.length ?? 0) > 1 && ' Switch workspaces from the menu at the top of the sidebar.'}
                  </Typography>
                  <Chip
                    variant="outlined"
                    color="success"
                    icon={
                      <Box
                        component="span"
                        sx={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          bgcolor: 'success.main',
                          boxShadow: (theme) => `0 0 0 3px ${alpha(theme.palette.success.main, 0.13)}`,
                        }}
                      />
                    }
                    label={isOwner ? 'Workspace owner' : 'Workspace member'}
                    sx={{ mt: 2, pl: 0.75 }}
                  />
                </Paper>
                <AppearancePanel user={user} />
                {joinWorkspaceForm}
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  sx={{
                    maxWidth: 750,
                    mx: 'auto',
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    justifyContent: 'space-between',
                    gap: { xs: 0.75, sm: 2 },
                    mt: 4,
                    pt: 2,
                    borderTop: 1,
                    borderColor: 'divider',
                  }}
                >
                  <Button size="small" color="error" onClick={() => void handleDeleteAccount()} disabled={pending}>
                    Delete account
                  </Button>
                  <Typography variant="caption" color="text.secondary">
                    Workspace data stays in the Firebase project selected by its owner.
                  </Typography>
                </Stack>
              </>
            )}
          </>
        ) : workspaces === undefined ? (
          <PanelLoading />
        ) : (
          <Box component="section" sx={{ maxWidth: 860, mx: 'auto', mt: 3 }}>
            <Box sx={{ mb: 3.75 }}>
              <Typography variant="overline" component="p">
                ONE LAST STEP
              </Typography>
              <Typography variant="h1" sx={{ my: 1.5 }}>
                Set up your workspace
              </Typography>
              <Typography color="text.secondary" sx={{ maxWidth: 530, lineHeight: 1.6 }}>
                Hi {user.displayName?.split(' ')[0] ?? 'there'} — create a new workspace or join one you’ve been invited
                to.
              </Typography>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <Paper
                component="form"
                variant="outlined"
                onSubmit={handleCreate}
                aria-busy={pending}
                sx={onboardingCardSx}
              >
                <Box
                  component="span"
                  aria-hidden="true"
                  sx={{ ...cardIconSx, bgcolor: 'app.accentSoft', color: 'app.accentSoftText' }}
                >
                  ✳
                </Box>
                <Typography variant="h2" sx={{ fontSize: 23 }}>
                  Create a workspace
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  You’ll be the owner and can invite people later.
                </Typography>
                <TextField
                  label="Workspace name"
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  required
                  placeholder="e.g. Acme Studio"
                  slotProps={{ htmlInput: { maxLength: 80 } }}
                />
                <Button variant="contained" type="submit" disabled={pending}>
                  Create workspace
                </Button>
              </Paper>
              <Paper
                component="form"
                variant="outlined"
                onSubmit={handleAcceptInvite}
                aria-busy={pending}
                sx={onboardingCardSx}
              >
                <Box
                  component="span"
                  aria-hidden="true"
                  sx={{ ...cardIconSx, bgcolor: 'app.warmSoft', color: 'app.warmSoftText' }}
                >
                  ↗
                </Box>
                <Typography variant="h2" sx={{ fontSize: 23 }}>
                  Join a workspace
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Paste the invitation link sent to your email.
                </Typography>
                <TextField
                  label="Invitation link"
                  type="url"
                  value={inviteLink}
                  onChange={(event) => setInviteLink(event.target.value)}
                  required
                  placeholder="https://…?workspace=…&invite=…&token=…"
                  helperText={user.emailVerified ? undefined : 'Verify your email before accepting an invitation.'}
                />
                <Button variant="outlined" type="submit" disabled={pending || !user.emailVerified}>
                  Accept invitation
                </Button>
              </Paper>
            </Box>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              sx={{
                alignItems: { xs: 'flex-start', sm: 'center' },
                justifyContent: 'space-between',
                gap: { xs: 0.75, sm: 2 },
                mt: 6,
                pt: 2,
                borderTop: 1,
                borderColor: 'divider',
              }}
            >
              <Button size="small" color="error" onClick={() => void handleDeleteAccount()} disabled={pending}>
                Delete account
              </Button>
              <Typography variant="caption" color="text.secondary">
                Workspace data stays in the Firebase project selected by its owner.
              </Typography>
            </Stack>
          </Box>
        )}
      </Box>
    </AppShell>
  )
}

const navIcons = {
  timesheet: (
    <NavIcon>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </NavIcon>
  ),
  dashboard: (
    <NavIcon>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </NavIcon>
  ),
  reports: (
    <NavIcon>
      <path d="M5 20V11M12 20V5M19 20v-6M3 20h18" />
    </NavIcon>
  ),
  catalog: (
    <NavIcon>
      <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    </NavIcon>
  ),
  members: (
    <NavIcon>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
    </NavIcon>
  ),
  settings: (
    <NavIcon>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </NavIcon>
  ),
}

const onboardingCardSx = {
  display: 'grid',
  alignContent: 'start',
  gap: 2,
  p: 3,
  borderRadius: '16px',
  bgcolor: (theme: Theme) => alpha(theme.palette.background.paper, 0.8),
}

const cardIconSx = { display: 'grid', width: 34, height: 34, placeItems: 'center', borderRadius: '11px', fontSize: 17 }

function EmailVerificationNotice({ user }: { user: User }) {
  const [message, setMessage] = useState(
    'Check your inbox for a verification link. Verify your email before accepting an invitation.',
  )
  const [pending, setPending] = useState(false)
  return (
    <Alert
      severity="warning"
      role="status"
      sx={{ mb: 2.5, alignItems: 'center' }}
      action={
        <Button
          size="small"
          color="inherit"
          disabled={pending}
          onClick={() => {
            setPending(true)
            void sendEmailVerification(user)
              .then(() => setMessage('A new verification link has been sent.'))
              .catch((error: unknown) => setMessage(readableError(error)))
              .finally(() => setPending(false))
          }}
        >
          Resend email
        </Button>
      }
    >
      {message}
    </Alert>
  )
}
