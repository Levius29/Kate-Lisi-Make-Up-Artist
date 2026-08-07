import 'fake-indexeddb/auto'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { db } from '../db/database'
import { eurosToCents } from '../pages/settingsForm'
import type { BusinessProfile } from '../types'
import { DexieStorageAdapter } from './DexieStorageAdapter'

describe('DexieStorageAdapter', () => {
  const adapter = new DexieStorageAdapter()

  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterAll(async () => {
    await db.delete()
  })

  it('round-trips a client through create, edit, soft-delete, and restore', async () => {
    const client = await adapter.clients.create({
      firstName: 'Sample',
      lastName: 'Client',
      nationality: 'Test',
      timezone: 'Europe/Rome',
      phoneE164: '+390000000000',
      email: 'sample@example.invalid',
      addressLine: 'Example address',
      city: 'Rome',
      country: 'Italy',
      allergies: 'Latex and lanolin',
      patchTestDone: false,
      productPreferences: {
        halal: false,
        vegan: false,
        crueltyFree: false,
        other: '',
      },
      imageReleaseLevel: 'face_obscured',
      gdprConsentAt: '2030-01-01T00:00:00.000Z',
      notes: '',
    })

    expect((await adapter.clients.list()).map(({ id }) => id)).toEqual([client.id])

    await adapter.clients.put({
      ...client,
      city: 'Florence',
      notes: 'Updated after consultation.',
    })

    const edited = await adapter.clients.get(client.id)
    expect(edited).toMatchObject({
      city: 'Florence',
      notes: 'Updated after consultation.',
      allergies: 'Latex and lanolin',
      imageReleaseLevel: 'face_obscured',
    })

    await adapter.clients.softDelete(client.id)
    expect(await adapter.clients.list()).toEqual([])
    expect(await adapter.clients.list({ includeDeleted: true })).toHaveLength(1)

    await adapter.clients.restore(client.id)
    const restored = await adapter.clients.get(client.id)
    expect(restored).toMatchObject({
      allergies: 'Latex and lanolin',
      imageReleaseLevel: 'face_obscured',
    })
    expect(restored?.deletedAt).toBeUndefined()

    const dump = await adapter.exportAll()
    expect(dump.formatVersion).toBe(1)
    expect(dump.clients).toHaveLength(1)
  })

  it('saves and reloads the profile cents and stamp-duty deadlines', async () => {
    const profile: BusinessProfile = {
      businessName: 'Example Studio',
      registeredAddress: 'Via di Esempio 1, Rome, Italy',
      vatNumber: '12345678901',
      taxCode: 'RSSMRA80A01H501U',
      regime: 'forfettario',
      atecoCode: '96.02.02',
      invoicePrefix: 'INV-',
      nextInvoiceNumber: 1,
      contractPrefix: 'CTR-',
      nextContractNumber: 1,
      iban: 'IT60X0542811101000000123456',
      bicSwift: 'BPPIITRRXXX',
      accountHolder: 'Example Studio',
      defaultDepositPercent: 30,
      courtOfJurisdiction: 'Rome, Italy',
      annualRevenueTarget: eurosToCents('85000'),
      stampDutyDeadlines: [
        { id: 'stamp-q1-2030', label: 'Q1 2030', dueOn: '2030-05-31' },
        { id: 'stamp-q2-2030', label: 'Q2 2030', dueOn: '2030-09-30' },
      ],
      updatedAt: '2030-01-01T00:00:00.000Z',
    }

    await adapter.profile.save(profile)
    db.close()
    await db.open()
    const reloaded = await new DexieStorageAdapter().profile.get()

    expect(reloaded?.annualRevenueTarget).toBe(8_500_000)
    expect(Number.isInteger(reloaded?.annualRevenueTarget)).toBe(true)
    expect(reloaded?.stampDutyDeadlines).toEqual([
      { id: 'stamp-q1-2030', label: 'Q1 2030', dueOn: '2030-05-31' },
      { id: 'stamp-q2-2030', label: 'Q2 2030', dueOn: '2030-09-30' },
    ])
  })

  it('round-trips every nested field of a service through IndexedDB', async () => {
    const service = await adapter.services.create({
      name: 'Bridal make-up',
      description: 'Wedding-day make-up at the client venue.',
      durationMinutes: 120,
      basePrice: 45_000,
      perPersonPrice: 9_000,
      travelFeePerKm: 125,
      travelFeeFlat: 3_500,
      defaultDepositPercent: 30,
      cancellationTiers: [
        { daysBefore: 91, retainPercent: 0 },
        { daysBefore: 30, retainPercent: 50 },
        { daysBefore: 0, retainPercent: 100 },
      ],
      recallTemplates: [
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
      ],
      requiresTrial: true,
      contractTemplateId: 'standard-bridal',
      active: true,
    })

    db.close()
    await db.open()
    const reloaded = await new DexieStorageAdapter().services.get(service.id)

    expect(reloaded).toEqual(service)
    expect(reloaded?.cancellationTiers).toHaveLength(3)
    expect(reloaded?.recallTemplates).toHaveLength(2)
    expect(reloaded).toMatchObject({
      name: 'Bridal make-up',
      description: 'Wedding-day make-up at the client venue.',
      durationMinutes: 120,
      basePrice: 45_000,
      perPersonPrice: 9_000,
      travelFeePerKm: 125,
      travelFeeFlat: 3_500,
      defaultDepositPercent: 30,
      requiresTrial: true,
      contractTemplateId: 'standard-bridal',
      active: true,
    })
  })
})
