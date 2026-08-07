import { describe, expect, it } from 'vitest'

import { calculateBridalTimeline } from '../lib/timeline'
import { buildTimelineDocDefinition, generateTimelinePdfBlob } from './pdf'

describe('bridal timeline PDF', () => {
  it('contains the couple, full date, prominent arrival, and every running slot', () => {
    const timeline = calculateBridalTimeline({
      ceremonyAt: '2026-09-14T13:00:00.000Z',
      people: 4,
      minutesPerPerson: 45,
      bufferMinutes: 30,
      travelMinutes: 45,
    })
    const definition = buildTimelineDocDefinition(timeline, 'Example Couple')
    const text = JSON.stringify(definition)

    expect(text).toContain('Example Couple')
    expect(text).toContain('14 September 2026')
    expect(text).toContain('10:45 (CEST, Rome)')
    expect(text).toContain('Bride')
    expect(text).not.toContain('14/09/2026')
    expect(text).not.toContain('2026-09-14')
  })

  it('renders the planner schedule to an offline PDF blob', async () => {
    const timeline = calculateBridalTimeline({
      ceremonyAt: '2026-09-14T13:00:00.000Z',
      people: 4,
      minutesPerPerson: 45,
      bufferMinutes: 30,
      travelMinutes: 45,
    })

    const blob = await generateTimelinePdfBlob(timeline, 'Example Couple')
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(1_000)
  })
})
