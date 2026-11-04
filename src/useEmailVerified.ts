import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { refreshEmailVerification } from './lib/auth'

// The verification link opens in another tab (or on Firebase's own page), and Firebase does not tell this tab when it
// is used. So while the email is unverified, re-check the account when the page loads and whenever the user returns
// to the tab.
export function useEmailVerified(user: User): boolean {
  // `user.reload()` updates the user object in place without a re-render, so remember who was found verified.
  const [verifiedUid, setVerifiedUid] = useState<string | null>(null)

  useEffect(() => {
    if (user.emailVerified) return
    let active = true
    let checking = false

    const check = () => {
      if (checking || document.visibilityState === 'hidden') return
      checking = true
      refreshEmailVerification(user)
        .then((verified) => {
          if (!active || !verified) return
          setVerifiedUid(user.uid)
          stopListening()
        })
        // A failed check (for example, while offline) is retried on the next focus.
        .catch(() => {})
        .finally(() => {
          checking = false
        })
    }
    const stopListening = () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }

    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    check()
    return () => {
      active = false
      stopListening()
    }
  }, [user])

  return user.emailVerified || verifiedUid === user.uid
}
