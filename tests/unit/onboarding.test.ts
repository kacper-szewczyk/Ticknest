import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Catalog } from '../../src/lib/catalog'
import { dismissSetupReminder, hasSetupLeft, isSetupReminderDismissed, nextSetupStep } from '../../src/lib/onboarding'

const emptyCatalog: Catalog = { clients: [], projects: [], tasks: [] }
const withProject: Catalog = {
  clients: [],
  projects: [
    {
      id: 'p1',
      name: 'Website',
      clientId: null,
      description: '',
      color: '#123456',
      estimateMinutes: null,
      archived: false,
    },
  ],
  tasks: [],
}

describe('nextSetupStep', () => {
  it('always moves from the client step to the project step', () => {
    expect(nextSetupStep('client', false)).toBe('project')
    expect(nextSetupStep('client', true)).toBe('project')
  })

  it('offers the task step only when there is a project to attach it to', () => {
    expect(nextSetupStep('project', true)).toBe('task')
    expect(nextSetupStep('project', false)).toBeNull()
  })

  it('finishes after the task step', () => {
    expect(nextSetupStep('task', true)).toBeNull()
  })
})

describe('hasSetupLeft', () => {
  it('is true for an owner whose workspace has no projects', () => {
    expect(hasSetupLeft('owner', emptyCatalog)).toBe(true)
    expect(hasSetupLeft('owner', { ...emptyCatalog, clients: [{ id: 'c1', name: 'Acme', archived: false }] })).toBe(
      true,
    )
  })

  it('is false once a project exists', () => {
    expect(hasSetupLeft('owner', withProject)).toBe(false)
  })

  it('is false for members and managers, who cannot manage the catalog', () => {
    expect(hasSetupLeft('member', emptyCatalog)).toBe(false)
    expect(hasSetupLeft('manager', emptyCatalog)).toBe(false)
    expect(hasSetupLeft(undefined, emptyCatalog)).toBe(false)
  })
})

describe('setup reminder dismissal', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('remembers a dismissal per user and workspace', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    })
    expect(isSetupReminderDismissed('u1', 'w1')).toBe(false)
    dismissSetupReminder('u1', 'w1')
    expect(isSetupReminderDismissed('u1', 'w1')).toBe(true)
    expect(isSetupReminderDismissed('u1', 'w2')).toBe(false)
    expect(isSetupReminderDismissed('u2', 'w1')).toBe(false)
  })

  it('treats unavailable storage as not dismissed', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {
          throw new Error('blocked')
        },
      },
    })
    expect(() => dismissSetupReminder('u1', 'w1')).not.toThrow()
    expect(isSetupReminderDismissed('u1', 'w1')).toBe(false)
  })
})
