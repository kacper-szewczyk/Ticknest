import { describe, expect, it } from 'vitest'
import { type WorkspaceSettings, validateWorkspaceSettings } from '../../src/lib/workspaceSettings'

describe('validateWorkspaceSettings', () => {
  it('trims the name and keeps the week start', () => {
    expect(validateWorkspaceSettings({ name: '  Acme Studio  ', weekStartsOn: 0 })).toEqual({
      ok: true,
      value: { name: 'Acme Studio', weekStartsOn: 0 },
    })
  })

  it('accepts an 80-character name', () => {
    expect(validateWorkspaceSettings({ name: 'a'.repeat(80), weekStartsOn: 1 }).ok).toBe(true)
  })

  it.each<[string, { name: string; weekStartsOn: number }]>([
    ['an empty name', { name: '', weekStartsOn: 1 }],
    ['a whitespace-only name', { name: '   ', weekStartsOn: 1 }],
    ['an 81-character name', { name: 'a'.repeat(81), weekStartsOn: 1 }],
    ['a week start other than Monday or Sunday', { name: 'Acme', weekStartsOn: 3 }],
  ])('rejects %s', (_, settings) => {
    expect(validateWorkspaceSettings(settings as WorkspaceSettings).ok).toBe(false)
  })
})
