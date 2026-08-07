import { Link } from 'react-router-dom'

import { formatFullDate } from '../lib/dates'
import { storage } from '../storage'
import { META_KEYS } from '../storage/metaKeys'
import { useLive } from '../storage/useLive'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000
const DISMISS_FOR_MS = 24 * 60 * 60 * 1_000

function validTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : undefined
}

export function BackupReminder({ variant = 'banner' }: { variant?: 'banner' | 'rail' }) {
  const reminderState = useLive(async () => {
    const [lastBackupAt, dismissedAt] = await Promise.all([
      storage.meta.get(META_KEYS.lastBackupAt),
      storage.meta.get(META_KEYS.backupReminderDismissedAt),
    ])
    return { lastBackupAt, dismissedAt }
  })

  if (reminderState === undefined) return null
  const now = Date.now()
  const lastBackup = validTimestamp(reminderState.lastBackupAt)
  const dismissed = validTimestamp(reminderState.dismissedAt)
  if (lastBackup !== undefined && now - lastBackup < SEVEN_DAYS_MS) return null
  if (dismissed !== undefined && now - dismissed < DISMISS_FOR_MS) return null

  async function dismiss() {
    await storage.meta.set(META_KEYS.backupReminderDismissedAt, new Date().toISOString())
  }

  return (
    <aside className={variant === 'rail'
      ? 'min-w-0 border-t border-line px-4 pt-5 text-muted'
      : 'mb-5 min-w-0 rounded-2xl border border-warning-line bg-warning-surface p-4 text-warning-text sm:flex sm:items-center sm:gap-4 md:mb-7'}>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold ${variant === 'rail' ? 'text-ink' : ''}`}>Your data needs a backup</p>
        <p className={`mt-1 text-sm ${variant === 'rail' ? 'leading-5' : 'leading-6'}`}>
          Lose the phone with no backup, lose everything. Create one encrypted file now.
        </p>
      </div>
      <div className={variant === 'rail' ? 'mt-3 grid grid-cols-2 gap-2' : 'mt-3 grid grid-cols-2 gap-2 sm:mt-0 sm:flex sm:shrink-0'}>
        <button
          type="button"
          onClick={() => void dismiss()}
          className={`min-h-11 rounded-xl border px-3 text-sm font-bold ${variant === 'rail' ? 'border-line' : 'border-warning-line'}`}
        >
          Later
        </button>
        <Link
          to="/backup"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-warning-text px-4 text-sm font-bold text-paper"
        >
          Back up now
        </Link>
      </div>
    </aside>
  )
}

export function BackupStatusLine() {
  // Wrapped in an object so a pending read is distinguishable from a key that was never
  // written — both are a bare undefined. Announcing "no backup yet" while the read is still
  // in flight would be a false alarm about the only copy of her records.
  const state = useLive(async () => ({
    lastBackupAt: await storage.meta.get(META_KEYS.lastBackupAt),
  }))

  if (state === undefined) return null

  const timestamp = validTimestamp(state.lastBackupAt)
  return (
    <p className="mt-2 text-sm leading-6 text-muted">
      {timestamp === undefined
        ? 'No backup created yet.'
        : `Last backup: ${formatFullDate(new Date(timestamp).toISOString())}.`}
    </p>
  )
}
