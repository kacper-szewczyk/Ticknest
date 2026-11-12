// i18next setup. English is bundled and initialised synchronously, so every component can translate on first render
// (and in tests) without waiting; other languages are separate chunks loaded only when chosen.
import i18n from 'i18next'
import { initReactI18next, Trans, useTranslation } from 'react-i18next'
import en from '../locales/en.json'
import { cacheLanguage, DEFAULT_LANGUAGE, initialLanguage, isAppLanguage, type AppLanguage } from './languages'

type Catalog = typeof en

// Explicit imports (not a template path) so Vite emits exactly one chunk per language.
const LOADERS: Record<Exclude<AppLanguage, 'en'>, () => Promise<{ default: Catalog }>> = {
  es: () => import('../locales/es.json'),
  pl: () => import('../locales/pl.json'),
}

void i18n.use(initReactI18next).init({
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: ['en', 'es', 'pl'],
  resources: { en: { translation: en } },
  initAsync: false,
  // React already escapes rendered text.
  interpolation: { escapeValue: false },
  returnNull: false,
})

async function loadLanguage(language: AppLanguage): Promise<void> {
  if (language === 'en' || i18n.hasResourceBundle(language, 'translation')) return
  const { default: catalog } = await LOADERS[language]()
  i18n.addResourceBundle(language, 'translation', catalog)
}

/** Loads the language if needed, switches the UI to it, and remembers it on this device. */
export async function changeAppLanguage(language: AppLanguage): Promise<void> {
  await loadLanguage(language)
  await i18n.changeLanguage(language)
  if (typeof document !== 'undefined') document.documentElement.lang = language
  cacheLanguage(language)
}

/** Switches to this device's or browser's language before the first render. Stays in English if loading fails. */
export async function startI18n(): Promise<void> {
  const language = initialLanguage()
  if (language === DEFAULT_LANGUAGE) return
  try {
    await changeAppLanguage(language)
  } catch (error) {
    console.error('Could not load the interface language.', error)
  }
}

/** The active UI language. */
export function currentLanguage(): AppLanguage {
  return isAppLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE
}

/** The active UI language, re-rendering the caller when it changes. Pass it to `Intl` and `toLocale*String` calls. */
export function useAppLanguage(): AppLanguage {
  const { i18n: instance } = useTranslation()
  return isAppLanguage(instance.language) ? instance.language : DEFAULT_LANGUAGE
}

// Components import these from here, not from react-i18next, so the instance above is always initialised first.
export { i18n, Trans, useTranslation }
