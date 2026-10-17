import { onAuthStateChanged, sendEmailVerification, type User } from 'firebase/auth'
import { useEffect, useState, type FormEvent } from 'react'
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
import { CatalogPanel } from './CatalogPanel'
import { MemberManagementPanel } from './MemberManagementPanel'
import { ReportsPanel } from './ReportsPanel'
import { BillableChip, EmptyText, FormMessage, ListRow, SectionCard, SectionHeading, SelectField } from './ui'

type AuthMode = 'sign-in' | 'sign-up' | 'reset'

function readableError(error: unknown): string {
  if (!(error instanceof Error)) return 'Something went wrong. Please try again.'
  const code = 'code' in error ? String(error.code) : ''
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'An account already exists for this email. Sign in instead.',
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/network-request-failed': 'Ticknest couldn’t reach Firebase Authentication. Check your internet connection and try again. If you use a VPN, firewall, or privacy extension, make sure it allows this site to connect to Firebase.',
    'auth/weak-password': 'Choose a password with at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'auth/user-disabled': 'This account is disabled. Contact the workspace administrator.',
    'auth/unauthorized-domain': 'This site is not authorized for Firebase sign-in. Add its domain in Firebase Authentication settings.',
    'auth/requires-recent-login': 'Sign in again before deleting your account.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
    'auth/popup-blocked': 'Allow pop-ups for this site, then try Google sign-in again.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Authentication.',
    'auth/account-exists-with-different-credential': 'An account already exists with this email. Sign in with your original method, then link Google in account settings.',
    'functions/internal': 'The workspace service is not available in this Firebase project yet. Deploy the Firebase Functions, then try again.',
    'functions/not-found': 'The workspace service is not deployed in this Firebase project. Deploy the Firebase Functions, then try again.',
    'functions/unavailable': 'The workspace service is temporarily unavailable. Try again in a moment.',
    'permission-denied': 'You do not have access to this workspace.',
  }
  if (messages[code]) return messages[code]
  if (code.startsWith('auth/')) return 'We couldn’t sign you in. Please try again. If the problem continues, check the Firebase Authentication settings.'
  return error.message
}

