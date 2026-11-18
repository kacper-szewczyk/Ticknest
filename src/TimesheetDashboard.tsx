import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { alpha, useTheme, type Theme } from '@mui/material/styles'
import type { User } from 'firebase/auth'
import { useAppLanguage, useTranslation } from './i18n'
import type { Catalog } from './lib/catalog'
import { dayDate, formatWeekLabel, localDayString, shiftDayString, startOfWeekString } from './lib/dates'
import { readableError } from './lib/errors'
import { deleteTimeEntry, subscribeToEntriesForRange, type TimeEntry } from './lib/timeEntries'
import { subscribeToWorkspaceMembers, type WorkspaceMember } from './lib/workspaces'
import { EntryEditor } from './EntryEditor'
import { AutoStoppedChip, BillableChip, EmptyText, FormMessage, SelectField } from './ui'

type Props = {
  user: User
  workspaceId: string
  canSeeAllEntries: boolean
  isOwner: boolean
  weekStartsOn: number
  catalog: Catalog
}
type Person = { uid: string; name: string; email: string }
type Status = 'running' | 'long-day' | 'overtime' | 'no-time' | 'on-track'
type PersonStats = {
  person: Person
  entries: TimeEntry[]
  byDay: number[]
  total: number
  billable: number
  previousTotal: number
  longestDay: number
  isRunning: boolean
  status: Status
}

const WEEKLY_TARGET_SECONDS = 40 * 3600
const LONG_DAY_SECONDS = 10 * 3600
// Timelines draw segments at least this wide and tall before they become buttons (WCAG 2.5.8 Target Size).
const MIN_TARGET_PX = 24

type SegmentKind = 'billable' | 'nonBillable' | 'running' | 'gap'

/**
 * Fill, outline and pattern for a timeline segment or its legend swatch. Non-billable time is hatched so it can be
 * told apart from billable without colour, and light fills get an outline that reaches 3:1 against `app.track`.
 */
function segmentSx(kind: SegmentKind, nonBillable = kind === 'nonBillable') {
  return (theme: Theme) => {
    const { segment } = theme.palette.app
    const edge = kind === 'running' ? segment.runningEdge : kind === 'nonBillable' ? segment.billable : undefined
    return {
      boxSizing: 'border-box' as const,
      bgcolor: segment[kind],
      border: edge ? `1px solid ${edge}` : 0,
      backgroundImage: nonBillable
        ? `repeating-linear-gradient(135deg, ${alpha(edge ?? segment.billable, 0.55)} 0 2px, transparent 2px 6px)`
        : 'none',
    }
  }
}
const STATUSES = {
  running: { key: 'dashboard.status.running', color: 'warning' },
  'long-day': { key: 'dashboard.status.longDay', color: 'error' },
  overtime: { key: 'dashboard.status.overtime', color: 'warning' },
  'no-time': { key: 'dashboard.status.noTime', color: 'default' },
  'on-track': { key: 'dashboard.status.onTrack', color: 'success' },
} as const satisfies Record<Status, { key: string; color: 'default' | 'success' | 'warning' | 'error' }>

function entrySeconds(entry: TimeEntry, now: number): number {
  const end = entry.endAt ? entry.endAt.toMillis() : now
  return Math.max(0, Math.floor((end - entry.startAt.toMillis()) / 1000))
}

/** Duration, clock and day formatting in the active language, shared by the dashboard's components. */
function useDashboardFormat() {
  const { t } = useTranslation()
  const language = useAppLanguage()
  return useMemo(() => {
    const hours = (seconds: number): string => {
      const wholeHours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      if (wholeHours === 0) return t('dashboard.durationMinutes', { minutes })
      return minutes === 0
        ? t('dashboard.durationHours', { hours: wholeHours })
        : t('dashboard.durationHoursMinutes', { hours: wholeHours, minutes })
    }
    const clock = (date: Date) => date.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })
    const dayLabel = (day: string, today: string) => {
      if (day === today) return t('entries.today')
      if (day === shiftDayString(today, -1)) return t('dashboard.yesterday')
      return dayDate(day).toLocaleDateString(language, { weekday: 'long', month: 'short', day: 'numeric' })
    }
    return { t, language, hours, clock, dayLabel }
  }, [t, language])
}

function initials(name: string): string {
  return (
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  )
}

function avatarColor(uid: string): (theme: Theme) => string {
  const hash = [...uid].reduce((total, char) => total + char.charCodeAt(0), 0)
  return (theme: Theme) => theme.palette.app.avatars[hash % theme.palette.app.avatars.length]
}

// Returns a signed percentage change, or null when there is no baseline to compare against.
function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

function breakSeconds(dayEntries: TimeEntry[]): number {
  const sorted = [...dayEntries].sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())
  let total = 0
  for (let index = 1; index < sorted.length; index += 1) {
    const previousEnd = sorted[index - 1].endAt?.toMillis()
    if (previousEnd !== undefined) total += Math.max(0, sorted[index].startAt.toMillis() - previousEnd) / 1000
  }
  return Math.floor(total)
}

function buildStats(person: Person, entries: TimeEntry[], weekStart: string, now: number): PersonStats {
  const weekDays = Array.from({ length: 7 }, (_, index) => shiftDayString(weekStart, index))
  const current = entries.filter((entry) => localDayString(entry.startAt.toDate()) >= weekStart)
  const previous = entries.filter((entry) => localDayString(entry.startAt.toDate()) < weekStart)
  const byDay = weekDays.map((day) =>
    current
      .filter((entry) => localDayString(entry.startAt.toDate()) === day)
      .reduce((total, entry) => total + entrySeconds(entry, now), 0),
  )
  const total = byDay.reduce((sum, value) => sum + value, 0)
  const longestDay = Math.max(0, ...byDay)
  const isRunning = current.some((entry) => entry.endAt === null)
  const status: Status = isRunning
    ? 'running'
    : total === 0
      ? 'no-time'
      : longestDay > LONG_DAY_SECONDS
        ? 'long-day'
        : total > WEEKLY_TARGET_SECONDS
          ? 'overtime'
          : 'on-track'
  return {
    person,
    entries: current,
    byDay,
    total,
    billable: current.filter((entry) => entry.billable).reduce((sum, entry) => sum + entrySeconds(entry, now), 0),
    previousTotal: previous.reduce((sum, entry) => sum + entrySeconds(entry, now), 0),
    longestDay,
    isRunning,
    status,
  }
}

