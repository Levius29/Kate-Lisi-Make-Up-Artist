import type { AppointmentStatus } from '../../types'

/*
 * The single source of truth for how a booking's status looks and reads.
 *
 * These tints and labels used to live inside Calendar.tsx, so the calendar showed a booking's
 * status in colour and every other screen showed it as plain text — the same appointment looked
 * like two different things depending on where you saw it. Anything that displays a status
 * imports from here.
 *
 * Colour is never the only signal: every place that uses a tint also prints `statusLabel`.
 * Someone who cannot separate these hues still reads the word.
 *
 * The tokens are defined in src/index.css and every pair is gated by scripts/check-contrast.mjs
 * at text >= 5.5:1 and borders >= 3:1. If a tint fails that gate, change the tint — not the gate.
 */

const STATUS_OPTIONS: readonly { value: AppointmentStatus; label: string }[] = [
  { value: 'enquiry', label: 'Enquiry' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'balance_paid', label: 'Balance paid' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export const appointmentStatusOptions = STATUS_OPTIONS

export function statusLabel(status: AppointmentStatus): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
}

/** Border, surface and text together. For a filled chip or a card with a coloured edge. */
export const statusStyles: Record<AppointmentStatus, string> = {
  enquiry: 'border-status-enquiry-line bg-status-enquiry-surface text-status-enquiry-text',
  quoted: 'border-status-quoted-line bg-status-quoted-surface text-status-quoted-text',
  confirmed: 'border-status-confirmed-line bg-status-confirmed-surface text-status-confirmed-text',
  balance_paid: 'border-status-paid-line bg-status-paid-surface text-status-paid-text',
  completed: 'border-status-completed-line bg-status-completed-surface text-status-completed-text',
  // Keep cancelled fully opaque: fading the whole chip also fades its text below readable contrast.
  cancelled: 'border-status-cancelled-line bg-status-cancelled-surface text-status-cancelled-text',
}

/** Just the dot colour, for a list row that should stay on the page background. */
export const statusDot: Record<AppointmentStatus, string> = {
  enquiry: 'bg-status-enquiry-line',
  quoted: 'bg-status-quoted-line',
  confirmed: 'bg-status-confirmed-line',
  balance_paid: 'bg-status-paid-line',
  completed: 'bg-status-completed-line',
  cancelled: 'bg-status-cancelled-line',
}
