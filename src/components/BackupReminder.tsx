import { Link } from 'react-router-dom'

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

export function BackupReminder() {
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
    <aside className="mb-7 min-w-0 rounded-2xl border border-amber-800/35 bg-amber-50 p-4 text-amber-950 sm:flex sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">Your data needs a backup</p>
        <p className="mt-1 text-sm leading-6">
          Lose the phone with no backup, lose everything. Create one encrypted file now.
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-0 sm:flex sm:shrink-0">
        <button
          type="button"
          onClick={() => void dismiss()}
          className="min-h-11 rounded-xl border border-amber-900/30 px-3 text-sm font-bold"
        >
          Later
        </button>
        <Link
          to="/backup"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-950 px-4 text-sm font-bold text-amber-50"
        >
          Back up now
        </Link>
      </div>
    </aside>
  )
}

