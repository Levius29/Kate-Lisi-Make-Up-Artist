import { describe, expect, it } from 'vitest'

import { eurosToCents } from './settingsForm'
import {
  cancellationTierBandLabels,
  createDefaultServiceDraft,
  mergeServiceForUpdate,
  prepareServiceForSave,
  serviceToDraft,
} from './serviceForm'

function completeDraft() {
  return {
    ...createDefaultServiceDraft(),
    name: 'Bridal make-up',
    description: 'Wedding-day make-up at the client venue.',
    durationMinutes: '120',
    basePriceEuros: '450.00',
    perPersonPriceEuros: '90,50',
    travelFeePerKmEuros: '1.25',
    travelFeeFlatEuros: '35',
    defaultDepositPercent: '30',
    requiresTrial: true,
    contractTemplateId: 'standard-bridal',
    recallTemplates: [
      {
        id: 'recall-one',
        daysBefore: '14',
        channel: 'whatsapp' as const,
        messageTemplate: 'Hello {firstName}, your {serviceName} is on {dateLong}.',
      },
      {
        id: 'recall-two',
        daysBefore: '3',
        channel: 'email' as const,
        messageTemplate: 'Balance due: {balanceDue}. Location: {location}.',
      },
    ],
  }
}

describe('service form preparation', () => {
  it('labels the default ladder with the agreed inclusive boundaries', () => {
    const tiers = createDefaultServiceDraft().cancellationTiers
    const labels = cancellationTierBandLabels(tiers)

    expect(tiers.map(({ id }) => labels.get(id))).toEqual([
      'More than 90 days',
      '90 to 30 days',
      'Fewer than 30 days',
    ])
  })

  it('reuses the settings euro parser for exact integer cents', () => {
    expect(eurosToCents('0.01')).toBe(1)
    expect(eurosToCents('90,50')).toBe(9_050)
    expect(() => eurosToCents('4.567')).toThrow()

    const result = prepareServiceForSave(completeDraft())

    expect(result.errors).toEqual({})
    expect(result.service).toMatchObject({
      basePrice: 45_000,
      perPersonPrice: 9_050,
      travelFeePerKm: 125,
      travelFeeFlat: 3_500,
    })
    expect(Number.isInteger(result.service?.basePrice)).toBe(true)
  })

  it('sorts cancellation tiers descending and preserves two recall templates', () => {
    const result = prepareServiceForSave({
      ...completeDraft(),
      cancellationTiers: [
        { id: 'tier-low', daysBefore: '0', retainPercent: '100' },
        { id: 'tier-high', daysBefore: '91', retainPercent: '0' },
        { id: 'tier-middle', daysBefore: '30', retainPercent: '50' },
      ],
    })

    expect(result.errors).toEqual({})
    expect(result.service?.cancellationTiers).toEqual([
      { daysBefore: 91, retainPercent: 0 },
      { daysBefore: 30, retainPercent: 50 },
      { daysBefore: 0, retainPercent: 100 },
    ])
    expect(result.service?.recallTemplates).toEqual([
      {
        daysBefore: 14,
        channel: 'whatsapp',
        messageTemplate: 'Hello {firstName}, your {serviceName} is on {dateLong}.',
      },
      {
        daysBefore: 3,
        channel: 'email',
        messageTemplate: 'Balance due: {balanceDue}. Location: {location}.',
      },
    ])
  })

  it('omits blank optional prices and can produce a draft from saved cents', () => {
    const result = prepareServiceForSave({
      ...completeDraft(),
      perPersonPriceEuros: '',
      travelFeePerKmEuros: '',
      travelFeeFlatEuros: '',
    })

    expect(result.service).not.toHaveProperty('perPersonPrice')
    expect(result.service).not.toHaveProperty('travelFeePerKm')
    expect(result.service).not.toHaveProperty('travelFeeFlat')

    const draft = serviceToDraft({
      id: 'service-one',
      createdAt: '2030-01-01T00:00:00.000Z',
      updatedAt: '2030-01-01T00:00:00.000Z',
      ...result.service!,
    })
    expect(draft.basePriceEuros).toBe('450.00')
    expect(draft.perPersonPriceEuros).toBe('')
  })

  it('clears old optional prices when blank fields are saved during editing', () => {
    const existing = {
      id: 'service-one',
      createdAt: '2030-01-01T00:00:00.000Z',
      updatedAt: '2030-01-01T00:00:00.000Z',
      ...prepareServiceForSave(completeDraft()).service!,
    }
    const prepared = prepareServiceForSave({
      ...serviceToDraft(existing),
      perPersonPriceEuros: '',
      travelFeePerKmEuros: '',
      travelFeeFlatEuros: '',
    }).service!

    const updated = mergeServiceForUpdate(existing, prepared)

    expect(updated).not.toHaveProperty('perPersonPrice')
    expect(updated).not.toHaveProperty('travelFeePerKm')
    expect(updated).not.toHaveProperty('travelFeeFlat')
  })

  it('rejects duplicate tiers, invalid percentages, and incomplete recalls', () => {
    const result = prepareServiceForSave({
      ...completeDraft(),
      cancellationTiers: [
        { id: 'tier-one', daysBefore: '30', retainPercent: '50' },
        { id: 'tier-two', daysBefore: '30', retainPercent: '120' },
      ],
      recallTemplates: [
        {
          id: 'recall-empty',
          daysBefore: '-1',
          channel: 'whatsapp',
          messageTemplate: '',
        },
      ],
    })

    expect(result.service).toBeUndefined()
    expect(Object.keys(result.errors)).toEqual(
      expect.arrayContaining([
        'cancellationTiers.tier-one.daysBefore',
        'cancellationTiers.tier-two.daysBefore',
        'cancellationTiers.tier-two.retainPercent',
        'recallTemplates.recall-empty.daysBefore',
        'recallTemplates.recall-empty.messageTemplate',
      ]),
    )
  })

  it('requires a zero-day tier so every notice period has a first match', () => {
    const result = prepareServiceForSave({
      ...completeDraft(),
      cancellationTiers: [
        { id: 'tier-high', daysBefore: '91', retainPercent: '0' },
        { id: 'tier-middle', daysBefore: '30', retainPercent: '50' },
      ],
    })

    expect(result.service).toBeUndefined()
    expect(result.errors.cancellationTiers).toBe(
      'Include a 0-day tier so every notice period has a rule.',
    )
  })
})
