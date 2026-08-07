import 'fake-indexeddb/auto'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { db } from '../db/database'
import { formatFullDate } from '../lib/dates'
import {
  applyServiceDefaults,
  createDefaultAppointmentDraft,
  prepareAppointmentForSave,
} from '../pages/appointmentForm'
import { eurosToCents } from '../pages/settingsForm'
import type { BusinessProfile } from '../types'
import { DexieStorageAdapter } from './DexieStorageAdapter'
import { decryptStorageDump, encryptStorageDump } from '../backup/crypto'

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
      email: 'studio@example.invalid',
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
      requiresPatchTest: true,
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
      requiresPatchTest: true,
      contractTemplateId: 'standard-bridal',
      active: true,
    })
  })

  it('round-trips an appointment schedule and keeps it independent from service edits', async () => {
    const service = await adapter.services.create({
      name: 'Bridal make-up',
      description: 'Wedding-day make-up at the client venue.',
      durationMinutes: 120,
      basePrice: 45_000,
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
          messageTemplate: 'Original reminder for {dateLong}.',
        },
        {
          daysBefore: 3,
          channel: 'email',
          messageTemplate: 'Original balance reminder: {balanceDue}.',
        },
      ],
      requiresTrial: true,
      requiresPatchTest: true,
      contractTemplateId: 'standard-bridal',
      active: true,
    })
    const draft = {
      ...applyServiceDefaults(
        createDefaultAppointmentDraft(new Date('2026-08-01T08:00:00.000Z')),
        service,
        undefined,
      ),
      clientId: 'client-snapshot',
      startLocal: '2026-09-14T10:00',
      endLocal: '2026-09-14T12:00',
      locationName: 'Sample venue',
      locationAddress: 'Via di Esempio 1, Rome',
      balanceDueDate: '2026-09-14',
    }
    let recallNumber = 0
    const prepared = prepareAppointmentForSave(
      draft,
      service,
      undefined,
      () => `appointment-recall-${++recallNumber}`,
    ).appointment
    expect(prepared).toBeDefined()

    const appointment = await adapter.appointments.create(prepared!)
    const originalCutoffs = structuredClone(appointment.cancellationCutoffs)
    const originalRecalls = structuredClone(appointment.recalls)

    await adapter.services.put({
      ...service,
      cancellationTiers: [
        { daysBefore: 60, retainPercent: 25 },
        { daysBefore: 0, retainPercent: 80 },
      ],
      recallTemplates: [
        { daysBefore: 1, channel: 'email', messageTemplate: 'Changed catalogue text.' },
      ],
    })

    db.close()
    await db.open()
    const stored = await new DexieStorageAdapter().appointments.get(appointment.id)

    expect(stored?.cancellationCutoffs).toEqual(originalCutoffs)
    expect(stored?.recalls).toEqual(originalRecalls)
    expect(stored?.cancellationCutoffs.map(({ date }) => formatFullDate(date))).toEqual([
      '15 June 2026',
      '15 August 2026',
      '14 September 2026',
    ])
    expect(stored?.recalls).toMatchObject([
      {
        id: 'appointment-recall-1',
        daysBefore: 14,
        channel: 'whatsapp',
        messageTemplate: 'Original reminder for {dateLong}.',
      },
      {
        id: 'appointment-recall-2',
        daysBefore: 3,
        channel: 'email',
        messageTemplate: 'Original balance reminder: {balanceDue}.',
      },
    ])
  })

  it('adds and removes appointment payments through the storage adapter', async () => {
    const appointment = await adapter.appointments.create({
      clientId: 'client-payment-test',
      serviceId: 'service-payment-test',
      status: 'confirmed',
      startAt: '2030-09-14T08:00:00.000Z',
      endAt: '2030-09-14T10:00:00.000Z',
      locationName: 'Sample venue',
      locationAddress: 'Example address, Rome',
      peopleCount: 1,
      lineItems: [{ label: 'Bridal make-up', quantity: 1, unitPrice: 50_000 }],
      subtotal: 50_000,
      total: 50_000,
      depositPercent: 30,
      depositAmount: 15_000,
      payments: [],
      cancellationCutoffs: [],
      balanceDueAt: '2030-09-13T22:00:00.000Z',
      recalls: [],
      internalNotes: '',
    })

    await adapter.appointmentPayments.add(appointment.id, {
      type: 'deposit',
      amount: 15_000,
      method: 'wise',
      paidAt: '2030-05-01T10:00:00.000Z',
    })
    await adapter.appointmentPayments.add(appointment.id, {
      type: 'balance',
      amount: 10_000,
      method: 'bank_transfer',
      paidAt: '2030-08-01T10:00:00.000Z',
    })

    expect((await adapter.appointments.get(appointment.id))?.payments).toEqual([
      {
        type: 'deposit',
        amount: 15_000,
        method: 'wise',
        paidAt: '2030-05-01T10:00:00.000Z',
      },
      {
        type: 'balance',
        amount: 10_000,
        method: 'bank_transfer',
        paidAt: '2030-08-01T10:00:00.000Z',
      },
    ])

    await adapter.appointmentPayments.remove(appointment.id, 0)

    expect((await adapter.appointments.get(appointment.id))?.payments).toEqual([
      {
        type: 'balance',
        amount: 10_000,
        method: 'bank_transfer',
        paidAt: '2030-08-01T10:00:00.000Z',
      },
    ])
  })

  it('exports, wipes, and restores every record including snapshots and recalls', async () => {
    const profile = await adapter.profile.save({
      businessName: 'Backup Test Studio',
      registeredAddress: 'Example registered address, Rome, Italy',
      email: 'backup@example.invalid',
      vatNumber: '12345678901',
      taxCode: 'RSSMRA80A01H501U',
      regime: 'forfettario',
      atecoCode: '96.02.02',
      invoicePrefix: 'INV-',
      nextInvoiceNumber: 2,
      contractPrefix: 'CTR-',
      nextContractNumber: 2,
      iban: 'IT60X0542811101000000123456',
      bicSwift: 'BPPIITRRXXX',
      accountHolder: 'Backup Test Studio',
      defaultDepositPercent: 30,
      courtOfJurisdiction: 'Rome, Italy',
      annualRevenueTarget: 8_500_000,
      stampDutyDeadlines: [],
      updatedAt: '2030-01-01T00:00:00.000Z',
    })
    const client = await adapter.clients.create({
      firstName: 'Backup',
      lastName: 'Fixture',
      nationality: 'Test',
      timezone: 'Europe/Rome',
      phoneE164: '+390000000000',
      email: 'client@example.invalid',
      addressLine: 'Example client address',
      city: 'Rome',
      country: 'Italy',
      allergies: 'Test allergy',
      patchTestDone: true,
      patchTestDate: '2030-05-01T10:00:00.000Z',
      productPreferences: { halal: true, vegan: false, crueltyFree: true, other: '' },
      imageReleaseLevel: 'face_obscured',
      gdprConsentAt: '2030-01-01T10:00:00.000Z',
      notes: 'Synthetic test record.',
    })
    const service = await adapter.services.create({
      name: 'Backup bridal service',
      description: 'Synthetic service for restore coverage.',
      durationMinutes: 180,
      basePrice: 50_000,
      defaultDepositPercent: 30,
      cancellationTiers: [{ daysBefore: 0, retainPercent: 100 }],
      recallTemplates: [{ daysBefore: 7, channel: 'whatsapp', messageTemplate: 'Test reminder' }],
      requiresTrial: true,
      requiresPatchTest: true,
      contractTemplateId: 'standard-bridal',
      active: true,
    })
    const appointment = await adapter.appointments.create({
      clientId: client.id,
      serviceId: service.id,
      status: 'confirmed',
      startAt: '2030-09-14T10:00:00.000Z',
      endAt: '2030-09-14T13:00:00.000Z',
      ceremonyTime: '2030-09-14T13:00:00.000Z',
      locationName: 'Example venue',
      locationAddress: 'Example venue address, Rome',
      peopleCount: 4,
      lineItems: [{ label: 'Bridal service', quantity: 1, unitPrice: 50_000 }],
      subtotal: 50_000,
      total: 50_000,
      depositPercent: 30,
      depositAmount: 15_000,
      payments: [{ type: 'deposit', amount: 15_000, method: 'wise', paidAt: '2030-01-10T10:00:00.000Z' }],
      cancellationCutoffs: [{ date: '2030-08-14T10:00:00.000Z', retainPercent: 50 }],
      balanceDueAt: '2030-09-13T22:00:00.000Z',
      recalls: [{
        id: 'nested-recall',
        daysBefore: 7,
        channel: 'whatsapp',
        messageTemplate: 'Nested recall survives.',
        dueAt: '2030-09-07T10:00:00.000Z',
        sentAt: '2030-09-07T11:00:00.000Z',
      }],
      internalNotes: 'Nested appointment data.',
    })
    const contract = await adapter.contracts.create({
      contractNumber: 'CTR-1',
      appointmentId: appointment.id,
      clientSnapshot: structuredClone(client),
      businessSnapshot: structuredClone(profile),
      serviceSnapshot: structuredClone(service),
      financialSnapshot: {
        startAt: appointment.startAt,
        locationName: appointment.locationName,
        locationAddress: appointment.locationAddress,
        peopleCount: appointment.peopleCount,
        lineItems: structuredClone(appointment.lineItems),
        subtotal: appointment.subtotal,
        total: appointment.total,
        depositPercent: appointment.depositPercent,
        depositAmount: appointment.depositAmount,
        balanceDueAt: appointment.balanceDueAt!,
        cancellationCutoffs: structuredClone(appointment.cancellationCutoffs),
      },
      language: 'en',
      templateVersion: 'test-v1',
      generatedAt: '2030-01-02T10:00:00.000Z',
    })
    const invoice = await adapter.invoices.create({
      invoiceNumber: 'INV-1',
      appointmentId: appointment.id,
      clientId: client.id,
      clientSnapshot: structuredClone(client),
      businessSnapshot: structuredClone(profile),
      issuedAt: '2030-09-14T14:00:00.000Z',
      serviceDate: appointment.startAt,
      recipientCode: 'XXXXXXX',
      clientTaxCode: '',
      lineItems: [{ label: 'Bridal service', quantity: 1, unitPrice: 50_000, amount: 50_000 }],
      subtotal: 50_000,
      stampDuty: 200,
      total: 50_200,
      flatRateWording: 'Synthetic test wording.',
    })
    await adapter.meta.set('restore-test-meta', { nested: ['kept'] })

    const original = await adapter.exportAll()
    const encrypted = await encryptStorageDump(original, 'restore test passphrase')

    await db.delete()
    await db.open()
    expect(await adapter.clients.list({ includeDeleted: true })).toEqual([])

    const decrypted = await decryptStorageDump(encrypted, 'restore test passphrase')
    await adapter.importAll(decrypted, 'replace')
    const restored = await adapter.exportAll()

    expect(restored.profile).toEqual(original.profile)
    expect(restored.clients).toEqual(original.clients)
    expect(restored.services).toEqual(original.services)
    expect(restored.appointments).toEqual(original.appointments)
    expect(restored.contracts).toEqual(original.contracts)
    expect(restored.invoices).toEqual(original.invoices)
    expect(restored.meta).toEqual(original.meta)
    expect(restored.appointments[0]?.recalls[0]).toMatchObject({
      id: 'nested-recall',
      messageTemplate: 'Nested recall survives.',
      sentAt: '2030-09-07T11:00:00.000Z',
    })
    expect(restored.contracts[0]?.clientSnapshot).toEqual(contract.clientSnapshot)
    expect(restored.invoices[0]?.businessSnapshot).toEqual(invoice.businessSnapshot)
  })
})
