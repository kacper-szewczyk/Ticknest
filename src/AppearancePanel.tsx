import type { User } from 'firebase/auth'
import { useState, type ChangeEvent, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Typography from '@mui/material/Typography'
import { savePalettePreference } from './lib/userPreferences'
import { usePalette } from './paletteContext'
import { isPaletteChoice, PALETTE_IDS, PALETTES, type PaletteChoice, type PaletteDefinition } from './palettes'
import { FormMessage, SectionCard, SectionHeading } from './ui'

const LIGHT_PALETTES = PALETTE_IDS.map((id) => PALETTES[id]).filter((palette) => palette.mode === 'light')
const DARK_PALETTES = PALETTE_IDS.map((id) => PALETTES[id]).filter((palette) => palette.mode === 'dark')

export function AppearancePanel({ user }: { user: User }) {
  const { choice, applyPalette } = usePalette()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value
    if (!isPaletteChoice(next) || next === choice) return
    const previous = choice
    setPending(true)
    setError('')
    setNotice('')
    // Preview immediately; revert if the profile write is rejected.
    applyPalette(next)
    try {
      await savePalettePreference(user, next)
      setNotice('Palette saved. It will follow you on any device you sign in to.')
    } catch (saveError) {
      console.error(saveError)
      applyPalette(previous)
      setError('We couldn’t save your palette. Check your connection and try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <SectionCard labelledBy="appearance-heading">
      <SectionHeading id="appearance-heading" kicker="APPEARANCE" title="Color palette" />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.6 }}>
        Choose how Ticknest looks for you. Other workspace members keep their own palettes.
      </Typography>
      {error && <FormMessage severity="error">{error}</FormMessage>}
      {notice && <FormMessage severity="success">{notice}</FormMessage>}
      <RadioGroup
        name="palette"
        value={choice}
        onChange={(event) => void handleChange(event)}
        aria-labelledby="appearance-heading"
        aria-busy={pending}
        sx={{ display: 'grid', gap: 2.5, mt: 2.5 }}
      >
        <PaletteGroup title="Automatic">
          <PaletteOption
            value="system"
            label="Match system"
            description="Forest by day, Forest Night when your device uses dark mode."
            swatches={[PALETTES.forest, PALETTES['forest-night']]}
            disabled={pending}
          />
        </PaletteGroup>
        <PaletteGroup title="Light">
          {LIGHT_PALETTES.map((palette) => (
            <PaletteOption
              key={palette.id}
              value={palette.id}
              label={palette.name}
              description={palette.description}
              swatches={[palette]}
              disabled={pending}
            />
          ))}
        </PaletteGroup>
        <PaletteGroup title="Dark">
          {DARK_PALETTES.map((palette) => (
            <PaletteOption
              key={palette.id}
              value={palette.id}
              label={palette.name}
              description={palette.description}
              swatches={[palette]}
              disabled={pending}
            />
          ))}
        </PaletteGroup>
      </RadioGroup>
    </SectionCard>
  )
}

function PaletteGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box role="group" aria-label={`${title} palettes`}>
      <Typography variant="h3" component="p" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
        {children}
      </Box>
    </Box>
  )
}

function PaletteOption({
  value,
  label,
  description,
  swatches,
  disabled,
}: {
  value: PaletteChoice
  label: string
  description: string
  swatches: PaletteDefinition[]
  disabled: boolean
}) {
  return (
    <FormControlLabel
      value={value}
      disabled={disabled}
      control={<Radio size="small" />}
      label={
        <Box sx={{ display: 'grid', gap: 0.75, py: 0.5, minWidth: 0 }}>
          <Box aria-hidden="true" sx={{ display: 'flex', gap: 0.75 }}>
            {swatches.map((palette) => (
              <PaletteSwatch key={palette.id} palette={palette} />
            ))}
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 650 }}>
            {label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {description}
          </Typography>
        </Box>
      }
      sx={{
        alignItems: 'flex-start',
        m: 0,
        p: 1.25,
        pl: 0.5,
        border: 1,
        borderColor: 'app.border',
        borderRadius: '12px',
        '&:has(.Mui-checked)': { borderColor: 'primary.main', bgcolor: 'app.tint' },
        '& .MuiRadio-root': { mt: 0.25 },
      }}
    />
  )
}

// A miniature of the app: sidebar, page background, a card, and the primary and billable accents.
function PaletteSwatch({ palette }: { palette: PaletteDefinition }) {
  return (
    <Box
      sx={{
        display: 'flex',
        width: 92,
        height: 40,
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid',
        borderColor: palette.app.border,
      }}
    >
      <Box sx={{ width: 22, bgcolor: palette.app.sidebar.bg }} />
      <Box
        sx={{
          flex: 1,
          display: 'grid',
          alignContent: 'center',
          gap: 0.5,
          px: 0.75,
          bgcolor: palette.background.default,
        }}
      >
        <Box
          sx={{
            height: 8,
            borderRadius: '3px',
            bgcolor: palette.background.paper,
            border: '1px solid',
            borderColor: palette.app.border,
          }}
        />
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Box sx={{ width: 20, height: 7, borderRadius: '3px', bgcolor: palette.primary.main }} />
          <Box sx={{ width: 12, height: 7, borderRadius: '3px', bgcolor: palette.app.segment.billable }} />
        </Box>
      </Box>
    </Box>
  )
}
