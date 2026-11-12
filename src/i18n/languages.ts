// The languages Ticknest's UI is translated into. English is the source catalog and the fallback.
// Kept free of i18next so it can be unit-tested and imported by data-access code.

export const SUPPORTED_LANGUAGES = ['en', 'es', 'pl'] as const
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: AppLanguage = 'en'

/** Each language's name in that language, so people find their own language whatever the UI shows. */
export const LANGUAGE_NAMES: Record<AppLanguage, string> = { en: 'English', es: 'Español', pl: 'Polski' }

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}

/**
 * The first supported language among the browser's preferred languages (`navigator.languages`), matched on the
 * primary subtag so `es-MX` and `pl-PL` count; English when none is supported.
 */
export function detectLanguage(preferred: readonly string[]): AppLanguage {
  for (const tag of preferred) {
    const primary = tag.split('-')[0]?.toLowerCase()
    if (isAppLanguage(primary)) return primary
  }
  return DEFAULT_LANGUAGE
}

const CACHED_LANGUAGE_KEY = 'ticknest.language'

// The last chosen language is kept on this device, so it applies before sign-in and before the profile loads.
export function getCachedLanguage(): AppLanguage | null {
  try {
    const value = window.localStorage.getItem(CACHED_LANGUAGE_KEY)
    return isAppLanguage(value) ? value : null
  } catch {
    return null
  }
}

export function cacheLanguage(language: AppLanguage): void {
  try {
    window.localStorage.setItem(CACHED_LANGUAGE_KEY, language)
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the profile remains the source of truth.
  }
}

/** The language to start with: the one chosen on this device, else the browser's preference. */
export function initialLanguage(): AppLanguage {
  const preferred = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])
  return getCachedLanguage() ?? detectLanguage(preferred)
}