function Brand() {
  return (
    <Link href="/" aria-label="Ticknest home" underline="none" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25, color: '#17271f', fontSize: 20, fontWeight: 700, letterSpacing: '-0.8px' }}>
      <Box component="span" aria-hidden="true" sx={{ display: 'grid', width: 30, height: 30, placeItems: 'center', borderRadius: '10px', bgcolor: '#213b2c' }}>
        <Box component="svg" viewBox="0 0 24 24" fill="none" sx={{ width: 19, stroke: '#e9f2df', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2.5 }}><path d="M5 13.5 9.2 18 19 6" /></Box>
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
    <Box component="main" sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(300px, .92fr) 1.08fr' }, bgcolor: 'background.paper' }}>
      <Box component="section" sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: { md: '100vh' }, px: { xs: 3, md: 'clamp(32px, 7vw, 96px)' }, py: { xs: 3, md: 4.75 }, overflow: 'hidden', background: 'radial-gradient(ellipse at 20% 15%, rgba(213, 231, 213, .78), transparent 45%), #f3f5ef' }}>
        <Brand />
        <Box sx={{ maxWidth: 450, my: { xs: 5, md: 'auto' }, py: { md: 9 } }}>
          <Typography variant="overline" component="p">YOUR TIME, YOUR INFRASTRUCTURE</Typography>
          <Typography variant="h1" sx={{ mt: 3, mb: 2.5, fontSize: 'clamp(43px, 5vw, 74px)' }}>Make room for <Box component="span" sx={{ color: 'primary.light' }}>the work that matters.</Box></Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 360, lineHeight: 1.7 }}>Track time with a team workspace that lives in your own Firebase project.</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>Open source · Self-hosted · No seat limits</Typography>
      </Box>
      <Box component="section" aria-labelledby="auth-heading" sx={{ display: 'grid', placeItems: 'center', px: { xs: 3, md: 4 }, pt: { xs: 5.5, md: 6.5 }, pb: { xs: 8, md: 6.5 } }}>
        <Box sx={{ width: 'min(390px, 100%)' }}>
          <Typography variant="overline" component="p">{isReset ? 'ACCOUNT RECOVERY' : 'WELCOME TO TICKNEST'}</Typography>
          <Typography variant="h2" id="auth-heading" sx={{ fontSize: 34, mt: 1, mb: 1 }}>{isReset ? 'Reset your password' : isSignUp ? 'Create your account' : 'Welcome back'}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3.5, lineHeight: 1.6 }}>
            {isReset ? 'We’ll email you a secure link to choose a new password.' : isSignUp ? 'Start a workspace for your team in just a moment.' : 'Sign in to continue to your workspace.'}
          </Typography>
          {mode !== 'reset' && <>
            <Button variant="outlined" color="inherit" fullWidth onClick={() => void handleGoogleSignIn()} disabled={pending} startIcon={<Box component="span" aria-hidden="true" sx={{ display: 'grid', width: 20, height: 20, placeItems: 'center', border: 1, borderColor: 'divider', borderRadius: '50%', color: '#4285f4', fontSize: 13, fontWeight: 750 }}>G</Box>}>
              {pending ? 'Connecting…' : 'Continue with Google'}
            </Button>
            <Divider sx={{ my: 2.25, color: 'text.secondary', fontSize: 11 }}>or use email</Divider>
          </>}
          <Stack component="form" spacing={2} onSubmit={handleSubmit} aria-busy={pending}>
            {isSignUp && (
              <TextField label="Full name" size="medium" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required slotProps={{ htmlInput: { maxLength: 80 } }} />
            )}
            <TextField label="Email address" size="medium" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            {!isReset && (
              <TextField label="Password" size="medium" type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} required slotProps={{ htmlInput: { minLength: 6 } }} />
            )}
            {error && <FormMessage severity="error">{error}</FormMessage>}
            {notice && <FormMessage severity="success">{notice}</FormMessage>}
            <Button variant="contained" size="large" type="submit" disabled={pending}>
              {pending ? 'Please wait…' : isReset ? 'Send reset link' : isSignUp ? 'Create account' : 'Sign in'}
            </Button>
          </Stack>
          <Box sx={{ mt: 2.75, color: 'text.secondary', fontSize: 13, textAlign: 'center' }}>
            {mode === 'sign-in' && <Button size="small" onClick={() => { setError(''); setMode('reset') }}>Forgot password?</Button>}
            {isReset ? (
              <p>Remembered it? <Button size="small" onClick={() => { setError(''); setMode('sign-in') }}>Sign in</Button></p>
            ) : (
              <p>{isSignUp ? 'Already have an account?' : 'New to Ticknest?'} <Button size="small" onClick={() => { setError(''); setMode(isSignUp ? 'sign-in' : 'sign-up') }}>{isSignUp ? 'Sign in' : 'Create an account'}</Button></p>
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
    const confirmed = window.confirm('Delete this Ticknest account? This will sign you out. Workspace data is retained in the Firebase project.')
    if (!confirmed) return
    const password = window.prompt('Enter your password to confirm account deletion.')
    if (password === null) return
    setPending(true)
    setError('')
    try {
      await deleteCurrentAccount(user, password)
    } catch (requestError) {
      setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeId)

  return (
    <Box sx={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 12% 0%, rgba(217, 231, 221, .48), transparent 32rem), #f8f8f5' }}>
      <Box component="header" sx={{ width: { xs: 'calc(100% - 24px)', sm: 'calc(100% - 36px)', md: 'min(1120px, calc(100% - 64px))' }, height: { xs: 68, sm: 78 }, mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: 1, borderColor: 'divider' }}>
        <Brand />
        <Stack direction="row" spacing={{ xs: 1, sm: 2 }} sx={{ alignItems: 'center' }}>
          {workspaces.length > 0 && <SelectField value={activeId ?? ''} onChange={(event) => { setActiveId(event.target.value); saveActiveWorkspaceId(user.uid, event.target.value) }} fullWidth={false} slotProps={{ htmlInput: { 'aria-label': 'Active workspace' } }} sx={{ maxWidth: { xs: 145, sm: 220 }, bgcolor: 'background.paper' }}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</SelectField>}
          <Button size="small" onClick={() => void signOutUser()}>Sign out</Button>
        </Stack>
      </Box>
      <Box component="main" sx={{ width: { xs: 'calc(100% - 24px)', sm: 'calc(100% - 36px)', md: 'min(960px, calc(100% - 64px))' }, minHeight: 'calc(100vh - 78px)', mx: 'auto', pt: { xs: 3.75, md: 6 }, pb: 3.75 }}>
        {error && <FormMessage severity="error">{error}</FormMessage>}
        {notice && <FormMessage severity="success">{notice}</FormMessage>}
        {!user.emailVerified && <EmailVerificationNotice user={user} />}
        {activeWorkspace ? (
          <>
          <Paper component="section" variant="outlined" sx={{ maxWidth: 750, mx: 'auto', mt: { xs: 3.5, md: 11 }, p: 'clamp(28px, 6vw, 58px)', borderRadius: '22px', bgcolor: 'rgba(255,255,255,.82)', boxShadow: '0 22px 70px rgba(47, 64, 49, .06)' }}>
            <Typography variant="overline" component="p">YOUR WORKSPACE</Typography>
            <Typography variant="h1" sx={{ my: 1.5, overflowWrap: 'anywhere' }}>{activeWorkspace.name}</Typography>
            <Typography color="text.secondary" sx={{ lineHeight: 1.6 }}>Signed in as {user.email}. Your workspace is ready for the timer workflow.</Typography>
            <Chip variant="outlined" color="success" icon={<Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#7fae72', boxShadow: '0 0 0 3px rgba(127,174,114,.13)' }} />} label={activeWorkspace.role === 'owner' ? 'Workspace owner' : 'Workspace member'} sx={{ mt: 2.25, pl: 0.75 }} />
            {workspaces.length > 1 && <Typography variant="body2" color="text.secondary" sx={{ mt: 3.5 }}>Use the workspace menu above to switch between your workspaces.</Typography>}
          </Paper>
          <TimerPanel user={user} workspaceId={activeWorkspace.id} catalog={catalog} />
          {activeWorkspace.role === 'owner' && <CatalogPanel workspaceId={activeWorkspace.id} />}
          {activeWorkspace.role === 'owner' && <MemberManagementPanel workspaceId={activeWorkspace.id} currentUserId={user.uid} />}
          <TimeEntriesPanel user={user} workspaceId={activeWorkspace.id} isOwner={activeWorkspace.role === 'owner'} weekStartsOn={activeWorkspace.weekStartsOn} catalog={catalog} />
          <ReportsPanel user={user} workspaceId={activeWorkspace.id} isOwner={activeWorkspace.role === 'owner'} catalog={catalog} />
          <Paper component="form" variant="outlined" onSubmit={handleAcceptInvite} sx={{ display: 'grid', gap: 1.5, maxWidth: 750, mx: 'auto', mt: 2.25, p: { xs: 2.25, sm: 4 }, borderRadius: '18px' }}>
            <div><Typography variant="h2" sx={{ fontSize: 22 }}>Join another workspace</Typography><Typography variant="body2" color="text.secondary">Paste an invitation link sent to your email.</Typography></div>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <TextField type="url" value={inviteLink} onChange={(event) => setInviteLink(event.target.value)} required placeholder="https://…?workspace=…&invite=…&token=…" slotProps={{ htmlInput: { 'aria-label': 'Invitation link' } }} />
              <Button variant="outlined" type="submit" disabled={pending || !user.emailVerified} sx={{ flex: '0 0 auto' }}>Accept invitation</Button>
            </Stack>
          </Paper>
          </>
        ) : (
          <Box component="section" sx={{ maxWidth: 860, mx: 'auto', mt: 3 }}>
            <Box sx={{ mb: 3.75 }}><Typography variant="overline" component="p">ONE LAST STEP</Typography><Typography variant="h1" sx={{ my: 1.5 }}>Set up your workspace</Typography><Typography color="text.secondary" sx={{ maxWidth: 530, lineHeight: 1.6 }}>Hi {user.displayName?.split(' ')[0] ?? 'there'} — create a new workspace or join one you’ve been invited to.</Typography></Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <Paper component="form" variant="outlined" onSubmit={handleCreate} aria-busy={pending} sx={onboardingCardSx}>
                <Box component="span" aria-hidden="true" sx={{ ...cardIconSx, bgcolor: '#eaf1e7', color: '#47744d' }}>✳</Box><Typography variant="h2" sx={{ fontSize: 23 }}>Create a workspace</Typography><Typography variant="body2" color="text.secondary">You’ll be the owner and can invite people later.</Typography>
                <TextField label="Workspace name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} required placeholder="e.g. Acme Studio" slotProps={{ htmlInput: { maxLength: 80 } }} />
                <Button variant="contained" type="submit" disabled={pending}>Create workspace</Button>
              </Paper>
              <Paper component="form" variant="outlined" onSubmit={handleAcceptInvite} aria-busy={pending} sx={onboardingCardSx}>
                <Box component="span" aria-hidden="true" sx={{ ...cardIconSx, bgcolor: '#f1f0e7', color: '#8b7850' }}>↗</Box><Typography variant="h2" sx={{ fontSize: 23 }}>Join a workspace</Typography><Typography variant="body2" color="text.secondary">Paste the invitation link sent to your email.</Typography>
                <TextField label="Invitation link" type="url" value={inviteLink} onChange={(event) => setInviteLink(event.target.value)} required placeholder="https://…?workspace=…&invite=…&token=…" helperText={user.emailVerified ? undefined : 'Verify your email before accepting an invitation.'} />
                <Button variant="outlined" type="submit" disabled={pending || !user.emailVerified}>Accept invitation</Button>
              </Paper>
            </Box>
          </Box>
        )}
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: { xs: 0.75, sm: 2 }, mt: 6, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button size="small" color="error" onClick={() => void handleDeleteAccount()} disabled={pending}>Delete account</Button>
          <Typography variant="caption" color="text.secondary">Workspace data stays in the Firebase project selected by its owner.</Typography>
        </Stack>
      </Box>
    </Box>
  )
}

const onboardingCardSx = { display: 'grid', alignContent: 'start', gap: 2, p: 3, borderRadius: '16px', bgcolor: 'rgba(255,255,255,.8)' }
const cardIconSx = { display: 'grid', width: 34, height: 34, placeItems: 'center', borderRadius: '11px', fontSize: 17 }

function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600).toString().padStart(2, '0')
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')
  const remainder = (seconds % 60).toString().padStart(2, '0')
  return `${hours}:${minutes}:${remainder}`
}

