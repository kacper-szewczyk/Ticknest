import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMemo } from 'react'
import type { Catalog } from './lib/catalog'
import {
  buildWorkOptions,
  filterWorkOptions,
  type WorkDetails,
  type WorkOption,
  type WorkSelection,
  workDetails,
  workOptionKey,
  workOptionLabel,
} from './lib/workOptions'

// Searchable client → project → task picker. Picking a task also applies its billable default.
export function WorkPicker({
  catalog,
  value,
  onChange,
  size,
  disabled,
  label = 'Project / task',
}: {
  catalog: Catalog
  value: WorkSelection
  onChange: (details: WorkDetails) => void
  size?: 'small' | 'medium'
  disabled?: boolean
  label?: string
}) {
  // Options keep the stored selection visible even after it was archived.
  const { clientId, projectId, taskId } = value
  const options = useMemo(
    () => buildWorkOptions(catalog, { clientId, projectId, taskId }),
    [catalog, clientId, projectId, taskId],
  )
  const selectedKey = workOptionKey(value)
  const selected = options.find((option) => option.key === selectedKey) ?? null

  return (
    <Autocomplete<WorkOption>
      size={size}
      disabled={disabled}
      options={options}
      value={selected}
      onChange={(_, option) => onChange(workDetails(option))}
      groupBy={(option) => option.group}
      getOptionLabel={workOptionLabel}
      isOptionEqualToValue={(option, current) => option.key === current.key}
      filterOptions={(items, state) => filterWorkOptions(items, state.inputValue)}
      getOptionDisabled={(option) => option.archived && option.key !== selectedKey}
      noOptionsText="No matching projects or tasks"
      autoHighlight
      openOnFocus
      renderOption={({ key, ...props }, option) => (
        <Box
          component="li"
          key={key}
          {...props}
          sx={{ gap: 1, pl: option.kind === 'task' ? '40px !important' : undefined }}
        >
          {option.kind === 'project' && (
            <Box
              aria-hidden
              sx={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, bgcolor: option.color ?? 'divider' }}
            />
          )}
          <Typography
            variant="body2"
            noWrap
            sx={{ flex: 1, fontWeight: option.kind === 'task' ? 400 : 600 }}
            color={option.kind === 'task' ? 'text.secondary' : 'text.primary'}
          >
            {option.kind === 'task' ? option.taskName : option.kind === 'project' ? option.projectName : 'Client only'}
            {option.archived ? ' (archived)' : ''}
          </Typography>
          {option.billable && (
            <Typography variant="caption" color="success.main" sx={{ flexShrink: 0 }}>
              Billable
            </Typography>
          )}
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder="Search client, project, or task"
          slotProps={{ ...params.slotProps, inputLabel: { ...params.slotProps?.inputLabel, shrink: true } }}
        />
      )}
      sx={{ minWidth: 0 }}
    />
  )
}
