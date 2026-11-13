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
import type { TFunction } from 'i18next'
import { useId, useState, type ReactNode } from 'react'
import { Trans, useAppLanguage, useTranslation } from './i18n'
import {
  DEMO_ACCOUNTS,
  DEMO_CONTACT_EMAIL,
  DEMO_CONTACT_LINKEDIN_URL,
  demoLandingUrl,
  DEMO_SOURCE_URL,
  DEMO_SUPPORT_URL,
  formatDemoReset,
  nextDemoReset,
  type DemoAccount,
  type DemoAccountRole,
} from './lib/demo'

function roleLabel(role: DemoAccountRole, t: TFunction): string {
  const labels: Record<DemoAccountRole, string> = {
    owner: t('demo.roleOwner'),
    manager: t('demo.roleManager'),
    member: t('demo.roleMember'),
  }
  return labels[role]
}

function signingInAnnouncement(account: DemoAccount, t: TFunction): string {
  const messages: Record<DemoAccountRole, string> = {
    owner: t('demo.signingInOwner', { email: account.email }),
    manager: t('demo.signingInManager', { email: account.email }),
    member: t('demo.signingInMember', { email: account.email }),
  }
  return messages[account.role]
}

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

/** Replaces the whole app while the demo is paused (VITE_DEMO_PAUSED=true), for example during a traffic spike. */
export function DemoPausedPage() {
  if (import.meta.env.VITE_DEMO_MODE !== 'true') return null
  return <PausedPage />
}

function PausedPage() {
  const { t } = useTranslation()
  return (
    <Box component="main" sx={{ maxWidth: '40rem', mx: 'auto', my: 8, px: 2 }}>
      <Typography variant="h1" sx={{ fontSize: '2rem', mb: 2 }}>
        {t('demo.pausedTitle')}
      </Typography>
      <Typography sx={{ mb: 2, lineHeight: 1.6 }}>{t('demo.pausedBody')}</Typography>
      <Typography sx={{ mb: 3, lineHeight: 1.6 }}>{t('demo.pausedOpenSource')}</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        <Button variant="contained" href={DEMO_SOURCE_URL} target="_blank" rel="noopener noreferrer">
          {t('demo.viewSource')}
        </Button>
        <Button variant="outlined" href={DEMO_SUPPORT_URL} target="_blank" rel="noopener noreferrer">
          {t('demo.buyCoffee')}
        </Button>
      </Box>
    </Box>
  )
}

function ResetBanner() {
  const { t } = useTranslation()
  const language = useAppLanguage()
  const [reset] = useState(() => nextDemoReset(new Date()))
  return (
    <Box
      component="section"
      aria-label={t('demo.noticeLabel')}
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
      <Trans
        i18nKey="demo.banner"
        values={{ reset: formatDemoReset(reset, language) }}
        components={{
          strong: <Box component="strong" sx={{ fontWeight: 700 }} />,
          time: <Box component="time" dateTime={reset.toISOString()} sx={{ fontWeight: 650, whiteSpace: 'nowrap' }} />,
        }}
      />{' '}
      <ExternalLink href={DEMO_SOURCE_URL} color="inherit" sx={{ fontWeight: 650 }}>
        {t('demo.viewSource')}
      </ExternalLink>
      {' · '}
      <ExternalLink href={DEMO_SUPPORT_URL} color="inherit" sx={{ fontWeight: 650 }}>
        {t('demo.buyCoffee')}
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
  const { t } = useTranslation()
  const language = useAppLanguage()
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
        {t('demo.tryTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5, lineHeight: 1.5 }}>
        <Trans
          i18nKey="demo.tryIntro"
          values={{ password: DEMO_ACCOUNTS[0]?.password ?? '' }}
          components={{ code: <Box component="code" sx={{ fontWeight: 650, color: 'text.primary' }} /> }}
        />{' '}
        <ExternalLink href={DEMO_SOURCE_URL}>{t('demo.viewSource')}</ExternalLink>
        {' · '}
        <ExternalLink href={demoLandingUrl(language)}>{t('demo.aboutProject')}</ExternalLink>
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
                  {roleLabel(account.role, t)}
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
                  setAnnouncement(signingInAnnouncement(account, t))
                }}
                sx={{ flexShrink: 0 }}
              >
                {t('demo.useAccount')}
              </Button>
            </Box>
          )
        })}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.5 }}>
        <Box component="strong" sx={{ fontWeight: 650, color: 'text.primary' }}>
          {t('demo.supportLead')}
        </Box>{' '}
        <ExternalLink href={DEMO_SUPPORT_URL} sx={{ fontWeight: 650 }}>
          <span aria-hidden="true">☕ </span>
          {t('demo.buyCoffee')}
          <span aria-hidden="true"> →</span>
        </ExternalLink>
        {' · '}
        <ExternalLink href={DEMO_SOURCE_URL} sx={{ fontWeight: 650 }}>
          <span aria-hidden="true">⭐ </span>
          {t('demo.star')}
          <span aria-hidden="true"> →</span>
        </ExternalLink>
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.5 }}>
        <Box component="strong" sx={{ fontWeight: 650, color: 'text.primary' }}>
          {t('demo.contactLead')}
        </Box>{' '}
        {t('demo.contactHelp')}{' '}
        <Link href={`mailto:${DEMO_CONTACT_EMAIL}`} sx={{ fontWeight: 650, whiteSpace: 'nowrap' }}>
          {t('demo.getInTouch')}
          <span aria-hidden="true"> →</span>
        </Link>
        {' · '}
        <ExternalLink href={DEMO_CONTACT_LINKEDIN_URL} sx={{ fontWeight: 650 }}>
          {t('demo.linkedIn')}
          <span aria-hidden="true"> →</span>
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
