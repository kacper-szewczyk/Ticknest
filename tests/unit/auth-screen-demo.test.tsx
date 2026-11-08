// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_ACCOUNTS } from '../../functions/src/demo/accounts'
import { PALETTES } from '../../src/palettes'
import { createAppTheme } from '../../src/theme'

const auth = vi.hoisted(() => ({
  registerWithEmail: vi.fn(),
  sendPasswordReset: vi.fn(),
  signInWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
}))

vi.mock('../../src/lib/auth', () => auth)

const { AuthScreen } = await import('../../src/AuthScreen')

const account = DEMO_ACCOUNTS[0]!
const demoUser = { uid: 'demo-owner' } as User

function renderScreen() {
  const onAuthenticated = vi.fn()
  render(
    <ThemeProvider theme={createAppTheme(PALETTES.forest)}>
      <AuthScreen onAuthenticated={onAuthenticated} />
    </ThemeProvider>,
  )
  return onAuthenticated
}

function useAccountButtons(): HTMLElement[] {
  return screen.getAllByRole('button', { name: 'Use this account' })
}

beforeEach(() => {
  vi.stubEnv('VITE_DEMO_MODE', 'true')
  auth.signInWithEmail.mockReset()
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('AuthScreen demo accounts', () => {
  it('signs in as soon as an account is chosen', async () => {
    auth.signInWithEmail.mockResolvedValue(demoUser)
    const onAuthenticated = renderScreen()

    await userEvent.setup().click(useAccountButtons()[0]!)

    expect(auth.signInWithEmail).toHaveBeenCalledExactlyOnceWith(account.email, account.password)
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledExactlyOnceWith(demoUser))
  })

  it('disables the account buttons while signing in', async () => {
    let finishSignIn: (user: User) => void = () => {}
    auth.signInWithEmail.mockReturnValue(new Promise<User>((resolve) => (finishSignIn = resolve)))
    renderScreen()

    await userEvent.setup().click(useAccountButtons()[0]!)

    for (const button of useAccountButtons()) expect(button).toHaveProperty('disabled', true)
    finishSignIn(demoUser)
    await waitFor(() => expect(useAccountButtons()[0]).toHaveProperty('disabled', false))
  })

  it('shows the error and leaves the form filled in when sign-in fails', async () => {
    auth.signInWithEmail.mockRejectedValue(new Error('Sign-in is unavailable'))
    const onAuthenticated = renderScreen()

    await userEvent.setup().click(useAccountButtons()[0]!)

    expect(await screen.findByText('Sign-in is unavailable')).toBeTruthy()
    expect(onAuthenticated).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/Email address/)).toHaveProperty('value', account.email)
    expect(screen.getByLabelText(/Password/)).toHaveProperty('value', account.password)
    expect(useAccountButtons()[0]).toHaveProperty('disabled', false)
  })
})
