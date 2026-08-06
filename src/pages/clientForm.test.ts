import { describe, expect, it } from 'vitest'

import type { Client } from '../types'
import {
  createDefaultClientDraft,
  filterClients,
  mergeClientForUpdate,
  normalisePhoneE164,
  prepareClientForSave,
} from './clientForm'

function client(overrides: Partial<Client>): Client {
  return {
    id: 'client-one',
    firstName: 'José',
    lastName: 'García',
    nationality: 'Spanish',
    timezone: 'Europe/Madrid',
    phoneE164: '+34600111222',
    email: 'jose@example.invalid',
    addressLine: '',
    city: '',
    country: '',
    allergies: 'Latex',
    patchTestDone: false,
    productPreferences: {
      halal: false,
      vegan: false,
      crueltyFree: false,
      other: '',
    },
    imageReleaseLevel: 'none',
    gdprConsentAt: '2030-01-02T10:00:00.000Z',
    notes: '',
    createdAt: '2030-01-02T10:00:00.000Z',
    updatedAt: '2030-01-02T10:00:00.000Z',
    ...overrides,
  }
}

describe('client search', () => {
  const clients = [
    client({}),
    client({
      id: 'client-two',
      firstName: 'Amina',
      lastName: 'Al-Sayed',
      phoneE164: '+971501234567',
      email: 'AMINA@EXAMPLE.INVALID',
    }),
  ]

  it('matches either name part without case or accents', () => {
    expect(filterClients(clients, 'JOSE').map(({ id }) => id)).toEqual(['client-one'])
    expect(filterClients(clients, 'garcia').map(({ id }) => id)).toEqual(['client-one'])
    expect(filterClients(clients, 'amina').map(({ id }) => id)).toEqual(['client-two'])
  })

  it('also matches phone and email', () => {
    expect(filterClients(clients, '501234').map(({ id }) => id)).toEqual(['client-two'])
    expect(filterClients(clients, 'amina@example').map(({ id }) => id)).toEqual([
      'client-two',
    ])
  })
})

describe('client phone handling', () => {
  it('strips only typing separators and keeps a valid full international number', () => {
    expect(normalisePhoneE164('+39 (333) 123-4567')).toBe('+393331234567')
  })

  it('accepts the 00 international prefix that European clients write', () => {
    expect(normalisePhoneE164('0039 333 123 4567')).toBe('+393331234567')
    expect(normalisePhoneE164('00 44 7700 900123')).toBe('+447700900123')
    expect(normalisePhoneE164('+39.333.123.4567')).toBe('+393331234567')
  })

  it('still rejects a national number that has no international prefix', () => {
    // 0333... is Italian national format; treating it as international would
    // produce a wa.me link that silently goes nowhere.
    expect(normalisePhoneE164('0333 123 4567')).toBe('03331234567')
  })

  it('rejects a national number and malformed or out-of-range international numbers', () => {
    const validDraft = {
      ...createDefaultClientDraft(),
      firstName: 'Sample',
      lastName: 'Client',
      email: 'sample@example.invalid',
      imageReleaseLevel: 'none' as const,
      gdprConsentAt: '2030-01-02T10:00:00.000Z',
    }

    for (const phoneE164 of ['333 123 4567', '+39 333 letters', '+1234567', `+${'1'.repeat(16)}`]) {
      const result = prepareClientForSave({ ...validDraft, phoneE164 })
      expect(result.errors.phoneE164).toBe(
        'Use full international format: + followed by 8 to 15 digits.',
      )
      expect(result.client).toBeUndefined()
    }
  })
})

describe('client form preparation', () => {
  it('requires a deliberate image release choice and recorded GDPR consent', () => {
    const result = prepareClientForSave({
      ...createDefaultClientDraft(),
      firstName: 'Sample',
      lastName: 'Client',
      phoneE164: '+390000000000',
      email: 'sample@example.invalid',
    })

    expect(result.errors.imageReleaseLevel).toBe('Choose one image release option.')
    expect(result.errors.gdprConsentAt).toBe('Record GDPR consent before saving.')
  })

  it('normalises the phone and preserves allergy, preference, release, and patch-test data', () => {
    const result = prepareClientForSave({
      ...createDefaultClientDraft(),
      firstName: '  Sample ',
      lastName: ' Client  ',
      timezone: 'America/New_York',
      phoneE164: '+1 (212) 555-0123',
      email: ' SAMPLE@EXAMPLE.INVALID ',
      allergies: '  Latex and lanolin  ',
      patchTestDone: true,
      patchTestDate: '2030-02-03',
      productPreferences: {
        halal: true,
        vegan: false,
        crueltyFree: true,
        other: '  Fragrance-free  ',
      },
      imageReleaseLevel: 'face_obscured',
      gdprConsentAt: '2030-01-02T10:00:00.000Z',
    })

    expect(result.errors).toEqual({})
    expect(result.client).toMatchObject({
      firstName: 'Sample',
      lastName: 'Client',
      timezone: 'America/New_York',
      phoneE164: '+12125550123',
      email: 'sample@example.invalid',
      allergies: 'Latex and lanolin',
      patchTestDone: true,
      patchTestDate: '2030-02-03T00:00:00.000Z',
      productPreferences: {
        halal: true,
        vegan: false,
        crueltyFree: true,
        other: 'Fragrance-free',
      },
      imageReleaseLevel: 'face_obscured',
      gdprConsentAt: '2030-01-02T10:00:00.000Z',
    })
  })

  it('rejects a timezone that is not understood as an IANA zone', () => {
    const result = prepareClientForSave({
      ...createDefaultClientDraft(),
      firstName: 'Sample',
      lastName: 'Client',
      phoneE164: '+390000000000',
      email: 'sample@example.invalid',
      timezone: 'Rome time',
      imageReleaseLevel: 'private_portfolio',
      gdprConsentAt: '2030-01-02T10:00:00.000Z',
    })

    expect(result.errors.timezone).toBe('Choose a valid IANA timezone.')
  })

  it('removes a previous patch-test date when the edited client is no longer marked done', () => {
    const existing = client({
      patchTestDone: true,
      patchTestDate: '2030-02-03T00:00:00.000Z',
    })
    const prepared = prepareClientForSave({
      ...createDefaultClientDraft(),
      firstName: 'José',
      lastName: 'García',
      timezone: 'Europe/Madrid',
      phoneE164: '+34600111222',
      imageReleaseLevel: 'none',
      gdprConsentAt: '2030-01-02T10:00:00.000Z',
      patchTestDone: false,
    })

    expect(prepared.client).toBeDefined()
    const updated = mergeClientForUpdate(existing, prepared.client!)
    expect(updated.patchTestDone).toBe(false)
    expect(updated.patchTestDate).toBeUndefined()
  })
})
