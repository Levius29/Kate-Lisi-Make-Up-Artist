/**
 * Date formatting for anything a client can read.
 *
 * There is deliberately NO numeric date formatter in this module, and there must
 * never be one. A US client reads 09/14 as 14 September; a UK client reads 14/09
 * as the same day; on a wedding date the two readings differ by months and the
 * mistake is unrecoverable. Every client-facing date is written out in full.
 *
 * Times always carry an explicit zone label, because "14:00" means nothing to
 * someone in New York reading a contract for a wedding in Rome.
 */
import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { enGB, it as itLocale } from 'date-fns/locale'

export type TextLocale = 'en' | 'it'

/** Everything is stored UTC and displayed in Rome time unless stated otherwise. */
export const BUSINESS_TIMEZONE = 'Europe/Rome'

const LOCALES = { en: enGB, it: itLocale } as const

/**
 * "14 September 2026" / "14 settembre 2026".
 * The only date format that may appear in a contract, an invoice or a message.
 */
export function formatFullDate(
  iso: string,
  locale: TextLocale = 'en',
  timeZone: string = BUSINESS_TIMEZONE,
): string {
  const zoned = toZonedTime(new Date(iso), timeZone)
  return format(zoned, 'd MMMM yyyy', { locale: LOCALES[locale] })
}

/** "Monday 14 September 2026" — for the calendar and day views. */
export function formatFullDateWithWeekday(
  iso: string,
  locale: TextLocale = 'en',
  timeZone: string = BUSINESS_TIMEZONE,
): string {
  const zoned = toZonedTime(new Date(iso), timeZone)
  return format(zoned, 'EEEE d MMMM yyyy', { locale: LOCALES[locale] })
}

/** "14:00" — 24-hour, no zone. Use only where the zone is already stated nearby. */
export function formatTime(
  iso: string,
  timeZone: string = BUSINESS_TIMEZONE,
): string {
  const zoned = toZonedTime(new Date(iso), timeZone)
  return format(zoned, 'HH:mm')
}

/**
 * The short zone name actually in force on that date — "CET" in winter, "CEST"
 * in summer. Derived from the date rather than hard-coded, because a hard-coded
 * "CET" is wrong for most of the wedding season.
 *
 * Formatted with en-GB deliberately. That yields CET/CEST for European zones,
 * which is what the contract must say, and a plain GMT offset ("GMT-4") for the
 * rest. The offset is the better outcome for foreign clients anyway: "EDT" means
 * nothing to a reader in Dubai, and "CST" means three different things.
 */
export function zoneAbbreviation(iso: string, timeZone: string = BUSINESS_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(new Date(iso))
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
}

/** "Rome" from "Europe/Rome"; "New York" from "America/New_York". */
export function zoneCity(timeZone: string): string {
  const last = timeZone.split('/').pop() ?? timeZone
  return last.replace(/_/g, ' ')
}

/**
 * "14:00 (CEST, Rome)" — the contract format required by SPEC.md §4.5.
 */
export function formatTimeWithZone(
  iso: string,
  timeZone: string = BUSINESS_TIMEZONE,
): string {
  return `${formatTime(iso, timeZone)} (${zoneAbbreviation(iso, timeZone)}, ${zoneCity(timeZone)})`
}

/** "14 September 2026 at 14:00 (CEST, Rome)". */
export function formatFullDateTimeWithZone(
  iso: string,
  locale: TextLocale = 'en',
  timeZone: string = BUSINESS_TIMEZONE,
): string {
  const at = locale === 'it' ? 'alle' : 'at'
  return `${formatFullDate(iso, locale, timeZone)} ${at} ${formatTimeWithZone(iso, timeZone)}`
}

/**
 * The client's own local time for a given instant, used by the recall dashboard
 * so she does not message a bride in Dallas at 04:00.
 */
export function formatClientLocalTime(iso: string, clientTimeZone: string): string {
  return formatTimeWithZone(iso, clientTimeZone)
}

/** True when the instant falls outside 09:00–20:00 in the given zone. */
export function isOutsideCourtesyHours(
  iso: string,
  timeZone: string,
  from = 9,
  to = 20,
): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      hour12: false,
    }).format(new Date(iso)),
  )
  return hour < from || hour >= to
}
