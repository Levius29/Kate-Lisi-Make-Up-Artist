import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import {
  BackupDecryptionError,
  BackupFormatError,
  decryptStorageDump,
  encryptStorageDump,
  parseBackupEnvelope,
  type EncryptedBackupEnvelope,
} from '../backup/crypto'
import { presentBackupFile } from '../backup/delivery'
import { ErrorText, Field, FieldLabel, HelperText } from '../components/ui/FormField'
import { TextInput } from '../components/ui/TextInput'
import { formatFullDateTimeWithZone } from '../lib/dates'
import { storage, type StorageDump } from '../storage'
import { META_KEYS } from '../storage/metaKeys'

interface RestorePreview {
  envelope: EncryptedBackupEnvelope
  incoming: StorageDump
  current: StorageDump
  fileName: string
}

type CountKey = 'clients' | 'appointments' | 'contracts' | 'invoices'

const PREVIEW_ROWS: ReadonlyArray<{ key: CountKey; label: string }> = [
  { key: 'clients', label: 'Clients' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'invoices', label: 'Invoices' },
]

function friendlyError(error: unknown): string {
  if (error instanceof BackupDecryptionError || error instanceof BackupFormatError) {
    return error.message
  }
  return 'The backup could not be read. Check the file and try again.'
}

async function readEnvelope(file: File): Promise<EncryptedBackupEnvelope> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new BackupFormatError()
  }
  return parseBackupEnvelope(parsed)
}

