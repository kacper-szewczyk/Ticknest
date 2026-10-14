import { onAuthStateChanged, sendEmailVerification, type User } from 'firebase/auth'
import { useEffect, useState, type FormEvent } from 'react'
import {
  acceptWorkspaceInvitation,
  createWorkspace,
  getSavedWorkspaceId,
  loadWorkspaces,
  saveActiveWorkspaceId,
  type Workspace,
} from './lib/workspaces'
import {
  deleteCurrentAccount,
  registerWithEmail,
  sendPasswordReset,
  signInWithEmail,
  signOutUser,
} from './lib/auth'
import { auth } from './lib/firebase'
import './App.css'

type AuthMode = 'sign-in' | 'sign-up' | 'reset'

function readableError(error: unknown): string {
  if (!(error instanceof Error)) return 'Something went wrong. Please try again.'
  const code = 'code' in error ? String(error.code) : ''
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'An account already exists for this email. Sign in instead.',
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Choose a password with at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'auth/requires-recent-login': 'Sign in again before deleting your account.',
    'permission-denied': 'You do not have access to this workspace.',
  }
  return messages[code] ?? error.message
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
      if (!workspaceId || !invitationId) throw new Error('That invitation link is not valid.')
      await acceptWorkspaceInvitation(user, workspaceId, invitationId)
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
          <form className="join-another-card" onSubmit={handleAcceptInvite}>
            <div><h2>Join another workspace</h2><p>Paste an invitation link sent to your email.</p></div>
            <label><span className="visually-hidden">Invitation link</span><input type="url" value={inviteLink} onChange={(event) => setInviteLink(event.target.value)} required placeholder="https://…?workspace=…&invite=…" /></label>
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
                <label>Invitation link<input type="url" value={inviteLink} onChange={(event) => setInviteLink(event.target.value)} required placeholder="https://…?workspace=…&invite=…" /></label>
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
