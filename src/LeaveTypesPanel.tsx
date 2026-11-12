import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { type FormEvent, useEffect, useState } from 'react'
import { useTranslation } from './i18n'
import { readableError } from './lib/errors'
import { type LeaveType, type LeaveUnit, MAX_LEAVE_DAYS, isHalfDayAmount, mergeLeaveTypes } from './lib/leave'
import { saveLeaveType, subscribeToLeaveTypes } from './lib/timeOff'
import { LeaveTypeLabel } from './TimeOffParts'
import { leaveTypeName, useFormatDays } from './useLeaveFormat'
import { FormMessage, ListRow, LoadingState, SectionCard, SectionHeading, SelectField } from './ui'

const NEW_TYPE: LeaveType = {
  id: '',
  name: '',
  color: '#5c6bc0',
  unit: 'day',
  requiresApproval: true,
  defaultAllowanceDays: null,
  archived: false,
  isStored: false,
}

/** Settings card where the owner manages leave types: the built-in Holiday and Sick leave, and custom types. */
export function LeaveTypesPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const formatDays = useFormatDays()
  const [stored, setStored] = useState<LeaveType[] | undefined>()
  const [editing, setEditing] = useState<LeaveType | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(
    () => subscribeToLeaveTypes(workspaceId, setStored, (issue) => setError(readableError(issue))),
    [workspaceId],
  )
  const types = mergeLeaveTypes(stored ?? [])

  return (
    <SectionCard labelledBy="leave-types-heading">
      <SectionHeading
        id="leave-types-heading"
        kicker={t('timeOff.types.kicker')}
        title={t('timeOff.types.title')}
        action={
          <Button variant="outlined" onClick={() => setEditing(NEW_TYPE)} disabled={stored === undefined}>
            {t('timeOff.types.add')}
          </Button>
        }
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.6 }}>
        {t('timeOff.types.intro')}
      </Typography>
      {error && <FormMessage severity="error">{error}</FormMessage>}
      {notice && <FormMessage severity="success">{notice}</FormMessage>}
      {stored === undefined ? (
        <LoadingState label={t('timeOff.loading')} sx={{ py: 4 }} />
      ) : (
        <Box sx={{ mt: 1 }}>
          {types.map((type) => (
            <ListRow key={type.id} sx={{ flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <LeaveTypeLabel type={type} />
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.25 }}>
                  {[
                    t('timeOff.types.allowanceSummary', { days: formatDays(type.defaultAllowanceDays) }),
                    type.unit === 'half-day' ? t('timeOff.types.halfDays') : t('timeOff.types.fullDays'),
                    type.requiresApproval ? t('timeOff.types.needsApproval') : t('timeOff.types.autoApproved'),
                  ].join(' · ')}
                </Typography>
              </Box>
              <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
                {type.archived && <Chip size="small" label={t('timeOff.types.archived')} />}
                <Button size="small" onClick={() => setEditing(type)}>
                  {t('timeOff.types.edit')}
                </Button>
              </Stack>
            </ListRow>
          ))}
        </Box>
      )}
      {editing && (
        <LeaveTypeDialog
          type={editing}
          onClose={() => setEditing(null)}
          onSave={async (settings) => {
            await saveLeaveType(workspaceId, editing.id || null, settings)
            setEditing(null)
            setError('')
            setNotice(t('timeOff.types.saved', { name: settings.name }))
          }}
        />
      )}
    </SectionCard>
  )
}

function LeaveTypeDialog({
  type,
  onClose,
  onSave,
}: {
  type: LeaveType
  onClose: () => void
  onSave: (settings: Omit<LeaveType, 'id' | 'isStored'>) => Promise<void>
}) {
  const { t } = useTranslation()
  const isNew = type.id === ''
  const [name, setName] = useState(isNew ? '' : leaveTypeName(type, t))
  const [color, setColor] = useState(type.color)
  const [unit, setUnit] = useState<LeaveUnit>(type.unit)
  const [requiresApproval, setRequiresApproval] = useState(type.requiresApproval)
  const [allowance, setAllowance] = useState(
    type.defaultAllowanceDays === null ? '' : String(type.defaultAllowanceDays),
  )
  const [archived, setArchived] = useState(type.archived)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [nameError, setNameError] = useState('')
  const [allowanceError, setAllowanceError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const trimmed = name.trim()
    const days = allowance.trim() === '' ? null : Number(allowance.trim().replace(',', '.'))
    setNameError(trimmed ? '' : t('timeOff.types.nameRequired'))
    const allowanceValid = days === null || isHalfDayAmount(days, 0, MAX_LEAVE_DAYS)
    setAllowanceError(allowanceValid ? '' : t('timeOff.allowance.overrideInvalid', { max: MAX_LEAVE_DAYS }))
    if (!trimmed || !allowanceValid) return
    setPending(true)
    setError('')
    try {
      await onSave({ name: trimmed, color, unit, requiresApproval, defaultAllowanceDays: days, archived })
    } catch (saveError) {
      setError(readableError(saveError))
      setPending(false)
    }
  }

  return (
    <Dialog
      open
      onClose={pending ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="leave-type-title"
      slotProps={{ paper: { sx: { borderRadius: '16px' } } }}
    >
      <Box component="form" onSubmit={handleSubmit} noValidate aria-busy={pending}>
        <DialogTitle id="leave-type-title" sx={{ fontWeight: 650 }}>
          {isNew ? t('timeOff.types.addTitle') : t('timeOff.types.editTitle')}
        </DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
          {error && <FormMessage severity="error">{error}</FormMessage>}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 1.5 }}>
            <TextField
              label={t('timeOff.types.name')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoFocus
              error={Boolean(nameError)}
              helperText={nameError || undefined}
              slotProps={{ htmlInput: { maxLength: 60 } }}
            />
            <TextField
              label={t('timeOff.types.color')}
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
          <SelectField
            label={t('timeOff.types.unit')}
            value={unit}
            onChange={(event) => setUnit(event.target.value as LeaveUnit)}
          >
            <option value="day">{t('timeOff.types.fullDays')}</option>
            <option value="half-day">{t('timeOff.types.halfDays')}</option>
          </SelectField>
          <TextField
            label={t('timeOff.types.defaultAllowance')}
            value={allowance}
            onChange={(event) => setAllowance(event.target.value)}
            error={Boolean(allowanceError)}
            helperText={allowanceError || t('timeOff.types.defaultAllowanceHelp')}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
          />
          <FormControlLabel
            control={
              <Switch checked={requiresApproval} onChange={(event) => setRequiresApproval(event.target.checked)} />
            }
            label={t('timeOff.types.requiresApproval')}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5 }}>
            {t('timeOff.types.requiresApprovalHelp')}
          </Typography>
          {!isNew && (
            <FormControlLabel
              control={<Switch checked={archived} onChange={(event) => setArchived(event.target.checked)} />}
              label={t('timeOff.types.archive')}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending}>
            {pending ? t('timeOff.saving') : t('timeOff.types.save')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
