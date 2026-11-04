import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { type FormEvent, useState } from 'react'
import type { Catalog } from './lib/catalog'
import { localDateTimeValue } from './lib/dates'
import { readableError } from './lib/errors'
import { saveManualTimeEntry, type TimeEntry } from './lib/timeEntries'
import { type WorkDetails, workDetails } from './lib/workOptions'
import { BillableChip, FormMessage } from './ui'
import { useManualEntryFieldErrors } from './useManualEntryFieldErrors'
import { WorkPicker } from './WorkPicker'

export function EntryEditor({
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
  /** Called after a save with the day the entry was saved on, which the date field may have changed. */
  onSaved: (message: string, day: string) => void
}) {
  const [description, setDescription] = useState(entry?.description ?? '')
  const [work, setWork] = useState<WorkDetails>(() =>
    entry
      ? {
          clientId: entry.clientId ?? null,
          clientName: entry.clientName,
          projectId: entry.projectId ?? null,
          projectName: entry.projectName,
          taskId: entry.taskId ?? null,
          taskName: entry.taskName,
          billable: entry.billable,
        }
      : workDetails(null),
  )
  // An entry sits on one day: the start and end times share the date field.
  const initialStart = entry ? localDateTimeValue(entry.startAt.toDate()) : `${day}T09:00`
  const initialEnd = entry?.endAt ? localDateTimeValue(entry.endAt.toDate()) : `${day}T10:00`
  const [date, setDate] = useState(initialStart.slice(0, 10))
  const [startTime, setStartTime] = useState(initialStart.slice(11))
  const [endTime, setEndTime] = useState(initialEnd.slice(11))
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
          clientId: work.clientId,
          projectId: work.projectId,
          taskId: work.taskId,
          billable: work.billable,
          startAt: new Date(`${date}T${startTime}`),
          endAt: new Date(`${date}T${endTime}`),
        },
        entry?.id,
      )
      onSaved(entry ? 'Time entry updated.' : 'Time entry added.', date)
    } catch (requestError) {
      if (!showFieldError(requestError)) setError(readableError(requestError))
      setPending(false)
    }
  }

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
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 1fr' }, gap: 1.5 }}>
            <TextField
              label="Date"
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value)
                clearFieldError('startAt')
                clearFieldError('endAt')
              }}
              required
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Start"
              type="time"
              value={startTime}
              onChange={(event) => {
                setStartTime(event.target.value)
                clearFieldError('startAt')
                clearFieldError('endAt')
              }}
              required
              {...fieldProps('startAt')}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="End"
              type="time"
              value={endTime}
              onChange={(event) => {
                setEndTime(event.target.value)
                clearFieldError('endAt')
              }}
              required
              {...fieldProps('endAt')}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
          <WorkPicker catalog={catalog} value={work} onChange={setWork} />
          {work.billable && (
            <Box>
              <BillableChip />
            </Box>
          )}
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
