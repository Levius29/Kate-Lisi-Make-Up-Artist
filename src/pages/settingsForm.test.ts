import { describe, expect, it } from 'vitest'

import {
  createDefaultProfileDraft,
  eurosToCents,
  prepareProfileForSave,
  readProfileState,
} from './settingsForm'

function completeDraft() {
  return {
    ...createDefaultProfileDraft(2030),
    businessName: 'Example Studio',
    registeredAddress: 'Via di Esempio 1, Rome, Italy',
    email: 'privacy@example.invalid',
    vatNumber: '12345678901',
    taxCode: 'RSSMRA80A01H501U',
    atecoCode: '96.02.02',
    invoicePrefix: 'INV-',
    contractPrefix: 'CTR-',
    iban: 'it60 x054 2811 1010 0000 0123 456',
    bicSwift: 'BPPIITRRXXX',
    accountHolder: 'Example Studio',
  }
}

describe('settings profile form', () => {
  it('distinguishes a completed empty profile read from a live-query loading value', async () => {
    await expect(readProfileState(async () => undefined)).resolves.toEqual({
      profile: undefined,
    })
  })

  it('converts euro strings to integer cents without storing a float', () => {
    expect(eurosToCents('85000')).toBe(8_500_000)
    expect(eurosToCents('123,45')).toBe(12_345)
    expect(() => eurosToCents('12.345')).toThrow()
  })

  it('creates in-memory defaults with quarterly stamp-duty deadlines', () => {
    const draft = createDefaultProfileDraft(2030)

    expect(draft.courtOfJurisdiction).toBe('Rome, Italy')
    expect(draft.annualRevenueTargetEuros).toBe('85000.00')
    expect(draft.stampDutyDeadlines).toEqual([
      { id: 'stamp-q1-2030', label: 'Q1 2030', dueOn: '2030-05-31' },
      { id: 'stamp-q2-2030', label: 'Q2 2030', dueOn: '2030-09-30' },
      { id: 'stamp-q3-2030', label: 'Q3 2030', dueOn: '2030-12-02' },
      { id: 'stamp-q4-2030', label: 'Q4 2030', dueOn: '2031-02-28' },
    ])
  })

  it('normalises the IBAN and builds storage-safe numeric values', () => {
    const result = prepareProfileForSave(completeDraft())

    expect(result.errors).toEqual({})
    expect(result.profile).toMatchObject({
      iban: 'IT60X0542811101000000123456',
      nextInvoiceNumber: 1,
      nextContractNumber: 1,
      defaultDepositPercent: 30,
      annualRevenueTarget: 8_500_000,
    })
    expect(Number.isInteger(result.profile?.annualRevenueTarget)).toBe(true)
  })

  it('reports required and malformed values by field while optional handles stay optional', () => {
    const result = prepareProfileForSave({
      ...completeDraft(),
      businessName: '',
      email: 'not-an-email',
      vatNumber: '123',
      iban: 'IT00 NOT AN IBAN',
      nextInvoiceNumber: '0',
      nextContractNumber: '1.5',
      defaultDepositPercent: '101',
      wiseHandle: '',
      revolutHandle: '',
      stampDutyDeadlines: [
        { id: 'deadline-one', label: '', dueOn: '' },
      ],
    })

    expect(Object.keys(result.errors)).toEqual(
      expect.arrayContaining([
        'businessName',
        'email',
        'vatNumber',
        'iban',
        'nextInvoiceNumber',
        'nextContractNumber',
        'defaultDepositPercent',
        'stampDutyDeadlines.deadline-one.label',
        'stampDutyDeadlines.deadline-one.dueOn',
      ]),
    )
    expect(result.errors).not.toHaveProperty('wiseHandle')
    expect(result.errors).not.toHaveProperty('revolutHandle')
    expect(result.profile).toBeUndefined()
  })
})
