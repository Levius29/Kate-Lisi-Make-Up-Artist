import type { ComponentProps, ReactNode } from 'react'

interface FieldProps {
  children: ReactNode
  className?: string
}

export function Field({ children, className = '' }: FieldProps) {
  return <div className={`min-w-0 space-y-2 ${className}`}>{children}</div>
}

interface FieldLabelProps extends ComponentProps<'label'> {
  required?: boolean
}

export function FieldLabel({ children, className = '', required, ...props }: FieldLabelProps) {
  return (
    <label
      className={`block text-sm font-semibold leading-5 text-ink ${className}`}
      {...props}
    >
      {children}
      {required ? (
        <span className="ml-1 text-accent" aria-hidden="true">
          *
        </span>
      ) : null}
    </label>
  )
}

export function HelperText({ className = '', ...props }: ComponentProps<'p'>) {
  return <p className={`text-sm leading-5 text-muted ${className}`} {...props} />
}

export function ErrorText({ className = '', ...props }: ComponentProps<'p'>) {
  return (
    <p
      className={`text-sm font-medium leading-5 text-red-800 ${className}`}
      role="status"
      {...props}
    />
  )
}