export function TimesheetDashboard({ user, workspaceId, canSeeAllEntries, isOwner, weekStartsOn, catalog }: Props) {
  const { t, language, hours: formatHours } = useDashboardFormat()
  const [today] = useState(() => localDayString(new Date()))
  const [weekStart, setWeekStart] = useState(() => startOfWeekString(today, weekStartsOn))
  const previousWeekStart = shiftDayString(weekStart, -7)
  const [entryState, setEntryState] = useState<{ key: string; entries: TimeEntry[] }>({ key: '', entries: [] })
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<Status | ''>('')
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const rangeKey = `${workspaceId}|${previousWeekStart}`
  const allEntries = useMemo(() => (entryState.key === rangeKey ? entryState.entries : []), [entryState, rangeKey])
  const isLoading = entryState.key !== rangeKey

  useEffect(
    () =>
      subscribeToEntriesForRange(
        workspaceId,
        user.uid,
        canSeeAllEntries,
        previousWeekStart,
        14,
        (entries) => setEntryState({ key: rangeKey, entries }),
        (loadError) => setError(readableError(loadError)),
      ),
    [workspaceId, user.uid, canSeeAllEntries, previousWeekStart, rangeKey],
  )
  useEffect(() => {
    if (!canSeeAllEntries) return
    return subscribeToWorkspaceMembers(workspaceId, setMembers, (loadError) => setError(readableError(loadError)))
  }, [workspaceId, canSeeAllEntries])
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  const people = useMemo<Person[]>(() => {
    const self: Person = {
      uid: user.uid,
      name: user.displayName?.trim() || user.email || t('dashboard.you'),
      email: user.email ?? '',
    }
    if (!canSeeAllEntries) return [self]
    const found = new Map<string, Person>()
    for (const member of members) {
      if (member.status === 'removed') continue
      found.set(member.uid, {
        uid: member.uid,
        name: member.displayName || member.email || member.uid,
        email: member.email,
      })
    }
    // Keep removed members visible while they still have time in the selected range.
    for (const entry of allEntries) {
      if (!found.has(entry.userId))
        found.set(entry.userId, {
          uid: entry.userId,
          name: entry.userDisplayName || t('dashboard.formerMember'),
          email: '',
        })
    }
    if (!found.has(user.uid)) found.set(user.uid, self)
    return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, language))
  }, [members, allEntries, canSeeAllEntries, user, t, language])

  const stats = useMemo(
    () =>
      people.map((person) =>
        buildStats(
          person,
          allEntries.filter((entry) => entry.userId === person.uid),
          weekStart,
          now,
        ),
      ),
    [people, allEntries, weekStart, now],
  )
  const query = search.trim().toLowerCase()
  const visibleStats = stats.filter(
    (item) =>
      (!statusFilter || item.status === statusFilter) &&
      (!query || item.person.name.toLowerCase().includes(query) || item.person.email.toLowerCase().includes(query)),
  )
  const weekDays = Array.from({ length: 7 }, (_, index) => shiftDayString(weekStart, index))

  const sum = (pick: (item: PersonStats) => number) => stats.reduce((total, item) => total + pick(item), 0)
  const total = sum((item) => item.total)
  const previousTotal = sum((item) => item.previousTotal)
  const billable = sum((item) => item.billable)
  const activeCount = stats.filter((item) => item.total > 0).length
  const longDays = stats.reduce(
    (count, item) => count + item.byDay.filter((seconds) => seconds > LONG_DAY_SECONDS).length,
    0,
  )
  const entryCount = sum((item) => item.entries.length)
  const previousEntryCount = allEntries.length - entryCount

  function changeWeek(day: string) {
    if (!day) return
    setWeekStart(startOfWeekString(day, weekStartsOn))
    setSelectedDay(null)
    setError('')
  }

  const selectedIndex = visibleStats.findIndex((item) => item.person.uid === selectedUid)
  const selected = stats.find((item) => item.person.uid === selectedUid)

  return (
    <Box component="section" aria-labelledby="dashboard-heading" sx={{ display: 'grid', gap: 2.5, minWidth: 0 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        sx={{ alignItems: { xs: 'stretch', md: 'flex-end' }, justifyContent: 'space-between', gap: 2 }}
      >
        <div>
          <Typography variant="overline" component="p">
            {canSeeAllEntries ? t('dashboard.kickerTeam') : t('dashboard.kickerSelf')}
          </Typography>
          <Typography variant="h2" component="h1" id="dashboard-heading" sx={{ fontSize: 32 }}>
            {t('dashboard.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {canSeeAllEntries ? t('dashboard.introTeam') : t('dashboard.introSelf')}
          </Typography>
        </div>
        <WeekPicker weekStart={weekStart} today={today} onChange={changeWeek} />
      </Stack>

      {error && <FormMessage severity="error">{error}</FormMessage>}

      {!canSeeAllEntries ? (
        <>
          {isLoading && (
            <Typography variant="caption" color="text.secondary" aria-live="polite">
              {t('dashboard.loadingEntries')}
            </Typography>
          )}
          {stats[0] && (
            <Paper
              variant="outlined"
              component="section"
              aria-labelledby="member-week-title"
              sx={{ borderRadius: '16px', overflow: 'hidden', minWidth: 0 }}
            >
              <MemberWeekDetail
                stats={stats[0]}
                user={user}
                isOwner={isOwner}
                workspaceId={workspaceId}
                catalog={catalog}
                weekStart={weekStart}
                today={today}
                now={now}
                variant="page"
                titleId="member-week-title"
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
              />
            </Paper>
          )}
        </>
      ) : (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0, 1fr))',
                md: 'repeat(3, minmax(0, 1fr))',
                lg: 'repeat(6, minmax(0, 1fr))',
              },
              gap: 1.5,
            }}
          >
            <StatTile
              label={t('dashboard.stats.tracked')}
              value={formatHours(total)}
              change={percentChange(total, previousTotal)}
            />
            <StatTile
              label={t('dashboard.stats.billable')}
              value={formatHours(billable)}
              caption={
                total
                  ? t('dashboard.stats.billableShare', { percent: Math.round((billable / total) * 100) })
                  : t('dashboard.stats.noTrackedTime')
              }
            />
            <StatTile
              label={t('dashboard.stats.entries')}
              value={entryCount.toLocaleString(language)}
              change={percentChange(entryCount, previousEntryCount)}
            />
            <StatTile
              label={t('dashboard.stats.activeMembers')}
              value={`${activeCount} / ${stats.length}`}
              caption={t('dashboard.stats.activeMembersCaption')}
            />
            <StatTile
              label={t('dashboard.stats.averagePerMember')}
              value={formatHours(activeCount ? total / activeCount : 0)}
              caption={t('dashboard.stats.averagePerMemberCaption')}
            />
            <StatTile
              label={t('dashboard.stats.longDays')}
              value={longDays.toLocaleString(language)}
              caption={t('dashboard.stats.longDaysCaption')}
              tone={longDays > 0 ? 'error' : undefined}
            />
          </Box>

          <Paper variant="outlined" sx={{ borderRadius: '16px', overflow: 'hidden', minWidth: 0 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              sx={{ p: 2, alignItems: { sm: 'center' }, borderBottom: 1, borderColor: 'divider' }}
            >
              <TextField
                type="search"
                placeholder={t('dashboard.searchMembersPlaceholder')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                slotProps={{ htmlInput: { 'aria-label': t('dashboard.searchMembers') } }}
                sx={{ maxWidth: { sm: 320 } }}
              />
              <SelectField
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as Status | '')}
                fullWidth={false}
                slotProps={{ htmlInput: { 'aria-label': t('dashboard.filterByStatus') } }}
                sx={{ minWidth: 160 }}
              >
                <option value="">{t('dashboard.allStatuses')}</option>
                {(Object.keys(STATUSES) as Status[]).map((status) => (
                  <option key={status} value={status}>
                    {t(STATUSES[status].key)}
                  </option>
                ))}
              </SelectField>
              <Typography variant="caption" color="text.secondary" sx={{ ml: { sm: 'auto' } }} aria-live="polite">
                {isLoading
                  ? t('dashboard.loadingEntries')
                  : t('dashboard.memberCount', { visible: visibleStats.length, count: stats.length })}
              </Typography>
            </Stack>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: { xs: 0, md: 860 }, '& td, & th': { borderColor: 'divider' } }}>
                <TableHead>
                  <TableRow
                    sx={{
                      bgcolor: 'app.surfaceMuted',
                      '& th': { color: 'text.secondary', fontSize: 12, fontWeight: 650, py: 1.25 },
                    }}
                  >
                    <TableCell>{t('dashboard.columns.member')}</TableCell>
                    {weekDays.map((day) => (
                      <TableCell
                        key={day}
                        align="center"
                        sx={{
                          display: { xs: 'none', md: 'table-cell' },
                          ...(day === today && { color: 'primary.main !important' }),
                        }}
                      >
                        {dayDate(day).toLocaleDateString(language, { weekday: 'short' })}
                        <Box component="span" sx={{ display: 'block', fontWeight: 400 }}>
                          {dayDate(day).getDate()}
                        </Box>
                      </TableCell>
                    ))}
                    <TableCell align="right">{t('dashboard.columns.total')}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      {t('dashboard.columns.status')}
                    </TableCell>
                    <TableCell>
                      <Box component="span" sx={visuallyHiddenSx}>
                        {t('dashboard.columns.actions')}
                      </Box>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleStats.map((item) => (
                    <TableRow
                      key={item.person.uid}
                      hover
                      onClick={() => setSelectedUid(item.person.uid)}
                      sx={{ cursor: 'pointer', '& td': { py: 1.5 } }}
                    >
                      <TableCell sx={{ minWidth: 0, maxWidth: 260 }}>
                        <PersonLabel person={item.person} isSelf={item.person.uid === user.uid} />
                      </TableCell>
                      {item.byDay.map((seconds, index) => (
                        <TableCell
                          key={weekDays[index]}
                          align="center"
                          sx={{ display: { xs: 'none', md: 'table-cell' }, px: 0.75 }}
                        >
                          <DayCell seconds={seconds} />
                        </TableCell>
                      ))}
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {formatHours(item.total)}
                        </Typography>
                        <WeekProgress seconds={item.total} />
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        <StatusChip status={item.status} />
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelectedUid(item.person.uid)
                          }}
                          // Starts with the visible text, so voice control users can say "View".
                          aria-label={t('dashboard.viewTimesheetFor', { name: item.person.name })}
                        >
                          {t('dashboard.view')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!isLoading && visibleStats.length === 0 && (
                <Box sx={{ px: 2 }}>
                  <EmptyText>{t('dashboard.noMatchingMembers')}</EmptyText>
                </Box>
              )}
            </Box>
          </Paper>

          {selected && (
            <MemberDialog
              key={selected.person.uid}
              stats={selected}
              user={user}
              isOwner={isOwner}
              workspaceId={workspaceId}
              catalog={catalog}
              weekStart={weekStart}
              today={today}
              now={now}
              position={selectedIndex >= 0 ? { index: selectedIndex, count: visibleStats.length } : null}
              onNavigate={(offset) => {
                const next = visibleStats[selectedIndex + offset]
                if (next) setSelectedUid(next.person.uid)
              }}
              onClose={() => setSelectedUid(null)}
            />
          )}
        </>
      )}
    </Box>
  )
}

