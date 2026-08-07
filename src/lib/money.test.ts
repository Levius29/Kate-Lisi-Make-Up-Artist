import { describe, expect, it } from 'vitest'

import {
  formatEUR,
  parseEurosToCents,
  percentOf,
  stampDutyForTotal,
  sumCents,
} from './money'

describe('currency is always written EUR 450.00', () => {
  it('matches the spec example exactly', () => {
    expect(formatEUR(45000)).toBe('EUR 450.00')
  })

  it('never emits a bare euro symbol', () => {
    for (const cents of [0, 199, 45000, 850000000]) {
      expect(formatEUR(cents)).not.toContain('€')
      expect(formatEUR(cents)).toMatch(/^EUR /)
    }
  })

  it('always shows two decimals', () => {
    expect(formatEUR(0)).toBe('EUR 0.00')
    expect(formatEUR(5)).toBe('EUR 0.05')
    expect(formatEUR(50)).toBe('EUR 0.50')
    expect(formatEUR(100)).toBe('EUR 1.00')
  })

  /*
   * Separators follow the language of the document, because the Italian contract
   * is read by an Italian court. Italian also starts grouping later than English
   * — CLDR sets minimumGroupingDigits 2 for it-IT — so 1250 has no separator
   * while 12500 does. Both are pinned here so a CLDR change is visible.
   */
  it('groups thousands the way the document language does', () => {
    expect(formatEUR(125000)).toBe('EUR 1,250.00')
    expect(formatEUR(125000, 'it')).toBe('EUR 1250,00')
    expect(formatEUR(1250000)).toBe('EUR 12,500.00')
    expect(formatEUR(1250000, 'it')).toBe('EUR 12.500,00')
    expect(formatEUR(8500000, 'it')).toBe('EUR 85.000,00')
  })
})

describe('typed amounts become exact cents', () => {
  it('reads both English and Italian separators', () => {
    expect(parseEurosToCents('450')).toBe(45000)
    expect(parseEurosToCents('450.50')).toBe(45050)
    expect(parseEurosToCents('450,50')).toBe(45050)
    expect(parseEurosToCents('1,250.50')).toBe(125050)
    expect(parseEurosToCents('1.250,50')).toBe(125050)
    expect(parseEurosToCents('€ 450')).toBe(45000)
  })

  it('returns null rather than silently storing zero', () => {
    expect(parseEurosToCents('')).toBeNull()
    expect(parseEurosToCents('abc')).toBeNull()
  })
})

describe('percentages and sums stay in whole cents', () => {
  it('rounds a deposit to the nearest cent', () => {
    // 30% of EUR 333.33 is EUR 99.999 — must not leak a fraction of a cent.
    expect(percentOf(33333, 30)).toBe(10000)
    expect(Number.isInteger(percentOf(33333, 30))).toBe(true)
  })

  it('does not drift the way floats do', () => {
    // 0.1 + 0.2 in euros is the classic float failure; in cents it is exact.
    expect(sumCents([10, 20])).toBe(30)
    expect(sumCents([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(55)
  })
})

/*
 * SPEC.md §4.6: EUR 2.00 is added when the invoice total EXCEEDS EUR 77.47, and
 * it is always recharged. The boundary matters — at exactly 77.47 nothing is due.
 */
describe('stamp duty applies strictly above EUR 77.47', () => {
  it('is not charged at or below the threshold', () => {
    expect(stampDutyForTotal(7746)).toBe(0)
    expect(stampDutyForTotal(7747)).toBe(0)
  })

  it('is charged one cent above the threshold', () => {
    expect(stampDutyForTotal(7748)).toBe(200)
  })

  it('is a flat EUR 2.00 regardless of size', () => {
    expect(stampDutyForTotal(45000)).toBe(200)
    expect(stampDutyForTotal(500000)).toBe(200)
    expect(formatEUR(stampDutyForTotal(45000))).toBe('EUR 2.00')
  })
})
