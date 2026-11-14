// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setPageTitle, setTimerTitle } from '../../src/lib/documentTitle'

const DEFAULT_TITLE = 'Ticknest — time tracking, on your terms'

beforeEach(() => {
  document.title = DEFAULT_TITLE
})

afterEach(() => {
  setTimerTitle(null)
  setPageTitle(null)
})

describe('document title', () => {
  it('shows the page title and restores the original one when cleared', () => {
    setPageTitle('Reports · Acme · Ticknest')
    expect(document.title).toBe('Reports · Acme · Ticknest')
    setPageTitle('Timesheet · Acme · Ticknest')
    expect(document.title).toBe('Timesheet · Acme · Ticknest')
    setPageTitle(null)
    expect(document.title).toBe(DEFAULT_TITLE)
  })

  it('lets a running timer win over the page title', () => {
    setPageTitle('Reports · Acme · Ticknest')
    setTimerTitle('0:00:05 — Ticknest')
    expect(document.title).toBe('0:00:05 — Ticknest')
    // Navigating while the timer runs keeps the timer in the tab.
    setPageTitle('Timesheet · Acme · Ticknest')
    expect(document.title).toBe('0:00:05 — Ticknest')
  })

  it('shows the current view, not the one the timer started on, when the timer stops', () => {
    setPageTitle('Reports · Acme · Ticknest')
    setTimerTitle('0:00:05 — Ticknest')
    setPageTitle('Timesheet · Acme · Ticknest')
    setTimerTitle(null)
    expect(document.title).toBe('Timesheet · Acme · Ticknest')
  })

  it('restores the original title once both are cleared, in either order', () => {
    setTimerTitle('0:00:05 — Ticknest')
    setPageTitle('Reports · Acme · Ticknest')
    setPageTitle(null)
    expect(document.title).toBe('0:00:05 — Ticknest')
    setTimerTitle(null)
    expect(document.title).toBe(DEFAULT_TITLE)
  })
})