const visuallyHiddenSx = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const

function WeekPicker({
  weekStart,
  today,
  onChange,
}: {
  weekStart: string
  today: string
  onChange: (day: string) => void
}) {
  const { t } = useTranslation()
  return (
    <Stack direction="row" spacing={1} aria-label={t('dashboard.weekNavigation')} sx={{ alignItems: 'center' }}>
      <Button
        variant="outlined"
        aria-label={t('entries.previousWeek')}
        onClick={() => onChange(shiftDayString(weekStart, -7))}
        sx={{ minWidth: 44, px: 1 }}
      >
        ‹
      </Button>
      <TextField
        type="date"
        value={weekStart}
        onChange={(event) => onChange(event.target.value)}
        fullWidth={false}
        slotProps={{ htmlInput: { 'aria-label': t('entries.chooseWeek') } }}
        sx={{ width: 160, bgcolor: 'background.paper' }}
      />
      <Button
        variant="outlined"
        aria-label={t('entries.nextWeek')}
        onClick={() => onChange(shiftDayString(weekStart, 7))}
        sx={{ minWidth: 44, px: 1 }}
      >
        ›
      </Button>
      <Button onClick={() => onChange(today)} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
        {t('dashboard.thisWeek')}
      </Button>
    </Stack>
  )
}

