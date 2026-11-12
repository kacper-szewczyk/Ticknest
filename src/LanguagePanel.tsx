import type { User } from 'firebase/auth'
import { useState } from 'react'
import Typography from '@mui/material/Typography'
import { changeAppLanguage, useTranslation } from './i18n'
import type { AppLanguage } from './i18n/languages'
import { LanguageSelect } from './LanguageSelect'
import { saveLanguagePreference } from './lib/userPreferences'
import { FormMessage, SectionCard, SectionHeading } from './ui'

// Which message to show, not its text: it is translated at render time, after the language has changed.
type Outcome = 'saved' | 'failed' | null

/** Settings card for the interface language, saved on the profile so it follows the user across devices. */
export function LanguagePanel({ user }: { user: User }) {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>(null)

  async function handleChange(next: AppLanguage, previous: AppLanguage) {
    setPending(true)
    setOutcome(null)
    try {
      await saveLanguagePreference(user, next)
      setOutcome('saved')
    } catch (saveError) {
      console.error(saveError)
      // Revert, so the UI does not show a language that will not follow the user.
      await changeAppLanguage(previous).catch(() => undefined)
      setOutcome('failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <SectionCard labelledBy="language-heading">
      <SectionHeading id="language-heading" kicker={t('language.kicker')} title={t('language.title')} />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2.5, lineHeight: 1.6 }}>
        {t('language.intro')}
      </Typography>
      {outcome === 'failed' && <FormMessage severity="error">{t('language.saveFailed')}</FormMessage>}
      {outcome === 'saved' && <FormMessage severity="success">{t('language.saved')}</FormMessage>}
      <LanguageSelect
        onChange={(next, previous) => void handleChange(next, previous)}
        disabled={pending}
        sx={{ minWidth: 220 }}
      />
    </SectionCard>
  )
}
