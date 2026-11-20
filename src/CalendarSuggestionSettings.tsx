import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { User } from 'firebase/auth'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useTranslation } from './i18n'
import type { Catalog } from './lib/catalog'
import { calendarErrorMessage } from './lib/calendarErrors'
import {
  type CalendarPreferences,
  MAX_CALENDARS,
  MAX_KEYWORD_LENGTH,
  MAX_KEYWORD_RULES,
  normalizeKeyword,
  saveCalendarPreferences,
  withKeywordRule,
} from './lib/calendarPreferences'
import { workForSeries } from './lib/calendarSuggestions'
import {
  type CalendarListItem,
  connectGoogleCalendar,
  fetchGoogleCalendarList,
  PRIMARY_CALENDAR_ID,
} from './lib/googleCalendar'
import { buildWorkOptions, EMPTY_WORK_SELECTION, type WorkDetails, workDetails } from './lib/workOptions'
import { EmptyText, FormMessage } from './ui'
import { useCalendarToken } from './useCalendarToken'
import { WorkPicker } from './WorkPicker'

type Props = { user: User; workspaceId: string; preferences: CalendarPreferences }

function useSavePreferences({ user, workspaceId }: Pick<Props, 'user' | 'workspaceId'>) {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null)

  async function save(next: CalendarPreferences, success: string): Promise<boolean> {
    setPending(true)
    setMessage(null)
    try {
      await saveCalendarPreferences(workspaceId, user.uid, next)
      setMessage({ severity: 'success', text: success })
      return true
    } catch (saveError) {
      console.error('Could not save the calendar settings.', saveError instanceof Error ? saveError.name : '')
      setMessage({ severity: 'error', text: t('calendar.settings.saveFailed') })
      return false
    } finally {
      setPending(false)
    }
  }

  return { pending, message, save }
}

type ListState =
  | { status: 'loaded'; token: string; calendars: CalendarListItem[] }
  | { status: 'failed'; token: string; message: string }

/** Chooses which of the user's Google calendars are suggested from. Only the chosen IDs are stored. */
export function CalendarPicker({ user, workspaceId, preferences }: Props) {
  const { t } = useTranslation()
  const token = useCalendarToken()
  const [listState, setListState] = useState<ListState | null>(null)
  // Null until the user changes a box, so the stored choice shows until then.
  const [draft, setDraft] = useState<string[] | null>(null)
  const [connectError, setConnectError] = useState('')
  const { pending, message, save } = useSavePreferences({ user, workspaceId })

  useEffect(() => {
    if (!token) return
    let isCurrent = true
    fetchGoogleCalendarList().then(
      (calendars) => {
        if (isCurrent) setListState({ status: 'loaded', token, calendars })
      },
      (error: unknown) => {
        if (isCurrent) setListState({ status: 'failed', token, message: calendarErrorMessage(error) })
      },
    )
    return () => {
      isCurrent = false
    }
  }, [token])

  async function reconnect() {
    setConnectError('')
    try {
      await connectGoogleCalendar()
    } catch (error) {
      setConnectError(calendarErrorMessage(error))
    }
  }

  const current = listState?.token === token ? listState : null
  const calendars = current?.status === 'loaded' ? current.calendars : []
  const primaryId = calendars.find((calendar) => calendar.primary)?.id
  // An empty stored choice means the primary calendar.
  const stored = preferences.calendarIds
    .map((id) => (id === PRIMARY_CALENDAR_ID && primaryId ? primaryId : id))
    .filter((id) => calendars.some((calendar) => calendar.id === id))
  const storedOrPrimary = stored.length > 0 ? stored : primaryId ? [primaryId] : []
  const selected = draft ?? storedOrPrimary
  const isFull = selected.length >= MAX_CALENDARS

  function toggle(id: string, checked: boolean) {
    setDraft(checked ? [...selected, id] : selected.filter((selectedId) => selectedId !== id))
  }

  async function handleSave() {
    if (selected.length === 0) return
    // Keep the calendar list's order, so suggestions from the primary calendar win duplicates.
    const ordered = calendars.map((calendar) => calendar.id).filter((id) => selected.includes(id))
    const calendarIds = ordered.length === 1 && ordered[0] === primaryId ? [] : ordered
    if (await save({ ...preferences, calendarIds }, t('calendar.settings.calendarsSaved'))) setDraft(null)
  }

  return (
    <Box component="section" aria-labelledby="calendar-picker-heading" sx={{ mt: 3 }}>
      <Typography id="calendar-picker-heading" component="h3" variant="subtitle2" sx={{ fontWeight: 650 }}>
        {t('calendar.settings.calendarsTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1, lineHeight: 1.6 }}>
        {t('calendar.settings.calendarsIntro', { max: MAX_CALENDARS })}
      </Typography>
      {connectError && <FormMessage severity="error">{connectError}</FormMessage>}
      {message && <FormMessage severity={message.severity}>{message.text}</FormMessage>}
      {!token ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
          <Typography variant="body2" color="text.secondary">
            {t('calendar.settings.calendarsReconnect')}
          </Typography>
          <Button variant="outlined" size="small" onClick={() => void reconnect()}>
            {t('calendar.suggestions.reconnect')}
          </Button>
        </Stack>
      ) : !current ? (
        <EmptyText>{t('calendar.settings.calendarsLoading')}</EmptyText>
      ) : current.status === 'failed' ? (
        <FormMessage severity="error">{current.message}</FormMessage>
      ) : calendars.length === 0 ? (
        <EmptyText>{t('calendar.settings.calendarsEmpty')}</EmptyText>
      ) : (
        <>
          <Box role="group" aria-labelledby="calendar-picker-heading" sx={{ display: 'grid' }}>
            {calendars.map((calendar) => {
              const checked = selected.includes(calendar.id)
              return (
                <FormControlLabel
                  key={calendar.id}
                  control={
                    <Checkbox
                      size="small"
                      checked={checked}
                      disabled={pending || (!checked && isFull)}
                      onChange={(event) => toggle(calendar.id, event.target.checked)}
                    />
                  }
                  label={
                    calendar.primary ? t('calendar.settings.primaryCalendar', { name: calendar.name }) : calendar.name
                  }
                  sx={{ '& .MuiFormControlLabel-label': { overflowWrap: 'anywhere' } }}
                />
              )
            })}
          </Box>
          {selected.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t('calendar.settings.calendarsNoneChosen')}
            </Typography>
          )}
          <Button
            variant="outlined"
            size="small"
            sx={{ mt: 1 }}
            onClick={() => void handleSave()}
            disabled={pending || draft === null || selected.length === 0}
          >
            {t('calendar.settings.calendarsSave')}
          </Button>
        </>
      )}
    </Box>
  )
}

