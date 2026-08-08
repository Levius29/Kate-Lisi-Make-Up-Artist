import type { AppointmentStatus } from '../../types'
import { statusDot, statusLabel, statusStyles } from './appointmentStatus'

interface StatusChipProps {
  status: AppointmentStatus
  /**
   * `chip` fills the tint behind the label — for a heading or a detail screen.
   * `inline` keeps the page background and marks the status with a dot — for a dense list,
   * where a row of filled chips turns into noise.
   */
  variant?: 'chip' | 'inline'
  className?: string
}

/**
 * Shows a booking's status the same way everywhere. The tint always comes with the word, so the
 * colour is a second signal rather than the only one.
 */
export function StatusChip({ status, variant = 'chip', className = '' }: StatusChipProps) {
  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold text-muted ${className}`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot[status]}`} aria-hidden="true" />
        {statusLabel(status)}
      </span>
    )
  }

  return (
    <span
      className={
        'inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-bold uppercase' +
        ` tracking-wide ${statusStyles[status]} ${className}`
      }
    >
      {statusLabel(status)}
    </span>
  )
}
