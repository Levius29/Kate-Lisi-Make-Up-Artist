import type { ComponentProps } from 'react'

interface TextInputProps extends ComponentProps<'input'> {
  hasError?: boolean
}

export function TextInput({ className = '', hasError, ...props }: TextInputProps) {
  return (
    <input
      className={`min-h-11 w-full min-w-0 rounded-xl border bg-paper px-3.5 py-2.5 text-base leading-6 text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:opacity-60 ${
        hasError ? 'border-red-700' : 'border-line'
      } ${className}`}
      aria-invalid={hasError || undefined}
      {...props}
    />
  )
}

interface TextAreaProps extends ComponentProps<'textarea'> {
  hasError?: boolean
}

export function TextArea({ className = '', hasError, ...props }: TextAreaProps) {
  return (
    <textarea
      className={`w-full min-w-0 resize-y rounded-xl border bg-paper px-3.5 py-3 text-base leading-6 text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:opacity-60 ${
        hasError ? 'border-red-700' : 'border-line'
      } ${className}`}
      aria-invalid={hasError || undefined}
      {...props}
    />
  )
}
