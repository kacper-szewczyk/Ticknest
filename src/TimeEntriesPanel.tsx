import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import SpeedDial from '@mui/material/SpeedDial'
import SpeedDialAction from '@mui/material/SpeedDialAction'
import SpeedDialIcon from '@mui/material/SpeedDialIcon'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import type { User } from 'firebase/auth'
import { type ReactNode, useEffect, useState } from 'react'
import type { Catalog } from './lib/catalog'
import { NavIcon } from './AppShell'
import { EntryEditor } from './EntryEditor'
import { useAppLanguage, useTranslation } from './i18n'
import { dayDate, formatElapsed, formatWeekLabel, localDayString, shiftDayString, startOfWeekString } from './lib/dates'
import { readableError } from './lib/errors'
import { type TimeEntry, continueTimer, deleteTimeEntry, subscribeToEntriesForRange } from './lib/timeEntries'
import {
  entrySeconds,
  formatHoursMinutes,
  isDayOverLimit,
  isWeekOverLimit,
  overlappingEntryIds,
  summarizeDay,
  type DaySummary,
} from './lib/timesheetSummary'
import { AutoStoppedChip, BillableChip, EmptyText, FormMessage, LiveStatus, SectionCard, SectionHeading } from './ui'

export function TimeEntriesPanel({
  user,
  workspaceId,
  isOwner,
  weekStartsOn,
  catalog,
}: {
  user: User
  workspaceId: string
  isOwner: boolean
  weekStartsOn: number
  catalog: Catalog
}) {
  const { t } = useTranslation()
  const language = useAppLanguage()
  const [today] = useState(() => localDayString(new Date()))
  const [weekStart, setWeekStart] = useState(() => startOfWeekString(today, weekStartsOn))
  const [entryState, setEntryState] = useState<{ workspaceId: string; weekStart: string; entries: TimeEntry[] }>({
    workspaceId: '',
    weekStart: '',
    entries: [],
  })
  const isLoaded = entryState.workspaceId === workspaceId && entryState.weekStart === weekStart
  const entries = isLoaded ? entryState.entries : []
  const [editor, setEditor] = useState<{ entry?: TimeEntry; day: string } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [now, setNow] = useState(() => Date.now())
  // Days start collapsed, and changeWeek collapses them all again.
  const [expandedDays, setExpandedDays] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    return subscribeToEntriesForRange(
      workspaceId,
      user.uid,
      isOwner,
      weekStart,
      7,
      (nextEntries) => setEntryState({ workspaceId, weekStart, entries: nextEntries }),
      (loadError) => setError(readableError(loadError)),
    )
  }, [workspaceId, user.uid, isOwner, weekStart])
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  function openEditor(day: string, entry?: TimeEntry) {
    setEditor({ entry, day })
    setError('')
    setNotice('')
  }

  async function handleDelete(entry: TimeEntry) {
    if (!window.confirm(t('entries.confirmDelete', { description: entry.description || t('common.untitledEntry') })))
      return
    setPending(true)
    setError('')
    setNotice('')
    try {
      await deleteTimeEntry(workspaceId, entry)
      setNotice(t('entries.deleted'))
    } catch (requestError) {
      setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  async function handleContinue(entry: TimeEntry) {
    setPending(true)
    setError('')
    setNotice('')
    try {
      await continueTimer(user, workspaceId, entry)
    } catch (requestError) {
      setError(readableError(requestError))
    } finally {
      setPending(false)
    }
  }

  function changeWeek(value: string) {
    if (!value) return
    const nextWeekStart = startOfWeekString(value, weekStartsOn)
    setWeekStart(nextWeekStart)
    setExpandedDays(new Set())
    setError('')
    setNotice('')
  }

  function setDayExpanded(day: string, isExpanded: boolean) {
    const next = new Set(expandedDays)
    if (isExpanded) next.add(day)
    else next.delete(day)
    setExpandedDays(next)
  }

  const weekDays = Array.from({ length: 7 }, (_, index) => shiftDayString(weekStart, index))
  const secondsFor = (entry: TimeEntry) => entrySeconds(entry, now)
  const weekTotal = entries.reduce((total, entry) => total + secondsFor(entry), 0)
  const isWeekOver = isWeekOverLimit(entries, weekStart, weekDays.length, now)
  const entriesByDay = new Map(
    weekDays.map((weekDay) => [
      weekDay,
      entries
        .filter((entry) => localDayString(entry.startAt.toDate()) === weekDay)
        .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis()),
    ]),
  )
  const daysWithEntries = weekDays.filter((weekDay) => (entriesByDay.get(weekDay) ?? []).length > 0)
  const isAllExpanded = daysWithEntries.length > 0 && daysWithEntries.every((weekDay) => expandedDays.has(weekDay))

  return (
    <SectionCard labelledBy="entries-heading" sx={{ mb: { xs: 10, sm: 12 } }}>
      <SectionHeading
        id="entries-heading"
        kicker={t('entries.kicker')}
        title={t('entries.title')}
        action={
          <Stack
            direction="row"
            aria-label={t('entries.weekNavigation')}
            spacing={1}
            sx={{ alignItems: 'center', width: { xs: '100%', sm: 'auto' }, justifyContent: 'space-between' }}
          >
            <Button
              variant="outlined"
              aria-label={t('entries.previousWeek')}
              onClick={() => changeWeek(shiftDayString(weekStart, -7))}
              sx={{ minWidth: 44, px: 1 }}
            >
              ←
            </Button>
            <Stack sx={{ alignItems: 'center', flex: { xs: 1, sm: 'none' } }}>
              <Typography variant="body2" sx={{ fontWeight: 650 }}>
                {formatWeekLabel(weekStart, language)}
              </Typography>
              <TextField
                variant="standard"
                type="date"
                value={weekStart}
                onChange={(event) => changeWeek(event.target.value)}
                fullWidth={false}
                slotProps={{
                  htmlInput: { 'aria-label': t('entries.chooseWeek'), style: { fontSize: 12, padding: 0 } },
                  input: { disableUnderline: true },
                }}
                sx={{ width: 130 }}
              />
            </Stack>
            <Button
              variant="outlined"
              aria-label={t('entries.nextWeek')}
              onClick={() => changeWeek(shiftDayString(weekStart, 7))}
              sx={{ minWidth: 44, px: 1 }}
            >
              →
            </Button>
            <Button size="small" onClick={() => changeWeek(today)}>
              {t('entries.today')}
            </Button>
          </Stack>
        }
      />
      {error && <FormMessage severity="error">{error}</FormMessage>}
      {notice && <FormMessage severity="success">{notice}</FormMessage>}
      {/* The week total and day list tick every second while a timer runs, so they are not live regions; this short
          message changes only when the week or its number of entries does. */}
      <LiveStatus>
        {isLoaded &&
          t('entries.weekStatus', {
            week: formatWeekLabel(weekStart, language),
            entries: t('entries.entryCount', { count: entries.length }),
          })}
      </LiveStatus>
      <Paper
        variant="outlined"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          mt: 3,
          px: 2,
          py: 1.75,
          borderRadius: '11px',
          borderColor: 'app.tintBorder',
          bgcolor: 'app.tint',
        }}
      >
        <Box sx={{ display: 'grid', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {t('entries.weekTotal')}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography
              sx={{
                color: isWeekOver ? 'warning.main' : 'primary.main',
                fontVariantNumeric: 'tabular-nums',
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              {formatElapsed(weekTotal)}
            </Typography>
            {isWeekOver && <OverLimitChip label={t('entries.overWeek')} message={t('entries.overWeekMessage')} />}
          </Stack>
        </Box>
        <Stack spacing={0.5} sx={{ alignItems: 'flex-end' }}>
          <Typography variant="caption" color="text.secondary">
            {t('entries.entriesThisWeek', { count: entries.length })}
          </Typography>
          {daysWithEntries.length > 0 && (
            <Button size="small" onClick={() => setExpandedDays(new Set(isAllExpanded ? [] : daysWithEntries))}>
              {isAllExpanded ? t('entries.collapseAll') : t('entries.expandAll')}
            </Button>
          )}
        </Stack>
      </Paper>
      <Box sx={{ mt: 2.25 }}>
        {weekDays.map((weekDay) => {
          const dayEntries = entriesByDay.get(weekDay) ?? []
          const isExpanded = expandedDays.has(weekDay)
          const overlapping = isExpanded ? overlappingEntryIds(dayEntries, now) : null
          return (
            <DaySection
              key={weekDay}
              day={weekDay}
              summary={summarizeDay(dayEntries, now)}
              // Every week entry, so time spilling over midnight from the day before counts too.
              isOverLimit={isDayOverLimit(entries, weekDay, now)}
              isExpanded={isExpanded}
              onToggle={() => setDayExpanded(weekDay, !isExpanded)}
              onAdd={() => openEditor(weekDay)}
            >
              {overlapping &&
                dayEntries.map((entry) => (
                  <Box
                    component="article"
                    key={entry.id}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '54px minmax(0, 1fr) auto', sm: '78px minmax(0, 1fr) auto auto' },
                      alignItems: 'center',
                      gap: { xs: 1, sm: 1.75 },
                      py: 1.5,
                      borderTop: 1,
                      borderColor: 'app.track',
                      minWidth: 0,
                      // The warning bar sits in the gutter so overlapping rows stay aligned with the rest.
                      ...(overlapping.has(entry.id) && {
                        boxShadow: (theme) => `inset 3px 0 0 ${theme.palette.warning.main}`,
                        ml: -1.25,
                        pl: 1.25,
                      }),
                    }}
                  >
                    <Box sx={{ display: 'grid', gap: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {entry.startAt.toDate().toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {entry.endAt
                          ? entry.endAt.toDate().toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })
                          : t('common.running')}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                        {entry.description || t('common.untitledEntry')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {[entry.clientName, entry.projectName, entry.taskName].filter(Boolean).join(' · ') ||
                          t('entries.noWork')}
                        {entry.userId !== user.uid && ` · ${t('entries.workspaceMember')}`}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>
                      {formatElapsed(secondsFor(entry))}
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        justifyContent: 'flex-end',
                        gridColumn: { xs: '1 / -1', sm: 'auto' },
                      }}
                    >
                      {entry.endAt === null && <Chip label={t('common.running')} color="warning" variant="outlined" />}
                      {entry.autoStopped === true && <AutoStoppedChip />}
                      {overlapping.has(entry.id) && (
                        <Chip label={t('entries.overlaps')} color="warning" title={t('entries.overlapsTitle')} />
                      )}
                      {entry.billable && <BillableChip />}
                      {entry.endAt !== null && entry.userId === user.uid && (
                        <Button size="small" onClick={() => void handleContinue(entry)} disabled={pending}>
                          {t('entries.continue')}
                        </Button>
                      )}
                      <Button
                        size="small"
                        onClick={() => openEditor(weekDay, entry)}
                        disabled={pending || entry.endAt === null}
                      >
                        {t('entries.edit')}
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => void handleDelete(entry)}
                        disabled={pending || entry.endAt === null}
                      >
                        {t('entries.delete')}
                      </Button>
                    </Stack>
                  </Box>
                ))}
            </DaySection>
          )
        })}
      </Box>
      <SpeedDial
        ariaLabel={t('entries.addTime')}
        icon={<SpeedDialIcon />}
        sx={{ position: 'fixed', right: { xs: 16, sm: 32 }, bottom: { xs: 16, sm: 32 } }}
      >
        <SpeedDialAction
          icon={
            <NavIcon>
              <path d="M4 7h16M4 12h10M4 17h7M17 14v6M14 17h6" />
            </NavIcon>
          }
          slotProps={{ tooltip: { title: t('entries.addManualEntry'), open: true } }}
          onClick={() => openEditor(weekDays.includes(today) ? today : weekStart)}
        />
      </SpeedDial>
      {editor && (
        <EntryEditor
          workspaceId={workspaceId}
          catalog={catalog}
          entry={editor.entry}
          day={editor.day}
          onClose={() => setEditor(null)}
          onSaved={(message, day) => {
            setEditor(null)
            setNotice(message)
            // Show the saved entry: open its day if it falls in the week on screen.
            if (weekDays.includes(day)) setDayExpanded(day, true)
          }}
        />
      )}
    </SectionCard>
  )
}

