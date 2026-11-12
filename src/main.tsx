import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { AppThemeProvider } from './AppThemeProvider'
import { i18n, startI18n } from './i18n'

const root = createRoot(document.getElementById('root')!)

function withProviders(children: ReactNode) {
  return (
    <StrictMode>
      <AppThemeProvider>{children}</AppThemeProvider>
    </StrictMode>
  )
}

// App is loaded dynamically so a Firebase configuration error renders a message instead of a blank page.
// The interface language loads alongside it, so the first screen is already in the user's language.
Promise.all([import('./App.tsx'), startI18n()])
  .then(([{ default: App }]) => {
    root.render(withProviders(<App />))
  })
  .catch((error: unknown) => {
    console.error(error)
    root.render(
      withProviders(
        <Box component="main" role="alert" sx={{ maxWidth: '40rem', mx: 'auto', my: 8, px: 2 }}>
          <Typography variant="h1" sx={{ fontSize: '2rem', mb: 2 }}>
            {i18n.t('app.startFailedTitle')}
          </Typography>
          <Typography>{error instanceof Error ? error.message : i18n.t('app.startFailedBody')}</Typography>
        </Box>,
      ),
    )
  })
