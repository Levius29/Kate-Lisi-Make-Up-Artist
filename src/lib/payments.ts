import type { Appointment, MoneyCents } from '../types'
import { romeDateKey } from './appointmentSchedule'
import { sumCents } from './money'

export interface PaymentPortionSummary {
  due: MoneyCents
  paid: MoneyCents
  outstanding: MoneyCents
}

export interface AppointmentPaymentSummary {
  deposit: PaymentPortionSummary
  balance: PaymentPortionSummary
  totalOutstanding: MoneyCents
}

type PaymentAppointment = Pick<Appointment, 'total' | 'depositAmount' | 'payments'>
type DatedPaymentAppointment = PaymentAppointment &
  Pick<Appointment, 'startAt' | 'balanceDueAt'>
type ListedPaymentAppointment = DatedPaymentAppointment &
  Pick<Appointment, 'status'>

function portion(due: MoneyCents, paid: MoneyCents): PaymentPortionSummary {
  return { due, paid, outstanding: Math.max(0, due - paid) }
}

export function calculatePaymentSummary(
  appointment: PaymentAppointment,
): AppointmentPaymentSummary {
  const depositDue = Math.min(appointment.total, Math.max(0, appointment.depositAmount))
  const balanceDue = Math.max(0, appointment.total - depositDue)
  const depositPaid = sumCents(
    appointment.payments
      .filter(({ type }) => type === 'deposit')
      .map(({ amount }) => amount),
  )
  const balancePaid = sumCents(
    appointment.payments
      .filter(({ type }) => type === 'balance')
      .map(({ amount }) => amount),
  )
  const deposit = portion(depositDue, depositPaid)
  const balance = portion(balanceDue, balancePaid)

  return {
    deposit,
    balance,
    totalOutstanding: deposit.outstanding + balance.outstanding,
  }
}

export function paymentDueAt(appointment: DatedPaymentAppointment): string {
  return appointment.balanceDueAt ?? appointment.startAt
}

export function isBalanceOverdue(
  appointment: DatedPaymentAppointment,
  nowIso: string,
): boolean {
  return (
    calculatePaymentSummary(appointment).balance.outstanding > 0 &&
    romeDateKey(paymentDueAt(appointment)) < romeDateKey(nowIso)
  )
}

export interface OutstandingAppointment<T extends ListedPaymentAppointment> {
  appointment: T
  summary: AppointmentPaymentSummary
  dueAt: string
  overdue: boolean
}

export function outstandingAppointments<T extends ListedPaymentAppointment>(
  appointments: readonly T[],
  nowIso: string,
): OutstandingAppointment<T>[] {
  return appointments
    .filter(({ status }) => status !== 'cancelled')
    .map((appointment) => ({
      appointment,
      summary: calculatePaymentSummary(appointment),
      dueAt: paymentDueAt(appointment),
      overdue: isBalanceOverdue(appointment, nowIso),
    }))
    .filter(({ summary }) => summary.totalOutstanding > 0)
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt))
}
