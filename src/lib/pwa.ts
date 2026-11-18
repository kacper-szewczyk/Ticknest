// Progressive Web App state: the service worker's pending update, the browser's install prompt, and whether the app
// is online. Components read it through `usePwaState` (see src/usePwaState.ts); nothing here touches workspace data.

/** Chromium's `beforeinstallprompt` event, which is not in the DOM typings. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface PwaState {
  /** A new version is installed and waiting; `applyUpdate` reloads into it. */
  isUpdateReady: boolean
  /** The browser offered to install the app and it is not already running installed. */
  canInstall: boolean
  isOnline: boolean
}

type Listener = () => void

let state: PwaState = { isUpdateReady: false, canInstall: false, isOnline: true }
let installPrompt: BeforeInstallPromptEvent | null = null
let activateUpdate: (() => Promise<void>) | null = null
const listeners = new Set<Listener>()

function setState(next: Partial<PwaState>) {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

export function getPwaState(): PwaState {
  return state
}

export function subscribeToPwaState(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** True when the app was opened from its installed icon (or from the iOS home screen). */
export function isRunningStandalone(win: Window = window): boolean {
  const iosStandalone = (win.navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosStandalone || win.matchMedia?.('(display-mode: standalone)').matches === true
}

/**
 * Starts listening for install prompts and connectivity changes. Called once from main.tsx before the first render,
 * because Chromium can fire `beforeinstallprompt` before React mounts.
 */
export function watchPwaEvents(win: Window = window): void {
  setState({ isOnline: win.navigator.onLine !== false })
  win.addEventListener('online', () => setState({ isOnline: true }))
  win.addEventListener('offline', () => setState({ isOnline: false }))
  win.addEventListener('beforeinstallprompt', (event) => {
    // Keep the browser's own mini-infobar from showing; the sidebar offers "Install app" instead.
    event.preventDefault()
    if (isRunningStandalone(win)) return
    installPrompt = event as BeforeInstallPromptEvent
    setState({ canInstall: true })
  })
  win.addEventListener('appinstalled', () => {
    installPrompt = null
    setState({ canInstall: false })
  })
}

/** Shows the browser's install dialog. The prompt can only be used once, so the button hides afterwards. */
export async function promptInstall(): Promise<void> {
  const prompt = installPrompt
  if (!prompt) return
  installPrompt = null
  setState({ canInstall: false })
  await prompt.prompt()
}

/**
 * Registers the service worker in production builds. Builds that talk to the Firebase emulators (e2e tests,
 * screenshots, local demos) skip it so a cached shell never outlives the test run.
 */
export function shouldRegisterServiceWorker(env: ImportMetaEnv = import.meta.env): boolean {
  return env.PROD === true && env.VITE_USE_FIREBASE_EMULATORS !== 'true'
}

export async function startServiceWorker(env: ImportMetaEnv = import.meta.env): Promise<void> {
  if (!shouldRegisterServiceWorker(env) || !('serviceWorker' in navigator)) return
  // Loaded on demand so workbox-window stays out of the initial bundle.
  const { registerSW } = await import('virtual:pwa-register')
  const updateServiceWorker = registerSW({
    // The new version waits until the user accepts it, so a reload never interrupts someone mid-edit.
    onNeedRefresh: () => {
      activateUpdate = () => updateServiceWorker(true)
      setState({ isUpdateReady: true })
    },
    onRegisterError: (error: unknown) => console.warn('Service worker registration failed', error),
  })
}

/** Activates the waiting service worker and reloads. A running timer lives in Firestore, so it resumes after. */
export async function applyUpdate(): Promise<void> {
  setState({ isUpdateReady: false })
  await activateUpdate?.()
}

/** Hides the update notice for this session; the update applies the next time the app is opened. */
export function dismissUpdate(): void {
  setState({ isUpdateReady: false })
}

/** Test helper: sets state directly and forgets any captured prompt or pending update. */
export function resetPwaStateForTests(next: Partial<PwaState> = {}): void {
  installPrompt = null
  activateUpdate = null
  state = { isUpdateReady: false, canInstall: false, isOnline: true, ...next }
  listeners.forEach((listener) => listener())
}
