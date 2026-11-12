import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppErrorBoundary, ErrorPage } from './AppErrorBoundary'
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

function renderStartupError(error: unknown) {
  console.error(error)
  root.render(
    withProviders(
      <ErrorPage
        title={i18n.t('app.startFailedTitle')}
        message={error instanceof Error ? error.message : i18n.t('app.startFailedBody')}
      />,
    ),
  )
}

// The interface language loads alongside the first screen, so it is already in the user's language.
// A paused demo never loads App, so it makes no Firebase requests. See "Traffic spikes" in docs/operations.md.
if (import.meta.env.VITE_DEMO_MODE === 'true' && import.meta.env.VITE_DEMO_PAUSED === 'true') {
  Promise.all([import('./DemoMode'), startI18n()])
    .then(([{ DemoPausedPage }]) => {
      root.render(withProviders(<DemoPausedPage />))
    })
    .catch(renderStartupError)
} else {
  // App is loaded dynamically so a Firebase configuration error renders a message instead of a blank page.
  Promise.all([import('./App.tsx'), startI18n()])
    .then(([{ default: App }]) => {
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