function StatTile({
  label,
  value,
  change,
  caption,
  tone,
}: {
  label: string
  value: string
  change?: number | null
  caption?: string
  tone?: 'error'
}) {
  const { t } = useTranslation()
  const language = useAppLanguage()
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: '14px', minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 24,
          fontWeight: 650,
          fontVariantNumeric: 'tabular-nums',
          color: tone === 'error' ? 'error.main' : 'text.primary',
          lineHeight: 1.3,
        }}
      >
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>
        {change === undefined ? (
          caption
        ) : change === null ? (
          t('dashboard.stats.noBaseline')
        ) : (
          <>
            <Box component="span" sx={{ color: change >= 0 ? 'success.main' : 'error.main', fontWeight: 650 }}>
              {new Intl.NumberFormat(language, {
                style: 'percent',
                signDisplay: 'exceptZero',
                maximumFractionDigits: 1,
              }).format(change / 100)}
            </Box>{' '}
            {t('dashboard.stats.vsPreviousWeek')}
          </>
        )}
      </Typography>
    </Paper>
  )
}

function PersonAvatar({ person, size = 34 }: { person: Person; size?: number }) {
  return (
    <Avatar
      aria-hidden="true"
      sx={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        fontWeight: 700,
        bgcolor: avatarColor(person.uid),
        color: 'app.avatarText',
      }}
    >
      {initials(person.name)}
    </Avatar>
  )
}

function PersonLabel({ person, isSelf }: { person: Person; isSelf?: boolean }) {
  const { t } = useTranslation()
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
      <PersonAvatar person={person} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 650 }}>
          {person.name}
          {isSelf && (
            <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
              {' '}
              {t('members.you')}
            </Box>
          )}
        </Typography>
        {person.email && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {person.email}
          </Typography>
        )}
      </Box>
    </Stack>
  )
}

function DayCell({ seconds }: { seconds: number }) {
  const { hours: formatHours } = useDashboardFormat()
  if (seconds === 0)
    return (
      <Typography variant="caption" color="text.disabled">
        –
      </Typography>
    )
  const isLong = seconds > LONG_DAY_SECONDS
  return (
    <Box
      sx={{
        display: 'inline-block',
        minWidth: 52,
        whiteSpace: 'nowrap',
        px: 0.75,
        py: 0.25,
        borderRadius: '6px',
        fontSize: 12,
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        bgcolor: (theme) =>
          isLong
            ? theme.palette.app.errorSoft
            : alpha(theme.palette.app.segment.billable, 0.08 + Math.min(seconds / (8 * 3600), 1) * 0.22),
        // primary.dark reads well on the light tints but is about 3:1 on the dark ones.
        color: (theme) =>
          isLong
            ? theme.palette.error.main
            : theme.palette.mode === 'dark'
              ? theme.palette.primary.main
              : theme.palette.primary.dark,
      }}
    >
      {formatHours(seconds)}
    </Box>
  )
}

function WeekProgress({ seconds }: { seconds: number }) {
  const { t } = useTranslation()
  const ratio = Math.min(seconds / WEEKLY_TARGET_SECONDS, 1)
  return (
    <Box
      role="img"
      aria-label={t('dashboard.weekTargetProgress', { percent: Math.round((seconds / WEEKLY_TARGET_SECONDS) * 100) })}
      sx={{ width: 72, height: 4, ml: 'auto', mt: 0.5, borderRadius: 2, bgcolor: 'app.track', overflow: 'hidden' }}
    >
      <Box
        sx={{
          width: `${ratio * 100}%`,
          height: '100%',
          bgcolor: seconds > WEEKLY_TARGET_SECONDS ? 'warning.main' : 'primary.light',
        }}
      />
    </Box>
  )
}

function StatusChip({ status }: { status: Status }) {
  const { t } = useTranslation()
  const { key, color } = STATUSES[status]
  return (
    <Chip
      label={t(key)}
      color={color}
      variant={color === 'default' ? 'outlined' : 'filled'}
      sx={
        color === 'default'
          ? undefined
          : { bgcolor: (theme) => `${theme.palette[color].main}1f`, color: `${color}.main`, fontWeight: 650 }
      }
    />
  )
}

type EditorState = { entry?: TimeEntry; day: string } | null

