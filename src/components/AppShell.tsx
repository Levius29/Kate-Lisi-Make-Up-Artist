import { Suspense, useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

import { BackupReminder } from './BackupReminder'
import { MotionPreferenceController } from './MotionSetting'
import { NavigationIcon, type NavigationIconName } from './NavigationIcon'
import { ServiceWorkerUpdatePrompt } from './ServiceWorkerUpdatePrompt'

const destinations = [
  { label: 'Today', to: '/', icon: 'today' },
  { label: 'Calendar', to: '/calendar', icon: 'calendar' },
  { label: 'Clients', to: '/clients', icon: 'clients' },
  { label: 'Money', to: '/money', icon: 'money' },
  { label: 'Settings', to: '/settings', icon: 'settings' },
] as const

function isDestinationActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/'
  if (to === '/settings') {
    // These tools live under Settings in the information architecture even
    // though their readable routes are top-level.
    return pathname === '/settings'
      || pathname.startsWith('/settings/')
      || pathname.startsWith('/backup')
      || pathname.startsWith('/timeline')
      || pathname.startsWith('/services')
  }
  return pathname === to || pathname.startsWith(`${to}/`)
}

/*
 * Two navigations, one visible at a time (SPEC.md §10.4):
 *   below 1024px  — bottom bar, reachable one-handed on iPhone and iPad Split View
 *   1024px and up — left rail; a bottom bar stretched across an iPad Pro looks wrong
 * The hidden one is display:none, so it leaves the accessibility tree too.
 */
/*
 * Content scrolls inside a fixed-height pane, which iOS handles badly when the
 * on-screen keyboard opens: the focused field can end up behind the keyboard and
 * Safari does not always scroll it back into view. Nudge it ourselves once the
 * keyboard has finished animating. Touch devices only — on a desktop pointer this
 * would just make the page jump under the cursor.
 */
function useKeyboardAwareFocus() {
  useEffect(() => {
    if (!window.matchMedia('(pointer: coarse)').matches) return

    function handleFocusIn(event: FocusEvent) {
      const element = event.target
      if (!(element instanceof HTMLElement)) return
      if (!element.matches('input, textarea, select')) return

      window.setTimeout(() => {
        if (document.activeElement !== element) return
        element.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }, 300)
    }

    document.addEventListener('focusin', handleFocusIn)
    return () => document.removeEventListener('focusin', handleFocusIn)
  }, [])
}

interface AppShellProps {
  updateReady?: boolean
  onReloadUpdate?: () => void
  onDismissUpdate?: () => void
}

export function AppShell({
  updateReady = false,
  onReloadUpdate = () => undefined,
  onDismissUpdate = () => undefined,
}: AppShellProps) {
  useKeyboardAwareFocus()
  const { pathname } = useLocation()
  const showBackupReminder = pathname === '/'

  return (
    <div className="app-shell grid grid-rows-[minmax(0,1fr)_auto_auto] overflow-hidden bg-canvas text-ink lg:grid-cols-[16rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)_auto]">
      <MotionPreferenceController />
      <nav
        aria-label="Primary"
        className="hidden lg:sticky lg:top-0 lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-line lg:bg-paper lg:py-10 lg:pl-[calc(1.25rem+env(safe-area-inset-left))] lg:pr-5"
      >
        <p className="px-4 font-display text-2xl leading-tight">Kate Lisi</p>
        <p className="mt-1 px-4 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-muted">
          Studio
        </p>
        <div className="mt-10 flex flex-col gap-1">
          {destinations.map(({ label, to, icon }) => {
            const active = isDestinationActive(pathname, to)
            return (
              <Link
                key={to}
                to={to}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-12 items-center gap-3 rounded-2xl px-4 text-base transition-colors ${
                  active ? 'bg-canvas font-semibold text-accent' : 'text-muted hover:text-ink'
                }`}
              >
                <NavigationIcon name={icon as NavigationIconName} className="h-5 w-5 shrink-0" />
                {label}
              </Link>
            )
          })}
        </div>
        {showBackupReminder ? (
          <div className="mt-auto pb-[env(safe-area-inset-bottom)]">
            <BackupReminder variant="rail" />
          </div>
        ) : null}
      </nav>

      <div className="app-scroll row-start-1 min-w-0 lg:col-start-2" data-app-scroll>
        <main className="mx-auto min-h-full w-full max-w-3xl pb-8 pl-[calc(1.5rem+env(safe-area-inset-left))] pr-[calc(1.5rem+env(safe-area-inset-right))] pt-[calc(2rem+env(safe-area-inset-top))] lg:max-w-4xl lg:pb-16 lg:pt-12">
          {showBackupReminder ? <div className="lg:hidden"><BackupReminder /></div> : null}
          <Suspense
            fallback={
              // Route chunks are precached, so choose a quiet canvas-coloured pane for the
              // brief disk read; the shell keeps its height and its single visible navigation.
              <div aria-hidden="true" className="min-h-full w-full bg-canvas" />
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Its own grid row keeps the update notice above navigation instead of covering it. */}
      {updateReady ? (
        <ServiceWorkerUpdatePrompt
          onReload={onReloadUpdate}
          onDismiss={onDismissUpdate}
        />
      ) : null}

      <nav
        aria-label="Primary"
        className="z-40 row-start-3 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:hidden"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {destinations.map(({ label, to, icon }) => {
            const active = isDestinationActive(pathname, to)
            return (
              <Link
                key={to}
                to={to}
                aria-current={active ? 'page' : undefined}
                className={`group relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[0.64rem] font-semibold leading-none tracking-[0.02em] transition-colors ${active ? 'text-accent' : 'text-muted'}`}
              >
                <NavigationIcon name={icon as NavigationIconName} className="h-5 w-5 shrink-0" />
                <span className="whitespace-nowrap">{label}</span>
                <span
                  aria-hidden="true"
                  className="absolute bottom-1.5 hidden h-0.5 w-5 rounded-full bg-accent group-aria-[current=page]:block"
                />
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
