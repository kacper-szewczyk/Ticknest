import type { ManualEntryInput } from './timeEntries'

export type ManualEntryField = 'description' | 'startAt' | 'endAt'

// A validation failure the form can attach to one input instead of announcing it for the whole form.
export class ManualEntryFieldError extends Error {
  readonly field: ManualEntryField

  constructor(field: ManualEntryField, message: string) {
    super(message)
    this.name = 'ManualEntryFieldError'
    this.field = field
  }
}

export function validateManualEntryFields(input: Pick<ManualEntryInput, 'description' | 'startAt' | 'endAt'>): void {
  const description = input.description.trim()
  if (!description) throw new ManualEntryFieldError('description', 'Add a description for this entry.')
  if (description.length > 500)
    throw new ManualEntryFieldError('description', 'Descriptions must be 500 characters or fewer.')
  if (!Number.isFinite(input.startAt.getTime()))
    throw new ManualEntryFieldError('startAt', 'Enter a valid start date and time.')
  if (!Number.isFinite(input.endAt.getTime()))
    throw new ManualEntryFieldError('endAt', 'Enter a valid end date and time.')
  if (input.endAt <= input.startAt)
    throw new ManualEntryFieldError('endAt', 'The end time must be later than the start time.')
}
