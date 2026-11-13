import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from './i18n'
import { progressTimeZone, zonedDayString } from './lib/budgetProgress'
import { readableError } from './lib/errors'
import {
  type LeaveAllowance,
  type LeaveRequest,
  type LeaveType,
  canCancelLeave,
  memberLeaveBalance,
  mergeLeaveTypes,
  sortLeaveRequests,
} from './lib/leave'
import {
  cancelLeaveRequest,
  subscribeToLeaveAllowances,
  subscribeToLeaveRequests,
  subscribeToLeaveTypes,
} from './lib/timeOff'
import { LeaveRequestDialog } from './LeaveRequestDialog'
import { BalanceSummary, LeaveStatusChip, LeaveTypeLabel, OverAllowanceChip } from './TimeOffParts'
import { useFormatDays, useFormatLeaveRange } from './useLeaveFormat'
import { EmptyText, FormMessage, ListRow, LoadingState, SectionCard, SectionHeading } from './ui'

/** A member's own time off: balances per type for a year, their requests, and the request form. */
export function TimeOffPanel({
  workspaceId,
  userId,
  memberTimeZone,
}: {
  workspaceId: string
  userId: string
  memberTimeZone: string | undefined
}) {
  const { t } = useTranslation()
  // Read once: the page is reopened far more often than it stays open across midnight.
  const [openedAt] = useState(() => Date.now())
  const today = zonedDayString(openedAt, progressTimeZone(memberTimeZone))
  const [year, setYear] = useState(() => Number(today.slice(0, 4)))
  const [storedTypes, setStoredTypes] = useState<LeaveType[] | undefined>()
  const [requests, setRequests] = useState<LeaveRequest[] | undefined>()
  const [allowances, setAllowances] = useState<LeaveAllowance[] | undefined>()
  const [requesting, setRequesting] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(
    () => subscribeToLeaveTypes(workspaceId, setStoredTypes, (issue) => setError(readableError(issue))),
    [workspaceId],
  )
  useEffect(
    () =>
      subscribeToLeaveRequests(workspaceId, { uid: userId }, setRequests, (issue) => setError(readableError(issue))),
    [workspaceId, userId],
  )
  // A member has a handful of allowance documents, so all years are read and the form can check any year.
  useEffect(
    () =>
      subscribeToLeaveAllowances(workspaceId, { uid: userId }, setAllowances, (issue) =>
        setError(readableError(issue)),
      ),
    [workspaceId, userId],
  )

  const types = mergeLeaveTypes(storedTypes ?? [])
  const activeTypes = types.filter((type) => !type.archived)
  const yearRequests = sortLeaveRequests((requests ?? []).filter((request) => request.year === year))
  const loading = storedTypes === undefined || requests === undefined || allowances === undefined
  const typeById = new Map(types.map((type) => [type.id, type]))
  const allowanceFor = (typeId: string, forYear: number) =>
    (allowances ?? []).find((item) => item.typeId === typeId && item.year === forYear)
  // Types with history this year stay listed after they are archived, so past balances still add up.
  const balanceTypes = types.filter(
    (type) => !type.archived || yearRequests.some((request) => request.typeId === type.id),
  )

  async function handleCancel(request: LeaveRequest) {
    if (!window.confirm(t('timeOff.mine.cancelConfirm'))) return
    setCancelling(request.id)
    setError('')
    setNotice('')
    try {
      await cancelLeaveRequest(workspaceId, request.id)
      setNotice(t('timeOff.mine.cancelled'))
    } catch (cancelError) {
      setError(readableError(cancelError))
    } finally {
      setCancelling(null)
    }
  }

  return (
    <SectionCard labelledBy="time-off-heading" sx={{ maxWidth: 900 }}>
      <SectionHeading
        id="time-off-heading"
        kicker={t('timeOff.mine.kicker')}
        title={t('timeOff.mine.title')}
        action={
          <Button
            variant="contained"
            onClick={() => setRequesting(true)}
            disabled={loading || activeTypes.length === 0}
          >
            {t('timeOff.mine.request')}
          </Button>
        }
      />
      <YearSwitcher year={year} onChange={setYear} />
      {error && <FormMessage severity="error">{error}</FormMessage>}
      {notice && <FormMessage severity="success">{notice}</FormMessage>}
      {loading ? (
        <LoadingState label={t('timeOff.loading')} sx={{ py: 6 }} />
      ) : (
        <>
          <Box
            component="ul"
            aria-label={t('timeOff.mine.balancesLabel', { year })}
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(200px, 1fr))' },
              gap: 1.5,
              listStyle: 'none',
              p: 0,
              my: 2,
            }}
          >
            {balanceTypes.map((type) => (
              <Paper component="li" key={type.id} variant="outlined" sx={{ p: 2, borderRadius: '14px' }}>
                <LeaveTypeLabel type={type} />
                <Box sx={{ mt: 1 }}>
                  <BalanceSummary
                    balance={memberLeaveBalance(type, allowanceFor(type.id, year), yearRequests, userId, year)}
                  />
                </Box>
              </Paper>
            ))}
          </Box>
          <Typography variant="h3" component="h3" sx={{ fontSize: '1.05rem', fontWeight: 700, mt: 3, mb: 0.5 }}>
            {t('timeOff.mine.requestsHeading', { year })}
          </Typography>
          {yearRequests.length === 0 ? (
            <EmptyText>{t('timeOff.mine.empty')}</EmptyText>
          ) : (
            yearRequests.map((request) => (
              <LeaveRequestRow
                key={request.id}
                request={request}
                type={typeById.get(request.typeId)}
                action={
                  canCancelLeave(request, { uid: userId, role: 'member' }, today) && (
                    <Button
                      size="small"
                      color="inherit"
                      onClick={() => void handleCancel(request)}
                      disabled={cancelling !== null}
                    >
                      {cancelling === request.id ? t('timeOff.mine.cancelling') : t('timeOff.mine.cancel')}
                    </Button>
                  )
                }
              />
            ))
          )}
        </>
      )}
      {requesting && (
        <LeaveRequestDialog
          workspaceId={workspaceId}
          userId={userId}
          types={activeTypes}
          allowancesFor={allowanceFor}
          ownRequests={requests ?? []}
          today={today}
          onClose={() => setRequesting(false)}
          onSubmitted={(status) => {
            setRequesting(false)
            setError('')
            setNotice(status === 'approved' ? t('timeOff.mine.submittedApproved') : t('timeOff.mine.submittedPending'))
          }}
        />
      )}
    </SectionCard>
  )
}

