// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../src/AppThemeProvider'
import { InstallAppButton } from '../../src/InstallAppButton'
import {
  applyUpdate,
  dismissUpdate,
  startServiceWorker,
  getPwaState,
  isRunningStandalone,
  resetPwaStateForTests,
  shouldRegisterServiceWorker,
  watchPwaEvents,
  type BeforeInstallPromptEvent,
} from '../../src/lib/pwa'
import { PwaNotices } from '../../src/PwaNotices'

const { registerSW } = vi.hoisted(() => ({ registerSW: vi.fn() }))
vi.mock('virtual:pwa-register', () => ({ registerSW }))

const originalMatchMedia = window.matchMedia

// Only `(display-mode: standalone)` is faked; MUI's own media queries see a list that never matches.
function setStandalone(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === '(display-mode: standalone)' && matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

function installPromptEvent() {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent
  Object.assign(event, {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  })
  return event
}

function env(values: Record<string, unknown>) {
  return values as unknown as ImportMetaEnv
}

beforeEach(() => {
  setStandalone(false)
  resetPwaStateForTests()
})

afterEach(() => {
  cleanup()
  resetPwaStateForTests()
  window.matchMedia = originalMatchMedia
})

describe('shouldRegisterServiceWorker', () => {
  it('registers in production builds', () => {
    expect(shouldRegisterServiceWorker(env({ PROD: true }))).toBe(true)
  })

  it('skips the dev server and builds that use the Firebase emulators', () => {
    expect(shouldRegisterServiceWorker(env({ PROD: false }))).toBe(false)
    expect(shouldRegisterServiceWorker(env({ PROD: true, VITE_USE_FIREBASE_EMULATORS: 'true' }))).toBe(false)
  })
})

describe('isRunningStandalone', () => {
  it('detects an installed window and an iOS home screen app', () => {
    setStandalone(true)
    expect(isRunningStandalone()).toBe(true)
    setStandalone(false)
    expect(isRunningStandalone()).toBe(false)
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true })
    expect(isRunningStandalone()).toBe(true)
    Object.defineProperty(window.navigator, 'standalone', { value: undefined, configurable: true })
  })
})

describe('watchPwaEvents', () => {
  it('follows the connection state', () => {
    watchPwaEvents()
    window.dispatchEvent(new Event('offline'))
    expect(getPwaState().isOnline).toBe(false)
    window.dispatchEvent(new Event('online'))
    expect(getPwaState().isOnline).toBe(true)
  })

  it('keeps the install prompt for the sidebar and suppresses the browser infobar', () => {
    watchPwaEvents()
    const event = installPromptEvent()
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(getPwaState().canInstall).toBe(true)
    window.dispatchEvent(new Event('appinstalled'))
    expect(getPwaState().canInstall).toBe(false)
  })

  it('offers no install when the app already runs installed', () => {
    setStandalone(true)
    watchPwaEvents()
    window.dispatchEvent(installPromptEvent())
    expect(getPwaState().canInstall).toBe(false)
  })
})

describe('InstallAppButton', () => {
  it('is hidden until the browser offers installation', () => {
    render(
      <AppThemeProvider>
        <InstallAppButton />
      </AppThemeProvider>,
    )
    expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull()
  })

  it('shows the browser install dialog once, then hides', async () => {
    watchPwaEvents()
    const event = installPromptEvent()
    act(() => {
      window.dispatchEvent(event)
    })
    render(
      <AppThemeProvider>
        <InstallAppButton />
      </AppThemeProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Install app' }))
    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull()
  })
})

describe('PwaNotices', () => {
  function renderNotices() {
    render(
      <AppThemeProvider>
        <PwaNotices />
      </AppThemeProvider>,
    )
  }

  it('shows nothing while online and up to date', () => {
    renderNotices()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('tells the user when they are offline', () => {
    resetPwaStateForTests({ isOnline: false })
    renderNotices()
    expect(screen.getByRole('status').textContent).toContain("You're offline")
  })

  it('offers to reload into a new version, or to wait', async () => {
    resetPwaStateForTests({ isUpdateReady: true })
    renderNotices()
    expect(screen.getByRole('status').textContent).toContain('A new version of Tickness is available.')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(getPwaState().isUpdateReady).toBe(false)
  })
})

it('dismissUpdate clears a pending update', () => {
  resetPwaStateForTests({ isUpdateReady: true })
  dismissUpdate()
  expect(getPwaState().isUpdateReady).toBe(false)
})

describe('startServiceWorker', () => {
  afterEach(() => {
    registerSW.mockReset()
    Reflect.deleteProperty(window.navigator, 'serviceWorker')
  })

  it('does not register outside production builds', async () => {
    Object.defineProperty(window.navigator, 'serviceWorker', { value: {}, configurable: true })
    await startServiceWorker(env({ PROD: false }))
    expect(registerSW).not.toHaveBeenCalled()
  })

  it('waits for the user before activating a new version', async () => {
    Object.defineProperty(window.navigator, 'serviceWorker', { value: {}, configurable: true })
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined)
    registerSW.mockReturnValue(updateServiceWorker)
    await startServiceWorker(env({ PROD: true }))

    const [{ onNeedRefresh }] = registerSW.mock.calls[0] as [{ onNeedRefresh: () => void }]
    act(() => onNeedRefresh())
    expect(getPwaState().isUpdateReady).toBe(true)
    expect(updateServiceWorker).not.toHaveBeenCalled()

    await applyUpdate()
    expect(updateServiceWorker).toHaveBeenCalledWith(true)
    expect(getPwaState().isUpdateReady).toBe(false)
  })
})
