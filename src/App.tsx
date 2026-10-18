import { onAuthStateChanged, sendEmailVerification, type User } from 'firebase/auth'
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha, type Theme } from '@mui/material/styles'
import {
  acceptWorkspaceInvitation,
  createWorkspace,
  getSavedWorkspaceId,
  loadWorkspaces,
  saveActiveWorkspaceId,
  subscribeToMembershipStatus,
  type Workspace,
} from './lib/workspaces'
import {
  deleteCurrentAccount,
  getReauthMethod,
  registerWithEmail,
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
} from './lib/auth'
import { auth } from './lib/firebase'
import {
  continueTimer,
  deleteTimeEntry,
  saveManualTimeEntry,
  startTimer,
  stopTimer,
  subscribeToEntriesForRange,
  subscribeToTimeEntries,
  type TimeEntry,
} from './lib/timeEntries'
import { subscribeToCatalog, type Catalog } from './lib/catalog'
import {
  dateTimeForDay,
  formatDuration,
  formatWeekLabel,
  localDateTimeValue,
  localDayString,
  shiftDayString,
  startOfWeekString,
} from './lib/dates'
import { CatalogPanel } from './CatalogPanel'
import { MemberManagementPanel } from './MemberManagementPanel'
import { ReportsPanel } from './ReportsPanel'
import { TimesheetDashboard } from './TimesheetDashboard'
import { useManualEntryFieldErrors } from './useManualEntryFieldErrors'
import { AppearancePanel } from './AppearancePanel'
import { subscribeToPalettePreference } from './lib/userPreferences'
import { usePalette } from './paletteContext'
import { AppShell, NavIcon, type NavItem } from './AppShell'
import { BillableChip, EmptyText, FormMessage, SectionCard, SectionHeading, SelectField } from './ui'

type AuthMode = 'sign-in' | 'sign-up' | 'reset'
type WorkspaceView = 'timesheet' | 'dashboard' | 'reports' | 'catalog' | 'members' | 'settings'

const WORKSPACE_VIEWS: WorkspaceView[] = ['timesheet', 'dashboard', 'reports', 'catalog', 'members', 'settings']
const OWNER_VIEWS: WorkspaceView[] = ['catalog', 'members']

// The current page lives in the URL hash so refreshes and the back button keep it.
function viewFromHash(): WorkspaceView | null {
  const hash = window.location.hash.slice(1)
  return (WORKSPACE_VIEWS as string[]).includes(hash) ? (hash as WorkspaceView) : null
}

function readableError(error: unknown): string {
  if (!(error instanceof Error)) return 'Something went wrong. Please try again.'
  const code = 'code' in error ? String(error.code) : ''
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'An account already exists for this email. Sign in instead.',
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/network-request-failed':
      'Ticknest couldn’t reach Firebase Authentication. Check your internet connection and try again. If you use a VPN, firewall, or privacy extension, make sure it allows this site to connect to Firebase.',
    'auth/weak-password': 'Choose a password with at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'auth/user-disabled': 'This account is disabled. Contact the workspace administrator.',
    'auth/unauthorized-domain':
      'This site is not authorized for Firebase sign-in. Add its domain in Firebase Authentication settings.',
    'auth/requires-recent-login': 'Sign in again before deleting your account.',
    'auth/wrong-password': 'The password is incorrect.',
    'auth/missing-password': 'Enter your password to confirm account deletion.',
    'auth/user-mismatch': 'Choose the Google account you signed in with, then try deleting your account again.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
    'auth/popup-blocked': 'Allow pop-ups for this site, then try Google sign-in again.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Authentication.',
    'auth/account-exists-with-different-credential':
      'An account already exists with this email. Sign in with your original method, then link Google in account settings.',
    'functions/internal':
      'The workspace service is not available in this Firebase project yet. Deploy the Firebase Functions, then try again.',
    'functions/not-found':
      'The workspace service is not deployed in this Firebase project. Deploy the Firebase Functions, then try again.',
    'functions/unavailable': 'The workspace service is temporarily unavailable. Try again in a moment.',
    'permission-denied': 'You do not have access to this workspace.',
  }
  if (messages[code]) return messages[code]
  if (code.startsWith('auth/'))
    return 'We couldn’t sign you in. Please try again. If the problem continues, check the Firebase Authentication settings.'
  return error.message
}

