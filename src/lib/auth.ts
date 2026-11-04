import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { deleteDoc, doc } from 'firebase/firestore'
import { auth, db } from './firebase'
import { verificationContinueUrl } from './inviteLink'

export async function registerWithEmail(name: string, email: string, password: string): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
  await updateProfile(credential.user, { displayName: name.trim() })
  await sendVerificationEmail(credential.user)
  return credential.user
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

/**
 * Sends the verification email with a link back to this page, so an invitation in the URL survives verification.
 * Falls back to Firebase's plain confirmation page when this domain is not an authorized return address.
 */
export async function sendVerificationEmail(user: User): Promise<void> {
  try {
    await sendEmailVerification(user, { url: verificationContinueUrl(window.location.href) })
  } catch (error) {
    if (!hasErrorCode(error, 'auth/unauthorized-continue-uri')) throw error
    await sendEmailVerification(user)
  }
}

/**
 * Re-reads the account after the user verified their email elsewhere. A verified account also gets a fresh ID token,
 * because the backend checks the token's `email_verified` claim rather than the profile.
 */
export async function refreshEmailVerification(user: User): Promise<boolean> {
  await user.reload()
  if (user.emailVerified) await user.getIdToken(true)
  return user.emailVerified
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password)
  return credential.user
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  const credential = await signInWithPopup(auth, provider)
  return credential.user
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim())
}

export async function signOutUser(): Promise<void> {
  await signOut(auth)
}

export type ReauthMethod = 'google' | 'password'

/** Picks how the user can prove a recent sign-in, preferring Google when linked so no password is typed. */
export function getReauthMethod(user: User): ReauthMethod | null {
  const providerIds = user.providerData.map((provider) => provider.providerId)
  if (providerIds.includes(GoogleAuthProvider.PROVIDER_ID)) return 'google'
  if (providerIds.includes(EmailAuthProvider.PROVIDER_ID) && user.email) return 'password'
  return null
}

async function reauthenticate(user: User, method: ReauthMethod, password?: string): Promise<void> {
  if (method === 'google') {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account', ...(user.email ? { login_hint: user.email } : {}) })
    await reauthenticateWithPopup(user, provider)
    return
  }
  if (!user.email) throw new Error('This account does not have an email address to reauthenticate.')
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password ?? ''))
}

/** Reauthenticates first, so a failed attempt leaves both the profile and the identity intact. */
export async function deleteCurrentAccount(user: User, method: ReauthMethod, password?: string): Promise<void> {
  await reauthenticate(user, method, password)
  await deleteDoc(doc(db, 'users', user.uid))
  await deleteUser(user)
}
