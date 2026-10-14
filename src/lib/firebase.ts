import { getApp, getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
const projectId =
  import.meta.env.VITE_FIREBASE_PROJECT_ID ||
  (useEmulators ? 'demo-ticknest' : undefined)

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || (useEmulators ? 'demo-api-key' : undefined),
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    (useEmulators ? `${projectId}.firebaseapp.com` : undefined),
  projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || (useEmulators ? 'demo-app-id' : undefined),
}

const requiredConfig = ['apiKey', 'authDomain', 'projectId', 'appId'] as const
const missingConfig = requiredConfig.filter((key) => !firebaseConfig[key])

if (missingConfig.length > 0) {
  throw new Error(
    `Missing Firebase configuration: ${missingConfig.join(', ')}. ` +
      'Copy .env.example to .env.local and fill in your Firebase web app values.',
  )
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)

if (useEmulators) {
  const emulatorState = window as Window & { __ticknestEmulatorsConnected?: boolean }

  if (!emulatorState.__ticknestEmulatorsConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
    emulatorState.__ticknestEmulatorsConnected = true
  }
}