function entryDay(entry: TimeEntry): string {
  return localDayString(entry.startAt.toDate())
}

type MemberWeekDetailProps = {
  stats: PersonStats
  user: User
  isOwner: boolean
  workspaceId: string
  catalog: Catalog
  weekStart: string
  today: string
  now: number
  /** `dialog` sits inside the manager's member dialog; `page` is the member's own Dashboard. */
  variant: 'dialog' | 'page'
  titleId: string
  /** Extra controls at the end of the header, such as the dialog's member navigation and close button. */
  headerActions?: ReactNode
  /** Page only: the day the member picked in the day strip, or null for the whole week. */
  selectedDay?: string | null
  onSelectDay?: (day: string | null) => void
}

// The timeline, stats and entry list for one person's week. Shared by the manager's member dialog and the
// member's own Dashboard so both show the same numbers.
function MemberWeekDetail({
  stats,
  user,
  isOwner,
  workspaceId,
  catalog,
  weekStart,
  today,
  now,
  variant,
  titleId,
  headerActions,
  selectedDay = null,
  onSelectDay,
}: MemberWeekDetailProps) {
  const { t, language, hours: formatHours } = useDashboardFormat()
  const [tab, setTab] = useState<'timeline' | 'entries'>('timeline')
  const [editor, setEditor] = useState<EditorState>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const { person, entries } = stats
  const isSelf = person.uid === user.uid
  const isPage = variant === 'page'
  const canEdit = (entry: TimeEntry) => entry.endAt !== null && (isSelf || isOwner)
  const allWeekDays = Array.from({ length: 7 }, (_, index) => shiftDayString(weekStart, index))
  const weekDays = allWeekDays
    .filter((day) => day <= today || entries.some((entry) => entryDay(entry) === day))
    .reverse()
  const timelineDays = selectedDay ? [selectedDay] : weekDays
  const visibleEntries = selectedDay ? entries.filter((entry) => entryDay(entry) === selectedDay) : entries
  const daysTracked = stats.byDay.filter(Boolean).length
  const totalBreaks = weekDays.reduce(
    (total, day) => total + breakSeconds(entries.filter((entry) => entryDay(entry) === day)),
    0,
  )
  const Body = isPage ? Box : DialogContent

  // One shared hour axis across the week keeps the day rows visually comparable.
  const [axisStart, axisEnd] = useMemo(() => {
    let start = 9
    let end = 18
    for (const entry of entries) {
      const startDate = entry.startAt.toDate()
      const endDate = entry.endAt?.toDate() ?? new Date(now)
      start = Math.min(start, startDate.getHours())
      const sameDay = localDayString(endDate) === localDayString(startDate)
      end = Math.max(end, sameDay ? endDate.getHours() + (endDate.getMinutes() > 0 ? 1 : 0) : 24)
    }
    return [start, Math.min(24, end)]
  }, [entries, now])

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

  function defaultEditorDay(): string {
    if (selectedDay) return selectedDay
    return today >= weekStart && today <= shiftDayString(weekStart, 6) ? today : weekStart
  }

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
          px: { xs: isPage ? 2 : 3, sm: 3 },
          pt: isPage ? 2.5 : 2,
          pb: 1.5,
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0, flex: 1 }}>
          <PersonAvatar person={person} size={48} />
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
              <Typography
                id={titleId}
                component={isPage ? 'h3' : 'h2'}
                sx={{ fontSize: 20, fontWeight: 650, minWidth: 0 }}
                noWrap
              >
                {person.name}
              </Typography>
              <StatusChip status={stats.status} />
            </Stack>
            {person.email && (
              <Typography variant="body2" color="text.secondary" noWrap>
                {person.email}
              </Typography>
            )}
          </Box>
        </Stack>
        {headerActions}
      </Box>
      <Tabs
        value={tab}
        onChange={(_, value: 'timeline' | 'entries') => setTab(value)}
        sx={{
          px: { xs: isPage ? 2 : 3, sm: 3 },
          borderBottom: 1,
          borderColor: 'divider',
          minHeight: 40,
          '& .MuiTab-root': { minHeight: 40, px: 0, mr: 3, minWidth: 0 },
        }}
      >
        <Tab value="timeline" label={t('dashboard.tabs.timeline')} />
        <Tab value="entries" label={t('dashboard.tabs.entries', { count: visibleEntries.length })} />
      </Tabs>
      <Body sx={isPage ? { px: { xs: 2, sm: 3 }, pt: 2.5, pb: 3 } : { pt: '20px !important' }}>
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 2, flexWrap: 'wrap' }}
        >
          {isPage && onSelectDay ? (
            <DayStrip
              days={allWeekDays}
              byDay={stats.byDay}
              today={today}
              selectedDay={selectedDay}
              onSelect={onSelectDay}
            />
          ) : (
            <Chip
              variant="outlined"
              label={t('dashboard.weekOf', { range: formatWeekLabel(weekStart, language) })}
              sx={{ height: 34, borderRadius: '8px', fontWeight: 600 }}
            />
          )}
          {isSelf && (
            <Button
              variant="outlined"
              onClick={() => {
                setEditor({ day: defaultEditorDay() })
                setNotice('')
              }}
              sx={{ flexShrink: 0 }}
            >
              {t('dashboard.addEntry')}
            </Button>
          )}
        </Stack>
        {error && <FormMessage severity="error">{error}</FormMessage>}
        {notice && <FormMessage severity="success">{notice}</FormMessage>}

        {tab === 'timeline' ? (
          <>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'repeat(2, minmax(0, 1fr))',
                  sm: 'repeat(3, minmax(0, 1fr))',
                  ...(isPage && { lg: 'repeat(6, minmax(0, 1fr))' }),
                },
                gap: 1.25,
              }}
            >
              <StatTile
                label={t('dashboard.stats.tracked')}
                value={formatHours(stats.total)}
                change={percentChange(stats.total, stats.previousTotal)}
              />
              <StatTile
                label={t('dashboard.stats.billable')}
                value={formatHours(stats.billable)}
                caption={
                  stats.total
                    ? t('dashboard.stats.billableShare', { percent: Math.round((stats.billable / stats.total) * 100) })
                    : t('dashboard.stats.noTrackedTime')
                }
              />
              <StatTile
                label={t('dashboard.stats.entries')}
                value={entries.length.toLocaleString(language)}
                caption={t('dashboard.stats.daysTracked', { tracked: daysTracked })}
              />
              <StatTile
                label={t('dashboard.stats.longestDay')}
                value={formatHours(stats.longestDay)}
                caption={
                  stats.longestDay > LONG_DAY_SECONDS
                    ? t('dashboard.stats.overTenHours')
                    : t('dashboard.stats.withinTenHours')
                }
                tone={stats.longestDay > LONG_DAY_SECONDS ? 'error' : undefined}
              />
              <StatTile
                label={t('dashboard.stats.breaks')}
                value={formatHours(totalBreaks)}
                caption={t('dashboard.stats.breaksCaption')}
              />
              <StatTile
                label={t('dashboard.stats.weeklyTarget')}
                value={new Intl.NumberFormat(language, { style: 'percent' }).format(
                  Math.round((stats.total / WEEKLY_TARGET_SECONDS) * 100) / 100,
                )}
                caption={t('dashboard.stats.weeklyTargetCaption')}
              />
            </Box>
            <Stack
              direction="row"
              spacing={2.25}
              sx={{ mt: 3, mb: 1, pt: 2.5, borderTop: 1, borderColor: 'divider', flexWrap: 'wrap', rowGap: 1 }}
            >
              <LegendDot kind="billable" label={t('dashboard.legend.billable')} />
              <LegendDot kind="nonBillable" label={t('dashboard.legend.nonBillable')} />
              <LegendDot kind="gap" label={t('dashboard.legend.break')} />
              <LegendDot kind="running" label={t('dashboard.legend.running')} />
            </Stack>
            <Typography sx={visuallyHiddenSx}>{t('dashboard.timelineHelp')}</Typography>
            {timelineDays.length === 0 ? (
              <EmptyText>{t('dashboard.weekNotStarted')}</EmptyText>
            ) : (
              timelineDays.map((day) => (
                <DayTimeline
                  key={day}
                  day={day}
                  today={today}
                  entries={entries.filter((entry) => entryDay(entry) === day)}
                  axisStart={axisStart}
                  axisEnd={axisEnd}
                  now={now}
                  canEdit={canEdit}
                  onEdit={(entry) => {
                    setEditor({ entry, day })
                    setNotice('')
                  }}
                />
              ))
            )}
          </>
        ) : (
          <EntryList
            entries={visibleEntries}
            emptyText={selectedDay ? t('dashboard.noEntriesDay') : t('dashboard.noEntriesWeek')}
            now={now}
            pending={pending}
            canEdit={canEdit}
            onEdit={(entry) => {
              setEditor({ entry, day: entryDay(entry) })
              setNotice('')
            }}
            onDelete={(entry) => void handleDelete(entry)}
          />
        )}
      </Body>
      {editor && (
        <EntryEditor
          workspaceId={workspaceId}
          catalog={catalog}
          entry={editor.entry}
          day={editor.day}
          onClose={() => setEditor(null)}
          onSaved={(message) => {
            setEditor(null)
            setNotice(message)
          }}
        />
      )}
    </>
  )
}

