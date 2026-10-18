import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import type { User } from 'firebase/auth'
import { type FormEvent, useState } from 'react'
import { registerWithEmail, sendPasswordReset, signInWithEmail, signInWithGoogle } from './lib/auth'
import { readableError } from './lib/errors'
import { Brand } from './Brand'
import { FormMessage } from './ui'

type AuthMode = 'sign-in' | 'sign-up' | 'reset'

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
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
