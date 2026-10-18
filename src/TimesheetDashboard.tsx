import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
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
import type { Catalog } from './lib/catalog'
import { dayDate, localDateTimeValue, localDayString, shiftDayString, startOfWeekString } from './lib/dates'
import { useManualEntryFieldErrors } from './useManualEntryFieldErrors'
import { deleteTimeEntry, saveManualTimeEntry, subscribeToEntriesForRange, type TimeEntry } from './lib/timeEntries'
import { subscribeToWorkspaceMembers, type WorkspaceMember } from './lib/workspaces'
import { BillableChip, EmptyText, FormMessage, SelectField } from './ui'

type Props = { user: User; workspaceId: string; isOwner: boolean; weekStartsOn: number; catalog: Catalog }
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
// Theme palette paths, resolved by `sx` against the user's selected palette.
const SEGMENT_COLORS = {
  billable: 'app.segment.billable',
  nonBillable: 'app.segment.nonBillable',
  running: 'app.segment.running',
  gap: 'app.segment.gap',
}
const STATUS_LABELS: Record<Status, { label: string; color: 'default' | 'success' | 'warning' | 'error' }> = {
  running: { label: 'Running', color: 'warning' },
  'long-day': { label: 'Long day', color: 'error' },
  overtime: { label: 'Overtime', color: 'warning' },
  'no-time': { label: 'No time', color: 'default' },
  'on-track': { label: 'On track', color: 'success' },
}

function entrySeconds(entry: TimeEntry, now: number): number {
  const end = entry.endAt ? entry.endAt.toMillis() : now
  return Math.max(0, Math.floor((end - entry.startAt.toMillis()) / 1000))
}

