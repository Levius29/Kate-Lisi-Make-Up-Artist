import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import { BackupReminder } from './BackupReminder'

const destinations = [
  { label: 'Today', to: '/', end: true },
  { label: 'Calendar', to: '/calendar' },
  { label: 'Clients', to: '/clients' },
  { label: 'Money', to: '/money' },
  { label: 'Settings', to: '/settings' },
] as const

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

export function AppShell() {
  useKeyboardAwareFocus()

  return (
    <div className="h-dvh overflow-hidden bg-canvas text-ink lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <nav
        aria-label="Primary"
        className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-line lg:bg-paper lg:py-10 lg:pl-[calc(1.25rem+env(safe-area-inset-left))] lg:pr-5"
      >
        <p className="px-4 font-display text-2xl leading-tight">Kate Lisi</p>
        <p className="mt-1 px-4 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-muted">
          Studio
        </p>
        <div className="mt-10 flex flex-col gap-1">
          {destinations.map(({ label, to, ...linkProps }) => (
            <NavLink
              key={to}
              to={to}
              {...linkProps}
              className={({ isActive }) =>
                `flex min-h-12 items-center rounded-2xl px-4 text-base transition-colors ${
                  isActive
                    ? 'bg-canvas font-semibold text-accent'
                    : 'text-muted hover:text-ink'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="app-scroll min-w-0" data-app-scroll>
        <main className="mx-auto w-full max-w-3xl pb-[calc(7rem+env(safe-area-inset-bottom))] pl-[calc(1.5rem+env(safe-area-inset-left))] pr-[calc(1.5rem+env(safe-area-inset-right))] pt-[calc(2rem+env(safe-area-inset-top))] lg:max-w-4xl lg:pb-16 lg:pt-12">
          <BackupReminder />
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {destinations.map(({ label, to, ...linkProps }) => (
            <NavLink
              key={to}
              to={to}
              {...linkProps}
              className={({ isActive }) =>
                `flex min-h-16 items-center justify-center px-1 text-[0.72rem] font-semibold tracking-wide transition-colors ${
                  isActive ? 'text-accent' : 'text-muted'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
