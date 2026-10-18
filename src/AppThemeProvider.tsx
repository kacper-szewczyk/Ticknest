import { useCallback, useMemo, useState, type ReactNode } from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import useMediaQuery from '@mui/material/useMediaQuery'
import { ThemeProvider } from '@mui/material/styles'
import { PaletteContext } from './paletteContext'
import { cachePaletteChoice, DEFAULT_PALETTE_CHOICE, getCachedPaletteChoice, resolvePalette, type PaletteChoice } from './palettes'
import { createAppTheme } from './theme'

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<PaletteChoice>(() => getCachedPaletteChoice() ?? DEFAULT_PALETTE_CHOICE)
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true })
  const theme = useMemo(() => createAppTheme(resolvePalette(choice, prefersDark)), [choice, prefersDark])

  const applyPalette = useCallback((next: PaletteChoice) => {
    setChoice(next)
    cachePaletteChoice(next)
  }, [])
  const context = useMemo(() => ({ choice, applyPalette }), [choice, applyPalette])

  return (
    <PaletteContext value={context}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </PaletteContext>
  )
}