function formatHours(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours === 0) return `${minutes}m`
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatRange(startDay: string): string {
  const start = dayDate(startDay)
  const end = dayDate(shiftDayString(startDay, 6))
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${startLabel} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
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

export function TimesheetDashboard({ user, workspaceId, isOwner, weekStartsOn, catalog }: Props) {
  const [today] = useState(() => localDayString(new Date()))
  const [weekStart, setWeekStart] = useState(() => startOfWeekString(today, weekStartsOn))
  const previousWeekStart = shiftDayString(weekStart, -7)
  const [entryState, setEntryState] = useState<{ key: string; entries: TimeEntry[] }>({ key: '', entries: [] })
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<Status | ''>('')
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
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
        isOwner,
        previousWeekStart,
        14,
        (entries) => setEntryState({ key: rangeKey, entries }),
        (loadError) => setError(loadError.message),
      ),
    [workspaceId, user.uid, isOwner, previousWeekStart, rangeKey],
  )
  useEffect(() => {
    if (!isOwner) return
    return subscribeToWorkspaceMembers(workspaceId, setMembers, (loadError) => setError(loadError.message))
  }, [workspaceId, isOwner])
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  const people = useMemo<Person[]>(() => {
    const self: Person = {
      uid: user.uid,
      name: user.displayName?.trim() || user.email || 'You',
      email: user.email ?? '',
    }
    if (!isOwner) return [self]
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
        found.set(entry.userId, { uid: entry.userId, name: entry.userDisplayName || 'Former member', email: '' })
    }
    if (!found.has(user.uid)) found.set(user.uid, self)
    return [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [members, allEntries, isOwner, user])

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
            {isOwner ? 'TEAM TIMESHEET' : 'YOUR TIMESHEET'}
          </Typography>
          <Typography variant="h2" id="dashboard-heading" sx={{ fontSize: 32 }}>
            Timesheet dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isOwner
              ? 'Review, correct, and add time for everyone in this workspace.'
              : 'Review and correct your tracked time.'}
          </Typography>
        </div>
        <WeekPicker weekStart={weekStart} today={today} onChange={changeWeek} />
      </Stack>

      {error && <FormMessage severity="error">{error}</FormMessage>}

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
        <StatTile label="Tracked" value={formatHours(total)} change={percentChange(total, previousTotal)} />
        <StatTile
          label="Billable"
          value={formatHours(billable)}
          caption={total ? `${Math.round((billable / total) * 100)}% of tracked` : 'No tracked time'}
        />
        <StatTile label="Entries" value={String(entryCount)} change={percentChange(entryCount, previousEntryCount)} />
        <StatTile
          label={isOwner ? 'Active members' : 'Days tracked'}
          value={isOwner ? `${activeCount} / ${stats.length}` : String(stats[0]?.byDay.filter(Boolean).length ?? 0)}
          caption={isOwner ? 'Tracked time this week' : 'Out of 7 days'}
        />
        <StatTile
          label={isOwner ? 'Avg per member' : 'Avg per day'}
          value={formatHours(
            isOwner
              ? activeCount
                ? total / activeCount
                : 0
              : total / Math.max(1, stats[0]?.byDay.filter(Boolean).length ?? 1),
          )}
          caption={isOwner ? 'Among active members' : 'On days with time'}
        />
        <StatTile
          label="Long days"
          value={String(longDays)}
          caption="Days over 10 hours"
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
            placeholder={isOwner ? 'Search members…' : 'Search…'}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            slotProps={{ htmlInput: { 'aria-label': 'Search members' } }}
            sx={{ maxWidth: { sm: 320 } }}
          />
          <SelectField
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as Status | '')}
            fullWidth={false}
            slotProps={{ htmlInput: { 'aria-label': 'Filter by status' } }}
            sx={{ minWidth: 160 }}
          >
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABELS) as Status[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status].label}
              </option>
            ))}
          </SelectField>
          <Typography variant="caption" color="text.secondary" sx={{ ml: { sm: 'auto' } }} aria-live="polite">
            {isLoading
              ? 'Loading entries…'
              : `${visibleStats.length} of ${stats.length} ${stats.length === 1 ? 'member' : 'members'}`}
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
                <TableCell>Member</TableCell>
                {weekDays.map((day) => (
                  <TableCell
                    key={day}
                    align="center"
                    sx={{
                      display: { xs: 'none', md: 'table-cell' },
                      ...(day === today && { color: 'primary.main !important' }),
                    }}
                  >
                    {dayDate(day).toLocaleDateString(undefined, { weekday: 'short' })}
                    <Box component="span" sx={{ display: 'block', fontWeight: 400 }}>
                      {dayDate(day).getDate()}
                    </Box>
                  </TableCell>
                ))}
                <TableCell align="right">Total</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Status</TableCell>
                <TableCell>
                  <Box component="span" sx={visuallyHiddenSx}>
                    Actions
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
                      aria-label={`Open timesheet for ${item.person.name}`}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!isLoading && visibleStats.length === 0 && (
            <Box sx={{ px: 2 }}>
              <EmptyText>No members match these filters.</EmptyText>
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
  return (
    <Stack direction="row" spacing={1} aria-label="Week navigation" sx={{ alignItems: 'center' }}>
      <Button
        variant="outlined"
        aria-label="Previous week"
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
        slotProps={{ htmlInput: { 'aria-label': 'Choose a week' } }}
        sx={{ width: 160, bgcolor: 'background.paper' }}
      />
      <Button
        variant="outlined"
        aria-label="Next week"
        onClick={() => onChange(shiftDayString(weekStart, 7))}
        sx={{ minWidth: 44, px: 1 }}
      >
        ›
      </Button>
      <Button onClick={() => onChange(today)} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
        This week
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
          '— vs previous week'
        ) : (
          <>
            <Box component="span" sx={{ color: change >= 0 ? 'success.main' : 'error.main', fontWeight: 650 }}>
              {change >= 0 ? '+' : ''}
              {change}%
            </Box>{' '}
            vs previous week
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
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
      <PersonAvatar person={person} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 650 }}>
          {person.name}
          {isSelf && (
            <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
              {' '}
              (you)
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
        color: isLong ? 'error.main' : 'primary.dark',
      }}
    >
      {formatHours(seconds)}
    </Box>
  )
}

