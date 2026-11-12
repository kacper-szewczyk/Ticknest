import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppErrorBoundary, ErrorPage } from './AppErrorBoundary'
import { AppThemeProvider } from './AppThemeProvider'

const root = createRoot(document.getElementById('root')!)

function withProviders(children: ReactNode) {
  return (
    <StrictMode>
      <AppThemeProvider>{children}</AppThemeProvider>
    </StrictMode>
  )
}

function renderStartupError(error: unknown) {
  console.error(error)
  root.render(
    withProviders(
      <ErrorPage
        title="Ticknest could not start"
        message={error instanceof Error ? error.message : 'An unexpected error occurred while loading the app.'}
      />,
    ),
  )
}

// A paused demo never loads App, so it makes no Firebase requests. See "Traffic spikes" in docs/operations.md.
if (import.meta.env.VITE_DEMO_MODE === 'true' && import.meta.env.VITE_DEMO_PAUSED === 'true') {
  import('./DemoMode')
    .then(({ DemoPausedPage }) => {
      root.render(withProviders(<DemoPausedPage />))
    })
    .catch(renderStartupError)
} else {
  // App is loaded dynamically so a Firebase configuration error renders a message instead of a blank page.
  import('./App.tsx')
    .then(({ default: App }) => {
      root.render(
        withProviders(
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>,
        ),
      )
    })
    .catch(renderStartupError)
}
