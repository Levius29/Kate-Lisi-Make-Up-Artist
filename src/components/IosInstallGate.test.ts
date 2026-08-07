import 'fake-indexeddb/auto'

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '../db/database'
import { storage } from '../storage'
import { META_KEYS } from '../storage/metaKeys'
import { requestPersistentStorage } from './IosInstallGate'

function mockStorageApi(options: { alreadyHeld: boolean; requestResult: boolean }) {
  const persisted = vi.fn().mockResolvedValue(options.alreadyHeld)
  const persist = vi.fn().mockResolvedValue(options.requestResult)
  vi.stubGlobal('navigator', { storage: { persisted, persist } })
  return { persisted, persist }
}

describe('persistent browser storage', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  afterAll(async () => {
    await db.delete()
  })

  it('requests protection and records the live false result when it is not held', async () => {
    const browserStorage = mockStorageApi({ alreadyHeld: false, requestResult: false })

    await requestPersistentStorage()

    expect(browserStorage.persisted).toHaveBeenCalledOnce()
    expect(browserStorage.persist).toHaveBeenCalledOnce()
    expect(await storage.meta.get(META_KEYS.persistenceGranted)).toBe(false)
    expect(await storage.meta.get(META_KEYS.persistenceRequestedAt)).toEqual(expect.any(String))
    expect(await storage.meta.get(META_KEYS.persistenceGrantedAt)).toBeUndefined()
  })

  it('requests protection again on a later start while it is still not held', async () => {
    const browserStorage = mockStorageApi({ alreadyHeld: false, requestResult: false })

    await requestPersistentStorage()
    await requestPersistentStorage()

    expect(browserStorage.persisted).toHaveBeenCalledTimes(2)
    expect(browserStorage.persist).toHaveBeenCalledTimes(2)
    expect(await storage.meta.get(META_KEYS.persistenceGranted)).toBe(false)
  })

  it('records protection already held without requesting it again', async () => {
    const browserStorage = mockStorageApi({ alreadyHeld: true, requestResult: false })
    await storage.meta.set(META_KEYS.persistenceGranted, false)
    await storage.meta.set(META_KEYS.persistenceRequestedAt, '2026-07-01T12:00:00.000Z')

    await requestPersistentStorage()

    expect(browserStorage.persisted).toHaveBeenCalledOnce()
    expect(browserStorage.persist).not.toHaveBeenCalled()
    expect(await storage.meta.get(META_KEYS.persistenceGranted)).toBe(true)
    expect(await storage.meta.get(META_KEYS.persistenceGrantedAt)).toEqual(expect.any(String))
    expect(await storage.meta.get(META_KEYS.persistenceRequestedAt)).toBe(
      '2026-07-01T12:00:00.000Z',
    )
  })
})
