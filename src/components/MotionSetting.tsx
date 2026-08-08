import { useEffect, useState } from 'react'

import {
  applyMotionPreference,
  resolveMotionPreference,
} from '../lib/motionPreference'
import { storage } from '../storage'
import { META_KEYS } from '../storage/metaKeys'
import { useLive } from '../storage/useLive'

interface MotionSettingControlProps {
  enabled: boolean
  saving: boolean
  error: string
  onToggle: () => void
}

export function MotionSettingControl({
  enabled,
  saving,
  error,
  onToggle,
}: MotionSettingControlProps) {
  return (
    <section className="mb-6 rounded-3xl border border-line bg-paper/70 p-5 sm:p-6 md:mb-8">
      <div className="flex min-w-0 items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-2xl leading-tight text-ink">Motion</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            Gentle fades and short slides. This choice is independent of iPhone settings.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={onToggle}
          disabled={saving}
          className={`relative flex min-h-11 min-w-[5.5rem] shrink-0 items-center rounded-full border px-1.5 text-sm font-bold disabled:cursor-wait disabled:opacity-60 ${
            enabled
              ? 'justify-end border-accent bg-accent text-paper'
              : 'justify-start border-line bg-canvas text-muted'
          }`}
        >
          <span className="px-2">{enabled ? 'On' : 'Off'}</span>
        </button>
      </div>
      <div className="min-h-6" aria-live="polite">
        {error ? <p className="mt-3 text-sm font-semibold leading-6 text-danger-text">{error}</p> : null}
      </div>
    </section>
  )
}

function useStoredMotionPreference(): boolean {
  const state = useLive(async () => ({
    enabled: resolveMotionPreference(
      await storage.meta.get<boolean>(META_KEYS.motionEnabled),
    ),
  }))

  return state?.enabled ?? true
}

export function MotionPreferenceController() {
  const enabled = useStoredMotionPreference()

  useEffect(() => {
    applyMotionPreference(enabled, document.documentElement)
  }, [enabled])

  return null
}

export function MotionSetting() {
  const enabled = useStoredMotionPreference()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function toggle() {
    const next = !enabled
    setSaving(true)
    setError('')
    applyMotionPreference(next, document.documentElement)
    try {
      await storage.meta.set(META_KEYS.motionEnabled, next)
    } catch {
      applyMotionPreference(enabled, document.documentElement)
      setError('The motion setting could not be saved. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <MotionSettingControl
      enabled={enabled}
      saving={saving}
      error={error}
      onToggle={() => void toggle()}
    />
  )
}
