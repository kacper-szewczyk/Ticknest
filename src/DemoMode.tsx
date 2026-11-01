// Demo mode UI, shown only in builds with VITE_DEMO_MODE=true.
//
// Each exported component only checks `import.meta.env.VITE_DEMO_MODE` and renders a private content component.
// Vite replaces the expression at build time, so with the flag off the content components (and the account list and
// schedule they use) are unreachable and tree-shaken. Keep the check inline: not in a helper or a module constant,
// and not after hooks, whose arguments would stay reachable.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useId, useState } from 'react'
import { DEMO_ACCOUNTS, formatDemoReset, nextDemoReset, type DemoAccount, type DemoAccountRole } from './lib/demo'

const ROLE_LABELS: Record<DemoAccountRole, string> = { owner: 'Owner', manager: 'Manager', member: 'Member' }

/** A non-dismissible notice that the demo data resets daily, with the next reset in the viewer's local time. */
export function DemoResetBanner() {
  if (import.meta.env.VITE_DEMO_MODE !== 'true') return null
  return <ResetBanner />
}

/** The seeded demo accounts, each with a button that fills the sign-in form. */
export function DemoAccountsPanel({ onUse }: { onUse: (account: DemoAccount) => void }) {
  if (import.meta.env.VITE_DEMO_MODE !== 'true') return null
  return <AccountsPanel onUse={onUse} />
}

function ResetBanner() {
  const [reset] = useState(() => nextDemoReset(new Date()))
  return (
    <Box
      component="section"
      aria-label="Demo notice"
      sx={{
        px: { xs: 2, sm: 3 },
        py: 1,
        bgcolor: 'app.accentSoft',
        color: 'app.accentSoftText',
        fontSize: 13,
        lineHeight: 1.5,
        textAlign: 'center',
      }}
    >
      <Box component="strong" sx={{ fontWeight: 700 }}>
        Public demo.
      </Box>{' '}
      All data is reset every 24 hours and anything you add is removed. Next reset:{' '}
      <Box component="time" dateTime={reset.toISOString()} sx={{ fontWeight: 650, whiteSpace: 'nowrap' }}>
        {formatDemoReset(reset)}
      </Box>
      .
    </Box>
  )
}

function AccountsPanel({ onUse }: { onUse: (account: DemoAccount) => void }) {
  const headingId = useId()
  const rowIdPrefix = useId()
  const [announcement, setAnnouncement] = useState('')
  return (
    <Paper
      component="section"
      variant="outlined"
      aria-labelledby={headingId}
      sx={{ mb: 3, p: 2, borderRadius: '11px', borderColor: 'app.tintBorder', bgcolor: 'app.tint' }}
    >
      <Typography variant="h3" component="h3" id={headingId}>
        Try the demo
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5, lineHeight: 1.5 }}>
        Sign in with a sample account. Every account uses the password{' '}
        <Box component="code" sx={{ fontWeight: 650, color: 'text.primary' }}>
          {DEMO_ACCOUNTS[0]?.password}
        </Box>
        . Data resets every 24 hours.
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
        {DEMO_ACCOUNTS.map((account, index) => {
          const rowId = `${rowIdPrefix}-${index}`
          return (
            <Box
              component="li"
              key={account.email}
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, minWidth: 0 }}
            >
              <Box id={rowId} sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 650 }}>
                  {ROLE_LABELS[account.role]}
                  <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>
                    {' · '}
                    {account.displayName}
                  </Box>
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap component="p">
                  {account.email}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                aria-describedby={rowId}
                onClick={() => {
                  onUse(account)
                  setAnnouncement(`Filled in the ${ROLE_LABELS[account.role].toLowerCase()} account ${account.email}.`)
                }}
                sx={{ flexShrink: 0 }}
              >
                Use this account
              </Button>
            </Box>
          )
        })}
      </Box>
      <Box role="status" sx={visuallyHiddenSx}>
        {announcement}
      </Box>
    </Paper>
  )
}

const visuallyHiddenSx = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
} as const
