import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
  type Budget,
  type BudgetInput,
  type Weekday,
  deleteBudget,
  saveBudget,
  setBudgetArchived,
  subscribeToBudgets,
} from './lib/budgets'
import {
  type BudgetListFilters,
  type BudgetPhase,
  type BudgetTargetOption,
  WEEKDAY_LABELS,
  budgetPhase,
  budgetTargetKey,
  buildBudgetTargetOptions,
  filterBudgets,
  formatHoursInput,
  parseHoursInput,
  weekdaySummary,
} from './lib/budgetForm'
import { progressTimeZone, zonedDayString } from './lib/budgetProgress'
import { type BudgetField, BudgetFieldError, WEEKDAYS } from './lib/budgetValidation'
import type { Catalog } from './lib/catalog'
import { dayDate } from './lib/dates'
import { readableError } from './lib/errors'
import { type WorkspaceMember, subscribeToWorkspaceMembers } from './lib/workspaces'
import { EmptyText, FormMessage, ListRow, SectionCard, SectionHeading, SelectField } from './ui'

type HoursDraft = Record<Weekday, string>
type FieldErrors = Partial<Record<BudgetField | Weekday, string>>

const EMPTY_HOURS: HoursDraft = { mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' }

const PHASE_LABELS: Record<BudgetPhase, string> = {
  active: 'Active',
  upcoming: 'Upcoming',
  past: 'Past',
  archived: 'Archived',
}

function formatDay(day: string): string {
  return dayDate(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// Owners and managers create, edit, archive, and delete hour budgets for workspace members.
export function BudgetsPanel({ workspaceId, catalog }: { workspaceId: string; catalog: Catalog }) {
  const [budgets, setBudgets] = useState<Budget[] | undefined>()
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [filters, setFilters] = useState<BudgetListFilters>({ userId: '', targetKey: '', phase: 'current' })
  const [editing, setEditing] = useState<Budget | undefined>()
  const [userId, setUserId] = useState('')
  const [target, setTarget] = useState<BudgetTargetOption | null>(null)
  const [startDay, setStartDay] = useState('')
  const [endDay, setEndDay] = useState('')
  const [hours, setHours] = useState<HoursDraft>(EMPTY_HOURS)
  const [exceptions, setExceptions] = useState<string[]>([])
  const [exceptionDraft, setExceptionDraft] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  // Phases are a coarse label, so the instant when the panel opened is precise enough.
  const [now] = useState(() => Date.now())
  const formRef = useRef<HTMLFormElement>(null)

  // The parent keys this panel by workspace, so switching workspaces starts with fresh state.
  useEffect(() => {
    const handleError = (issue: Error) => setError(readableError(issue))
    const stopBudgets = subscribeToBudgets(workspaceId, {}, setBudgets, handleError)
    const stopMembers = subscribeToWorkspaceMembers(workspaceId, setMembers, handleError)
    return () => {
      stopBudgets()
      stopMembers()
    }
  }, [workspaceId])

  const membersById = useMemo(() => new Map(members.map((member) => [member.uid, member])), [members])
  const memberName = (member: WorkspaceMember) => member.displayName || member.email
  const activeMembers = members
    .filter((member) => member.status !== 'removed')
    .sort((a, b) => memberName(a).localeCompare(memberName(b)))
  // Budget days follow the tracked member's timezone, so "today" differs per member.
  const todayFor = (budget: Budget) => zonedDayString(now, progressTimeZone(membersById.get(budget.userId)?.timezone))

  const targetOptions = useMemo(() => buildBudgetTargetOptions(catalog, editing?.target), [catalog, editing])
  const visibleBudgets = budgets ? filterBudgets(budgets, filters, todayFor) : []
  const budgetMembers = new Map<string, string>()
  const budgetTargets = new Map<string, string>()
  for (const budget of budgets ?? []) {
    budgetMembers.set(budget.userId, membersById.get(budget.userId)?.displayName || budget.userDisplayName)
    budgetTargets.set(budgetTargetKey(budget.target), budget.target.name)
  }

  // Weekday inputs are narrow, so their problems are announced once under the group instead of per input.
  const hoursError = fieldErrors.weekdayMinutes ?? WEEKDAYS.map((weekday) => fieldErrors[weekday]).find(Boolean)

  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
  }

  function resetForm() {
    setEditing(undefined)
    setUserId('')
    setTarget(null)
    setStartDay('')
    setEndDay('')
    setHours(EMPTY_HOURS)
    setExceptions([])
    setExceptionDraft('')
    setFieldErrors({})
  }

  function beginEdit(budget: Budget) {
    setEditing(budget)
    setUserId(budget.userId)
    setTarget(
      buildBudgetTargetOptions(catalog, budget.target).find(
        (option) => option.key === budgetTargetKey(budget.target),
      ) ?? null,
    )
    setStartDay(budget.startDay)
    setEndDay(budget.endDay)
    setHours(
      Object.fromEntries(
        WEEKDAYS.map((weekday) => [weekday, formatHoursInput(budget.weekdayMinutes[weekday])]),
      ) as HoursDraft,
    )
    setExceptions(budget.exceptions)
    setExceptionDraft('')
    setFieldErrors({})
    setError('')
    setNotice('')
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    formRef.current?.querySelector<HTMLElement>('select, input')?.focus({ preventScroll: true })
  }

  function addException() {
    if (!exceptionDraft) return
    if (!exceptions.includes(exceptionDraft)) setExceptions([...exceptions, exceptionDraft].sort())
    setExceptionDraft('')
    clearFieldError('exceptions')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    const hourErrors: FieldErrors = {}
    const weekdayMinutes = {} as BudgetInput['weekdayMinutes']
    for (const weekday of WEEKDAYS) {
      const minutes = parseHoursInput(hours[weekday])
      if (minutes === null) hourErrors[weekday] = `Use hours like 7.5 or 7:30 for ${WEEKDAY_LABELS[weekday].long}.`
      else weekdayMinutes[weekday] = minutes
    }
    if (Object.keys(hourErrors).length > 0) {
      setFieldErrors(hourErrors)
      return
    }
    const input: BudgetInput = {
      userId,
      target: { type: target?.type ?? 'project', id: target?.id ?? '' },
      startDay,
      endDay,
      weekdayMinutes,
      exceptions,
    }
    setFieldErrors({})
    setPending(true)
    try {
      await saveBudget(workspaceId, input, editing?.id)
      setNotice(editing ? 'Budget updated.' : 'Budget created.')
      resetForm()
    } catch (issue) {
      if (issue instanceof BudgetFieldError) setFieldErrors({ [issue.field]: issue.message })
      else setError(readableError(issue))
    } finally {
      setPending(false)
    }
  }

  async function archive(budget: Budget, archived: boolean) {
    setPending(true)
    setError('')
    setNotice('')
    try {
      await setBudgetArchived(workspaceId, budget.id, archived)
      if (archived && editing?.id === budget.id) resetForm()
      setNotice(archived ? 'Budget archived. It no longer counts toward progress.' : 'Budget restored.')
    } catch (issue) {
      setError(readableError(issue))
    } finally {
      setPending(false)
    }
  }

  async function remove(budget: Budget) {
    if (
      !window.confirm(
        `Permanently delete ${budget.userDisplayName}’s budget on ${budget.target.name}? This cannot be undone. Time entries are not affected.`,
      )
    )
      return
    setPending(true)
    setError('')
    setNotice('')
    try {
      await deleteBudget(workspaceId, budget.id)
      setNotice('Budget deleted.')
    } catch (issue) {
      setError(readableError(issue))
    } finally {
      setPending(false)
    }
  }

  // An edited budget may belong to a member who has since been removed.
  const memberOptions = activeMembers.map((member) => ({ uid: member.uid, label: memberName(member) }))
  if (editing && !activeMembers.some((member) => member.uid === editing.userId)) {
    memberOptions.push({ uid: editing.userId, label: `${editing.userDisplayName} (removed)` })
  }

  return (
    <SectionCard labelledBy="budgets-heading">
      <SectionHeading
        id="budgets-heading"
        kicker="HOUR TARGETS"
        title="Budgets"
        action={budgets && <Chip label={`${budgets.length} ${budgets.length === 1 ? 'budget' : 'budgets'}`} />}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.6 }}>
        Set how many hours a member should log on a project or client on each weekday. Edits apply to the whole date
        range, including past days.
      </Typography>
      {error && <FormMessage severity="error">{error}</FormMessage>}
      {notice && <FormMessage severity="success">{notice}</FormMessage>}

      <Paper
        ref={formRef}
        component="form"
        variant="outlined"
        noValidate
        onSubmit={(event) => void submit(event)}
        aria-busy={pending}
        aria-labelledby="budget-form-heading"
        sx={{ display: 'grid', gap: 2, mt: 2.5, p: { xs: 2, sm: 2.5 }, borderRadius: '14px', scrollMarginTop: 96 }}
      >
        <Typography variant="h3" id="budget-form-heading">
          {editing ? `Edit ${editing.userDisplayName}’s budget` : 'New budget'}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <SelectField
            label="Member"
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value)
              clearFieldError('userId')
            }}
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
            onChange={(_, option) => {
              setTarget(option)
              clearFieldError('target')
            }}
            groupBy={(option) => option.group}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, current) => option.key === current.key}
            getOptionDisabled={(option) => option.archived && option.key !== target?.key}
            noOptionsText="No matching projects or clients"
            autoHighlight
            openOnFocus
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
          <TextField
            label="Start date"
            type="date"
            value={startDay}
            onChange={(event) => {
              setStartDay(event.target.value)
              clearFieldError('startDay')
            }}
            required
            error={!!fieldErrors.startDay}
            helperText={fieldErrors.startDay}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="End date"
            type="date"
            value={endDay}
            onChange={(event) => {
              setEndDay(event.target.value)
              clearFieldError('endDay')
            }}
            required
            error={!!fieldErrors.endDay}
            helperText={fieldErrors.endDay}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: startDay || undefined } }}
          />
        </Box>

        <Box component="fieldset" aria-describedby="budget-hours-help" sx={{ m: 0, p: 0, border: 0, minWidth: 0 }}>
          <Typography component="legend" variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
            Hours per weekday
          </Typography>
          <Typography
            id="budget-hours-help"
            variant="caption"
            color={hoursError ? 'error' : 'text.secondary'}
            role={hoursError ? 'alert' : undefined}
          >
            {hoursError ?? 'Enter 7.5 or 7:30. Leave a day blank for no target.'}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(4, minmax(0, 1fr))', sm: 'repeat(7, minmax(0, 1fr))' },
              gap: 1,
              mt: 1.5,
            }}
          >
            {WEEKDAYS.map((weekday) => (
              <TextField
                key={weekday}
                size="small"
                label={WEEKDAY_LABELS[weekday].short}
                value={hours[weekday]}
                placeholder="0:00"
                onChange={(event) => {
                  setHours({ ...hours, [weekday]: event.target.value })
                  clearFieldError(weekday)
                  clearFieldError('weekdayMinutes')
                }}
                onBlur={() => {
                  const minutes = parseHoursInput(hours[weekday])
                  if (minutes !== null) setHours((current) => ({ ...current, [weekday]: formatHoursInput(minutes) }))
                }}
                error={!!fieldErrors[weekday] || !!fieldErrors.weekdayMinutes}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { inputMode: 'decimal', 'aria-label': `${WEEKDAY_LABELS[weekday].long} hours` },
                }}
              />
            ))}
          </Box>
        </Box>

        <Box component="fieldset" sx={{ m: 0, p: 0, border: 0, minWidth: 0 }}>
          <Typography component="legend" variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
            Days off
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Dates inside the range with no target, such as holidays or leave.
          </Typography>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.25}
            sx={{ mt: 1.5, alignItems: { sm: 'flex-start' } }}
          >
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
                htmlInput: { min: startDay || undefined, max: endDay || undefined },
              }}
              sx={{ maxWidth: { sm: 220 } }}
            />
            <Button variant="outlined" onClick={addException} disabled={!exceptionDraft} sx={{ flex: '0 0 auto' }}>
              Add day off
            </Button>
          </Stack>
          {exceptions.length > 0 && (
            <Box
              component="ul"
              aria-label="Days off"
              sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, listStyle: 'none', m: 0, mt: 1.5, p: 0 }}
            >
              {exceptions.map((day) => (
                <li key={day}>
                  <Chip
                    label={formatDay(day)}
                    aria-label={`${formatDay(day)}, press Delete to remove`}
                    onDelete={() => setExceptions(exceptions.filter((item) => item !== day))}
                  />
                </li>
              ))}
            </Box>
          )}
        </Box>

        <Stack direction="row" spacing={1.25} sx={{ justifyContent: 'flex-end' }}>
          {editing && (
            <Button onClick={resetForm} disabled={pending}>
              Cancel
            </Button>
          )}
          <Button variant="contained" type="submit" disabled={pending}>
            {pending ? 'Saving…' : editing ? 'Save changes' : 'Create budget'}
          </Button>
        </Stack>
      </Paper>

      <Box component="section" aria-labelledby="budget-list-heading" sx={{ mt: 3.5 }}>
        <Typography variant="h3" id="budget-list-heading">
          All budgets
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
            gap: 1.5,
            mt: 1.5,
            mb: 1,
          }}
        >
          <SelectField
            size="small"
            label="Member"
            value={filters.userId}
            onChange={(event) => setFilters({ ...filters, userId: event.target.value })}
          >
            <option value="">All members</option>
            {[...budgetMembers]
              .sort((a, b) => a[1].localeCompare(b[1]))
              .map(([uid, name]) => (
                <option key={uid} value={uid}>
                  {name}
                </option>
              ))}
          </SelectField>
          <SelectField
            size="small"
            label="Project or client"
            value={filters.targetKey}
            onChange={(event) => setFilters({ ...filters, targetKey: event.target.value })}
          >
            <option value="">All projects and clients</option>
            {[...budgetTargets]
              .sort((a, b) => a[1].localeCompare(b[1]))
              .map(([key, name]) => (
                <option key={key} value={key}>
                  {name} ({key.startsWith('client:') ? 'client' : 'project'})
                </option>
              ))}
          </SelectField>
          <SelectField
            size="small"
            label="Status"
            value={filters.phase}
            onChange={(event) => setFilters({ ...filters, phase: event.target.value as BudgetListFilters['phase'] })}
          >
            <option value="current">Active and upcoming</option>
            <option value="active">Active</option>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </SelectField>
        </Box>
        {budgets === undefined ? (
          <EmptyText>Loading budgets…</EmptyText>
        ) : budgets.length === 0 ? (
          <EmptyText>No budgets yet. Create one above to set a member’s hour target.</EmptyText>
        ) : visibleBudgets.length === 0 ? (
          <EmptyText>No budgets match these filters.</EmptyText>
        ) : (
          visibleBudgets.map((budget) => {
            const phase = budgetPhase(budget, todayFor(budget))
            return (
              <ListRow
                key={budget.id}
                sx={{ flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' } }}
              >
                <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0, overflowWrap: 'anywhere' }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {budget.userDisplayName} · {budget.target.name}
                    </Typography>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={budget.target.type === 'client' ? 'Client' : 'Project'}
                    />
                    <Chip
                      size="small"
                      variant={phase === 'active' ? 'filled' : 'outlined'}
                      color={phase === 'active' ? 'success' : 'default'}
                      label={PHASE_LABELS[phase]}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {formatDay(budget.startDay)} – {formatDay(budget.endDay)} · {weekdaySummary(budget.weekdayMinutes)}
                    {budget.exceptions.length > 0 &&
                      ` · ${budget.exceptions.length} ${budget.exceptions.length === 1 ? 'day off' : 'days off'}`}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} sx={{ flex: '0 0 auto', justifyContent: 'flex-end' }}>
                  {budget.archived ? (
                    <>
                      <Button size="small" onClick={() => void archive(budget, false)} disabled={pending}>
                        Restore
                      </Button>
                      <Button size="small" color="error" onClick={() => void remove(budget)} disabled={pending}>
                        Delete
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="small" onClick={() => beginEdit(budget)} disabled={pending}>
                        Edit
                      </Button>
                      <Button size="small" color="error" onClick={() => void archive(budget, true)} disabled={pending}>
                        Archive
                      </Button>
                    </>
                  )}
                </Stack>
              </ListRow>
            )
          })
        )}
        {budgets && budgets.some((budget) => !budget.archived) && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Archive a budget to stop counting it. Archived budgets can be restored or permanently deleted.
          </Typography>
        )}
      </Box>
    </SectionCard>
  )
}