function DayStrip({
  days,
  byDay,
  today,
  selectedDay,
  onSelect,
}: {
  days: string[]
  byDay: number[]
  today: string
  selectedDay: string | null
  onSelect: (day: string | null) => void
}) {
  const { t, language, hours: formatHours, dayLabel } = useDashboardFormat()
  const chipSx = { height: 'auto', minHeight: 34, borderRadius: '8px', fontWeight: 600 }
  return (
    <Box
      role="group"
      aria-label={t('dashboard.showDay')}
      sx={{ display: 'flex', gap: 0.75, overflowX: 'auto', minWidth: 0, maxWidth: '100%', pb: 0.25 }}
    >
      <Chip
        label={t('dashboard.allWeek')}
        clickable
        color={selectedDay === null ? 'primary' : 'default'}
        variant={selectedDay === null ? 'filled' : 'outlined'}
        aria-pressed={selectedDay === null}
        onClick={() => onSelect(null)}
        sx={chipSx}
      />
      {days.map((day, index) => {
        const date = dayDate(day)
        const isSelected = selectedDay === day
        const weekday = date.toLocaleDateString(language, { weekday: 'short' })
        return (
          <Chip
            key={day}
            clickable
            color={isSelected ? 'primary' : 'default'}
            variant={isSelected ? 'filled' : 'outlined'}
            aria-pressed={isSelected}
            aria-label={t('dashboard.dayTracked', {
              day: dayLabel(day, today),
              time: formatHours(byDay[index] ?? 0),
            })}
            onClick={() => onSelect(isSelected ? null : day)}
            label={
              <Box component="span" sx={{ display: 'block', textAlign: 'center', lineHeight: 1.25, py: 0.25 }}>
                <Box
                  component="span"
                  sx={{ display: 'block', ...(day === today && !isSelected && { color: 'primary.main' }) }}
                >
                  {weekday} {date.getDate()}
                </Box>
                <Box component="span" sx={{ display: 'block', fontSize: 11, fontWeight: 400, opacity: 0.8 }}>
                  {byDay[index] ? formatHours(byDay[index]) : '–'}
                </Box>
              </Box>
            }
            sx={{ ...chipSx, flexShrink: 0 }}
          />
        )
      })}
    </Box>
  )
}

