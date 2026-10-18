import type { ManualEntryInput } from './timeEntries'

/** Checks a manual entry against the same limits as the Firestore rules and returns the trimmed description. */
export function validateManualEntry(input: ManualEntryInput): string {
  const description = input.description.trim()
  if (!description) throw new Error('Add a description for this entry.')
  if (description.length > 500) throw new Error('Descriptions must be 500 characters or fewer.')
  for (const [label, value] of [['Client', input.clientName], ['Project', input.projectName], ['Task', input.taskName]] as const) {
    if ((value?.trim().length ?? 0) > 100) throw new Error(`${label} names must be 100 characters or fewer.`)
  }
  if (!Number.isFinite(input.startAt.getTime()) || !Number.isFinite(input.endAt.getTime()) || input.endAt <= input.startAt) {
    throw new Error('The end time must be later than the start time.')
  }
  return description
}
