import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableFooter from '@mui/material/TableFooter'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import type { TFunction } from 'i18next'
import { useEffect, useState } from 'react'
import { useAppLanguage, useTranslation } from './i18n'
import { progressTimeZone, zonedDayString } from './lib/budgetProgress'
import { readableError } from './lib/errors'
import { type LeaveRequest, type LeaveType, mergeLeaveTypes } from './lib/leave'
import {
  type CalendarLeave,
  type CalendarMember,
  type TeamCalendarFilters,
  isWeekendDay,
  monthDays,
  teamCalendar,
} from './lib/leaveCalendar'
import { subscribeToLeaveRequests, subscribeToLeaveTypes } from './lib/timeOff'
import { type WorkspaceMember, subscribeToWorkspaceMembers } from './lib/workspaces'
import { LeaveRequestRow } from './TimeOffPanel'
import { LeaveTypeLabel } from './TimeOffParts'
import { leaveTypeName } from './useLeaveFormat'
import { EmptyText, FormMessage, LoadingState, SectionCard, SectionHeading, SelectField } from './ui'

const NAME_COLUMN_WIDTH = 132
const DAY_COLUMN_WIDTH = 24

type Month = { year: number; month: number }

function shiftMonth({ year, month }: Month, by: number): Month {
  const index = year * 12 + (month - 1) + by
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

function memberName(member: WorkspaceMember): string {
  return member.displayName || member.email
}

/**
 * Owners and managers see everyone's approved and pending leave for a month, one row per member and one column per
 * day, so overlaps stand out before a request is approved. Small screens get the same leave as a list.
 */
export function TeamTimeOffPanel({
  workspaceId,
  memberTimeZone,
  pendingCount,
  onOpenApprovals,
}: {
  workspaceId: string
  memberTimeZone: string | undefined
  /** Requests waiting for the viewer's decision. */
  pendingCount: number
  onOpenApprovals: () => void
}) {
  const { t } = useTranslation()
  const language = useAppLanguage()
  // Read once: the page is reopened far more often than it stays open across midnight.
  const [openedAt] = useState(() => Date.now())
  const today = zonedDayString(openedAt, progressTimeZone(memberTimeZone))
  const [month, setMonth] = useState<Month>(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }))
  const [filters, setFilters] = useState<TeamCalendarFilters>({ uid: '', typeId: '' })
  const [storedTypes, setStoredTypes] = useState<LeaveType[] | undefined>()
  const [members, setMembers] = useState<WorkspaceMember[] | undefined>()
  // Tagged with the year they were read for, so a month in another year never shows the previous year's leave.
  const [loaded, setLoaded] = useState<{ year: number; requests: LeaveRequest[] } | undefined>()
  const [error, setError] = useState('')

  useEffect(() => {
    const handleError = (issue: Error) => setError(readableError(issue))
    const stopTypes = subscribeToLeaveTypes(workspaceId, setStoredTypes, handleError)
    const stopMembers = subscribeToWorkspaceMembers(workspaceId, setMembers, handleError)
    return () => {
      stopTypes()
      stopMembers()
    }
  }, [workspaceId])

  // A request never crosses a year, so the month's year holds all of its leave.
  const { year } = month
  useEffect(
    () =>
      subscribeToLeaveRequests(
        workspaceId,
        { years: [year] },
        (requests) => setLoaded({ year, requests }),
        (issue) => setError(readableError(issue)),
      ),
    [workspaceId, year],
  )

  const types = mergeLeaveTypes(storedTypes ?? [])
  const typeById = new Map(types.map((type) => [type.id, type]))
  const days = monthDays(month.year, month.month)
  const calendarMembers: CalendarMember[] = (members ?? []).map((member) => ({
    uid: member.uid,
    name: memberName(member),
    removed: member.status === 'removed',
  }))
  const requests = loaded?.year === year ? loaded.requests : undefined
  const calendar = teamCalendar(requests ?? [], calendarMembers, days, filters)
  const loading = storedTypes === undefined || members === undefined || requests === undefined

  const monthLabel = new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(month.year, month.month - 1, 1)),
  )
  const weekdayFormat = new Intl.DateTimeFormat(language, { weekday: 'narrow', timeZone: 'UTC' })
  const weekdayLongFormat = new Intl.DateTimeFormat(language, { weekday: 'long', timeZone: 'UTC' })
  const dateFormat = new Intl.DateTimeFormat(language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
  const dayDate = (day: string) => new Date(`${day}T00:00:00Z`)
  const shownTypes = types.filter(
    (type) => !type.archived || calendar.requests.some((request) => request.typeId === type.id),
  )
  const memberOptions = calendarMembers.filter((member) => !member.removed).sort((a, b) => a.name.localeCompare(b.name))
  const rowName = (member: CalendarMember) =>
    member.removed ? t('timeOff.team.removed', { name: member.name }) : member.name

  return (
    <SectionCard labelledBy="team-time-off-heading" sx={{ maxWidth: 1240 }}>
      <SectionHeading
        id="team-time-off-heading"
        kicker={t('timeOff.team.kicker')}
        title={t('timeOff.team.title')}
        action={
          pendingCount > 0 && (
            <Button variant="outlined" color="warning" onClick={onOpenApprovals}>
              {t('timeOff.team.pendingButton', { count: pendingCount })}
            </Button>
          )
        }
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.6 }}>
        {t('timeOff.team.intro')}
      </Typography>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ gap: 1.5, mt: 2, alignItems: { xs: 'stretch', sm: 'center' }, flexWrap: 'wrap' }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
          <IconButton
            size="small"
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label={t('timeOff.team.previousMonth')}
          >
            ‹
          </IconButton>
          <Typography
            component="p"
            aria-live="polite"
            sx={{ fontWeight: 700, minWidth: 150, textAlign: 'center', textTransform: 'capitalize' }}
          >
            {monthLabel}
          </Typography>
          <IconButton
            size="small"
            onClick={() => setMonth(shiftMonth(month, 1))}
            aria-label={t('timeOff.team.nextMonth')}
          >
            ›
          </IconButton>
        </Stack>
        <SelectField
          label={t('timeOff.team.memberFilter')}
          value={filters.uid}
          onChange={(event) => setFilters({ ...filters, uid: event.target.value })}
          fullWidth={false}
          sx={{ minWidth: 180 }}
        >
          <option value="">{t('timeOff.team.allMembers')}</option>
          {memberOptions.map((member) => (
            <option key={member.uid} value={member.uid}>
              {member.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('timeOff.team.typeFilter')}
          value={filters.typeId}
          onChange={(event) => setFilters({ ...filters, typeId: event.target.value })}
          fullWidth={false}
          sx={{ minWidth: 180 }}
        >
          <option value="">{t('timeOff.team.allTypes')}</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {leaveTypeName(type, t)}
            </option>
          ))}
        </SelectField>
      </Stack>

      {error && <FormMessage severity="error">{error}</FormMessage>}

      {loading && !error ? (
        <LoadingState label={t('timeOff.team.loading')} sx={{ py: 6 }} />
      ) : (
        <>
          <Legend types={shownTypes} />
          {calendar.requests.length === 0 && <EmptyText>{t('timeOff.team.empty', { month: monthLabel })}</EmptyText>}

          <TableContainer
            sx={{
              display: { xs: 'none', md: 'block' },
              mt: 2,
              border: 1,
              borderColor: 'divider',
              borderRadius: '12px',
              overflowX: 'auto',
            }}
          >
            <Table
              size="small"
              aria-label={t('timeOff.team.tableLabel', { month: monthLabel })}
              sx={{
                tableLayout: 'fixed',
                minWidth: NAME_COLUMN_WIDTH + days.length * DAY_COLUMN_WIDTH,
                '& td, & th': { borderColor: 'divider' },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell component="th" scope="col" sx={nameCellSx}>
                    {t('timeOff.team.memberColumn')}
                  </TableCell>
                  {days.map((day) => (
                    <TableCell
                      key={day}
                      component="th"
                      scope="col"
                      align="center"
                      aria-current={day === today ? 'date' : undefined}
                      sx={{
                        ...dayCellSx(day, today),
                        fontSize: 12,
                        lineHeight: 1.3,
                        color: day === today ? 'primary.main' : 'text.secondary',
                        fontWeight: day === today ? 800 : 600,
                      }}
                    >
                      <abbr title={weekdayLongFormat.format(dayDate(day))} style={{ textDecoration: 'none' }}>
                        {weekdayFormat.format(dayDate(day))}
                      </abbr>
                      <br />
                      {Number(day.slice(8))}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {calendar.rows.map((row) => (
                  <TableRow key={row.member.uid}>
                    <TableCell component="th" scope="row" sx={{ ...nameCellSx, fontWeight: 600 }}>
                      <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rowName(row.member)}
                      </Box>
                    </TableCell>
                    {row.cells.map((leave, index) => (
                      <TableCell key={days[index]} sx={{ ...dayCellSx(days[index], today), p: 0.25 }}>
                        {leave.length > 0 && (
                          <LeaveCell
                            leave={leave}
                            label={cellLabel(
                              t,
                              rowName(row.member),
                              dateFormat.format(dayDate(days[index])),
                              leave,
                              typeById,
                            )}
                            color={typeById.get(leave[0].request.typeId)?.color}
                          />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell component="th" scope="row" sx={{ ...nameCellSx, fontWeight: 700, color: 'text.primary' }}>
                    {t('timeOff.team.onLeaveRow')}
                  </TableCell>
                  {calendar.onLeave.map((count, index) => (
                    <TableCell
                      key={days[index]}
                      align="center"
                      sx={{
                        ...dayCellSx(days[index], today),
                        fontSize: 12,
                        fontWeight: count > 1 ? 800 : 500,
                        color: count > 1 ? 'warning.main' : count === 1 ? 'text.primary' : 'text.disabled',
                      }}
                    >
                      {count > 0 ? count : '·'}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            </Table>
          </TableContainer>

          <Box sx={{ display: { xs: 'block', md: 'none' }, mt: 1 }}>
            {calendar.requests.map((request) => (
              <LeaveRequestRow key={request.id} request={request} type={typeById.get(request.typeId)} showMember />
            ))}
          </Box>
        </>
      )}
    </SectionCard>
  )
}

const nameCellSx = {
  width: NAME_COLUMN_WIDTH,
  position: 'sticky',
  left: 0,
  zIndex: 1,
  bgcolor: 'background.paper',
  borderRight: 1,
  py: 1,
} as const

function dayCellSx(day: string, today: string) {
  return {
    width: DAY_COLUMN_WIDTH,
    px: 0.25,
    py: 0.5,
    bgcolor: day === today ? 'action.selected' : isWeekendDay(day) ? 'action.hover' : undefined,
  }
}

function cellLabel(
  t: TFunction,
  name: string,
  date: string,
  leave: CalendarLeave[],
  typeById: Map<string, LeaveType>,
): string {
  const parts = leave.map(({ request, fraction }) =>
    t('timeOff.team.cellPart', {
      type: leaveTypeName(typeById.get(request.typeId), t),
      status: t(`timeOff.status.${request.status}`),
      half: fraction < 1 ? ` (${t('timeOff.halfDayShort')})` : '',
    }),
  )
  return t('timeOff.team.cellLabel', { name, date, leave: parts.join('; ') })
}

/** One member's day: filled for approved leave, hatched for pending, half filled for a half day. */
function LeaveCell({ leave, label, color }: { leave: CalendarLeave[]; label: string; color: string | undefined }) {
  const [first] = leave
  const fill = color ?? '#888888'
  const pending = first.request.status === 'pending'
  const half = leave.every((item) => item.fraction < 1) && leave.length === 1
  const background = pending
    ? `repeating-linear-gradient(135deg, ${fill}66 0 3px, transparent 3px 6px)`
    : half
      ? `linear-gradient(to right, ${fill} 50%, ${fill}33 50%)`
      : fill
  return (
    <Box
      role="img"
      aria-label={label}
      title={label}
      sx={{
        height: 22,
        borderRadius: '5px',
        background,
        border: pending ? `1.5px dashed ${fill}` : `1.5px solid ${fill}`,
      }}
    />
  )
}

function Legend({ types }: { types: LeaveType[] }) {
  const { t } = useTranslation()
  const sample = '#7a7a7a'
  const swatch = (background: string, border: string) => (
    <Box component="span" aria-hidden sx={{ width: 22, height: 14, borderRadius: '4px', background, border }} />
  )
  return (
    <Stack
      component="ul"
      aria-label={t('timeOff.team.legendLabel')}
      direction="row"
      sx={{ gap: 2, flexWrap: 'wrap', listStyle: 'none', p: 0, m: 0, mt: 2, alignItems: 'center' }}
    >
      {types.map((type) => (
        <li key={type.id}>
          <LeaveTypeLabel type={type} />
        </li>
      ))}
      <Stack component="li" direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
        {swatch(`linear-gradient(to right, ${sample} 50%, ${sample}33 50%)`, `1.5px solid ${sample}`)}
        <Typography variant="body2">{t('timeOff.team.legendHalf')}</Typography>
      </Stack>
      <Stack component="li" direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
        {swatch(`repeating-linear-gradient(135deg, ${sample}66 0 3px, transparent 3px 6px)`, `1.5px dashed ${sample}`)}
        <Typography variant="body2">{t('timeOff.team.legendPending')}</Typography>
      </Stack>
    </Stack>
  )
}
