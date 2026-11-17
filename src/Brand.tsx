import Box from '@mui/material/Box'
import Link from '@mui/material/Link'

/** `compact` shows only the logo mark, for the collapsed sidebar rail. */
export function Brand({ tone = 'dark', compact = false }: { tone?: 'dark' | 'light'; compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Tickness home"
      underline="none"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1.25,
        color: tone === 'light' ? 'app.sidebar.strong' : 'text.primary',
        fontSize: 20,
        fontWeight: 700,
        letterSpacing: '-0.8px',
      }}
    >
      <Box
        component="span"
        aria-hidden="true"
        sx={{
          display: 'grid',
          width: 30,
          height: 30,
          placeItems: 'center',
          borderRadius: '10px',
          bgcolor: tone === 'light' ? 'app.sidebar.strong' : 'primary.main',
        }}
      >
        <Box
          component="svg"
          viewBox="0 0 24 24"
          fill="none"
          sx={{
            width: 19,
            stroke: (theme) => (tone === 'light' ? theme.palette.app.sidebar.bg : theme.palette.primary.contrastText),
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            strokeWidth: 2.25,
          }}
        >
          <circle cx="12" cy="12.5" r="7.5" />
          <path d="M12 3v2.5" />
          <path d="m8.75 12.75 2.5 2.5 4.5-5.5" />
        </Box>
      </Box>
      {!compact && <span>tickness</span>}
    </Link>
  )
}
