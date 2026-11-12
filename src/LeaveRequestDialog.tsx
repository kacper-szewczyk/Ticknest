import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { type FormEvent, useState } from 'react'
import { useTranslation } from './i18n'
import { readableError } from './lib/errors'
import { type LeaveAllowance, type LeaveRequest, type LeaveType, previewLeaveRequest } from './lib/leave'
import { type LeaveRequestInput, submitLeaveRequest } from './lib/timeOff'
import { leaveTypeName, useFormatDays } from './useLeaveFormat'
import { FormMessage, SelectField } from './ui'

/** The form a member requests leave with. It shows the days used and the balance after before sending. */
export function LeaveRequestDialog({
  workspaceId,
  userId,
  types,
  allowancesFor,
  ownRequests,
  today,
  onClose,
  onSubmitted,
}: {
  workspaceId: string
  userId: string
  /** Active leave types to choose from. */
  types: LeaveType[]
  /** The member's allowance document for a type and year, once loaded. */
  allowancesFor: (typeId: string, year: number) => LeaveAllowance | undefined
  ownRequests: LeaveRequest[]
  today: string
  onClose: () => void
  onSubmitted: (status: LeaveRequest['status']) => void
}) {
  const { t } = useTranslation()
  const formatDays = useFormatDays()
  const [typeId, setTypeId] = useState(types[0]?.id ?? '')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [startHalf, setStartHalf] = useState(false)
  const [endHalf, setEndHalf] = useState(false)
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const type = types.find((item) => item.id === typeId)
  const halves = type?.unit === 'half-day'
  const isOneDay = startDate !== '' && startDate === endDate
  const year = Number(startDate.slice(0, 4))
  const draft = { typeId, startDate, endDate, startHalf, endHalf: isOneDay ? false : endHalf }
  const preview = type ? previewLeaveRequest(draft, type, allowancesFor(typeId, year), ownRequests, userId) : null
  const problemId = 'leave-request-problem'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!type || !preview?.ok || pending) return
    setPending(true)
    setError('')
    const input: LeaveRequestInput = {
      typeId,
      startDate,
      endDate,
      startHalf: halves && startHalf,
      endHalf: halves && !isOneDay && endHalf,
      note: note.trim(),
    }
    try {
      const { status } = await submitLeaveRequest(workspaceId, input)
      onSubmitted(status)
    } catch (submitError) {
      setError(readableError(submitError))
      setPending(false)
    }
  }

  return (
    <Dialog
      open
      onClose={pending ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="leave-request-title"
      slotProps={{ paper: { sx: { borderRadius: '16px' } } }}
    >
      <Box component="form" onSubmit={handleSubmit} aria-busy={pending} noValidate>
        <DialogTitle id="leave-request-title" sx={{ fontWeight: 650 }}>
          {t('timeOff.request.title')}
        </DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
          {error && <FormMessage severity="error">{error}</FormMessage>}
          <SelectField
            label={t('timeOff.request.type')}
            value={typeId}
            onChange={(event) => setTypeId(event.target.value)}
            required
          >
            {types.map((item) => (
              <option key={item.id} value={item.id}>
                {leaveTypeName(item, t)}
              </option>
            ))}
          </SelectField>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            <TextField
              label={t('timeOff.request.start')}
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value)
                if (!endDate || event.target.value > endDate) setEndDate(event.target.value)
              }}
              required
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'aria-describedby': problemId } }}
            />
            <TextField
              label={t('timeOff.request.end')}
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              required
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { min: startDate || undefined, 'aria-describedby': problemId },
              }}
            />
          </Box>
          {halves && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 3 }}>
              <FormControlLabel
                control={<Checkbox checked={startHalf} onChange={(event) => setStartHalf(event.target.checked)} />}
                label={isOneDay ? t('timeOff.request.halfDay') : t('timeOff.request.startHalf')}
              />
              {!isOneDay && (
                <FormControlLabel
                  control={<Checkbox checked={endHalf} onChange={(event) => setEndHalf(event.target.checked)} />}
                  label={t('timeOff.request.endHalf')}
                />
              )}
            </Box>
          )}
          <TextField
            label={t('timeOff.request.note')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
          <Box id={problemId} aria-live="polite">
            {preview && !preview.ok && <Alert severity="info">{t(`timeOff.request.problem.${preview.problem}`)}</Alert>}
            {preview?.ok && (
              <>
                <Typography variant="body2">
                  {preview.balanceAfter === null
                    ? t('timeOff.request.usesUnlimited', { days: formatDays(preview.days) })
                    : t('timeOff.request.uses', {
                        days: formatDays(preview.days),
                        after: formatDays(preview.balanceAfter),
                      })}
                </Typography>
                <Typography variant="caption" color="text.secondary" component="p">
                  {t('timeOff.request.weekendsNote')}
                </Typography>
                {preview.overDays > 0 && (
                  <Alert severity="warning" sx={{ mt: 1.5 }}>
                    {t('timeOff.request.overWarning', { days: formatDays(preview.overDays) })}
                  </Alert>
                )}
                {type && !type.requiresApproval && (
                  <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
                    {t('timeOff.request.autoApprovedNote')}
                  </Typography>
                )}
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button variant="contained" type="submit" disabled={pending || !preview?.ok}>
            {pending ? t('timeOff.request.sending') : t('timeOff.request.send')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
