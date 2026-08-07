import 'fake-indexeddb/auto'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { db } from '../db/database'
import { invoicesToCsv, invoicesToJson } from './export'
import {
  buildInvoice,
  FLAT_RATE_WORDING,
  FOREIGN_RECIPIENT_CODE,
  issueInvoice,
} from './issue'
import { quarterlyStampDutyTotals } from './stampDuty'
import { DexieStorageAdapter } from '../storage/DexieStorageAdapter'
import type { Appointment, BusinessProfile, Client, Invoice } from '../types'

const when = '2026-08-07T10:00:00.000Z'

function profile(): BusinessProfile {
  return {
    businessName: 'Sample Studio',
    registeredAddress: 'Via di Esempio 1, Rome, Italy',
    email: 'studio@example.invalid',
    vatNumber: '12345678901',
    taxCode: 'RSSMRA80A01H501U',
    regime: 'forfettario',
    atecoCode: '96.02.02',
    invoicePrefix: 'INV-',
    nextInvoiceNumber: 17,
    contractPrefix: 'CTR-',
    nextContractNumber: 1,
    iban: 'IT60X0542811101000000123456',
    bicSwift: 'BPPIITRRXXX',
    accountHolder: 'Sample Studio',
    defaultDepositPercent: 30,
    courtOfJurisdiction: 'Rome, Italy',
    annualRevenueTarget: 8_500_000,
    stampDutyDeadlines: [
      { id: 'stamp-q1-2026', label: 'Q1 2026', dueOn: '2026-05-31' },
      { id: 'stamp-q2-2026', label: 'Q2 2026', dueOn: '2026-09-30' },
    ],
    updatedAt: when,
  }
}

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client-1',
    createdAt: when,
    updatedAt: when,
    firstName: 'Avery',
    lastName: 'Stone',
    nationality: 'British',
    timezone: 'Europe/London',
    phoneE164: '+447700900123',
    email: 'avery@example.invalid',
    addressLine: '12 Example Street',
    city: 'London',
    country: 'United Kingdom',
    allergies: '',
    patchTestDone: false,
    productPreferences: { halal: false, vegan: false, crueltyFree: false, other: '' },
    imageReleaseLevel: 'none',
    gdprConsentAt: when,
    notes: '',
    ...overrides,
  }
}

function appointment(total: number, id = 'appointment-1'): Appointment {
  return {
    id,
    createdAt: when,
    updatedAt: when,
    clientId: 'client-1',
    serviceId: 'service-1',
    status: 'completed',
    startAt: '2026-09-14T08:00:00.000Z',
    endAt: '2026-09-14T10:00:00.000Z',
    locationName: 'Sample venue',
    locationAddress: 'Via di Esempio 2, Rome',
    peopleCount: 1,
    lineItems: [{ label: 'Bridal make-up', quantity: 1, unitPrice: total }],
    subtotal: total,
    total,
    depositPercent: 30,
    depositAmount: Math.round(total * 0.3),
    payments: [
      { type: 'balance', amount: total, method: 'bank_transfer', paidAt: when },
    ],
    cancellationCutoffs: [],
    recalls: [],
    internalNotes: '',
  }
}

function invoice(total: number, issuedAt: string, id: string, clientValue = client()): Invoice {
  return {
    ...buildInvoice({
      invoiceNumber: `INV-${id}`,
      appointment: appointment(total, `appointment-${id}`),
      client: clientValue,
      profile: profile(),
      issuedAt,
    }),
    id,
    createdAt: issuedAt,
    updatedAt: issuedAt,
  }
}

