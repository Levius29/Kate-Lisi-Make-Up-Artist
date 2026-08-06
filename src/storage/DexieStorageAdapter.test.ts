import 'fake-indexeddb/auto'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { db } from '../db/database'
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

  it('creates, soft-deletes, restores, and exports an entity', async () => {
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
      allergies: '',
      patchTestDone: false,
      productPreferences: {
        halal: false,
        vegan: false,
        crueltyFree: false,
        other: '',
      },
      imageReleaseLevel: 'none',
      gdprConsentAt: '2030-01-01T00:00:00.000Z',
      notes: '',
    })

    expect((await adapter.clients.list()).map(({ id }) => id)).toEqual([client.id])

    await adapter.clients.softDelete(client.id)
    expect(await adapter.clients.list()).toEqual([])
    expect(await adapter.clients.list({ includeDeleted: true })).toHaveLength(1)

    await adapter.clients.restore(client.id)
    expect(await adapter.clients.list()).toHaveLength(1)

    const dump = await adapter.exportAll()
    expect(dump.formatVersion).toBe(1)
    expect(dump.clients).toHaveLength(1)
  })
})
