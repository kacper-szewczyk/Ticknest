import { useCallback, useMemo, useState, type ReactNode } from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import useMediaQuery from '@mui/material/useMediaQuery'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { enUS, esES, plPL } from '@mui/material/locale'
import { useAppLanguage } from './i18n'
import type { AppLanguage } from './i18n/languages'
import { PaletteContext } from './paletteContext'
import {
  cachePaletteChoice,
  DEFAULT_PALETTE_CHOICE,
  getCachedPaletteChoice,
  resolvePalette,
  type PaletteChoice,
} from './palettes'
import { createAppTheme } from './theme'

// MUI's own text (pagination, autocomplete, and similar) in the active language.
const MUI_LOCALES = { en: enUS, es: esES, pl: plPL } satisfies Record<AppLanguage, unknown>

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<PaletteChoice>(() => getCachedPaletteChoice() ?? DEFAULT_PALETTE_CHOICE)
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true })
  const language = useAppLanguage()
  const theme = useMemo(
    () => createTheme(createAppTheme(resolvePalette(choice, prefersDark)), MUI_LOCALES[language]),
    [choice, prefersDark, language],
  )

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
