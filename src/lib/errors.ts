import { i18n } from '../i18n'

/** A message for the user in the active language. Unknown errors fall back to their own message. */
export function readableError(error: unknown): string {
  const { t } = i18n
  if (!(error instanceof Error)) return t('errors.generic')
  const code = 'code' in error ? String(error.code) : ''
  const messages: Record<string, () => string> = {
    'auth/email-already-in-use': () => t('errors.emailAlreadyInUse'),
    'auth/invalid-credential': () => t('errors.invalidCredential'),
    'auth/invalid-email': () => t('errors.invalidEmail'),
    'auth/network-request-failed': () => t('errors.networkRequestFailed'),
    'auth/weak-password': () => t('errors.weakPassword'),
    'auth/too-many-requests': () => t('errors.tooManyRequests'),
    'auth/user-disabled': () => t('errors.userDisabled'),
    'auth/unauthorized-domain': () => t('errors.unauthorizedDomain'),
    'auth/requires-recent-login': () => t('errors.requiresRecentLogin'),
    'auth/wrong-password': () => t('errors.wrongPassword'),
    'auth/missing-password': () => t('errors.missingPassword'),
    'auth/user-mismatch': () => t('errors.userMismatch'),
    'auth/popup-closed-by-user': () => t('errors.popupClosedByUser'),
    'auth/popup-blocked': () => t('errors.popupBlocked'),
    'auth/operation-not-allowed': () => t('errors.operationNotAllowed'),
    'auth/account-exists-with-different-credential': () => t('errors.accountExistsWithDifferentCredential'),
    'functions/internal': () => t('errors.functionsInternal'),
    'functions/not-found': () => t('errors.functionsNotFound'),
    'functions/unavailable': () => t('errors.functionsUnavailable'),
    'permission-denied': () => t('errors.permissionDenied'),
  }
  const message = messages[code]
  if (message) return message()
  if (code.startsWith('auth/')) return t('errors.authFallback')
  return error.message
}
