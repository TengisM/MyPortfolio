import type { FieldError } from 'react-hook-form'
import type { mn } from '@/admin/i18n/mn'
import { useT } from '@/admin/i18n/use-t'

type FieldKey = Extract<keyof typeof mn, `field${string}`>

// Zod schemas in the panel use dictionary keys as messages ('fieldRequired'), so the text follows
// the panel language. zod's own messages are English-only.
export function fieldKey(key: FieldKey): FieldKey {
  return key
}

// Spread onto the control: wires the error text to it for screen readers.
export function fieldProps(id: string, error: FieldError | undefined) {
  return {
    id,
    'aria-invalid': error !== undefined,
    'aria-describedby': error !== undefined ? `${id}-error` : undefined,
  }
}

export function FieldMessage({ id, error }: { id: string; error: FieldError | undefined }) {
  const t = useT()
  if (error === undefined) return null
  const key = error.message ?? ''
  // A message that is not a field key means a schema forgot to pass one. Say something rather
  // than show zod's English.
  const text = key.startsWith('field') && key in t ? t[key as FieldKey] : t.errUnknown
  return (
    <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
      {text}
    </p>
  )
}
