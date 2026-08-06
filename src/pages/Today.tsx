import { storage } from '../storage'
import { META_KEYS } from '../storage/metaKeys'
import { useLive } from '../storage/useLive'

export function Today() {
  const persistenceGranted = useLive(
    () => storage.meta.get<boolean>(META_KEYS.persistenceGranted),
    [],
  )

  const persistenceLabel =
    persistenceGranted === undefined
      ? 'Checking device storage…'
      : persistenceGranted
        ? 'Persistent device storage is enabled.'
        : 'Persistent storage was requested but not granted by this browser.'

  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Studio</p>
      <h1 className="mt-3 font-display text-5xl leading-none">Today</h1>

      <div className="mt-10 rounded-3xl border border-line bg-paper p-6">
        <p className="text-sm font-semibold text-accent">Offline storage</p>
        <p className="mt-2 leading-6 text-muted">{persistenceLabel}</p>
      </div>

      <div className="mt-6 rounded-3xl border border-dashed border-line px-6 py-12 text-center">
        <p className="font-display text-2xl">A quiet start.</p>
        <p className="mt-2 text-sm leading-6 text-muted">There is nothing to show today.</p>
      </div>
    </section>
  )
}
