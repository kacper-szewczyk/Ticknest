// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../src/AppThemeProvider'
import { changeAppLanguage, i18n } from '../../src/i18n'

vi.mock('../../src/lib/auth', () => ({
  registerWithEmail: vi.fn(),
  sendPasswordReset: vi.fn(),
  signInWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
}))

const { AuthScreen } = await import('../../src/AuthScreen')

function renderScreen() {
  render(
    <AppThemeProvider>
      <AuthScreen onAuthenticated={vi.fn()} />
    </AppThemeProvider>,
  )
}

afterEach(async () => {
  cleanup()
  await changeAppLanguage('en')
  window.localStorage.clear()
})

describe('language selection on the sign-in screen', () => {
  it.each([
    ['es', 'Hola de nuevo', 'Idioma'],
    ['pl', 'Witaj ponownie', 'Język'],
  ])('switches the screen to %s and remembers it', async (language, heading, label) => {
    renderScreen()
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy()

    await userEvent.setup().selectOptions(screen.getByLabelText('Language'), language)

    await waitFor(() => expect(screen.getByRole('heading', { name: heading })).toBeTruthy())
    expect(screen.getByLabelText(label)).toBeTruthy()
    expect(document.documentElement.lang).toBe(language)
    expect(window.localStorage.getItem('ticknest.language')).toBe(language)
  })
})

describe('plural rules', () => {
  it('uses the Polish one, few, and many forms', async () => {
    await changeAppLanguage('pl')
    i18n.addResource('pl', 'translation', 'probe_one', '{{count}} wpis')
    i18n.addResource('pl', 'translation', 'probe_few', '{{count}} wpisy')
    i18n.addResource('pl', 'translation', 'probe_many', '{{count}} wpisów')
    i18n.addResource('pl', 'translation', 'probe_other', '{{count}} wpisu')
    const t = i18n.getFixedT('pl') as (key: string, options: { count: number }) => string
    expect([1, 2, 4, 5, 12, 14, 22, 24, 25].map((count) => t('probe', { count }))).toEqual([
      '1 wpis',
      '2 wpisy',
      '4 wpisy',
      '5 wpisów',
      '12 wpisów',
      '14 wpisów',
      '22 wpisy',
      '24 wpisy',
      '25 wpisów',
    ])
  })
})
