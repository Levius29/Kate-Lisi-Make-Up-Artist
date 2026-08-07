import { romeDateKey } from '../lib/appointmentSchedule'
import type { EncryptedBackupEnvelope } from './crypto'

export type BackupDeliveryResult = 'shared' | 'saved' | 'downloaded' | 'cancelled'

interface SaveFilePickerOptions {
  suggestedName?: string
  types?: Array<{
    description: string
    accept: Record<string, string[]>
  }>
}

interface FileSystemWritableFileStream {
  write(data: Blob): Promise<void>
  close(): Promise<void>
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>
}

type WindowWithSavePicker = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
}

function backupFile(envelope: EncryptedBackupEnvelope): File {
  const content = JSON.stringify(envelope, null, 2)
  return new File(
    [content],
    `kate-lisi-backup-${romeDateKey(envelope.exportedAt)}.json`,
    { type: 'application/json;charset=utf-8' },
  )
}

function canShareFile(file: File): boolean {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false
  try {
    return navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

function wasCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export async function presentBackupFile(
  envelope: EncryptedBackupEnvelope,
): Promise<BackupDeliveryResult> {
  const file = backupFile(envelope)

  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: 'Encrypted Kate Lisi Studio backup' })
      return 'shared'
    } catch (error) {
      if (wasCancelled(error)) return 'cancelled'
      throw error
    }
  }

  const picker = (window as WindowWithSavePicker).showSaveFilePicker
  if (typeof picker === 'function') {
    try {
      const handle = await picker.call(window, {
        suggestedName: file.name,
        types: [
          {
            description: 'Encrypted Studio backup',
            accept: { 'application/json': ['.json'] },
          },
        ],
      })
      const writable = await handle.createWritable()
      await writable.write(file)
      await writable.close()
      return 'saved'
    } catch (error) {
      if (wasCancelled(error)) return 'cancelled'
      throw error
    }
  }

  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'downloaded'
}
