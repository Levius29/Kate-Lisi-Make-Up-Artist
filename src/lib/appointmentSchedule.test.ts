import { describe, expect, it } from 'vitest'

import { DEFAULT_CANCELLATION_TIERS } from './cancellationTiers'
import { formatFullDate, formatTime } from './dates'
import {
  cutoffMilestoneLabel,
  deriveAppointmentSchedule,
  noticePeriodDays,
  rescheduleAppointmentSchedule,
} from './appointmentSchedule'

describe('appointment milestone snapshots', () => {
  const wedding = '2026-09-14T08:00:00.000Z' // 10:00 in Rome

  it('derives the exact default cancellation cutoffs and notice periods', () => {
    const schedule = deriveAppointmentSchedule(
      wedding,
      DEFAULT_CANCELLATION_TIERS,
      [],
    )

    // Every band is represented, the last one landing on the appointment's own
    // date, so nothing downstream has to assume what the final percentage is.
    expect(schedule.cancellationCutoffs.map(({ date }) => formatFullDate(date))).toEqual([
      '15 June 2026',
      '15 August 2026',
      '14 September 2026',
    ])
    expect(
      schedule.cancellationCutoffs.map(({ date }) => noticePeriodDays(wedding, date)),
    ).toEqual([91, 30, 0])
    expect(schedule.cancellationCutoffs.map(({ retainPercent }) => retainPercent)).toEqual([
      0,
      50,
      100,
    ])
  })

  it('labels cutoff markers with the band that starts the following day', () => {
    const cutoffs = deriveAppointmentSchedule(
      wedding,
      DEFAULT_CANCELLATION_TIERS,
      [],
    ).cancellationCutoffs

    expect(cutoffMilestoneLabel(cutoffs, 0)).toBe('After this date: 50% retained')
    expect(cutoffMilestoneLabel(cutoffs, 1)).toBe('After this date: 100% retained')
    // The final cutoff announces no following band, so it draws no marker.
    expect(cutoffMilestoneLabel(cutoffs, 2)).toBeUndefined()
  })

  it('takes the final percentage from the ladder instead of assuming 100', () => {
    const softerLadder = [
      { daysBefore: 91, retainPercent: 0 },
      { daysBefore: 30, retainPercent: 40 },
      { daysBefore: 0, retainPercent: 80 },
    ]
    const cutoffs = deriveAppointmentSchedule(wedding, softerLadder, []).cancellationCutoffs

    expect(cutoffs.map(({ retainPercent }) => retainPercent)).toEqual([0, 40, 80])
    expect(cutoffMilestoneLabel(cutoffs, 1)).toBe('After this date: 80% retained')
  })

  it('copies every recall template verbatim and preserves the Rome wall-clock time', () => {
    const schedule = deriveAppointmentSchedule(
      wedding,
      DEFAULT_CANCELLATION_TIERS,
      [
        {
          daysBefore: 14,
          channel: 'whatsapp',
          messageTemplate: 'Hello {firstName} — keep this text exactly.',
        },
        {
          daysBefore: 3,
          channel: 'email',
          messageTemplate: 'Balance: {balanceDue}',
        },
      ],
      (() => {
        let id = 0
        return () => `recall-${++id}`
      })(),
    )

    expect(schedule.recalls).toMatchObject([
      {
        id: 'recall-1',
        daysBefore: 14,
        channel: 'whatsapp',
        messageTemplate: 'Hello {firstName} — keep this text exactly.',
      },
      {
        id: 'recall-2',
        daysBefore: 3,
        channel: 'email',
        messageTemplate: 'Balance: {balanceDue}',
      },
    ])
    expect(schedule.recalls.map(({ dueAt }) => formatTime(dueAt))).toEqual(['10:00', '10:00'])
    expect(schedule.recalls.every(({ sentAt }) => sentAt === undefined)).toBe(true)
  })

  it('reschedules from the stored snapshot without reading a changed catalogue', () => {
    const original = deriveAppointmentSchedule(
      wedding,
      DEFAULT_CANCELLATION_TIERS,
      [{ daysBefore: 14, channel: 'whatsapp', messageTemplate: 'Snapshotted text' }],
      () => 'recall-one',
    )
    const movedWedding = '2026-10-20T08:00:00.000Z'
    const moved = rescheduleAppointmentSchedule(
      wedding,
      movedWedding,
      original.cancellationCutoffs,
      original.recalls,
    )

    expect(moved.cancellationCutoffs.map(({ date }) => noticePeriodDays(movedWedding, date))).toEqual([91, 30, 0])
    expect(moved.recalls[0]).toMatchObject({
      id: 'recall-one',
      daysBefore: 14,
      channel: 'whatsapp',
      messageTemplate: 'Snapshotted text',
    })
    expect(formatTime(moved.recalls[0]!.dueAt)).toBe('10:00')
  })
})
