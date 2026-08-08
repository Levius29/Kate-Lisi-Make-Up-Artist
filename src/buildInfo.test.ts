import { describe, expect, it } from 'vitest'

import { formatBuildDate, formatBuildMarker } from './buildInfo'

describe('build marker', () => {
  /*
   * Written out in full and in Rome time, like every other date in this interface. The first
   * version of this printed "09:30 UTC", which the DOM audit flagged as jargon — correctly, and
   * it also broke the rule that a date shown here is never in a second format.
   */
  it('writes the build date in full, in Rome time, with the zone named', () => {
    expect(formatBuildDate('2026-08-08T09:30:00.000Z')).toBe(
      '8 August 2026 at 11:30 (CEST, Rome)',
    )
  })

  it('puts a short commit beside it', () => {
    expect(formatBuildMarker('a7b3a4512345', '2026-08-08T09:30:00.000Z')).toBe(
      'Version a7b3a45 · 8 August 2026 at 11:30 (CEST, Rome)',
    )
  })

  it('carries no developer jargon the DOM audit would flag', () => {
    const marker = formatBuildMarker('a7b3a4512345', '2026-08-08T09:30:00.000Z')
    expect(marker).not.toMatch(/\bUTC\b|integer cents|IndexedDB|snapshotted/i)
  })

  it('says so plainly when the date is not a date', () => {
    expect(formatBuildDate('not-a-date')).toBe('Unknown build date')
  })
})
