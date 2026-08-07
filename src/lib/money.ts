/**
 * Money.
 *
 * Everything is stored as integer cents. Floats drift, and here the drift lands
 * on two numbers that must be exact: the EUR 77.47 stamp-duty threshold and the
 * EUR 85,000 forfettario ceiling.
 *
 * Currency is always written "EUR 450.00" — never a bare € symbol, which reads
 * ambiguously to US and Gulf clients (SPEC.md §4.5).
 */
import type { TextLocale } from './dates'

export type MoneyCents = number

/** EUR 2.00 stamp duty, in cents. Hard-coded: it is set by law, not by her. */
export const STAMP_DUTY_CENTS = 200

/** Stamp duty applies above EUR 77.47, in cents. */
export const STAMP_DUTY_THRESHOLD_CENTS = 7747

export function eurosToCents(euros: number): MoneyCents {
  return Math.round(euros * 100)
}

export function centsToEuros(cents: MoneyCents): number {
  return cents / 100
}

/**
 * Parses what a person types — "1.250,50", "1,250.50", "1250.5", "€ 450" — into
 * cents. Returns null when the input is not a number, so callers can show an
 * error rather than silently storing zero.
 */
export function parseEurosToCents(input: string): MoneyCents | null {
  const cleaned = input.replace(/[^\d.,-]/g, '').trim()
  if (cleaned === '' || cleaned === '-') return null

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalised: string

  if (lastComma === -1 && lastDot === -1) {
    normalised = cleaned
  } else if (lastComma > lastDot) {
    // Italian style: dots group thousands, comma is the decimal separator.
    normalised = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    // English style: commas group thousands, dot is the decimal separator.
    normalised = cleaned.replace(/,/g, '')
  }

  const value = Number(normalised)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

/**
 * "EUR 450.00" in English, "EUR 1.250,00" in Italian — the separators follow the
 * language of the document, the "EUR " prefix never varies.
 */
export function formatEUR(cents: MoneyCents, locale: TextLocale = 'en'): string {
  const amount = new Intl.NumberFormat(locale === 'it' ? 'it-IT' : 'en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centsToEuros(cents))
  return `EUR ${amount}`
}

/** Percentage of an amount, rounded to the nearest cent, never a float. */
export function percentOf(cents: MoneyCents, percent: number): MoneyCents {
  return Math.round((cents * percent) / 100)
}

export function sumCents(values: readonly MoneyCents[]): MoneyCents {
  return values.reduce((total, value) => total + value, 0)
}

/**
 * Stamp duty is charged when the invoice total exceeds EUR 77.47, and it is
 * ALWAYS recharged to the client — there is no per-invoice toggle (SPEC.md §4.6).
 */
export function stampDutyForTotal(totalCents: MoneyCents): MoneyCents {
  return totalCents > STAMP_DUTY_THRESHOLD_CENTS ? STAMP_DUTY_CENTS : 0
}
