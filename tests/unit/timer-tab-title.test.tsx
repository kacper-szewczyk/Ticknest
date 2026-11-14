// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { act, cleanup, render } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { Timestamp } from 'firebase/firestore'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Catalog } from '../../src/lib/catalog'
import { runningTimerTitle } from '../../src/lib/tabTitle'
import type { TimeEntry } from '../../src/lib/timeEntries'
import { PALETTES } from '../../src/palettes'
import { createAppTheme } from '../../src/theme'
import { TimerBar } from '../../src/TimerBar'

const DEFAULT_TITLE = 'Ticknest — time tracking, on your terms'

let entries: TimeEntry[]
let emitEntries: (entries: TimeEntry[]) => void = () => {}

vi.mock('../../src/lib/timeEntries', () => ({
  subscribeToTimeEntries: (_workspaceId: string, _uid: string, onChange: (entries: TimeEntry[]) => void) => {
    emitEntries = onChange
    onChange(entries)
    return () => {}
  },
  startTimer: vi.fn(),
  stopTimer: vi.fn(),
  updateRunningTimer: vi.fn(),
  updateRunningTimerDescription: vi.fn(),
}))

const user = { uid: 'u1' } as User
const catalog: Catalog = { clients: [], projects: [], tasks: [] }

function entry(overrides: Partial<TimeEntry>): TimeEntry {
  return {
    id: 'running',
    userId: 'u1',
    description: '',
    clientName: null,
    projectName: null,
    taskName: null,
    billable: false,
    startAt: Timestamp.fromMillis(Date.now() - 2_533_000),
    endAt: null,
    ...overrides,
  } as TimeEntry
}

function renderBar() {
  return render(
    <ThemeProvider theme={createAppTheme(PALETTES.forest)}>
      <TimerBar user={user} workspaceId="w1" catalog={catalog} />
    </ThemeProvider>,
  )
}

describe('runningTimerTitle', () => {
  it('shows the elapsed time and the description', () => {
    expect(runningTimerTitle(2533, { description: 'Homepage wireframe review', projectName: 'Website' })).toBe(
      '0:42:13 · Homepage wireframe review — Ticknest',
    )
  })

  it('falls back to the project name when there is no description', () => {
    expect(runningTimerTitle(3600, { description: '  ', projectName: 'Website' })).toBe('1:00:00 · Website — Ticknest')
  })

  it('shows just the time when there is no description or project', () => {
    expect(runningTimerTitle(5, { description: '', projectName: null })).toBe('0:00:05 — Ticknest')
  })

  it('does not wrap hours past a day or show negative time', () => {
    expect(runningTimerTitle(100 * 3600 + 61, { description: '' })).toBe('100:01:01 — Ticknest')
    expect(runningTimerTitle(-3, { description: '' })).toBe('0:00:00 — Ticknest')
  })
})

describe('TimerBar tab title', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-11-14T10:00:00Z') })
    document.title = DEFAULT_TITLE
    entries = []
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('leaves the default title alone while no timer runs', () => {
    renderBar()
    act(() => void vi.advanceTimersByTime(3000))
    expect(document.title).toBe(DEFAULT_TITLE)
  })

  it('shows the running timer and keeps it up to date every second', () => {
    entries = [entry({ description: 'Homepage wireframe review' })]
    renderBar()
    expect(document.title).toBe('0:42:13 · Homepage wireframe review — Ticknest')
    act(() => void vi.advanceTimersByTime(1000))
    expect(document.title).toBe('0:42:14 · Homepage wireframe review — Ticknest')
    act(() => void vi.advanceTimersByTime(2000))
    expect(document.title).toBe('0:42:16 · Homepage wireframe review — Ticknest')
  })

  it('follows a changed description and falls back to the project name', () => {
    entries = [entry({ description: 'Before' })]
    renderBar()
    act(() => emitEntries([entry({ description: 'After' })]))
    expect(document.title).toBe('0:42:13 · After — Ticknest')
    act(() => emitEntries([entry({ description: '', projectName: 'Website' })]))
    expect(document.title).toBe('0:42:13 · Website — Ticknest')
  })

  it('starts showing the timer when one is started', () => {
    renderBar()
    act(() => emitEntries([entry({ description: 'New work', startAt: Timestamp.fromMillis(Date.now()) })]))
    expect(document.title).toBe('0:00:00 · New work — Ticknest')
  })

  it('restores the default title when the timer stops', () => {
    entries = [entry({ description: 'Work' })]
    renderBar()
    act(() => emitEntries([entry({ description: 'Work', endAt: Timestamp.fromMillis(Date.now()) })]))
    expect(document.title).toBe(DEFAULT_TITLE)
    act(() => void vi.advanceTimersByTime(2000))
    expect(document.title).toBe(DEFAULT_TITLE)
  })

  it('restores the default title when the bar unmounts, as on sign-out', () => {
    entries = [entry({ description: 'Work' })]
    const { unmount } = renderBar()
    expect(document.title).not.toBe(DEFAULT_TITLE)
    unmount()
    expect(document.title).toBe(DEFAULT_TITLE)
  })
})