function WeekProgress({ seconds }: { seconds: number }) {
  const ratio = Math.min(seconds / WEEKLY_TARGET_SECONDS, 1)
  return (
    <Box
      role="img"
      aria-label={`${Math.round((seconds / WEEKLY_TARGET_SECONDS) * 100)}% of 40 hour week`}
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
  const { label, color } = STATUS_LABELS[status]
  return (
    <Chip
      label={label}
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

function MemberDialog({
  stats,
  user,
  isOwner,
  workspaceId,
  catalog,
  weekStart,
  today,
  now,
  position,
  onNavigate,
  onClose,
}: {
  stats: PersonStats
  user: User
  isOwner: boolean
  workspaceId: string
  catalog: Catalog
  weekStart: string
  today: string
  now: number
  position: { index: number; count: number } | null
  onNavigate: (offset: number) => void
  onClose: () => void
}) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const [tab, setTab] = useState<'timeline' | 'entries'>('timeline')
  const [editor, setEditor] = useState<EditorState>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const { person, entries } = stats
  const isSelf = person.uid === user.uid
  const canEdit = (entry: TimeEntry) => entry.endAt !== null && (isSelf || isOwner)
  const weekDays = Array.from({ length: 7 }, (_, index) => shiftDayString(weekStart, index))
    .filter((day) => day <= today || entries.some((entry) => localDayString(entry.startAt.toDate()) === day))
    .reverse()
  const daysTracked = stats.byDay.filter(Boolean).length
  const totalBreaks = weekDays.reduce(
    (total, day) => total + breakSeconds(entries.filter((entry) => localDayString(entry.startAt.toDate()) === day)),
    0,
  )

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
    if (!window.confirm(`Delete “${entry.description || 'Untitled entry'}”? This can’t be undone.`)) return
    setPending(true)
    setError('')
    setNotice('')
    try {
      await deleteTimeEntry(workspaceId, entry)
      setNotice('Time entry deleted.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not delete this entry.')
    } finally {
      setPending(false)
    }
  }

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
      <DialogTitle component="div" sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', pb: 1.5 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0, flex: 1 }}>
          <PersonAvatar person={person} size={48} />
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography id="member-dialog-title" component="h2" sx={{ fontSize: 20, fontWeight: 650 }} noWrap>
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
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          {position && position.count > 1 && (
            <>
              <IconButton
                aria-label="Previous member"
                onClick={() => onNavigate(-1)}
                disabled={position.index === 0}
                sx={navButtonSx}
              >
                ‹
              </IconButton>
              <IconButton
                aria-label="Next member"
                onClick={() => onNavigate(1)}
                disabled={position.index >= position.count - 1}
                sx={navButtonSx}
              >
                ›
              </IconButton>
              <Typography variant="body2" color="text.secondary" sx={{ px: 1, whiteSpace: 'nowrap' }}>
                {position.index + 1} of {position.count}
              </Typography>
            </>
          )}
          <IconButton aria-label="Close" onClick={onClose} sx={navButtonSx}>
            ×
          </IconButton>
        </Stack>
      </DialogTitle>
      <Tabs
        value={tab}
        onChange={(_, value: 'timeline' | 'entries') => setTab(value)}
        sx={{
          px: 3,
          borderBottom: 1,
          borderColor: 'divider',
          minHeight: 40,
          '& .MuiTab-root': { minHeight: 40, px: 0, mr: 3, minWidth: 0 },
        }}
      >
        <Tab value="timeline" label="Timeline" />
        <Tab value="entries" label={`Entries (${entries.length})`} />
      </Tabs>
      <DialogContent sx={{ pt: '20px !important' }}>
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 2, flexWrap: 'wrap' }}
        >
          <Chip
            variant="outlined"
            label={`Week of ${formatRange(weekStart)}`}
            sx={{ height: 34, borderRadius: '8px', fontWeight: 600 }}
          />
          {isSelf && (
            <Button
              variant="outlined"
              onClick={() => {
                setEditor({ day: today >= weekStart && today <= shiftDayString(weekStart, 6) ? today : weekStart })
                setNotice('')
              }}
            >
              + Add entry
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
                gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' },
                gap: 1.25,
              }}
            >
              <StatTile
                label="Tracked"
                value={formatHours(stats.total)}
                change={percentChange(stats.total, stats.previousTotal)}
              />
              <StatTile
                label="Billable"
                value={formatHours(stats.billable)}
                caption={
                  stats.total ? `${Math.round((stats.billable / stats.total) * 100)}% of tracked` : 'No tracked time'
                }
              />
              <StatTile label="Entries" value={String(entries.length)} caption={`${daysTracked} of 7 days tracked`} />
              <StatTile
                label="Longest day"
                value={formatHours(stats.longestDay)}
                caption={stats.longestDay > LONG_DAY_SECONDS ? 'Over 10 hours' : 'Within 10 hours'}
                tone={stats.longestDay > LONG_DAY_SECONDS ? 'error' : undefined}
              />
              <StatTile label="Breaks" value={formatHours(totalBreaks)} caption="Gaps between entries" />
              <StatTile
                label="Weekly target"
                value={`${Math.round((stats.total / WEEKLY_TARGET_SECONDS) * 100)}%`}
                caption="Of a 40 hour week"
              />
            </Box>
            <Stack
              direction="row"
              spacing={2.25}
              sx={{ mt: 3, mb: 1, pt: 2.5, borderTop: 1, borderColor: 'divider', flexWrap: 'wrap', rowGap: 1 }}
            >
              <LegendDot color={SEGMENT_COLORS.billable} label="Billable" />
              <LegendDot color={SEGMENT_COLORS.nonBillable} label="Non-billable" />
              <LegendDot color={SEGMENT_COLORS.gap} label="Break" />
              <LegendDot color={SEGMENT_COLORS.running} label="Running" />
            </Stack>
            {weekDays.length === 0 ? (
              <EmptyText>This week hasn’t started yet.</EmptyText>
            ) : (
              weekDays.map((day) => (
                <DayTimeline
                  key={day}
                  day={day}
                  today={today}
                  entries={entries.filter((entry) => localDayString(entry.startAt.toDate()) === day)}
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
            entries={entries}
            now={now}
            pending={pending}
            canEdit={canEdit}
            onEdit={(entry) => {
              setEditor({ entry, day: localDayString(entry.startAt.toDate()) })
              setNotice('')
            }}
            onDelete={(entry) => void handleDelete(entry)}
          />
        )}
      </DialogContent>
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

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: color }} />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  )
}

