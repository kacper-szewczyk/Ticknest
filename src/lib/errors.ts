export function readableError(error: unknown): string {
  if (!(error instanceof Error)) return 'Something went wrong. Please try again.'
  const code = 'code' in error ? String(error.code) : ''
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'An account already exists for this email. Sign in instead.',
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/network-request-failed':
      'Ticknest couldn’t reach Firebase Authentication. Check your internet connection and try again. If you use a VPN, firewall, or privacy extension, make sure it allows this site to connect to Firebase.',
    'auth/weak-password': 'Choose a password with at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'auth/user-disabled': 'This account is disabled. Contact the workspace administrator.',
    'auth/unauthorized-domain':
      'This site is not authorized for Firebase sign-in. Add its domain in Firebase Authentication settings.',
    'auth/requires-recent-login': 'Sign in again before deleting your account.',
    'auth/wrong-password': 'The password is incorrect.',
    'auth/missing-password': 'Enter your password to confirm account deletion.',
    'auth/user-mismatch': 'Choose the Google account you signed in with, then try deleting your account again.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
    'auth/popup-blocked': 'Allow pop-ups for this site, then try Google sign-in again.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Authentication.',
    'auth/account-exists-with-different-credential':
      'An account already exists with this email. Sign in with your original method, then link Google in account settings.',
    'functions/internal':
      'The workspace service is not available in this Firebase project yet. Deploy the Firebase Functions, then try again.',
    'functions/not-found':
      'The workspace service is not deployed in this Firebase project. Deploy the Firebase Functions, then try again.',
    'functions/unavailable': 'The workspace service is temporarily unavailable. Try again in a moment.',
    'permission-denied': 'You do not have access to this workspace.',
  }
  if (messages[code]) return messages[code]
  if (code.startsWith('auth/'))
    return 'We couldn’t sign you in. Please try again. If the problem continues, check the Firebase Authentication settings.'
  return error.message
}
