import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { type Theme, alpha } from '@mui/material/styles'
import type { User } from 'firebase/auth'
import { type ChangeEvent, type FormEvent, lazy, Suspense, useEffect, useState } from 'react'
import { deleteCurrentAccount, getReauthMethod, sendVerificationEmail, signOutUser } from './lib/auth'
import { type Catalog, subscribeToCatalog } from './lib/catalog'
import { localeWeekStart, type WeekStart } from './lib/dates'
import { readableError } from './lib/errors'
import { clearInviteParamsFromAddressBar, hasInviteParams } from './lib/inviteLink'
import {
  type SetupItem,
  type SetupStep,
  type TeamSize,
  dismissSetupReminder,
  isSetupReminderDismissed,
  setupItemsLeft,
} from './lib/onboarding'
import {
  type Workspace,
  acceptWorkspaceInvitation,
  canSeeAllEntries,
  createWorkspace,
  getSavedWorkspaceId,
  loadWorkspaces,
  saveActiveWorkspaceId,
  subscribeToMembershipStatus,
  subscribeToTeamSize,
} from './lib/workspaces'
import { AppShell, NavIcon, type NavItem } from './AppShell'
import { AppearancePanel } from './AppearancePanel'
import { Brand } from './Brand'
import { CatalogPanel } from './CatalogPanel'
import type { SetupSummary } from './SetupWizard'
import { TimeEntriesPanel } from './TimeEntriesPanel'
import { TimerBar } from './TimerBar'
import { TimesheetDashboard } from './TimesheetDashboard'
import { WorkspaceSettingsPanel } from './WorkspaceSettingsPanel'
import { FormMessage, LoadingState } from './ui'
import { useEmailVerified } from './useEmailVerified'

// Reports, budgets, and member management are visited less often, so they load on demand to keep the initial bundle small.
const ReportsPanel = lazy(() => import('./ReportsPanel').then((module) => ({ default: module.ReportsPanel })))
const MemberManagementPanel = lazy(() =>
  import('./MemberManagementPanel').then((module) => ({ default: module.MemberManagementPanel })),
)
const BudgetsPanel = lazy(() => import('./BudgetsPanel').then((module) => ({ default: module.BudgetsPanel })))
const MyBudgetsPanel = lazy(() => import('./MyBudgetsPanel').then((module) => ({ default: module.MyBudgetsPanel })))
const TeamBudgetsPanel = lazy(() =>
  import('./TeamBudgetsPanel').then((module) => ({ default: module.TeamBudgetsPanel })),
)
// Setup runs once per workspace, right after it is created.
const SetupWizard = lazy(() => import('./SetupWizard').then((module) => ({ default: module.SetupWizard })))

type WorkspaceView =
  'timesheet' | 'dashboard' | 'reports' | 'my-budgets' | 'team-budgets' | 'budgets' | 'catalog' | 'members' | 'settings'

const WORKSPACE_VIEWS: WorkspaceView[] = [
  'timesheet',
  'dashboard',
  'reports',
  'my-budgets',
  'team-budgets',
  'budgets',
  'catalog',
  'members',
  'settings',
]

const OWNER_VIEWS: WorkspaceView[] = ['catalog', 'members']

