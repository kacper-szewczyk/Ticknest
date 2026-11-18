// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../src/AppThemeProvider'
import { changeAppLanguage, i18n } from '../../src/i18n'

const saveLanguagePreference = vi.fn<(user: User, language: string) => Promise<void>>()
vi.mock('../../src/lib/userPreferences', () => ({ saveLanguagePreference }))

const { ProfileLanguageMenu } = await import('../../src/ProfileLanguageMenu')
const user = { uid: 'u1' } as User

function renderMenu(iconOnly = false) {
  render(
    <AppThemeProvider>
      <ProfileLanguageMenu user={user} iconOnly={iconOnly} />
    </AppThemeProvider>,
  )
}

afterEach(async () => {
  cleanup()
  saveLanguagePreference.mockReset()
  vi.restoreAllMocks()
  await changeAppLanguage('en')
  window.localStorage.clear()
})

describe('the language switcher in the app shell', () => {
  it.each([false, true])('saves the chosen language on the profile (icon only: %s)', async (iconOnly) => {
    saveLanguagePreference.mockResolvedValue()
    renderMenu(iconOnly)
    const actor = userEvent.setup()

    await actor.click(screen.getByRole('button', { name: 'Language: English' }))
    await actor.click(screen.getByRole('menuitemradio', { name: 'Polski' }))

    await waitFor(() => expect(saveLanguagePreference).toHaveBeenCalledWith(user, 'pl'))
    expect(i18n.language).toBe('pl')
    expect(screen.getByRole('button', { name: 'Język: Polski' })).toBeTruthy()
  })

  it('switches back and says so when the profile cannot be saved', async () => {
    saveLanguagePreference.mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderMenu()
    const actor = userEvent.setup()

    await actor.click(screen.getByRole('button', { name: 'Language: English' }))
    await actor.click(screen.getByRole('menuitemradio', { name: 'Español' }))

    expect(await screen.findByText('We couldn’t save your language. Check your connection and try again.')).toBeTruthy()
    expect(i18n.language).toBe('en')
  })
})
