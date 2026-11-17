import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { type FormEvent, useEffect, useState } from 'react'
import { useTranslation } from './i18n'
import { progressTimeZone, zonedDayString } from './lib/budgetProgress'
import { readableError } from './lib/errors'
import {
  type LeaveAllowance,
  type LeaveRequest,
  type LeaveType,
  canDecideLeave,
  memberLeaveBalance,
  mergeLeaveTypes,
} from './lib/leave'
import {
  cancelLeaveRequest,
  decideLeaveRequest,
  subscribeToLeaveAllowances,
  subscribeToLeaveRequests,
  subscribeToLeaveTypes,
} from './lib/timeOff'
import { type WorkspaceMember, type WorkspaceRole, subscribeToWorkspaceMembers } from './lib/workspaces'
import { LeaveAllowanceDialog } from './LeaveAllowanceDialog'
import { LeaveRequestRow, YearSwitcher } from './TimeOffPanel'
import { leaveTypeName, useFormatDays } from './useLeaveFormat'
import { EmptyText, FormMessage, ListRow, LoadingState, SectionCard, SectionHeading } from './ui'

function displayName(member: WorkspaceMember): string {
  return member.displayName?.trim() || member.email || member.uid
}

type Decision = { request: LeaveRequest; decision: 'approve' | 'reject' }

