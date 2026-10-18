import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { type User, onAuthStateChanged } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { auth } from './lib/firebase'
import { subscribeToPalettePreference } from './lib/userPreferences'
import { AuthScreen } from './AuthScreen'
import { WorkspaceScreen } from './WorkspaceScreen'
import { usePalette } from './paletteContext'

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
