import { describe, expect, it } from 'vitest'

import type { Appointment, AppointmentPayment } from '../types'
import {
  calculatePaymentSummary,
  isBalanceOverdue,
  outstandingAppointments,
} from './payments'

function booking(
  overrides: Partial<
    Pick<
      Appointment,
      | 'id'
      | 'status'
      | 'startAt'
      | 'balanceDueAt'
      | 'total'
      | 'depositAmount'
      | 'payments'
    >
  > = {},
) {
  return {
    id: 'booking-1',
    status: 'confirmed' as const,
    startAt: '2026-09-14T08:00:00.000Z',
    balanceDueAt: '2026-09-01T22:00:00.000Z',
    total: 100_000,
    depositAmount: 30_000,
    payments: [] as AppointmentPayment[],
    ...overrides,
  }
}

describe('deposit and balance payment tracking', () => {
  it('keeps each payment type against its own amount due', () => {
    const summary = calculatePaymentSummary(
      booking({
        payments: [
          {
            type: 'deposit',
            amount: 20_000,
            method: 'bank_transfer',
            paidAt: '2026-03-01T10:00:00.000Z',
          },
          {
            type: 'balance',
            amount: 15_000,
            method: 'wise',
            paidAt: '2026-08-01T10:00:00.000Z',
          },
        ],
      }),
    )

    expect(summary.deposit).toEqual({ due: 30_000, paid: 20_000, outstanding: 10_000 })
    expect(summary.balance).toEqual({ due: 70_000, paid: 15_000, outstanding: 55_000 })
    expect(summary.totalOutstanding).toBe(65_000)
  })

  it('does not make a different payment type negative when one type is overpaid', () => {
    const summary = calculatePaymentSummary(
      booking({
        payments: [
          {
            type: 'deposit',
            amount: 35_000,
            method: 'revolut',
            paidAt: '2026-03-01T10:00:00.000Z',
          },
        ],
      }),
    )

    expect(summary.deposit.outstanding).toBe(0)
    expect(summary.balance.outstanding).toBe(70_000)
    expect(summary.totalOutstanding).toBe(70_000)
  })
})

describe('outstanding and overdue balances', () => {
  it('calls a partly unpaid balance overdue only after its Rome due date has passed', () => {
    const appointment = booking({ balanceDueAt: '2026-08-07T22:00:00.000Z' })

    expect(isBalanceOverdue(appointment, '2026-08-08T12:00:00.000Z')).toBe(false)
    expect(isBalanceOverdue(appointment, '2026-08-08T22:00:00.000Z')).toBe(true)
    expect(
      isBalanceOverdue(
        booking({
          balanceDueAt: '2026-08-07T22:00:00.000Z',
          payments: [
            {
              type: 'balance',
              amount: 70_000,
              method: 'wise',
              paidAt: '2026-08-08T08:00:00.000Z',
            },
          ],
        }),
        '2026-08-08T22:00:00.000Z',
      ),
    ).toBe(false)
  })

  it('sorts open bookings soonest first and leaves cancelled bookings out', () => {
    const items = outstandingAppointments(
      [
        booking({ id: 'later', balanceDueAt: '2026-10-01T22:00:00.000Z' }),
        booking({ id: 'cancelled', status: 'cancelled', balanceDueAt: '2026-08-01T22:00:00.000Z' }),
        booking({ id: 'sooner', balanceDueAt: '2026-09-01T22:00:00.000Z' }),
      ],
      '2026-08-07T12:00:00.000Z',
    )

    expect(items.map(({ appointment }) => appointment.id)).toEqual(['sooner', 'later'])
    expect(items[0]?.summary.totalOutstanding).toBe(100_000)
  })
})
