import { useEffect, useState, type ReactNode } from 'react'

import { storage } from '../storage'
import { META_KEYS } from '../storage/metaKeys'

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean
}

let persistenceRequest: Promise<void> | undefined

function isIosSafari(): boolean {
  const userAgent = navigator.userAgent
  const isIOSDevice =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isSafari =
    /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(userAgent)
  return isIOSDevice && isSafari
}

function isStandalone(): boolean {
  return (
    (navigator as NavigatorWithStandalone).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

export async function requestPersistentStorage(): Promise<void> {
  const browserStorage = navigator.storage
  let granted = false

  try {
    granted =
      typeof browserStorage?.persisted === 'function'
        ? await browserStorage.persisted()
        : false
  } catch {
    granted = false
  }

  let requested = false
  if (!granted && typeof browserStorage?.persist === 'function') {
    requested = true
    try {
      granted = await browserStorage.persist()
    } catch {
      granted = false
    }
  }

  const observedAt = new Date().toISOString()
  await storage.transaction(async (transactionStorage) => {
    await transactionStorage.meta.set(META_KEYS.persistenceGranted, granted)
    if (requested) {
      // A refusal before installation must not suppress the next app-start request.
      // The browser call is cheap and idempotent, so this records "last asked", not "asked once".
      await transactionStorage.meta.set(META_KEYS.persistenceRequestedAt, observedAt)
    }
    if (
      granted &&
      (await transactionStorage.meta.get(META_KEYS.persistenceGrantedAt)) === undefined
    ) {
      await transactionStorage.meta.set(META_KEYS.persistenceGrantedAt, observedAt)
    }
  })
}

interface IosInstallGateProps {
  children: ReactNode
}

export function IosInstallGate({ children }: IosInstallGateProps) {
  const needsInstall = isIosSafari() && !isStandalone()
  const [acknowledged, setAcknowledged] = useState<boolean | null>(
    needsInstall ? null : true,
  )

  useEffect(() => {
    persistenceRequest ??= requestPersistentStorage()
    void persistenceRequest
  }, [])

  useEffect(() => {
    if (!needsInstall) return
    let active = true

    void storage.meta
      .get<boolean>(META_KEYS.iosInstallGateAcknowledged)
      .then((value) => {
        if (active) setAcknowledged(value === true)
      })

    return () => {
      active = false
    }
  }, [needsInstall])

  async function acknowledgeRisk() {
    await storage.meta.set(META_KEYS.iosInstallGateAcknowledged, true)
    setAcknowledged(true)
  }

  if (needsInstall && acknowledged !== true) {
    return (
      <main className="fixed inset-0 z-50 overflow-y-auto bg-canvas px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))] text-ink">
        <div className="mx-auto flex min-h-full max-w-md flex-col justify-center">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            Protect your studio data
          </p>
          <h1 className="font-display text-4xl leading-tight">Add Studio to your Home Screen</h1>
          <p className="mt-4 text-base leading-7 text-muted">
            iOS will delete this app’s data after 7 days if the app is not installed. Install it
            now to protect your on-device records.
          </p>

          <ol className="my-8 space-y-4">
            <li className="flex items-center gap-4 rounded-3xl border border-line bg-paper p-5">
              <svg
                aria-hidden="true"
                className="h-12 w-12 shrink-0 text-accent"
                viewBox="0 0 48 48"
                fill="none"
              >
                <rect x="8" y="16" width="32" height="27" rx="5" stroke="currentColor" strokeWidth="2" />
                <path d="M24 31V5m0 0-7 7m7-7 7 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
              <div>
                <span className="text-sm font-semibold text-accent">Step 1</span>
                <p className="mt-1 text-lg">Tap the Share button in Safari.</p>
              </div>
            </li>
            <li className="flex items-center gap-4 rounded-3xl border border-line bg-paper p-5">
              <svg
                aria-hidden="true"
                className="h-12 w-12 shrink-0 text-accent"
                viewBox="0 0 48 48"
                fill="none"
              >
                <rect x="7" y="7" width="34" height="34" rx="8" stroke="currentColor" strokeWidth="2" />
                <path d="M24 15v18M15 24h18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
              </svg>
              <div>
                <span className="text-sm font-semibold text-accent">Step 2</span>
                <p className="mt-1 text-lg">Choose “Add to Home Screen”.</p>
              </div>
            </li>
          </ol>

          <button
            type="button"
            className="min-h-14 w-full rounded-full bg-ink px-6 py-4 text-base font-semibold text-canvas active:scale-[0.99]"
            onClick={() => void acknowledgeRisk()}
          >
            I understand
          </button>
        </div>
      </main>
    )
  }

  return children
}
