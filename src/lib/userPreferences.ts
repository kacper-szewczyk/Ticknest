import type { User } from 'firebase/auth'
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc, type Unsubscribe } from 'firebase/firestore'
import { isAppLanguage, type AppLanguage } from '../i18n/languages'
import { DEFAULT_PALETTE_CHOICE, isPaletteChoice, type PaletteChoice } from '../palettes'
import { db } from './firebase'

export type UserPreferences = {
  palette: PaletteChoice
  /** Unset until the user picks a language, so the device's or browser's language applies. */
  language?: AppLanguage
}

/** Reports the preferences saved on the user's profile; an unknown palette falls back to the default. */
export function subscribeToUserPreferences(uid: string, onChange: (preferences: UserPreferences) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    (snapshot) => {
      const data = snapshot.data()
      const palette: unknown = data?.palette
      const language: unknown = data?.language
      onChange({
        palette: isPaletteChoice(palette) ? palette : DEFAULT_PALETTE_CHOICE,
        language: isAppLanguage(language) ? language : undefined,
      })
    },
    (error) => console.error('Could not load the profile preferences.', error.code),
  )
}

export async function savePalettePreference(user: User, palette: PaletteChoice): Promise<void> {
  if (!isPaletteChoice(palette)) throw new Error('Choose one of the available palettes.')
  await saveProfilePreference(user, { palette })
}

export async function saveLanguagePreference(user: User, language: AppLanguage): Promise<void> {
  if (!isAppLanguage(language)) throw new Error('Choose one of the available languages.')
  await saveProfilePreference(user, { language })
}

async function saveProfilePreference(
  user: User,
  preference: { palette: PaletteChoice } | { language: AppLanguage },
): Promise<void> {
  const userRef = doc(db, 'users', user.uid)
  const snapshot = await getDoc(userRef)
  if (snapshot.exists()) {
    await updateDoc(userRef, { ...preference, updatedAt: serverTimestamp() })
    return
  }
  // The profile is normally created when the user creates or joins a workspace; create it here if it is missing.
  if (!user.email) throw new Error('Your account needs an email address to save preferences.')
  await setDoc(userRef, {
    displayName: (user.displayName ?? '').slice(0, 80),
    email: user.email,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...preference,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}
