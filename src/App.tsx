import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { type User, onAuthStateChanged } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { auth } from './lib/firebase'
import { changeAppLanguage, currentLanguage, useAppLanguage, useTranslation } from './i18n'
import { subscribeToUserPreferences } from './lib/userPreferences'
import { AuthScreen } from './AuthScreen'
import { WorkspaceScreen } from './WorkspaceScreen'
import { usePalette } from './paletteContext'
import { LoadingState } from './ui'

function App() {
  const [user, setUser] = useState<User | null>(auth.currentUser)
  const [authReady, setAuthReady] = useState(false)
  const { applyPalette } = usePalette()
  const { t } = useTranslation()
  const language = useAppLanguage()
  const uid = user?.uid

  useEffect(
    () =>
      onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser)
        setAuthReady(true)
      }),
    [],
  )

  // Palette and language are per-user preferences stored on the profile, so they follow the user across devices.
  useEffect(() => {
    if (!uid) return
    return subscribeToUserPreferences(uid, ({ palette, language: saved }) => {
      applyPalette(palette)
      if (saved && saved !== currentLanguage())
        void changeAppLanguage(saved).catch((error: unknown) => console.error(error))
    })
  }, [uid, applyPalette])

  // Firebase Auth sends verification and password-reset emails in this language.
  useEffect(() => {
    auth.languageCode = language
  }, [language])

  if (!authReady)
    return (
      <Box component="main" sx={{ display: 'grid', minHeight: '100vh', placeItems: 'center' }}>
        <LoadingState label={t('app.loadingAccount')} />
      </Box>
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
            py: 0.75,
            fontSize: 11,
            lineHeight: 1.4,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'background.default',
            color: 'text.secondary',
            textAlign: 'center',
          }}
        >
          {t('app.version', { version: __APP_VERSION__ })}
        </Typography>
      )}
    </>
  )
}

export default App
