import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import type { SxProps, Theme } from '@mui/material/styles'
import { useState, type MouseEvent } from 'react'
import { changeAppLanguage, currentLanguage, useAppLanguage, useTranslation } from './i18n'
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, type AppLanguage } from './i18n/languages'

function GlobeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  )
}

/**
 * A compact language switcher: a globe button showing the current language, opening a menu of the others. The
 * language applies at once and is remembered on this device; `onChange` runs once it has loaded. Kept free of
 * Firebase so the sign-in screen can use it.
 */
export function LanguageMenu({
  onChange,
  disabled,
  iconOnly,
  tooltipPlacement = 'bottom',
  sx,
}: {
  onChange?: (language: AppLanguage, previous: AppLanguage) => void
  disabled?: boolean
  /** Only the globe, with the language in a tooltip; for the collapsed sidebar rail. */
  iconOnly?: boolean
  tooltipPlacement?: 'bottom' | 'right'
  sx?: SxProps<Theme>
}) {
  const { t } = useTranslation()
  const language = useAppLanguage()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [loading, setLoading] = useState(false)
  const label = t('language.current', { language: LANGUAGE_NAMES[language] })

  async function choose(next: AppLanguage) {
    setAnchor(null)
    if (next === language) return
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

  const triggerProps = {
    'aria-label': label,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': anchor ? true : undefined,
    disabled: disabled || loading,
    onClick: (event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget),
    sx,
  }

  return (
    <>
      {iconOnly ? (
        <Tooltip title={label} placement={tooltipPlacement}>
          <IconButton {...triggerProps}>
            <GlobeIcon />
          </IconButton>
        </Tooltip>
      ) : (
        <Button size="small" color="inherit" startIcon={<GlobeIcon />} {...triggerProps}>
          <span lang={language}>{LANGUAGE_NAMES[language]}</span>
        </Button>
      )}
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {SUPPORTED_LANGUAGES.map((option) => (
          <MenuItem
            key={option}
            lang={option}
            role="menuitemradio"
            aria-checked={option === language}
            selected={option === language}
            onClick={() => void choose(option)}
          >
            {LANGUAGE_NAMES[option]}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