// Spanish and Polish write weekday names in lower case; they start the day heading here.
function capitalize(text: string, language: string): string {
  return text.charAt(0).toLocaleUpperCase(language) + text.slice(1)
}

function WarningIcon() {
  return (
    <NavIcon>
      <path d="M12 4 3 20h18L12 4zM12 10v4.5M12 17.5h.01" />
    </NavIcon>
  )
}

function OverLimitChip({ label, message }: { label: string; message: string }) {
  return (
    <Tooltip title={message}>
      <Chip
        size="small"
        color="warning"
        variant="outlined"
        icon={<WarningIcon />}
        label={label}
        tabIndex={0}
        aria-label={`${label}. ${message}`}
        // Phones show only the icon; the tooltip and accessible name still carry the full text.
        sx={{
          '& .MuiChip-icon': { width: 16, height: 16, mr: { xs: -0.75, sm: 0 } },
          '& .MuiChip-label': { display: { xs: 'none', sm: 'block' } },
        }}
      />
    </Tooltip>
  )
}

function DaySummaryLine({ summary }: { summary: DaySummary }) {
  const { t } = useTranslation()
  const parts = [
    t('entries.entryCount', { count: summary.count }),
    summary.billableSeconds > 0 && t('entries.billableTime', { time: formatHoursMinutes(summary.billableSeconds) }),
    ...summary.topGroups.map(
      (group) => `${group.label || t('entries.noClientOrProject')} ${formatHoursMinutes(group.seconds)}`,
    ),
    summary.moreGroups > 0 && t('entries.moreGroups', { count: summary.moreGroups }),
  ].filter(Boolean)
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0, pb: 1.25, pl: 3.5 }}>
      {summary.isRunning && <Chip size="small" label={t('common.running')} color="warning" variant="outlined" />}
      <Typography variant="caption" color="text.secondary" noWrap>
        {parts.join(' · ')}
      </Typography>
    </Stack>
  )
}