/** Owners and managers: pending requests to decide, and every member's balances and allowances for a year. */
export function TimeOffApprovalsPanel({
  workspaceId,
  userId,
  role,
  memberTimeZone,
}: {
  workspaceId: string
  userId: string
  role: WorkspaceRole
  /** The viewer's time zone snapshot, for which year is "this year". */
  memberTimeZone: string | undefined
}) {
  const { t } = useTranslation()
  const formatDays = useFormatDays()
  const [year, setYear] = useState(() =>
    Number(zonedDayString(Date.now(), progressTimeZone(memberTimeZone)).slice(0, 4)),
  )
  const [storedTypes, setStoredTypes] = useState<LeaveType[] | undefined>()
  const [members, setMembers] = useState<WorkspaceMember[] | undefined>()
  const [pendingRequests, setPendingRequests] = useState<LeaveRequest[] | undefined>()
  // Tagged with the years they were read for, so data for other years never shows as this year's.
  const [requestsFor, setRequestsFor] = useState<{ key: string; items: LeaveRequest[] } | undefined>()
  const [allowancesFor, setAllowancesFor] = useState<{ key: string; items: LeaveAllowance[] } | undefined>()
  const [deciding, setDeciding] = useState<Decision | null>(null)
  const [editing, setEditing] = useState<{ uid: string; name: string } | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(
    () => subscribeToLeaveTypes(workspaceId, setStoredTypes, (issue) => setError(readableError(issue))),
    [workspaceId],
  )
  useEffect(
    () => subscribeToWorkspaceMembers(workspaceId, setMembers, (issue) => setError(readableError(issue))),
    [workspaceId],
  )
  useEffect(
    () =>
      subscribeToLeaveRequests(workspaceId, { status: 'pending' }, setPendingRequests, (issue) =>
        setError(readableError(issue)),
      ),
    [workspaceId],
  )

  // Balances are needed for the shown year and for every year a pending request falls in.
  const years = [...new Set([year, ...(pendingRequests ?? []).map((request) => request.year)])]
    .sort((a, b) => a - b)
    .slice(0, 30)
  const yearsKey = years.join(',')
  useEffect(() => {
    const forYears = yearsKey.split(',').map(Number)
    const onError = (issue: Error) => setError(readableError(issue))
    const stopRequests = subscribeToLeaveRequests(
      workspaceId,
      { years: forYears },
      (items) => setRequestsFor({ key: yearsKey, items }),
      onError,
    )
    const stopAllowances = subscribeToLeaveAllowances(
      workspaceId,
      { years: forYears },
      (items) => setAllowancesFor({ key: yearsKey, items }),
      onError,
    )
    return () => {
      stopRequests()
      stopAllowances()
    }
  }, [workspaceId, yearsKey])
  const requests = requestsFor?.key === yearsKey ? requestsFor.items : undefined
  const allowances = allowancesFor?.key === yearsKey ? allowancesFor.items : undefined

  const types = mergeLeaveTypes(storedTypes ?? [])
  const typeById = new Map(types.map((type) => [type.id, type]))
  const activeMembers = (members ?? [])
    .filter((member) => member.status !== 'removed')
    .sort((a, b) => displayName(a).localeCompare(displayName(b)))
  const memberNames = new Map((members ?? []).map((member) => [member.uid, displayName(member)]))
  const me = { uid: userId, role }
  const loading =
    storedTypes === undefined ||
    members === undefined ||
    pendingRequests === undefined ||
    requests === undefined ||
    allowances === undefined
  const pending = [...(pendingRequests ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const yearRequests = (requests ?? []).filter((request) => request.year === year)
  const yearAllowances = (allowances ?? []).filter((allowance) => allowance.year === year)
  const shownTypes = types.filter(
    (type) => !type.archived || yearRequests.some((request) => request.typeId === type.id),
  )

  const approved = yearRequests
    .filter((request) => request.status === 'approved')
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  async function handleCancel(request: LeaveRequest) {
    if (!window.confirm(t('timeOff.approvals.cancelConfirm', { name: request.userDisplayName }))) return
    setCancelling(request.id)
    setError('')
    setNotice('')
    try {
      await cancelLeaveRequest(workspaceId, request.id)
      setNotice(t('timeOff.approvals.cancelled', { name: request.userDisplayName }))
    } catch (cancelError) {
      setError(readableError(cancelError))
    } finally {
      setCancelling(null)
    }
  }

  function balanceAfterApproval(request: LeaveRequest): number | null {
    const type = typeById.get(request.typeId)
    if (!type) return null
    const allowance = (allowances ?? []).find(
      (item) => item.uid === request.uid && item.typeId === request.typeId && item.year === request.year,
    )
    const balance = memberLeaveBalance(type, allowance, requests ?? [], request.uid, request.year)
    return balance.availableDays === null ? null : balance.availableDays - request.days
  }

  return (
    <>
      <SectionCard labelledBy="time-off-approvals-heading" sx={{ maxWidth: 900 }}>
        <SectionHeading
          id="time-off-approvals-heading"
          level={1}
          kicker={t('timeOff.approvals.kicker')}
          title={t('timeOff.approvals.title')}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.6 }}>
          {t('timeOff.approvals.intro')}
        </Typography>
        {error && <FormMessage severity="error">{error}</FormMessage>}
        {notice && <FormMessage severity="success">{notice}</FormMessage>}
        {loading ? (
          <LoadingState label={t('timeOff.loading')} sx={{ py: 6 }} />
        ) : pending.length === 0 ? (
          <EmptyText>{t('timeOff.approvals.empty')}</EmptyText>
        ) : (
          <Box sx={{ mt: 1 }}>
            {pending.map((request) => {
              const after = balanceAfterApproval(request)
              const canDecide = canDecideLeave(me, request.uid)
              return (
                <LeaveRequestRow
                  key={request.id}
                  request={request}
                  type={typeById.get(request.typeId)}
                  showMember
                  details={
                    <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
                      {after === null
                        ? t('timeOff.approvals.balanceAfterUnlimited')
                        : t('timeOff.approvals.balanceAfter', { days: formatDays(after) })}
                    </Typography>
                  }
                  action={
                    canDecide ? (
                      <Stack direction="row" sx={{ gap: 1 }}>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => setDeciding({ request, decision: 'approve' })}
                        >
                          {t('timeOff.approvals.approve')}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          onClick={() => setDeciding({ request, decision: 'reject' })}
                        >
                          {t('timeOff.approvals.reject')}
                        </Button>
                      </Stack>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        {t('timeOff.approvals.ownRequest')}
                      </Typography>
                    )
                  }
                />
              )
            })}
          </Box>
        )}
      </SectionCard>

      <SectionCard labelledBy="time-off-balances-heading" sx={{ maxWidth: 900 }}>
        <SectionHeading
          id="time-off-balances-heading"
          kicker={t('timeOff.balances.kicker')}
          title={t('timeOff.balances.title')}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.6 }}>
          {t('timeOff.balances.intro')}
        </Typography>
        <YearSwitcher year={year} onChange={setYear} />
        {loading ? (
          <LoadingState label={t('timeOff.loading')} sx={{ py: 6 }} />
        ) : (
          activeMembers.map((member) => {
            const name = displayName(member)
            const isSelf = member.uid === userId
            const canEdit = role === 'owner' || !isSelf
            return (
              <ListRow key={member.uid} sx={{ alignItems: 'flex-start', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                    {name}
                  </Typography>
                  <Box
                    component="ul"
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      columnGap: 2.5,
                      rowGap: 0.5,
                      listStyle: 'none',
                      m: 0,
                      p: 0,
                    }}
                  >
                    {shownTypes.map((type) => {
                      const allowance = yearAllowances.find(
                        (item) => item.uid === member.uid && item.typeId === type.id,
                      )
                      const balance = memberLeaveBalance(type, allowance, yearRequests, member.uid, year)
                      return (
                        <Typography component="li" variant="caption" color="text.secondary" key={type.id}>
                          {balance.availableDays === null
                            ? t('timeOff.balances.cellUnlimited', {
                                type: leaveTypeName(type, t),
                                taken: formatDays(balance.approvedDays),
                                pending: formatDays(balance.pendingDays),
                              })
                            : t('timeOff.balances.cell', {
                                type: leaveTypeName(type, t),
                                available: formatDays(balance.availableDays),
                                pending: formatDays(balance.pendingDays),
                              })}
                        </Typography>
                      )
                    })}
                  </Box>
                </Box>
                {canEdit ? (
                  <Button size="small" variant="outlined" onClick={() => setEditing({ uid: member.uid, name })}>
                    {t('timeOff.balances.edit')}
                  </Button>
                ) : (
                  <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 200 }}>
                    {t('timeOff.balances.ownAllowance')}
                  </Typography>
                )}
              </ListRow>
            )
          })
        )}
      </SectionCard>

      <SectionCard labelledBy="time-off-approved-heading" sx={{ maxWidth: 900 }}>
        <SectionHeading
          id="time-off-approved-heading"
          kicker={t('timeOff.approved.kicker')}
          title={t('timeOff.approved.title', { year })}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.6 }}>
          {t('timeOff.approved.intro')}
        </Typography>
        {loading ? (
          <LoadingState label={t('timeOff.loading')} sx={{ py: 6 }} />
        ) : approved.length === 0 ? (
          <EmptyText>{t('timeOff.approved.empty')}</EmptyText>
        ) : (
          approved.map((request) => (
            <LeaveRequestRow
              key={request.id}
              request={request}
              type={typeById.get(request.typeId)}
              showMember
              action={
                canDecideLeave(me, request.uid) && (
                  <Button
                    size="small"
                    color="inherit"
                    onClick={() => void handleCancel(request)}
                    disabled={cancelling !== null}
                  >
                    {cancelling === request.id ? t('timeOff.mine.cancelling') : t('timeOff.approved.cancel')}
                  </Button>
                )
              }
            />
          ))
        )}
      </SectionCard>

      {deciding && (
        <DecisionDialog
          decision={deciding}
          typeName={leaveTypeName(typeById.get(deciding.request.typeId), t)}
          onClose={() => setDeciding(null)}
          onDecide={async (note) => {
            await decideLeaveRequest(workspaceId, deciding.request.id, deciding.decision, note)
            setDeciding(null)
            setError('')
            setNotice(
              deciding.decision === 'approve'
                ? t('timeOff.approvals.approved', { name: deciding.request.userDisplayName })
                : t('timeOff.approvals.rejected', { name: deciding.request.userDisplayName }),
            )
          }}
        />
      )}
      {editing && (
        <LeaveAllowanceDialog
          workspaceId={workspaceId}
          member={editing}
          types={shownTypes}
          year={year}
          allowances={yearAllowances}
          requests={yearRequests}
          memberNames={memberNames}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function DecisionDialog({
  decision,
  typeName,
  onClose,
  onDecide,
}: {
  decision: Decision
  typeName: string
  onClose: () => void
  onDecide: (note: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const formatDays = useFormatDays()
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const approving = decision.decision === 'approve'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError('')
    try {
      await onDecide(note.trim())
    } catch (decideError) {
      setError(readableError(decideError))
      setPending(false)
    }
  }

  return (
    <Dialog
      open
      onClose={pending ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="leave-decision-title"
      slotProps={{ paper: { sx: { borderRadius: '16px' } } }}
    >
      <Box component="form" onSubmit={handleSubmit} aria-busy={pending}>
        <DialogTitle id="leave-decision-title" sx={{ fontWeight: 650 }}>
          {approving ? t('timeOff.approvals.approveTitle') : t('timeOff.approvals.rejectTitle')}
        </DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
          {error && <FormMessage severity="error">{error}</FormMessage>}
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
            {t('timeOff.approvals.decisionSummary', {
              name: decision.request.userDisplayName,
              type: typeName,
              days: formatDays(decision.request.days),
            })}
          </Typography>
          <TextField
            label={t('timeOff.approvals.comment')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            multiline
            minRows={2}
            autoFocus
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" color={approving ? 'primary' : 'error'} disabled={pending}>
            {pending ? t('timeOff.saving') : approving ? t('timeOff.approvals.approve') : t('timeOff.approvals.reject')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
