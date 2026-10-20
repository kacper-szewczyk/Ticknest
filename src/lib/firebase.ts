import { getApp, getApps, initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import type { Functions, httpsCallable } from 'firebase/functions'

const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || (useEmulators ? 'demo-ticknest' : undefined)

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || (useEmulators ? 'demo-api-key' : undefined),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || (useEmulators ? `${projectId}.firebaseapp.com` : undefined),
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

// App Check is optional for self-hosters: it is enabled only when a reCAPTCHA Enterprise site key is configured.
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY
const appCheckDebugToken = import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN

if (recaptchaSiteKey) {
  const appCheckState = self as typeof self & {
    FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean
    __ticknestAppCheckInitialized?: boolean
  }

  if (!appCheckState.__ticknestAppCheckInitialized) {
    // The debug token must be set before App Check initializes. It replaces reCAPTCHA in local development and CI.
    if (appCheckDebugToken) {
      appCheckState.FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken === 'true' ? true : appCheckDebugToken
    }

    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
    appCheckState.__ticknestAppCheckInitialized = true
  }
}

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

type CallableClient = { functions: Functions; httpsCallable: typeof httpsCallable }

let callableClient: Promise<CallableClient> | undefined

// firebase/functions is loaded on the first callable so it stays out of the initial bundle.
function loadCallableClient(): Promise<CallableClient> {
  callableClient ??= import('firebase/functions').then(({ connectFunctionsEmulator, getFunctions, httpsCallable }) => {
    const functions = getFunctions(app, 'europe-west1')
    if (useEmulators) connectFunctionsEmulator(functions, '127.0.0.1', 5001)
    return { functions, httpsCallable }
  })
  return callableClient
}

export async function callFunction<Request, Response>(name: string, data: Request): Promise<Response> {
  const { functions, httpsCallable } = await loadCallableClient()
  const result = await httpsCallable<Request, Response>(functions, name)(data)
  return result.data
}
