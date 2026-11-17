// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setPageTitle, setTimerTitle } from '../../src/lib/documentTitle'

const DEFAULT_TITLE = 'Tickness — time tracking, on your terms'

beforeEach(() => {
  document.title = DEFAULT_TITLE
})

afterEach(() => {
  setTimerTitle(null)
  setPageTitle(null)
})

describe('document title', () => {
  it('shows the page title and restores the original one when cleared', () => {
    setPageTitle('Reports · Acme · Tickness')
    expect(document.title).toBe('Reports · Acme · Tickness')
    setPageTitle('Timesheet · Acme · Tickness')
    expect(document.title).toBe('Timesheet · Acme · Tickness')
    setPageTitle(null)
    expect(document.title).toBe(DEFAULT_TITLE)
  })

  it('lets a running timer win over the page title', () => {
    setPageTitle('Reports · Acme · Tickness')
    setTimerTitle('0:00:05 — Tickness')
    expect(document.title).toBe('0:00:05 — Tickness')
    // Navigating while the timer runs keeps the timer in the tab.
    setPageTitle('Timesheet · Acme · Tickness')
    expect(document.title).toBe('0:00:05 — Tickness')
  })

  it('shows the current view, not the one the timer started on, when the timer stops', () => {
    setPageTitle('Reports · Acme · Tickness')
    setTimerTitle('0:00:05 — Tickness')
    setPageTitle('Timesheet · Acme · Tickness')
    setTimerTitle(null)
    expect(document.title).toBe('Timesheet · Acme · Tickness')
  })

  it('restores the original title once both are cleared, in either order', () => {
    setTimerTitle('0:00:05 — Tickness')
    setPageTitle('Reports · Acme · Tickness')
    setPageTitle(null)
    expect(document.title).toBe('0:00:05 — Tickness')
    setTimerTitle(null)
    expect(document.title).toBe(DEFAULT_TITLE)
  })
})
