// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { Timestamp } from 'firebase/firestore'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Catalog } from '../../src/lib/catalog'
import type { TimeEntry } from '../../src/lib/timeEntries'
import { changeAppLanguage } from '../../src/i18n'
import { PALETTES } from '../../src/palettes'
import { createAppTheme } from '../../src/theme'
import { TimerBar } from '../../src/TimerBar'

let entries: TimeEntry[]
let emitEntries: (entries: TimeEntry[]) => void = () => {}
const startTimer = vi.fn()
const updateRunningTimerDescription = vi.fn()

vi.mock('../../src/lib/timeEntries', () => ({
  subscribeToTimeEntries: (_workspaceId: string, _uid: string, onChange: (entries: TimeEntry[]) => void) => {
    emitEntries = onChange
    onChange(entries)
    return () => {}
  },
  startTimer: (...args: unknown[]) => startTimer(...args),
  stopTimer: vi.fn(),
  updateRunningTimer: vi.fn(),
  updateRunningTimerDescription: (...args: unknown[]) => updateRunningTimerDescription(...args),
}))

const user = { uid: 'u1' } as User
const catalog: Catalog = { clients: [], projects: [], tasks: [] }

function runningEntry(description: string): TimeEntry {
  return {
    id: 'running',
    userId: 'u1',
    description,
    clientName: null,
    projectName: null,
    taskName: null,
    billable: false,
    startAt: Timestamp.fromMillis(Date.now() - 60_000),
    endAt: null,
  } as TimeEntry
}

function renderBar() {
  return render(
    <ThemeProvider theme={createAppTheme(PALETTES.forest)}>
      <TimerBar user={user} workspaceId="w1" catalog={catalog} />
    </ThemeProvider>,
  )
}

const runningDescription = () =>
  screen.getByRole('textbox', { name: 'Description of the running timer' }) as HTMLInputElement

beforeEach(() => {
  entries = []
  startTimer.mockReset().mockResolvedValue('running')
  updateRunningTimerDescription.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TimerBar', () => {
  it('starts a timer with an empty description', async () => {
    renderBar()
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(startTimer).toHaveBeenCalledWith(user, 'w1', expect.objectContaining({ description: '' }))
  })

  it('trims a whitespace-only description to empty when starting', async () => {
    renderBar()
    await userEvent.type(screen.getByRole('textbox', { name: 'What are you working on?' }), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(startTimer).toHaveBeenCalledWith(user, 'w1', expect.objectContaining({ description: '' }))
  })

  it('shows an untitled running timer with an empty, editable description', () => {
    entries = [runningEntry('')]
    renderBar()
    expect(runningDescription().value).toBe('')
    expect(runningDescription().placeholder).toBe('Untitled entry')
  })

  it('saves a new description for the running timer on Enter, trimmed', async () => {
    entries = [runningEntry('')]
    renderBar()
    await userEvent.type(runningDescription(), '  Writing specs  {Enter}')
    expect(updateRunningTimerDescription).toHaveBeenCalledTimes(1)
    expect(updateRunningTimerDescription).toHaveBeenCalledWith('w1', 'running', 'Writing specs')
    expect(runningDescription().value).toBe('Writing specs')
  })

  it('saves on blur and allows clearing the description', async () => {
    entries = [runningEntry('Old name')]
    renderBar()
    await userEvent.clear(runningDescription())
    await userEvent.tab()
    expect(updateRunningTimerDescription).toHaveBeenCalledWith('w1', 'running', '')
  })

  it('does not save when the description is unchanged', async () => {
    entries = [runningEntry('Same')]
    renderBar()
    await userEvent.click(runningDescription())
    await userEvent.type(runningDescription(), ' {Enter}')
    expect(updateRunningTimerDescription).not.toHaveBeenCalled()
  })

  it('reverts the edit on Escape without saving', async () => {
    entries = [runningEntry('Original')]
    renderBar()
    await userEvent.type(runningDescription(), ' edited{Escape}')
    await waitFor(() => expect(runningDescription().value).toBe('Original'))
    expect(updateRunningTimerDescription).not.toHaveBeenCalled()
  })

  it('reverts and shows the error when saving fails', async () => {
    updateRunningTimerDescription.mockRejectedValue(new Error('Could not save.'))
    entries = [runningEntry('Original')]
    renderBar()
    await userEvent.type(runningDescription(), ' edited{Enter}')
    expect(await screen.findByText('Could not save.')).toBeTruthy()
    expect(runningDescription().value).toBe('Original')
  })

  it('follows a description saved elsewhere while not editing', async () => {
    entries = [runningEntry('Before')]
    renderBar()
    emitEntries([runningEntry('From another tab')])
    await waitFor(() => expect(runningDescription().value).toBe('From another tab'))
  })

  it('limits descriptions to 500 characters', () => {
    entries = [runningEntry('')]
    renderBar()
    expect(runningDescription().maxLength).toBe(500)
    cleanup()
    entries = []
    renderBar()
    expect((screen.getByRole('textbox', { name: 'What are you working on?' }) as HTMLInputElement).maxLength).toBe(500)
  })
})

describe('TimerBar in Spanish', () => {
  beforeEach(async () => {
    await changeAppLanguage('es')
  })
  afterEach(async () => {
    await changeAppLanguage('en')
  })

  it('labels the idle and running timer in Spanish', async () => {
    renderBar()
    expect(screen.getByRole('textbox', { name: '¿En qué estás trabajando?' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Proyecto / tarea' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar' }))
    expect(startTimer).toHaveBeenCalled()

    cleanup()
    entries = [runningEntry('')]
    renderBar()
    const description = screen.getByRole('textbox', { name: 'Descripción del temporizador en marcha' })
    expect((description as HTMLInputElement).placeholder).toBe('Registro sin título')
    expect(screen.getByRole('button', { name: 'Detener' })).toBeTruthy()
  })
})
