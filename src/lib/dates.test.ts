import { describe, expect, it } from 'vitest'

import {
  formatClientLocalTime,
  formatFullDate,
  formatFullDateTimeWithZone,
  formatFullDateWithWeekday,
  formatTimeWithZone,
  isOutsideCourtesyHours,
  zoneAbbreviation,
} from './dates'

/*
 * These assertions are the whole point of the module. If one of them starts
 * failing because a date came out as 14/09/2026 or 2026-09-14, the contract
 * generator is no longer safe to send to a client — see SPEC.md §4.5.
 */
describe('client-facing dates are written out in full', () => {
  const weddingDay = '2026-09-14T12:00:00.000Z'

  it('writes the example from the spec exactly', () => {
    expect(formatFullDate(weddingDay)).toBe('14 September 2026')
  })

  it('never emits a numeric date', () => {
    for (const iso of [weddingDay, '2026-01-02T09:00:00.000Z', '2026-12-31T23:00:00.000Z']) {
      const rendered = formatFullDate(iso)
      expect(rendered).not.toMatch(/\d{1,2}[/-]\d{1,2}/)
      expect(rendered).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/)
    }
  })

  it('renders the Italian month name for the Italian contract', () => {
    expect(formatFullDate(weddingDay, 'it')).toBe('14 settembre 2026')
  })

  it('adds the weekday for calendar views', () => {
    expect(formatFullDateWithWeekday(weddingDay)).toBe('Monday 14 September 2026')
  })

  /*
   * 2 January is the case that separates the two readings: a US client reads
   * 01/02 as 1 February, a UK client as 2 January.
   */
  it('is unambiguous on a date that US and UK clients would read differently', () => {
    expect(formatFullDate('2026-01-02T12:00:00.000Z')).toBe('2 January 2026')
    expect(formatFullDate('2026-02-01T12:00:00.000Z')).toBe('1 February 2026')
  })
})

describe('times carry the zone actually in force', () => {
  it('uses CEST in summer, not a hard-coded CET', () => {
    expect(zoneAbbreviation('2026-09-14T12:00:00.000Z')).toBe('CEST')
    expect(formatTimeWithZone('2026-09-14T12:00:00.000Z')).toBe('14:00 (CEST, Rome)')
  })

  it('uses CET in winter', () => {
    expect(zoneAbbreviation('2026-01-14T12:00:00.000Z')).toBe('CET')
    expect(formatTimeWithZone('2026-01-14T12:00:00.000Z')).toBe('13:00 (CET, Rome)')
  })

  it('combines date and time for a contract line', () => {
    expect(formatFullDateTimeWithZone('2026-09-14T12:00:00.000Z')).toBe(
      '14 September 2026 at 14:00 (CEST, Rome)',
    )
  })

  /*
   * Zones resolve to a named abbreviation where en-GB has one (CEST, BST, GST)
   * and to a plain GMT offset otherwise. Either way the label is unambiguous,
   * which is the point: "EDT" means nothing in Dubai and "CST" could be Chicago,
   * Shanghai or Havana. Both forms are covered here so a change in the runtime's
   * timezone data shows up as a failing test rather than a surprise in a message.
   */
  it('shows the client their own local time with an unambiguous zone label', () => {
    // 14:00 in Rome is 08:00 in New York and 16:00 in Dubai.
    expect(formatClientLocalTime('2026-09-14T12:00:00.000Z', 'America/New_York')).toBe(
      '08:00 (GMT-4, New York)',
    )
    expect(formatClientLocalTime('2026-09-14T12:00:00.000Z', 'Asia/Dubai')).toBe(
      '16:00 (GST, Dubai)',
    )
    expect(formatClientLocalTime('2026-09-14T12:00:00.000Z', 'Europe/London')).toBe(
      '13:00 (BST, London)',
    )
  })
})

describe('courtesy hours guard the recall dashboard', () => {
  it('flags a message that would land at 04:00 for the client', () => {
    // 09:00 Rome on a summer day is 03:00 in New York.
    expect(isOutsideCourtesyHours('2026-09-14T07:00:00.000Z', 'America/New_York')).toBe(true)
  })

  it('accepts mid-morning in the client zone', () => {
    expect(isOutsideCourtesyHours('2026-09-14T14:00:00.000Z', 'America/New_York')).toBe(false)
  })

  it('treats 20:00 as outside and 19:59 as inside', () => {
    expect(isOutsideCourtesyHours('2026-09-14T18:00:00.000Z', 'Europe/Rome')).toBe(true)
    expect(isOutsideCourtesyHours('2026-09-14T17:59:00.000Z', 'Europe/Rome')).toBe(false)
  })
})
