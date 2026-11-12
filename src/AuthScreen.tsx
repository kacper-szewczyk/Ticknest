import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import type { User } from 'firebase/auth'
import { type FormEvent, useState } from 'react'
import { Trans, useTranslation } from './i18n'
import { registerWithEmail, sendPasswordReset, signInWithEmail, signInWithGoogle } from './lib/auth'
import { isGoogleSignInEnabled } from './lib/authOptions'
import type { DemoAccount } from './lib/demo'
import { readableError } from './lib/errors'
import { Brand } from './Brand'
import { DemoAccountsPanel } from './DemoMode'
import { LanguageSelect } from './LanguageSelect'
import { FormMessage } from './ui'

type AuthMode = 'sign-in' | 'sign-up' | 'reset'

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const { t } = useTranslation()
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
        setNotice(t('auth.resetSent'))
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

  async function handleDemoSignIn(account: DemoAccount) {
    setError('')
    setNotice('')
    setMode('sign-in')
    // Keep the fields in step, so a failed sign-in can be retried from the form.
    setEmail(account.email)
    setPassword(account.password)
    setPending(true)
    try {
      onAuthenticated(await signInWithEmail(account.email, account.password))
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
          // Pin to the viewport on desktop so the hero stays centred on screen
          // even when the form column (e.g. with the demo panel) is taller.
          position: { md: 'sticky' },
          top: { md: 0 },
          alignSelf: { md: 'start' },
          height: { md: '100vh' },
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
            {t('auth.heroKicker')}
          </Typography>
          <Typography variant="h1" sx={{ mt: 3, mb: 2.5, fontSize: 'clamp(43px, 5vw, 74px)' }}>
            <Trans
              i18nKey="auth.heroTitle"
              components={{ highlight: <Box component="span" sx={{ color: 'primary.light' }} /> }}
            />
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 360, lineHeight: 1.7 }}>
            {t('auth.heroBody')}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
          {t('auth.heroFooter')}
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
            {isReset ? t('auth.kickerReset') : t('auth.kickerWelcome')}
          </Typography>
          <Typography variant="h2" id="auth-heading" sx={{ fontSize: 34, mt: 1, mb: 1 }}>
            {isReset ? t('auth.titleReset') : isSignUp ? t('auth.titleSignUp') : t('auth.titleSignIn')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3.5, lineHeight: 1.6 }}>
            {isReset ? t('auth.introReset') : isSignUp ? t('auth.introSignUp') : t('auth.introSignIn')}
          </Typography>
          {mode !== 'reset' && (
            <>
              <DemoAccountsPanel onUse={(account) => void handleDemoSignIn(account)} disabled={pending} />
              {isGoogleSignInEnabled() && (
                <>
                  <Button
                    variant="outlined"
                    color="inherit"
                    fullWidth
                    onClick={() => void handleGoogleSignIn()}
                    disabled={pending}
                    startIcon={
                      <Box component="svg" viewBox="0 0 48 48" aria-hidden="true" sx={{ width: 18, height: 18 }}>
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        />
                      </Box>
                    }
                  >
                    {pending ? t('auth.googleConnecting') : t('auth.googleContinue')}
                  </Button>
                  <Divider sx={{ my: 2.25, color: 'text.secondary', fontSize: 11 }}>{t('auth.orUseEmail')}</Divider>
                </>
              )}
            </>
          )}
          <Stack component="form" spacing={2} onSubmit={handleSubmit} aria-busy={pending}>
            {isSignUp && (
              <TextField
                label={t('auth.fullName')}
                size="medium"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                slotProps={{ htmlInput: { maxLength: 80 } }}
              />
            )}
            <TextField
              label={t('auth.email')}
              size="medium"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            {!isReset && (
              <TextField
                label={t('auth.password')}
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
              {pending
                ? t('auth.pleaseWait')
                : isReset
                  ? t('auth.sendResetLink')
                  : isSignUp
                    ? t('auth.createAccount')
                    : t('auth.signIn')}
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
                {t('auth.forgotPassword')}
              </Button>
            )}
            {isReset ? (
              <p>
                {t('auth.rememberedIt')}{' '}
                <Button
                  size="small"
                  onClick={() => {
                    setError('')
                    setMode('sign-in')
                  }}
                >
                  {t('auth.signIn')}
                </Button>
              </p>
            ) : (
              <p>
                {isSignUp ? t('auth.haveAccount') : t('auth.newToTicknest')}{' '}
                <Button
                  size="small"
                  onClick={() => {
                    setError('')
                    setMode(isSignUp ? 'sign-in' : 'sign-up')
                  }}
                >
                  {isSignUp ? t('auth.signIn') : t('auth.createAnAccount')}
                </Button>
              </p>
            )}
          </Box>
          <LanguageSelect disabled={pending} sx={{ display: 'flex', mt: 3, mx: 'auto', maxWidth: 220 }} />
        </Box>
      </Box>
    </Box>
  )
}