function DaySection({
  day,
  summary,
  isOverLimit,
  isExpanded,
  onToggle,
  onAdd,
  children,
}: {
  day: string
  summary: DaySummary
  isOverLimit: boolean
  isExpanded: boolean
  onToggle: () => void
  onAdd: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  const language = useAppLanguage()
  const date = dayDate(day)
  const headingId = `timesheet-${day}`
  const panelId = `timesheet-${day}-entries`
  const hasEntries = summary.count > 0
  const label = (
    <>
      <span>{capitalize(date.toLocaleDateString(language, { weekday: 'long' }), language)}</span>
      <Typography component="time" variant="caption" color="text.secondary" dateTime={day}>
        {date.toLocaleDateString(language, { month: 'short', day: 'numeric' })}
      </Typography>
    </>
  )
  return (
    <Box
      component="section"
      aria-labelledby={headingId}
      sx={{ pt: 2, pb: 0.75, borderBottom: 1, borderColor: 'divider' }}
    >
      <Stack
        direction="row"
        // A mouse click anywhere on the header toggles; the heading button is the keyboard control.
        onClick={hasEntries ? onToggle : undefined}
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          columnGap: 1.75,
          rowGap: 0.5,
          cursor: hasEntries ? 'pointer' : 'auto',
        }}
      >
        <Typography variant="h3" sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
          {hasEntries ? (
            <Box
              component="button"
              type="button"
              id={headingId}
              aria-expanded={isExpanded}
              aria-controls={panelId}
              onClick={(event) => {
                event.stopPropagation()
                onToggle()
              }}
              sx={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 1,
                p: 0,
                border: 0,
                bgcolor: 'transparent',
                color: 'inherit',
                font: 'inherit',
                cursor: 'pointer',
                borderRadius: '6px',
                '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineOffset: 3 },
              }}
            >
              <Box
                component="span"
                aria-hidden="true"
                sx={{
                  display: 'inline-flex',
                  alignSelf: 'center',
                  flexShrink: 0,
                  color: 'text.secondary',
                  transform: isExpanded ? 'rotate(90deg)' : 'none',
                  transition: 'transform 150ms',
                }}
              >
                <NavIcon>
                  <path d="m9 6 6 6-6 6" />
                </NavIcon>
              </Box>
              {label}
            </Box>
          ) : (
            <Box component="span" id={headingId} sx={{ display: 'flex', alignItems: 'baseline', gap: 1, pl: 3.5 }}>
              {label}
            </Box>
          )}
        </Typography>
        <Stack direction="row" spacing={{ xs: 0.5, sm: 1.75 }} sx={{ alignItems: 'center' }}>
          {isOverLimit && <OverLimitChip label={t('entries.overDay')} message={t('entries.overDayMessage')} />}
          <Typography
            variant="body2"
            sx={{
              color: isOverLimit ? 'warning.main' : undefined,
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 600,
            }}
          >
            {formatElapsed(summary.totalSeconds)}
          </Typography>
          <Button
            size="small"
            onClick={(event) => {
              event.stopPropagation()
              onAdd()
            }}
          >
            {t('entries.addEntry')}
          </Button>
        </Stack>
      </Stack>
      {hasEntries ? (
        <>
          {!isExpanded && <DaySummaryLine summary={summary} />}
          <Box id={panelId} role="region" aria-labelledby={headingId} hidden={!isExpanded}>
            {isExpanded && children}
          </Box>
        </>
      ) : (
        <Box sx={{ pl: 3.5 }}>
          <EmptyText>{t('entries.noEntries')}</EmptyText>
        </Box>
      )}
    </Box>
  )
}
