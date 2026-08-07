import { describe, expect, it } from 'vitest'

import type { AppointmentRecall } from '../types'
import {
  buildRecallLink,
  calculateBalanceDue,
  splitRecallsByDueDate,
  updateRecallSentAt,
} from './recalls'

const appointment = {
  startAt: '2026-09-14T08:30:00.000Z',
  locationName: 'Villa Aurelia',
  locationAddress: 'Largo di Porta San Pancrazio 1, Rome',
  total: 70_000,
  payments: [
    {
      type: 'deposit' as const,
      amount: 20_000,
      method: 'bank_transfer' as const,
      paidAt: '2026-05-01T10:00:00.000Z',
    },
    {
      type: 'balance' as const,
      amount: 5_000,
      method: 'wise' as const,
      paidAt: '2026-07-01T10:00:00.000Z',
    },
  ],
  cancellationCutoffs: [
    { date: '2026-06-15T22:00:00.000Z', retainPercent: 0 },
    { date: '2026-08-14T22:00:00.000Z', retainPercent: 50 },
    { date: '2026-09-13T22:00:00.000Z', retainPercent: 100 },
  ],
}

const client = {
  firstName: 'Sample',
  phoneE164: '+393331234567',
  email: 'sample@example.invalid',
}

const allFieldsTemplate =
  'Hi {firstName} — {serviceName} on {dateLong} at {startTime}, {location}. Balance {balanceDue}; cutoff {cancellationDate}.'

describe('recall dashboard helpers', () => {
  it('builds a digits-only wa.me URL with encoded text and every merge field substituted', () => {
    const url = buildRecallLink({
      appointment,
      client,
      serviceName: 'Bridal make-up',
      recall: {
        channel: 'whatsapp',
        messageTemplate: allFieldsTemplate,
      },
      nowIso: '2026-08-01T10:00:00.000Z',
    })

    expect(url).toMatch(/^https:\/\/wa\.me\/393331234567\?text=/)
    expect(url).not.toContain('+39')
    expect(url).not.toContain(' ')
    expect(url).toContain('%20')
    expect(new URL(url!).searchParams.get('text')).toBe(
      'Hi Sample — Bridal make-up on 14 September 2026 at 10:30 (CEST, Rome), Villa Aurelia, Largo di Porta San Pancrazio 1, Rome. Balance EUR 450.00; cutoff 15 August 2026.',
    )
    expect(url).not.toMatch(/%7B|%7D|\{|\}/)
  })

  it('uses the same merged body in an email recall', () => {
    const url = buildRecallLink({
      appointment,
      client,
      serviceName: 'Bridal make-up',
      recall: {
        channel: 'email',
        messageTemplate: 'Hello {firstName}, balance: {balanceDue}.',
      },
      nowIso: '2026-08-01T10:00:00.000Z',
    })

    expect(url).toBe(
      'mailto:sample@example.invalid?body=Hello%20Sample%2C%20balance%3A%20EUR%20450.00.',
    )
  })

  it('does not build a link when the selected channel has no recipient', () => {
    expect(
      buildRecallLink({
        appointment,
        client: { ...client, email: '' },
        serviceName: 'Bridal make-up',
        recall: { channel: 'email', messageTemplate: 'Hello {firstName}.' },
        nowIso: '2026-08-01T10:00:00.000Z',
      }),
    ).toBeUndefined()
    expect(
      buildRecallLink({
        appointment,
        client: { ...client, phoneE164: '' },
        serviceName: 'Bridal make-up',
        recall: { channel: 'whatsapp', messageTemplate: 'Hello {firstName}.' },
        nowIso: '2026-08-01T10:00:00.000Z',
      }),
    ).toBeUndefined()
  })

  it('keeps a cancellation cutoff available throughout its Rome calendar day', () => {
    const url = buildRecallLink({
      appointment,
      client,
      serviceName: 'Bridal make-up',
      recall: {
        channel: 'whatsapp',
        messageTemplate: 'Next cutoff: {cancellationDate}.',
      },
      nowIso: '2026-08-14T23:00:00.000Z',
    })

    expect(new URL(url!).searchParams.get('text')).toBe(
      'Next cutoff: 15 August 2026.',
    )
  })

  it('splits unsent recalls into overdue, due today and upcoming Rome dates', () => {
    const recall = (
      id: string,
      dueAt: string,
      sentAt?: string,
    ): AppointmentRecall => ({
      id,
      daysBefore: 1,
      channel: 'whatsapp',
      messageTemplate: 'Reminder',
      dueAt,
      ...(sentAt ? { sentAt } : {}),
    })
    const items = [
      { recall: recall('upcoming-later', '2026-08-09T08:00:00.000Z') },
      { recall: recall('overdue', '2026-08-05T08:00:00.000Z') },
      { recall: recall('today', '2026-08-07T19:00:00.000Z') },
      { recall: recall('upcoming-sooner', '2026-08-08T08:00:00.000Z') },
      {
        recall: recall(
          'already-sent',
          '2026-08-06T08:00:00.000Z',
          '2026-08-06T09:00:00.000Z',
        ),
      },
    ]

    const groups = splitRecallsByDueDate(items, '2026-08-07T12:00:00.000Z')

    expect(groups.overdue.map(({ recall: item }) => item.id)).toEqual(['overdue'])
    expect(groups.dueToday.map(({ recall: item }) => item.id)).toEqual(['today'])
    expect(groups.upcoming.map(({ recall: item }) => item.id)).toEqual([
      'upcoming-sooner',
      'upcoming-later',
    ])
  })

  it('calculates balance due by subtracting every recorded payment', () => {
    expect(calculateBalanceDue(appointment)).toBe(45_000)
  })

  it('marks only the selected recall as sent and removes sentAt again on undo', () => {
    const first: AppointmentRecall = {
      id: 'first',
      daysBefore: 14,
      channel: 'whatsapp',
      messageTemplate: 'First',
      dueAt: '2026-08-01T08:00:00.000Z',
    }
    const second: AppointmentRecall = {
      id: 'second',
      daysBefore: 7,
      channel: 'email',
      messageTemplate: 'Second',
      dueAt: '2026-08-08T08:00:00.000Z',
    }

    const marked = updateRecallSentAt(
      { recalls: [first, second] },
      'first',
      '2026-08-01T09:00:00.000Z',
    )
    expect(marked.recalls).toEqual([
      { ...first, sentAt: '2026-08-01T09:00:00.000Z' },
      second,
    ])

    const undone = updateRecallSentAt(marked, 'first', undefined)
    expect(undone.recalls).toEqual([first, second])
  })

  it('rejects a sent update when the recall no longer exists', () => {
    expect(() =>
      updateRecallSentAt(
        { recalls: [] },
        'missing',
        '2026-08-01T09:00:00.000Z',
      ),
    ).toThrow('Recall not found')
  })
})
