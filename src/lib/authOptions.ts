/**
 * Google sign-in is on unless the build sets `VITE_GOOGLE_SIGN_IN_ENABLED=false`. Turn it off on hosts that are not
 * Firebase authorized domains, such as Vercel preview deployments, where the popup fails with `auth/unauthorized-domain`.
 */
export function isGoogleSignInEnabled(): boolean {
  return import.meta.env.VITE_GOOGLE_SIGN_IN_ENABLED !== 'false'
}