export function YearSwitcher({ year, onChange }: { year: number; onChange: (year: number) => void }) {
  const { t } = useTranslation()
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, mt: 1.5 }}>
      <IconButton size="small" onClick={() => onChange(year - 1)} aria-label={t('timeOff.previousYear')}>
        ‹
      </IconButton>
      <Typography component="p" aria-live="polite" sx={{ fontWeight: 700, minWidth: 48, textAlign: 'center' }}>
        {year}
      </Typography>
      <IconButton size="small" onClick={() => onChange(year + 1)} aria-label={t('timeOff.nextYear')}>
        ›
      </IconButton>
    </Stack>
  )
}

/** One request with its type, dates, days, status, over-allowance mark, and decision. */
export function LeaveRequestRow({
  request,
  type,
  showMember = false,
  action,
  details,
}: {
  request: LeaveRequest
  type: LeaveType | undefined
  showMember?: boolean
  action?: ReactNode
  /** Extra lines under the request, such as the balance after approval. */
  details?: ReactNode
}) {
  const { t } = useTranslation()
  const formatDays = useFormatDays()
  const formatRange = useFormatLeaveRange()
  return (
    <ListRow sx={{ alignItems: 'flex-start', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        {showMember && (
          <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
            {request.userDisplayName}
          </Typography>
        )}
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <LeaveTypeLabel type={type} />
          <Typography variant="body2" color="text.secondary">
            {formatRange(request)} · {formatDays(request.days)}
          </Typography>
        </Stack>
        {request.note && (
          <Typography variant="body2" sx={{ mt: 0.5, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
            {request.note}
          </Typography>
        )}
        {details}
        {request.autoApproved && (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
            {request.autoApprovedReason === 'no-approver'
              ? t('timeOff.autoApproved.noApprover')
              : t('timeOff.autoApproved.type')}
          </Typography>
        )}
        {request.decisionNote && (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
            {t('timeOff.decisionNote', { note: request.decisionNote })}
          </Typography>
        )}
      </Box>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {request.overAllowance && <OverAllowanceChip days={request.overAllowanceDays} />}
        <LeaveStatusChip status={request.status} />
        {action}
      </Stack>
    </ListRow>
  )
}