describe('invoice issuance', () => {
  const adapter = new DexieStorageAdapter()

  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterAll(async () => {
    await db.delete()
  })

  it('takes two gapless sequential numbers inside transactions', async () => {
    await adapter.profile.save(profile())
    await adapter.clients.create(client())
    await adapter.appointments.create(appointment(45_000, 'appointment-1'))
    await adapter.appointments.create(appointment(60_000, 'appointment-2'))

    const issued = await Promise.all([
      issueInvoice(adapter, 'appointment-1', '2026-08-07T10:00:00.000Z'),
      issueInvoice(adapter, 'appointment-2', '2026-08-07T10:00:01.000Z'),
    ])

    expect(issued.map(({ invoiceNumber }) => invoiceNumber).sort()).toEqual([
      'INV-0017',
      'INV-0018',
    ])
    expect((await adapter.profile.get())?.nextInvoiceNumber).toBe(19)
    expect(await adapter.invoices.list()).toHaveLength(2)
  })

  it.each([
    [7_746, 0],
    [7_747, 0],
    [7_748, 200],
  ])('applies stamp duty correctly to a %i cent invoice', (total, expectedStamp) => {
    const built = invoice(total, when, String(total))
    expect(built.stampDuty).toBe(expectedStamp)
    expect(built.total).toBe(total + expectedStamp)
  })

  it('uses XXXXXXX and an empty tax code for a foreign client with a full address', () => {
    const built = invoice(45_000, when, 'foreign')
    expect(built.recipientCode).toBe(FOREIGN_RECIPIENT_CODE)
    expect(built.clientTaxCode).toBe('')
    const exported = JSON.parse(invoicesToJson([built])) as {
      invoices: Array<{ client: { fullAddress: string; recipientCode: string; taxCode: string } }>
    }
    expect(exported.invoices[0]?.client).toEqual(
      expect.objectContaining({
        fullAddress: '12 Example Street, London, United Kingdom',
        recipientCode: 'XXXXXXX',
        taxCode: '',
      }),
    )
  })

  it('attaches the first later payment date to an already-issued invoice', async () => {
    await adapter.profile.save(profile())
    await adapter.clients.create(client())
    const unpaid = { ...appointment(45_000), payments: [] }
    await adapter.appointments.create(unpaid)
    const issued = await issueInvoice(adapter, unpaid.id, when)
    expect(issued.paidAt).toBeUndefined()

    await adapter.appointmentPayments.add(unpaid.id, {
      type: 'deposit',
      amount: 10_000,
      method: 'wise',
      paidAt: '2026-08-10T10:00:00.000Z',
    })

    expect((await adapter.invoices.get(issued.id))?.paidAt).toBe(
      '2026-08-10T10:00:00.000Z',
    )
  })
})

describe('invoice exports', () => {
  it('quotes a client name containing both a comma and a quote and uses CRLF', () => {
    const unusualClient = client({ firstName: 'Doe,', lastName: '"Jane"' })
    const csv = invoicesToCsv([invoice(45_000, when, 'csv', unusualClient)])

    expect(csv).toContain('"Doe, ""Jane"""')
    expect(csv).toContain(FLAT_RATE_WORDING)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv.replaceAll('\r\n', '')).not.toContain('\n')
  })

  it('exports stamp duty as its own line', () => {
    const csv = invoicesToCsv([invoice(45_000, when, 'stamp')])
    expect(csv).toContain('stamp_duty,Stamp duty (recharged to client),1,EUR 2.00,EUR 2.00')
  })
})

describe('quarterly stamp-duty tracker', () => {
  it('cumulates EUR 2.00 charges by issue quarter and uses profile deadlines', () => {
    const totals = quarterlyStampDutyTotals(
      [
        invoice(45_000, '2026-01-10T10:00:00.000Z', 'q1-a'),
        invoice(50_000, '2026-03-31T20:00:00.000Z', 'q1-b'),
        invoice(60_000, '2026-04-01T10:00:00.000Z', 'q2'),
        invoice(7_747, '2026-05-01T10:00:00.000Z', 'q2-no-stamp'),
      ],
      profile().stampDutyDeadlines,
    )

    expect(totals).toMatchObject([
      { key: '2026-Q1', invoiceCount: 2, total: 400, deadline: { dueOn: '2026-05-31' } },
      { key: '2026-Q2', invoiceCount: 1, total: 200, deadline: { dueOn: '2026-09-30' } },
    ])
  })
})