function TimerPanel({ user, workspaceId, catalog }: { user: User; workspaceId: string; catalog: Catalog }) {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [description, setDescription] = useState('')
  const [clientName, setClientName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [taskName, setTaskName] = useState('')
  const [billable, setBillable] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => subscribeToTimeEntries(workspaceId, user.uid, setEntries, (loadError) => setError(readableError(loadError))), [workspaceId, user.uid])
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const runningEntry = entries.find((entry) => entry.endAt === null)
  const recentEntries = entries.filter((entry) => entry.endAt !== null).slice(0, 5)

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

  async function handleContinue(entry: TimeEntry) {
    setPending(true)
    setError('')
    try {
      await continueTimer(user, workspaceId, entry)
    } catch (requestError) {
      setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  const elapsed = runningEntry?.startAt ? Math.max(0, Math.floor(now / 1000 - runningEntry.startAt.toMillis() / 1000)) : 0

  return (
    <SectionCard labelledBy="timer-heading">
      <SectionHeading id="timer-heading" kicker="TIME TRACKING" title="Timer" action={runningEntry && <Typography component="span" aria-label={`Elapsed time ${formatElapsed(elapsed)}`} sx={{ color: 'primary.main', fontVariantNumeric: 'tabular-nums', fontSize: 'clamp(27px, 5vw, 38px)', fontWeight: 600, letterSpacing: 1 }}>{formatElapsed(elapsed)}</Typography>} />
      {error && <FormMessage severity="error">{error}</FormMessage>}
      {runningEntry ? (
        <Paper variant="outlined" sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 2, mt: 2.75, p: 2, borderRadius: '12px', borderColor: '#dce9d8', bgcolor: '#f7faf4' }}>
          <Box sx={{ display: 'grid', gap: 0.75, justifyItems: 'start' }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{runningEntry.description || 'Untitled entry'}</Typography>
            <Typography variant="caption" color="text.secondary">{[runningEntry.clientName, runningEntry.projectName, runningEntry.taskName].filter(Boolean).join(' · ') || 'No client, project, or task'}</Typography>
            {runningEntry.billable && <BillableChip />}
          </Box>
          <Button variant="contained" color="error" onClick={() => void handleStop(runningEntry.id)} disabled={pending}>{pending ? 'Saving…' : 'Stop timer'}</Button>
        </Paper>
      ) : (
        <Stack component="form" spacing={2} onSubmit={handleStart} aria-busy={pending} sx={{ mt: 2.75 }}>
          <TextField label="What are you working on?" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Prepare project proposal" required slotProps={{ htmlInput: { maxLength: 500 } }} />
          <Box sx={associationsSx}>
            <SelectField label="Client" value={clientName} onChange={(event) => { setClientName(event.target.value); setProjectName(''); setTaskName('') }}><option value="">No client</option>{catalog.clients.filter((item) => !item.archived).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</SelectField>
            <SelectField label="Project" value={projectName} onChange={(event) => { setProjectName(event.target.value); setTaskName('') }}><option value="">No project</option>{catalog.projects.filter((item) => !item.archived && (!clientName || item.clientId === clientName) && (!item.clientId || catalog.clients.some((client) => client.id === item.clientId && !client.archived))).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</SelectField>
            <SelectField label="Task" value={taskName} onChange={(event) => setTaskName(event.target.value)}><option value="">No task</option>{catalog.tasks.filter((item) => !item.archived && (!projectName || item.projectId === projectName) && catalog.projects.some((project) => project.id === item.projectId && !project.archived && (!project.clientId || catalog.clients.some((client) => client.id === project.clientId && !client.archived)))).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</SelectField>
          </Box>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <FormControlLabel control={<Checkbox checked={billable} onChange={(event) => setBillable(event.target.checked)} />} label="Billable" sx={{ mr: 'auto' }} />
            <Button variant="contained" type="submit" disabled={pending}>{pending ? 'Starting…' : 'Start timer'}</Button>
          </Stack>
        </Stack>
      )}
      {recentEntries.length > 0 && <Box sx={{ mt: 3, pt: 2.25, borderTop: 1, borderColor: 'divider' }}><Typography variant="h3" sx={{ mb: 1 }}>Recent entries</Typography>{recentEntries.map((entry) => {
        const duration = entry.endAt ? Math.max(0, Math.floor((entry.endAt.toMillis() - entry.startAt.toMillis()) / 1000)) : 0
        return <ListRow key={entry.id}><Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}><Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{entry.description || 'Untitled entry'}</Typography><Typography variant="caption" color="text.secondary">{entry.startAt.toDate().toLocaleString()} · {formatElapsed(duration)}</Typography></Box><Button size="small" onClick={() => void handleContinue(entry)} disabled={pending}>Continue</Button></ListRow>
      })}</Box>}
    </SectionCard>
  )
}

const associationsSx = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }

function localDayString(date: Date): string {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfWeekString(day: string, weekStartsOn: number): string {
  const date = new Date(`${day}T12:00:00`)
  const offset = (date.getDay() - weekStartsOn + 7) % 7
  date.setDate(date.getDate() - offset)
  return localDayString(date)
}

function shiftDayString(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00`)
  date.setDate(date.getDate() + days)
  return localDayString(date)
}

function formatWeekLabel(startDay: string): string {
  const start = new Date(`${startDay}T12:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  if (sameMonth) return `${start.toLocaleDateString(undefined, { month: 'long' })} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const endLabel = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startLabel} – ${endLabel}`
}

function localDateTimeValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function dateTimeForDay(day: string, hour: number): string {
  return `${day}T${hour.toString().padStart(2, '0')}:00`
}

function TimeEntriesPanel({ user, workspaceId, isOwner, weekStartsOn, catalog }: { user: User; workspaceId: string; isOwner: boolean; weekStartsOn: number; catalog: Catalog }) {
  const [today] = useState(() => localDayString(new Date()))
  const [weekStart, setWeekStart] = useState(() => startOfWeekString(today, weekStartsOn))
  const [entryState, setEntryState] = useState<{ workspaceId: string; weekStart: string; entries: TimeEntry[] }>({ workspaceId: '', weekStart: '', entries: [] })
  const entries = entryState.workspaceId === workspaceId && entryState.weekStart === weekStart ? entryState.entries : []
  const [editId, setEditId] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [clientName, setClientName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [taskName, setTaskName] = useState('')
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

  useEffect(() => {
    return subscribeToEntriesForRange(workspaceId, user.uid, isOwner, weekStart, 7, (nextEntries) => setEntryState({ workspaceId, weekStart, entries: nextEntries }), (loadError) => setError(readableError(loadError)))
  }, [workspaceId, user.uid, isOwner, weekStart])
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  function clearForm(forDay = weekStart) {
    setEditId(null)
    setDescription('')
    setClientName('')
    setProjectName('')
    setTaskName('')
    setClientId('')
    setProjectId('')
    setTaskId('')
    setBillable(false)
    setEditorDay(forDay)
    setStartAt(dateTimeForDay(forDay, 9))
    setEndAt(dateTimeForDay(forDay, 10))
  }

  function beginEdit(entry: TimeEntry) {
    if (entry.endAt === null) return
    setEditId(entry.id)
    setDescription(entry.description)
    setClientName(entry.clientName ?? '')
    setProjectName(entry.projectName ?? '')
    setTaskName(entry.taskName ?? '')
    setClientId(entry.clientId ?? '')
    setProjectId(entry.projectId ?? '')
    setTaskId(entry.taskId ?? '')
    setBillable(entry.billable)
    setStartAt(localDateTimeValue(entry.startAt.toDate()))
    setEndAt(localDateTimeValue(entry.endAt.toDate()))
    setError('')
    setNotice('')
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    setNotice('')
    try {
      const existing = entries.find((entry) => entry.id === editId)
      await saveManualTimeEntry(user, workspaceId, {
        description,
        clientId: clientId || null,
        projectId: projectId || null,
        taskId: taskId || null,
        clientName: catalog.clients.find((item) => item.id === clientId)?.name ?? (clientName || null),
        projectName: catalog.projects.find((item) => item.id === projectId)?.name ?? (projectName || null),
        taskName: catalog.tasks.find((item) => item.id === taskId)?.name ?? (taskName || null),
        billable,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
      }, existing?.userId, editId ?? undefined)
      clearForm()
      setNotice(editId ? 'Time entry updated.' : 'Time entry added.')
    } catch (requestError) {
      setError(readableError(requestError))
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

  function changeWeek(value: string) {
    if (!value) return
    const nextWeekStart = startOfWeekString(value, weekStartsOn)
    setWeekStart(nextWeekStart)
    setError('')
    setNotice('')
    clearForm(nextWeekStart)
  }

  const weekDays = Array.from({ length: 7 }, (_, index) => shiftDayString(weekStart, index))
  const secondsFor = (entry: TimeEntry) => entry.endAt
    ? Math.max(0, Math.floor((entry.endAt.toMillis() - entry.startAt.toMillis()) / 1000))
    : Math.max(0, Math.floor(now / 1000 - entry.startAt.toMillis() / 1000))
  const weekTotal = entries.reduce((total, entry) => total + secondsFor(entry), 0)

  return (
    <SectionCard labelledBy="entries-heading">
      <SectionHeading id="entries-heading" kicker="YOUR TIME" title="Timesheet" action={
        <Stack direction="row" aria-label="Timesheet week navigation" spacing={1} sx={{ alignItems: 'center', width: { xs: '100%', sm: 'auto' }, justifyContent: 'space-between' }}>
          <Button variant="outlined" aria-label="Previous week" onClick={() => changeWeek(shiftDayString(weekStart, -7))} sx={{ minWidth: 44, px: 1 }}>←</Button>
          <Stack sx={{ alignItems: 'center', flex: { xs: 1, sm: 'none' } }}>
            <Typography variant="body2" sx={{ fontWeight: 650 }}>{formatWeekLabel(weekStart)}</Typography>
            <TextField variant="standard" type="date" value={weekStart} onChange={(event) => changeWeek(event.target.value)} fullWidth={false} slotProps={{ htmlInput: { 'aria-label': 'Choose a week', style: { fontSize: 12, padding: 0 } }, input: { disableUnderline: true } }} sx={{ width: 130 }} />
          </Stack>
          <Button variant="outlined" aria-label="Next week" onClick={() => changeWeek(shiftDayString(weekStart, 7))} sx={{ minWidth: 44, px: 1 }}>→</Button>
          <Button size="small" onClick={() => changeWeek(today)}>Today</Button>
        </Stack>
      } />
      {error && <FormMessage severity="error">{error}</FormMessage>}
      {notice && <FormMessage severity="success">{notice}</FormMessage>}
      <Paper component="form" variant="outlined" onSubmit={handleSave} aria-busy={pending} sx={{ display: 'grid', gap: 2, mt: 3, p: 2.25, borderRadius: '12px', bgcolor: '#fbfcfa' }}>
        <Typography variant="h3">{editId ? 'Edit entry' : `Add time · ${new Date(`${editorDay}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`}</Typography>
        <TextField label="Description" value={description} onChange={(event) => setDescription(event.target.value)} required slotProps={{ htmlInput: { maxLength: 500 } }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
          <TextField label="Start" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} required slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="End" type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} required slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
        <Box sx={associationsSx}>
          <SelectField label="Client" value={clientId} onChange={(event) => { setClientId(event.target.value); setClientName(''); setProjectName(''); setTaskName(''); setProjectId(''); setTaskId('') }}><option value="">No client</option>{catalog.clients.filter((item) => !item.archived || item.id === clientId).map((item) => <option key={item.id} value={item.id}>{item.name}{item.archived ? ' (archived)' : ''}</option>)}</SelectField>
          <SelectField label="Project" value={projectId} onChange={(event) => { setProjectId(event.target.value); setProjectName(''); setTaskName(''); setTaskId('') }}><option value="">No project</option>{catalog.projects.filter((item) => (!item.archived || item.id === projectId) && (!clientId || item.clientId === clientId) && (item.id === projectId || !item.clientId || catalog.clients.some((client) => client.id === item.clientId && !client.archived))).map((item) => <option key={item.id} value={item.id}>{item.name}{item.archived ? ' (archived)' : ''}</option>)}</SelectField>
          <SelectField label="Task" value={taskId} onChange={(event) => { setTaskId(event.target.value); setTaskName('') }}><option value="">No task</option>{catalog.tasks.filter((item) => (!item.archived || item.id === taskId) && (!projectId || item.projectId === projectId) && (item.id === taskId || catalog.projects.some((project) => project.id === item.projectId && !project.archived && (!project.clientId || catalog.clients.some((client) => client.id === project.clientId && !client.archived))))).map((item) => <option key={item.id} value={item.id}>{item.name}{item.archived ? ' (archived)' : ''}</option>)}</SelectField>
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControlLabel control={<Checkbox checked={billable} onChange={(event) => setBillable(event.target.checked)} />} label="Billable" sx={{ mr: 'auto' }} />
          {editId && <Button variant="outlined" onClick={() => clearForm()} disabled={pending}>Cancel</Button>}
          <Button variant="contained" type="submit" disabled={pending}>{pending ? 'Saving…' : editId ? 'Save changes' : 'Add entry'}</Button>
        </Stack>
      </Paper>
      <Paper variant="outlined" aria-live="polite" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mt: 3, px: 2, py: 1.75, borderRadius: '11px', borderColor: '#dce9d8', bgcolor: '#f7faf4' }}>
        <Box sx={{ display: 'grid', gap: 0.5 }}><Typography variant="caption" color="text.secondary">Week total</Typography><Typography sx={{ color: 'primary.main', fontVariantNumeric: 'tabular-nums', fontSize: 20, fontWeight: 700 }}>{formatElapsed(weekTotal)}</Typography></Box>
        <Typography variant="caption" color="text.secondary">{entries.length} {entries.length === 1 ? 'entry' : 'entries'} this week</Typography>
      </Paper>
      <Box aria-live="polite" sx={{ mt: 2.25 }}>
        {weekDays.map((weekDay) => {
          const dayEntries = entries.filter((entry) => localDayString(entry.startAt.toDate()) === weekDay).sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())
          const dayTotal = dayEntries.reduce((total, entry) => total + secondsFor(entry), 0)
          const date = new Date(`${weekDay}T12:00:00`)
          return <Box component="section" key={weekDay} aria-labelledby={`timesheet-${weekDay}`} sx={{ pt: 2, pb: 0.75, borderBottom: 1, borderColor: 'divider' }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1.75 }}>
              <Typography variant="h3" id={`timesheet-${weekDay}`} sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}><span>{date.toLocaleDateString(undefined, { weekday: 'long' })}</span><Typography component="time" variant="caption" color="text.secondary" dateTime={weekDay}>{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Typography></Typography>
              <Stack direction="row" spacing={{ xs: 0.5, sm: 1.75 }} sx={{ alignItems: 'center' }}><Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatElapsed(dayTotal)}</Typography><Button size="small" onClick={() => { clearForm(weekDay); setError(''); setNotice('') }}>Add entry</Button></Stack>
            </Stack>
            {dayEntries.length === 0 ? <EmptyText>No entries</EmptyText> : dayEntries.map((entry) => <Box component="article" key={entry.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '54px minmax(0, 1fr) auto', sm: '78px minmax(0, 1fr) auto auto' }, alignItems: 'center', gap: { xs: 1, sm: 1.75 }, py: 1.5, borderTop: 1, borderColor: '#eef0eb', minWidth: 0 }}>
              <Box sx={{ display: 'grid', gap: 0.5, fontVariantNumeric: 'tabular-nums' }}><Typography variant="body2" sx={{ fontWeight: 600 }}>{entry.startAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Typography><Typography variant="caption" color="text.secondary">{entry.endAt ? entry.endAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Running'}</Typography></Box>
              <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}><Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{entry.description || 'Untitled entry'}</Typography><Typography variant="caption" color="text.secondary" noWrap>{[entry.clientName, entry.projectName, entry.taskName].filter(Boolean).join(' · ') || 'No client, project, or task'}{entry.userId !== user.uid && ' · Workspace member'}</Typography></Box>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>{formatElapsed(secondsFor(entry))}</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gridColumn: { xs: '1 / -1', sm: 'auto' } }}>{entry.endAt === null && <Chip label="Running" color="warning" variant="outlined" />}{entry.billable && <BillableChip />}<Button size="small" onClick={() => beginEdit(entry)} disabled={pending || entry.endAt === null}>Edit</Button><Button size="small" color="error" onClick={() => void handleDelete(entry)} disabled={pending || entry.endAt === null}>Delete</Button></Stack>
            </Box>)}
          </Box>
        })}
      </Box>
    </SectionCard>
  )
}

function EmailVerificationNotice({ user }: { user: User }) {
  const [message, setMessage] = useState('Check your inbox for a verification link. Verify your email before accepting an invitation.')
  const [pending, setPending] = useState(false)
  return <Alert severity="warning" role="status" sx={{ mb: 2.5, alignItems: 'center' }} action={<Button size="small" color="inherit" disabled={pending} onClick={() => {
    setPending(true)
    void sendEmailVerification(user).then(() => setMessage('A new verification link has been sent.')).catch((error: unknown) => setMessage(readableError(error))).finally(() => setPending(false))
  }}>Resend email</Button>}>{message}</Alert>
}

function App() {
  const [user, setUser] = useState<User | null>(auth.currentUser)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => onAuthStateChanged(auth, (currentUser) => {
    setUser(currentUser)
    setAuthReady(true)
  }), [])

  if (!authReady) return <Stack component="main" role="status" spacing={2} sx={{ minHeight: '100vh', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}><CircularProgress size={28} /><Typography variant="body2">Loading your Ticknest account…</Typography></Stack>
  return (
    <>
      {user ? <WorkspaceScreen user={user} /> : <AuthScreen onAuthenticated={setUser} />}
      <Typography component="footer" variant="caption" sx={{ display: 'block', px: 2, py: 1.75, borderTop: 1, borderColor: 'divider', bgcolor: 'background.default', color: 'text.secondary', textAlign: 'center' }}>Ticknest v{__APP_VERSION__}</Typography>
    </>
  )
}

export default App
