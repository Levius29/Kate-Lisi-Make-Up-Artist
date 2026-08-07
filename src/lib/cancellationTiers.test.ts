import { describe, expect, it } from 'vitest'

import type { CancellationTier } from '../types'
import {
  cancellationTierForNotice,
  normaliseCancellationTiers,
} from './cancellationTiers'

const defaultLadder: CancellationTier[] = [
  { daysBefore: 91, retainPercent: 0 },
  { daysBefore: 30, retainPercent: 50 },
  { daysBefore: 0, retainPercent: 100 },
]

describe('cancellation tier selection', () => {
  it.each([
    { noticeDays: 91, retained: 0 },
    { noticeDays: 90, retained: 50 },
    { noticeDays: 31, retained: 50 },
    { noticeDays: 30, retained: 50 },
    { noticeDays: 29, retained: 100 },
  ])('retains $retained percent at $noticeDays days notice', ({ noticeDays, retained }) => {
    expect(cancellationTierForNotice(noticeDays, defaultLadder)?.retainPercent).toBe(
      retained,
    )
  })
})

describe('cancellation tier validation', () => {
  it('sorts valid tiers descending without mutating the form order', () => {
    const tiers = [
      { daysBefore: 0, retainPercent: 100 },
      { daysBefore: 91, retainPercent: 0 },
      { daysBefore: 30, retainPercent: 50 },
    ]

    expect(normaliseCancellationTiers(tiers)).toEqual({
      tiers: defaultLadder,
      errors: [],
    })
    expect(tiers.map(({ daysBefore }) => daysBefore)).toEqual([0, 91, 30])
  })

  it('rejects duplicate thresholds and retention outside zero to one hundred', () => {
    expect(
      normaliseCancellationTiers([
        { daysBefore: 30, retainPercent: 50 },
        { daysBefore: 30, retainPercent: 101 },
        { daysBefore: 0, retainPercent: -1 },
      ]).errors,
    ).toEqual([
      'Each notice threshold must be distinct.',
      'Retention must be between 0 and 100 percent.',
    ])
  })
})
