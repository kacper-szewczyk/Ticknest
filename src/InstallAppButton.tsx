import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { alpha, type Theme } from '@mui/material/styles'
import { NavIcon } from './AppShell'
import { useTranslation } from './i18n'
import { promptInstall } from './lib/pwa'
import { usePwaState } from './usePwaState'

const hoverSx = { '&:hover': { bgcolor: (theme: Theme) => alpha(theme.palette.app.sidebar.strong, 0.09) } }

const installIcon = (
  <NavIcon>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </NavIcon>
)

/**
 * "Install app" in the sidebar footer. Only shown where the browser offers installation (Chromium's
 * `beforeinstallprompt`) and the app is not already running installed; iOS installs from Share › Add to Home Screen.
 */
export function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const { canInstall } = usePwaState()
  if (!canInstall) return null

  const install = () => void promptInstall()
  if (compact) {
    return (
      <Tooltip title={t('shell.installApp')} placement="right">
        <IconButton aria-label={t('shell.installApp')} onClick={install} sx={{ color: 'app.sidebar.text', ...hoverSx }}>
          {installIcon}
        </IconButton>
      </Tooltip>
    )
  }
  return (
    <Button
      size="small"
      onClick={install}
      sx={{ minHeight: 36, color: 'app.sidebar.text', justifyContent: 'flex-start', px: 1, ...hoverSx }}
    >
      {t('shell.installApp')}
    </Button>
  )
}
