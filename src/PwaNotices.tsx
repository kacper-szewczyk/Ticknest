import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import { useTranslation } from './i18n'
import { applyUpdate, dismissUpdate } from './lib/pwa'
import { usePwaState } from './usePwaState'

/** The "you're offline" indicator and the "new version available" prompt, shown on every screen. */
export function PwaNotices() {
  const { t } = useTranslation()
  const { isOnline, isUpdateReady } = usePwaState()

  return (
    // Bottom left, so they never cover the timer's auto-stop notice in the bottom centre.
    <Snackbar open={!isOnline || isUpdateReady} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
      <Stack spacing={1}>
        {!isOnline && (
          <Alert severity="warning" variant="filled" role="status">
            {t('pwa.offline')}
          </Alert>
        )}
        {isUpdateReady && (
          <Alert
            severity="info"
            variant="filled"
            role="status"
            action={
              <>
                <Button color="inherit" size="small" onClick={dismissUpdate}>
                  {t('pwa.later')}
                </Button>
                <Button color="inherit" size="small" onClick={() => void applyUpdate()}>
                  {t('pwa.reload')}
                </Button>
              </>
            }
          >
            {t('pwa.updateReady')}
          </Alert>
        )}
      </Stack>
    </Snackbar>
  )
}
