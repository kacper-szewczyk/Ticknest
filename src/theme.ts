import { createTheme } from '@mui/material/styles'

const serif = "Georgia, 'Times New Roman', serif"

export const theme = createTheme({
  palette: {
    primary: { main: '#254332', light: '#416b4c', dark: '#1d3728', contrastText: '#fff' },
    error: { main: '#984b3e' },
    success: { main: '#386b43' },
    warning: { main: '#94651f' },
    background: { default: '#f8f8f5', paper: '#fff' },
    text: { primary: '#24342a', secondary: '#59665b' },
    divider: '#e8e9e4',
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    h1: { fontFamily: serif, fontWeight: 400, fontSize: 'clamp(2.25rem, 6vw, 3.5rem)', letterSpacing: '-0.035em', lineHeight: 1.06 },
    h2: { fontFamily: serif, fontWeight: 400, fontSize: '1.65rem', lineHeight: 1.2 },
    h3: { fontSize: '0.8125rem', fontWeight: 700, lineHeight: 1.4, color: '#526052' },
    overline: { fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.12em', lineHeight: 1.6, color: '#59665b' },
    button: { textTransform: 'none', fontWeight: 650 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { minWidth: 320 },
        '#root': { minHeight: '100vh' },
        '::selection': { background: '#dbe8d7', color: '#203329' },
        // Keep a strong, consistent keyboard focus ring on buttons, checkboxes, and links.
        '.MuiButtonBase-root.Mui-focusVisible, a:focus-visible': { outline: '3px solid #2f6e42', outlineOffset: 2 },
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
    MuiPaper: { styleOverrides: { outlined: { borderColor: '#e5e9e1' } } },
    MuiChip: { defaultProps: { size: 'small' } },
  },
})