function MemberDialog({
  position,
  onNavigate,
  onClose,
  ...detail
}: Omit<MemberWeekDetailProps, 'variant' | 'titleId' | 'headerActions' | 'selectedDay' | 'onSelectDay'> & {
  position: { index: number; count: number } | null
  onNavigate: (offset: number) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <Dialog
      open
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="md"
      fullWidth
      aria-labelledby="member-dialog-title"
      slotProps={{ paper: { sx: { borderRadius: fullScreen ? 0 : '18px' } } }}
    >
      <MemberWeekDetail
        {...detail}
        variant="dialog"
        titleId="member-dialog-title"
        headerActions={
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            {position && position.count > 1 && (
              <>
                <IconButton
                  aria-label={t('dashboard.previousMember')}
                  onClick={() => onNavigate(-1)}
                  disabled={position.index === 0}
                  sx={navButtonSx}
                >
                  ‹
                </IconButton>
                <IconButton
                  aria-label={t('dashboard.nextMember')}
                  onClick={() => onNavigate(1)}
                  disabled={position.index >= position.count - 1}
                  sx={navButtonSx}
                >
                  ›
                </IconButton>
                <Typography variant="body2" color="text.secondary" sx={{ px: 1, whiteSpace: 'nowrap' }}>
                  {t('dashboard.memberPosition', { position: position.index + 1, count: position.count })}
                </Typography>
              </>
            )}
            <IconButton aria-label={t('dashboard.close')} onClick={onClose} sx={navButtonSx}>
              ×
            </IconButton>
          </Stack>
        }
      />
    </Dialog>
  )
}

const navButtonSx = {
  width: 36,
  height: 36,
  border: 1,
  borderColor: 'divider',
  borderRadius: '8px',
  fontSize: 20,
  lineHeight: 1,
}

function LegendDot({ kind, label }: { kind: SegmentKind; label: string }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      <Box sx={[{ width: 12, height: 12, borderRadius: '3px' }, segmentSx(kind)]} />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  )
}

/** A callback ref and the element's current width in px; 0 until measured or where layout is unavailable. */
function useElementWidth(): [(element: HTMLElement | null) => void, number] {
  const [element, setElement] = useState<HTMLElement | null>(null)
  const [width, setWidth] = useState(0)
  const ref = useCallback((node: HTMLElement | null) => {
    setElement(node)
    setWidth(node?.clientWidth ?? 0)
  }, [])
  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return [ref, width]
}

