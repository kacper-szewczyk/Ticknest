import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { User } from 'firebase/auth'
import { useEffect, useMemo, useState } from 'react'
import { useAppLanguage, useTranslation } from './i18n'
import type { Catalog } from './lib/catalog'
import { saveCalendarPreferences, withDismissed, type CalendarPreferences } from './lib/calendarPreferences'
import {
  calendarSuggestions,
  fullLeaveDays,
  type CalendarEvent,
  type CalendarSuggestion,
  workForSeries,
} from './lib/calendarSuggestions'
import { dayDate, localDayBounds, shiftDayString } from './lib/dates'
import { calendarErrorMessage } from './lib/calendarErrors'
import { isFeatureEnabled } from './lib/featureFlags'
import { connectGoogleCalendar, fetchGoogleCalendarEvents, preloadGoogleCalendar } from './lib/googleCalendar'
import type { LeaveRequest } from './lib/leave'
import type { TimeEntry } from './lib/timeEntries'
import { subscribeToLeaveRequests } from './lib/timeOff'
import { formatHoursMinutes } from './lib/timesheetSummary'
import { buildWorkOptions, type WorkDetails } from './lib/workOptions'
import { EmptyText, FormMessage } from './ui'
import { useCalendarToken } from './useCalendarConnection'

// Tagged with the week, token and refresh it was fetched for; any other tag means the fetch is still running.
type EventState =
  { status: 'loaded'; key: string; events: CalendarEvent[] } | { status: 'failed'; key: string; message: string }

/**
 * Suggests the week's calendar events that have no time entry yet. Accept opens the entry dialog filled in from the
 * event; Dismiss hides the event for good. Shown only after the member connected a calendar in Settings.
 */
