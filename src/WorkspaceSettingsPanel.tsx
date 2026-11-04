import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { type FormEvent, useState } from 'react'
import type { WeekStart } from './lib/dates'
import { readableError } from './lib/errors'
import { type Workspace, updateWorkspaceSettings } from './lib/workspaces'
import { type WorkspaceSettings, validateWorkspaceSettings, WORKSPACE_NAME_MAX_LENGTH } from './lib/workspaceSettings'
import { FormMessage, SectionCard, SectionHeading } from './ui'

const WEEK_START_LABELS: Record<WeekStart, string> = { 1: 'Monday', 0: 'Sunday' }

type Props = {
  workspace: Workspace
  /** Called after a successful save so the sidebar and week boundaries pick up the new values. */
  onSaved: (settings: WorkspaceSettings) => Promise<void> | void
}

export function WorkspaceSettingsPanel({ workspace, onSaved }: Props) {
  const isOwner = workspace.role === 'owner'
  const savedWeekStart: WeekStart = workspace.weekStartsOn === 0 ? 0 : 1
  const [name, setName] = useState(workspace.name)
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStart>(savedWeekStart)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const unchanged = name.trim() === workspace.name && weekStartsOn === savedWeekStart

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    const result = validateWorkspaceSettings({ name, weekStartsOn })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPending(true)
    try {
      await updateWorkspaceSettings(workspace.id, result.value)
      setName(result.value.name)
      await onSaved(result.value)
      setNotice('Workspace settings saved. Everyone in the workspace sees the change the next time they load it.')
    } catch (saveError) {
      setError(readableError(saveError))
    } finally {
      setPending(false)
    }
  }

  return (
    <SectionCard labelledBy="workspace-settings-heading">
      <SectionHeading id="workspace-settings-heading" kicker="WORKSPACE SETTINGS" title="Name and week start" />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.6 }}>
        {isOwner
          ? 'These settings apply to everyone in the workspace. The week start sets where timesheet, dashboard and budget weeks begin.'
          : 'Only the workspace owner can change these settings.'}
      </Typography>
      {error && <FormMessage severity="error">{error}</FormMessage>}
      {notice && <FormMessage severity="success">{notice}</FormMessage>}
      {isOwner ? (
        <Box
          component="form"
          onSubmit={(event: FormEvent<HTMLFormElement>) => void handleSubmit(event)}
          sx={{ display: 'grid', gap: 2.25, mt: 2.5, maxWidth: 460 }}
        >
          <TextField
            label="Workspace name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            disabled={pending}
            slotProps={{ htmlInput: { maxLength: WORKSPACE_NAME_MAX_LENGTH } }}
          />
          <div>
            <Typography id="settings-week-start-label" variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
              Week starts on
            </Typography>
            <ToggleButtonGroup
              aria-labelledby="settings-week-start-label"
              exclusive
              size="small"
              color="primary"
              value={weekStartsOn}
              onChange={(_, value: WeekStart | null) => {
                // Ignore clicks on the selected button so one option always stays chosen.
                if (value !== null) setWeekStartsOn(value)
              }}
              disabled={pending}
            >
              <ToggleButton value={1} sx={{ px: 2 }}>
                Monday
              </ToggleButton>
              <ToggleButton value={0} sx={{ px: 2 }}>
                Sunday
              </ToggleButton>
            </ToggleButtonGroup>
          </div>
          <div>
            <Button variant="contained" type="submit" disabled={pending || unchanged}>
              Save settings
            </Button>
          </div>
        </Box>
      ) : (
        <Box
          component="dl"
          sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 3, rowGap: 1, mt: 2.5, mb: 0 }}
        >
          <Typography component="dt" variant="body2" color="text.secondary">
            Workspace name
          </Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>
            {workspace.name}
          </Typography>
          <Typography component="dt" variant="body2" color="text.secondary">
            Week starts on
          </Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0 }}>
            {WEEK_START_LABELS[savedWeekStart]}
          </Typography>
        </Box>
      )}
    </SectionCard>
  )
}
