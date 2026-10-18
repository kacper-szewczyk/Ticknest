import { useEffect, useId, useRef, useState } from 'react'
import { ManualEntryFieldError, type ManualEntryField } from './lib/timeEntries'

type FieldErrors = Partial<Record<ManualEntryField, string>>

// Tracks field-level validation errors for a manual time-entry form. Each field gets an id so MUI links its
// helper text through aria-describedby and sets aria-invalid; the invalid field is focused after the error
// renders so screen readers announce the message with the field.
export function useManualEntryFieldErrors() {
  const idPrefix = useId()
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const pendingFocus = useRef<ManualEntryField | null>(null)
  const inputs = useRef<Partial<Record<ManualEntryField, HTMLInputElement | null>>>({})

  useEffect(() => {
    if (!pendingFocus.current) return
    inputs.current[pendingFocus.current]?.focus()
    pendingFocus.current = null
  }, [fieldErrors])

  // Returns true when the error belonged to a field and is now shown next to it.
  function showFieldError(error: unknown): boolean {
    if (!(error instanceof ManualEntryFieldError)) return false
    setFieldErrors({ [error.field]: error.message })
    pendingFocus.current = error.field
    return true
  }

  function clearFieldError(field: ManualEntryField) {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
  }

  function clearFieldErrors() {
    setFieldErrors({})
  }

  function fieldProps(field: ManualEntryField) {
    const message = fieldErrors[field]
    return {
      id: `${idPrefix}-${field}`,
      error: Boolean(message),
      helperText: message,
      inputRef: (element: HTMLInputElement | null) => { inputs.current[field] = element },
    }
  }

  return { fieldProps, showFieldError, clearFieldError, clearFieldErrors }
}
