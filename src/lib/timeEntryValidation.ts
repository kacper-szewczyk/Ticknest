import { i18n } from '../i18n'
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
  const { t } = i18n
  const description = input.description.trim()
  if (description.length > 500) throw new ManualEntryFieldError('description', t('entryEditor.descriptionTooLong'))
  if (!Number.isFinite(input.startAt.getTime()))
    throw new ManualEntryFieldError('startAt', t('entryEditor.invalidStart'))
  if (!Number.isFinite(input.endAt.getTime())) throw new ManualEntryFieldError('endAt', t('entryEditor.invalidEnd'))
  if (input.endAt <= input.startAt) throw new ManualEntryFieldError('endAt', t('entryEditor.endBeforeStart'))
}
