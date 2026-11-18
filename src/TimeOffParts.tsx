import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { NavIcon } from './AppShell'
import { useTranslation } from './i18n'
import type { LeaveBalance, LeaveStatus, LeaveType } from './lib/leave'
import { leaveTypeName, useFormatDays } from './useLeaveFormat'

/** A previous/next arrow for stepping through months or years, at the default (not small) target size. */
export function StepButton({
  direction,
  label,
  onClick,
}: {
  direction: 'previous' | 'next'
  label: string
  onClick: () => void
}) {
  return (
    <IconButton onClick={onClick} aria-label={label}>
      <NavIcon>
        <path d={direction === 'previous' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} />
      </NavIcon>
    </IconButton>
  )
}

export function LeaveTypeLabel({ type }: { type: LeaveType | undefined }) {
  const { t } = useTranslation()
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Box
        component="span"
        aria-hidden
        sx={{ width: 10, height: 10, flex: '0 0 auto', borderRadius: '50%', bgcolor: type?.color ?? 'text.disabled' }}
      />
      <Typography component="span" variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
        {leaveTypeName(type, t)}
      </Typography>
    </Stack>
  )
}

const STATUS_COLORS: Record<LeaveStatus, 'warning' | 'success' | 'error' | 'default'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  cancelled: 'default',
}

export function LeaveStatusChip({ status }: { status: LeaveStatus }) {
  const { t } = useTranslation()
  return <Chip size="small" variant="outlined" color={STATUS_COLORS[status]} label={t(`timeOff.status.${status}`)} />
}

export function OverAllowanceChip({ days }: { days: number }) {
  const { t } = useTranslation()
  const formatDays = useFormatDays()
  return (
    <Chip
      size="small"
      color="error"
      label={t('timeOff.overAllowance')}
      title={t('timeOff.overAllowanceBy', { days: formatDays(days) })}
      aria-label={t('timeOff.overAllowanceBy', { days: formatDays(days) })}
    />
  )
}

/** Available days, with what is left once pending requests are approved when that differs. */
export function BalanceSummary({ balance }: { balance: LeaveBalance }) {
  const { t } = useTranslation()
  const formatDays = useFormatDays()
  return (
    <Box>
      <Typography
        variant="h3"
        component="p"
        color={balance.availableDays !== null && balance.availableDays < 0 ? 'error' : undefined}
        sx={{ fontSize: '1.4rem', fontWeight: 700 }}
      >
        {formatDays(balance.availableDays)}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ lineHeight: 1.5 }}>
        {balance.allowanceDays === null
          ? t('timeOff.balance.takenUnlimited', { taken: formatDays(balance.approvedDays) })
          : t('timeOff.balance.ofAllowance', {
              allowance: formatDays(balance.allowanceDays + balance.adjustmentDays),
              taken: formatDays(balance.approvedDays),
            })}
        {balance.pendingDays > 0 && (
          <>
            <br />
            {balance.availableAfterPendingDays === null
              ? t('timeOff.balance.pendingUnlimited', { pending: formatDays(balance.pendingDays) })
              : t('timeOff.balance.pending', {
                  pending: formatDays(balance.pendingDays),
                  after: formatDays(balance.availableAfterPendingDays),
                })}
          </>
        )}
      </Typography>
    </Box>
  )
}
