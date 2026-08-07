import { describe, expect, it } from 'vitest'

import type { Contract } from '../types'
import { buildContractDocDefinition, buildLadderRows } from './pdf'
import { TEMPLATE_VERSION } from './template'

/*
 * These are the assertions the whole build exists to protect. A contract that
 * compiles but prints 09/14, or an "EUR" written as a bare symbol, or a
 * cancellation ladder one band out, does not fail until a client disputes a
 * cancellation — which is the failure SPEC.md §9 describes.
 */

const wedding = '2026-09-14T08:00:00.000Z' // 10:00 in Rome

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-1',
    createdAt: wedding,
    updatedAt: wedding,
    contractNumber: 'CTR-0001',
    appointmentId: 'appointment-1',
    language: 'en',
    templateVersion: TEMPLATE_VERSION,
    generatedAt: '2026-02-01T10:00:00.000Z',
    clientSnapshot: {
      id: 'client-1',
      createdAt: wedding,
      updatedAt: wedding,
      firstName: 'Eleanor',
      lastName: 'Whitfield',
      nationality: 'British',
      timezone: 'Europe/London',
      phoneE164: '+447700900123',
      email: 'eleanor@example.invalid',
      addressLine: '12 Example Street',
      city: 'London',
      country: 'United Kingdom',
      allergies: 'Lanolin',
      patchTestDone: true,
      patchTestDate: '2026-08-20T09:00:00.000Z',
      productPreferences: { halal: false, vegan: true, crueltyFree: false, other: '' },
      imageReleaseLevel: 'private_portfolio',
      gdprConsentAt: '2026-02-01T10:00:00.000Z',
      notes: '',
    },
    businessSnapshot: {
      businessName: 'Kate Lisi Make-up',
      registeredAddress: 'Via di Esempio 1, Cagliari, Italy',
      email: 'studio@example.invalid',
      vatNumber: '12345678901',
      taxCode: 'LSIKTA85A41B354X',
      regime: 'forfettario',
      atecoCode: '96.02.02',
      invoicePrefix: 'INV-',
      nextInvoiceNumber: 1,
      contractPrefix: 'CTR-',
      nextContractNumber: 2,
      iban: 'IT60X0542811101000000123456',
      bicSwift: 'BPPIITRRXXX',
      accountHolder: 'Kate Lisi',
      defaultDepositPercent: 30,
      courtOfJurisdiction: 'Rome, Italy',
      annualRevenueTarget: 8_500_000,
      stampDutyDeadlines: [],
      updatedAt: wedding,
    },
    serviceSnapshot: {
      id: 'service-1',
      createdAt: wedding,
      updatedAt: wedding,
      name: 'Bridal make-up',
      description: 'Wedding-day make-up at the client venue.',
      durationMinutes: 180,
      basePrice: 45_000,
      defaultDepositPercent: 30,
      cancellationTiers: [
        { daysBefore: 91, retainPercent: 0 },
        { daysBefore: 30, retainPercent: 50 },
        { daysBefore: 0, retainPercent: 100 },
      ],
      recallTemplates: [],
      requiresTrial: true,
      requiresPatchTest: true,
      contractTemplateId: 'standard',
      active: true,
    },
    financialSnapshot: {
      startAt: wedding,
      locationName: 'Villa Aurelia',
      locationAddress: 'Largo di Porta San Pancrazio 1, Rome',
      peopleCount: 4,
      lineItems: [{ label: 'Bridal make-up', quantity: 1, unitPrice: 45_000 }],
      subtotal: 45_000,
      total: 45_000,
      depositPercent: 30,
      depositAmount: 13_500,
      balanceDueAt: wedding,
      cancellationCutoffs: [
        { date: '2026-06-15T00:00:00.000Z', retainPercent: 0 },
        { date: '2026-08-15T00:00:00.000Z', retainPercent: 50 },
        { date: '2026-09-14T00:00:00.000Z', retainPercent: 100 },
      ],
    },
    ...overrides,
  } as Contract
}

/** Flattens every string the document will print. */
function allText(doc: Record<string, unknown>): string {
  const parts: string[] = []
  const walk = (node: unknown): void => {
    if (typeof node === 'string') { parts.push(node); return }
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (node && typeof node === 'object') { Object.values(node).forEach(walk) }
  }
  walk(doc.content)
  return parts.join('\n')
}

describe('the contract never prints a numeric date', () => {
  it('writes the appointment date out in full', () => {
    expect(allText(buildContractDocDefinition(contract()))).toContain('14 September 2026')
  })

  it('contains no dd/mm, mm/dd or ISO date anywhere', () => {
    const text = allText(buildContractDocDefinition(contract()))
    expect(text).not.toMatch(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/)
    expect(text).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/)
  })

  it('writes the Italian version with Italian month names', () => {
    const text = allText(buildContractDocDefinition(contract({ language: 'it' })))
    expect(text).toContain('14 settembre 2026')
    expect(text).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/)
  })

  it('states the time with an explicit zone', () => {
    expect(allText(buildContractDocDefinition(contract()))).toContain('10:00 (CEST, Rome)')
  })
})

describe('money is always written EUR 450.00', () => {
  it('never prints a bare euro symbol', () => {
    expect(allText(buildContractDocDefinition(contract()))).not.toContain('€')
  })

  it('prints the deposit and its double, as Article 1385 requires', () => {
    const text = allText(buildContractDocDefinition(contract()))
    expect(text).toContain('EUR 135.00')
    expect(text).toContain('EUR 270.00')
  })
})

