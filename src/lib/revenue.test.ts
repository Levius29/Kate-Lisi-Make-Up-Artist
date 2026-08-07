import { describe, expect, it } from 'vitest'

import type { Appointment, AppointmentPayment } from '../types'
import { percentOf } from './money'
import { calculateCurrentYearRevenue, revenueMeterState } from './revenue'

function revenueBooking(total: number, payments: AppointmentPayment[]) {
  return { total, payments } satisfies Pick<Appointment, 'total' | 'payments'>
}

describe('cash-basis annual revenue', () => {
  it('counts payments by paidAt in the current Rome calendar year', () => {
    const appointments = [
      revenueBooking(5_000, [
        {
          type: 'deposit',
          amount: 1_000,
          method: 'bank_transfer',
          paidAt: '2025-12-31T22:30:00.000Z',
        },
        {
          type: 'balance',
          amount: 2_000,
          method: 'wise',
          paidAt: '2025-12-31T23:30:00.000Z',
        },
      ]),
    ]

    expect(calculateCurrentYearRevenue(appointments, '2026-08-07T12:00:00.000Z')).toBe(
      2_000,
    )
  })

  it('adds recharged stamp duty above EUR 77.47 and none at or below the boundary', () => {
    const above = revenueBooking(7_748, [
      {
        type: 'balance',
        amount: 7_748,
        method: 'wise',
        paidAt: '2026-06-01T10:00:00.000Z',
      },
    ])
    const atBoundary = revenueBooking(7_747, [
      {
        type: 'balance',
        amount: 7_747,
        method: 'revolut',
        paidAt: '2026-07-01T10:00:00.000Z',
      },
    ])

    expect(calculateCurrentYearRevenue([above], '2026-08-07T12:00:00.000Z')).toBe(7_948)
    expect(calculateCurrentYearRevenue([atBoundary], '2026-08-07T12:00:00.000Z')).toBe(
      7_747,
    )
  })

  it('counts a qualifying booking stamp once, in the year its first cash is received', () => {
    const booking = revenueBooking(100_000, [
      {
        type: 'deposit',
        amount: 30_000,
        method: 'bank_transfer',
        paidAt: '2025-12-01T10:00:00.000Z',
      },
      {
        type: 'balance',
        amount: 70_000,
        method: 'bank_transfer',
        paidAt: '2026-06-01T10:00:00.000Z',
      },
    ])

    expect(calculateCurrentYearRevenue([booking], '2025-12-20T12:00:00.000Z')).toBe(30_200)
    expect(calculateCurrentYearRevenue([booking], '2026-08-07T12:00:00.000Z')).toBe(70_000)
  })
})

describe('annual revenue meter', () => {
  it('enters the planning warning band exactly at 80 percent', () => {
    const target = 8_500_000
    const boundary = percentOf(target, 80)

    expect(revenueMeterState(boundary - 1, target).band).toBe('standard')
    expect(revenueMeterState(boundary, target)).toMatchObject({
      band: 'warning',
      warningAt: 6_800_000,
      percentage: 80,
      headroom: 1_700_000,
    })
    expect(revenueMeterState(target, target).band).toBe('over')
  })
})
