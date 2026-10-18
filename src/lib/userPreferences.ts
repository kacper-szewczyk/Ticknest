import type { User } from 'firebase/auth'
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc, type Unsubscribe } from 'firebase/firestore'
import { DEFAULT_PALETTE_CHOICE, isPaletteChoice, type PaletteChoice } from '../palettes'
import { db } from './firebase'

/** Reports the palette saved on the user's profile, falling back to the default when none (or an unknown one) is stored. */
export function subscribeToPalettePreference(uid: string, onChange: (choice: PaletteChoice) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    (snapshot) => {
      const palette: unknown = snapshot.data()?.palette
      onChange(isPaletteChoice(palette) ? palette : DEFAULT_PALETTE_CHOICE)
    },
    (error) => console.error('Could not load the palette preference.', error.code),
  )
}

export async function savePalettePreference(user: User, palette: PaletteChoice): Promise<void> {
  if (!isPaletteChoice(palette)) throw new Error('Choose one of the available palettes.')
  const userRef = doc(db, 'users', user.uid)
  const snapshot = await getDoc(userRef)
  if (snapshot.exists()) {
    await updateDoc(userRef, { palette, updatedAt: serverTimestamp() })
    return
  }
  // The profile is normally created when the user creates or joins a workspace; create it here if it is missing.
  if (!user.email) throw new Error('Your account needs an email address to save preferences.')
  await setDoc(userRef, {
    displayName: (user.displayName ?? '').slice(0, 80),
    email: user.email,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    palette,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}
