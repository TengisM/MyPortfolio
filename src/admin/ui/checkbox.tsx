import type * as React from 'react'
import { cn } from '@/admin/lib/utils'

// A native checkbox, not Radix: react-hook-form's `register` works on it directly, with no
// Controller, and it adds no dependency.
function Checkbox({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        'size-4 shrink-0 cursor-pointer rounded-sm accent-primary outline-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    />
  )
}

export { Checkbox }