/** Keywords that pre-fill a project and task for events with no remembered recurring-event project. */
export function KeywordRulesEditor({ user, workspaceId, preferences, catalog }: Props & { catalog: Catalog }) {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const [work, setWork] = useState<WorkDetails>(() => workDetails(null))
  const [formError, setFormError] = useState('')
  const { pending, message, save } = useSavePreferences({ user, workspaceId })
  const workOptions = useMemo(() => buildWorkOptions(catalog), [catalog])
  const rules = preferences.keywordRules
  const isFull = rules.length >= MAX_KEYWORD_RULES

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    if (!normalizeKeyword(keyword)) {
      setFormError(t('calendar.settings.keywordRequired'))
      return
    }
    if (!work.projectId) {
      setFormError(t('calendar.settings.keywordProjectRequired'))
      return
    }
    const keywordRules = withKeywordRule(rules, { keyword, projectId: work.projectId, taskId: work.taskId })
    if (!keywordRules) {
      setFormError(t('calendar.settings.keywordLimit', { max: MAX_KEYWORD_RULES }))
      return
    }
    if (await save({ ...preferences, keywordRules }, t('calendar.settings.keywordSaved'))) {
      setKeyword('')
      setWork(workDetails(null))
    }
  }

  async function remove(index: number) {
    await save(
      { ...preferences, keywordRules: rules.filter((_, ruleIndex) => ruleIndex !== index) },
      t('calendar.settings.keywordRemoved'),
    )
  }

  return (
    <Box component="section" aria-labelledby="keyword-rules-heading" sx={{ mt: 3 }}>
      <Typography id="keyword-rules-heading" component="h3" variant="subtitle2" sx={{ fontWeight: 650 }}>
        {t('calendar.settings.keywordsTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1, lineHeight: 1.6 }}>
        {t('calendar.settings.keywordsIntro')}
      </Typography>
      {message && <FormMessage severity={message.severity}>{message.text}</FormMessage>}
      {rules.length === 0 ? (
        <EmptyText>{t('calendar.settings.keywordsEmpty')}</EmptyText>
      ) : (
        <Box component="ul" aria-labelledby="keyword-rules-heading" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {rules.map((rule, index) => {
            const details = workForSeries(workOptions, rule)
            const target = details?.projectName
              ? details.taskName
                ? `${details.projectName} · ${details.taskName}`
                : details.projectName
              : t('calendar.settings.keywordArchived')
            return (
              <Box
                component="li"
                key={`${rule.keyword}-${index}`}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                  py: 0.75,
                  borderTop: 1,
                  borderColor: 'app.track',
                }}
              >
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  {t('calendar.settings.keywordRule', { keyword: rule.keyword, target })}
                </Typography>
                <Button
                  size="small"
                  color="error"
                  onClick={() => void remove(index)}
                  disabled={pending}
                  aria-label={t('calendar.settings.keywordRemoveLabel', { keyword: rule.keyword })}
                >
                  {t('calendar.settings.keywordRemove')}
                </Button>
              </Box>
            )
          })}
        </Box>
      )}
      <Box
        component="form"
        onSubmit={(event) => void handleAdd(event)}
        aria-label={t('calendar.settings.keywordAddLabel')}
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1.4fr) auto' },
          gap: 1.5,
          alignItems: 'start',
          mt: 1.5,
        }}
      >
        <TextField
          size="small"
          label={t('calendar.settings.keywordLabel')}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          disabled={pending || isFull}
          slotProps={{ htmlInput: { maxLength: MAX_KEYWORD_LENGTH } }}
        />
        <WorkPicker
          catalog={catalog}
          value={work.projectId ? work : EMPTY_WORK_SELECTION}
          onChange={setWork}
          size="small"
          disabled={pending || isFull}
        />
        <Button type="submit" variant="outlined" disabled={pending || isFull} sx={{ minHeight: 40 }}>
          {t('calendar.settings.keywordAdd')}
        </Button>
      </Box>
      {formError && <FormMessage severity="error">{formError}</FormMessage>}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        {t('calendar.settings.keywordCount', { count: rules.length, max: MAX_KEYWORD_RULES })}
      </Typography>
    </Box>
  )
}
