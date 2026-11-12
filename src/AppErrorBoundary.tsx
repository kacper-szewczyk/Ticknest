// Last-resort fallbacks, so a crash or a failed start shows a message instead of a blank page.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { i18n, Trans, useTranslation } from './i18n'
import { DEMO_SOURCE_URL } from './lib/demo'

type ErrorPageProps = { title: string; message: string }

/** A full-page error with a reload button. In demo builds it also points visitors to the repository. */
export function ErrorPage({ title, message }: ErrorPageProps) {
  const { t } = useTranslation()
  return (
    <Box component="main" role="alert" sx={{ maxWidth: '40rem', mx: 'auto', my: 8, px: 2 }}>
      <Typography variant="h1" sx={{ fontSize: '2rem', mb: 2 }}>
        {title}
      </Typography>
      <Typography sx={{ mb: 2 }}>{message}</Typography>
      {import.meta.env.VITE_DEMO_MODE === 'true' ? (
        <Typography sx={{ mb: 2 }}>
          <Trans
            i18nKey="app.demoBusy"
            components={{ link: <Link href={DEMO_SOURCE_URL} target="_blank" rel="noopener noreferrer" /> }}
          />
        </Typography>
      ) : null}
      <Button variant="contained" onClick={() => window.location.reload()}>
        {t('app.reload')}
      </Button>
    </Box>
  )
}

type BoundaryProps = { children: ReactNode }
type BoundaryState = { failed: boolean }

/** Catches render errors anywhere in the app and shows ErrorPage instead of unmounting everything. */
export class AppErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (this.state.failed) {
      return <ErrorPage title={i18n.t('app.crashTitle')} message={i18n.t('app.crashBody')} />
    }
    return this.props.children
  }
}
