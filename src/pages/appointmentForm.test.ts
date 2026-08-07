import { describe, expect, it } from 'vitest'

import type { BusinessProfile, Service } from '../types'
import {
  applyServiceDefaults,
  createDefaultAppointmentDraft,
  prepareAppointmentForSave,
} from './appointmentForm'

const service: Service = {
  id: 'bridal',
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
  name: 'Bridal make-up',
  description: 'Wedding-day service',
  durationMinutes: 120,
  basePrice: 333,
  defaultDepositPercent: 30,
  cancellationTiers: [
    { daysBefore: 91, retainPercent: 0 },
    { daysBefore: 30, retainPercent: 50 },
    { daysBefore: 0, retainPercent: 100 },
  ],
  recallTemplates: [
    { daysBefore: 14, channel: 'whatsapp', messageTemplate: 'Original text' },
  ],
  requiresTrial: true,
  contractTemplateId: 'standard-bridal',
  active: true,
}

const profile = { defaultDepositPercent: 25 } as BusinessProfile

describe('appointment form preparation', () => {
  it('defaults from the service and computes integer-cent totals and deposit', () => {
    const initial = createDefaultAppointmentDraft(new Date('2026-08-01T08:00:00.000Z'))
    const draft = {
      ...applyServiceDefaults(initial, service, profile),
      clientId: 'client-one',
      startLocal: '2026-09-14T10:00',
      endLocal: '2026-09-14T12:00',
      locationName: 'Sample venue',
      locationAddress: 'Via di Esempio 1, Rome',
      balanceDueDate: '2026-09-14',
    }

    const result = prepareAppointmentForSave(draft, service, undefined, () => 'recall-one')

    expect(result.errors).toEqual({})
    expect(result.appointment).toMatchObject({
      subtotal: 333,
      total: 333,
      depositPercent: 30,
      depositAmount: 100,
      payments: [],
    })
    expect(result.appointment).not.toHaveProperty('contractId')
    expect(Number.isInteger(result.appointment?.depositAmount)).toBe(true)
    expect(result.appointment?.balanceDueAt).toBe('2026-09-13T22:00:00.000Z')
  })

  it('falls back to the business profile when a legacy service has no valid default', () => {
    expect(
      applyServiceDefaults(
        createDefaultAppointmentDraft(new Date('2026-08-01T08:00:00.000Z')),
        { ...service, defaultDepositPercent: Number.NaN },
        profile,
      ).depositPercent,
    ).toBe('25')
  })
})
