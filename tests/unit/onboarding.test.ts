import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Catalog } from '../../src/lib/catalog'
import {
  dismissSetupReminder,
  inviteFailureKind,
  isSetupReminderDismissed,
  isValidInviteEmail,
  mergeInviteResults,
  nextSetupStep,
  parseInviteEmails,
  setupItemsLeft,
} from '../../src/lib/onboarding'

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
    expect(nextSetupStep('project', false)).toBe('invite')
  })

  it('ends with inviting the team', () => {
    expect(nextSetupStep('task', true)).toBe('invite')
    expect(nextSetupStep('invite', true)).toBeNull()
    expect(nextSetupStep('invite', false)).toBeNull()
  })
})

describe('setupItemsLeft', () => {
  const solo = { activeMembers: 1, pendingInvitations: 0 }

  it('lists a first project and a first teammate for a fresh solo workspace', () => {
    expect(setupItemsLeft('owner', emptyCatalog, solo)).toEqual(['project', 'invite'])
    expect(
      setupItemsLeft('owner', { ...emptyCatalog, clients: [{ id: 'c1', name: 'Acme', archived: false }] }, solo),
    ).toEqual(['project', 'invite'])
  })

  it('drops the project item once a project exists', () => {
    expect(setupItemsLeft('owner', withProject, solo)).toEqual(['invite'])
  })

  it('drops the invite item once someone joined or has a pending invitation', () => {
    expect(setupItemsLeft('owner', withProject, { activeMembers: 2, pendingInvitations: 0 })).toEqual([])
    expect(setupItemsLeft('owner', withProject, { activeMembers: 1, pendingInvitations: 1 })).toEqual([])
  })

  it('leaves the invite item out until the team has loaded', () => {
    expect(setupItemsLeft('owner', emptyCatalog, undefined)).toEqual(['project'])
    expect(setupItemsLeft('owner', withProject, undefined)).toEqual([])
  })

  it('is empty for members and managers, who cannot manage the catalog or invite people', () => {
    expect(setupItemsLeft('member', emptyCatalog, solo)).toEqual([])
    expect(setupItemsLeft('manager', emptyCatalog, solo)).toEqual([])
    expect(setupItemsLeft(undefined, emptyCatalog, solo)).toEqual([])
  })
})

describe('parseInviteEmails', () => {
  it('splits on commas, semicolons, spaces, and new lines', () => {
    expect(parseInviteEmails('a@x.io, b@x.io;c@x.io\n d@x.io\te@x.io')).toEqual([
      'a@x.io',
      'b@x.io',
      'c@x.io',
      'd@x.io',
      'e@x.io',
    ])
  })

  it('lowercases and removes repeats and blanks', () => {
    expect(parseInviteEmails(' Alex@Example.com ,, alex@example.com\n\n')).toEqual(['alex@example.com'])
    expect(parseInviteEmails('  \n , ')).toEqual([])
  })
})

describe('isValidInviteEmail', () => {
  it('accepts ordinary addresses and rejects malformed or overlong ones', () => {
    expect(isValidInviteEmail('sam@example.com')).toBe(true)
    expect(isValidInviteEmail('sam@example')).toBe(false)
    expect(isValidInviteEmail('sam.example.com')).toBe(false)
    expect(isValidInviteEmail(`${'a'.repeat(250)}@x.io`)).toBe(false)
  })
})

describe('inviteFailureKind', () => {
  function callableError(code: string, message: string): Error {
    return Object.assign(new Error(message), { code })
  }

  it('tells an existing member from an existing invitation', () => {
    expect(
      inviteFailureKind(callableError('functions/already-exists', 'This person is already a workspace member.')),
    ).toBe('already-member')
    expect(
      inviteFailureKind(
        callableError('functions/already-exists', 'A pending invitation already exists for this email.'),
      ),
    ).toBe('already-invited')
  })

  it('reports rejected addresses as invalid', () => {
    expect(inviteFailureKind(callableError('functions/invalid-argument', 'Enter a valid email address.'))).toBe(
      'invalid',
    )
  })

  it('treats anything else as a failure to retry', () => {
    expect(inviteFailureKind(callableError('functions/unavailable', 'Service unavailable'))).toBe('failed')
    expect(inviteFailureKind(new Error('offline'))).toBe('failed')
    expect(inviteFailureKind('nope')).toBe('failed')
  })
})

describe('mergeInviteResults', () => {
  const created = { email: 'alex@x.io', status: 'created' as const, link: 'https://ticknest.app/?invite=1' }

  it('replaces a failed attempt with the retry', () => {
    const failed = { email: 'sam@x.io', status: 'failed' as const, message: 'offline' }
    const retried = { email: 'sam@x.io', status: 'created' as const, link: 'https://ticknest.app/?invite=2' }
    expect(mergeInviteResults([created, failed], [retried])).toEqual([created, retried])
  })

  it('keeps a created invitation and its link when the address is entered again', () => {
    const again = { email: 'alex@x.io', status: 'already-invited' as const, message: 'pending' }
    expect(mergeInviteResults([created], [again])).toEqual([created])
  })

  it('appends results for new addresses', () => {
    const member = { email: 'olive@x.io', status: 'already-member' as const, message: 'member' }
    expect(mergeInviteResults([created], [member])).toEqual([created, member])
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