export function Backup() {
  const [exportPassphrase, setExportPassphrase] = useState('')
  const [exportConfirmation, setExportConfirmation] = useState('')
  const [exportBusy, setExportBusy] = useState(false)
  const [exportMessage, setExportMessage] = useState('')
  const [exportError, setExportError] = useState('')
  const [restorePassphrase, setRestorePassphrase] = useState('')
  const [restoreFile, setRestoreFile] = useState<File>()
  const [preview, setPreview] = useState<RestorePreview>()
  const [confirmed, setConfirmed] = useState(false)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [restoreMessage, setRestoreMessage] = useState('')
  const [restoreError, setRestoreError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleExport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setExportError('')
    setExportMessage('')

    // The spec does not prescribe a minimum. Eight characters prevents the most
    // obvious accidental weak passphrases without silently changing what she typed.
    if (exportPassphrase.length < 8) {
      setExportError('Use at least 8 characters for the backup passphrase.')
      return
    }
    if (exportPassphrase !== exportConfirmation) {
      setExportError('The two passphrases do not match.')
      return
    }

    setExportBusy(true)
    try {
      const dump = await storage.exportAll()
      const envelope = await encryptStorageDump(dump, exportPassphrase)
      const result = await presentBackupFile(envelope)
      if (result === 'cancelled') {
        setExportMessage('Backup cancelled. Nothing was marked as backed up.')
      } else {
        await storage.meta.set(META_KEYS.lastBackupAt, envelope.exportedAt)
        setExportPassphrase('')
        setExportConfirmation('')
        setExportMessage(
          result === 'shared'
            ? 'Encrypted backup shared. Keep the file and passphrase in separate safe places.'
            : result === 'saved'
              ? 'Encrypted backup saved. Keep the file and passphrase in separate safe places.'
              : 'Encrypted backup downloaded. Keep the file and passphrase in separate safe places.',
        )
      }
    } catch {
      setExportError('The backup could not be created or saved. Your data is unchanged; try again.')
    } finally {
      setExportBusy(false)
    }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setRestoreFile(file)
    setPreview(undefined)
    setConfirmed(false)
    setRestoreError('')
    setRestoreMessage('')
  }

  async function prepareRestore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setRestoreError('')
    setRestoreMessage('')
    setPreview(undefined)
    setConfirmed(false)
    if (!restoreFile) {
      setRestoreError('Choose an encrypted backup file first.')
      return
    }
    if (restorePassphrase.length === 0) {
      setRestoreError('Enter the passphrase used when this backup was created.')
      return
    }

    setRestoreBusy(true)
    try {
      const envelope = await readEnvelope(restoreFile)
      const [incoming, current] = await Promise.all([
        decryptStorageDump(envelope, restorePassphrase),
        storage.exportAll(),
      ])
      setPreview({ envelope, incoming, current, fileName: restoreFile.name })
    } catch (error) {
      setRestoreError(friendlyError(error))
    } finally {
      setRestoreBusy(false)
    }
  }

  async function restore() {
    if (!preview || !confirmed) return
    setRestoreBusy(true)
    setRestoreError('')
    setRestoreMessage('')
    try {
      await storage.importAll(
        {
          ...preview.incoming,
          meta: {
            ...preview.incoming.meta,
            [META_KEYS.lastBackupAt]: preview.envelope.exportedAt,
          },
        },
        'replace',
      )
      setRestoreMessage('Restore complete. Every current record was replaced by this backup.')
      setPreview(undefined)
      setRestoreFile(undefined)
      setRestorePassphrase('')
      setConfirmed(false)
      if (fileInput.current) fileInput.current.value = ''
    } catch {
      setRestoreError('Nothing was restored. The current database is unchanged; try again.')
    } finally {
      setRestoreBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0">
      <header className="mb-8 border-b border-line pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Data safety</p>
            <h1 className="mt-2 font-display text-4xl leading-tight text-ink md:text-5xl">Backup &amp; restore</h1>
          </div>
          <Link to="/settings" className="inline-flex min-h-11 items-center text-sm font-bold text-accent">Back to settings</Link>
        </div>
        <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-ink">
          Lose the phone with no backup, lose everything.
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          The encrypted file contains all data on this device. Save it to Drive, iCloud or Files from the share sheet, and keep its passphrase somewhere separate.
        </p>
      </header>

      <section className="rounded-3xl border border-accent/35 bg-paper p-4 sm:p-6 md:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Export all</p>
        <h2 className="mt-2 font-display text-3xl leading-tight">Create one encrypted backup</h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          This includes your profile, clients, services, appointments, contracts, invoices and settings. The passphrase cannot be recovered by the app.
        </p>

        <form className="mt-6 space-y-5" onSubmit={handleExport} noValidate>
          <Field>
            <FieldLabel htmlFor="backup-passphrase" required>New backup passphrase</FieldLabel>
            <TextInput
              id="backup-passphrase"
              type="password"
              autoComplete="new-password"
              value={exportPassphrase}
              onChange={(event) => setExportPassphrase(event.target.value)}
              disabled={exportBusy}
              required
            />
            <HelperText>At least 8 characters. You will need the exact passphrase to restore.</HelperText>
          </Field>
          <Field>
            <FieldLabel htmlFor="backup-passphrase-confirm" required>Confirm passphrase</FieldLabel>
            <TextInput
              id="backup-passphrase-confirm"
              type="password"
              autoComplete="new-password"
              value={exportConfirmation}
              onChange={(event) => setExportConfirmation(event.target.value)}
              disabled={exportBusy}
              required
            />
          </Field>
          {exportError ? <ErrorText>{exportError}</ErrorText> : null}
          {exportMessage ? <p className="text-sm font-semibold leading-6 text-green-800" role="status">{exportMessage}</p> : null}
          <button type="submit" disabled={exportBusy} className="min-h-12 w-full rounded-xl bg-accent px-5 text-base font-bold text-paper disabled:opacity-60 sm:w-auto">
            {exportBusy ? 'Encrypting all data…' : 'Export All'}
          </button>
        </form>
      </section>

      <section className="mt-8 rounded-3xl border border-line bg-paper/75 p-4 sm:p-6 md:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">Import / restore</p>
        <h2 className="mt-2 font-display text-3xl leading-tight">Replace this device from a backup</h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          Nothing is written until the file is decrypted, you see both record counts, and you confirm the replacement.
        </p>

        <form className="mt-6 space-y-5" onSubmit={prepareRestore} noValidate>
          <Field>
            <FieldLabel htmlFor="restore-file" required>Encrypted backup file</FieldLabel>
            <TextInput ref={fileInput} id="restore-file" type="file" accept="application/json,.json" onChange={handleFile} disabled={restoreBusy} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="restore-passphrase" required>Backup passphrase</FieldLabel>
            <TextInput
              id="restore-passphrase"
              type="password"
              autoComplete="new-password"
              value={restorePassphrase}
              onChange={(event) => setRestorePassphrase(event.target.value)}
              disabled={restoreBusy}
              required
            />
          </Field>
          {restoreError ? <ErrorText>{restoreError}</ErrorText> : null}
          {restoreMessage ? <p className="text-sm font-semibold leading-6 text-green-800" role="status">{restoreMessage}</p> : null}
          <button type="submit" disabled={restoreBusy} className="min-h-12 w-full rounded-xl border border-accent px-5 text-base font-bold text-accent disabled:opacity-60 sm:w-auto">
            {restoreBusy ? 'Reading backup…' : 'Preview restore'}
          </button>
        </form>

        {preview ? (
          <div className="mt-7 rounded-2xl border-2 border-amber-800/35 bg-amber-50 p-4 sm:p-5">
            <h3 className="font-display text-2xl text-amber-950">Review before replacing</h3>
            <p className="mt-2 break-words text-sm leading-6 text-amber-950">
              <strong>{preview.fileName}</strong><br />
              Created {formatFullDateTimeWithZone(preview.envelope.exportedAt)} · {preview.envelope.recordCount} total records
            </p>
            <div className="mt-4 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
              <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-amber-900/25">
                    <th className="px-2 py-3 font-bold">Record type</th>
                    <th className="px-2 py-3 text-right font-bold">In backup</th>
                    <th className="px-2 py-3 text-right font-bold">On this device now</th>
                  </tr>
                </thead>
                <tbody>
                  {PREVIEW_ROWS.map(({ key, label }) => (
                    <tr key={key} className="border-b border-amber-900/15 last:border-0">
                      <th className="px-2 py-3 font-semibold">{label}</th>
                      <td className="px-2 py-3 text-right tabular-nums">{preview.incoming[key].length}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{preview.current[key].length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="mt-5 rounded-xl border border-amber-900/25 bg-paper/60 p-3 text-sm font-semibold leading-6">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              I understand that every current record will be replaced by the backup.
            </label>
            <button type="button" onClick={() => void restore()} disabled={!confirmed || restoreBusy} className="mt-4 min-h-12 w-full rounded-xl bg-amber-950 px-5 text-base font-bold text-amber-50 disabled:opacity-45 sm:w-auto">
              {restoreBusy ? 'Restoring…' : 'Replace all data and restore'}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  )
}