describe('the cancellation ladder reads as dates, in the right bands', () => {
  it('produces one row per band with the exact cutoff dates', () => {
    expect(buildLadderRows(contract()).map((r) => r.when)).toEqual([
      'On or before 15 June 2026',
      'After 15 June 2026 and on or before 15 August 2026',
      'After 15 August 2026',
    ])
  })

  it('attaches the caparra-only consequence to the first band', () => {
    const rows = buildLadderRows(contract())
    expect(rows).toHaveLength(3)
    expect(rows[0]!.consequence).toContain('caparra confirmatoria only')
    expect(rows[1]!.consequence).toContain('50%')
    expect(rows[1]!.consequence).toContain('EUR 225.00')
    expect(rows[2]!.consequence).toContain('100%')
    expect(rows[2]!.consequence).toContain('EUR 450.00')
  })

  /*
   * The last band runs to the appointment itself, so it must be open-ended.
   * A row saying "after 14 September 2026" would describe cancelling after the
   * wedding has already taken place.
   */
  it('leaves the final band open-ended rather than closing it on the wedding day', () => {
    const rows = buildLadderRows(contract())
    expect(rows.at(-1)!.when).toBe('After 15 August 2026')
    expect(rows.map((r) => r.when).join(' ')).not.toContain('After 14 September 2026')
  })
})

describe('the Italian legal terms survive verbatim', () => {
  it('keeps caparra confirmatoria untranslated and cites Article 1385 both ways', () => {
    const text = allText(buildContractDocDefinition(contract()))
    expect(text).toContain('caparra confirmatoria')
    expect(text).toContain('Article 1385')
    expect(text).toContain('double the caparra confirmatoria')
    expect(text).not.toContain('non-refundable deposit')
  })

  it('carries no Anglo-American boilerplate', () => {
    const text = allText(buildContractDocDefinition(contract())).toLowerCase()
    for (const phrase of ['liquidated damages', 'consideration', 'time is of the essence']) {
      expect(text).not.toContain(phrase)
    }
  })

  it('cites Article 1382 for the penalty ladder', () => {
    expect(allText(buildContractDocDefinition(contract()))).toContain('Article 1382')
  })
})

describe('the double signature block', () => {
  it('lists the onerous clauses by number and cites Articles 1341 and 1342', () => {
    const text = allText(buildContractDocDefinition(contract()))
    expect(text).toContain('Articles 1341 and 1342')
    for (const clause of ['clause 4', 'clause 5', 'clause 6', 'clause 7', 'clause 10']) {
      expect(text).toContain(clause)
    }
  })

  it('has a second signature line separate from the first', () => {
    const text = allText(buildContractDocDefinition(contract()))
    expect(text).toContain('The Client')
    expect(text).toContain('second signature')
  })
})

describe('the image release reproduces the granular choice', () => {
  it('checks only the option the client selected', () => {
    const text = allText(buildContractDocDefinition(contract()))
    expect(text).toContain('[X]  Private portfolio only.')
    expect(text).toContain('[  ]  No use.')
    expect(text).toContain('[  ]  Social media and website.')
  })

  it('moves the tick when the client chose differently', () => {
    const c = contract()
    c.clientSnapshot.imageReleaseLevel = 'face_obscured'
    const text = allText(buildContractDocDefinition(c))
    expect(text).toContain('[X]  Face obscured.')
    expect(text).toContain('[  ]  Private portfolio only.')
  })
})

describe('an issued contract is frozen', () => {
  it('ignores later edits to the service catalogue', () => {
    const issued = contract()
    const before = allText(buildContractDocDefinition(issued))

    // Simulate the catalogue changing after the contract was signed.
    issued.serviceSnapshot.cancellationTiers = [{ daysBefore: 0, retainPercent: 10 }]
    issued.serviceSnapshot.name = 'Renamed service'
    issued.serviceSnapshot.basePrice = 999_999

    const after = allText(buildContractDocDefinition(issued))
    // The document is built from financialSnapshot and the frozen figures, so
    // the ladder, the dates and the amounts are unchanged.
    expect(buildLadderRows(issued).map((r) => r.when)).toEqual([
      'On or before 15 June 2026',
      'After 15 June 2026 and on or before 15 August 2026',
      'After 15 August 2026',
    ])
    expect(after).toContain('EUR 450.00')
    expect(before).toContain('EUR 450.00')
  })
})

describe('the patch-test declaration matches reality', () => {
  it('states the date when the test was done', () => {
    expect(allText(buildContractDocDefinition(contract()))).toContain('20 August 2026')
  })

  it('warns when the service requires a test that has not happened', () => {
    const c = contract()
    c.clientSnapshot.patchTestDone = false
    expect(allText(buildContractDocDefinition(c))).toContain('has not yet been carried out')
  })

  it('says so plainly when no test is required', () => {
    const c = contract()
    c.serviceSnapshot.requiresPatchTest = false
    expect(allText(buildContractDocDefinition(c))).toContain('does not require a patch test')
  })
})

describe('page furniture', () => {
  it('is A4 and repeats the contract number in the footer of every page', () => {
    const doc = buildContractDocDefinition(contract())
    expect(doc.pageSize).toBe('A4')
    const footer = (doc.footer as (p: number, n: number) => { text: string })(2, 3)
    expect(footer.text).toContain('CTR-0001')
    expect(footer.text).toContain('page 2 of 3')
  })
})
