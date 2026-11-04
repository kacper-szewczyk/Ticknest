import { useMemo, useState, type FormEvent } from 'react'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { type Budget, type BudgetInput, type Weekday, type WeekdayMinutes, saveBudget } from './lib/budgets'
import {
  type BudgetTargetOption,
  type HoursPreset,
  WEEKDAY_LABELS,
  budgetTargetKey,
  buildBudgetTargetOptions,
  detectHoursPreset,
  formatHoursInput,
  parseHoursInput,
  presetWeekdayMinutes,
  totalBudgetMinutes,
  weeklyMinutes,
} from './lib/budgetForm'
import { type BudgetField, BudgetFieldError, WEEKDAYS } from './lib/budgetValidation'
import type { Catalog } from './lib/catalog'
import { dayDate } from './lib/dates'
import { readableError } from './lib/errors'
import { formatBudgetMinutes } from './lib/memberBudgets'
import { FormMessage, SelectField } from './ui'

type HoursDraft = Record<Weekday, string>
type FieldErrors = Partial<Record<BudgetField | Weekday | 'daily', string>>

type Draft = {
  userId: string
  targetKey: string
  startDay: string
  endDay: string
  preset: HoursPreset
  daily: string
  hours: HoursDraft
  exceptions: string[]
}

export type MemberOption = { uid: string; label: string }

const PRESET_LABELS: Record<HoursPreset, string> = { weekdays: 'Mon–Fri', everyday: 'Every day', custom: 'Custom' }

