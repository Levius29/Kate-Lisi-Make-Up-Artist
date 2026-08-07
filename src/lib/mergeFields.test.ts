import { describe, expect, it } from 'vitest'

import {
  findUnknownMergeFields,
  mergeFieldNames,
  substituteMergeFields,
} from './mergeFields'

describe('recall merge fields', () => {
  const values = {
    firstName: 'Sofia',
    serviceName: 'Bridal make-up',
    dateLong: '14 September 2026',
    startTime: '09:30',
    location: 'Villa Aurelia, Rome',
    balanceDue: 'EUR 450.00',
    cancellationDate: '16 June 2026',
  }

  it('exposes every merge field promised by the recall specification', () => {
    expect(mergeFieldNames).toEqual([
      'firstName',
      'serviceName',
      'dateLong',
      'startTime',
      'location',
      'balanceDue',
      'cancellationDate',
    ])
  })

  it('substitutes known fields and leaves an unknown token visible', () => {
    expect(
      substituteMergeFields(
        'Hello {firstName}, your {serviceName} is on {dateLong}. {firstname}',
        values,
      ),
    ).toBe(
      'Hello Sofia, your Bridal make-up is on 14 September 2026. {firstname}',
    )
  })

  it('reports each unknown token once so a typo can be warned about', () => {
    expect(
      findUnknownMergeFields('{firstname} {firstName} {unknown} {firstname}'),
    ).toEqual(['firstname', 'unknown'])
  })
})
