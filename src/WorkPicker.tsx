import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import ListSubheader from '@mui/material/ListSubheader'
import { alpha } from '@mui/material/styles'
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
      renderGroup={(params) => (
        <li key={params.key}>
          <ListSubheader
            component="div"
            sx={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 1,
              lineHeight: 2.5,
              bgcolor: 'background.paper',
              borderTop: 1,
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 'inherit', fontSize: 10 }}>
              Client
            </Typography>
            <Typography variant="body2" component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {params.group}
            </Typography>
          </ListSubheader>
          <Box component="ul" sx={{ p: 0 }}>
            {params.children}
          </Box>
        </li>
      )}
      renderOption={({ key, ...props }, option) => {
        const isTask = option.kind === 'task'
        return (
          <Box
            component="li"
            key={key}
            {...props}
            sx={{
              gap: 1.25,
              minHeight: isTask ? 36 : 44,
              ...(isTask
                ? { pl: '28px !important' }
                : { borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }),
            }}
          >
            {isTask ? (
              // Tree elbow tying the task to the project row above it.
              <Box
                aria-hidden
                sx={{
                  alignSelf: 'flex-start',
                  width: 14,
                  height: 18,
                  mt: '-6px',
                  flexShrink: 0,
                  borderLeft: 2,
                  borderBottom: 2,
                  borderBottomLeftRadius: 6,
                  borderColor: option.color ? alpha(option.color, 0.6) : 'divider',
                }}
              />
            ) : (
              <Box
                aria-hidden
                sx={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, bgcolor: option.color ?? 'divider' }}
              />
            )}
            <Typography
              variant="body2"
              noWrap
              sx={{ flex: 1, fontWeight: isTask ? 400 : 650 }}
              color={isTask ? 'text.secondary' : 'text.primary'}
            >
              {isTask ? option.taskName : option.kind === 'project' ? option.projectName : 'Client only'}
              {option.archived ? ' (archived)' : ''}
            </Typography>
            {option.billable && (
              <Typography variant="caption" color="success.main" sx={{ flexShrink: 0 }}>
                Billable
              </Typography>
            )}
            <Typography
              variant="overline"
              color="text.disabled"
              sx={{ flexShrink: 0, width: 52, textAlign: 'right', fontSize: 10, lineHeight: 1 }}
            >
              {isTask ? 'Task' : option.kind === 'project' ? 'Project' : 'Client'}
            </Typography>
          </Box>
        )
      }}
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
