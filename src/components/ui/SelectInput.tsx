import type { ComponentProps } from 'react'

interface SelectInputProps extends ComponentProps<'select'> {
  hasError?: boolean
}

export function SelectInput({ className = '', hasError, ...props }: SelectInputProps) {
  return (
    <select
      className={`min-h-11 w-full min-w-0 rounded-xl border bg-paper px-3.5 py-2.5 text-base leading-6 text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:opacity-60 ${
        hasError ? 'border-red-700' : 'border-line'
      } ${className}`}
      aria-invalid={hasError || undefined}
      {...props}
    />
  )
}
