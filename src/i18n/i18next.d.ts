import 'i18next'
import type en from '../locales/en.json'

// Types translation keys from the English catalog, so `t('missing.key')` fails the type check.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof en }
    returnNull: false
  }
}
