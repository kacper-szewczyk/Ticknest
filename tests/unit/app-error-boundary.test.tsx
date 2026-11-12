// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from '../../src/AppErrorBoundary'
import { DEMO_SOURCE_URL } from '../../src/lib/demo'
import { readableError } from '../../src/lib/errors'
import { PALETTES } from '../../src/palettes'
import { createAppTheme } from '../../src/theme'

function Crash(): never {
  throw new Error('boom')
}

function renderCrash() {
  return render(
    <ThemeProvider theme={createAppTheme(PALETTES.forest)}>
      <AppErrorBoundary>
        <Crash />
      </AppErrorBoundary>
    </ThemeProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('AppErrorBoundary', () => {
  it('shows a message and a reload button instead of a blank page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderCrash()
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('points demo visitors to the repository', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderCrash()
    expect(screen.getByRole('link').getAttribute('href')).toBe(DEMO_SOURCE_URL)
  })
})

describe('readableError for busy errors', () => {
  const error = (code: string) => Object.assign(new Error('raw'), { code })

  it('maps Firestore and Functions quota and overload codes to a busy message', () => {
    for (const code of ['resource-exhausted', 'unavailable', 'functions/resource-exhausted', 'functions/unavailable']) {
      expect(readableError(error(code))).toContain('busy or unreachable')
    }
  })

  it('points demo visitors to the repository', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    expect(readableError(error('resource-exhausted'))).toContain(DEMO_SOURCE_URL)
  })
})
