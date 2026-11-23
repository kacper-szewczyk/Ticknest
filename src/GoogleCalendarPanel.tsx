import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { Trans, useTranslation } from './i18n'
import { calendarErrorMessage } from './lib/calendarErrors'
import { deleteCalendarPreferences, saveCalendarPreferences } from './lib/calendarPreferences'
import { connectGoogleCalendar, disconnectGoogleCalendar, preloadGoogleCalendar } from './lib/googleCalendar'
import { FormMessage, SectionCard, SectionHeading } from './ui'
import { useCalendarPreferences } from './useCalendarConnection'

const GOOGLE_CONNECTIONS_URL = 'https://myaccount.google.com/connections'

type Outcome = 'connected' | 'disconnected' | 'disconnectedLocally' | null

/** Settings card to connect or disconnect Google Calendar suggestions for this workspace. */
export function GoogleCalendarPanel({ user, workspaceId }: { user: User; workspaceId: string }) {
  const { t } = useTranslation()
  const preferences = useCalendarPreferences(workspaceId, user.uid)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [outcome, setOutcome] = useState<Outcome>(null)
  const isConnected = preferences?.connected === true

  useEffect(() => preloadGoogleCalendar(), [])

  async function handleConnect() {
    if (!preferences) return
    setPending(true)
    setError('')
    setOutcome(null)
    try {
      await connectGoogleCalendar('consent')
      await saveCalendarPreferences(workspaceId, user.uid, { ...preferences, connected: true })
      setOutcome('connected')
    } catch (connectError) {
      setError(calendarErrorMessage(connectError))
    } finally {
      setPending(false)
    }
  }

  async function handleDisconnect() {
    if (!window.confirm(t('calendar.settings.confirmDisconnect'))) return
    setPending(true)
    setError('')
    setOutcome(null)
    try {
      const isRevoked = await disconnectGoogleCalendar()
      await deleteCalendarPreferences(workspaceId, user.uid)
      setOutcome(isRevoked ? 'disconnected' : 'disconnectedLocally')
    } catch (disconnectError) {
      console.error(
        'Could not disconnect Google Calendar.',
        disconnectError instanceof Error ? disconnectError.name : '',
      )
      setError(t('calendar.settings.disconnectFailed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <SectionCard labelledBy="google-calendar-heading">
      <SectionHeading
        id="google-calendar-heading"
        kicker={t('calendar.settings.kicker')}
        title={t('calendar.settings.title')}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2, lineHeight: 1.6 }}>
        {t('calendar.settings.intro')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, lineHeight: 1.6 }}>
        {t('calendar.settings.privacy')}
      </Typography>
      {error && <FormMessage severity="error">{error}</FormMessage>}
      {outcome === 'connected' && <FormMessage severity="success">{t('calendar.settings.connected')}</FormMessage>}
      {outcome === 'disconnected' && (
        <FormMessage severity="success">{t('calendar.settings.disconnected')}</FormMessage>
      )}
      {outcome === 'disconnectedLocally' && (
        <FormMessage severity="success">
          <Trans
            i18nKey="calendar.settings.disconnectedLocally"
            components={{
              link: <Link href={GOOGLE_CONNECTIONS_URL} target="_blank" rel="noopener noreferrer" />,
            }}
          />
        </FormMessage>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {preferences === undefined
            ? t('common.loading')
            : isConnected
              ? t('calendar.settings.statusConnected')
              : t('calendar.settings.statusDisconnected')}
        </Typography>
        {isConnected ? (
          <Button variant="outlined" color="error" onClick={() => void handleDisconnect()} disabled={pending}>
            {t('calendar.settings.disconnect')}
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={() => void handleConnect()}
            disabled={pending || preferences === undefined}
          >
            {t('calendar.settings.connect')}
          </Button>
        )}
      </Stack>
    </SectionCard>
  )
}
