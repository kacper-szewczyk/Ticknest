import { decomposeColor, getContrastRatio } from '@mui/material/styles'
import { describe, expect, it } from 'vitest'
import { PALETTES, type PaletteDefinition } from '../../src/palettes'
import { createAppTheme } from '../../src/theme'

// WCAG 2.1 AA: 4.5:1 for normal text (1.4.3), 3:1 for focus indicators and meaningful icons (1.4.11).
const TEXT = 4.5
const NON_TEXT = 3

type Pair = { name: string; fg: (p: PaletteDefinition) => string; bg: (p: PaletteDefinition) => string; min: number }

const PAIRS: Pair[] = [
  { name: 'text.primary on paper', fg: (p) => p.text.primary, bg: (p) => p.background.paper, min: TEXT },
  { name: 'text.primary on default', fg: (p) => p.text.primary, bg: (p) => p.background.default, min: TEXT },
  { name: 'text.secondary on paper', fg: (p) => p.text.secondary, bg: (p) => p.background.paper, min: TEXT },
  { name: 'text.secondary on default', fg: (p) => p.text.secondary, bg: (p) => p.background.default, min: TEXT },
  { name: 'focus ring on paper', fg: (p) => p.app.focus, bg: (p) => p.background.paper, min: NON_TEXT },
  { name: 'focus ring on default', fg: (p) => p.app.focus, bg: (p) => p.background.default, min: NON_TEXT },
  { name: 'sidebar.text on sidebar', fg: (p) => p.app.sidebar.text, bg: (p) => p.app.sidebar.bg, min: TEXT },
  { name: 'sidebar.muted on sidebar', fg: (p) => p.app.sidebar.muted, bg: (p) => p.app.sidebar.bg, min: TEXT },
  { name: 'sidebar.faint on sidebar', fg: (p) => p.app.sidebar.faint, bg: (p) => p.app.sidebar.bg, min: TEXT },
  { name: 'sidebar.strong on sidebar', fg: (p) => p.app.sidebar.strong, bg: (p) => p.app.sidebar.bg, min: TEXT },
  // Focus ring used by every control on the sidebar background (see AppShell).
  {
    name: 'sidebar focus ring on sidebar',
    fg: (p) => p.app.sidebar.accent,
    bg: (p) => p.app.sidebar.bg,
    min: NON_TEXT,
  },
  // Only used for decorative icons; if it ever carries text, raise this to TEXT.
  { name: 'warmSoftText on warmSoft', fg: (p) => p.app.warmSoftText, bg: (p) => p.app.warmSoft, min: NON_TEXT },
  // Contained error buttons (the timer's Stop): resting background is error.main, hover/active is error.dark.
  // Read from the built theme so MUI's derived values are what gets checked.
  {
    name: 'error button text at rest',
    fg: (p) => themeError(p).contrastText,
    bg: (p) => themeError(p).main,
    min: TEXT,
  },
  {
    name: 'error button text on hover',
    fg: (p) => themeError(p).contrastText,
    bg: (p) => themeError(p).dark,
    min: TEXT,
  },
]

function themeError(palette: PaletteDefinition) {
  const { error } = createAppTheme(palette).palette
  // getContrastRatio ignores alpha, so a translucent text colour would be measured as if it were opaque.
  for (const colour of [error.main, error.dark, error.contrastText]) expect(alpha(colour)).toBe(1)
  return error
}

function alpha(colour: string): number {
  const { type, values } = decomposeColor(colour)
  return type.endsWith('a') ? (values[3] ?? 1) : 1
}

describe('palette contrast', () => {
  const cases = Object.values(PALETTES).flatMap((palette) => PAIRS.map((pair) => ({ palette, pair })))

  it.each(cases.map(({ palette, pair }) => [palette.id, pair.name, palette, pair] as const))(
    '%s: %s meets AA',
    (_id, _name, palette, pair) => {
      expect(getContrastRatio(pair.fg(palette), pair.bg(palette))).toBeGreaterThanOrEqual(pair.min)
    },
  )
})
