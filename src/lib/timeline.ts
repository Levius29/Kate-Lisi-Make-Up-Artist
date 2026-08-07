import { romeDateKey } from './appointmentSchedule'

export interface BridalTimelineInput {
  ceremonyAt: string
  people: number
  minutesPerPerson: number
  bufferMinutes: number
  travelMinutes: number
}

export interface BridalTimelineSlot {
  label: string
  startsAt: string
  endsAt: string
  isBride: boolean
}

export interface BridalTimeline {
  ceremonyAt: string
  arrivalAt: string
  startAt: string
  bufferMinutes: number
  travelMinutes: number
  slots: BridalTimelineSlot[]
}

export type TimelineErrorCode =
  | 'invalid_ceremony'
  | 'people'
  | 'minutes_per_person'
  | 'buffer'
  | 'travel'
  | 'previous_day'

export class TimelineCalculationError extends Error {
  constructor(
    readonly code: TimelineErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'TimelineCalculationError'
  }
}

function requireWholeNumber(
  value: number,
  minimum: number,
  maximum: number,
  code: TimelineErrorCode,
  message: string,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TimelineCalculationError(code, message)
  }
}

function subtractMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() - minutes * 60_000).toISOString()
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

export function calculateBridalTimeline(input: BridalTimelineInput): BridalTimeline {
  const ceremony = new Date(input.ceremonyAt)
  if (!Number.isFinite(ceremony.getTime())) {
    throw new TimelineCalculationError('invalid_ceremony', 'Choose a valid ceremony date and time.')
  }
  requireWholeNumber(input.people, 1, 30, 'people', 'Enter between 1 and 30 people.')
  requireWholeNumber(
    input.minutesPerPerson,
    10,
    240,
    'minutes_per_person',
    'Minutes per person must be between 10 and 240.',
  )
  requireWholeNumber(input.bufferMinutes, 0, 240, 'buffer', 'Buffer must be between 0 and 240 minutes.')
  requireWholeNumber(input.travelMinutes, 0, 480, 'travel', 'Travel time must be between 0 and 480 minutes.')

  const workMinutes = input.people * input.minutesPerPerson
  const startAt = subtractMinutes(input.ceremonyAt, workMinutes + input.bufferMinutes)
  const arrivalAt = subtractMinutes(startAt, input.travelMinutes)

  if (romeDateKey(arrivalAt) !== romeDateKey(input.ceremonyAt)) {
    throw new TimelineCalculationError(
      'previous_day',
      'This plan would require arrival on the previous day. Choose a later ceremony time or reduce the durations.',
    )
  }

  const slots = Array.from({ length: input.people }, (_, index): BridalTimelineSlot => {
    const startsAt = addMinutes(startAt, index * input.minutesPerPerson)
    const endsAt = addMinutes(startsAt, input.minutesPerPerson)
    const isBride = index === input.people - 1
    return {
      // The bride is deliberately last so her make-up finishes closest to the
      // ceremony; everyone else is kept in an explicit, stable running order.
      label: isBride ? 'Bride' : `Person ${index + 1}`,
      startsAt,
      endsAt,
      isBride,
    }
  })

  return {
    ceremonyAt: input.ceremonyAt,
    arrivalAt,
    startAt,
    bufferMinutes: input.bufferMinutes,
    travelMinutes: input.travelMinutes,
    slots,
  }
}

