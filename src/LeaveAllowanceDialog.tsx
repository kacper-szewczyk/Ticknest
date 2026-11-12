import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { type FormEvent, useState } from 'react'
import { useAppLanguage, useTranslation } from './i18n'
import { readableError } from './lib/errors'
import {
  type LeaveAllowance,
  type LeaveRequest,
  type LeaveType,
  MAX_LEAVE_DAYS,
  isHalfDayAmount,
  memberLeaveBalance,
} from './lib/leave'
import { addLeaveAdjustment, setLeaveAllowance } from './lib/timeOff'
import { BalanceSummary } from './TimeOffParts'
import { leaveTypeName, useFormatDays } from './useLeaveFormat'
import { FormMessage, SelectField } from './ui'

/** Parses "2", "2.5" or "2,5" (and a leading minus when allowed) to a number, or `null`. */
function parseDays(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null
  return Number(normalized)
}

// The override field's text: empty means the type's default applies.
function overrideText(item: LeaveAllowance | undefined): string {
  return item && item.allowanceDays !== null ? String(item.allowanceDays) : ''
}

/** Owners and managers set a member's allowance override for a year and add adjustments with a note. */
export function LeaveAllowanceDialog({
  workspaceId,
  member,
  types,
  year,
  allowances,
  requests,
  memberNames,
  onClose,
}: {
  workspaceId: string
  member: { uid: string; name: string }
  types: LeaveType[]
  year: number
  /** This year's allowance documents, of every member. */
  allowances: LeaveAllowance[]
  /** This year's requests, of every member. */
  requests: LeaveRequest[]
  /** Display names by UID, for who made each adjustment. */
  memberNames: Map<string, string>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const language = useAppLanguage()
  const formatDays = useFormatDays()
  const [typeId, setTypeId] = useState(types[0]?.id ?? '')
  const type = types.find((item) => item.id === typeId)
  const allowance = allowances.find((item) => item.uid === member.uid && item.typeId === typeId)
  const [override, setOverride] = useState(() => overrideText(allowance))
  const [adjustDays, setAdjustDays] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [pending, setPending] = useState<'allowance' | 'adjustment' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [overrideError, setOverrideError] = useState('')
  const [adjustError, setAdjustError] = useState('')
  const target = { workspaceId, uid: member.uid, typeId, year }
  const dateFormat = new Intl.DateTimeFormat(language, { dateStyle: 'medium' })

  async function run(kind: 'allowance' | 'adjustment', action: () => Promise<void>, success: string) {
    setPending(kind)
    setError('')
    setNotice('')
    try {
      await action()
      setNotice(success)
    } catch (saveError) {
      setError(readableError(saveError))
    } finally {
      setPending(null)
    }
  }

  function handleOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const days = override.trim() === '' ? null : parseDays(override)
    if (override.trim() !== '' && !isHalfDayAmount(days, 0, MAX_LEAVE_DAYS)) {
      setOverrideError(t('timeOff.allowance.overrideInvalid', { max: MAX_LEAVE_DAYS }))
      return
    }
    setOverrideError('')
    void run('allowance', () => setLeaveAllowance(target, days), t('timeOff.allowance.saved'))
  }

  function handleAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const days = parseDays(adjustDays)
    if (!isHalfDayAmount(days, -MAX_LEAVE_DAYS, MAX_LEAVE_DAYS) || days === 0) {
      setAdjustError(t('timeOff.allowance.adjustmentInvalid'))
      return
    }
    if (!adjustNote.trim()) {
      setAdjustError(t('timeOff.allowance.noteRequired'))
      return
    }
    setAdjustError('')
    void run(
      'adjustment',
      async () => {
        await addLeaveAdjustment(target, days, adjustNote.trim())
        setAdjustDays('')
        setAdjustNote('')
      },
      t('timeOff.allowance.adjustmentAdded'),
    )
  }

  return (
    <Dialog
      open
      onClose={pending ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="leave-allowance-title"
      slotProps={{ paper: { sx: { borderRadius: '16px' } } }}
    >
      <DialogTitle id="leave-allowance-title" sx={{ fontWeight: 650, overflowWrap: 'anywhere' }}>
        {t('timeOff.allowance.title', { name: member.name, year })}
      </DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
        {error && <FormMessage severity="error">{error}</FormMessage>}
        {notice && <FormMessage severity="success">{notice}</FormMessage>}
        <SelectField
          label={t('timeOff.request.type')}
          value={typeId}
          onChange={(event) => {
            setTypeId(event.target.value)
            setOverride(
              overrideText(allowances.find((item) => item.uid === member.uid && item.typeId === event.target.value)),
            )
            setOverrideError('')
            setAdjustError('')
          }}
        >
          {types.map((item) => (
            <option key={item.id} value={item.id}>
              {leaveTypeName(item, t)}
            </option>
          ))}
        </SelectField>
        {type && <BalanceSummary balance={memberLeaveBalance(type, allowance, requests, member.uid, year)} />}

        <Box component="form" onSubmit={handleOverride} noValidate aria-busy={pending === 'allowance'}>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5, alignItems: { sm: 'flex-start' } }}>
            <TextField
              label={t('timeOff.allowance.override', { year })}
              value={override}
              onChange={(event) => setOverride(event.target.value)}
              placeholder={type ? formatDays(type.defaultAllowanceDays) : ''}
              error={Boolean(overrideError)}
              helperText={
                overrideError ||
                t('timeOff.allowance.overrideHelp', { default: type ? formatDays(type.defaultAllowanceDays) : '' })
              }
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              sx={{ flex: 1 }}
            />
            <Button type="submit" variant="outlined" disabled={pending !== null} sx={{ mt: { sm: 1 } }}>
              {pending === 'allowance' ? t('timeOff.saving') : t('timeOff.allowance.saveOverride')}
            </Button>
          </Stack>
        </Box>

        <Divider />
        <Typography component="h3" sx={{ fontWeight: 700 }}>
          {t('timeOff.allowance.adjustments')}
        </Typography>
        {(allowance?.adjustments ?? []).length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('timeOff.allowance.noAdjustments')}
          </Typography>
        ) : (
          <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.75 }}>
            {(allowance?.adjustments ?? []).map((adjustment, index) => (
              <li key={index}>
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  <strong>
                    {adjustment.days > 0 ? '+' : '−'}
                    {formatDays(Math.abs(adjustment.days))}
                  </strong>{' '}
                  · {adjustment.note}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('timeOff.allowance.adjustedBy', {
                    name: memberNames.get(adjustment.by) ?? t('timeOff.unknownMember'),
                    date: adjustment.at ? dateFormat.format(adjustment.at.toDate()) : '',
                  })}
                </Typography>
              </li>
            ))}
          </Box>
        )}
        <Box component="form" onSubmit={handleAdjustment} noValidate aria-busy={pending === 'adjustment'}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '120px 1fr auto' }, gap: 1.5 }}>
            <TextField
              label={t('timeOff.allowance.adjustDays')}
              value={adjustDays}
              onChange={(event) => setAdjustDays(event.target.value)}
              placeholder="+2"
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              error={Boolean(adjustError)}
            />
            <TextField
              label={t('timeOff.allowance.adjustNote')}
              value={adjustNote}
              onChange={(event) => setAdjustNote(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 200 } }}
              error={Boolean(adjustError)}
            />
            <Button type="submit" variant="outlined" disabled={pending !== null} sx={{ alignSelf: 'start', mt: 1 }}>
              {pending === 'adjustment' ? t('timeOff.saving') : t('timeOff.allowance.addAdjustment')}
            </Button>
          </Box>
          <Typography
            variant="caption"
            color={adjustError ? 'error' : 'text.secondary'}
            component="p"
            role={adjustError ? 'alert' : undefined}
            sx={{ mt: 0.75 }}
          >
            {adjustError || t('timeOff.allowance.adjustHelp')}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={pending !== null}>
          {t('timeOff.close')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
