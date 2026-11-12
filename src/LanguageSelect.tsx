import { useState, type ChangeEvent } from 'react'
import type { SxProps, Theme } from '@mui/material/styles'
import { changeAppLanguage, currentLanguage, useAppLanguage, useTranslation } from './i18n'
import { isAppLanguage, LANGUAGE_NAMES, SUPPORTED_LANGUAGES, type AppLanguage } from './i18n/languages'
import { SelectField } from './ui'

/**
 * A language picker. The language applies at once and is remembered on this device; `onChange` runs once it has
 * loaded. Kept free of Firebase so the sign-in screen can use it.
 */
export function LanguageSelect({
  onChange,
  disabled,
  sx,
}: {
  onChange?: (language: AppLanguage, previous: AppLanguage) => void
  disabled?: boolean
  sx?: SxProps<Theme>
}) {
  const { t } = useTranslation()
  const language = useAppLanguage()
  const [loading, setLoading] = useState(false)

  async function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const next = event.target.value
    if (!isAppLanguage(next) || next === language) return
    const previous = currentLanguage()
    setLoading(true)
    try {
      await changeAppLanguage(next)
      onChange?.(next, previous)
    } catch (error) {
      // The language chunk could not load (usually offline); the UI stays in the current language.
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SelectField
      label={t('language.label')}
      size="small"
      value={language}
      onChange={(event) => void handleChange(event)}
      disabled={disabled || loading}
      sx={sx}
    >
      {SUPPORTED_LANGUAGES.map((option) => (
        <option key={option} value={option} lang={option}>
          {LANGUAGE_NAMES[option]}
        </option>
      ))}
    </SelectField>
  )
}