function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today'
  if (day === shiftDayString(today, -1)) return 'Yesterday'
  return dayDate(day).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
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
      aria-label={`${dayLabel(day, today)}, ${formatHours(total)} tracked`}
      sx={{ py: 2, borderBottom: 1, borderColor: 'divider', borderBottomStyle: 'dashed' }}
    >
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 1.25 }}>
        <Typography sx={{ fontWeight: 650 }}>{dayLabel(day, today)}</Typography>
        <Typography variant="body2" color="text.secondary">
          Duration:{' '}
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
            First in
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
          <Box sx={{ position: 'relative', height: 26, borderRadius: '7px', bgcolor: 'app.track', overflow: 'hidden' }}>
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
                      bgcolor: SEGMENT_COLORS.gap,
                    }}
                  />
                ) : null
              const color =
                entry.endAt === null
                  ? SEGMENT_COLORS.running
                  : entry.billable
                    ? SEGMENT_COLORS.billable
                    : SEGMENT_COLORS.nonBillable
              const editable = canEdit(entry)
              const label = `${entry.description || 'Untitled entry'}, ${formatClock(new Date(start))}–${entry.endAt ? formatClock(new Date(end)) : 'running'}, ${formatHours(entrySeconds(entry, now))}`
              return [
                gap,
                <Tooltip
                  key={entry.id}
                  title={
                    <>
                      <b>{entry.description || 'Untitled entry'}</b>
                      <br />
                      {[entry.clientName, entry.projectName, entry.taskName].filter(Boolean).join(' · ') ||
                        'No project'}
                      <br />
                      {formatClock(new Date(start))} – {entry.endAt ? formatClock(new Date(end)) : 'running'} ·{' '}
                      {formatHours(entrySeconds(entry, now))}
                    </>
                  }
                >
                  <Box
                    component="button"
                    type="button"
                    aria-label={editable ? `Edit ${label}` : label}
                    onClick={() => editable && onEdit(entry)}
                    sx={{
                      position: 'absolute',
                      top: 3,
                      bottom: 3,
                      left: `${position(start)}%`,
                      width: `max(4px, calc(${position(end) - position(start)}% - 2px))`,
                      p: 0,
                      border: 0,
                      borderRadius: '5px',
                      bgcolor: color,
                      cursor: editable ? 'pointer' : 'default',
                      transition: 'filter .15s',
                      '&:hover': { filter: 'brightness(1.1)' },
                      '&:focus-visible': {
                        outline: (theme) => `3px solid ${theme.palette.app.focus}`,
                        outlineOffset: 1,
                      },
                    }}
                  />
                </Tooltip>,
              ]
            })}
          </Box>
        </Box>
        <Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'right' }}>
          <Typography variant="caption" color="text.secondary">
            Last out
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
            {!last ? '—' : last.endAt ? formatClock(last.endAt.toDate()) : 'Running'}
          </Typography>
        </Box>
      </Box>
      {sorted.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          No time tracked
        </Typography>
      )}
    </Box>
  )
}

