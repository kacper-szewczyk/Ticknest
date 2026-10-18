import { createTheme, type Theme } from '@mui/material/styles'
import type { AppColors, PaletteDefinition } from './palettes'

declare module '@mui/material/styles' {
  interface Palette {
    app: AppColors
  }
  interface PaletteOptions {
    app?: AppColors
  }
}

const serif = "Georgia, 'Times New Roman', serif"

export function createAppTheme(palette: PaletteDefinition): Theme {
  const { app } = palette
  return createTheme({
    palette: {
      mode: palette.mode,
      primary: palette.primary,
      error: { main: palette.error },
      success: { main: palette.success },
      warning: { main: palette.warning },
      background: palette.background,
      text: palette.text,
      divider: palette.divider,
      app,
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      h1: {
        fontFamily: serif,
        fontWeight: 400,
        fontSize: 'clamp(2.25rem, 6vw, 3.5rem)',
        letterSpacing: '-0.035em',
        lineHeight: 1.06,
      },
      h2: { fontFamily: serif, fontWeight: 400, fontSize: '1.65rem', lineHeight: 1.2 },
      h3: { fontSize: '0.8125rem', fontWeight: 700, lineHeight: 1.4, color: app.heading },
      overline: {
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.12em',
        lineHeight: 1.6,
        color: palette.text.secondary,
      },
      button: { textTransform: 'none', fontWeight: 650 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { minWidth: 320 },
          '#root': { minHeight: '100vh' },
          '::selection': { background: app.selection, color: app.selectionText },
          // Keep a strong, consistent keyboard focus ring on buttons, checkboxes, and links.
          '.MuiButtonBase-root.Mui-focusVisible, a:focus-visible': {
            outline: `3px solid ${app.focus}`,
            outlineOffset: 2,
          },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              scrollBehavior: 'auto !important',
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              transitionDuration: '0.01ms !important',
            },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { minHeight: 44 } },
      },
      MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
      // Dark palettes use flat surfaces; MUI's default dark-mode overlay would tint every paper.
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' }, outlined: { borderColor: app.border } } },
      MuiChip: { defaultProps: { size: 'small' } },
    },
  })
}
