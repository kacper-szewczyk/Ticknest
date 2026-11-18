import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import type { SxProps, Theme } from '@mui/material/styles'
import type { User } from 'firebase/auth'
import { useState } from 'react'
import { changeAppLanguage, useTranslation } from './i18n'
import type { AppLanguage } from './i18n/languages'
import { LanguageMenu } from './LanguageMenu'
import { saveLanguagePreference } from './lib/userPreferences'

/** The always-visible language switcher in the app shell; the choice is saved on the profile, like in Settings. */
export function ProfileLanguageMenu({ user, iconOnly, sx }: { user: User; iconOnly?: boolean; sx?: SxProps<Theme> }) {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleChange(next: AppLanguage, previous: AppLanguage) {
    setPending(true)
    setFailed(false)
    try {
      await saveLanguagePreference(user, next)
    } catch (saveError) {
      console.error(saveError)
      // Revert, so the UI does not show a language that will not follow the user.
      await changeAppLanguage(previous).catch(() => undefined)
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <LanguageMenu
        onChange={(next, previous) => void handleChange(next, previous)}
        disabled={pending}
        iconOnly={iconOnly}
        tooltipPlacement="right"
        sx={sx}
      />
      <Snackbar
        open={failed}
        onClose={(_event, reason) => reason !== 'clickaway' && setFailed(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" variant="filled" onClose={() => setFailed(false)} sx={{ width: '100%' }}>
          {t('language.saveFailed')}
        </Alert>
      </Snackbar>
    </>
  )
}