function DayTimeline({
  day,
  today,
  entries,
  axisStart,
  axisEnd,
  now,
  canEdit,
  onEdit,
}: {
  day: string
  today: string
  entries: TimeEntry[]
  axisStart: number
  axisEnd: number
  now: number
  canEdit: (entry: TimeEntry) => boolean
  onEdit: (entry: TimeEntry) => void
}) {
  const { t, hours: formatHours, clock: formatClock, dayLabel } = useDashboardFormat()
  const [trackRef, trackWidth] = useElementWidth()
  const sorted = [...entries].sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())
  const dayStart = new Date(`${day}T00:00:00`).getTime()
  const axisFrom = dayStart + axisStart * 3_600_000
  const axisSpan = (axisEnd - axisStart) * 3_600_000
  const position = (time: number) => Math.min(100, Math.max(0, ((time - axisFrom) / axisSpan) * 100))
  const total = sorted.reduce((sum, entry) => sum + entrySeconds(entry, now), 0)
  const first = sorted[0]
  const last = sorted.at(-1)
  const tickStep = axisEnd - axisStart > 12 ? 3 : 2
  const ticks = Array.from(
    { length: Math.floor((axisEnd - axisStart) / tickStep) + 1 },
    (_, index) => axisStart + index * tickStep,
  )

  return (
    <Box
      component="section"
      aria-label={t('dashboard.dayTracked', { day: dayLabel(day, today), time: formatHours(total) })}
      sx={{ py: 2, borderBottom: 1, borderColor: 'divider', borderBottomStyle: 'dashed' }}
    >
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 1.25 }}>
        <Typography sx={{ fontWeight: 650 }}>{dayLabel(day, today)}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('dashboard.duration')}{' '}
          <Box
            component="span"
            sx={{ color: total > LONG_DAY_SECONDS ? 'error.main' : 'text.primary', fontWeight: 700 }}
          >
            {formatHours(total)}
          </Box>
        </Typography>
      </Stack>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '78px minmax(0, 1fr) 78px' },
          alignItems: 'end',
          gap: { xs: 0.75, sm: 1.5 },
        }}
      >
        <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
          <Typography variant="caption" color="text.secondary">
            {t('dashboard.firstIn')}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
            {first ? formatClock(first.startAt.toDate()) : '—'}
          </Typography>
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Box aria-hidden="true" sx={{ position: 'relative', height: 18 }}>
            {ticks.map((hour) => (
              <Typography
                key={hour}
                variant="caption"
                color="text.secondary"
                sx={{
                  position: 'absolute',
                  left: `${((hour - axisStart) / (axisEnd - axisStart)) * 100}%`,
                  transform: hour === axisStart ? 'none' : hour === axisEnd ? 'translateX(-100%)' : 'translateX(-50%)',
                  fontSize: 11,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {`${hour}`.padStart(2, '0')}:00
              </Typography>
            ))}
          </Box>
          <Box
            ref={trackRef}
            sx={{ position: 'relative', height: 30, borderRadius: '7px', bgcolor: 'app.track', overflow: 'hidden' }}
          >
            {sorted.map((entry, index) => {
              const start = entry.startAt.toMillis()
              const end = entry.endAt?.toMillis() ?? now
              const previousEnd = index > 0 ? sorted[index - 1].endAt?.toMillis() : undefined
              const gap =
                previousEnd !== undefined && start > previousEnd ? (
                  <Box
                    key={`${entry.id}-gap`}
                    aria-hidden="true"
                    sx={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${position(previousEnd)}%`,
                      width: `${position(start) - position(previousEnd)}%`,
                      bgcolor: 'app.segment.gap',
                    }}
                  />
                ) : null
              const running = entry.endAt === null
              const kind: SegmentKind = running ? 'running' : entry.billable ? 'billable' : 'nonBillable'
              const project = [entry.clientName, entry.projectName, entry.taskName].filter(Boolean).join(' · ')
              // Unmeasured (first render, or no layout in tests) counts as wide enough, so editing is never lost.
              const widthPx = ((position(end) - position(start)) / 100) * trackWidth - 2
              const tooNarrow = trackWidth > 0 && widthPx < MIN_TARGET_PX
              const editable = canEdit(entry)
              const interactive = editable && !tooNarrow
              const label = [
                entry.description || t('common.untitledEntry'),
                [
                  running && t('dashboard.segment.running'),
                  entry.billable ? t('dashboard.segment.billable') : t('dashboard.segment.nonBillable'),
                ]
                  .filter(Boolean)
                  .join(', '),
                project || t('dashboard.segment.noProject'),
                `${formatClock(new Date(start))}–${running ? t('dashboard.segment.now') : formatClock(new Date(end))}`,
                formatHours(entrySeconds(entry, now)),
                editable && tooNarrow && t('dashboard.segment.tooShort'),
              ]
                .filter(Boolean)
                .join(', ')
              const segmentStyle = [
                {
                  position: 'absolute',
                  top: 3,
                  bottom: 3,
                  left: `${position(start)}%`,
                  width: `max(4px, calc(${position(end) - position(start)}% - 2px))`,
                  p: 0,
                  borderRadius: '5px',
                },
                segmentSx(kind, !entry.billable),
              ] as const
              return [
                gap,
                <Tooltip
                  key={entry.id}
                  title={
                    <>
                      <b>{entry.description || t('common.untitledEntry')}</b>
                      <br />
                      {project || t('dashboard.noProject')} ·{' '}
                      {entry.billable ? t('dashboard.billable') : t('dashboard.nonBillable')}
                      <br />
                      {formatClock(new Date(start))} –{' '}
                      {running ? t('dashboard.runningLower') : formatClock(new Date(end))} ·{' '}
                      {formatHours(entrySeconds(entry, now))}
                    </>
                  }
                >
                  {interactive ? (
                    <Box
                      component="button"
                      type="button"
                      aria-label={t('dashboard.segment.edit', { label })}
                      onClick={() => onEdit(entry)}
                      sx={[
                        ...segmentStyle,
                        {
                          cursor: 'pointer',
                          transition: 'filter .15s',
                          '&:hover': { filter: 'brightness(1.1)' },
                          '&:focus-visible': {
                            outline: (theme) => `3px solid ${theme.palette.app.focus}`,
                            outlineOffset: 1,
                          },
                        },
                      ]}
                    />
                  ) : (
                    <Box role="img" aria-label={label} sx={segmentStyle} />
                  )}
                </Tooltip>,
              ]
            })}
          </Box>
        </Box>
        <Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'right' }}>
          <Typography variant="caption" color="text.secondary">
            {t('dashboard.lastOut')}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
            {!last ? '—' : last.endAt ? formatClock(last.endAt.toDate()) : t('common.running')}
          </Typography>
        </Box>
      </Box>
      {sorted.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          {t('dashboard.noTimeTracked')}
        </Typography>
      )}
    </Box>
  )
}

function EntryList({
  entries,
  emptyText,
  now,
  pending,
  canEdit,
  onEdit,
  onDelete,
}: {
  entries: TimeEntry[]
  emptyText: string
  now: number
  pending: boolean
  canEdit: (entry: TimeEntry) => boolean
  onEdit: (entry: TimeEntry) => void
  onDelete: (entry: TimeEntry) => void
}) {
  const { t, language, hours: formatHours, clock: formatClock } = useDashboardFormat()
  if (entries.length === 0) return <EmptyText>{emptyText}</EmptyText>
  const sorted = [...entries].sort((a, b) => b.startAt.toMillis() - a.startAt.toMillis())
  return (
    <Box>
      {sorted.map((entry) => {
        const start = entry.startAt.toDate()
        return (
          <Box
            component="article"
            key={entry.id}
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', sm: '108px minmax(0, 1fr) auto auto' },
              alignItems: 'center',
              gap: { xs: 1, sm: 2 },
              py: 1.5,
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Box sx={{ display: { xs: 'none', sm: 'block' }, fontVariantNumeric: 'tabular-nums' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {start.toLocaleDateString(language, { weekday: 'short', month: 'short', day: 'numeric' })}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatClock(start)} – {entry.endAt ? formatClock(entry.endAt.toDate()) : t('dashboard.runningLower')}
              </Typography>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                {entry.description || t('common.untitledEntry')}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {[entry.clientName, entry.projectName, entry.taskName].filter(Boolean).join(' · ') ||
                  t('entries.noWork')}
              </Typography>
            </Box>
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}
            >
              {formatHours(entrySeconds(entry, now))}
            </Typography>
            <Stack
              direction="row"
              spacing={0.5}
              sx={{ alignItems: 'center', justifyContent: 'flex-end', gridColumn: { xs: '1 / -1', sm: 'auto' } }}
            >
              {entry.endAt === null && <Chip label={t('common.running')} color="warning" variant="outlined" />}
              {entry.autoStopped === true && <AutoStoppedChip />}
              {entry.billable && <BillableChip />}
              {canEdit(entry) && (
                <>
                  <Button size="small" onClick={() => onEdit(entry)} disabled={pending}>
                    {t('entries.edit')}
                  </Button>
                  <Button size="small" color="error" onClick={() => onDelete(entry)} disabled={pending}>
                    {t('entries.delete')}
                  </Button>
                </>
              )}
            </Stack>
          </Box>
        )
      })}
    </Box>
  )
}
