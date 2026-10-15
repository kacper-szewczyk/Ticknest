import { onAuthStateChanged, sendEmailVerification, type User } from 'firebase/auth'
import { useEffect, useState, type FormEvent } from 'react'
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
import './App.css'
import { subscribeToCatalog, type Catalog } from './lib/catalog'
import { CatalogPanel } from './CatalogPanel'
import { MemberManagementPanel } from './MemberManagementPanel'

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
    'permission-denied': 'You do not have access to this workspace.',
  }
  if (messages[code]) return messages[code]
  if (code.startsWith('auth/')) return 'We couldn’t sign you in. Please try again. If the problem continues, check the Firebase Authentication settings.'
  return error.message
}

function Brand() {
  return (
    <a className="brand" href="/" aria-label="Ticknest home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><path d="M5 13.5 9.2 18 19 6" /></svg>
      </span>
      <span>ticknest</span>
    </a>
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
    <main className="auth-layout">
      <section className="auth-aside">
        <Brand />
        <div className="auth-promise">
          <span className="eyebrow"><span className="eyebrow-line" /> YOUR TIME, YOUR INFRASTRUCTURE</span>
          <h1>Make room for <span>the work that matters.</span></h1>
          <p>Track time with a team workspace that lives in your own Firebase project.</p>
        </div>
        <span className="aside-footnote">Open source · Self-hosted · No seat limits</span>
      </section>
      <section className="auth-panel" aria-labelledby="auth-heading">
        <div className="auth-form-wrap">
          <p className="section-kicker">{isReset ? 'ACCOUNT RECOVERY' : 'WELCOME TO TICKNEST'}</p>
          <h2 id="auth-heading">{isReset ? 'Reset your password' : isSignUp ? 'Create your account' : 'Welcome back'}</h2>
          <p className="auth-subtitle">
            {isReset ? 'We’ll email you a secure link to choose a new password.' : isSignUp ? 'Start a workspace for your team in just a moment.' : 'Sign in to continue to your workspace.'}
          </p>
          {mode !== 'reset' && <>
            <button className="google-button" type="button" onClick={() => void handleGoogleSignIn()} disabled={pending}>
              <span className="google-mark" aria-hidden="true">G</span>
              {pending ? 'Connecting…' : 'Continue with Google'}
            </button>
            <div className="auth-divider"><span>or use email</span></div>
          </>}
          <form className="auth-form" onSubmit={handleSubmit}>
            {isSignUp && (
              <label>Full name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} /></label>
            )}
            <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            {!isReset && (
              <label>Password<input type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} /></label>
            )}
            {error && <p className="form-message is-error" role="alert">{error}</p>}
            {notice && <p className="form-message is-success" role="status">{notice}</p>}
            <button className="primary-button" type="submit" disabled={pending}>
              {pending ? 'Please wait…' : isReset ? 'Send reset link' : isSignUp ? 'Create account' : 'Sign in'}
            </button>
          </form>
          <div className="auth-links">
            {mode === 'sign-in' && <button className="text-button" onClick={() => { setError(''); setMode('reset') }}>Forgot password?</button>}
            {isReset ? (
              <p>Remembered it? <button className="text-button" onClick={() => { setError(''); setMode('sign-in') }}>Sign in</button></p>
            ) : (
              <p>{isSignUp ? 'Already have an account?' : 'New to Ticknest?'} <button className="text-button" onClick={() => { setError(''); setMode(isSignUp ? 'sign-in' : 'sign-up') }}>{isSignUp ? 'Sign in' : 'Create an account'}</button></p>
            )}
          </div>
        </div>
      </section>
    </main>
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
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="topbar-meta">
          {workspaces.length > 0 && <label className="workspace-select-label"><span className="visually-hidden">Active workspace</span><select aria-label="Active workspace" value={activeId ?? ''} onChange={(event) => { setActiveId(event.target.value); saveActiveWorkspaceId(user.uid, event.target.value) }}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>}
          <button className="text-button" onClick={() => void signOutUser()}>Sign out</button>
        </div>
      </header>
      <main className="workspace-main">
        {error && <p className="form-message is-error" role="alert">{error}</p>}
        {notice && <p className="form-message is-success" role="status">{notice}</p>}
        {!user.emailVerified && <EmailVerificationNotice user={user} />}
        {activeWorkspace ? (
          <>
          <section className="welcome-card">
            <p className="section-kicker">YOUR WORKSPACE</p>
            <h1>{activeWorkspace.name}</h1>
            <p>Signed in as {user.email}. Your workspace is ready for the timer workflow.</p>
            <div className="workspace-badge"><span className="status-dot" /> {activeWorkspace.role === 'owner' ? 'Workspace owner' : 'Workspace member'}</div>
            {workspaces.length > 1 && <p className="switch-hint">Use the workspace menu above to switch between your workspaces.</p>}
          </section>
          <TimerPanel user={user} workspaceId={activeWorkspace.id} catalog={catalog} />
          {activeWorkspace.role === 'owner' && <CatalogPanel workspaceId={activeWorkspace.id} />}
          {activeWorkspace.role === 'owner' && <MemberManagementPanel workspaceId={activeWorkspace.id} currentUserId={user.uid} />}
          <TimeEntriesPanel user={user} workspaceId={activeWorkspace.id} isOwner={activeWorkspace.role === 'owner'} weekStartsOn={activeWorkspace.weekStartsOn} catalog={catalog} />
          <form className="join-another-card" onSubmit={handleAcceptInvite}>
            <div><h2>Join another workspace</h2><p>Paste an invitation link sent to your email.</p></div>
                <label><span className="visually-hidden">Invitation link</span><input type="url" value={inviteLink} onChange={(event) => setInviteLink(event.target.value)} required placeholder="https://…?workspace=…&invite=…&token=…" /></label>
            <button className="secondary-button" type="submit" disabled={pending || !user.emailVerified}>Accept invitation</button>
          </form>
          </>
        ) : (
          <section className="onboarding-wrap">
            <div className="onboarding-heading"><p className="section-kicker">ONE LAST STEP</p><h1>Set up your workspace</h1><p>Hi {user.displayName?.split(' ')[0] ?? 'there'} — create a new workspace or join one you’ve been invited to.</p></div>
            <div className="onboarding-grid">
              <form className="onboarding-card" onSubmit={handleCreate}>
                <span className="card-icon">✳</span><h2>Create a workspace</h2><p>You’ll be the owner and can invite people later.</p>
                <label>Workspace name<input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} required maxLength={80} placeholder="e.g. Acme Studio" /></label>
                <button className="primary-button" type="submit" disabled={pending}>Create workspace</button>
              </form>
              <form className="onboarding-card" onSubmit={handleAcceptInvite}>
                <span className="card-icon invite-icon">↗</span><h2>Join a workspace</h2><p>Paste the invitation link sent to your email.</p>
                <label>Invitation link<input type="url" value={inviteLink} onChange={(event) => setInviteLink(event.target.value)} required placeholder="https://…?workspace=…&invite=…&token=…" /></label>
                <button className="secondary-button" type="submit" disabled={pending || !user.emailVerified}>Accept invitation</button>
                {!user.emailVerified && <small className="field-help">Verify your email before accepting an invitation.</small>}
              </form>
            </div>
          </section>
        )}
        <div className="account-actions"><button className="text-button danger-link" onClick={() => void handleDeleteAccount()} disabled={pending}>Delete account</button><span>Workspace data stays in the Firebase project selected by its owner.</span></div>
      </main>
    </div>
  )
}

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
    <section className="timer-card" aria-labelledby="timer-heading">
      <div className="timer-heading"><div><p className="section-kicker">TIME TRACKING</p><h2 id="timer-heading">Timer</h2></div>
        {runningEntry && <span className="timer-clock" aria-label={`Elapsed time ${formatElapsed(elapsed)}`}>{formatElapsed(elapsed)}</span>}
      </div>
      {error && <p className="form-message is-error" role="alert">{error}</p>}
      {runningEntry ? (
        <div className="running-timer">
          <div><strong>{runningEntry.description || 'Untitled entry'}</strong><p>{[runningEntry.clientName, runningEntry.projectName, runningEntry.taskName].filter(Boolean).join(' · ') || 'No client, project, or task'}</p>{runningEntry.billable && <span className="billable-tag">Billable</span>}</div>
          <button className="stop-button" type="button" onClick={() => void handleStop(runningEntry.id)} disabled={pending}>{pending ? 'Saving…' : 'Stop timer'}</button>
        </div>
      ) : (
        <form className="timer-form" onSubmit={handleStart}>
          <label className="timer-description">What are you working on?<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="e.g. Prepare project proposal" required /></label>
          <div className="timer-associations">
            <label>Client<select value={clientName} onChange={(event) => { setClientName(event.target.value); setProjectName(''); setTaskName('') }}><option value="">No client</option>{catalog.clients.filter((item) => !item.archived).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <label>Project<select value={projectName} onChange={(event) => { setProjectName(event.target.value); setTaskName('') }}><option value="">No project</option>{catalog.projects.filter((item) => !item.archived && (!clientName || item.clientId === clientName) && (!item.clientId || catalog.clients.some((client) => client.id === item.clientId && !client.archived))).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <label>Task<select value={taskName} onChange={(event) => setTaskName(event.target.value)}><option value="">No task</option>{catalog.tasks.filter((item) => !item.archived && (!projectName || item.projectId === projectName) && catalog.projects.some((project) => project.id === item.projectId && !project.archived && (!project.clientId || catalog.clients.some((client) => client.id === project.clientId && !client.archived)))).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          </div>
          <div className="timer-actions"><label className="billable-control"><input type="checkbox" checked={billable} onChange={(event) => setBillable(event.target.checked)} /> Billable</label><button className="primary-button" type="submit" disabled={pending}>{pending ? 'Starting…' : 'Start timer'}</button></div>
        </form>
      )}
      {recentEntries.length > 0 && <div className="recent-entries"><h3>Recent entries</h3>{recentEntries.map((entry) => {
        const duration = entry.endAt ? Math.max(0, Math.floor((entry.endAt.toMillis() - entry.startAt.toMillis()) / 1000)) : 0
        return <article className="recent-entry" key={entry.id}><div><strong>{entry.description || 'Untitled entry'}</strong><span>{entry.startAt.toDate().toLocaleString()} · {formatElapsed(duration)}</span></div><button className="text-button" type="button" onClick={() => void handleContinue(entry)} disabled={pending}>Continue</button></article>
      })}</div>}
    </section>
  )
}

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
    <section className="entries-card" aria-labelledby="entries-heading">
      <div className="entries-heading"><div><p className="section-kicker">YOUR TIME</p><h2 id="entries-heading">Timesheet</h2></div>
        <div className="week-navigation" aria-label="Timesheet week navigation">
          <button className="secondary-button" type="button" aria-label="Previous week" onClick={() => changeWeek(shiftDayString(weekStart, -7))}>←</button>
          <label className="week-picker"><span>{formatWeekLabel(weekStart)}</span><input aria-label="Choose a week" type="date" value={weekStart} onChange={(event) => changeWeek(event.target.value)} /></label>
          <button className="secondary-button" type="button" aria-label="Next week" onClick={() => changeWeek(shiftDayString(weekStart, 7))}>→</button>
          <button className="text-button" type="button" onClick={() => changeWeek(today)}>Today</button>
        </div>
      </div>
      {error && <p className="form-message is-error" role="alert">{error}</p>}
      {notice && <p className="form-message is-success" role="status">{notice}</p>}
      <form className="entry-editor" onSubmit={handleSave}>
        <h3>{editId ? 'Edit entry' : `Add time · ${new Date(`${editorDay}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`}</h3>
        <label>Description<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} required /></label>
        <div className="entry-editor-times">
          <label>Start<input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} required /></label>
          <label>End<input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} required /></label>
        </div>
        <div className="timer-associations">
          <label>Client<select value={clientId} onChange={(event) => { setClientId(event.target.value); setClientName(''); setProjectName(''); setTaskName(''); setProjectId(''); setTaskId('') }}><option value="">No client</option>{catalog.clients.filter((item) => !item.archived || item.id === clientId).map((item) => <option key={item.id} value={item.id}>{item.name}{item.archived ? ' (archived)' : ''}</option>)}</select></label>
          <label>Project<select value={projectId} onChange={(event) => { setProjectId(event.target.value); setProjectName(''); setTaskName(''); setTaskId('') }}><option value="">No project</option>{catalog.projects.filter((item) => (!item.archived || item.id === projectId) && (!clientId || item.clientId === clientId) && (item.id === projectId || !item.clientId || catalog.clients.some((client) => client.id === item.clientId && !client.archived))).map((item) => <option key={item.id} value={item.id}>{item.name}{item.archived ? ' (archived)' : ''}</option>)}</select></label>
          <label>Task<select value={taskId} onChange={(event) => { setTaskId(event.target.value); setTaskName('') }}><option value="">No task</option>{catalog.tasks.filter((item) => (!item.archived || item.id === taskId) && (!projectId || item.projectId === projectId) && (item.id === taskId || catalog.projects.some((project) => project.id === item.projectId && !project.archived && (!project.clientId || catalog.clients.some((client) => client.id === project.clientId && !client.archived))))).map((item) => <option key={item.id} value={item.id}>{item.name}{item.archived ? ' (archived)' : ''}</option>)}</select></label>
        </div>
        <div className="timer-actions"><label className="billable-control"><input type="checkbox" checked={billable} onChange={(event) => setBillable(event.target.checked)} /> Billable</label>
          {editId && <button className="secondary-button" type="button" onClick={() => clearForm()} disabled={pending}>Cancel</button>}
          <button className="primary-button" type="submit" disabled={pending}>{pending ? 'Saving…' : editId ? 'Save changes' : 'Add entry'}</button>
        </div>
      </form>
      <div className="timesheet-summary" aria-live="polite"><div><span>Week total</span><strong>{formatElapsed(weekTotal)}</strong></div><span>{entries.length} {entries.length === 1 ? 'entry' : 'entries'} this week</span></div>
      <div className="timesheet-days" aria-live="polite">
        {weekDays.map((weekDay) => {
          const dayEntries = entries.filter((entry) => localDayString(entry.startAt.toDate()) === weekDay).sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())
          const dayTotal = dayEntries.reduce((total, entry) => total + secondsFor(entry), 0)
          const date = new Date(`${weekDay}T12:00:00`)
          return <section className="timesheet-day" key={weekDay} aria-labelledby={`timesheet-${weekDay}`}>
            <div className="timesheet-day-heading"><h3 id={`timesheet-${weekDay}`}><span>{date.toLocaleDateString(undefined, { weekday: 'long' })}</span><time dateTime={weekDay}>{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time></h3><div><strong>{formatElapsed(dayTotal)}</strong><button className="text-button" type="button" onClick={() => { clearForm(weekDay); setError(''); setNotice('') }}>Add entry</button></div></div>
            {dayEntries.length === 0 ? <p className="empty-entries">No entries</p> : dayEntries.map((entry) => <article className="day-entry" key={entry.id}>
              <div className="entry-time"><strong>{entry.startAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong><span>{entry.endAt ? entry.endAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Running'}</span></div>
              <div className="entry-summary"><strong>{entry.description || 'Untitled entry'}</strong><span>{[entry.clientName, entry.projectName, entry.taskName].filter(Boolean).join(' · ') || 'No client, project, or task'}{entry.userId !== user.uid && ' · Workspace member'}</span></div>
              <span className="entry-duration">{formatElapsed(secondsFor(entry))}</span>
              <div className="entry-actions">{entry.endAt === null && <span className="running-entry-tag">Running</span>}{entry.billable && <span className="billable-tag">Billable</span>}<button className="text-button" type="button" onClick={() => beginEdit(entry)} disabled={pending || entry.endAt === null}>Edit</button><button className="text-button danger-link" type="button" onClick={() => void handleDelete(entry)} disabled={pending || entry.endAt === null}>Delete</button></div>
            </article>)}
          </section>
        })}
      </div>
    </section>
  )
}

function EmailVerificationNotice({ user }: { user: User }) {
  const [message, setMessage] = useState('Check your inbox for a verification link. Verify your email before accepting an invitation.')
  const [pending, setPending] = useState(false)
  return <div className="verification-banner" role="status"><span>{message}</span><button className="text-button" disabled={pending} onClick={() => {
    setPending(true)
    void sendEmailVerification(user).then(() => setMessage('A new verification link has been sent.')).catch((error: unknown) => setMessage(readableError(error))).finally(() => setPending(false))
  }}>Resend email</button></div>
}

function App() {
  const [user, setUser] = useState<User | null>(auth.currentUser)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => onAuthStateChanged(auth, (currentUser) => {
    setUser(currentUser)
    setAuthReady(true)
  }), [])

  if (!authReady) return <main className="loading-screen" role="status">Loading your Ticknest account…</main>
  return user ? <WorkspaceScreen user={user} /> : <AuthScreen onAuthenticated={setUser} />
}

export default App
