// Invitation links look like `https://app/?workspace=…&invite=…&token=…`.
const INVITE_PARAMS = ['workspace', 'invite', 'token'] as const

/** True when the URL carries an invitation, so onboarding can lead with joining it. */
export function hasInviteParams(href: string): boolean {
  const { searchParams } = new URL(href)
  return searchParams.has('workspace') && searchParams.has('invite')
}

/** The same URL without the invitation parameters, keeping any other query and the hash. */
export function withoutInviteParams(href: string): string {
  const url = new URL(href)
  for (const name of INVITE_PARAMS) url.searchParams.delete(name)
  return url.toString()
}

/** Removes the invitation token from the address bar and the current history entry. */
export function clearInviteParamsFromAddressBar(): void {
  const href = window.location.href
  if (!INVITE_PARAMS.some((name) => new URL(href).searchParams.has(name))) return
  window.history.replaceState(window.history.state, '', withoutInviteParams(href))
}

/** Where the email verification link returns to: this page, invitation included, without the in-app hash. */
export function verificationContinueUrl(href: string): string {
  const url = new URL(href)
  url.hash = ''
  return url.toString()
}