function formatDay(day: string): string {
  return dayDate(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function hoursDraft(minutes: WeekdayMinutes): HoursDraft {
  return Object.fromEntries(WEEKDAYS.map((weekday) => [weekday, formatHoursInput(minutes[weekday])])) as HoursDraft
}

function initialDraft(budget: Budget | undefined): Draft {
  if (!budget) {
    return {
      userId: '',
      targetKey: '',
      startDay: '',
      endDay: '',
      preset: 'weekdays',
      daily: '',
      hours: { mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' },
      exceptions: [],
    }
  }
  const { preset, dailyMinutes } = detectHoursPreset(budget.weekdayMinutes)
  return {
    userId: budget.userId,
    targetKey: budgetTargetKey(budget.target),
    startDay: budget.startDay,
    endDay: budget.endDay,
    preset,
    daily: formatHoursInput(dailyMinutes),
    hours: hoursDraft(budget.weekdayMinutes),
    exceptions: budget.exceptions,
  }
}

/** Reads the hours the draft describes, or null when a field is not a valid amount of hours. */
function draftWeekdayMinutes(draft: Draft): WeekdayMinutes | null {
  if (draft.preset !== 'custom') {
    const daily = parseHoursInput(draft.daily)
    return daily === null ? null : presetWeekdayMinutes(draft.preset, daily)
  }
  const minutes = {} as WeekdayMinutes
  for (const weekday of WEEKDAYS) {
    const value = parseHoursInput(draft.hours[weekday])
    if (value === null) return null
    minutes[weekday] = value
  }
  return minutes
}

/**
 * The create and edit form for one budget, in a side drawer so the list stays in place. Pass `budget` to edit it;
 * the parent remounts this component for each opening, so the form always starts from that budget.
 */
export function BudgetEditor({
  open,
  budget,
  workspaceId,
  catalog,
  members,
  onClose,
  onSaved,
}: {
  open: boolean
  budget?: Budget
  workspaceId: string
  catalog: Catalog
  members: MemberOption[]
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [initial] = useState(() => initialDraft(budget))
  const [draft, setDraft] = useState(initial)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [exceptionDraft, setExceptionDraft] = useState('')
  const [daysOffOpen, setDaysOffOpen] = useState(false)

  const targetOptions = useMemo(() => buildBudgetTargetOptions(catalog, budget?.target), [catalog, budget])
  const target = targetOptions.find((option) => option.key === draft.targetKey) ?? null
  // An edited budget may belong to a member who has since been removed.
  const memberOptions =
    budget && !members.some((member) => member.uid === budget.userId)
      ? [...members, { uid: budget.userId, label: `${budget.userDisplayName} (removed)` }]
      : members

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || exceptionDraft !== ''
  const weekdayMinutes = draftWeekdayMinutes(draft)
  const total = weekdayMinutes && totalBudgetMinutes({ ...draft, weekdayMinutes })
  const hoursError =
    fieldErrors.weekdayMinutes ?? fieldErrors.daily ?? WEEKDAYS.map((weekday) => fieldErrors[weekday]).find(Boolean)

  function update(changes: Partial<Draft>, ...cleared: (keyof FieldErrors)[]) {
    setDraft((current) => ({ ...current, ...changes }))
    if (cleared.some((field) => fieldErrors[field])) {
      setFieldErrors((current) => ({ ...current, ...Object.fromEntries(cleared.map((field) => [field, undefined])) }))
    }
  }

  function changePreset(preset: HoursPreset | null) {
    if (!preset || preset === draft.preset) return
    const minutes = draftWeekdayMinutes(draft)
    if (preset === 'custom') {
      update({ preset, hours: minutes ? hoursDraft(minutes) : draft.hours }, 'daily', 'weekdayMinutes')
    } else {
      // Carry over the first day with a target, so switching back from Custom keeps a sensible value.
      const daily = minutes ? (WEEKDAYS.map((weekday) => minutes[weekday]).find((value) => value > 0) ?? 0) : 0
      update(
        { preset, daily: draft.preset === 'custom' ? formatHoursInput(daily) : draft.daily },
        ...WEEKDAYS,
        'weekdayMinutes',
      )
    }
  }

  function requestClose() {
    if (pending) return
    if (dirty && !window.confirm('Discard your changes to this budget?')) return
    onClose()
  }

  function addException() {
    if (!exceptionDraft) return
    if (!draft.exceptions.includes(exceptionDraft)) {
      update({ exceptions: [...draft.exceptions, exceptionDraft].sort() }, 'exceptions')
    }
    setExceptionDraft('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!weekdayMinutes) {
      const hourErrors: FieldErrors = {}
      if (draft.preset !== 'custom') hourErrors.daily = 'Use hours like 7.5 or 7:30.'
      else {
        for (const weekday of WEEKDAYS) {
          if (parseHoursInput(draft.hours[weekday]) === null) {
            hourErrors[weekday] = `Use hours like 7.5 or 7:30 for ${WEEKDAY_LABELS[weekday].long}.`
          }
        }
      }
      setFieldErrors(hourErrors)
      return
    }
    const input: BudgetInput = {
      userId: draft.userId,
      target: { type: target?.type ?? 'project', id: target?.id ?? '' },
      startDay: draft.startDay,
      endDay: draft.endDay,
      weekdayMinutes,
      exceptions: draft.exceptions,
    }
    setFieldErrors({})
    setPending(true)
    try {
      await saveBudget(workspaceId, input, budget?.id)
      onSaved(budget ? 'Budget updated.' : 'Budget created.')
    } catch (issue) {
      if (issue instanceof BudgetFieldError) {
        setFieldErrors({ [issue.field]: issue.message })
        if (issue.field === 'exceptions') setDaysOffOpen(true)
      } else setError(readableError(issue))
      setPending(false)
    }
  }

  const hoursField = (weekday: Weekday | 'daily', label: string, ariaLabel: string) => (
    <TextField
      key={weekday}
      size="small"
      label={label}
      value={weekday === 'daily' ? draft.daily : draft.hours[weekday]}
      placeholder="0:00"
      onChange={(event) =>
        weekday === 'daily'
          ? update({ daily: event.target.value }, 'daily', 'weekdayMinutes')
          : update({ hours: { ...draft.hours, [weekday]: event.target.value } }, weekday, 'weekdayMinutes')
      }
      onBlur={() => {
        const text = weekday === 'daily' ? draft.daily : draft.hours[weekday]
        const minutes = parseHoursInput(text)
        if (minutes === null) return
        if (weekday === 'daily') setDraft((current) => ({ ...current, daily: formatHoursInput(minutes) }))
        else setDraft((current) => ({ ...current, hours: { ...current.hours, [weekday]: formatHoursInput(minutes) } }))
      }}
      error={!!fieldErrors[weekday] || !!fieldErrors.weekdayMinutes}
      slotProps={{
        inputLabel: { shrink: true },
        htmlInput: { inputMode: 'decimal', 'aria-label': ariaLabel, 'aria-describedby': 'budget-hours-help' },
      }}
      // Seven fields share one row, so they trade side padding for room to show `10:30`.
      sx={weekday === 'daily' ? undefined : { '& .MuiInputBase-input': { px: 0.75, textAlign: 'center' } }}
    />
  )

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={requestClose}
      slotProps={{
        paper: { 'aria-labelledby': 'budget-editor-heading', sx: { width: { xs: '100%', sm: 520 } } },
      }}
    >
      <Box
        component="form"
        noValidate
        onSubmit={(event: FormEvent) => void submit(event)}
        aria-busy={pending}
        sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      >
        <Stack
          direction="row"
          sx={{
            alignItems: 'flex-start',
            gap: 1,
            px: { xs: 2, sm: 3 },
            pt: 2.5,
            pb: 2,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h3" id="budget-editor-heading" sx={{ overflowWrap: 'anywhere' }}>
              {budget ? `${budget.userDisplayName} · ${budget.target.name}` : 'New budget'}
            </Typography>
            {budget && (
              <Typography variant="caption" color="text.secondary">
                Edits apply to the whole date range, including past days.
              </Typography>
            )}
          </Box>
          <IconButton aria-label="Close" onClick={requestClose} sx={{ mt: -0.5 }}>
            ×
          </IconButton>
        </Stack>

        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            display: 'grid',
            alignContent: 'start',
            gap: 2.5,
            px: { xs: 2, sm: 3 },
            py: 2.5,
          }}
        >
          {error && <FormMessage severity="error">{error}</FormMessage>}
          <SelectField
            label="Member"
            value={draft.userId}
            onChange={(event) => update({ userId: event.target.value }, 'userId')}
            required
            error={!!fieldErrors.userId}
            helperText={fieldErrors.userId}
          >
            <option value="">Choose a member</option>
            {memberOptions.map((option) => (
              <option key={option.uid} value={option.uid}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <Autocomplete<BudgetTargetOption>
            options={targetOptions}
            value={target}
            onChange={(_, option) => update({ targetKey: option?.key ?? '' }, 'target')}
            groupBy={(option) => option.group}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, current) => option.key === current.key}
            getOptionDisabled={(option) => option.archived && option.key !== draft.targetKey}
            noOptionsText="No matching projects or clients"
            autoHighlight
            renderOption={({ key, ...props }, option) => (
              <Box
                component="li"
                key={key}
                {...props}
                sx={{ gap: 1.25, pl: option.type === 'project' ? '28px !important' : undefined }}
              >
                <Box
                  aria-hidden
                  sx={{
                    width: 10,
                    height: 10,
                    flexShrink: 0,
                    borderRadius: option.type === 'client' ? '3px' : '50%',
                    bgcolor: option.color ?? 'divider',
                  }}
                />
                <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: option.type === 'client' ? 650 : 400 }}>
                  {option.type === 'client' ? 'Whole client' : option.name}
                  {option.archived ? ' (archived)' : ''}
                </Typography>
                <Typography variant="overline" color="text.disabled" sx={{ fontSize: 10, lineHeight: 1 }}>
                  {option.type === 'client' ? 'Client' : 'Project'}
                </Typography>
              </Box>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Project or client"
                required
                placeholder="Search projects and clients"
                error={!!fieldErrors.target}
                helperText={fieldErrors.target}
                slotProps={{ ...params.slotProps, inputLabel: { ...params.slotProps?.inputLabel, shrink: true } }}
              />
            )}
            sx={{ minWidth: 0 }}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5 }}>
            <TextField
              label="Start date"
              type="date"
              value={draft.startDay}
              onChange={(event) => update({ startDay: event.target.value }, 'startDay')}
              required
              error={!!fieldErrors.startDay}
              helperText={fieldErrors.startDay}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="End date"
              type="date"
              value={draft.endDay}
              onChange={(event) => update({ endDay: event.target.value }, 'endDay')}
              required
              error={!!fieldErrors.endDay}
              helperText={fieldErrors.endDay}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: draft.startDay || undefined } }}
            />
          </Box>

          <Box component="fieldset" sx={{ m: 0, p: 0, border: 0, minWidth: 0 }}>
            <Typography component="legend" variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              Hours
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={draft.preset}
              onChange={(_, preset: HoursPreset | null) => changePreset(preset)}
              aria-label="Which days have a target"
              sx={{ mb: 1.5 }}
            >
              {(Object.keys(PRESET_LABELS) as HoursPreset[]).map((preset) => (
                <ToggleButton key={preset} value={preset} sx={{ textTransform: 'none', px: 1.75 }}>
                  {PRESET_LABELS[preset]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            {draft.preset === 'custom' ? (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: 'repeat(4, minmax(0, 1fr))', sm: 'repeat(7, minmax(0, 1fr))' },
                  gap: 0.75,
                }}
              >
                {WEEKDAYS.map((weekday) =>
                  hoursField(weekday, WEEKDAY_LABELS[weekday].short, `${WEEKDAY_LABELS[weekday].long} hours`),
                )}
              </Box>
            ) : (
              <Box sx={{ maxWidth: 160 }}>
                {hoursField(
                  'daily',
                  'Hours per day',
                  draft.preset === 'weekdays' ? 'Hours each day, Monday to Friday' : 'Hours each day of the week',
                )}
              </Box>
            )}
            <Typography
              id="budget-hours-help"
              variant="caption"
              component="p"
              color={hoursError ? 'error' : 'text.secondary'}
              role={hoursError ? 'alert' : undefined}
              sx={{ mt: 1 }}
            >
              {hoursError ??
                (weekdayMinutes && weeklyMinutes(weekdayMinutes) > 0
                  ? `${formatBudgetMinutes(weeklyMinutes(weekdayMinutes))} per week` +
                    (total !== null ? ` · ${formatBudgetMinutes(total)} in total` : '')
                  : draft.preset === 'custom'
                    ? 'Enter 7.5 or 7:30. Leave a day blank for no target.'
                    : 'Enter 7.5 or 7:30.')}
            </Typography>
          </Box>

          <Box>
            <Button
              size="small"
              onClick={() => setDaysOffOpen(!daysOffOpen)}
              aria-expanded={daysOffOpen}
              aria-controls="budget-days-off"
              sx={{ px: 0.5, ml: -0.5, fontWeight: 600 }}
            >
              {daysOffOpen ? '▾' : '▸'}&nbsp;Days off
              {draft.exceptions.length > 0 && ` · ${draft.exceptions.length}`}
            </Button>
            <Collapse in={daysOffOpen} id="budget-days-off">
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
                Dates inside the range with no target, such as holidays or leave.
              </Typography>
              <Stack direction="row" spacing={1.25} sx={{ mt: 1.5, alignItems: 'flex-start' }}>
                <TextField
                  size="small"
                  label="Day off"
                  type="date"
                  value={exceptionDraft}
                  onChange={(event) => setExceptionDraft(event.target.value)}
                  error={!!fieldErrors.exceptions}
                  helperText={fieldErrors.exceptions}
                  slotProps={{
                    inputLabel: { shrink: true },
                    htmlInput: { min: draft.startDay || undefined, max: draft.endDay || undefined },
                  }}
                  sx={{ flex: 1, maxWidth: 220 }}
                />
                <Button variant="outlined" onClick={addException} disabled={!exceptionDraft} sx={{ flex: '0 0 auto' }}>
                  Add
                </Button>
              </Stack>
              {draft.exceptions.length > 0 && (
                <Box
                  component="ul"
                  aria-label="Days off"
                  sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, listStyle: 'none', m: 0, mt: 1.5, p: 0 }}
                >
                  {draft.exceptions.map((day) => (
                    <li key={day}>
                      <Chip
                        label={formatDay(day)}
                        aria-label={`${formatDay(day)}, press Delete to remove`}
                        onDelete={() =>
                          update({ exceptions: draft.exceptions.filter((item) => item !== day) }, 'exceptions')
                        }
                      />
                    </li>
                  ))}
                </Box>
              )}
            </Collapse>
          </Box>
        </Box>

        <Stack
          direction="row"
          spacing={1.25}
          sx={{ justifyContent: 'flex-end', px: { xs: 2, sm: 3 }, py: 2, borderTop: 1, borderColor: 'divider' }}
        >
          <Button onClick={requestClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="contained" type="submit" disabled={pending}>
            {pending ? 'Saving…' : budget ? 'Save changes' : 'Create budget'}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  )
}