function Brand({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  return (
    <Link
      href="/"
      aria-label="Ticknest home"
      underline="none"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1.25,
        color: tone === 'light' ? 'app.sidebar.strong' : 'text.primary',
        fontSize: 20,
        fontWeight: 700,
        letterSpacing: '-0.8px',
      }}
    >
      <Box
        component="span"
        aria-hidden="true"
        sx={{
          display: 'grid',
          width: 30,
          height: 30,
          placeItems: 'center',
          borderRadius: '10px',
          bgcolor: tone === 'light' ? 'app.sidebar.strong' : 'primary.main',
        }}
      >
        <Box
          component="svg"
          viewBox="0 0 24 24"
          fill="none"
          sx={{
            width: 19,
            stroke: (theme) => (tone === 'light' ? theme.palette.app.sidebar.bg : theme.palette.primary.contrastText),
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            strokeWidth: 2.5,
          }}
        >
          <path d="M5 13.5 9.2 18 19 6" />
        </Box>
      </Box>
      <span>ticknest</span>
    </Link>
  )
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    setPending(true)
    try {
      if (mode === 'reset') {
        await sendPasswordReset(email)
        setNotice('If an account exists for that address, a reset link is on its way.')
      } else if (mode === 'sign-up') {
        const user = await registerWithEmail(name, email, password)
        onAuthenticated(user)
      } else {
        const user = await signInWithEmail(email, password)
        onAuthenticated(user)
      }
    } catch (requestError) {
      setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  async function handleGoogleSignIn() {
    setError('')
    setNotice('')
    setPending(true)
    try {
      onAuthenticated(await signInWithGoogle())
    } catch (requestError) {
      setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  const isReset = mode === 'reset'
  const isSignUp = mode === 'sign-up'

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(300px, .92fr) 1.08fr' },
        bgcolor: 'background.paper',
      }}
    >
      <Box
        component="section"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: { md: '100vh' },
          px: { xs: 3, md: 'clamp(32px, 7vw, 96px)' },
          py: { xs: 3, md: 4.75 },
          overflow: 'hidden',
          background: (theme) =>
            `radial-gradient(ellipse at 20% 15%, ${alpha(theme.palette.app.glow, 0.78)}, transparent 45%), ${theme.palette.background.default}`,
        }}
      >
        <Brand />
        <Box sx={{ maxWidth: 450, my: { xs: 5, md: 'auto' }, py: { md: 9 } }}>
          <Typography variant="overline" component="p">
            YOUR TIME, YOUR INFRASTRUCTURE
          </Typography>
          <Typography variant="h1" sx={{ mt: 3, mb: 2.5, fontSize: 'clamp(43px, 5vw, 74px)' }}>
            Make room for{' '}
            <Box component="span" sx={{ color: 'primary.light' }}>
              the work that matters.
            </Box>
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 360, lineHeight: 1.7 }}>
            Track time with a team workspace that lives in your own Firebase project.
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
          Open source · Self-hosted · No seat limits
        </Typography>
      </Box>
      <Box
        component="section"
        aria-labelledby="auth-heading"
        sx={{
          display: 'grid',
          placeItems: 'center',
          px: { xs: 3, md: 4 },
          pt: { xs: 5.5, md: 6.5 },
          pb: { xs: 8, md: 6.5 },
        }}
      >
        <Box sx={{ width: 'min(390px, 100%)' }}>
          <Typography variant="overline" component="p">
            {isReset ? 'ACCOUNT RECOVERY' : 'WELCOME TO TICKNEST'}
          </Typography>
          <Typography variant="h2" id="auth-heading" sx={{ fontSize: 34, mt: 1, mb: 1 }}>
            {isReset ? 'Reset your password' : isSignUp ? 'Create your account' : 'Welcome back'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3.5, lineHeight: 1.6 }}>
            {isReset
              ? 'We’ll email you a secure link to choose a new password.'
              : isSignUp
                ? 'Start a workspace for your team in just a moment.'
                : 'Sign in to continue to your workspace.'}
          </Typography>
          {mode !== 'reset' && (
            <>
              <Button
                variant="outlined"
                color="inherit"
                fullWidth
                onClick={() => void handleGoogleSignIn()}
                disabled={pending}
                startIcon={
                  <Box
                    component="span"
                    aria-hidden="true"
                    sx={{
                      display: 'grid',
                      width: 20,
                      height: 20,
                      placeItems: 'center',
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: '50%',
                      color: '#4285f4',
                      fontSize: 13,
                      fontWeight: 750,
                    }}
                  >
                    G
                  </Box>
                }
              >
                {pending ? 'Connecting…' : 'Continue with Google'}
              </Button>
              <Divider sx={{ my: 2.25, color: 'text.secondary', fontSize: 11 }}>or use email</Divider>
            </>
          )}
          <Stack component="form" spacing={2} onSubmit={handleSubmit} aria-busy={pending}>
            {isSignUp && (
              <TextField
                label="Full name"
                size="medium"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                slotProps={{ htmlInput: { maxLength: 80 } }}
              />
            )}
            <TextField
              label="Email address"
              size="medium"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            {!isReset && (
              <TextField
                label="Password"
                size="medium"
                type="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                slotProps={{ htmlInput: { minLength: 6 } }}
              />
            )}
            {error && <FormMessage severity="error">{error}</FormMessage>}
            {notice && <FormMessage severity="success">{notice}</FormMessage>}
            <Button variant="contained" size="large" type="submit" disabled={pending}>
              {pending ? 'Please wait…' : isReset ? 'Send reset link' : isSignUp ? 'Create account' : 'Sign in'}
            </Button>
          </Stack>
          <Box sx={{ mt: 2.75, color: 'text.secondary', fontSize: 13, textAlign: 'center' }}>
            {mode === 'sign-in' && (
              <Button
                size="small"
                onClick={() => {
                  setError('')
                  setMode('reset')
                }}
              >
                Forgot password?
              </Button>
            )}
            {isReset ? (
              <p>
                Remembered it?{' '}
                <Button
                  size="small"
                  onClick={() => {
                    setError('')
                    setMode('sign-in')
                  }}
                >
                  Sign in
                </Button>
              </p>
            ) : (
              <p>
                {isSignUp ? 'Already have an account?' : 'New to Ticknest?'}{' '}
                <Button
                  size="small"
                  onClick={() => {
                    setError('')
                    setMode(isSignUp ? 'sign-in' : 'sign-up')
                  }}
                >
                  {isSignUp ? 'Sign in' : 'Create an account'}
                </Button>
              </p>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

function WorkspaceScreen({ user }: { user: User }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
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
    void refreshWorkspaces().catch((loadError: unknown) => setError(readableError(loadError)))
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

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeId)
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
    workspaces.length > 0 ? (
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
              <ReportsPanel user={user} workspaceId={activeWorkspace.id} isOwner={isOwner} catalog={catalog} />
            )}
            {currentView === 'catalog' && <CatalogPanel workspaceId={activeWorkspace.id} />}
            {currentView === 'members' && (
              <MemberManagementPanel
                key={activeWorkspace.id}
                workspaceId={activeWorkspace.id}
                currentUserId={user.uid}
              />
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
                    {workspaces.length > 1 && ' Switch workspaces from the menu at the top of the sidebar.'}
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

// Always-visible timer at the top of every workspace page.
function TimerBar({ user, workspaceId, catalog }: { user: User; workspaceId: string; catalog: Catalog }) {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [description, setDescription] = useState('')
  const [clientName, setClientName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [taskName, setTaskName] = useState('')
  const [billable, setBillable] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(
    () => subscribeToTimeEntries(workspaceId, user.uid, setEntries, (loadError) => setError(readableError(loadError))),
    [workspaceId, user.uid],
  )
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const runningEntry = entries.find((entry) => entry.endAt === null)

  async function handleStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      await startTimer(user, workspaceId, {
        description: description.trim(),
        clientId: clientName || null,
        projectId: projectName || null,
        taskId: taskName || null,
        clientName: catalog.clients.find((item) => item.id === clientName)?.name ?? null,
        projectName: catalog.projects.find((item) => item.id === projectName)?.name ?? null,
        taskName: catalog.tasks.find((item) => item.id === taskName)?.name ?? null,
        billable,
      })
      setDescription('')
      setClientName('')
      setProjectName('')
      setTaskName('')
      setBillable(false)
      setShowDetails(false)
    } catch (requestError) {
      setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  async function handleStop(entryId: string) {
    setPending(true)
    setError('')
    try {
      await stopTimer(user, workspaceId, entryId)
    } catch (requestError) {
      setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  const elapsed = runningEntry?.startAt
    ? Math.max(0, Math.floor(now / 1000 - runningEntry.startAt.toMillis() / 1000))
    : 0
  const elapsedText = (
    <Typography
      component="span"
      aria-label={`Elapsed time ${formatDuration(elapsed)}`}
      sx={{
        color: runningEntry ? 'primary.main' : 'text.secondary',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 20,
        fontWeight: 650,
        letterSpacing: 0.5,
        flexShrink: 0,
      }}
    >
      {formatDuration(elapsed)}
    </Typography>
  )

  return (
    <Box component="section" aria-label="Timer" sx={{ px: { xs: 1.5, sm: 2.25, md: 4 }, py: 1.25 }}>
      {error && <FormMessage severity="error">{error}</FormMessage>}
      {runningEntry ? (
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', minHeight: 48 }}>
          <Box sx={{ display: 'grid', gap: 0.25, minWidth: 0, flex: 1 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
              {runningEntry.description || 'Untitled entry'}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {[runningEntry.clientName, runningEntry.projectName, runningEntry.taskName].filter(Boolean).join(' · ') ||
                'No client, project, or task'}
              {runningEntry.billable && ' · Billable'}
            </Typography>
          </Box>
          {elapsedText}
          <Button
            variant="contained"
            color="error"
            onClick={() => void handleStop(runningEntry.id)}
            disabled={pending}
            sx={{ flexShrink: 0 }}
          >
            {pending ? 'Saving…' : 'Stop'}
          </Button>
        </Stack>
      ) : (
        <Box
          component="form"
          onSubmit={handleStart}
          aria-busy={pending}
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr) auto auto',
              sm: 'minmax(0, 1fr) auto auto auto',
              lg: 'minmax(0, 2fr) repeat(3, minmax(0, 1fr)) auto auto auto',
            },
            alignItems: 'center',
            gap: 1.25,
          }}
        >
          <TextField
            size="small"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What are you working on?"
            required
            slotProps={{ htmlInput: { maxLength: 500, 'aria-label': 'What are you working on?' } }}
          />
          <Box
            sx={{
              display: { xs: showDetails ? 'grid' : 'none', lg: 'contents' },
              gridColumn: { xs: '1 / -1', lg: 'auto' },
              gridRow: { xs: 2, lg: 'auto' },
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr)) auto' },
              alignItems: 'center',
              gap: 1.25,
            }}
          >
            <SelectField
              size="small"
              label="Client"
              value={clientName}
              onChange={(event) => {
                setClientName(event.target.value)
                setProjectName('')
                setTaskName('')
              }}
            >
              <option value="">No client</option>
              {catalog.clients
                .filter((item) => !item.archived)
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
            </SelectField>
            <SelectField
              size="small"
              label="Project"
              value={projectName}
              onChange={(event) => {
                setProjectName(event.target.value)
                setTaskName('')
              }}
            >
              <option value="">No project</option>
              {catalog.projects
                .filter(
                  (item) =>
                    !item.archived &&
                    (!clientName || item.clientId === clientName) &&
                    (!item.clientId ||
                      catalog.clients.some((client) => client.id === item.clientId && !client.archived)),
                )
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
            </SelectField>
            <SelectField
              size="small"
              label="Task"
              value={taskName}
              onChange={(event) => setTaskName(event.target.value)}
            >
              <option value="">No task</option>
              {catalog.tasks
                .filter(
                  (item) =>
                    !item.archived &&
                    (!projectName || item.projectId === projectName) &&
                    catalog.projects.some(
                      (project) =>
                        project.id === item.projectId &&
                        !project.archived &&
                        (!project.clientId ||
                          catalog.clients.some((client) => client.id === project.clientId && !client.archived)),
                    ),
                )
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
            </SelectField>
            <FormControlLabel
              control={
                <Checkbox size="small" checked={billable} onChange={(event) => setBillable(event.target.checked)} />
              }
              label="Billable"
              sx={{ mr: 0 }}
            />
          </Box>
          <Button
            size="small"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((open) => !open)}
            sx={{ display: { lg: 'none' }, minWidth: 0 }}
          >
            {showDetails ? 'Less' : 'Details'}
          </Button>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>{elapsedText}</Box>
          <Button variant="contained" type="submit" disabled={pending} sx={{ flexShrink: 0 }}>
            {pending ? 'Starting…' : 'Start'}
          </Button>
        </Box>
      )}
    </Box>
  )
}

const associationsSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' },
  gap: 1.5,
}

function TimeEntriesPanel({
  user,
  workspaceId,
  isOwner,
  weekStartsOn,
  catalog,
}: {
  user: User
  workspaceId: string
  isOwner: boolean
  weekStartsOn: number
  catalog: Catalog
}) {
  const [today] = useState(() => localDayString(new Date()))
  const [weekStart, setWeekStart] = useState(() => startOfWeekString(today, weekStartsOn))
  const [entryState, setEntryState] = useState<{ workspaceId: string; weekStart: string; entries: TimeEntry[] }>({
    workspaceId: '',
    weekStart: '',
    entries: [],
  })
  const entries = entryState.workspaceId === workspaceId && entryState.weekStart === weekStart ? entryState.entries : []
  const [editId, setEditId] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [taskId, setTaskId] = useState('')
  const [billable, setBillable] = useState(false)
  const [editorDay, setEditorDay] = useState(today)
  const [startAt, setStartAt] = useState(() => dateTimeForDay(today, 9))
  const [endAt, setEndAt] = useState(() => dateTimeForDay(today, 10))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const { fieldProps, showFieldError, clearFieldError, clearFieldErrors } = useManualEntryFieldErrors()

  useEffect(() => {
    return subscribeToEntriesForRange(
      workspaceId,
      user.uid,
      isOwner,
      weekStart,
      7,
      (nextEntries) => setEntryState({ workspaceId, weekStart, entries: nextEntries }),
      (loadError) => setError(readableError(loadError)),
    )
  }, [workspaceId, user.uid, isOwner, weekStart])
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  function clearForm(forDay = weekStart) {
    setEditId(null)
    setDescription('')
    setClientId('')
    setProjectId('')
    setTaskId('')
    setBillable(false)
    setEditorDay(forDay)
    setStartAt(dateTimeForDay(forDay, 9))
    setEndAt(dateTimeForDay(forDay, 10))
    clearFieldErrors()
  }

  function beginEdit(entry: TimeEntry) {
    if (entry.endAt === null) return
    setEditId(entry.id)
    setDescription(entry.description)
    setClientId(entry.clientId ?? '')
    setProjectId(entry.projectId ?? '')
    setTaskId(entry.taskId ?? '')
    setBillable(entry.billable)
    setStartAt(localDateTimeValue(entry.startAt.toDate()))
    setEndAt(localDateTimeValue(entry.endAt.toDate()))
    setError('')
    setNotice('')
    clearFieldErrors()
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    setNotice('')
    clearFieldErrors()
    try {
      await saveManualTimeEntry(
        workspaceId,
        {
          description,
          clientId: clientId || null,
          projectId: projectId || null,
          taskId: taskId || null,
          billable,
          startAt: new Date(startAt),
          endAt: new Date(endAt),
        },
        editId ?? undefined,
      )
      clearForm()
      setNotice(editId ? 'Time entry updated.' : 'Time entry added.')
    } catch (requestError) {
      if (!showFieldError(requestError)) setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  async function handleDelete(entry: TimeEntry) {
    if (!window.confirm(`Delete “${entry.description || 'Untitled entry'}”?`)) return
    setPending(true)
    setError('')
    setNotice('')
    try {
      await deleteTimeEntry(workspaceId, entry)
      if (editId === entry.id) clearForm()
      setNotice('Time entry deleted.')
    } catch (requestError) {
      setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  async function handleContinue(entry: TimeEntry) {
    setPending(true)
    setError('')
    setNotice('')
    try {
      await continueTimer(user, workspaceId, entry)
    } catch (requestError) {
      setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  function changeWeek(value: string) {
    if (!value) return
    const nextWeekStart = startOfWeekString(value, weekStartsOn)
    setWeekStart(nextWeekStart)
    setError('')
    setNotice('')
    clearForm(nextWeekStart)
  }

  const weekDays = Array.from({ length: 7 }, (_, index) => shiftDayString(weekStart, index))
  const secondsFor = (entry: TimeEntry) =>
    entry.endAt
      ? Math.max(0, Math.floor((entry.endAt.toMillis() - entry.startAt.toMillis()) / 1000))
      : Math.max(0, Math.floor(now / 1000 - entry.startAt.toMillis() / 1000))
  const weekTotal = entries.reduce((total, entry) => total + secondsFor(entry), 0)

  return (
    <SectionCard labelledBy="entries-heading">
      <SectionHeading
        id="entries-heading"
        kicker="YOUR TIME"
        title="Timesheet"
        action={
          <Stack
            direction="row"
            aria-label="Timesheet week navigation"
            spacing={1}
            sx={{ alignItems: 'center', width: { xs: '100%', sm: 'auto' }, justifyContent: 'space-between' }}
          >
            <Button
              variant="outlined"
              aria-label="Previous week"
              onClick={() => changeWeek(shiftDayString(weekStart, -7))}
              sx={{ minWidth: 44, px: 1 }}
            >
              ←
            </Button>
            <Stack sx={{ alignItems: 'center', flex: { xs: 1, sm: 'none' } }}>
              <Typography variant="body2" sx={{ fontWeight: 650 }}>
                {formatWeekLabel(weekStart)}
              </Typography>
              <TextField
                variant="standard"
                type="date"
                value={weekStart}
                onChange={(event) => changeWeek(event.target.value)}
                fullWidth={false}
                slotProps={{
                  htmlInput: { 'aria-label': 'Choose a week', style: { fontSize: 12, padding: 0 } },
                  input: { disableUnderline: true },
                }}
                sx={{ width: 130 }}
              />
            </Stack>
            <Button
              variant="outlined"
              aria-label="Next week"
              onClick={() => changeWeek(shiftDayString(weekStart, 7))}
              sx={{ minWidth: 44, px: 1 }}
            >
              →
            </Button>
            <Button size="small" onClick={() => changeWeek(today)}>
              Today
            </Button>
          </Stack>
        }
      />
      {error && <FormMessage severity="error">{error}</FormMessage>}
      {notice && <FormMessage severity="success">{notice}</FormMessage>}
      <Paper
        component="form"
        variant="outlined"
        onSubmit={handleSave}
        aria-busy={pending}
        sx={{ display: 'grid', gap: 2, mt: 3, p: 2.25, borderRadius: '12px', bgcolor: 'app.surface' }}
      >
        <Typography variant="h3">
          {editId
            ? 'Edit entry'
            : `Add time · ${new Date(`${editorDay}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`}
        </Typography>
        <TextField
          label="Description"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value)
            clearFieldError('description')
          }}
          required
          {...fieldProps('description')}
          slotProps={{ htmlInput: { maxLength: 500 } }}
        />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
          <TextField
            label="Start"
            type="datetime-local"
            value={startAt}
            onChange={(event) => {
              setStartAt(event.target.value)
              clearFieldError('startAt')
              clearFieldError('endAt')
            }}
            required
            {...fieldProps('startAt')}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="End"
            type="datetime-local"
            value={endAt}
            onChange={(event) => {
              setEndAt(event.target.value)
              clearFieldError('endAt')
            }}
            required
            {...fieldProps('endAt')}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>
        <Box sx={associationsSx}>
          <SelectField
            label="Client"
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value)
              setProjectId('')
              setTaskId('')
            }}
          >
            <option value="">No client</option>
            {catalog.clients
              .filter((item) => !item.archived || item.id === clientId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.archived ? ' (archived)' : ''}
                </option>
              ))}
          </SelectField>
          <SelectField
            label="Project"
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value)
              setTaskId('')
            }}
          >
            <option value="">No project</option>
            {catalog.projects
              .filter(
                (item) =>
                  (!item.archived || item.id === projectId) &&
                  (!clientId || item.clientId === clientId) &&
                  (item.id === projectId ||
                    !item.clientId ||
                    catalog.clients.some((client) => client.id === item.clientId && !client.archived)),
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.archived ? ' (archived)' : ''}
                </option>
              ))}
          </SelectField>
          <SelectField label="Task" value={taskId} onChange={(event) => setTaskId(event.target.value)}>
            <option value="">No task</option>
            {catalog.tasks
              .filter(
                (item) =>
                  (!item.archived || item.id === taskId) &&
                  (!projectId || item.projectId === projectId) &&
                  (item.id === taskId ||
                    catalog.projects.some(
                      (project) =>
                        project.id === item.projectId &&
                        !project.archived &&
                        (!project.clientId ||
                          catalog.clients.some((client) => client.id === project.clientId && !client.archived)),
                    )),
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.archived ? ' (archived)' : ''}
                </option>
              ))}
          </SelectField>
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControlLabel
            control={<Checkbox checked={billable} onChange={(event) => setBillable(event.target.checked)} />}
            label="Billable"
            sx={{ mr: 'auto' }}
          />
          {editId && (
            <Button variant="outlined" onClick={() => clearForm()} disabled={pending}>
              Cancel
            </Button>
          )}
          <Button variant="contained" type="submit" disabled={pending}>
            {pending ? 'Saving…' : editId ? 'Save changes' : 'Add entry'}
          </Button>
        </Stack>
      </Paper>
      <Paper
        variant="outlined"
        aria-live="polite"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          mt: 3,
          px: 2,
          py: 1.75,
          borderRadius: '11px',
          borderColor: 'app.tintBorder',
          bgcolor: 'app.tint',
        }}
      >
        <Box sx={{ display: 'grid', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            Week total
          </Typography>
          <Typography sx={{ color: 'primary.main', fontVariantNumeric: 'tabular-nums', fontSize: 20, fontWeight: 700 }}>
            {formatDuration(weekTotal)}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'} this week
        </Typography>
      </Paper>
      <Box aria-live="polite" sx={{ mt: 2.25 }}>
        {weekDays.map((weekDay) => {
          const dayEntries = entries
            .filter((entry) => localDayString(entry.startAt.toDate()) === weekDay)
            .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())
          const dayTotal = dayEntries.reduce((total, entry) => total + secondsFor(entry), 0)
          const date = new Date(`${weekDay}T12:00:00`)
          return (
            <Box
              component="section"
              key={weekDay}
              aria-labelledby={`timesheet-${weekDay}`}
              sx={{ pt: 2, pb: 0.75, borderBottom: 1, borderColor: 'divider' }}
            >
              <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1.75 }}>
                <Typography
                  variant="h3"
                  id={`timesheet-${weekDay}`}
                  sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}
                >
                  <span>{date.toLocaleDateString(undefined, { weekday: 'long' })}</span>
                  <Typography component="time" variant="caption" color="text.secondary" dateTime={weekDay}>
                    {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </Typography>
                </Typography>
                <Stack direction="row" spacing={{ xs: 0.5, sm: 1.75 }} sx={{ alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {formatDuration(dayTotal)}
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => {
                      clearForm(weekDay)
                      setError('')
                      setNotice('')
                    }}
                  >
                    Add entry
                  </Button>
                </Stack>
              </Stack>
              {dayEntries.length === 0 ? (
                <EmptyText>No entries</EmptyText>
              ) : (
                dayEntries.map((entry) => (
                  <Box
                    component="article"
                    key={entry.id}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '54px minmax(0, 1fr) auto', sm: '78px minmax(0, 1fr) auto auto' },
                      alignItems: 'center',
                      gap: { xs: 1, sm: 1.75 },
                      py: 1.5,
                      borderTop: 1,
                      borderColor: 'app.track',
                      minWidth: 0,
                    }}
                  >
                    <Box sx={{ display: 'grid', gap: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {entry.startAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {entry.endAt
                          ? entry.endAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'Running'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                        {entry.description || 'Untitled entry'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {[entry.clientName, entry.projectName, entry.taskName].filter(Boolean).join(' · ') ||
                          'No client, project, or task'}
                        {entry.userId !== user.uid && ' · Workspace member'}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>
                      {formatDuration(secondsFor(entry))}
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        justifyContent: 'flex-end',
                        gridColumn: { xs: '1 / -1', sm: 'auto' },
                      }}
                    >
                      {entry.endAt === null && <Chip label="Running" color="warning" variant="outlined" />}
                      {entry.billable && <BillableChip />}
                      {entry.endAt !== null && entry.userId === user.uid && (
                        <Button size="small" onClick={() => void handleContinue(entry)} disabled={pending}>
                          Continue
                        </Button>
                      )}
                      <Button size="small" onClick={() => beginEdit(entry)} disabled={pending || entry.endAt === null}>
                        Edit
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => void handleDelete(entry)}
                        disabled={pending || entry.endAt === null}
                      >
                        Delete
                      </Button>
                    </Stack>
                  </Box>
                ))
              )}
            </Box>
          )
        })}
      </Box>
    </SectionCard>
  )
}

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

function App() {
  const [user, setUser] = useState<User | null>(auth.currentUser)
  const [authReady, setAuthReady] = useState(false)
  const { applyPalette } = usePalette()
  const uid = user?.uid

  useEffect(
    () =>
      onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser)
        setAuthReady(true)
      }),
    [],
  )

  // The palette is a per-user preference stored on the profile, so it follows the user across devices.
  useEffect(() => {
    if (!uid) return
    return subscribeToPalettePreference(uid, applyPalette)
  }, [uid, applyPalette])

  if (!authReady)
    return (
      <Stack
        component="main"
        role="status"
        spacing={2}
        sx={{ minHeight: '100vh', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}
      >
        <CircularProgress size={28} />
        <Typography variant="body2">Loading your Ticknest account…</Typography>
      </Stack>
    )
  return (
    <>
      {user ? <WorkspaceScreen user={user} /> : <AuthScreen onAuthenticated={setUser} />}
      {!user && (
        <Typography
          component="footer"
          variant="caption"
          sx={{
            display: 'block',
            px: 2,
            py: 1.75,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'background.default',
            color: 'text.secondary',
            textAlign: 'center',
          }}
        >
          Ticknest v{__APP_VERSION__}
        </Typography>
      )}
    </>
  )
}

export default App
