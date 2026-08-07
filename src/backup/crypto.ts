import type { StorageDump } from '../storage'

export const BACKUP_FORMAT = 'kate-lisi-studio-backup' as const
export const BACKUP_VERSION = 1 as const
export const BACKUP_KDF_ITERATIONS = 310_000

export interface EncryptedBackupEnvelope {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  recordCount: number
  kdf: {
    name: 'PBKDF2-SHA-256'
    iterations: number
    salt: string
  }
  iv: string
  ciphertext: string
}

export class BackupFormatError extends Error {
  constructor(message = 'This is not a valid Kate Lisi Studio backup file.') {
    super(message)
    this.name = 'BackupFormatError'
  }
}

export class BackupDecryptionError extends Error {
  constructor() {
    super('The passphrase is wrong, or this backup file is damaged.')
    this.name = 'BackupDecryptionError'
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  try {
    const binary = atob(value)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    throw new BackupFormatError()
  }
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStorageDump(value: unknown): value is StorageDump {
  if (!isPlainObject(value)) return false
  return (
    value.formatVersion === 1 &&
    typeof value.exportedAt === 'string' &&
    (value.profile === null || isPlainObject(value.profile)) &&
    Array.isArray(value.clients) &&
    Array.isArray(value.services) &&
    Array.isArray(value.appointments) &&
    Array.isArray(value.contracts) &&
    Array.isArray(value.invoices) &&
    isPlainObject(value.meta)
  )
}

export function storageDumpRecordCount(dump: StorageDump): number {
  return (
    (dump.profile === null ? 0 : 1) +
    dump.clients.length +
    dump.services.length +
    dump.appointments.length +
    dump.contracts.length +
    dump.invoices.length +
    Object.keys(dump.meta).length
  )
}

function authenticatedHeader(envelope: Omit<EncryptedBackupEnvelope, 'ciphertext'>): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      format: envelope.format,
      version: envelope.version,
      exportedAt: envelope.exportedAt,
      recordCount: envelope.recordCount,
      kdf: envelope.kdf,
      iv: envelope.iv,
    }),
  )
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    asArrayBuffer(new TextEncoder().encode(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: asArrayBuffer(salt), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptStorageDump(
  dump: StorageDump,
  passphrase: string,
): Promise<EncryptedBackupEnvelope> {
  if (passphrase.length === 0) throw new Error('Enter a passphrase for this backup.')

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const header: Omit<EncryptedBackupEnvelope, 'ciphertext'> = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: dump.exportedAt,
    recordCount: storageDumpRecordCount(dump),
    kdf: {
      name: 'PBKDF2-SHA-256',
      iterations: BACKUP_KDF_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    iv: bytesToBase64(iv),
  }
  const key = await deriveKey(passphrase, salt, header.kdf.iterations)
  const plaintext = new TextEncoder().encode(JSON.stringify(dump))
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: asArrayBuffer(iv),
      additionalData: asArrayBuffer(authenticatedHeader(header)),
    },
    key,
    plaintext,
  )

  return { ...header, ciphertext: bytesToBase64(new Uint8Array(ciphertext)) }
}

export function parseBackupEnvelope(value: unknown): EncryptedBackupEnvelope {
  if (!isPlainObject(value) || !isPlainObject(value.kdf)) throw new BackupFormatError()
  if (
    value.format !== BACKUP_FORMAT ||
    value.version !== BACKUP_VERSION ||
    typeof value.exportedAt !== 'string' ||
    !Number.isFinite(new Date(value.exportedAt as string).getTime()) ||
    !Number.isSafeInteger(value.recordCount) ||
    (value.recordCount as number) < 0 ||
    value.kdf.name !== 'PBKDF2-SHA-256' ||
    !Number.isSafeInteger(value.kdf.iterations) ||
    (value.kdf.iterations as number) < 250_000 ||
    (value.kdf.iterations as number) > 2_000_000 ||
    typeof value.kdf.salt !== 'string' ||
    typeof value.iv !== 'string' ||
    typeof value.ciphertext !== 'string'
  ) {
    throw new BackupFormatError()
  }

  const envelope = value as unknown as EncryptedBackupEnvelope
  if (
    base64ToBytes(envelope.kdf.salt).length !== 16 ||
    base64ToBytes(envelope.iv).length !== 12 ||
    base64ToBytes(envelope.ciphertext).length < 16
  ) {
    throw new BackupFormatError()
  }
  return envelope
}

export async function decryptStorageDump(
  envelopeValue: unknown,
  passphrase: string,
): Promise<StorageDump> {
  const envelope = parseBackupEnvelope(envelopeValue)
  const { ciphertext: _ciphertext, ...header } = envelope

  try {
    const key = await deriveKey(
      passphrase,
      base64ToBytes(envelope.kdf.salt),
      envelope.kdf.iterations,
    )
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: asArrayBuffer(base64ToBytes(envelope.iv)),
        additionalData: asArrayBuffer(authenticatedHeader(header)),
      },
      key,
      asArrayBuffer(base64ToBytes(envelope.ciphertext)),
    )
    const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext))
    if (
      !isStorageDump(parsed) ||
      parsed.exportedAt !== envelope.exportedAt ||
      storageDumpRecordCount(parsed) !== envelope.recordCount
    ) {
      throw new BackupFormatError('The decrypted backup is incomplete or damaged.')
    }
    return parsed
  } catch (error) {
    if (error instanceof BackupFormatError) throw error
    throw new BackupDecryptionError()
  }
}