export function CalendarSuggestions({
  user,
  workspaceId,
  weekStart,
  entries,
  catalog,
  preferences,
  now,
  onAccept,
}: {
  user: User
  workspaceId: string
  weekStart: string
  /** The week's entries on screen; only the user's own are matched against events. */
  entries: readonly TimeEntry[]
  catalog: Catalog
  preferences: CalendarPreferences
  /** Only events that have ended are suggested; the panel's ticking clock keeps this current. */
  now: number
  onAccept: (suggestion: CalendarSuggestion, work: WorkDetails | undefined) => void
}) {
  const { t } = useTranslation()
  const language = useAppLanguage()
  const token = useCalendarToken()
  const [eventState, setEventState] = useState<EventState | null>(null)
  const [reloadCount, setReloadCount] = useState(0)
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const workOptions = useMemo(() => buildWorkOptions(catalog), [catalog])
  const timeOffEnabled = isFeatureEnabled('timeOff')
  const weekEnd = shiftDayString(weekStart, 6)
  const fetchKey = `${weekStart}/${token ?? ''}/${reloadCount}`

  useEffect(() => {
    if (!token) preloadGoogleCalendar()
  }, [token])

  useEffect(() => {
    if (!token) return
    let isCurrent = true
    const key = `${weekStart}/${token}/${reloadCount}`
    const [from] = localDayBounds(weekStart)
    const [, to] = localDayBounds(shiftDayString(weekStart, 6))
    fetchGoogleCalendarEvents(from, to).then(
      (events) => {
        if (isCurrent) setEventState({ status: 'loaded', key, events })
      },
      (fetchError: unknown) => {
        if (isCurrent) setEventState({ status: 'failed', key, message: calendarErrorMessage(fetchError) })
      },
    )
    return () => {
      isCurrent = false
    }
  }, [token, weekStart, reloadCount])

  useEffect(() => {
    if (!timeOffEnabled) return
    const years = [...new Set([Number(weekStart.slice(0, 4)), Number(weekEnd.slice(0, 4))])]
    return subscribeToLeaveRequests(
      workspaceId,
      { uid: user.uid, years, status: 'approved' },
      setLeaveRequests,
      // Without leave data the suggestions still work; they just may include days off.
      () => setLeaveRequests([]),
    )
  }, [timeOffEnabled, workspaceId, user.uid, weekStart, weekEnd])

  async function reconnect() {
    setError('')
    try {
      await connectGoogleCalendar()
    } catch (connectError) {
      setError(calendarErrorMessage(connectError))
    }
  }

  async function dismiss(eventIds: string[]) {
    setPending(true)
    setError('')
    try {
      await saveCalendarPreferences(workspaceId, user.uid, {
        ...preferences,
        dismissedEventIds: withDismissed(preferences.dismissedEventIds, eventIds),
      })
    } catch (saveError) {
      console.error('Could not save the dismissed event.', saveError instanceof Error ? saveError.name : '')
      setError(t('calendar.dismissFailed'))
    } finally {
      setPending(false)
    }
  }

  const current = eventState?.key === fetchKey ? eventState : null
  const suggestions =
    current?.status === 'loaded'
      ? calendarSuggestions(current.events, {
          entries: entries
            .filter((entry) => entry.userId === user.uid)
            .map((entry) => ({ startAt: entry.startAt.toDate(), endAt: entry.endAt?.toDate() ?? null })),
          dismissedEventIds: new Set(preferences.dismissedEventIds),
          timeOffDays: timeOffEnabled ? fullLeaveDays(leaveRequests) : new Set(),
          seriesWork: preferences.seriesWork,
          now: new Date(now),
        })
      : []
  const days = [...new Set(suggestions.map((suggestion) => suggestion.day))]
  const time = (date: Date) => date.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })
  const dayLabel = (day: string) =>
    dayDate(day).toLocaleDateString(language, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <Paper
      component="section"
      variant="outlined"
      aria-labelledby="calendar-suggestions-heading"
      sx={{ mt: 2.25, px: 2, py: 1.75, borderRadius: '11px' }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Typography id="calendar-suggestions-heading" component="h2" variant="subtitle2" sx={{ fontWeight: 650 }}>
          {t('calendar.suggestions.title')}
        </Typography>
        {token && (
          <Button size="small" onClick={() => setReloadCount((count) => count + 1)} disabled={!current}>
            {t('calendar.suggestions.refresh')}
          </Button>
        )}
      </Stack>
      {error && <FormMessage severity="error">{error}</FormMessage>}
      {!token ? (
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 1, mt: 1 }}
        >
          <Typography variant="body2" color="text.secondary">
            {t('calendar.suggestions.reconnectPrompt')}
          </Typography>
          <Button variant="outlined" size="small" onClick={() => void reconnect()}>
            {t('calendar.suggestions.reconnect')}
          </Button>
        </Stack>
      ) : !current ? (
        <EmptyText>{t('calendar.suggestions.loading')}</EmptyText>
      ) : current.status === 'failed' ? (
        <FormMessage severity="error">{current.message}</FormMessage>
      ) : suggestions.length === 0 ? (
        <EmptyText>{t('calendar.suggestions.empty')}</EmptyText>
      ) : (
        <Box sx={{ mt: 1 }}>
          {days.map((day) => (
            <Box key={day} component="section" aria-label={dayLabel(day)} sx={{ mt: 1.25 }}>
              <Typography variant="caption" color="text.secondary" component="h3" sx={{ fontWeight: 650 }}>
                {dayLabel(day)}
              </Typography>
              {suggestions
                .filter((suggestion) => suggestion.day === day)
                .map((suggestion) => {
                  const work = workForSeries(workOptions, suggestion.work)
                  const title = suggestion.title || t('calendar.suggestions.untitled')
                  return (
                    <Box
                      component="article"
                      key={suggestion.id}
                      aria-label={title}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) auto' },
                        alignItems: 'center',
                        gap: 1,
                        py: 1,
                        borderTop: 1,
                        borderColor: 'app.track',
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                          {title}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {t('calendar.suggestions.timeRange', {
                            start: time(suggestion.start),
                            end: time(suggestion.end),
                            duration: formatHoursMinutes(suggestion.durationSeconds),
                          })}
                        </Typography>
                        {work?.projectName && (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={work.taskName ? `${work.projectName} · ${work.taskName}` : work.projectName}
                            sx={{ ml: 1, maxWidth: '100%' }}
                          />
                        )}
                      </Box>
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => onAccept(suggestion, work)}
                          disabled={pending}
                          aria-label={t('calendar.suggestions.acceptLabel', { title })}
                        >
                          {t('calendar.suggestions.accept')}
                        </Button>
                        <Button
                          size="small"
                          onClick={() => void dismiss([suggestion.id])}
                          disabled={pending}
                          aria-label={t('calendar.suggestions.dismissLabel', { title })}
                        >
                          {t('calendar.suggestions.dismiss')}
                        </Button>
                      </Stack>
                    </Box>
                  )
                })}
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  )
}
