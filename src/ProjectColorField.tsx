import { useId, useState, type ChangeEvent } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { Theme } from '@mui/material/styles'
import { PROJECT_COLORS, presetProjectColor } from './lib/projectColors'

const SWATCH = 28

// A native radio inside each swatch keeps the browser's radio-group keyboard handling (arrow keys move and
// select, Tab leaves the group) and gives every swatch an accessible name.
const swatchSx = {
  position: 'relative',
  width: SWATCH,
  height: SWATCH,
  borderRadius: '50%',
  cursor: 'pointer',
  display: 'grid',
  placeItems: 'center',
  outlineOffset: 4,
  '&:has(input:focus-visible)': { outline: 2, outlineStyle: 'solid', outlineColor: 'primary.main' },
  '&:has(input:checked)': {
    boxShadow: (theme: Theme) => `0 0 0 2px ${theme.palette.background.paper}, 0 0 0 4px ${theme.palette.text.primary}`,
  },
} as const

// The radio covers its swatch, invisible, so clicks and focus land on it.
const radioStyle = { position: 'absolute', inset: 0, margin: 0, opacity: 0, cursor: 'pointer' } as const

/** Picks a project color from preset swatches, or a custom one with the native color input. */
export function ProjectColorField({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const name = useId()
  const [custom, setCustom] = useState(() => !presetProjectColor(value))
  const selected = custom ? 'custom' : presetProjectColor(value)?.value

  return (
    <Box component="fieldset" sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
      <Typography component="legend" variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Color
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25 }}>
        {PROJECT_COLORS.map((preset) => (
          <Box component="label" key={preset.value} title={preset.name} sx={{ ...swatchSx, bgcolor: preset.value }}>
            <input
              type="radio"
              name={name}
              value={preset.value}
              checked={selected === preset.value}
              onChange={() => {
                setCustom(false)
                onChange(preset.value)
              }}
              aria-label={preset.name}
              style={radioStyle}
            />
            {selected === preset.value && (
              <Box component="span" aria-hidden sx={{ color: '#fff', fontSize: 14, lineHeight: 1 }}>
                ✓
              </Box>
            )}
          </Box>
        ))}
        <Box
          component="label"
          title="Custom"
          sx={{
            ...swatchSx,
            background: 'conic-gradient(#c62828, #b7791f, #2e7d32, #00838f, #1565c0, #6a1b9a, #c62828)',
          }}
        >
          <input
            type="radio"
            name={name}
            value="custom"
            checked={custom}
            onChange={() => setCustom(true)}
            aria-label="Custom color"
            style={radioStyle}
          />
        </Box>
        {custom && (
          <Box
            component="input"
            type="color"
            value={value}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
            aria-label="Custom color value"
            sx={{
              width: 48,
              height: SWATCH + 4,
              p: 0.25,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              bgcolor: 'transparent',
              cursor: 'pointer',
            }}
          />
        )}
      </Box>
    </Box>
  )
}
