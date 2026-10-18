import { describe, expect, it } from 'vitest'
import { ManualEntryFieldError, validateManualEntryFields } from '../../src/lib/timeEntryValidation'

const START = new Date('2026-10-14T08:00:00Z')
const END = new Date('2026-10-14T09:00:00Z')

function fieldError(run: () => void): ManualEntryFieldError {
  try {
    run()
  } catch (error) {
    if (error instanceof ManualEntryFieldError) return error
    throw error
  }
  throw new Error('Expected a ManualEntryFieldError.')
}

describe('validateManualEntryFields', () => {
  it('accepts a valid entry', () => {
    expect(() =>
      validateManualEntryFields({ description: ' Design review ', startAt: START, endAt: END }),
    ).not.toThrow()
  })

  it('requires a description', () => {
    const error = fieldError(() => validateManualEntryFields({ description: '   ', startAt: START, endAt: END }))
    expect(error.field).toBe('description')
    expect(error.message).toBe('Add a description for this entry.')
  })

  it('limits trimmed descriptions to 500 characters', () => {
    expect(() =>
      validateManualEntryFields({ description: ` ${'a'.repeat(500)} `, startAt: START, endAt: END }),
    ).not.toThrow()
    const error = fieldError(() =>
      validateManualEntryFields({ description: 'a'.repeat(501), startAt: START, endAt: END }),
    )
    expect(error.field).toBe('description')
    expect(error.message).toBe('Descriptions must be 500 characters or fewer.')
  })

  it('points an invalid start at the start field', () => {
    const error = fieldError(() =>
      validateManualEntryFields({ description: 'Work', startAt: new Date('invalid'), endAt: END }),
    )
    expect(error.field).toBe('startAt')
  })

  it('points an invalid end at the end field', () => {
    const error = fieldError(() =>
      validateManualEntryFields({ description: 'Work', startAt: START, endAt: new Date('invalid') }),
    )
    expect(error.field).toBe('endAt')
  })

  it('requires the end to be after the start', () => {
    for (const endAt of [new Date(START), new Date('2026-10-14T07:59:59Z')]) {
      const error = fieldError(() => validateManualEntryFields({ description: 'Work', startAt: START, endAt }))
      expect(error.field).toBe('endAt')
      expect(error.message).toBe('The end time must be later than the start time.')
    }
  })

  it('is an Error with its own name', () => {
    const error = new ManualEntryFieldError('description', 'Message')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ManualEntryFieldError')
  })
})
