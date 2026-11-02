import { afterEach, describe, expect, it, vi } from 'vitest'
import { isGoogleSignInEnabled } from '../../src/lib/authOptions'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isGoogleSignInEnabled', () => {
  it('keeps Google sign-in when the flag is empty', () => {
    vi.stubEnv('VITE_GOOGLE_SIGN_IN_ENABLED', '')
    expect(isGoogleSignInEnabled()).toBe(true)
  })

  it('keeps Google sign-in for true and any value other than false', () => {
    vi.stubEnv('VITE_GOOGLE_SIGN_IN_ENABLED', 'true')
    expect(isGoogleSignInEnabled()).toBe(true)
    vi.stubEnv('VITE_GOOGLE_SIGN_IN_ENABLED', '0')
    expect(isGoogleSignInEnabled()).toBe(true)
  })

  it('hides Google sign-in only for false', () => {
    vi.stubEnv('VITE_GOOGLE_SIGN_IN_ENABLED', 'false')
    expect(isGoogleSignInEnabled()).toBe(false)
  })
})
