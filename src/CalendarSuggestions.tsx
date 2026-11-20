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
import { readableError } from './lib/errors'
import { isFeatureEnabled } from './lib/featureFlags'
import { connectGoogleCalendar, fetchGoogleCalendarEvents, preloadGoogleCalendar } from './lib/googleCalendar'
import type { LeaveRequest } from './lib/leave'
import { saveManualTimeEntry, type TimeEntry } from './lib/timeEntries'
import { subscribeToLeaveRequests } from './lib/timeOff'
import { formatHoursMinutes } from './lib/timesheetSummary'
import { buildWorkOptions, type WorkDetails } from './lib/workOptions'
import { EmptyText, FormMessage } from './ui'
import { useCalendarToken } from './useCalendarToken'

type AcceptAllResult = { day: string; added: number; skipped: { title: string; reason: string }[] }

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
  const [acceptAllResult, setAcceptAllResult] = useState<AcceptAllResult | null>(null)
  const workOptions = useMemo(() => buildWorkOptions(catalog), [catalog])
  const timeOffEnabled = isFeatureEnabled('timeOff')
  const weekEnd = shiftDayString(weekStart, 6)
  const calendarIdsKey = preferences.calendarIds.join('\n')
  const fetchKey = `${weekStart}/${token ?? ''}/${reloadCount}/${calendarIdsKey}`

  useEffect(() => {
    if (!token) preloadGoogleCalendar()
  }, [token])

  useEffect(() => {
    if (!token) return
    let isCurrent = true
    const key = `${weekStart}/${token}/${reloadCount}/${calendarIdsKey}`
    const [from] = localDayBounds(weekStart)
    const [, to] = localDayBounds(shiftDayString(weekStart, 6))
    const calendarIds = calendarIdsKey ? calendarIdsKey.split('\n') : []
    fetchGoogleCalendarEvents(from, to, calendarIds).then(
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
  }, [token, weekStart, reloadCount, calendarIdsKey])

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
          keywordRules: preferences.keywordRules,
          now: new Date(now),
        })
      : []
  const withWork = suggestions.map((suggestion) => ({ suggestion, work: workForSeries(workOptions, suggestion.work) }))
  const days = [...new Set(suggestions.map((suggestion) => suggestion.day))]
  const time = (date: Date) => date.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })
  const dayLabel = (day: string) =>
    dayDate(day).toLocaleDateString(language, { weekday: 'long', day: 'numeric', month: 'long' })

  /**
   * Creates an entry for each of the day's suggestions that already has a project, one at a time so two overlapping
   * meetings cannot both be saved. Any that fail are skipped and listed afterwards.
   */
  async function acceptAll(day: string) {
    const ready = withWork.filter(
      (item): item is { suggestion: CalendarSuggestion; work: WorkDetails } =>
        item.suggestion.day === day && Boolean(item.work?.projectId),
    )
    if (ready.length === 0) return
    const totalSeconds = ready.reduce((sum, item) => sum + item.suggestion.durationSeconds, 0)
    const confirmed = window.confirm(
      t('calendar.suggestions.acceptAllConfirm', {
        count: ready.length,
        duration: formatHoursMinutes(totalSeconds),
        day: dayLabel(day),
      }),
    )
    if (!confirmed) return
    setPending(true)
    setError('')
    setAcceptAllResult(null)
    const result: AcceptAllResult = { day, added: 0, skipped: [] }
    for (const { suggestion, work } of ready) {
      try {
        await saveManualTimeEntry(workspaceId, {
          description: suggestion.title,
          clientId: work.clientId,
          projectId: work.projectId,
          taskId: work.taskId,
          billable: work.billable,
          startAt: suggestion.start,
          endAt: suggestion.end,
        })
        result.added += 1
      } catch (saveError) {
        result.skipped.push({
          title: suggestion.title || t('calendar.suggestions.untitled'),
          reason: readableError(saveError),
        })
      }
    }
    setAcceptAllResult(result)
    setPending(false)
  }

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
      {acceptAllResult && (
        <Box role="status" sx={{ mt: 1 }}>
          {acceptAllResult.added > 0 && (
            <FormMessage severity="success">
              {t('calendar.suggestions.acceptAllAdded', {
                count: acceptAllResult.added,
                day: dayLabel(acceptAllResult.day),
              })}
            </FormMessage>
          )}
          {acceptAllResult.skipped.length > 0 && (
            <FormMessage severity="error">
              {t('calendar.suggestions.acceptAllSkipped', { count: acceptAllResult.skipped.length })}
              <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                {acceptAllResult.skipped.map((item, index) => (
                  <li key={index}>{t('calendar.suggestions.skippedItem', item)}</li>
                ))}
              </Box>
            </FormMessage>
          )}
        </Box>
      )}
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
          {days.map((day) => {
            const readyCount = withWork.filter((item) => item.suggestion.day === day && item.work?.projectId).length
            return (
              <Box key={day} component="section" aria-label={dayLabel(day)} sx={{ mt: 1.25 }}>
                <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="caption" color="text.secondary" component="h3" sx={{ fontWeight: 650 }}>
                    {dayLabel(day)}
                  </Typography>
                  {readyCount > 0 && (
                    <Button
                      size="small"
                      onClick={() => void acceptAll(day)}
                      disabled={pending}
                      aria-label={t('calendar.suggestions.acceptAllLabel', { count: readyCount, day: dayLabel(day) })}
                    >
                      {t('calendar.suggestions.acceptAll', { count: readyCount })}
                    </Button>
                  )}
                </Stack>
                {withWork
                  .filter(({ suggestion }) => suggestion.day === day)
                  .map(({ suggestion, work }) => {
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
            )
          })}
        </Box>
      )}
    </Paper>
  )
}
