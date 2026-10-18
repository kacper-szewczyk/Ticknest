import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { AppThemeProvider } from './AppThemeProvider'

const root = createRoot(document.getElementById('root')!)

function withProviders(children: ReactNode) {
  return (
    <StrictMode>
      <AppThemeProvider>{children}</AppThemeProvider>
    </StrictMode>
  )
}

// App is loaded dynamically so a Firebase configuration error renders a message instead of a blank page.
import('./App.tsx')
  .then(({ default: App }) => {
    root.render(withProviders(<App />))
  })
  .catch((error: unknown) => {
    console.error(error)
    root.render(
      withProviders(
        <Box component="main" role="alert" sx={{ maxWidth: '40rem', mx: 'auto', my: 8, px: 2 }}>
          <Typography variant="h1" sx={{ fontSize: '2rem', mb: 2 }}>
            Ticknest could not start
          </Typography>
          <Typography>
            {error instanceof Error ? error.message : 'An unexpected error occurred while loading the app.'}
          </Typography>
        </Box>,
      ),
    )
  })
