import { describe, expect, it } from 'vitest'
import { validateManualEntry } from '../../src/lib/timeEntryValidation'
import type { ManualEntryInput } from '../../src/lib/timeEntries'

function input(overrides: Partial<ManualEntryInput> = {}): ManualEntryInput {
  return {
    description: 'Design review',
    clientName: 'Acme',
    projectName: 'Website',
    taskName: 'Review',
    clientId: 'client-1',
    projectId: 'project-1',
    taskId: 'task-1',
    billable: true,
    startAt: new Date('2026-10-14T08:00:00Z'),
    endAt: new Date('2026-10-14T09:00:00Z'),
    ...overrides,
  }
}

describe('validateManualEntry', () => {
  it('returns the trimmed description of a valid entry', () => {
    expect(validateManualEntry(input({ description: '  Design review  ' }))).toBe('Design review')
  })

  it('accepts entries without a client, project, or task', () => {
    expect(validateManualEntry(input({ clientName: null, projectName: null, taskName: null }))).toBe('Design review')
  })

  it('requires a description', () => {
    expect(() => validateManualEntry(input({ description: '   ' }))).toThrow('Add a description for this entry.')
  })

  it('limits descriptions to 500 characters', () => {
    expect(validateManualEntry(input({ description: 'a'.repeat(500) }))).toHaveLength(500)
    expect(() => validateManualEntry(input({ description: 'a'.repeat(501) }))).toThrow('Descriptions must be 500 characters or fewer.')
  })

  it.each([
    ['clientName', 'Client'],
    ['projectName', 'Project'],
    ['taskName', 'Task'],
  ] as const)('limits %s to 100 characters', (field, label) => {
    expect(() => validateManualEntry(input({ [field]: ` ${'a'.repeat(100)} ` }))).not.toThrow()
    expect(() => validateManualEntry(input({ [field]: 'a'.repeat(101) }))).toThrow(`${label} names must be 100 characters or fewer.`)
  })

  it('requires the end to be after the start', () => {
    const startAt = new Date('2026-10-14T08:00:00Z')
    expect(() => validateManualEntry(input({ startAt, endAt: new Date(startAt) }))).toThrow('The end time must be later than the start time.')
    expect(() => validateManualEntry(input({ startAt, endAt: new Date('2026-10-14T07:59:59Z') }))).toThrow('The end time must be later than the start time.')
  })

  it('rejects invalid dates', () => {
    expect(() => validateManualEntry(input({ startAt: new Date('invalid') }))).toThrow('The end time must be later than the start time.')
    expect(() => validateManualEntry(input({ endAt: new Date('invalid') }))).toThrow('The end time must be later than the start time.')
  })
})
