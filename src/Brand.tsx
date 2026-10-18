import Box from '@mui/material/Box'
import Link from '@mui/material/Link'

export function Brand({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  return (
    <Link
      href="/"
      aria-label="Ticknest home"
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
            strokeWidth: 2.5,
          }}
        >
          <path d="M5 13.5 9.2 18 19 6" />
        </Box>
      </Box>
      <span>ticknest</span>
    </Link>
  )
}
