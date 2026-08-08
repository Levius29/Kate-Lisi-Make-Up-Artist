import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { storage } from '../storage'
import type { Appointment, Client, Service } from '../types'
import { Money } from './Money'

const timestamp = '2026-08-08T08:00:00.000Z'

const appointment: Appointment = {
  id: 'appointment-one',
  createdAt: timestamp,
  updatedAt: timestamp,
  clientId: 'client-one',
  serviceId: 'service-one',
  status: 'confirmed',
  startAt: '2026-08-11T08:00:00.000Z',
  endAt: '2026-08-11T10:00:00.000Z',
  locationName: 'Rome venue',
  locationAddress: 'Rome, Italy',
  peopleCount: 1,
  lineItems: [{ label: 'Bridal make-up', quantity: 1, unitPrice: 30_000 }],
  subtotal: 30_000,
  total: 30_000,
  depositPercent: 30,
  depositAmount: 9_000,
  payments: [],
  cancellationCutoffs: [],
  balanceDueAt: '2026-08-10T08:00:00.000Z',
  recalls: [],
  internalNotes: '',
}

const client: Client = {
  id: 'client-one',
  createdAt: timestamp,
  updatedAt: timestamp,
  firstName: 'Anna',
  lastName: 'Sample',
  nationality: 'British',
  timezone: 'Europe/London',
  phoneE164: '+447700900001',
  email: 'anna@example.invalid',
  addressLine: '',
  city: 'London',
  country: 'United Kingdom',
  allergies: '',
  patchTestDone: false,
  productPreferences: { halal: false, vegan: false, crueltyFree: false, other: '' },
  imageReleaseLevel: 'none',
  gdprConsentAt: timestamp,
  notes: '',
}

const service: Service = {
  id: 'service-one',
  createdAt: timestamp,
  updatedAt: timestamp,
  name: 'Bridal make-up',
  description: '',
  durationMinutes: 120,
  basePrice: 30_000,
  defaultDepositPercent: 30,
  cancellationTiers: [],
  recallTemplates: [],
  requiresTrial: false,
  requiresPatchTest: false,
  contractTemplateId: 'default',
  active: true,
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('routed payment detail', () => {
  it('renders as normal-flow content without a modal backdrop or fixed sheet', () => {
    vi.spyOn(storage, 'live').mockReturnValue({
      appointments: [appointment],
      clients: [client],
      services: [service],
      profile: undefined,
      invoices: [],
    })

    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/money/appointment-one']}>
        <Money />
      </MemoryRouter>,
    )

    expect(markup).toContain('data-payment-detail-page="true"')
    expect(markup).not.toContain('Close payment detail backdrop')
    expect(markup).not.toMatch(/data-payment-detail-page="true"[^>]*class="[^"]*fixed/)
  })
})
