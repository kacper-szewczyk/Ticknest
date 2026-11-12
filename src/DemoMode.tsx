// Demo mode UI, shown only in builds with VITE_DEMO_MODE=true.
//
// Each exported component only checks `import.meta.env.VITE_DEMO_MODE` and renders a private content component.
// Vite replaces the expression at build time, so with the flag off the content components (and the account list and
// schedule they use) are unreachable and tree-shaken. Keep the check inline: not in a helper or a module constant,
// and not after hooks, whose arguments would stay reachable.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useId, useState, type ReactNode } from 'react'
import {
  DEMO_ACCOUNTS,
  DEMO_CONTACT_EMAIL,
  DEMO_CONTACT_LINKEDIN_URL,
  DEMO_SOURCE_URL,
  DEMO_SUPPORT_URL,
  formatDemoReset,
  nextDemoReset,
  type DemoAccount,
  type DemoAccountRole,
} from './lib/demo'

const ROLE_LABELS: Record<DemoAccountRole, string> = { owner: 'Owner', manager: 'Manager', member: 'Member' }

/** A non-dismissible notice that the demo data resets daily, with the next reset in the viewer's local time. */
export function DemoResetBanner() {
  if (import.meta.env.VITE_DEMO_MODE !== 'true') return null
  return <ResetBanner />
}

type AccountsPanelProps = { onUse: (account: DemoAccount) => void; disabled?: boolean }

/** The seeded demo accounts, each with a button that signs in as that account. */
export function DemoAccountsPanel({ onUse, disabled }: AccountsPanelProps) {
  if (import.meta.env.VITE_DEMO_MODE !== 'true') return null
  return <AccountsPanel onUse={onUse} disabled={disabled} />
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
      .{' '}
      <ExternalLink href={DEMO_SOURCE_URL} color="inherit" sx={{ fontWeight: 650 }}>
        View the source on GitHub
      </ExternalLink>
      {' · '}
      <ExternalLink href={DEMO_SUPPORT_URL} color="inherit" sx={{ fontWeight: 650 }}>
        Buy me a coffee
      </ExternalLink>
    </Box>
  )
}

type ExternalLinkProps = { href: string; children: ReactNode; color?: 'inherit'; sx?: { fontWeight: number } }

/** Opens in a new tab, so leaving the demo does not lose the visitor's place. */
function ExternalLink({ href, children, color, sx }: ExternalLinkProps) {
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" color={color} sx={{ whiteSpace: 'nowrap', ...sx }}>
      {children}
    </Link>
  )
}

function AccountsPanel({ onUse, disabled = false }: AccountsPanelProps) {
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
        . Data resets every 24 hours. <ExternalLink href={DEMO_SOURCE_URL}>View the source on GitHub</ExternalLink>
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
                disabled={disabled}
                onClick={() => {
                  onUse(account)
                  setAnnouncement(
                    `Signing in with the ${ROLE_LABELS[account.role].toLowerCase()} account ${account.email}.`,
                  )
                }}
                sx={{ flexShrink: 0 }}
              >
                Use this account
              </Button>
            </Box>
          )
        })}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.5 }}>
        <Box component="strong" sx={{ fontWeight: 650, color: 'text.primary' }}>
          Love Ticknest? Help keep it free.
        </Box>{' '}
        <ExternalLink href={DEMO_SUPPORT_URL} sx={{ fontWeight: 650 }}>
          <span aria-hidden="true">☕ </span>Buy me a coffee<span aria-hidden="true"> →</span>
        </ExternalLink>
        {' · '}
        <ExternalLink href={DEMO_SOURCE_URL} sx={{ fontWeight: 650 }}>
          <span aria-hidden="true">⭐ </span>Star it on GitHub<span aria-hidden="true"> →</span>
        </ExternalLink>
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.5 }}>
        <Box component="strong" sx={{ fontWeight: 650, color: 'text.primary' }}>
          Want Ticknest set up for your team, or need a feature it doesn&apos;t have yet?
        </Box>{' '}
        I&apos;ll help you get there.{' '}
        <Link href={`mailto:${DEMO_CONTACT_EMAIL}`} sx={{ fontWeight: 650, whiteSpace: 'nowrap' }}>
          Get in touch<span aria-hidden="true"> →</span>
        </Link>
        {' · '}
        <ExternalLink href={DEMO_CONTACT_LINKEDIN_URL} sx={{ fontWeight: 650 }}>
          Message me on LinkedIn<span aria-hidden="true"> →</span>
        </ExternalLink>
      </Typography>
      <Box role="status" sx={visuallyHiddenSx}>
        {announcement}
      </Box>
    </Paper>
  )
}

const visuallyHiddenSx = {
  position: 'absolute',
  // Strings, not numbers: in MUI `sx`, `width: 1` means 100%, not 1px.
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
} as const