function EntryList({
  entries,
  now,
  pending,
  canEdit,
  onEdit,
  onDelete,
}: {
  entries: TimeEntry[]
  now: number
  pending: boolean
  canEdit: (entry: TimeEntry) => boolean
  onEdit: (entry: TimeEntry) => void
  onDelete: (entry: TimeEntry) => void
}) {
  if (entries.length === 0) return <EmptyText>No entries this week.</EmptyText>
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
                {start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatClock(start)} – {entry.endAt ? formatClock(entry.endAt.toDate()) : 'running'}
              </Typography>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                {entry.description || 'Untitled entry'}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {[entry.clientName, entry.projectName, entry.taskName].filter(Boolean).join(' · ') ||
                  'No client, project, or task'}
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
              {entry.endAt === null && <Chip label="Running" color="warning" variant="outlined" />}
              {entry.billable && <BillableChip />}
              {canEdit(entry) && (
                <>
                  <Button size="small" onClick={() => onEdit(entry)} disabled={pending}>
                    Edit
                  </Button>
                  <Button size="small" color="error" onClick={() => onDelete(entry)} disabled={pending}>
                    Delete
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

function EntryEditor({
  workspaceId,
  catalog,
  entry,
  day,
  onClose,
  onSaved,
}: {
  workspaceId: string
  catalog: Catalog
  entry?: TimeEntry
  day: string
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [description, setDescription] = useState(entry?.description ?? '')
  const [clientId, setClientId] = useState(entry?.clientId ?? '')
  const [projectId, setProjectId] = useState(entry?.projectId ?? '')
  const [taskId, setTaskId] = useState(entry?.taskId ?? '')
  const [billable, setBillable] = useState(entry?.billable ?? false)
  const [startAt, setStartAt] = useState(entry ? localDateTimeValue(entry.startAt.toDate()) : `${day}T09:00`)
  const [endAt, setEndAt] = useState(entry?.endAt ? localDateTimeValue(entry.endAt.toDate()) : `${day}T10:00`)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const { fieldProps, showFieldError, clearFieldError, clearFieldErrors } = useManualEntryFieldErrors()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    clearFieldErrors()
    try {
      await saveManualTimeEntry(
        workspaceId,
        {
          description,
          clientId: clientId || null,
          projectId: projectId || null,
          taskId: taskId || null,
          billable,
          startAt: new Date(startAt),
          endAt: new Date(endAt),
        },
        entry?.id,
      )
      onSaved(entry ? 'Time entry updated.' : 'Time entry added.')
    } catch (requestError) {
      if (!showFieldError(requestError)) {
        setError(requestError instanceof Error ? requestError.message : 'Could not save this entry.')
      }
      setPending(false)
    }
  }

  const activeClient = (id: string | null) =>
    !id || catalog.clients.some((client) => client.id === id && !client.archived)
  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="entry-editor-title"
      slotProps={{ paper: { sx: { borderRadius: '16px' } } }}
    >
      <Box component="form" onSubmit={handleSubmit} aria-busy={pending}>
        <DialogTitle id="entry-editor-title" sx={{ fontWeight: 650 }}>
          {entry ? 'Edit time entry' : 'Add time entry'}
        </DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
          {error && <FormMessage severity="error">{error}</FormMessage>}
          <TextField
            label="Description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value)
              clearFieldError('description')
            }}
            required
            autoFocus
            {...fieldProps('description')}
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            <TextField
              label="Start"
              type="datetime-local"
              value={startAt}
              onChange={(event) => {
                setStartAt(event.target.value)
                clearFieldError('startAt')
                clearFieldError('endAt')
              }}
              required
              {...fieldProps('startAt')}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="End"
              type="datetime-local"
              value={endAt}
              onChange={(event) => {
                setEndAt(event.target.value)
                clearFieldError('endAt')
              }}
              required
              {...fieldProps('endAt')}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
            <SelectField
              label="Client"
              value={clientId}
              onChange={(event) => {
                setClientId(event.target.value)
                setProjectId('')
                setTaskId('')
              }}
            >
              <option value="">No client</option>
              {catalog.clients
                .filter((item) => !item.archived || item.id === clientId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.archived ? ' (archived)' : ''}
                  </option>
                ))}
            </SelectField>
            <SelectField
              label="Project"
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value)
                setTaskId('')
              }}
            >
              <option value="">No project</option>
              {catalog.projects
                .filter(
                  (item) =>
                    item.id === projectId ||
                    (!item.archived && (!clientId || item.clientId === clientId) && activeClient(item.clientId)),
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.archived ? ' (archived)' : ''}
                  </option>
                ))}
            </SelectField>
            <SelectField label="Task" value={taskId} onChange={(event) => setTaskId(event.target.value)}>
              <option value="">No task</option>
              {catalog.tasks
                .filter(
                  (item) =>
                    item.id === taskId ||
                    (!item.archived &&
                      (!projectId || item.projectId === projectId) &&
                      catalog.projects.some(
                        (project) =>
                          project.id === item.projectId && !project.archived && activeClient(project.clientId),
                      )),
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.archived ? ' (archived)' : ''}
                  </option>
                ))}
            </SelectField>
          </Box>
          <FormControlLabel
            control={<Checkbox checked={billable} onChange={(event) => setBillable(event.target.checked)} />}
            label="Billable"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="contained" type="submit" disabled={pending}>
            {pending ? 'Saving…' : entry ? 'Save changes' : 'Add entry'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
