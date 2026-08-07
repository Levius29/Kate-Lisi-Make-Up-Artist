import type { Appointment, MoneyCents } from '../types'
import { romeDateKey } from './appointmentSchedule'
import { percentOf, stampDutyForTotal, sumCents } from './money'

type RevenueAppointment = Pick<Appointment, 'total' | 'payments'>

function romeYear(iso: string): number {
  return Number(romeDateKey(iso).slice(0, 4))
}

/**
 * Revenue is recognised on a cash basis: only amounts whose paidAt falls in the
 * requested Rome calendar year count. That is the intended reading for the
 * regime forfettario and makes the year boundary independent of device timezone.
 *
 * Stage 8 has no invoice payment date for the recharged stamp yet. We attribute
 * its receipt once, to the first cash payment on that booking; this deterministic
 * rule prevents a booking paid across two years from adding EUR 2.00 twice.
 * The recharge is deliberately INCLUDED, not netted out: under SPEC.md §4.6 it
 * forms part of her compensation rather than a pass-through expense.
 */
export function calculateRevenueForYear(
  appointments: readonly RevenueAppointment[],
  year: number,
): MoneyCents {
  return sumCents(
    appointments.map((appointment) => {
      const payments = [...appointment.payments].sort((left, right) =>
        left.paidAt.localeCompare(right.paidAt),
      )
      const paymentsInYear = payments.filter(({ paidAt }) => romeYear(paidAt) === year)
      const cashReceived = sumCents(paymentsInYear.map(({ amount }) => amount))
      const firstPayment = payments[0]
      const rechargedStamp =
        firstPayment && romeYear(firstPayment.paidAt) === year
          ? stampDutyForTotal(appointment.total)
          : 0

      return cashReceived + rechargedStamp
    }),
  )
}

export function calculateCurrentYearRevenue(
  appointments: readonly RevenueAppointment[],
  nowIso: string,
): MoneyCents {
  return calculateRevenueForYear(appointments, romeYear(nowIso))
}

export type RevenueMeterBand = 'standard' | 'warning' | 'over'

export interface RevenueMeterState {
  revenue: MoneyCents
  target: MoneyCents
  warningAt: MoneyCents
  percentage: number
  headroom: MoneyCents
  band: RevenueMeterBand
}

export function revenueMeterState(
  revenue: MoneyCents,
  target: MoneyCents,
): RevenueMeterState {
  const warningAt = percentOf(target, 80)
  const percentage = target > 0 ? (revenue / target) * 100 : 0
  const band: RevenueMeterBand =
    revenue >= target && target > 0
      ? 'over'
      : revenue >= warningAt && target > 0
        ? 'warning'
        : 'standard'

  return {
    revenue,
    target,
    warningAt,
    percentage,
    headroom: Math.max(0, target - revenue),
    band,
  }
}
