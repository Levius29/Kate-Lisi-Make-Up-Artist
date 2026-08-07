import type { CancellationTier } from '../types'

export interface CancellationTierNormalisation {
  tiers?: CancellationTier[]
  errors: string[]
}

/**
 * A tier applies when the notice period is greater than or equal to
 * `daysBefore`. Tiers are evaluated in descending `daysBefore` order and the
 * first match wins.
 */
export function cancellationTierForNotice(
  noticePeriodDays: number,
  tiers: readonly CancellationTier[],
): CancellationTier | undefined {
  return [...tiers]
    .sort((left, right) => right.daysBefore - left.daysBefore)
    .find((tier) => noticePeriodDays >= tier.daysBefore)
}

export function normaliseCancellationTiers(
  tiers: readonly CancellationTier[],
): CancellationTierNormalisation {
  const errors: string[] = []
  const thresholds = tiers.map(({ daysBefore }) => daysBefore)

  if (new Set(thresholds).size !== thresholds.length) {
    errors.push('Each notice threshold must be distinct.')
  }

  if (
    tiers.some(
      ({ retainPercent }) =>
        !Number.isFinite(retainPercent) || retainPercent < 0 || retainPercent > 100,
    )
  ) {
    errors.push('Retention must be between 0 and 100 percent.')
  }

  if (
    tiers.some(
      ({ daysBefore }) => !Number.isSafeInteger(daysBefore) || daysBefore < 0,
    )
  ) {
    errors.push('Notice thresholds must be zero or a positive whole number.')
  }

  if (errors.length > 0) return { errors }

  return {
    errors,
    tiers: [...tiers].sort((left, right) => right.daysBefore - left.daysBefore),
  }
}

export const DEFAULT_CANCELLATION_TIERS: CancellationTier[] = [
  // Zero means the Article 1382 penalty is nil. The caparra confirmatoria is
  // still retained separately under Article 1385; no extra boolean is needed.
  { daysBefore: 91, retainPercent: 0 },
  { daysBefore: 30, retainPercent: 50 },
  { daysBefore: 0, retainPercent: 100 },
]
