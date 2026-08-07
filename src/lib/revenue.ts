import type { Appointment, Invoice, MoneyCents } from '../types'
import { romeDateKey } from './appointmentSchedule'
import { percentOf, stampDutyForTotal, sumCents } from './money'

type RevenueAppointment = Pick<Appointment, 'total' | 'payments'> &
  Partial<Pick<Appointment, 'id'>>
type RevenueInvoice = Pick<Invoice, 'appointmentId' | 'stampDuty' | 'paidAt'>

function romeYear(iso: string): number {
  return Number(romeDateKey(iso).slice(0, 4))
}

/**
 * Revenue is recognised on a cash basis: only amounts whose paidAt falls in the
 * requested Rome calendar year count. That is the intended reading for the
 * regime forfettario and makes the year boundary independent of device timezone.
 *
 * Once an invoice exists, its snapshotted stamp and paidAt determine the stamp
 * revenue. For older/uninvoiced bookings, the Stage 8 fallback still attributes
 * it once to the first cash payment. This prevents an appointment and its invoice
 * from each contributing the same EUR 2.00.
 *
 * The recharge is deliberately INCLUDED, not netted out: under SPEC.md §4.6 it
 * forms part of her compensation rather than a pass-through expense.
 */
export function calculateRevenueForYear(
  appointments: readonly RevenueAppointment[],
  year: number,
  invoices: readonly RevenueInvoice[] = [],
): MoneyCents {
  const invoicedAppointmentIds = new Set(invoices.map(({ appointmentId }) => appointmentId))
  const appointmentRevenue = sumCents(
    appointments.map((appointment, index) => {
      const payments = [...appointment.payments].sort((left, right) =>
        left.paidAt.localeCompare(right.paidAt),
      )
      const paymentsInYear = payments.filter(({ paidAt }) => romeYear(paidAt) === year)
      const cashReceived = sumCents(paymentsInYear.map(({ amount }) => amount))
      const firstPayment = payments[0]
      const rechargedStamp =
        !invoicedAppointmentIds.has(
          // RevenueAppointment is deliberately a small structural type. Invoice
          // matching therefore uses the array's full Appointment id when present.
          appointment.id ?? `missing-${index}`,
        ) && firstPayment && romeYear(firstPayment.paidAt) === year
          ? stampDutyForTotal(appointment.total)
          : 0

      return cashReceived + rechargedStamp
    }),
  )
  const invoiceStampRevenue = sumCents(
    invoices
      .filter((invoice) => invoice.paidAt && romeYear(invoice.paidAt) === year)
      .map(({ stampDuty }) => stampDuty),
  )

  return appointmentRevenue + invoiceStampRevenue
}

export function calculateCurrentYearRevenue(
  appointments: readonly RevenueAppointment[],
  nowIso: string,
  invoices: readonly RevenueInvoice[] = [],
): MoneyCents {
  return calculateRevenueForYear(appointments, romeYear(nowIso), invoices)
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
