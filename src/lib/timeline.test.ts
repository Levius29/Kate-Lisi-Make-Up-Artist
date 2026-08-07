import { describe, expect, it } from 'vitest'

import { formatTime } from './dates'
import { calculateBridalTimeline, TimelineCalculationError } from './timeline'

describe('calculateBridalTimeline', () => {
  it('works backwards from 15:00 for four people and keeps the bride last', () => {
    const result = calculateBridalTimeline({
      ceremonyAt: '2026-09-14T13:00:00.000Z', // 15:00 in Rome (CEST)
      people: 4,
      minutesPerPerson: 45,
      bufferMinutes: 30,
      travelMinutes: 45,
    })

    expect(formatTime(result.arrivalAt)).toBe('10:45')
    expect(formatTime(result.startAt)).toBe('11:30')
    expect(result.slots.map((slot) => [slot.label, formatTime(slot.startsAt), formatTime(slot.endsAt)])).toEqual([
      ['Person 1', '11:30', '12:15'],
      ['Person 2', '12:15', '13:00'],
      ['Person 3', '13:00', '13:45'],
      ['Bride', '13:45', '14:30'],
    ])
    expect(result.slots.at(-1)).toMatchObject({ label: 'Bride', isBride: true })
  })

  it('rejects zero people', () => {
    expect(() => calculateBridalTimeline({
      ceremonyAt: '2026-09-14T13:00:00.000Z',
      people: 0,
      minutesPerPerson: 45,
      bufferMinutes: 30,
      travelMinutes: 45,
    })).toThrowError(expect.objectContaining<Partial<TimelineCalculationError>>({ code: 'people' }))
  })

  it('rejects a ceremony too early for the required work and travel', () => {
    expect(() => calculateBridalTimeline({
      ceremonyAt: '2026-09-14T05:00:00.000Z',
      people: 8,
      minutesPerPerson: 60,
      bufferMinutes: 60,
      travelMinutes: 90,
    })).toThrowError(expect.objectContaining<Partial<TimelineCalculationError>>({ code: 'previous_day' }))
  })

  it.each([
    ['minutes per person', { minutesPerPerson: 500 }, 'minutes_per_person'],
    ['buffer', { bufferMinutes: 241 }, 'buffer'],
    ['travel', { travelMinutes: 481 }, 'travel'],
    ['people', { people: 31 }, 'people'],
  ])('rejects an absurd %s input', (_label, override, code) => {
    expect(() => calculateBridalTimeline({
      ceremonyAt: '2026-09-14T13:00:00.000Z',
      people: 4,
      minutesPerPerson: 45,
      bufferMinutes: 30,
      travelMinutes: 45,
      ...override,
    })).toThrowError(expect.objectContaining({ code }))
  })
})