// Owners and managers manage budgets and follow everyone's progress on them.
const MANAGER_VIEWS: WorkspaceView[] = ['team-budgets', 'budgets']

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
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStart>(() => localeWeekStart(navigator.language))
  // Opened from an invitation email: onboarding leads with joining, and the link is filled in.
  const [arrivedWithInvite] = useState(() => hasInviteParams(window.location.href))
  const [inviteLink, setInviteLink] = useState(() => (arrivedWithInvite ? window.location.href : ''))
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false)
  const emailVerified = useEmailVerified(user)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [catalog, setCatalog] = useState<Catalog>(EMPTY_CATALOG)
  // False until the active workspace's catalog has loaded, so an empty catalog really means "nothing added yet".
  const [catalogReady, setCatalogReady] = useState(false)
  // The workspace whose guided setup is showing, if any.
  const [setupWorkspaceId, setSetupWorkspaceId] = useState<string | null>(null)
  const [setupStartStep, setSetupStartStep] = useState<SetupStep>('client')
  // The active workspace's member and invitation counts, for owners; undefined until loaded.
  const [team, setTeam] = useState<TeamSize | undefined>()
  const [dismissedReminders, setDismissedReminders] = useState<string[]>([])
  const [view, setView] = useState<WorkspaceView>(() => viewFromHash() ?? (inviteLink ? 'settings' : 'timesheet'))

  useEffect(() => {
    const syncView = () => setView(viewFromHash() ?? 'timesheet')
    window.addEventListener('hashchange', syncView)
    return () => window.removeEventListener('hashchange', syncView)
  }, [])

  useEffect(() => {
    setCatalog(EMPTY_CATALOG)
    setCatalogReady(false)
    if (!activeId) return
    return subscribeToCatalog(
      activeId,
      (next) => {
        setCatalog(next)
        setCatalogReady(true)
      },
      (loadError) => setError(readableError(loadError)),
    )
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
      const id = await createWorkspace(user, workspaceName, weekStartsOn)
      setWorkspaceName('')
      setActiveId(id)
      setSetupStartStep('client')
      setSetupWorkspaceId(id)
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
      // The token is single-use and secret, so it should not stay in the address bar or browser history.
      clearInviteParamsFromAddressBar()
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

  useEffect(() => {
    setTeam(undefined)
    if (!activeId || !isOwner) return
    return subscribeToTeamSize(activeId, setTeam, (loadError) => setError(readableError(loadError)))
  }, [activeId, isOwner])
  const seesAllEntries = canSeeAllEntries(activeWorkspace?.role)
  const currentView: WorkspaceView =
    (!isOwner && OWNER_VIEWS.includes(view)) || (!seesAllEntries && MANAGER_VIEWS.includes(view)) ? 'timesheet' : view
  const navItems: NavItem<WorkspaceView>[] = activeWorkspace
    ? [
        { value: 'timesheet', label: 'Timesheet', icon: navIcons.timesheet, section: 'Track' },
        {
          value: 'dashboard',
          label: seesAllEntries ? 'Team dashboard' : 'Dashboard',
          icon: navIcons.dashboard,
          section: 'Analyze',
        },
        { value: 'reports', label: 'Reports', icon: navIcons.reports, section: 'Analyze' },
        { value: 'my-budgets', label: 'My budgets', icon: navIcons.myBudgets, section: 'Analyze' },
        ...(seesAllEntries
          ? ([
              { value: 'team-budgets', label: 'Budget progress', icon: navIcons.teamBudgets, section: 'Analyze' },
              { value: 'budgets', label: 'Budgets', icon: navIcons.budgets, section: 'Manage' },
            ] satisfies NavItem<WorkspaceView>[])
          : []),
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
    // Leaving setup through the sidebar counts as skipping it; the reminder card offers it again.
    setSetupWorkspaceId(null)
    window.location.hash = next
    setView(next)
  }

  const setupItems: SetupItem[] =
    activeWorkspace && catalogReady ? setupItemsLeft(activeWorkspace.role, catalog, team) : []
  const showSetupReminder =
    activeWorkspace !== undefined &&
    setupItems.length > 0 &&
    !dismissedReminders.includes(activeWorkspace.id) &&
    !isSetupReminderDismissed(user.uid, activeWorkspace.id)

  function finishSetup(summary: SetupSummary) {
    navigate('dashboard')
    setNotice(setupNotice(summary))
  }

  const createWorkspaceCard = (
    <Paper
      id="create-workspace-card"
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
      <div>
        <Typography id="week-start-label" variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
          Week starts on
        </Typography>
        <ToggleButtonGroup
          aria-labelledby="week-start-label"
          exclusive
          size="small"
          color="primary"
          value={weekStartsOn}
          onChange={(_, value: WeekStart | null) => {
            // Ignore clicks on the selected button so one option always stays chosen.
            if (value !== null) setWeekStartsOn(value)
          }}
          disabled={pending}
        >
          <ToggleButton value={1} sx={{ px: 2 }}>
            Monday
          </ToggleButton>
          <ToggleButton value={0} sx={{ px: 2 }}>
            Sunday
          </ToggleButton>
        </ToggleButtonGroup>
      </div>
      <Button variant="contained" type="submit" disabled={pending}>
        Create workspace
      </Button>
    </Paper>
  )

  const joinInvitationCard = (
    <Paper component="form" variant="outlined" onSubmit={handleAcceptInvite} aria-busy={pending} sx={onboardingCardSx}>
      <Box
        component="span"
        aria-hidden="true"
        sx={{ ...cardIconSx, bgcolor: 'app.warmSoft', color: 'app.warmSoftText' }}
      >
        ↗
      </Box>
      <Typography variant="h2" sx={{ fontSize: 23 }}>
        {arrivedWithInvite ? 'Join your team’s workspace' : 'Join a workspace'}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {arrivedWithInvite
          ? 'You’ve been invited to a workspace. Accept the invitation to join it.'
          : 'Paste the invitation link sent to your email.'}
      </Typography>
      <TextField
        label="Invitation link"
        type="url"
        value={inviteLink}
        onChange={(event) => setInviteLink(event.target.value)}
        required
        placeholder="https://…?workspace=…&invite=…&token=…"
        helperText={emailVerified ? undefined : 'Verify your email before accepting an invitation.'}
      />
      <Button variant={arrivedWithInvite ? 'contained' : 'outlined'} type="submit" disabled={pending || !emailVerified}>
        Accept invitation
      </Button>
    </Paper>
  )

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
        <Button variant="outlined" type="submit" disabled={pending || !emailVerified} sx={{ flex: '0 0 auto' }}>
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
            setSetupWorkspaceId(null)
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
      active={activeWorkspace && setupWorkspaceId !== activeWorkspace.id ? currentView : null}
      onNavigate={navigate}
      footer={sidebarFooter}
    >
      <Box
        component="main"
        sx={{
          width: { xs: 'calc(100% - 24px)', sm: 'calc(100% - 36px)', md: 'calc(100% - 64px)' },
          maxWidth: activeWorkspace && (currentView === 'dashboard' || currentView === 'team-budgets') ? 1120 : 960,
          mx: 'auto',
          pt: { xs: 3, md: 5 },
          pb: 5,
        }}
      >
        {error && <FormMessage severity="error">{error}</FormMessage>}
        {notice && <FormMessage severity="success">{notice}</FormMessage>}
        {!emailVerified && <EmailVerificationNotice user={user} />}
        {activeWorkspace && setupWorkspaceId === activeWorkspace.id ? (
          <Suspense fallback={<LoadingState label="Loading…" sx={{ py: 8 }} />}>
            <SetupWizard
              workspaceId={activeWorkspace.id}
              workspaceName={activeWorkspace.name}
              catalog={catalog}
              initialStep={setupStartStep}
              onFinish={finishSetup}
            />
          </Suspense>
        ) : activeWorkspace ? (
          <>
            {showSetupReminder && (currentView === 'timesheet' || currentView === 'dashboard') && (
              <SetupReminder
                items={setupItems}
                onContinue={(item) => {
                  setNotice('')
                  setSetupStartStep(item === 'invite' ? 'invite' : 'client')
                  setSetupWorkspaceId(activeWorkspace.id)
                }}
                onDismiss={() => {
                  dismissSetupReminder(user.uid, activeWorkspace.id)
                  setDismissedReminders((current) => [...current, activeWorkspace.id])
                }}
              />
            )}
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
                canSeeAllEntries={seesAllEntries}
                isOwner={isOwner}
                weekStartsOn={activeWorkspace.weekStartsOn}
                catalog={catalog}
              />
            )}
            {currentView === 'reports' && (
              <Suspense fallback={<LoadingState label="Loading…" sx={{ py: 8 }} />}>
                <ReportsPanel
                  user={user}
                  workspaceId={activeWorkspace.id}
                  canSeeAllEntries={seesAllEntries}
                  catalog={catalog}
                />
              </Suspense>
            )}
            {currentView === 'my-budgets' && (
              <Suspense fallback={<LoadingState label="Loading…" sx={{ py: 8 }} />}>
                <MyBudgetsPanel
                  key={activeWorkspace.id}
                  workspaceId={activeWorkspace.id}
                  userId={user.uid}
                  memberTimeZone={activeWorkspace.timezone}
                  weekStartsOn={activeWorkspace.weekStartsOn}
                  onManageBudgets={seesAllEntries ? () => navigate('budgets') : undefined}
                />
              </Suspense>
            )}
            {currentView === 'team-budgets' && (
              <Suspense fallback={<LoadingState label="Loading…" sx={{ py: 8 }} />}>
                <TeamBudgetsPanel
                  key={activeWorkspace.id}
                  workspaceId={activeWorkspace.id}
                  weekStartsOn={activeWorkspace.weekStartsOn}
                  onManageBudgets={() => navigate('budgets')}
                />
              </Suspense>
            )}
            {currentView === 'budgets' && (
              <Suspense fallback={<LoadingState label="Loading…" sx={{ py: 8 }} />}>
                <BudgetsPanel key={activeWorkspace.id} workspaceId={activeWorkspace.id} catalog={catalog} />
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
                    label={`Workspace ${activeWorkspace.role}`}
                    sx={{ mt: 2, pl: 0.75 }}
                  />
                </Paper>
                <WorkspaceSettingsPanel
                  key={activeWorkspace.id}
                  workspace={activeWorkspace}
                  onSaved={refreshWorkspaces}
                />
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
          <LoadingState label="Loading your workspace…" sx={{ py: 8 }} />
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
                Hi {user.displayName?.trim().split(/\s+/)[0] || 'there'} —{' '}
                {arrivedWithInvite
                  ? 'you’ve been invited to join a workspace.'
                  : 'create a new workspace or join one you’ve been invited to.'}
              </Typography>
            </Box>
            {arrivedWithInvite ? (
              <Box sx={{ display: 'grid', gap: 2, maxWidth: 560 }}>
                {joinInvitationCard}
                <Button
                  variant="text"
                  onClick={() => setShowCreateWorkspace((shown) => !shown)}
                  aria-expanded={showCreateWorkspace}
                  aria-controls="create-workspace-card"
                  sx={{ justifySelf: 'start' }}
                >
                  or create your own workspace {showCreateWorkspace ? '▾' : '▸'}
                </Button>
                {showCreateWorkspace && createWorkspaceCard}
              </Box>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                {createWorkspaceCard}
                {joinInvitationCard}
              </Box>
            )}
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
  myBudgets: (
    <NavIcon>
      <path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </NavIcon>
  ),
  teamBudgets: (
    <NavIcon>
      <path d="M4 20V14M10 20V9M16 20v-4" />
      <path d="M3 20h18M15 5.5l2.5 2.5L21 4.5" />
    </NavIcon>
  ),
  budgets: (
    <NavIcon>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.5" />
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

const EMPTY_CATALOG: Catalog = { clients: [], projects: [], tasks: [] }

// Without a project there is nothing to track yet; the setup reminder covers that case instead.
function setupNotice({ projectName, taskName, invitedCount = 0 }: SetupSummary): string {
  const target = taskName ?? projectName
  const invited =
    invitedCount > 0
      ? `${invitedCount === 1 ? 'Your invitation is' : `${invitedCount} invitations are`} pending under Members.`
      : ''
  const tracking = target ? `You’re all set. Start the timer above to track time on ${target}.` : ''
  return [tracking, invited].filter(Boolean).join(' ')
}

const SETUP_ITEM_COPY: Record<SetupItem, { text: string; action: string }> = {
  project: { text: 'Add a first project so you have something to track time against.', action: 'Add a project' },
  invite: { text: 'Invite a teammate so they can track time in this workspace too.', action: 'Invite a teammate' },
}

function SetupReminder({
  items,
  onContinue,
  onDismiss,
}: {
  items: SetupItem[]
  onContinue: (item: SetupItem) => void
  onDismiss: () => void
}) {
  return (
    <Alert
      severity="info"
      sx={{ maxWidth: 750, mx: 'auto', mb: 2.25, '& .MuiAlert-message': { flex: 1, minWidth: 0 } }}
      action={
        <Button size="small" color="inherit" onClick={onDismiss}>
          Dismiss
        </Button>
      }
    >
      <Typography component="h2" sx={{ fontWeight: 700, fontSize: 'inherit', mb: 0.75 }}>
        Finish setup
      </Typography>
      <Box component="ul" sx={{ display: 'grid', gap: 1, m: 0, p: 0, listStyle: 'none' }}>
        {items.map((item) => (
          <Stack
            component="li"
            key={item}
            direction={{ xs: 'column', sm: 'row' }}
            sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 1 }}
          >
            <span>{SETUP_ITEM_COPY[item].text}</span>
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              onClick={() => onContinue(item)}
              sx={{ flex: '0 0 auto', alignSelf: { xs: 'flex-start', sm: 'center' } }}
            >
              {SETUP_ITEM_COPY[item].action}
            </Button>
          </Stack>
        ))}
      </Box>
    </Alert>
  )
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
            void sendVerificationEmail(user)
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
