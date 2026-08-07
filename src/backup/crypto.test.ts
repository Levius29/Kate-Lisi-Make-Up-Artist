import { describe, expect, it } from 'vitest'

import type { StorageDump } from '../storage'
import {
  BACKUP_KDF_ITERATIONS,
  BackupDecryptionError,
  decryptStorageDump,
  encryptStorageDump,
} from './crypto'

function sampleDump(): StorageDump {
  return {
    formatVersion: 1,
    exportedAt: '2030-06-01T10:00:00.000Z',
    profile: null,
    clients: [],
    services: [],
    appointments: [],
    contracts: [],
    invoices: [],
    meta: { sample: 'value-inside-ciphertext' },
  }
}

describe('encrypted backups', () => {
  it('encrypts and decrypts a storage dump with the required envelope', async () => {
    const dump = sampleDump()
    const encrypted = await encryptStorageDump(dump, 'correct horse battery staple')

    expect(encrypted).toMatchObject({
      format: 'kate-lisi-studio-backup',
      version: 1,
      exportedAt: dump.exportedAt,
      kdf: {
        name: 'PBKDF2-SHA-256',
        iterations: BACKUP_KDF_ITERATIONS,
      },
    })
    expect(encrypted.kdf.iterations).toBeGreaterThanOrEqual(250_000)
    expect(JSON.stringify(encrypted)).not.toContain('value-inside-ciphertext')
    await expect(decryptStorageDump(encrypted, 'correct horse battery staple')).resolves.toEqual(dump)
  })

  it('rejects a wrong passphrase with a clean user-facing error', async () => {
    const encrypted = await encryptStorageDump(sampleDump(), 'right passphrase')

    await expect(decryptStorageDump(encrypted, 'wrong passphrase')).rejects.toEqual(
      expect.objectContaining<Partial<BackupDecryptionError>>({
        name: 'BackupDecryptionError',
        message: 'The passphrase is wrong, or this backup file is damaged.',
      }),
    )
  })
})

